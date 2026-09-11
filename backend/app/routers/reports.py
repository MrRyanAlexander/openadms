"""Dashboards, the audit trail, and a guarded query builder."""
from __future__ import annotations

import re
import uuid
from datetime import date
from typing import Any, Optional

from fastapi import APIRouter, Body, Depends, Query

from .. import db
from ..deps import CurrentUser, Paging, ProjectContext, require_permission
from ..errors import bad_request

router = APIRouter(tags=["reports"])


@router.get("/projects/{project_id}/dashboard")
async def dashboard(ctx: ProjectContext, user: CurrentUser,
                    days: int = Query(30, ge=1, le=365),
                    period: str = Query(
                        "all", pattern="^(yesterday|week|month|all)$",
                        description="What the breakdowns count, as opposed to "
                                    "the project-to-date totals")):
    """The project at a glance.

    Two things the second walkthrough asked for and could not get. Everything
    except the headline totals now answers a PERIOD: "most active monitors"
    project-to-date is a vanity number, while yesterday is a management one, and
    "what is our cubic yard total by contractor this week" had no way to be
    asked at all. And the streams carry their estimate beside what has been
    collected against it, which is the "are we at sixty percent of the hanger
    estimate" question that E1 could not answer from any screen.
    """
    pid = ctx["project"]["id"]

    # Applied to the breakdowns, never to the project totals: "billed to date"
    # has to keep meaning to date.
    window = {
        "yesterday": "AND COALESCE(completed_at, created_at)::date"
                     " = (current_date - 1)",
        "week": "AND COALESCE(completed_at, created_at) > now() - interval '7 days'",
        "month": "AND COALESCE(completed_at, created_at) > now() - interval '30 days'",
        "all": "",
    }[period]

    async with db.read() as conn:
        summary = await conn.fetchrow(
            "SELECT * FROM project_dashboard WHERE project_id = $1", pid)
        readiness = await conn.fetchrow(
            "SELECT * FROM project_readiness_summary WHERE project_id = $1", pid)
        by_day = await conn.fetch(
            """
            SELECT COALESCE(completed_at, created_at)::date AS day,
                   count(*) AS tickets,
                   COALESCE(SUM(billable_cubic_yards), 0) AS cubic_yards,
                   COALESCE(SUM(transaction_total), 0) AS billable
              FROM ticket_overview
             WHERE project_id = $1 AND NOT is_void
               AND COALESCE(completed_at, created_at) > now() - make_interval(days => $2)
             GROUP BY 1 ORDER BY 1
            """, pid, days)
        by_type = await conn.fetch(
            """
            SELECT ticket_type_label AS label, kind, count(*) AS tickets,
                   COALESCE(SUM(transaction_total), 0) AS billable
              FROM ticket_overview WHERE project_id = $1 AND NOT is_void
             GROUP BY 1, 2 ORDER BY tickets DESC
            """, pid)
        by_debris = await conn.fetch(
            """
            SELECT COALESCE(debris_label, 'Unclassified') AS label,
                   count(*) AS tickets,
                   COALESCE(SUM(billable_cubic_yards), 0) AS cubic_yards
              FROM ticket_overview WHERE project_id = $1 AND NOT is_void {window}
             GROUP BY 1 ORDER BY cubic_yards DESC
            """.format(window=window), pid)
        by_contractor = await conn.fetch(
            """
            SELECT COALESCE(contractor_name, 'Unassigned') AS label,
                   count(*) AS tickets,
                   COALESCE(SUM(billable_cubic_yards), 0) AS cubic_yards,
                   COALESCE(SUM(transaction_total), 0) AS billable
              FROM ticket_overview WHERE project_id = $1 AND NOT is_void {window}
             GROUP BY 1 ORDER BY billable DESC
            """.format(window=window), pid)
        by_site = await conn.fetch(
            """
            SELECT COALESCE(destination_site_name, 'No site recorded') AS label,
                   count(*) AS tickets,
                   COALESCE(SUM(billable_cubic_yards), 0) AS cubic_yards
              FROM ticket_overview WHERE project_id = $1 AND NOT is_void {window}
             GROUP BY 1 ORDER BY cubic_yards DESC
            """.format(window=window), pid)
        top_monitors = await conn.fetch(
            """
            SELECT COALESCE(created_by_name, 'Unknown') AS label, count(*) AS tickets
              FROM ticket_overview WHERE project_id = $1 AND NOT is_void {window}
             GROUP BY 1 ORDER BY tickets DESC LIMIT 8
            """.format(window=window), pid)
        open_incidents = await conn.fetch(
            """
            SELECT t.id, t.ticket_number, t.severity, t.is_ongoing, t.notes,
                   t.origin_street, t.created_at, ic.label AS category
              FROM tickets t
              JOIN ticket_types tt ON tt.id = t.ticket_type_id
         LEFT JOIN incident_categories ic ON ic.id = t.incident_category_id
             WHERE t.project_id = $1 AND tt.kind = 'incident' AND NOT t.is_void
               AND (t.is_ongoing OR t.severity IN ('high', 'critical'))
             ORDER BY t.created_at DESC LIMIT 10
            """, pid)
        queue = await conn.fetch(
            """
            SELECT processing_state, count(*) AS tickets
              FROM tickets WHERE project_id = $1 AND deleted_at IS NULL
             GROUP BY 1 ORDER BY 1
            """, pid)

        # E1: "are we at sixty percent of the hanger estimate". The estimate has
        # existed since Sprint 1 and nothing ever compared it to production.
        progress = await conn.fetch(
            """
            SELECT e.debris_type_code, dt.label AS debris_label,
                   e.estimated_quantity, e.unit_type_code,
                   ut.abbreviation AS unit_abbrev,
                   e.confidence, e.as_of_date, e.source,
                   COALESCE(a.collected, 0) AS collected,
                   CASE WHEN e.estimated_quantity > 0
                        THEN round(100.0 * COALESCE(a.collected, 0)
                                   / e.estimated_quantity, 1)
                   END AS percent_of_estimate,
                   (SELECT count(*) FROM project_estimates pe
                     WHERE pe.project_id = $1
                       AND pe.debris_type_code = e.debris_type_code) AS revisions
              FROM project_estimate_current e
              JOIN debris_types dt ON dt.code = e.debris_type_code
              LEFT JOIN unit_types ut ON ut.code = e.unit_type_code
              LEFT JOIN LATERAL (
                  -- Counted streams are counted; measured ones are volume.
                  SELECT CASE WHEN e.unit_type_code = 'per_cubic_yard'
                              THEN COALESCE(sum(o.billable_cubic_yards), 0)
                              ELSE count(*)::numeric END AS collected
                    FROM ticket_overview o
                   WHERE o.project_id = $1 AND NOT o.is_void
                     AND o.debris_type = e.debris_type_code
              ) a ON true
             WHERE e.project_id = $1
             ORDER BY percent_of_estimate DESC NULLS LAST
            """, pid)

        # E4: the alerts feed existed and lived inside project setup, where
        # nobody looking for "what expires in the next thirty days" would find
        # it.
        alerts = await conn.fetch(
            """
            SELECT kind, label, detail, due_on, severity, days_out FROM (
                SELECT 'permit' AS kind,
                       pw.site_name AS label,
                       'Permit pending'
                         || COALESCE(', ' || pw.days_since_request::text
                                     || ' days since it was asked for', '')
                         AS detail,
                       NULL::date AS due_on,
                       CASE WHEN COALESCE(pw.days_since_request, 0) > 21
                            THEN 'serious' ELSE 'review' END AS severity,
                       NULL::integer AS days_out
                  FROM project_permit_watch pw
                 WHERE pw.project_id = $1 AND pw.permit_status = 'pending'
                UNION ALL
                SELECT 'document', d.title,
                       'Expires ' || to_char(d.expires_on, 'Mon DD'),
                       d.expires_on,
                       CASE WHEN d.expires_on < current_date THEN 'serious'
                            ELSE 'review' END,
                       (d.expires_on - current_date)::integer
                  FROM document_watch d
                 WHERE d.project_id = $1 AND d.expires_on IS NOT NULL
                   AND d.expires_on <= current_date + 30
                UNION ALL
                SELECT 'certification', c.unit_number,
                       'Certification expires ' || to_char(c.expires_on, 'Mon DD'),
                       c.expires_on,
                       CASE WHEN c.is_expired THEN 'serious' ELSE 'review' END,
                       c.days_to_expiry::integer
                  FROM project_equipment_current c
                 WHERE c.project_id = $1 AND c.expires_on IS NOT NULL
                   AND c.expires_on <= current_date + 30
            ) a
             ORDER BY CASE severity WHEN 'serious' THEN 1 ELSE 2 END,
                      due_on NULLS FIRST
             LIMIT 25
            """, pid)

        # C1: the data manager's question, on the screen that opens first.
        review = await conn.fetchrow(
            """
            SELECT count(*) FILTER (WHERE review_state = 'pending')   AS unreviewed,
                   count(*) FILTER (WHERE open_flags > 0)             AS flagged,
                   count(*) FILTER (WHERE worst_severity = 'serious') AS serious,
                   count(*) FILTER (WHERE review_state = 'flagged')   AS raised
              FROM ticket_review_queue WHERE project_id = $1
            """, pid)

        reprocess = await conn.fetchval(
            "SELECT count(*) FROM tickets "
            " WHERE project_id = $1 AND needs_reprocess AND deleted_at IS NULL", pid)

    return {
        "period": period,
        "summary": db.row(summary),
        "readiness": db.row(readiness),
        "by_day": db.rows(by_day),
        "by_ticket_type": db.rows(by_type),
        "by_debris_type": db.rows(by_debris),
        "by_contractor": db.rows(by_contractor),
        "by_site": db.rows(by_site),
        "top_monitors": db.rows(top_monitors),
        "open_incidents": db.rows(open_incidents),
        "processing_queue": db.rows(queue),
        "progress": db.rows(progress),
        "alerts": db.rows(alerts),
        "review": db.row(review),
        "needs_reprocess": int(reprocess or 0),
    }


@router.get("/audit")
async def audit_trail(
    paging: Paging, user: CurrentUser,
    project_id: Optional[uuid.UUID] = None,
    entity_type: Optional[str] = None,
    entity_id: Optional[uuid.UUID] = None,
    action: Optional[str] = None,
    actor: Optional[str] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    _: dict = Depends(require_permission("audit.read")),
):
    where = ["TRUE"]
    args: list[Any] = []

    def add(tmpl: str, value: Any):
        args.append(value)
        where.append(tmpl.format(n=len(args)))

    if project_id:
        add("project_id = ${n}", project_id)
    if entity_type:
        add("entity_type = ${n}", entity_type)
    if entity_id:
        add("entity_id = ${n}", entity_id)
    if action:
        add("action = ${n}", action)
    if actor:
        add("actor ILIKE ${n}", f"%{actor}%")
    if date_from:
        add("occurred_at >= ${n}::date", date_from)
    if date_to:
        add("occurred_at < (${n}::date + 1)", date_to)

    clause = " AND ".join(where)
    async with db.read() as conn:
        total = await conn.fetchval(
            f"SELECT count(*) FROM audit_trail WHERE {clause}", *args)
        recs = await conn.fetch(
            f"SELECT * FROM audit_trail WHERE {clause} ORDER BY occurred_at DESC "
            f"LIMIT ${len(args)+1} OFFSET ${len(args)+2}",
            *args, paging["limit"], paging["offset"])
    return db.Page.of(db.rows(recs), total, paging["limit"], paging["offset"])


# ---------------------------------------------------------------------------
# Query builder. Users compose filters over an allow-listed view; the SQL is
# assembled server-side and every value is a bound parameter.
# ---------------------------------------------------------------------------
_QUERY_SOURCES: dict[str, dict[str, Any]] = {
    "tickets": {
        "view": "ticket_overview",
        "label": "Tickets",
        "default_columns": ["ticket_number", "ticket_type_label", "status",
                            "debris_type", "contractor_name", "truck_number",
                            "billable_cubic_yards", "transaction_total",
                            "completed_at"],
    },
    "transactions": {
        "view": "transaction_ledger",
        "label": "Transactions",
        "default_columns": ["transaction_number", "ticket_number", "service_code",
                            "quantity", "unit_abbrev", "rate_amount", "amount",
                            "invoice_number", "computed_at"],
    },
    "audit": {
        "view": "audit_trail",
        "label": "Audit history",
        "default_columns": ["occurred_at", "entity_type", "entity_label", "action",
                            "actor", "changed"],
    },
}

_OPS = {
    "eq": "=", "ne": "<>", "gt": ">", "gte": ">=", "lt": "<", "lte": "<=",
    "contains": "ILIKE", "starts_with": "ILIKE", "in": "= ANY",
    "is_null": "IS NULL", "is_not_null": "IS NOT NULL",
}

_IDENT = re.compile(r"^[a-z_][a-z0-9_]*$")


@router.get("/query/sources")
async def query_sources(user: CurrentUser,
                        _: dict = Depends(require_permission("query.build"))):
    async with db.read() as conn:
        out = []
        for key, meta in _QUERY_SOURCES.items():
            cols = await conn.fetch(
                "SELECT column_name, data_type FROM information_schema.columns "
                "WHERE table_name = $1 ORDER BY ordinal_position", meta["view"])
            out.append({
                "key": key, "label": meta["label"],
                "default_columns": meta["default_columns"],
                "columns": db.rows(cols),
            })
    return {"sources": out, "operators": [
        {"code": k, "label": k.replace("_", " ")} for k in _OPS]}


@router.post("/query/run")
async def run_query(user: CurrentUser, body: dict[str, Any] = Body(...),
                    _: dict = Depends(require_permission("query.build"))):
    source = _QUERY_SOURCES.get(body.get("source", "tickets"))
    if source is None:
        raise bad_request("Unknown query source", available=list(_QUERY_SOURCES))

    async with db.read() as conn:
        valid = {r["column_name"] for r in await conn.fetch(
            "SELECT column_name FROM information_schema.columns WHERE table_name = $1",
            source["view"])}

    columns = [c for c in body.get("columns") or source["default_columns"]
               if c in valid]
    if not columns:
        columns = source["default_columns"]

    where: list[str] = ["TRUE"]
    args: list[Any] = []
    for f in body.get("filters", []):
        col, op = f.get("column"), f.get("operator", "eq")
        if col not in valid or not _IDENT.match(col) or op not in _OPS:
            raise bad_request(f"Invalid filter on '{col}'")
        if op in ("is_null", "is_not_null"):
            where.append(f"{col} {_OPS[op]}")
            continue
        value = f.get("value")
        if op == "contains":
            value = f"%{value}%"
        elif op == "starts_with":
            value = f"{value}%"
        args.append(value)
        if op == "in":
            where.append(f"{col}::text = ANY(${len(args)}::text[])")
        else:
            where.append(f"{col}::text {_OPS[op]} ${len(args)}::text"
                         if op in ("contains", "starts_with")
                         else f"{col} {_OPS[op]} ${len(args)}")

    order = body.get("order_by")
    order_sql = f"{order} {'ASC' if body.get('ascending') else 'DESC'} NULLS LAST" \
        if order in valid else "1"
    limit = min(int(body.get("limit", 200)), 5000)

    select = ", ".join(columns)
    clause = " AND ".join(where)
    async with db.read() as conn:
        total = await conn.fetchval(
            f"SELECT count(*) FROM {source['view']} WHERE {clause}", *args)
        recs = await conn.fetch(
            f"SELECT {select} FROM {source['view']} WHERE {clause} "
            f"ORDER BY {order_sql} LIMIT {limit}", *args)
    return {"columns": columns, "total": total, "returned": len(recs),
            "rows": db.rows(recs)}


@router.get("/projects/{project_id}/export/{dataset}")
async def export_dataset(dataset: str, ctx: ProjectContext, user: CurrentUser,
                         _: dict = Depends(require_permission("report.run"))):
    """CSV-shaped JSON the back office turns into a download."""
    views = {"tickets": "ticket_overview", "transactions": "transaction_ledger",
             "audit": "audit_trail"}
    view = views.get(dataset)
    if view is None:
        raise bad_request("Unknown dataset", available=list(views))
    async with db.tx(user) as conn:
        recs = await conn.fetch(
            f"SELECT * FROM {view} WHERE project_id = $1 LIMIT 50000",
            ctx["project"]["id"])
        await conn.execute(
            """
            INSERT INTO audit_events (entity_type, project_id, action, actor_id,
                                      actor_name, changed)
            VALUES ($1, $2, 'export', $3, $4, $5::jsonb)
            """,
            view, ctx["project"]["id"], user["id"], user["full_name"],
            {"rows": len(recs)})
    rows = db.rows(recs)
    return {"dataset": dataset, "count": len(rows),
            "columns": list(rows[0].keys()) if rows else [], "rows": rows}
