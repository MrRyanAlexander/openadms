"""Tickets: creation, stage advancement, the barcode handoff between monitors,
waypoints, media, void and replacement, and the search the back office runs."""
from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Any, Optional

import asyncpg
from fastapi import APIRouter, Body, Depends, Query, Request
from pydantic import BaseModel, Field

from .. import db, federation
from ..deps import CurrentUser, Paging, ProjectContext, optional_user, require_permission
from ..errors import bad_request, conflict, forbidden, not_found

router = APIRouter(tags=["tickets"])

# Columns the field app and the back office may write directly. Anything a
# ticket type declares outside this list lands in tickets.data.
_TICKET_COLUMNS = {
    "contractor_id", "equipment_id", "contract_id", "zone_id", "crew_id",
    "driver_name", "barcode", "debris_type", "special_class",
    "origin_site_id", "origin_address", "origin_house_number", "origin_street",
    "origin_city", "origin_state", "origin_postal_code",
    "origin_latitude", "origin_longitude", "origin_at",
    "destination_site_id", "destination_address", "destination_latitude",
    "destination_longitude", "destination_at",
    "load_call_pct", "certified_capacity_cy", "scale_ticket_number",
    "gross_weight_lbs", "tare_weight_lbs", "net_weight_lbs",
    "quantity", "quantity_unit", "haul_distance_miles",
    "labor_hours", "equipment_hours",
    "incident_category_id", "severity", "is_ongoing", "notes",
}

_UUID_COLUMNS = {
    "contractor_id", "equipment_id", "contract_id", "zone_id", "crew_id",
    "origin_site_id", "destination_site_id", "incident_category_id",
}

_TICKET_SELECT = "SELECT * FROM ticket_overview"


class TicketCreate(BaseModel):
    ticket_type_id: uuid.UUID
    client_uuid: Optional[uuid.UUID] = Field(
        default=None,
        description="UUID minted by the field app so offline replay is idempotent",
    )
    status: str = "open"
    data: dict[str, Any] = {}
    fields: dict[str, Any] = {}


class StageAdvance(BaseModel):
    stage_code: str
    status: str = "complete"
    monitor_id: Optional[uuid.UUID] = None
    site_id: Optional[uuid.UUID] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    accuracy_m: Optional[float] = None
    address: Optional[str] = None
    debris_type: Optional[str] = None
    load_call_pct: Optional[float] = None
    scale_ticket_number: Optional[str] = None
    weight_lbs: Optional[float] = None
    occurred_at: Optional[datetime] = None
    notes: Optional[str] = None
    data: dict[str, Any] = {}
    fields: dict[str, Any] = {}
    complete_ticket: Optional[bool] = None


class WaypointBody(BaseModel):
    latitude: float
    longitude: float
    accuracy_m: Optional[float] = None
    heading_deg: Optional[float] = None
    speed_mph: Optional[float] = None
    label: Optional[str] = None
    recorded_at: Optional[datetime] = None


class VoidBody(BaseModel):
    reason: str = Field(min_length=3)
    replacement_ticket_id: Optional[uuid.UUID] = None


class ShareBody(BaseModel):
    visibility_flag: str
    allowed_viewers: list[str] = []


def _split_fields(payload: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    """Known columns go to columns; everything the ticket type invented goes to
    the jsonb bag."""
    columns, extra = {}, {}
    for key, value in payload.items():
        if key in _TICKET_COLUMNS:
            if key in _UUID_COLUMNS and value:
                value = uuid.UUID(str(value))
            columns[key] = value
        elif key not in ("id", "project_id", "ticket_type_id", "ticket_number"):
            extra[key] = value
    return columns, extra


# ---------------------------------------------------------------------------
# Search and read
# ---------------------------------------------------------------------------
@router.get("/projects/{project_id}/tickets")
async def list_tickets(
    ctx: ProjectContext, paging: Paging, user: CurrentUser,
    q: Optional[str] = Query(None, description="Ticket number, truck, driver, address"),
    status: Optional[str] = None,
    ticket_type: Optional[str] = None,
    contractor_id: Optional[uuid.UUID] = None,
    debris_type: Optional[str] = None,
    processing_state: Optional[str] = None,
    mine_only: bool = False,
    include_void: bool = True,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    sort: str = Query("created_at", pattern="^[a-z_]+$"),
    direction: str = Query("desc", pattern="^(asc|desc)$"),
):
    where = ["project_id = $1"]
    args: list[Any] = [ctx["project"]["id"]]

    def add(clause_tmpl: str, value: Any):
        args.append(value)
        where.append(clause_tmpl.format(n=len(args)))

    if q:
        add("(ticket_number ILIKE ${n} OR truck_number ILIKE ${n} "
            "OR driver_name ILIKE ${n} OR origin_address ILIKE ${n} "
            "OR scale_ticket_number ILIKE ${n})", f"%{q}%")
    if status:
        add("status = ${n}", status)
    if ticket_type:
        add("ticket_type_code = ${n}", ticket_type)
    if contractor_id:
        add("contractor_name = (SELECT name FROM contractors WHERE id = ${n})",
            contractor_id)
    if debris_type:
        add("debris_type = ${n}", debris_type)
    if processing_state:
        add("processing_state = ${n}", processing_state)
    if date_from:
        add("COALESCE(completed_at, created_at) >= ${n}::date", date_from)
    if date_to:
        add("COALESCE(completed_at, created_at) < (${n}::date + 1)", date_to)
    if not include_void:
        where.append("NOT is_void")
    # A monitor only ever sees their own tickets unless the project grants review.
    if mine_only or (ctx["effective_rank"] < 20 and not ctx["can_review_tickets"]):
        add("created_by_name = (SELECT full_name FROM users WHERE id = ${n})",
            user["id"])

    # NULLS LAST only where the column can actually be null.
    #
    # It reads as harmless boilerplate and is not. An index on (project_id,
    # created_at DESC) orders nulls first, so asking for DESC NULLS LAST on a
    # NOT NULL column matches no index, and the list falls back to reading every
    # ticket in the project and sorting them. At twenty-five thousand tickets
    # that was 915 milliseconds against 14 with the clause dropped, for an
    # ordering that cannot differ: there are no nulls to place.
    allowed_sorts = {"created_at", "ticket_number", "status"}
    nullable_sorts = {"completed_at", "origin_at",
                      "billable_cubic_yards", "transaction_total"}
    order = sort if sort in (allowed_sorts | nullable_sorts) else "created_at"
    nulls = " NULLS LAST" if order in nullable_sorts else ""
    clause = " AND ".join(where)

    async with db.read() as conn:
        total = await conn.fetchval(
            f"SELECT count(*) FROM ticket_overview WHERE {clause}", *args)
        recs = await conn.fetch(
            f"{_TICKET_SELECT} WHERE {clause} "
            f"ORDER BY {order} {direction.upper()}{nulls} "
            f"LIMIT ${len(args)+1} OFFSET ${len(args)+2}",
            *args, paging["limit"], paging["offset"])
        totals = await conn.fetchrow(
            f"""
            SELECT COALESCE(SUM(billable_cubic_yards), 0) AS cubic_yards,
                   COALESCE(SUM(net_tons), 0) AS tons,
                   COALESCE(SUM(transaction_total), 0) AS billable
              FROM ticket_overview WHERE {clause}
            """, *args)

    page = db.Page.of(db.rows(recs), total, paging["limit"], paging["offset"])
    page["totals"] = db.row(totals)
    return page


@router.get("/tickets/{ticket_id}")
async def get_ticket(ticket_id: uuid.UUID, request: Request,
                     user: Optional[dict] = Depends(optional_user)):
    """Readable by a local user, or by a signed peer when the ticket's
    visibility flag allows it."""
    async with db.read() as conn:
        ticket = await conn.fetchrow(
            "SELECT * FROM tickets WHERE id = $1 AND deleted_at IS NULL", ticket_id)
        if ticket is None:
            raise not_found("Ticket")

        record = dict(ticket)
        record["_entity_type"] = "tickets"
        await federation.assert_readable(record, request, user)

        overview = await conn.fetchrow(
            "SELECT * FROM ticket_overview WHERE id = $1", ticket_id)
        stages = await conn.fetch(
            """
            SELECT ts.*, u.full_name AS monitor_full_name, s.name AS site_name
              FROM ticket_stages ts
              LEFT JOIN users u ON u.id = ts.monitor_id
              LEFT JOIN disposal_sites s ON s.id = ts.site_id
             WHERE ts.ticket_id = $1 ORDER BY ts.sequence
            """, ticket_id)
        waypoints = await conn.fetch(
            "SELECT * FROM ticket_waypoints WHERE ticket_id = $1 ORDER BY sequence",
            ticket_id)
        media = await conn.fetch(
            "SELECT * FROM ticket_media WHERE ticket_id = $1 AND deleted_at IS NULL "
            "ORDER BY is_primary DESC, created_at", ticket_id)
        transactions = await conn.fetch(
            "SELECT * FROM transaction_ledger WHERE ticket_id = $1 "
            "ORDER BY computed_at", ticket_id)
        metrics = await conn.fetchrow(
            "SELECT * FROM ticket_metrics WHERE ticket_id = $1", ticket_id)
        audit = await conn.fetch(
            "SELECT * FROM audit_trail WHERE entity_type = 'tickets' AND entity_id = $1 "
            "ORDER BY occurred_at DESC LIMIT 100", ticket_id)
        ticket_type = await conn.fetchrow(
            "SELECT * FROM ticket_types WHERE id = $1", ticket["ticket_type_id"])

    return {
        "ticket": db.row(ticket),
        "overview": db.row(overview),
        "ticket_type": db.row(ticket_type),
        "stages": db.rows(stages),
        "waypoints": db.rows(waypoints),
        "media": db.rows(media),
        "transactions": db.rows(transactions),
        "metrics": db.row(metrics),
        "audit": db.rows(audit),
    }


# ---------------------------------------------------------------------------
# Create and advance
# ---------------------------------------------------------------------------
@router.post("/projects/{project_id}/tickets", status_code=201)
async def create_ticket(ctx: ProjectContext, body: TicketCreate, user: CurrentUser,
                        _: dict = Depends(require_permission("ticket.create"))):
    if not ctx["can_create_tickets"]:
        raise forbidden("You are not cleared to create tickets on this project")

    payload = {**body.fields, **body.data}
    columns, extra = _split_fields(payload)

    async with db.tx(user) as conn:
        if body.client_uuid:
            existing = await conn.fetchrow(
                "SELECT id FROM tickets WHERE client_uuid = $1", body.client_uuid)
            if existing:
                # Offline replay: return what was already stored.
                return await _hydrate(conn, existing["id"])

        record = {
            **columns,
            "project_id": ctx["project"]["id"],
            "ticket_type_id": body.ticket_type_id,
            "status": body.status,
            "created_by": user["id"],
            "client_uuid": body.client_uuid,
            "data": extra,
            "source": user.get("source", "field_app"),
        }
        record = {k: v for k, v in record.items() if v is not None}
        record.setdefault("data", {})

        # Default the certified capacity from the truck record.
        if record.get("equipment_id") and "certified_capacity_cy" not in record:
            record["certified_capacity_cy"] = await conn.fetchval(
                "SELECT capacity_cy FROM equipment WHERE id = $1",
                record["equipment_id"])

        sql, args = db.build_insert("tickets", record, returning="id")
        ticket_id = await conn.fetchval(sql, *args)
        return await _hydrate(conn, ticket_id)


async def _hydrate(conn, ticket_id: uuid.UUID) -> dict[str, Any]:
    ticket = await conn.fetchrow("SELECT * FROM tickets WHERE id = $1", ticket_id)
    overview = await conn.fetchrow(
        "SELECT * FROM ticket_overview WHERE id = $1", ticket_id)
    stages = await conn.fetch(
        "SELECT * FROM ticket_stages WHERE ticket_id = $1 ORDER BY sequence", ticket_id)
    return {"ticket": db.row(ticket), "overview": db.row(overview),
            "stages": db.rows(stages)}


# Changing one of these changes what the ticket bills, so the edit queues a
# reprice rather than leaving the ticket and its money disagreeing.
_PRICING_FIELDS = {
    "load_call_pct", "certified_capacity_cy", "equipment_id", "contractor_id",
    "contract_id", "debris_type", "quantity", "net_weight_lbs",
    "gross_weight_lbs", "tare_weight_lbs", "haul_distance_miles", "labor_hours",
    "equipment_hours", "destination_site_id", "origin_site_id", "completed_at",
    "special_class", "status",
}


@router.patch("/tickets/{ticket_id}")
async def update_ticket(ticket_id: uuid.UUID, user: CurrentUser,
                        payload: dict[str, Any] = Body(...),
                        _: dict = Depends(require_permission("ticket.update"))):
    """Correcting a ticket after the field is done with it.

    The walkthrough's finding was that no screen called this. The finding under
    that one is that calling it was not enough: a ticket whose load call changes
    is a ticket whose money is now wrong, and the engine could not reprice it.
    So an edit that touches anything the price is derived from queues a reprice
    and says so, and an edit to work already sitting on an approved invoice is
    refused by name rather than silently desynchronising it."""
    columns, extra = _split_fields(payload)
    if "status" in payload:
        columns["status"] = payload["status"]
    if not columns and not extra:
        raise bad_request("No updatable fields supplied")

    reason = (payload.get("_reason") or "").strip()
    touches_pricing = bool(_PRICING_FIELDS & set(columns))

    async with db.tx({**user, "reason": reason}) as conn:
        current = await conn.fetchrow(
            "SELECT project_id, data, status, is_void, processing_state, "
            "       ticket_number "
            "  FROM tickets WHERE id = $1 AND deleted_at IS NULL", ticket_id)
        if current is None:
            raise not_found("Ticket")

        settled = (current["status"] == "completed"
                   or current["processing_state"] == "processed")
        if settled and not reason:
            raise bad_request(
                "Changing a completed ticket needs a reason. It goes on the "
                "audit artifact next to what changed.",
                code="reason_required")

        if settled and touches_pricing:
            locked = await conn.fetch(
                "SELECT invoice_number FROM adms_ticket_invoice_lock($1)", ticket_id)
            if locked:
                raise conflict(
                    "This ticket is on "
                    + ", ".join(r["invoice_number"] for r in locked)
                    + ", which has been approved. Reopen the invoice, or reverse "
                      "the transaction and leave an adjustment behind.",
                    code="ticket_invoiced",
                    invoices=[r["invoice_number"] for r in locked])

        if extra:
            columns["data"] = {**(current["data"] or {}), **extra}
        if "completed_by" not in columns and columns.get("status") == "completed":
            columns["completed_by"] = user["id"]

        sql, args = db.build_update("tickets", columns, "id = $1", [ticket_id],
                                    returning="id")
        await conn.fetchval(sql, *args)

        queued = 0
        if touches_pricing and not current["is_void"]:
            queued = await conn.fetchval(
                "SELECT adms_queue_reprocess('ticket', $1, $2)",
                ticket_id, reason or "Ticket corrected")

        ticket = await _hydrate(conn, ticket_id)

    ticket["reprocess_queued"] = bool(queued)
    return ticket


@router.post("/tickets/{ticket_id}/stages")
async def advance_stage(ticket_id: uuid.UUID, body: StageAdvance, user: CurrentUser,
                        _: dict = Depends(require_permission("ticket.advance"))):
    """Records one lifecycle stage and mirrors its values onto the ticket, so
    the flat columns the rules engine reads stay authoritative."""
    async with db.tx(user) as conn:
        ticket = await conn.fetchrow(
            """
            SELECT t.*, tt.stage_schema, tt.code AS type_code
              FROM tickets t JOIN ticket_types tt ON tt.id = t.ticket_type_id
             WHERE t.id = $1 AND t.deleted_at IS NULL
            """, ticket_id)
        if ticket is None:
            raise not_found("Ticket")
        if ticket["is_void"]:
            raise conflict("This ticket is void")

        schema = ticket["stage_schema"] or []
        stage_def = next((s for s in schema if s.get("code") == body.stage_code), None)
        if stage_def is None:
            raise bad_request(
                f"'{body.stage_code}' is not a stage of {ticket['type_code']}",
                stages=[s.get("code") for s in schema])

        monitor_id = body.monitor_id or user["id"]
        monitor = await conn.fetchrow(
            "SELECT full_name, monitor_id FROM users WHERE id = $1", monitor_id)

        stage_row = {
            "ticket_id": ticket_id,
            "stage_code": body.stage_code,
            "sequence": stage_def.get("sequence", 0),
            "status": body.status,
            "monitor_id": monitor_id,
            "monitor_name": monitor["full_name"] if monitor else None,
            "monitor_code": monitor["monitor_id"] if monitor else None,
            "site_id": body.site_id,
            "latitude": body.latitude,
            "longitude": body.longitude,
            "accuracy_m": body.accuracy_m,
            "address": body.address,
            "debris_type": body.debris_type,
            "load_call_pct": body.load_call_pct,
            "scale_ticket_number": body.scale_ticket_number,
            "weight_lbs": body.weight_lbs,
            "occurred_at": body.occurred_at or datetime.now(),
            "notes": body.notes,
            "data": {**body.data, **body.fields},
        }
        stage_row = {k: v for k, v in stage_row.items() if v is not None}

        cols = list(stage_row.keys())
        placeholders = ", ".join(f"${i}" for i in range(1, len(cols) + 1))
        updates = ", ".join(f"{c} = EXCLUDED.{c}" for c in cols
                            if c not in ("ticket_id", "stage_code"))
        await conn.execute(
            f"""
            INSERT INTO ticket_stages ({', '.join(cols)}) VALUES ({placeholders})
            ON CONFLICT (ticket_id, stage_code) DO UPDATE SET {updates}
            """,
            *stage_row.values())

        # Mirror the stage onto the ticket's flat columns.
        mirror: dict[str, Any] = {}
        first_stage = schema[0].get("code") if schema else None
        if body.stage_code == first_stage:
            if body.latitude is not None:
                mirror["origin_latitude"] = body.latitude
                mirror["origin_longitude"] = body.longitude
            if body.occurred_at:
                mirror["origin_at"] = body.occurred_at
            if body.site_id:
                mirror["origin_site_id"] = body.site_id
            if body.address:
                mirror["origin_address"] = body.address
        else:
            if body.latitude is not None:
                mirror["destination_latitude"] = body.latitude
                mirror["destination_longitude"] = body.longitude
            if body.occurred_at:
                mirror["destination_at"] = body.occurred_at
            if body.site_id:
                mirror["destination_site_id"] = body.site_id

        if body.debris_type:
            mirror["debris_type"] = body.debris_type
        if body.load_call_pct is not None:
            mirror["load_call_pct"] = body.load_call_pct
        if body.scale_ticket_number:
            mirror["scale_ticket_number"] = body.scale_ticket_number
        if body.weight_lbs is not None:
            mirror["net_weight_lbs"] = body.weight_lbs

        columns, extra = _split_fields(body.fields)
        mirror.update(columns)
        if extra:
            mirror["data"] = {**(ticket["data"] or {}), **extra}

        completes = body.complete_ticket
        if completes is None:
            completes = bool(stage_def.get("completes_ticket")) and body.status == "complete"
        if completes:
            mirror["status"] = "completed"
            mirror["completed_by"] = monitor_id
            mirror["completed_at"] = body.occurred_at or datetime.now()
            mirror["processing_state"] = "queued"
        elif ticket["status"] == "draft":
            mirror["status"] = "open"

        if mirror:
            sql, args = db.build_update("tickets", mirror, "id = $1", [ticket_id],
                                        returning="id")
            await conn.fetchval(sql, *args)

        # Close any open handoff for this ticket.
        await conn.execute(
            """
            UPDATE pending_handoffs SET claimed_by = $1, claimed_at = now()
             WHERE ticket_id = $2 AND claimed_at IS NULL
            """, monitor_id, ticket_id)

        result = await _hydrate(conn, ticket_id)

    # Completed tickets go straight through the rules engine.
    if completes:
        async with db.tx(user) as conn:
            txns = await conn.fetch(
                "SELECT * FROM adms_process_ticket($1, $2)", ticket_id, user["id"])
        result["transactions_created"] = len(txns)
    return result


# ---------------------------------------------------------------------------
# Barcode handoff between monitors
# ---------------------------------------------------------------------------
@router.post("/tickets/{ticket_id}/handoff", status_code=201)
async def issue_handoff(ticket_id: uuid.UUID, user: CurrentUser,
                        payload: dict[str, Any] = Body(default={}),
                        _: dict = Depends(require_permission("ticket.advance"))):
    """Creates the transient pending object the driver carries to the next
    monitor. Nothing about it is billable and it disappears when claimed."""
    async with db.tx(user) as conn:
        ticket = await conn.fetchrow(
            "SELECT * FROM tickets WHERE id = $1 AND deleted_at IS NULL", ticket_id)
        if ticket is None:
            raise not_found("Ticket")

        kind = payload.get("handoff_kind", "pending_disposal")
        barcode = payload.get("barcode") or ticket["barcode"] or ticket["ticket_number"]
        rec = await conn.fetchrow(
            """
            INSERT INTO pending_handoffs (ticket_id, project_id, handoff_kind,
                                          barcode, issued_by, payload, expires_at)
            VALUES ($1, $2, $3, $4, $5, $6, now() + interval '3 days')
            RETURNING *
            """,
            ticket_id, ticket["project_id"], kind, barcode, user["id"],
            {
                "ticket_number": ticket["ticket_number"],
                "truck": str(ticket["equipment_id"]) if ticket["equipment_id"] else None,
                "debris_type": ticket["debris_type"],
                "capacity_cy": float(ticket["certified_capacity_cy"] or 0),
                "origin_address": ticket["origin_address"],
            })
    return db.row(rec)


@router.get("/projects/{project_id}/scan/{barcode}")
async def scan(barcode: str, ctx: ProjectContext, user: CurrentUser):
    """What the field app calls after a barcode scan. Returns the open handoff
    when one exists, otherwise the truck the placard belongs to."""
    pid = ctx["project"]["id"]
    async with db.read() as conn:
        handoff = await conn.fetchrow(
            """
            SELECT ph.*, t.ticket_number, t.status AS ticket_status,
                   t.debris_type, t.certified_capacity_cy, t.origin_address,
                   tt.code AS ticket_type_code, tt.label AS ticket_type_label,
                   tt.stage_schema, u.full_name AS issued_by_name
              FROM pending_handoffs ph
              JOIN tickets t ON t.id = ph.ticket_id
              JOIN ticket_types tt ON tt.id = t.ticket_type_id
              LEFT JOIN users u ON u.id = ph.issued_by
             WHERE ph.project_id = $1 AND ph.barcode = $2 AND ph.claimed_at IS NULL
             ORDER BY ph.issued_at DESC LIMIT 1
            """, pid, barcode)

        truck = await conn.fetchrow(
            """
            SELECT e.*, c.name AS contractor_name
              FROM equipment e
              JOIN contractors c ON c.id = e.contractor_id
              JOIN project_contractors pc
                ON pc.contractor_id = e.contractor_id AND pc.project_id = $1
             WHERE (e.barcode = $2 OR e.placard_code = $2 OR e.unit_number = $2)
               AND e.is_active AND e.deleted_at IS NULL
             LIMIT 1
            """, pid, barcode)

    if handoff is None and truck is None:
        raise not_found(f"Nothing on this project matches barcode '{barcode}'")

    return {
        "barcode": barcode,
        "handoff": db.row(handoff),
        "equipment": db.row(truck),
        "action": "claim_handoff" if handoff else "start_ticket",
    }


# ---------------------------------------------------------------------------
# Waypoints and media
# ---------------------------------------------------------------------------
@router.post("/tickets/{ticket_id}/waypoints", status_code=201)
async def add_waypoints(ticket_id: uuid.UUID, user: CurrentUser,
                        body: list[WaypointBody] = Body(...),
                        _: dict = Depends(require_permission("ticket.advance"))):
    async with db.tx(user) as conn:
        start = await conn.fetchval(
            "SELECT COALESCE(max(sequence), 0) FROM ticket_waypoints WHERE ticket_id = $1",
            ticket_id)
        created = []
        for offset, wp in enumerate(body, start=1):
            rec = await conn.fetchrow(
                """
                INSERT INTO ticket_waypoints (ticket_id, sequence, latitude, longitude,
                                              accuracy_m, heading_deg, speed_mph,
                                              label, recorded_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9, now()))
                RETURNING *
                """,
                ticket_id, start + offset, wp.latitude, wp.longitude, wp.accuracy_m,
                wp.heading_deg, wp.speed_mph, wp.label, wp.recorded_at)
            created.append(dict(rec))
    return {"items": created}


@router.post("/tickets/{ticket_id}/media", status_code=201)
async def attach_media(ticket_id: uuid.UUID, user: CurrentUser,
                       payload: dict[str, Any] = Body(...),
                       _: dict = Depends(require_permission("ticket.advance"))):
    record = {
        "ticket_id": ticket_id,
        "stage_code": payload.get("stage_code"),
        "media_kind": payload.get("media_kind", "photo"),
        "description": payload.get("description"),
        "storage_url": payload["storage_url"],
        "thumbnail_url": payload.get("thumbnail_url"),
        "content_type": payload.get("content_type"),
        "byte_size": payload.get("byte_size"),
        "checksum_sha256": payload.get("checksum_sha256"),
        "latitude": payload.get("latitude"),
        "longitude": payload.get("longitude"),
        "captured_at": payload.get("captured_at"),
        "uploaded_by": user["id"],
    }
    record = {k: v for k, v in record.items() if v is not None}
    async with db.tx(user) as conn:
        if payload.get("is_primary"):
            await conn.execute(
                "UPDATE ticket_media SET is_primary = false WHERE ticket_id = $1",
                ticket_id)
            record["is_primary"] = True
        sql, args = db.build_insert("ticket_media", record)
        rec = await conn.fetchrow(sql, *args)
    return db.row(rec)


@router.patch("/tickets/{ticket_id}/media/{media_id}")
async def update_media(ticket_id: uuid.UUID, media_id: uuid.UUID, user: CurrentUser,
                       payload: dict[str, Any] = Body(...),
                       _: dict = Depends(require_permission("ticket.update"))):
    async with db.tx(user) as conn:
        if payload.get("is_primary"):
            await conn.execute(
                "UPDATE ticket_media SET is_primary = false WHERE ticket_id = $1",
                ticket_id)
        data = {k: v for k, v in payload.items()
                if k in ("description", "is_primary", "stage_code", "media_kind")}
        sql, args = db.build_update("ticket_media", data,
                                    "id = $1 AND ticket_id = $2", [media_id, ticket_id])
        rec = await conn.fetchrow(sql, *args)
    if rec is None:
        raise not_found("Media")
    return db.row(rec)


@router.delete("/tickets/{ticket_id}/media/{media_id}", status_code=204)
async def delete_media(ticket_id: uuid.UUID, media_id: uuid.UUID, user: CurrentUser,
                       _: dict = Depends(require_permission("ticket.update"))):
    async with db.tx(user) as conn:
        await conn.execute(
            "UPDATE ticket_media SET deleted_at = now(), is_primary = false "
            "WHERE id = $1 AND ticket_id = $2", media_id, ticket_id)
    return None


# ---------------------------------------------------------------------------
# Void, replace, share, reprocess
# ---------------------------------------------------------------------------
@router.post("/tickets/{ticket_id}/void")
async def void_ticket(ticket_id: uuid.UUID, body: VoidBody, user: CurrentUser,
                      _: dict = Depends(require_permission("ticket.void"))):
    """Voiding never deletes. Existing transactions are reversed so the ledger
    stays complete."""
    async with db.tx({**user, "reason": body.reason}) as conn:
        ticket = await conn.fetchrow(
            "SELECT * FROM tickets WHERE id = $1 AND deleted_at IS NULL", ticket_id)
        if ticket is None:
            raise not_found("Ticket")
        if ticket["is_void"]:
            raise conflict("Ticket is already void")

        reversed_ids = []
        existing = await conn.fetch(
            "SELECT id FROM transactions WHERE ticket_id = $1 AND NOT is_reversal "
            "AND id NOT IN (SELECT reverses_id FROM transactions "
            "WHERE reverses_id IS NOT NULL)", ticket_id)
        for txn in existing:
            reversed_ids.append(await conn.fetchval(
                "SELECT adms_reverse_transaction($1, $2, $3)",
                txn["id"], f"Ticket voided: {body.reason}", user["id"]))

        await conn.execute(
            """
            UPDATE tickets SET is_void = true, void_reason = $1, voided_by = $2,
                               voided_at = now()
             WHERE id = $3
            """, body.reason, user["id"], ticket_id)

        if body.replacement_ticket_id:
            await conn.execute(
                "UPDATE tickets SET replaces_ticket_id = $1 WHERE id = $2",
                ticket_id, body.replacement_ticket_id)

        await conn.execute(
            """
            INSERT INTO audit_events (entity_type, entity_id, entity_label, project_id,
                                      action, actor_id, actor_name, changed, reason)
            VALUES ('tickets', $1, $2, $3, 'void', $4, $5, $6::jsonb, $7)
            """,
            ticket_id, ticket["ticket_number"], ticket["project_id"], user["id"],
            user["full_name"], {"reversed_transactions": len(reversed_ids)},
            body.reason)

        return await _hydrate(conn, ticket_id)


@router.put("/tickets/{ticket_id}/share")
async def share_ticket(ticket_id: uuid.UUID, body: ShareBody, user: CurrentUser,
                       _: dict = Depends(require_permission("sharing.manage"))):
    async with db.tx({**user, "reason": "visibility change"}) as conn:
        rec = await conn.fetchrow(
            """
            UPDATE tickets SET visibility_flag = $1, allowed_viewers = $2
             WHERE id = $3 RETURNING id, visibility_flag, allowed_viewers
            """, body.visibility_flag, body.allowed_viewers, ticket_id)
    if rec is None:
        raise not_found("Ticket")
    return db.row(rec)


@router.post("/tickets/{ticket_id}/process")
async def process_ticket(ticket_id: uuid.UUID, user: CurrentUser,
                         _: dict = Depends(require_permission("transaction.process"))):
    """Run the rules engine over one ticket. Idempotent by construction."""
    async with db.tx(user) as conn:
        created = await conn.fetch(
            "SELECT * FROM adms_process_ticket($1, $2)", ticket_id, user["id"])
        ticket = await conn.fetchrow(
            "SELECT processing_state, rules_matched, processing_error "
            "FROM tickets WHERE id = $1", ticket_id)
        ledger = await conn.fetch(
            "SELECT * FROM transaction_ledger WHERE ticket_id = $1 "
            "ORDER BY computed_at", ticket_id)
    return {
        "created": len(created),
        "processing_state": ticket["processing_state"] if ticket else None,
        "rules_matched": ticket["rules_matched"] if ticket else 0,
        "error": ticket["processing_error"] if ticket else None,
        "transactions": db.rows(ledger),
    }


@router.post("/projects/{project_id}/tickets/process")
async def process_queue(ctx: ProjectContext, user: CurrentUser,
                        limit: int = Query(500, le=5000),
                        _: dict = Depends(require_permission("transaction.process"))):
    """Drain the processing queue for a project."""
    async with db.tx(user) as conn:
        pending = await conn.fetch(
            """
            SELECT id FROM tickets
             WHERE project_id = $1 AND status = 'completed' AND NOT is_void
               AND processing_state IN ('unprocessed', 'queued', 'error')
             ORDER BY completed_at LIMIT $2
            """, ctx["project"]["id"], limit)
        created = 0
        for row in pending:
            created += len(await conn.fetch(
                "SELECT * FROM adms_process_ticket($1, $2)", row["id"], user["id"]))
            # Processing is the moment a ticket becomes reviewable work, so the
            # detectors run here rather than waiting for somebody to ask.
            await conn.execute("SELECT adms_flag_ticket($1)", row["id"])
    return {"tickets_processed": len(pending), "transactions_created": created}


# ---------------------------------------------------------------------------
# Correction
#
# The walkthrough's blunt finding: "I have no way to edit existing tickets in
# the back-office (apart from void), but I should." Voiding was the only button,
# and it was irreversible. These are the rest of the verbs.
# ---------------------------------------------------------------------------
class ReasonBody(BaseModel):
    reason: str = Field(min_length=4)


class ReprocessBody(ReasonBody):
    # An approved invoice stops a reprice. Forcing it is a decision someone
    # takes deliberately, so it is a field rather than a default.
    force: bool = False


@router.get("/projects/{project_id}/reprocess-queue")
async def reprocess_queue(ctx: ProjectContext, user: CurrentUser,
                          paging: Paging,
                          _: dict = Depends(require_permission("ticket.read.project"))):
    """Tickets waiting to be repriced, and why.

    Correcting one truck certificate can queue a week of loads. The count is
    what an operator decides on, so it is a list before it is an action."""
    pid = ctx["project"]["id"]
    async with db.read() as conn:
        total = await conn.fetchval(
            "SELECT count(*) FROM tickets WHERE project_id = $1 AND needs_reprocess",
            pid)
        rows = await conn.fetch(
            """
            SELECT t.id, t.ticket_number, t.reprocess_reason, t.reprocess_queued_at,
                   t.completed_at, e.unit_number, tt.code AS ticket_type_code,
                   COALESCE((SELECT sum(amount) FROM transactions tx
                              WHERE tx.ticket_id = t.id
                                AND tx.superseded_at IS NULL
                                AND NOT tx.is_reversal), 0) AS current_total,
                   (SELECT count(*) FROM adms_ticket_invoice_lock(t.id)) AS locked_by
              FROM tickets t
              JOIN ticket_types tt ON tt.id = t.ticket_type_id
              LEFT JOIN equipment e ON e.id = t.equipment_id
             WHERE t.project_id = $1 AND t.needs_reprocess
             ORDER BY t.reprocess_queued_at, t.ticket_number
             LIMIT $2 OFFSET $3
            """, pid, paging["limit"], paging["offset"])
    page = db.Page.of(db.rows(rows), total, paging["limit"], paging["offset"])
    page["locked_count"] = sum(1 for r in rows if r["locked_by"])
    return page


@router.post("/tickets/{ticket_id}/reprocess")
async def reprocess_ticket(ticket_id: uuid.UUID, body: ReprocessBody,
                           user: CurrentUser,
                           _: dict = Depends(require_permission("transaction.process"))):
    """Reverse, supersede and recompute one ticket.

    Returns both totals, because what a correction cost is the first thing
    anyone asks and the last thing they should have to reconstruct."""
    async with db.tx({**user, "reason": body.reason}) as conn:
        try:
            row = await conn.fetchrow(
                "SELECT * FROM adms_reprocess_ticket($1, $2, $3, $4)",
                ticket_id, body.reason, user["id"], body.force)
        except asyncpg.PostgresError as exc:
            raise _reprocess_refusal(exc) from exc
        # Re-check after a correction, so a flag the correction fixed visibly
        # clears rather than sitting in the queue looking unresolved.
        await conn.execute("SELECT adms_flag_ticket($1)", ticket_id)
        ticket = await _hydrate(conn, ticket_id)

    ticket["reprocess"] = {
        "reversed": row["out_reversed"], "created": row["out_created"],
        "old_total": float(row["out_old_total"]),
        "new_total": float(row["out_new_total"]),
        "difference": float(row["out_new_total"] - row["out_old_total"]),
    }
    return ticket


@router.post("/projects/{project_id}/reprocess")
async def reprocess_project_queue(ctx: ProjectContext, body: ReprocessBody,
                                  user: CurrentUser,
                                  limit: int = Query(500, le=5000),
                                  _: dict = Depends(
                                      require_permission("transaction.process"))):
    """Drain the reprice queue.

    Tickets held by an approved invoice are skipped and named rather than
    silently left behind, unless the caller forces them."""
    pid = ctx["project"]["id"]
    done, skipped = [], []
    old_total = new_total = 0.0

    async with db.tx({**user, "reason": body.reason}) as conn:
        queued = await conn.fetch(
            "SELECT id, ticket_number FROM tickets "
            " WHERE project_id = $1 AND needs_reprocess AND deleted_at IS NULL"
            " ORDER BY reprocess_queued_at LIMIT $2", pid, limit)

        for row in queued:
            try:
                result = await conn.fetchrow(
                    "SELECT * FROM adms_reprocess_ticket($1, $2, $3, $4)",
                    row["id"], body.reason, user["id"], body.force)
            except asyncpg.PostgresError:
                skipped.append(row["ticket_number"])
                continue
            done.append(row["ticket_number"])
            old_total += float(result["out_old_total"])
            new_total += float(result["out_new_total"])

    return {
        "reprocessed": len(done), "skipped": len(skipped),
        "skipped_tickets": skipped[:25],
        "old_total": round(old_total, 2), "new_total": round(new_total, 2),
        "difference": round(new_total - old_total, 2),
        "message": (
            f"Repriced {len(done)} ticket{'s' if len(done) != 1 else ''}"
            + (f", skipped {len(skipped)} held by an approved invoice"
               if skipped else "")
            + f". Billing moved {new_total - old_total:+,.2f}."),
    }


@router.post("/tickets/{ticket_id}/unvoid")
async def unvoid_ticket(ticket_id: uuid.UUID, body: ReasonBody, user: CurrentUser,
                        _: dict = Depends(require_permission("ticket.void"))):
    """Undo a void. The ticket returns and is queued for repricing.

    Void used to be the one button in the product that could not be taken back,
    which made a mis-click a permanent hole in a project's volume."""
    async with db.tx({**user, "reason": body.reason}) as conn:
        try:
            await conn.execute("SELECT adms_unvoid_ticket($1, $2, $3)",
                               ticket_id, body.reason, user["id"])
        except asyncpg.PostgresError as exc:
            raise _reprocess_refusal(exc) from exc
        return await _hydrate(conn, ticket_id)


def _reprocess_refusal(exc: Exception) -> Exception:
    """Database refusals here are written for a person, so they are passed
    through rather than replaced with a generic message."""
    message = str(getattr(exc, "message", None) or exc)
    if "has been approved" in message:
        return conflict(message, code="ticket_invoiced")
    if "not void" in message or "not found" in message:
        return bad_request(message, code="unvoid_refused")
    if "reason" in message.lower():
        return bad_request(message, code="reason_required")
    return bad_request(message, code="reprocess_refused")
