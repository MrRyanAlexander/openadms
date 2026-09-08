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

router = APIRouter(prefix="/projects", tags=["projects"])

_PROJECT_SELECT = """
    SELECT p.*, cl.name AS client_name, d.declaration_code, d.name AS disaster_name,
           k.contract_number AS primary_contract_number,
           rs.ready_for_field, rs.ready_for_billing, rs.missing,
           dash.ticket_total, dash.ticket_completed, dash.ticket_open,
           dash.awaiting_processing, dash.total_cubic_yards, dash.total_tons,
           dash.billable_total
      FROM projects p
      JOIN clients cl ON cl.id = p.client_id
      LEFT JOIN disasters d ON d.id = p.disaster_id
      LEFT JOIN contracts k ON k.id = p.primary_contract_id
      LEFT JOIN project_readiness_summary rs ON rs.project_id = p.id
      LEFT JOIN project_dashboard dash ON dash.project_id = p.id
"""


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


@router.get("")
async def list_projects(
    paging: Paging, user: CurrentUser,
    q: Optional[str] = None,
    status: Optional[str] = None,
    mine_only: bool = Query(False, description="Only projects I am assigned to"),
):
    where = ["p.deleted_at IS NULL"]
    args: list[Any] = []

    # Anyone below admin sees only their own project context.
    if mine_only or user["role_rank"] < 40:
        args.append(user["id"])
        where.append(
            f"EXISTS (SELECT 1 FROM project_assignments pa WHERE pa.project_id = p.id "
            f"AND pa.user_id = ${len(args)} AND pa.is_active)")
    if q:
        args.append(f"%{q}%")
        where.append(f"(p.name ILIKE ${len(args)} OR p.project_code ILIKE ${len(args)})")
    if status:
        args.append(status)
        where.append(f"p.status = ${len(args)}")

    clause = " AND ".join(where)
    async with db.read() as conn:
        total = await conn.fetchval(
            f"SELECT count(*) FROM projects p WHERE {clause}", *args)
        recs = await conn.fetch(
            f"{_PROJECT_SELECT} WHERE {clause} ORDER BY p.status, p.name "
            f"LIMIT ${len(args)+1} OFFSET ${len(args)+2}",
            *args, paging["limit"], paging["offset"])
    return db.Page.of(db.rows(recs), total, paging["limit"], paging["offset"])


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
                   ct.name AS contractor_name
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
                    extra_fields: tuple[str, ...] = ()):
    @router.post(f"/{{project_id}}/{name}", status_code=201,
                 name=f"add_{name}", tags=["projects"])
    async def add_link(ctx: ProjectContext, user: CurrentUser,
                       payload: dict[str, Any] = Body(...),
                       _: dict = Depends(require_permission(permission))):
        data = {column: payload.get(column)}
        if data[column] is None:
            raise bad_request(f"{column} is required")
        data[column] = uuid.UUID(str(data[column]))
        for f in extra_fields:
            if f in payload:
                data[f] = payload[f]
        data["project_id"] = ctx["project"]["id"]
        sql, args = db.build_insert(table, data)
        async with db.tx(user) as conn:
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
                "contractor.manage", ("role_on_project",))
_link_endpoints("contracts", "project_contracts", "contract_id",
                "contract.manage", ("is_primary",))
_link_endpoints("sites", "project_sites", "site_id", "site.manage",
                ("opened_on", "closed_on"))
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
