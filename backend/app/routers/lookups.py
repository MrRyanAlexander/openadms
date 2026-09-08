"""Reference data and the project-scoped option lists the rule builder and the
field app render their dropdowns from."""
from __future__ import annotations

import uuid
from typing import Any, Optional

from fastapi import APIRouter, Depends, Query

from .. import db
from ..deps import CurrentUser, ProjectContext
from ..errors import bad_request

router = APIRouter(tags=["lookups"])


@router.get("/lookups")
async def all_lookups(user: CurrentUser):
    """One call the clients make at boot, so no screen has to fan out."""
    async with db.read() as conn:
        return {
            "roles": db.rows(await conn.fetch(
                "SELECT code, label, rank, description FROM roles ORDER BY rank")),
            "permissions": db.rows(await conn.fetch(
                "SELECT code, label, domain, min_rank FROM permissions "
                "ORDER BY domain, min_rank, code")),
            "ticket_statuses": db.rows(await conn.fetch(
                "SELECT * FROM ticket_statuses ORDER BY sort_order")),
            "debris_types": db.rows(await conn.fetch(
                "SELECT * FROM debris_types WHERE is_active ORDER BY sort_order")),
            "unit_types": db.rows(await conn.fetch(
                "SELECT * FROM unit_types WHERE is_active ORDER BY sort_order")),
            "visibility_flags": db.rows(await conn.fetch(
                "SELECT * FROM visibility_flags ORDER BY sort_order")),
            "rule_operands": db.rows(await conn.fetch(
                "SELECT * FROM rule_operands WHERE is_active ORDER BY sort_order")),
            "rule_operators": db.rows(await conn.fetch(
                "SELECT * FROM rule_operators ORDER BY sort_order")),
            "incident_categories": db.rows(await conn.fetch(
                "SELECT * FROM incident_categories WHERE is_active "
                "ORDER BY sort_order")),
            "site_kinds": [
                {"code": "DMS", "label": "Debris Management Site"},
                {"code": "TDSRS", "label": "Temporary Debris Storage and Reduction Site"},
                {"code": "FDS", "label": "Final Disposal Site"},
                {"code": "TRANSFER", "label": "Transfer Station"},
                {"code": "RECYCLING", "label": "Recycling Facility"},
            ],
            "equipment_types": [
                {"code": c, "label": c.replace("_", " ").title()} for c in
                ["truck", "trailer", "grapple", "loader", "chipper", "grinder",
                 "excavator", "crew", "other"]
            ],
            "severities": [{"code": s, "label": s.title()} for s in
                           ["info", "low", "medium", "high", "critical"]],
            "ticket_sources": [{"code": s, "label": s.replace("_", " ").title()}
                               for s in ["field_app", "back_office", "import",
                                         "api", "peer_sync"]],
        }


@router.get("/ticket-types")
async def ticket_types(
    user: CurrentUser,
    include_system: bool = Query(False),
    kind: Optional[str] = None,
):
    where = ["is_active"]
    args: list[Any] = []
    if not include_system:
        where.append("NOT is_system")
    if kind:
        args.append(kind)
        where.append(f"kind = ${len(args)}")
    async with db.read() as conn:
        recs = await conn.fetch(
            f"SELECT * FROM ticket_types WHERE {' AND '.join(where)} "
            f"ORDER BY sort_order, label", *args)
    return {"items": db.rows(recs)}


# ---------------------------------------------------------------------------
# Project-scoped option lists. rule_operands.options_source names one of these.
# ---------------------------------------------------------------------------
_OPTION_SQL: dict[str, str] = {
    "project_contractors": """
        SELECT c.id::text AS value, c.name AS label, pc.role_on_project AS hint
          FROM project_contractors pc JOIN contractors c ON c.id = pc.contractor_id
         WHERE pc.project_id = $1 AND pc.is_active ORDER BY c.name
    """,
    "project_contracts": """
        SELECT c.id::text AS value,
               c.contract_number || ' - ' || c.title AS label,
               c.status AS hint
          FROM project_contracts pc JOIN contracts c ON c.id = pc.contract_id
         WHERE pc.project_id = $1 ORDER BY c.contract_number
    """,
    "project_sites": """
        SELECT s.id::text AS value, s.name AS label, s.site_kind AS hint
          FROM project_sites ps JOIN disposal_sites s ON s.id = ps.site_id
         WHERE ps.project_id = $1 AND ps.is_active ORDER BY s.site_kind, s.name
    """,
    "project_zones": """
        SELECT zone_code AS value,
               zone_code || COALESCE(' - ' || name, '') AS label,
               NULL::text AS hint
          FROM project_zones WHERE project_id = $1 AND is_active ORDER BY zone_code
    """,
    "project_equipment": """
        SELECT e.id::text AS value,
               e.unit_number || ' (' || c.name || ')' AS label,
               COALESCE(e.capacity_cy::text || ' CY', e.equipment_type) AS hint
          FROM equipment e
          JOIN contractors c ON c.id = e.contractor_id
          JOIN project_contractors pc
            ON pc.contractor_id = e.contractor_id AND pc.project_id = $1
         WHERE e.is_active AND e.deleted_at IS NULL
         ORDER BY e.unit_number
    """,
    "project_workers": """
        SELECT u.id::text AS value,
               u.full_name || COALESCE(' (' || u.monitor_id || ')', '') AS label,
               pa.project_role AS hint
          FROM project_assignments pa JOIN users u ON u.id = pa.user_id
         WHERE pa.project_id = $1 AND pa.is_active ORDER BY u.full_name
    """,
    "project_service_codes": """
        SELECT sc.id::text AS value, sc.code || ' - ' || sc.name AS label,
               c.name AS hint
          FROM service_codes sc JOIN contractors c ON c.id = sc.contractor_id
         WHERE sc.project_id = $1 AND sc.is_active AND sc.deleted_at IS NULL
         ORDER BY sc.code
    """,
    "project_ticket_types": """
        SELECT tt.id::text AS value, tt.label AS label, tt.kind AS hint
          FROM project_ticket_types ptt JOIN ticket_types tt ON tt.id = ptt.ticket_type_id
         WHERE ptt.project_id = $1 AND ptt.is_active ORDER BY tt.sort_order
    """,
    "debris_types": """
        SELECT code AS value, label, category AS hint FROM debris_types
         WHERE is_active ORDER BY sort_order
    """,
    "debris_categories": """
        SELECT DISTINCT category AS value,
               initcap(replace(category, '_', ' ')) AS label,
               NULL::text AS hint
          FROM debris_types WHERE is_active ORDER BY 1
    """,
    "ticket_statuses": """
        SELECT code AS value, label, NULL::text AS hint FROM ticket_statuses
         ORDER BY sort_order
    """,
    "incident_categories": """
        SELECT id::text AS value, label, code AS hint FROM incident_categories
         WHERE is_active AND parent_id IS NULL ORDER BY sort_order
    """,
    "incident_subcategories": """
        SELECT id::text AS value, label, code AS hint FROM incident_categories
         WHERE is_active AND parent_id IS NOT NULL ORDER BY sort_order
    """,
    "site_kinds": """
        SELECT DISTINCT s.site_kind AS value, s.site_kind AS label, NULL::text AS hint
          FROM project_sites ps JOIN disposal_sites s ON s.id = ps.site_id
         WHERE ps.project_id = $1 ORDER BY 1
    """,
    "equipment_types": """
        SELECT DISTINCT e.equipment_type AS value,
               initcap(replace(e.equipment_type, '_', ' ')) AS label,
               NULL::text AS hint
          FROM equipment e
          JOIN project_contractors pc
            ON pc.contractor_id = e.contractor_id AND pc.project_id = $1
         ORDER BY 1
    """,
    "severities": """
        SELECT v AS value, initcap(v) AS label, NULL::text AS hint
          FROM unnest(ARRAY['info','low','medium','high','critical']) v
    """,
    "ticket_sources": """
        SELECT v AS value, initcap(replace(v, '_', ' ')) AS label, NULL::text AS hint
          FROM unnest(ARRAY['field_app','back_office','import','api','peer_sync']) v
    """,
}


@router.get("/projects/{project_id}/options/{source}")
async def project_options(source: str, ctx: ProjectContext, user: CurrentUser):
    """Backs every project-bound dropdown, including the rule builder's value
    picker. Which list to call comes from rule_operands.options_source."""
    sql = _OPTION_SQL.get(source)
    if sql is None:
        raise bad_request(
            f"Unknown option source '{source}'",
            available=sorted(_OPTION_SQL.keys()),
        )
    project_id = ctx["project"]["id"]
    async with db.read() as conn:
        recs = await conn.fetch(sql, *([] if "$1" not in sql else [project_id]))
    return {"source": source, "items": db.rows(recs)}


@router.get("/projects/{project_id}/rule-operands")
async def project_rule_operands(
    ctx: ProjectContext, user: CurrentUser,
    ticket_type_id: Optional[uuid.UUID] = None,
):
    """Operands filtered to the ticket type, each carrying the operators it
    accepts and the option source its value picker should call."""
    async with db.read() as conn:
        kind = None
        if ticket_type_id:
            kind = await conn.fetchval(
                "SELECT kind FROM ticket_types WHERE id = $1", ticket_type_id)
        operands = await conn.fetch(
            """
            SELECT o.*,
                   (SELECT jsonb_agg(jsonb_build_object(
                        'code', op.code, 'label', op.label,
                        'symbol', op.symbol, 'arity', op.arity)
                        ORDER BY op.sort_order)
                      FROM rule_operators op
                     WHERE o.data_type = ANY (op.data_types)) AS operators
              FROM rule_operands o
             WHERE o.is_active
               AND (cardinality(o.applies_to_kinds) = 0
                    OR $1::text IS NULL
                    OR $1 = ANY (o.applies_to_kinds))
             ORDER BY o.sort_order
            """,
            kind,
        )
    return {"items": db.rows(operands)}
