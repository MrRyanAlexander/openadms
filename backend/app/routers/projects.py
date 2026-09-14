"""Projects and everything linked into them. Setup order is enforced by the
database, and readiness is computed rather than declared."""
from __future__ import annotations

import uuid
from datetime import date
from typing import Any, Optional

from fastapi import APIRouter, Body, Depends, Query
from pydantic import BaseModel, Field

from .. import db
from ..deps import CurrentUser, Paging, ProjectContext, require_permission
from ..errors import bad_request, forbidden, not_found
from .org import validate_contract

router = APIRouter(prefix="/projects", tags=["projects"])

_PROJECT_SELECT = """
    SELECT p.*, cl.name AS client_name, d.declaration_code, d.name AS disaster_name,
           k.contract_number AS primary_contract_number,
           rs.ready_for_field, rs.ready_for_billing, rs.missing,
           rs.unruled_ticket_types, rs.unruled_service_codes,
           dash.ticket_total, dash.ticket_completed, dash.ticket_open,
           dash.awaiting_processing, dash.total_cubic_yards, dash.total_tons,
           dash.billable_total,
           pr.program_label,
           (SELECT count(*) FROM project_permit_watch pw
             WHERE pw.project_id = p.id AND pw.permit_status = 'pending')
               AS permits_pending,
           (SELECT count(*) FROM project_permit_watch pw
             WHERE pw.project_id = p.id AND pw.watch_state = 'overdue')
               AS permits_overdue,
           -- B6: "which project is furthest behind on billing" has to be
           -- answerable from this screen alone. Volume estimates only: hangers
           -- and leaners are counts and do not add to a cubic yard total, so
           -- summing them together would produce a confident wrong percentage.
           (SELECT COALESCE(sum(e.estimated_quantity), 0)
              FROM project_estimate_current e
             WHERE e.project_id = p.id AND e.unit_type_code = 'per_cubic_yard')
               AS estimated_cubic_yards,
           CASE WHEN p.ends_on IS NULL THEN NULL
                ELSE (p.ends_on - CURRENT_DATE) END AS days_to_end
      FROM projects p
      JOIN clients cl ON cl.id = p.client_id
      LEFT JOIN disasters d ON d.id = p.disaster_id
      LEFT JOIN contracts k ON k.id = p.primary_contract_id
      LEFT JOIN project_readiness_summary rs ON rs.project_id = p.id
      LEFT JOIN project_dashboard dash ON dash.project_id = p.id
      LEFT JOIN LATERAL (SELECT label AS program_label FROM programs
                          WHERE code = p.program_code) pr ON true
"""

# A list is only workable if it sorts. Whitelisted, because the column name
# reaches SQL.
_PROJECT_SORTS = {
    "code":          "p.project_code",
    "name":          "p.name",
    "client":        "cl.name",
    "program":       "pr.program_label NULLS LAST",
    "status":        "p.status",
    "readiness":     "rs.ready_for_field DESC NULLS LAST, rs.ready_for_billing DESC NULLS LAST",
    "open_tickets":  "dash.ticket_open DESC NULLS LAST",
    "cubic_yards":   "dash.total_cubic_yards DESC NULLS LAST",
    "billed":        "dash.billable_total DESC NULLS LAST",
    "permits":       "permits_pending DESC",
    "started":       "p.starts_on DESC NULLS LAST",
    "updated":       "p.updated_at DESC",
    # Furthest behind first: the smallest share of the estimate collected.
    "progress":      ("COALESCE(dash.total_cubic_yards, 0) / NULLIF((SELECT "
                      "sum(e.estimated_quantity) FROM project_estimate_current e "
                      "WHERE e.project_id = p.id "
                      "AND e.unit_type_code = 'per_cubic_yard'), 0) "
                      "ASC NULLS LAST"),
    # Closest to its end date first, and projects with no end date last.
    "days_left":     "p.ends_on ASC NULLS LAST",
}


class ProjectCreate(BaseModel):
    name: str = Field(min_length=2)
    project_code: str = Field(min_length=2, max_length=32)
    client_id: uuid.UUID
    disaster_id: Optional[uuid.UUID] = None
    primary_contract_id: Optional[uuid.UUID] = None
    program: Optional[str] = None
    description: Optional[str] = None
    starts_on: Optional[date] = None
    ends_on: Optional[date] = None
    timezone: str = "America/Chicago"
    ticket_prefix: str = "T"
    visibility_flag: str = "private"


class ShareBody(BaseModel):
    visibility_flag: str
    allowed_viewers: list[str] = []


def _project_scope(user: dict[str, Any], mine_only: bool, args: list[Any]) -> list[str]:
    """Anyone below admin sees only the projects they are assigned to."""
    if not (mine_only or user["role_rank"] < 40):
        return []
    args.append(user["id"])
    return [f"EXISTS (SELECT 1 FROM project_assignments pa WHERE pa.project_id = p.id "
            f"AND pa.user_id = ${len(args)} AND pa.is_active)"]


@router.get("")
async def list_projects(
    paging: Paging, user: CurrentUser,
    q: Optional[str] = None,
    status: Optional[str] = None,
    client_id: Optional[uuid.UUID] = None,
    program_code: Optional[str] = None,
    readiness: Optional[str] = Query(
        None, description="ready, not_ready, or billing_ready"),
    sort: str = Query("status", description="One of " + ", ".join(_PROJECT_SORTS)),
    mine_only: bool = Query(False, description="Only projects I am assigned to"),
):
    where = ["p.deleted_at IS NULL"]
    args: list[Any] = []
    where += _project_scope(user, mine_only, args)

    if q:
        args.append(f"%{q}%")
        where.append(f"(p.name ILIKE ${len(args)} OR p.project_code ILIKE ${len(args)})")
    if status:
        args.append(status)
        where.append(f"p.status = ${len(args)}")
    if client_id:
        args.append(client_id)
        where.append(f"p.client_id = ${len(args)}")
    if program_code:
        args.append(program_code)
        where.append(f"p.program_code = ${len(args)}")
    if readiness == "ready":
        where.append("rs.ready_for_field")
    elif readiness == "not_ready":
        where.append("COALESCE(rs.ready_for_field, false) = false")
    elif readiness == "billing_ready":
        where.append("rs.ready_for_billing")

    order = _PROJECT_SORTS.get(sort, _PROJECT_SORTS["status"])
    if sort == "status":
        order = "p.status, p.name"

    clause = " AND ".join(where)
    async with db.read() as conn:
        total = await conn.fetchval(
            f"""SELECT count(*) FROM projects p
                  JOIN clients cl ON cl.id = p.client_id
                  LEFT JOIN project_readiness_summary rs ON rs.project_id = p.id
                 WHERE {clause}""", *args)
        recs = await conn.fetch(
            f"{_PROJECT_SELECT} WHERE {clause} ORDER BY {order} "
            f"LIMIT ${len(args)+1} OFFSET ${len(args)+2}",
            *args, paging["limit"], paging["offset"])
    return db.Page.of(db.rows(recs), total, paging["limit"], paging["offset"])


@router.get("/summary")
async def portfolio_summary(user: CurrentUser, mine_only: bool = Query(False)):
    """The header above the projects list, at a level where no single project
    is in context."""
    args: list[Any] = []
    where = ["p.deleted_at IS NULL"] + _project_scope(user, mine_only, args)
    clause = " AND ".join(where)
    async with db.read() as conn:
        rec = await conn.fetchrow(
            f"""
            SELECT count(*)                                        AS projects,
                   count(*) FILTER (WHERE p.status = 'active')     AS active,
                   count(*) FILTER (WHERE p.status = 'setup')      AS in_setup,
                   count(*) FILTER (WHERE p.status = 'closeout')   AS in_closeout,
                   count(*) FILTER (WHERE COALESCE(rs.ready_for_field, false) = false
                                      AND p.status <> 'closed')    AS not_field_ready,
                   COALESCE(sum(dash.ticket_open), 0)              AS open_tickets,
                   COALESCE(sum(dash.total_cubic_yards), 0)        AS cubic_yards,
                   COALESCE(sum(dash.billable_total), 0)           AS billed,
                   (SELECT count(*) FROM project_permit_watch pw
                     WHERE pw.permit_status = 'pending')           AS permits_pending
              FROM projects p
              LEFT JOIN project_readiness_summary rs ON rs.project_id = p.id
              LEFT JOIN project_dashboard dash ON dash.project_id = p.id
             WHERE {clause}
            """, *args)
    return db.row(rec)


@router.post("", status_code=201)
async def create_project(body: ProjectCreate, user: CurrentUser,
                         _: dict = Depends(require_permission("project.create"))):
    payload = body.model_dump(exclude_none=True)
    payload["created_by"] = user["id"]
    async with db.tx(user) as conn:
        payload["owner_instance_key"] = await conn.fetchval(
            "SELECT instance_key FROM instance LIMIT 1")
        sql, args = db.build_insert("projects", payload, returning="id")
        new_id = await conn.fetchval(sql, *args)
        # The creator is assigned to their own project so context is never empty.
        await conn.execute(
            """
            INSERT INTO project_assignments (project_id, user_id, project_role,
                                             can_create_tickets, can_review_tickets)
            VALUES ($1, $2, $3, true, true)
            """,
            new_id, user["id"], user["global_role"])
        rec = await conn.fetchrow(f"{_PROJECT_SELECT} WHERE p.id = $1", new_id)
    return db.row(rec)


@router.get("/{project_id}")
async def get_project(ctx: ProjectContext, user: CurrentUser):
    pid = ctx["project"]["id"]
    async with db.read() as conn:
        project = await conn.fetchrow(f"{_PROJECT_SELECT} WHERE p.id = $1", pid)
        contractors = await conn.fetch(
            """
            SELECT pc.*, c.name, c.code, c.contractor_type
              FROM project_contractors pc JOIN contractors c ON c.id = pc.contractor_id
             WHERE pc.project_id = $1 ORDER BY pc.role_on_project, c.name
            """, pid)
        contracts = await conn.fetch(
            """
            SELECT pc.*, c.contract_number, c.title, c.status AS contract_status,
                   c.not_to_exceed, c.effective_from, c.effective_to,
                   ct.name AS contractor_name,
                   -- Where this project stands on the contract's lines, so the
                   -- setup wizard can say "3 of 6 accepted" without opening it.
                   (SELECT count(*) FROM contract_line_items li
                     WHERE li.contract_id = c.id AND li.deleted_at IS NULL)
                       AS line_item_count,
                   (SELECT count(*) FROM contract_line_item_project_review v
                     WHERE v.contract_id = c.id AND v.project_id = pc.project_id
                       AND v.status = 'accepted') AS line_items_accepted,
                   (SELECT count(*) FROM contract_line_item_project_review v
                     WHERE v.contract_id = c.id AND v.project_id = pc.project_id
                       AND v.status = 'draft') AS line_items_awaiting
              FROM project_contracts pc
              JOIN contracts c ON c.id = pc.contract_id
              JOIN contractors ct ON ct.id = c.contractor_id
             WHERE pc.project_id = $1 ORDER BY pc.is_primary DESC, c.contract_number
            """, pid)
        sites = await conn.fetch(
            """
            SELECT ps.*, s.name, s.site_code, s.site_kind, s.has_scale,
                   s.latitude, s.longitude, s.permit_number, s.permit_expires_on
              FROM project_sites ps JOIN disposal_sites s ON s.id = ps.site_id
             WHERE ps.project_id = $1 ORDER BY s.site_kind, s.name
            """, pid)
        zones = await conn.fetch(
            "SELECT * FROM project_zones WHERE project_id = $1 ORDER BY zone_code", pid)
        types = await conn.fetch(
            """
            SELECT ptt.*, tt.code, tt.label, tt.kind, tt.icon, tt.color,
                   tt.stage_schema, tt.field_schema, tt.requires_barcode,
                   tt.requires_photo, tt.supports_waypoints, tt.billable
              FROM project_ticket_types ptt
              JOIN ticket_types tt ON tt.id = ptt.ticket_type_id
             WHERE ptt.project_id = $1 ORDER BY tt.sort_order
            """, pid)
        assignments = await conn.fetch(
            """
            SELECT pa.*, u.full_name, u.username, u.monitor_id, u.is_active AS user_active,
                   c.name AS contractor_name
              FROM project_assignments pa
              JOIN users u ON u.id = pa.user_id
              LEFT JOIN contractors c ON c.id = pa.contractor_id
             WHERE pa.project_id = $1 ORDER BY u.full_name
            """, pid)
    return {
        **db.row(project),
        "contractors": db.rows(contractors),
        "contracts": db.rows(contracts),
        "sites": db.rows(sites),
        "zones": db.rows(zones),
        "ticket_types": db.rows(types),
        "assignments": db.rows(assignments),
        "my_context": {
            "effective_rank": ctx["effective_rank"],
            "can_create_tickets": ctx["can_create_tickets"],
            "can_review_tickets": ctx["can_review_tickets"],
        },
    }


@router.patch("/{project_id}")
async def update_project(ctx: ProjectContext, user: CurrentUser,
                         payload: dict[str, Any] = Body(...),
                         _: dict = Depends(require_permission("project.update"))):
    allowed = {
        "name", "project_code", "client_id", "disaster_id", "primary_contract_id",
        "status", "program", "description", "starts_on", "ends_on", "timezone",
        "ticket_prefix", "settings", "metadata",
    }
    data = {k: v for k, v in payload.items() if k in allowed}
    if not data:
        raise bad_request("No updatable fields supplied")
    sql, args = db.build_update("projects", data, "id = $1", [ctx["project"]["id"]],
                                returning="id")
    async with db.tx(user) as conn:
        pid = await conn.fetchval(sql, *args)
        rec = await conn.fetchrow(f"{_PROJECT_SELECT} WHERE p.id = $1", pid)
    return db.row(rec)


@router.delete("/{project_id}", status_code=204)
async def archive_project(ctx: ProjectContext, user: CurrentUser,
                          _: dict = Depends(require_permission("project.create"))):
    """Archives rather than deletes. Tickets, transactions and audit history
    all survive; the project simply stops appearing in working lists."""
    async with db.tx(user) as conn:
        await conn.execute(
            "UPDATE projects SET status = 'archived', deleted_at = now() "
            "WHERE id = $1", ctx["project"]["id"])
    return None


@router.get("/{project_id}/readiness")
async def readiness(ctx: ProjectContext, user: CurrentUser):
    async with db.read() as conn:
        rec = await conn.fetchrow(
            "SELECT * FROM project_readiness_summary WHERE project_id = $1",
            ctx["project"]["id"])
    return db.row(rec)


@router.put("/{project_id}/share")
async def set_sharing(ctx: ProjectContext, body: ShareBody, user: CurrentUser,
                      _: dict = Depends(require_permission("sharing.manage"))):
    """Toggle the visibility flag and append peer INSTANCE_UNIQUE_KEYs."""
    async with db.tx({**user, "reason": "visibility change"}) as conn:
        rec = await conn.fetchrow(
            """
            UPDATE projects SET visibility_flag = $1, allowed_viewers = $2
             WHERE id = $3
         RETURNING id, visibility_flag, allowed_viewers
            """,
            body.visibility_flag, body.allowed_viewers, ctx["project"]["id"])
        await conn.execute(
            """
            INSERT INTO audit_events (entity_type, entity_id, project_id, action,
                                      actor_id, actor_name, changed)
            VALUES ('projects', $1, $1, 'share', $2, $3, $4::jsonb)
            """,
            ctx["project"]["id"], user["id"], user["full_name"],
            {"visibility_flag": body.visibility_flag,
             "allowed_viewers": body.allowed_viewers})
    return db.row(rec)


# ---------------------------------------------------------------------------
# Membership endpoints. Each one is a link, never a copy.
# ---------------------------------------------------------------------------
def _link_endpoints(name: str, table: str, column: str, permission: str,
                    extra_fields: tuple[str, ...] = (),
                    create_table: Optional[str] = None,
                    create_fields: tuple[str, ...] = (),
                    validate: Optional[Any] = None):
    """Linking, and creating the thing being linked, in one request.

    Setup used to send people away to Organization to create a disposal site
    that did not exist yet, and then back again. Passing `new` instead of an id
    creates the record and links it inside one transaction, so no step in
    project setup requires leaving the screen."""

    @router.post(f"/{{project_id}}/{name}", status_code=201,
                 name=f"add_{name}", tags=["projects"])
    async def add_link(ctx: ProjectContext, user: CurrentUser,
                       payload: dict[str, Any] = Body(...),
                       _: dict = Depends(require_permission(permission))):
        data: dict[str, Any] = {}
        new = payload.get("new")

        async with db.tx(user) as conn:
            if payload.get(column):
                data[column] = uuid.UUID(str(payload[column]))
            elif new and create_table:
                fresh = {k: v for k, v in new.items() if k in create_fields}
                if validate:
                    fresh = validate(fresh, True)
                if not fresh:
                    raise bad_request(f"Nothing usable in the new {create_table} body")
                sub_sql, sub_args = db.build_insert(create_table, fresh, returning="id")
                data[column] = await conn.fetchval(sub_sql, *sub_args)
            else:
                raise bad_request(
                    f"Send {column} to link something that exists, or new to create "
                    f"and link it in one step")

            for f in extra_fields:
                if f in payload:
                    data[f] = payload[f]
            data["project_id"] = ctx["project"]["id"]
            sql, args = db.build_insert(table, data)
            rec = await conn.fetchrow(sql, *args)
        return db.row(rec)

    @router.delete(f"/{{project_id}}/{name}/{{link_id}}", status_code=204,
                   name=f"remove_{name}", tags=["projects"])
    async def remove_link(link_id: uuid.UUID, ctx: ProjectContext, user: CurrentUser,
                          _: dict = Depends(require_permission(permission))):
        async with db.tx(user) as conn:
            await conn.execute(
                f"DELETE FROM {table} WHERE id = $1 AND project_id = $2",
                link_id, ctx["project"]["id"])
        return None

    return add_link, remove_link


_link_endpoints("contractors", "project_contractors", "contractor_id",
                "contractor.manage", ("role_on_project", "parent_contractor_id"),
                create_table="contractors",
                create_fields=("name", "code", "contractor_type", "primary_contact",
                               "contact_email", "contact_phone", "address_line1",
                               "city", "state_code", "postal_code"))
_link_endpoints("contracts", "project_contracts", "contract_id",
                "contract.manage", ("is_primary",),
                create_table="contracts",
                create_fields=("contract_number", "title", "client_id", "contractor_id",
                               "contract_type", "status", "executed_on",
                               "effective_from", "effective_to", "not_to_exceed",
                               "document_url", "notes"),
                validate=validate_contract)
_link_endpoints("sites", "project_sites", "site_id", "site.manage",
                ("opened_on", "closed_on", "permit_status", "permit_requested_from",
                 "permit_requested_on", "permit_notes"),
                create_table="disposal_sites",
                create_fields=("name", "site_code", "site_kind", "operator_id",
                               "address_line1", "city", "state_code", "postal_code",
                               "latitude", "longitude", "permit_number",
                               "permit_expires_on", "has_scale", "accepted_debris",
                               "capacity_cy"))
_link_endpoints("ticket-types", "project_ticket_types", "ticket_type_id",
                "project.ticket_types", ("field_overrides",))


@router.post("/{project_id}/zones", status_code=201)
async def add_zone(ctx: ProjectContext, user: CurrentUser,
                   payload: dict[str, Any] = Body(...),
                   _: dict = Depends(require_permission("project.update"))):
    data = {
        "project_id": ctx["project"]["id"],
        "zone_code": payload["zone_code"],
        "name": payload.get("name"),
        "description": payload.get("description"),
    }
    sql, args = db.build_insert("project_zones", data)
    async with db.tx(user) as conn:
        rec = await conn.fetchrow(sql, *args)
    return db.row(rec)


@router.delete("/{project_id}/zones/{zone_id}", status_code=204)
async def remove_zone(zone_id: uuid.UUID, ctx: ProjectContext, user: CurrentUser,
                      _: dict = Depends(require_permission("project.update"))):
    async with db.tx(user) as conn:
        await conn.execute(
            "DELETE FROM project_zones WHERE id = $1 AND project_id = $2",
            zone_id, ctx["project"]["id"])
    return None


@router.post("/{project_id}/assignments", status_code=201)
async def assign_worker(ctx: ProjectContext, user: CurrentUser,
                        payload: dict[str, Any] = Body(...),
                        _: dict = Depends(require_permission("project.assign"))):
    data = {
        "project_id": ctx["project"]["id"],
        "user_id": uuid.UUID(str(payload["user_id"])),
        "project_role": payload.get("project_role", "monitor"),
        "can_create_tickets": payload.get("can_create_tickets", True),
        "can_review_tickets": payload.get("can_review_tickets", False),
    }
    if payload.get("contractor_id"):
        data["contractor_id"] = uuid.UUID(str(payload["contractor_id"]))
    sql, args = db.build_insert("project_assignments", data)
    async with db.tx(user) as conn:
        rec = await conn.fetchrow(sql, *args)
    return db.row(rec)


@router.patch("/{project_id}/assignments/{assignment_id}")
async def update_assignment(assignment_id: uuid.UUID, ctx: ProjectContext,
                            user: CurrentUser, payload: dict[str, Any] = Body(...),
                            _: dict = Depends(require_permission("project.assign"))):
    allowed = {"project_role", "contractor_id", "can_create_tickets",
               "can_review_tickets", "is_active", "unassigned_on"}
    data = {k: v for k, v in payload.items() if k in allowed}
    if not data:
        raise bad_request("No updatable fields supplied")
    sql, args = db.build_update("project_assignments", data,
                                "id = $1 AND project_id = $2",
                                [assignment_id, ctx["project"]["id"]])
    async with db.tx(user) as conn:
        rec = await conn.fetchrow(sql, *args)
    if rec is None:
        raise not_found("Assignment")
    return db.row(rec)


@router.delete("/{project_id}/assignments/{assignment_id}", status_code=204)
async def unassign_worker(assignment_id: uuid.UUID, ctx: ProjectContext,
                          user: CurrentUser,
                          _: dict = Depends(require_permission("project.assign"))):
    async with db.tx(user) as conn:
        await conn.execute(
            "UPDATE project_assignments SET is_active = false, "
            "unassigned_on = current_date WHERE id = $1 AND project_id = $2",
            assignment_id, ctx["project"]["id"])
    return None


# ---------------------------------------------------------------------------
# Program, confirmed scope and the debris estimate
#
# Scope is what the client authorised, and nothing is assumed. Estimates are
# append-only: a revision is a new row, so the number the client first gave is
# still readable underneath.
# ---------------------------------------------------------------------------
class ScopeEntry(BaseModel):
    debris_type_code: str
    is_enabled: bool = True
    notes: Optional[str] = None


class ScopeBody(BaseModel):
    entries: list[ScopeEntry]


class EstimateBody(BaseModel):
    debris_type_code: str
    estimated_quantity: float = Field(gt=0)
    unit_type_code: Optional[str] = None
    source: str = "client"
    confidence: str = "rough"
    as_of_date: Optional[date] = None
    notes: Optional[str] = None


@router.get("/{project_id}/scope")
async def get_scope(ctx: ProjectContext, user: CurrentUser):
    pid = ctx["project"]["id"]
    async with db.read() as conn:
        scopes = await conn.fetch(
            """
            SELECT ps.*, d.label AS debris_label, d.category,
                   d.estimate_unit_type_code, u.abbreviation AS estimate_unit_abbrev,
                   c.full_name AS confirmed_by_name
              FROM project_scopes ps
              JOIN debris_types d ON d.code = ps.debris_type_code
              LEFT JOIN unit_types u ON u.code = d.estimate_unit_type_code
              LEFT JOIN users c ON c.id = ps.confirmed_by
             WHERE ps.project_id = $1
             ORDER BY d.sort_order
            """, pid)
        estimates = await conn.fetch(
            "SELECT * FROM project_estimate_current WHERE project_id = $1", pid)
        suggested = await conn.fetchval(
            """
            SELECT pr.default_debris_types FROM projects p
              JOIN programs pr ON pr.code = p.program_code
             WHERE p.id = $1
            """, pid)
    return {
        "scopes": db.rows(scopes),
        "estimates": db.rows(estimates),
        # A hint at the setup screen, never a gate. The contract decides the
        # work, not the program name.
        "suggested_debris_types": list(suggested or []),
    }


@router.put("/{project_id}/scope")
async def set_scope(ctx: ProjectContext, body: ScopeBody, user: CurrentUser,
                    _: dict = Depends(require_permission("project.update"))):
    pid = ctx["project"]["id"]
    async with db.tx(user) as conn:
        for entry in body.entries:
            await conn.execute(
                """
                INSERT INTO project_scopes (project_id, debris_type_code, is_enabled,
                                            confirmed_by, notes)
                VALUES ($1, $2, $3, $4, $5)
                ON CONFLICT (project_id, debris_type_code) DO UPDATE
                   SET is_enabled = EXCLUDED.is_enabled,
                       confirmed_by = EXCLUDED.confirmed_by,
                       confirmed_on = current_date,
                       notes = COALESCE(EXCLUDED.notes, project_scopes.notes)
                """, pid, entry.debris_type_code, entry.is_enabled,
                user["id"], entry.notes)

        # Confirming a stream implies the ticket types the field records it on.
        # Hangers with no unit rate ticket leave a crew with nowhere to put the
        # work, which is what the walkthrough found. Additive only: disabling a
        # stream never unlinks a type, because another stream may still need it.
        added = await conn.fetch(
            """
            INSERT INTO project_ticket_types (project_id, ticket_type_id)
            SELECT $1, tt.id
              FROM project_scopes ps
              JOIN debris_types dt ON dt.code = ps.debris_type_code
              JOIN ticket_types tt ON tt.code = ANY (dt.ticket_type_codes)
             WHERE ps.project_id = $1
               AND ps.is_enabled
               AND tt.is_active
               AND NOT tt.is_system
            ON CONFLICT (project_id, ticket_type_id) DO NOTHING
            RETURNING (SELECT code FROM ticket_types WHERE id = ticket_type_id) AS code
            """, pid)

    scope = await get_scope(ctx, user)
    scope["ticket_types_enabled"] = sorted({r["code"] for r in added})
    return scope


@router.get("/{project_id}/estimates")
async def list_estimates(ctx: ProjectContext, user: CurrentUser,
                         history: bool = Query(False)):
    pid = ctx["project"]["id"]
    async with db.read() as conn:
        current = await conn.fetch(
            "SELECT * FROM project_estimate_current WHERE project_id = $1", pid)
        rows = []
        if history:
            rows = await conn.fetch(
                """
                SELECT e.*, u.full_name AS created_by_name
                  FROM project_estimates e
                  LEFT JOIN users u ON u.id = e.created_by
                 WHERE e.project_id = $1
                 ORDER BY e.debris_type_code, e.as_of_date DESC, e.created_at DESC
                """, pid)
    return {"items": db.rows(current), "history": db.rows(rows)}


@router.post("/{project_id}/estimates", status_code=201)
async def record_estimate(ctx: ProjectContext, body: EstimateBody, user: CurrentUser,
                          _: dict = Depends(require_permission("project.update"))):
    """A revision is a new row. Nothing is ever edited in place, so the original
    client number survives every later correction."""
    pid = ctx["project"]["id"]
    async with db.tx(user) as conn:
        unit = body.unit_type_code or await conn.fetchval(
            "SELECT estimate_unit_type_code FROM debris_types WHERE code = $1",
            body.debris_type_code)
        if not unit:
            raise bad_request(
                f"No unit is set for {body.debris_type_code}, so there is nothing "
                f"to count it in.", code="unit_unknown")
        rec = await conn.fetchrow(
            """
            INSERT INTO project_estimates (project_id, debris_type_code,
                                           estimated_quantity, unit_type_code,
                                           source, confidence, as_of_date, notes,
                                           created_by)
            VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7::date, current_date), $8, $9)
            RETURNING *
            """, pid, body.debris_type_code, body.estimated_quantity, unit,
            body.source, body.confidence,
            body.as_of_date,
            body.notes, user["id"])
    return db.row(rec)


# ---------------------------------------------------------------------------
# Permits and the alerts feed
#
# Nagging, never blocking. A slow permit is visible everywhere and stops
# nothing: no ticket is ever refused because a project manager is behind on
# paperwork.
# ---------------------------------------------------------------------------
class PermitBody(BaseModel):
    permit_status: Optional[str] = None
    permit_document_id: Optional[uuid.UUID] = None
    permit_requested_from: Optional[str] = None
    permit_requested_on: Optional[date] = None
    permit_notes: Optional[str] = None


@router.get("/{project_id}/permits")
async def list_permits(ctx: ProjectContext, user: CurrentUser):
    async with db.read() as conn:
        recs = await conn.fetch(
            "SELECT * FROM project_permit_watch WHERE project_id = $1 "
            "ORDER BY permit_status, site_name", ctx["project"]["id"])
    return {"items": db.rows(recs), "total": len(recs)}


@router.patch("/{project_id}/sites/{link_id}/permit")
async def set_permit(link_id: uuid.UUID, ctx: ProjectContext, body: PermitBody,
                     user: CurrentUser,
                     _: dict = Depends(require_permission("site.manage"))):
    payload = body.model_dump(exclude_none=True)
    if not payload:
        raise bad_request("No permit fields supplied")
    if payload.get("permit_status") == "verified":
        payload["permit_verified_by"] = user["id"]
        payload["permit_verified_on"] = date.today()
    sql, args = db.build_update("project_sites", payload,
                                "id = $1 AND project_id = $2",
                                [link_id, ctx["project"]["id"]], returning="id")
    async with db.tx(user) as conn:
        found = await conn.fetchval(sql, *args)
        if found is None:
            raise not_found("Project site")
        rec = await conn.fetchrow(
            "SELECT * FROM project_permit_watch WHERE project_site_id = $1", found)
    return db.row(rec)


class PermitRequest(BaseModel):
    requested_from: str
    requested_on: Optional[date] = None
    notes: Optional[str] = None


@router.post("/{project_id}/sites/{link_id}/permit/request")
async def request_permit(link_id: uuid.UUID, ctx: ProjectContext,
                         body: PermitRequest, user: CurrentUser,
                         _: dict = Depends(require_permission("site.manage"))):
    """Starts the clock. Who was asked and when is the whole of what makes
    chasing paperwork visible later."""
    if body.requested_from not in ("client", "pm", "contractor"):
        raise bad_request("requested_from must be client, pm or contractor")
    async with db.tx(user) as conn:
        found = await conn.fetchval(
            """
            UPDATE project_sites
               SET permit_status = 'pending',
                   permit_requested_from = $3,
                   permit_requested_on = COALESCE($4, current_date),
                   permit_notes = COALESCE($5, permit_notes)
             WHERE id = $1 AND project_id = $2
         RETURNING id
            """, link_id, ctx["project"]["id"], body.requested_from,
            body.requested_on, body.notes)
        if found is None:
            raise not_found("Project site")
        rec = await conn.fetchrow(
            "SELECT * FROM project_permit_watch WHERE project_site_id = $1", found)
    return db.row(rec)


_SEVERITY = {"expired": 3, "overdue": 3, "expiring": 2, "not_requested": 2,
             "awaiting": 1, "ok": 0}


@router.get("/{project_id}/alerts")
async def project_alerts(ctx: ProjectContext, user: CurrentUser,
                         days: int = Query(30, ge=0, le=365)):
    """Everything nagging on this project in one payload: pending permits with
    days since request, expiring documents, and expiring truck certifications."""
    pid = ctx["project"]["id"]
    alerts: list[dict[str, Any]] = []

    async with db.read() as conn:
        permits = await conn.fetch(
            "SELECT * FROM project_permit_watch WHERE project_id = $1 "
            "AND watch_state <> 'ok'", pid)
        documents = await conn.fetch(
            """
            SELECT w.* FROM document_watch w
             WHERE w.watch_state <> 'ok'
               AND (w.project_id = $1
                    OR (w.entity_type = 'contracts' AND w.entity_id IN (
                        SELECT contract_id FROM project_contracts WHERE project_id = $1))
                    OR (w.entity_type = 'contractors' AND w.entity_id IN (
                        SELECT contractor_id FROM project_contractors WHERE project_id = $1))
                    OR (w.entity_type = 'disposal_sites' AND w.entity_id IN (
                        SELECT site_id FROM project_sites WHERE project_id = $1)))
            """, pid)
        equipment = await conn.fetch(
            """
            SELECT e.id, e.unit_number, e.certification_exp, c.name AS contractor_name,
                   (e.certification_exp - current_date) AS days_until_expiry
              FROM equipment e
              JOIN contractors c ON c.id = e.contractor_id
             WHERE e.deleted_at IS NULL AND e.is_active
               AND e.certification_exp IS NOT NULL
               AND e.certification_exp <= current_date + $2::integer
               AND e.contractor_id IN (
                   SELECT contractor_id FROM project_contractors WHERE project_id = $1)
             ORDER BY e.certification_exp
            """, pid, days)

    for p in db.rows(permits):
        alerts.append({
            "kind": "permit",
            "state": p["watch_state"],
            "severity": _SEVERITY.get(p["watch_state"], 1),
            "title": f"{p['site_name']} permit is {p['permit_status']}",
            "detail": (
                f"Requested from the {p['permit_requested_from']} "
                f"{p['days_since_request']} days ago"
                if p["permit_requested_on"] else "Not requested from anyone yet"),
            "entity_type": "project_sites",
            "entity_id": str(p["project_site_id"]),
            "days": p["days_since_request"],
        })

    for d in db.rows(documents):
        expiring = d["watch_state"] in ("expired", "expiring")
        alerts.append({
            "kind": "document",
            "state": d["watch_state"],
            "severity": _SEVERITY.get(d["watch_state"], 1),
            "title": f"{d['kind_label']}: {d['title']}",
            "detail": (
                f"Expire{'d' if d['watch_state'] == 'expired' else 's'} in "
                f"{d['days_until_expiry']} days" if expiring else
                f"Requested from the {d['requested_from']} "
                f"{d['days_since_request']} days ago"
                if d["requested_on"] else "Not verified and not requested"),
            "entity_type": d["entity_type"],
            "entity_id": str(d["entity_id"]),
            "days": d["days_until_expiry"] if expiring else d["days_since_request"],
        })

    for e in db.rows(equipment):
        expired = (e["days_until_expiry"] or 0) < 0
        alerts.append({
            "kind": "equipment",
            "state": "expired" if expired else "expiring",
            "severity": 3 if expired else 2,
            "title": f"Truck {e['unit_number']} certification",
            "detail": f"{e['contractor_name']}, "
                      f"{'expired' if expired else 'expires'} "
                      f"{abs(e['days_until_expiry'])} days "
                      f"{'ago' if expired else 'from now'}",
            "entity_type": "equipment",
            "entity_id": str(e["id"]),
            "days": e["days_until_expiry"],
        })

    alerts.sort(key=lambda a: (-a["severity"], a["kind"]))
    return {
        "items": alerts,
        "total": len(alerts),
        "by_severity": {
            "high": sum(1 for a in alerts if a["severity"] >= 3),
            "medium": sum(1 for a in alerts if a["severity"] == 2),
            "low": sum(1 for a in alerts if a["severity"] <= 1),
        },
    }
