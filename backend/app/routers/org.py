"""Clients, contractors, contracts, disposal sites, equipment, and users.
These sit above the project layer and are linked into projects explicitly."""
from __future__ import annotations

import uuid
from typing import Any, Optional

from fastapi import APIRouter, Body, Depends, Query
from pydantic import BaseModel, EmailStr, Field

from .. import crud, db
from ..deps import CurrentUser, Paging, require_permission
from ..errors import bad_request, not_found
from ..security import hash_password

clients = crud.make_router(
    table="clients", prefix="/clients", tags=["organization"],
    read_permission="ticket.read.project", write_permission="client.manage",
    searchable=("name", "code", "city", "fema_applicant_id"),
    allowed_fields=(
        "name", "code", "client_type", "fema_applicant_id", "duns_uei",
        "primary_contact", "contact_email", "contact_phone", "address_line1",
        "address_line2", "city", "state_code", "postal_code", "notes",
        "is_active", "metadata",
    ),
)

contractors = crud.make_router(
    table="contractors", prefix="/contractors", tags=["organization"],
    read_permission="ticket.read.project", write_permission="contractor.manage",
    searchable=("name", "code", "city"),
    allowed_fields=(
        "name", "code", "contractor_type", "primary_contact", "contact_email",
        "contact_phone", "address_line1", "city", "state_code", "postal_code",
        "is_active", "metadata",
    ),
)

contracts = crud.make_router(
    table="contracts", prefix="/contracts", tags=["organization"],
    read_permission="ticket.read.project", write_permission="contract.manage",
    searchable=("contract_number", "title"), order_by="contract_number",
    allowed_fields=(
        "contract_number", "title", "client_id", "contractor_id", "contract_type",
        "status", "executed_on", "effective_from", "effective_to",
        "not_to_exceed", "document_url", "notes", "metadata",
    ),
    alias="c",
    select_sql="""
        SELECT c.*, cl.name AS client_name, ct.name AS contractor_name
          FROM contracts c
          JOIN clients cl ON cl.id = c.client_id
          JOIN contractors ct ON ct.id = c.contractor_id
    """,
)

sites = crud.make_router(
    table="disposal_sites", prefix="/sites", tags=["organization"],
    read_permission="ticket.read.project", write_permission="site.manage",
    searchable=("name", "site_code", "city", "permit_number"),
    allowed_fields=(
        "name", "site_code", "site_kind", "operator_id", "address_line1", "city",
        "state_code", "postal_code", "latitude", "longitude", "permit_number",
        "permit_expires_on", "permit_url", "has_scale", "accepted_debris",
        "capacity_cy", "is_active", "metadata",
    ),
)

equipment = crud.make_router(
    table="equipment", prefix="/equipment", tags=["organization"],
    read_permission="ticket.read.project", write_permission="equipment.manage",
    searchable=("unit_number", "license_plate", "barcode", "placard_code"),
    order_by="unit_number",
    allowed_fields=(
        "unit_number", "contractor_id", "equipment_type", "make", "model",
        "model_year", "license_plate", "vin", "capacity_cy", "tare_weight_lbs",
        "certified_on", "certification_exp", "placard_code", "barcode",
        "is_active", "metadata",
    ),
)

disasters = crud.make_router(
    table="disasters", prefix="/disasters", tags=["organization"],
    read_permission="ticket.read.project", write_permission="project.create",
    searchable=("declaration_code", "name"), order_by="declared_on DESC NULLS LAST",
    soft_delete=False,
    allowed_fields=(
        "declaration_code", "name", "incident_type", "declared_on",
        "incident_start", "incident_end", "state_code", "metadata",
    ),
)

# ---------------------------------------------------------------------------
# Users need password handling, so they get a hand-written router.
# ---------------------------------------------------------------------------
users = APIRouter(prefix="/users", tags=["organization"])


class UserCreate(BaseModel):
    username: str = Field(min_length=2, max_length=64)
    full_name: str = Field(min_length=2)
    global_role: str = "monitor"
    email: Optional[EmailStr] = None
    monitor_id: Optional[str] = None
    phone: Optional[str] = None
    password: Optional[str] = Field(default=None, min_length=8)
    is_active: bool = True


class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    global_role: Optional[str] = None
    email: Optional[EmailStr] = None
    monitor_id: Optional[str] = None
    phone: Optional[str] = None
    is_active: Optional[bool] = None
    password: Optional[str] = Field(default=None, min_length=8)


_USER_SELECT = """
    SELECT u.id, u.username, u.email, u.full_name, u.monitor_id, u.global_role,
           u.phone, u.is_active, u.must_reset, u.last_login_at, u.created_at,
           r.label AS role_label, r.rank AS role_rank,
           (SELECT count(*) FROM project_assignments pa
             WHERE pa.user_id = u.id AND pa.is_active) AS project_count,
           (SELECT count(*) FROM tickets t WHERE t.created_by = u.id
             AND t.deleted_at IS NULL) AS tickets_created
      FROM users u JOIN roles r ON r.code = u.global_role
"""


@users.get("")
async def list_users(
    paging: Paging, user: CurrentUser,
    q: Optional[str] = None,
    role: Optional[str] = None,
    project_id: Optional[uuid.UUID] = None,
    _: dict = Depends(require_permission("worker.manage")),
):
    where = ["u.deleted_at IS NULL"]
    args: list[Any] = []
    if q:
        args.append(f"%{q}%")
        where.append(f"(u.full_name ILIKE ${len(args)} OR u.username ILIKE ${len(args)}"
                     f" OR u.monitor_id ILIKE ${len(args)})")
    if role:
        args.append(role)
        where.append(f"u.global_role = ${len(args)}")
    if project_id:
        args.append(project_id)
        where.append(
            f"EXISTS (SELECT 1 FROM project_assignments pa WHERE pa.user_id = u.id "
            f"AND pa.project_id = ${len(args)} AND pa.is_active)")

    clause = " AND ".join(where)
    async with db.read() as conn:
        total = await conn.fetchval(
            f"SELECT count(*) FROM users u WHERE {clause}", *args)
        recs = await conn.fetch(
            f"{_USER_SELECT} WHERE {clause} ORDER BY u.full_name "
            f"LIMIT ${len(args)+1} OFFSET ${len(args)+2}",
            *args, paging["limit"], paging["offset"])
    return db.Page.of(db.rows(recs), total, paging["limit"], paging["offset"])


@users.get("/{user_id}")
async def get_user(user_id: uuid.UUID, user: CurrentUser,
                   _: dict = Depends(require_permission("worker.manage"))):
    async with db.read() as conn:
        rec = await conn.fetchrow(
            f"{_USER_SELECT} WHERE u.id = $1 AND u.deleted_at IS NULL", user_id)
        assignments = await conn.fetch(
            """
            SELECT pa.*, p.name AS project_name, p.project_code
              FROM project_assignments pa JOIN projects p ON p.id = pa.project_id
             WHERE pa.user_id = $1 ORDER BY p.name
            """, user_id)
    if rec is None:
        raise not_found("User")
    return {**db.row(rec), "assignments": db.rows(assignments)}


@users.post("", status_code=201)
async def create_user(body: UserCreate, user: CurrentUser,
                      _: dict = Depends(require_permission("user.manage"))):
    payload = body.model_dump(exclude_none=True)
    raw = payload.pop("password", None)
    payload["password_hash"] = hash_password(raw) if raw else None
    payload["must_reset"] = raw is None
    if payload.get("email"):
        payload["email"] = str(payload["email"])
    sql, args = db.build_insert("users", payload, returning="id")
    async with db.tx(user) as conn:
        new_id = await conn.fetchval(sql, *args)
        rec = await conn.fetchrow(f"{_USER_SELECT} WHERE u.id = $1", new_id)
    return db.row(rec)


@users.patch("/{user_id}")
async def update_user(user_id: uuid.UUID, body: UserUpdate, user: CurrentUser,
                      _: dict = Depends(require_permission("user.manage"))):
    payload = body.model_dump(exclude_none=True)
    raw = payload.pop("password", None)
    if raw:
        payload["password_hash"] = hash_password(raw)
        payload["must_reset"] = False
    if payload.get("email"):
        payload["email"] = str(payload["email"])
    if not payload:
        return await get_user(user_id, user, user)
    sql, args = db.build_update("users", payload, "id = $1", [user_id], returning="id")
    async with db.tx(user) as conn:
        updated = await conn.fetchval(sql, *args)
        if updated is None:
            raise not_found("User")
        rec = await conn.fetchrow(f"{_USER_SELECT} WHERE u.id = $1", updated)
    return db.row(rec)


@users.delete("/{user_id}", status_code=204)
async def deactivate_user(user_id: uuid.UUID, user: CurrentUser,
                          _: dict = Depends(require_permission("user.manage"))):
    if user_id == user["id"]:
        raise bad_request("You cannot deactivate your own account")
    async with db.tx(user) as conn:
        await conn.execute(
            "UPDATE users SET is_active = false, deleted_at = now() WHERE id = $1",
            user_id)
        await conn.execute(
            "UPDATE user_sessions SET revoked_at = now() "
            "WHERE user_id = $1 AND revoked_at IS NULL", user_id)
    return None


routers = [clients, contractors, contracts, sites, equipment, disasters, users]
