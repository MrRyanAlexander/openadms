"""Ticket type administration. The whole point of the catalog is that a new
ticket type ships as data, so this is a first-class editing surface."""
from __future__ import annotations

import uuid
from typing import Any, Optional

from fastapi import APIRouter, Body, Depends
from pydantic import BaseModel, Field

from .. import db
from ..deps import CurrentUser, require_permission
from ..errors import bad_request, conflict, not_found

router = APIRouter(prefix="/ticket-types", tags=["catalog"])

_VALID_FIELD_TYPES = {
    "text", "textarea", "number", "percent", "select", "multiselect", "boolean",
    "date", "datetime", "gps", "photo", "barcode", "signature",
}


class TicketTypeBody(BaseModel):
    code: str = Field(min_length=2, max_length=32, pattern=r"^[A-Z0-9_]+$")
    label: str = Field(min_length=2)
    kind: str = "custom"
    description: Optional[str] = None
    billable: bool = True
    requires_equipment: bool = False
    requires_barcode: bool = False
    requires_photo: bool = False
    supports_waypoints: bool = False
    icon: Optional[str] = None
    color: Optional[str] = None
    sort_order: int = 500
    stage_schema: list[dict[str, Any]] = []
    field_schema: list[dict[str, Any]] = []


def _validate(body: TicketTypeBody) -> None:
    stage_codes = set()
    for i, stage in enumerate(body.stage_schema):
        code = stage.get("code")
        if not code:
            raise bad_request(f"Stage {i + 1} is missing a code")
        if code in stage_codes:
            raise bad_request(f"Duplicate stage code '{code}'")
        stage_codes.add(code)

    if body.stage_schema and not any(
            s.get("completes_ticket") for s in body.stage_schema):
        raise bad_request(
            "At least one stage must set completes_ticket, otherwise the ticket "
            "can never reach a billable state")

    keys = set()
    for i, field in enumerate(body.field_schema):
        key = field.get("key")
        if not key:
            raise bad_request(f"Field {i + 1} is missing a key")
        if key in keys:
            raise bad_request(f"Duplicate field key '{key}'")
        keys.add(key)
        ftype = field.get("type", "text")
        if ftype not in _VALID_FIELD_TYPES:
            raise bad_request(
                f"Field '{key}' has unsupported type '{ftype}'",
                supported=sorted(_VALID_FIELD_TYPES))
        stage = field.get("stage")
        if stage and stage_codes and stage not in stage_codes:
            raise bad_request(
                f"Field '{key}' references stage '{stage}', which is not declared")


@router.get("/{ticket_type_id}")
async def get_ticket_type(ticket_type_id: uuid.UUID, user: CurrentUser):
    async with db.read() as conn:
        rec = await conn.fetchrow(
            """
            SELECT tt.*,
                   (SELECT count(*) FROM project_ticket_types p
                     WHERE p.ticket_type_id = tt.id) AS projects_using,
                   (SELECT count(*) FROM tickets t
                     WHERE t.ticket_type_id = tt.id AND t.deleted_at IS NULL)
                       AS ticket_count
              FROM ticket_types tt WHERE tt.id = $1
            """, ticket_type_id)
    if rec is None:
        raise not_found("Ticket type")
    return db.row(rec)


@router.post("", status_code=201)
async def create_ticket_type(body: TicketTypeBody, user: CurrentUser,
                             _: dict = Depends(require_permission("ticket_type.manage"))):
    _validate(body)
    payload = body.model_dump()
    sql, args = db.build_insert("ticket_types", payload)
    async with db.tx(user) as conn:
        rec = await conn.fetchrow(sql, *args)
    return db.row(rec)


@router.put("/{ticket_type_id}")
async def update_ticket_type(ticket_type_id: uuid.UUID, body: TicketTypeBody,
                             user: CurrentUser,
                             _: dict = Depends(require_permission("ticket_type.manage"))):
    _validate(body)
    async with db.tx(user) as conn:
        existing = await conn.fetchrow(
            "SELECT is_system FROM ticket_types WHERE id = $1", ticket_type_id)
        if existing is None:
            raise not_found("Ticket type")
        if existing["is_system"]:
            raise conflict("System ticket types cannot be edited")
        sql, args = db.build_update("ticket_types", body.model_dump(),
                                    "id = $1", [ticket_type_id])
        rec = await conn.fetchrow(sql, *args)
    return db.row(rec)


@router.delete("/{ticket_type_id}", status_code=204)
async def retire_ticket_type(ticket_type_id: uuid.UUID, user: CurrentUser,
                             _: dict = Depends(require_permission("ticket_type.manage"))):
    """Retiring is a deactivation, never a delete: existing tickets keep their
    type and their audit history stays readable."""
    async with db.tx(user) as conn:
        used = await conn.fetchval(
            "SELECT count(*) FROM tickets WHERE ticket_type_id = $1", ticket_type_id)
        await conn.execute(
            "UPDATE ticket_types SET is_active = false WHERE id = $1 AND NOT is_system",
            ticket_type_id)
        await conn.execute(
            "UPDATE project_ticket_types SET is_active = false WHERE ticket_type_id = $1",
            ticket_type_id)
    return None
