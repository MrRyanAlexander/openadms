"""The document registry.

Contracts, rate sheets, certificates, permits, insurance. The file always lives
in Box or SharePoint; this holds the link, who verified it, when it expires, and
who it was asked for. Two endpoints carry the weight: /expiring drives the sweep,
and /request starts the clock the alerts feed nags on.
"""
from __future__ import annotations

import uuid
from datetime import date, datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, Body, Depends, Query
from pydantic import BaseModel, Field, field_validator

from .. import db
from ..deps import CurrentUser, Paging, require_permission
from ..errors import bad_request, not_found

router = APIRouter(prefix="/documents", tags=["documents"])

ENTITY_TYPES = ("clients", "contractors", "contracts", "disposal_sites",
                "projects", "project_sites", "equipment", "users")

_SELECT = """
    SELECT d.*, k.label AS kind_label, k.expects_expiry,
           w.days_until_expiry, w.days_since_request, w.watch_state,
           v.full_name AS verified_by_name,
           c.full_name AS created_by_name
      FROM documents d
      JOIN document_kinds k ON k.code = d.kind_code
      LEFT JOIN document_watch w ON w.id = d.id
      LEFT JOIN users v ON v.id = d.verified_by
      LEFT JOIN users c ON c.id = d.created_by
"""


def _valid_url(value: str) -> str:
    text = str(value or "").strip()
    if not text.lower().startswith(("http://", "https://")) or " " in text:
        raise bad_request(
            "A document link has to be a full http or https URL into Box, "
            "SharePoint or wherever the file lives. The system tracks the link; "
            "it never holds the file.",
            code="document_url_invalid")
    return text


class DocumentCreate(BaseModel):
    entity_type: str
    entity_id: uuid.UUID
    kind_code: str
    title: str = Field(min_length=1)
    url: str
    project_id: Optional[uuid.UUID] = None
    provider: str = "other"
    effective_from: Optional[date] = None
    expires_on: Optional[date] = None
    verification_status: str = "pending"
    requested_from: Optional[str] = None
    requested_on: Optional[date] = None
    notes: Optional[str] = None

    @field_validator("entity_type")
    @classmethod
    def _entity(cls, v: str) -> str:
        if v not in ENTITY_TYPES:
            raise ValueError(f"entity_type must be one of {', '.join(ENTITY_TYPES)}")
        return v

    @field_validator("url")
    @classmethod
    def _url(cls, v: str) -> str:
        return _valid_url(v)


class DocumentUpdate(BaseModel):
    kind_code: Optional[str] = None
    title: Optional[str] = None
    url: Optional[str] = None
    provider: Optional[str] = None
    effective_from: Optional[date] = None
    expires_on: Optional[date] = None
    verification_status: Optional[str] = None
    notes: Optional[str] = None

    @field_validator("url")
    @classmethod
    def _url(cls, v: Optional[str]) -> Optional[str]:
        return _valid_url(v) if v is not None else None


class RequestBody(BaseModel):
    requested_from: str
    requested_on: Optional[date] = None
    notes: Optional[str] = None


# ---------------------------------------------------------------------------
# The sweep. Declared before /{document_id} so "expiring" is never read as an id.
# ---------------------------------------------------------------------------
@router.get("/expiring")
async def expiring_documents(
    user: CurrentUser,
    days: int = Query(30, ge=0, le=3650),
    project_id: Optional[uuid.UUID] = None,
    include_expired: bool = Query(True),
    _: dict = Depends(require_permission("ticket.read.project")),
):
    where = ["d.deleted_at IS NULL", "d.expires_on IS NOT NULL",
             "d.expires_on <= current_date + $1::integer"]
    args: list[Any] = [days]
    if not include_expired:
        where.append("d.expires_on >= current_date")
    if project_id:
        args.append(project_id)
        where.append(f"d.project_id = ${len(args)}")

    async with db.read() as conn:
        recs = await conn.fetch(
            f"{_SELECT} WHERE {' AND '.join(where)} ORDER BY d.expires_on", *args)
    return {"items": db.rows(recs), "total": len(recs), "days": days}


@router.get("")
async def list_documents(
    paging: Paging, user: CurrentUser,
    entity_type: Optional[str] = None,
    entity_id: Optional[uuid.UUID] = None,
    project_id: Optional[uuid.UUID] = None,
    kind_code: Optional[str] = None,
    verification_status: Optional[str] = None,
    q: Optional[str] = None,
    _: dict = Depends(require_permission("ticket.read.project")),
):
    where = ["d.deleted_at IS NULL"]
    args: list[Any] = []
    for column, value in (("entity_type", entity_type), ("entity_id", entity_id),
                          ("project_id", project_id), ("kind_code", kind_code),
                          ("verification_status", verification_status)):
        if value is not None:
            args.append(value)
            where.append(f"d.{column} = ${len(args)}")
    if q:
        args.append(f"%{q}%")
        where.append(f"(d.title ILIKE ${len(args)} OR d.notes ILIKE ${len(args)})")

    clause = " AND ".join(where)
    async with db.read() as conn:
        total = await conn.fetchval(
            f"SELECT count(*) FROM documents d WHERE {clause}", *args)
        recs = await conn.fetch(
            f"{_SELECT} WHERE {clause} ORDER BY d.expires_on NULLS LAST, d.created_at DESC "
            f"LIMIT ${len(args)+1} OFFSET ${len(args)+2}",
            *args, paging["limit"], paging["offset"])
    return db.Page.of(db.rows(recs), total, paging["limit"], paging["offset"])


@router.post("", status_code=201)
async def create_document(body: DocumentCreate, user: CurrentUser,
                          _: dict = Depends(require_permission("document.manage"))):
    payload = body.model_dump(exclude_none=True)
    payload["created_by"] = user["id"]
    # Verification is an act by a person, not a field you set on the way in.
    # Anything claiming to arrive verified is attributed to whoever said so.
    if payload.get("verification_status") == "verified":
        payload["verified_by"] = user["id"]
        payload["verified_at"] = datetime.now(timezone.utc)
    sql, args = db.build_insert("documents", payload, returning="id")
    async with db.tx(user) as conn:
        new_id = await conn.fetchval(sql, *args)
        rec = await conn.fetchrow(f"{_SELECT} WHERE d.id = $1", new_id)
    return db.row(rec)


@router.get("/{document_id}")
async def get_document(document_id: uuid.UUID, user: CurrentUser,
                       _: dict = Depends(require_permission("ticket.read.project"))):
    async with db.read() as conn:
        rec = await conn.fetchrow(
            f"{_SELECT} WHERE d.id = $1 AND d.deleted_at IS NULL", document_id)
    if rec is None:
        raise not_found("Document")
    return db.row(rec)


@router.patch("/{document_id}")
async def update_document(document_id: uuid.UUID, body: DocumentUpdate,
                          user: CurrentUser,
                          _: dict = Depends(require_permission("document.manage"))):
    payload = body.model_dump(exclude_none=True)
    if not payload:
        raise bad_request("No updatable fields supplied")
    if payload.get("verification_status") == "verified":
        payload["verified_by"] = user["id"]
        payload["verified_at"] = datetime.now(timezone.utc)
    sql, args = db.build_update("documents", payload,
                                "id = $1 AND deleted_at IS NULL", [document_id],
                                returning="id")
    async with db.tx(user) as conn:
        found = await conn.fetchval(sql, *args)
        if found is None:
            raise not_found("Document")
        rec = await conn.fetchrow(f"{_SELECT} WHERE d.id = $1", found)
    return db.row(rec)


@router.delete("/{document_id}", status_code=204)
async def remove_document(document_id: uuid.UUID, user: CurrentUser,
                          _: dict = Depends(require_permission("document.manage"))):
    async with db.tx(user) as conn:
        await conn.execute(
            "UPDATE documents SET deleted_at = now() WHERE id = $1", document_id)
    return None


@router.post("/{document_id}/verify")
async def verify_document(document_id: uuid.UUID, user: CurrentUser,
                          payload: dict[str, Any] = Body(default={}),
                          _: dict = Depends(require_permission("document.manage"))):
    """Someone looked at the file and says it is the real thing. That is a
    person and a timestamp, not a checkbox."""
    async with db.tx({**user, "reason": payload.get("reason") or "document verified"}) as conn:
        rec = await conn.fetchrow(
            """
            UPDATE documents
               SET verification_status = 'verified',
                   verified_by = $2,
                   verified_at = now(),
                   notes = COALESCE($3, notes)
             WHERE id = $1 AND deleted_at IS NULL
         RETURNING id
            """, document_id, user["id"], payload.get("notes"))
        if rec is None:
            raise not_found("Document")
        full = await conn.fetchrow(f"{_SELECT} WHERE d.id = $1", rec["id"])
    return db.row(full)


@router.post("/{document_id}/request")
async def request_document(document_id: uuid.UUID, body: RequestBody,
                           user: CurrentUser,
                           _: dict = Depends(require_permission("document.manage"))):
    """Records who was asked and when. That is the clock behind "pending for
    twelve days", which is the only thing that makes chasing paperwork visible."""
    if body.requested_from not in ("client", "pm", "contractor"):
        raise bad_request("requested_from must be client, pm or contractor")
    async with db.tx(user) as conn:
        rec = await conn.fetchrow(
            """
            UPDATE documents
               SET verification_status = 'pending',
                   requested_from = $2,
                   requested_on = COALESCE($3::date, current_date),
                   notes = COALESCE($4, notes)
             WHERE id = $1 AND deleted_at IS NULL
         RETURNING id
            """, document_id, body.requested_from,
            body.requested_on,
            body.notes)
        if rec is None:
            raise not_found("Document")
        full = await conn.fetchrow(f"{_SELECT} WHERE d.id = $1", rec["id"])
    return db.row(full)
