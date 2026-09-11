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
        # C2 asked for two things from this tile: words a person recognises, and
        # "each item is a link into the list that holds it". The destination is
        # decided here rather than guessed in the UI, because the server is what
        # knows which screen owns each kind of outstanding work.
        alerts = await conn.fetch(
            """
            SELECT kind, label, detail, due_on, severity, days_out, link FROM (
                SELECT 'permit' AS kind,
                       pw.site_name AS label,
                       'Waiting on the permit'
                         || COALESCE(', asked for ' || pw.days_since_request::text
                                     || ' days ago', '')
                         AS detail,
                       NULL::date AS due_on,
                       CASE WHEN COALESCE(pw.days_since_request, 0) > 21
                            THEN 'serious' ELSE 'review' END AS severity,
                       NULL::integer AS days_out,
                       '/setup?tab=sites' AS link
                  FROM project_permit_watch pw
                 WHERE pw.project_id = $1 AND pw.permit_status = 'pending'
                UNION ALL
                SELECT 'document', d.title,
                       CASE WHEN d.expires_on < current_date
                            THEN 'Expired ' || to_char(d.expires_on, 'Mon DD')
                            ELSE 'Expires ' || to_char(d.expires_on, 'Mon DD') END,
                       d.expires_on,
                       CASE WHEN d.expires_on < current_date THEN 'serious'
                            ELSE 'review' END,
                       (d.expires_on - current_date)::integer,
                       '/setup?tab=documents'
                  FROM document_watch d
                 WHERE d.project_id = $1 AND d.expires_on IS NOT NULL
                   AND d.expires_on <= current_date + 30
                UNION ALL
                SELECT 'certification', c.unit_number,
                       CASE WHEN c.is_expired
                            THEN 'Certification expired ' || to_char(c.expires_on, 'Mon DD')
                            ELSE 'Certification expires ' || to_char(c.expires_on, 'Mon DD')
                       END,
                       c.expires_on,
                       CASE WHEN c.is_expired THEN 'serious' ELSE 'review' END,
                       c.days_to_expiry::integer,
                       '/certifications'
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


AUDIT_DOMAINS = ("operations", "billing", "records", "security")


@router.get("/audit")
async def audit_trail(
    paging: Paging, user: CurrentUser,
    project_id: Optional[uuid.UUID] = None,
    entity_type: Optional[str] = None,
    entity_id: Optional[uuid.UUID] = None,
    domain: Optional[str] = None,
    action: Optional[str] = None,
    actor: Optional[str] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    _: dict = Depends(require_permission("audit.read")),
):
    """The trail, split four ways.

    A single undifferentiated list of every write is technically complete and
    practically useless: the person asking who changed a rate is not the person
    asking who logged in. The domain is computed from the record type, so the
    split costs nothing to maintain and cannot drift from what actually
    happened. Counts come back for every domain under the same filters, so the
    tabs say how much is behind them before anyone clicks."""
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

    # The domain clause is kept out of the shared prefix so the tab counts can
    # be taken across every domain under the same filters.
    shared, shared_args = " AND ".join(where), list(args)
    clause = shared
    if domain in AUDIT_DOMAINS:
        args.append(domain)
        clause = f"{shared} AND domain = ${len(args)}"

    async with db.read() as conn:
        counts = await conn.fetch(
            f"SELECT domain, count(*) AS n FROM audit_trail WHERE {shared} "
            f"GROUP BY domain", *shared_args)
        total = await conn.fetchval(
            f"SELECT count(*) FROM audit_trail WHERE {clause}", *args)
        recs = await conn.fetch(
            f"SELECT * FROM audit_trail WHERE {clause} ORDER BY occurred_at DESC "
            f"LIMIT ${len(args)+1} OFFSET ${len(args)+2}",
            *args, paging["limit"], paging["offset"])

    page = db.Page.of(db.rows(recs), total, paging["limit"], paging["offset"])
    by_domain = {r["domain"]: int(r["n"]) for r in counts}
    page["domains"] = {d: by_domain.get(d, 0) for d in AUDIT_DOMAINS}
    page["domains"]["all"] = sum(by_domain.values())
    return page


# What else belongs in one record's story. An auditor asking what happened to a
# ticket does not care that the reprice landed on a transaction row: it is the
# same event to them, so the chain gathers the record's own history and the
# history of everything that hangs off it.
_CHAIN_RELATED: dict[str, list[tuple[str, str]]] = {
    "tickets": [
        ("transactions", "SELECT id FROM transactions WHERE ticket_id = $1"),
        ("ticket_reviews", "SELECT id FROM ticket_reviews WHERE ticket_id = $1"),
        ("ticket_flags", "SELECT id FROM ticket_flags WHERE ticket_id = $1"),
        ("ticket_media", "SELECT id FROM ticket_media WHERE ticket_id = $1"),
    ],
    "invoices": [
        ("invoice_lines", "SELECT id FROM invoice_lines WHERE invoice_id = $1"),
    ],
    "rules": [
        ("rule_statements", "SELECT id FROM rule_statements WHERE rule_id = $1"),
    ],
    "contracts": [
        ("contract_line_items",
         "SELECT id FROM contract_line_items WHERE contract_id = $1"),
        ("rates", "SELECT id FROM rates WHERE contract_id = $1"),
    ],
    "projects": [
        ("project_assignments",
         "SELECT id FROM project_assignments WHERE project_id = $1"),
    ],
}


@router.get("/audit/chain")
async def audit_chain(
    user: CurrentUser,
    entity_type: str,
    entity_id: uuid.UUID,
    _: dict = Depends(require_permission("audit.read")),
):
    """Every artifact touching one record, oldest first.

    The trail answers what changed. The chain answers what happened to this
    thing, in order, which is the question an auditor actually asks."""
    async with db.read() as conn:
        pairs: list[tuple[str, uuid.UUID]] = [(entity_type, entity_id)]
        related: dict[str, int] = {}
        for kind, sql in _CHAIN_RELATED.get(entity_type, []):
            try:
                ids = await conn.fetch(sql, entity_id)
            except Exception:      # a table this build does not carry
                continue
            if ids:
                related[kind] = len(ids)
                pairs.extend((kind, r["id"]) for r in ids)

        types = [p[0] for p in pairs]
        ids = [p[1] for p in pairs]
        events = await conn.fetch(
            """
            SELECT a.* FROM audit_trail a
              JOIN unnest($1::text[], $2::uuid[]) AS w(entity_type, entity_id)
                ON w.entity_type = a.entity_type AND w.entity_id = a.entity_id
             ORDER BY a.occurred_at, a.id
             LIMIT 400
            """, types, ids)

        label = await conn.fetchval(
            """
            SELECT entity_label FROM audit_events
             WHERE entity_type = $1 AND entity_id = $2 AND entity_label IS NOT NULL
             ORDER BY id DESC LIMIT 1
            """, entity_type, entity_id)

    rows = db.rows(events)
    actors = sorted({r["actor"] for r in rows if r["actor"]})
    return {
        "entity_type": entity_type,
        "entity_id": str(entity_id),
        "entity_label": label,
        "events": rows,
        "count": len(rows),
        "related": related,
        "actors": actors,
        "first_at": rows[0]["occurred_at"] if rows else None,
        "last_at": rows[-1]["occurred_at"] if rows else None,
    }


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
    truncated = total > len(recs)
    return {"columns": columns, "total": total, "returned": len(recs),
            "limit": limit, "truncated": truncated,
            "message": (f"Showing {len(recs):,} of {total:,} rows. Narrow the "
                        f"filters or raise the row limit to see the rest."
                        if truncated else None),
            "rows": db.rows(recs)}


# M6: "the export states its cap rather than truncating in silence. The cap is
# 50,000 rows." Named once, applied everywhere an export is built, and reported
# back with every response that hits it.
EXPORT_CAP = 50_000


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
        available = await conn.fetchval(
            f"SELECT count(*) FROM {view} WHERE project_id = $1",
            ctx["project"]["id"])
        recs = await conn.fetch(
            f"SELECT * FROM {view} WHERE project_id = $1 LIMIT {EXPORT_CAP}",
            ctx["project"]["id"])
        await conn.execute(
            """
            INSERT INTO audit_events (entity_type, project_id, action, actor_id,
                                      actor_name, changed)
            VALUES ($1, $2, 'export', $3, $4, $5::jsonb)
            """,
            view, ctx["project"]["id"], user["id"], user["full_name"],
            {"rows": len(recs), "available": int(available or 0),
             "cap": EXPORT_CAP, "truncated": int(available or 0) > len(recs)})
    rows = db.rows(recs)
    available = int(available or 0)
    truncated = available > len(rows)
    return {
        "dataset": dataset, "count": len(rows),
        "available": available, "cap": EXPORT_CAP, "truncated": truncated,
        # Said out loud. An export that stops at fifty thousand rows and does
        # not say so is the one that gets sent to a client as complete.
        "message": (
            f"This export carries {len(rows):,} of {available:,} rows. The cap "
            f"is {EXPORT_CAP:,}. Filter the list and export again, or take the "
            f"remainder from the closeout package with a date range."
            if truncated else f"{len(rows):,} row(s), the whole dataset."),
        "columns": list(rows[0].keys()) if rows else [], "rows": rows,
    }
