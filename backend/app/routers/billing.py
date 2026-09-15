"""Service codes, rates, the rule builder, transactions, and invoices."""
from __future__ import annotations

import re
import uuid
from datetime import date
from typing import Any, Optional

from fastapi import APIRouter, Body, Depends, Query
from pydantic import BaseModel, Field

from .. import db, tabular
from ..deps import CurrentUser, Paging, ProjectContext, require_permission
from ..errors import bad_request, conflict, not_found

router = APIRouter(tags=["billing"])


# ---------------------------------------------------------------------------
# Service codes and rates
# ---------------------------------------------------------------------------
class ServiceCodeBody(BaseModel):
    code: str = Field(min_length=1, max_length=32)
    name: str = Field(min_length=2)
    contractor_id: uuid.UUID
    description: Optional[str] = None
    fema_category: Optional[str] = None
    rate_amount: Optional[float] = Field(default=None, ge=0)
    rate_unit_type: Optional[str] = None


class RateBody(BaseModel):
    amount: float = Field(ge=0)
    unit_type: str
    effective_from: Optional[date] = None
    effective_to: Optional[date] = None
    minimum_quantity: Optional[float] = None
    maximum_quantity: Optional[float] = None
    notes: Optional[str] = None


_SERVICE_CODE_SELECT = """
    SELECT sc.*, c.name AS contractor_name,
           r.id AS current_rate_id, r.amount AS current_rate,
           r.unit_type AS current_unit_type, ut.abbreviation AS current_unit_abbrev,
           ut.label AS current_unit_label,
           (SELECT count(*) FROM rules ru WHERE ru.service_code_id = sc.id
              AND ru.deleted_at IS NULL) AS rule_count,
           (SELECT COALESCE(SUM(tx.amount), 0) FROM transactions tx
             WHERE tx.service_code_id = sc.id) AS billed_total
      FROM service_codes sc
      JOIN contractors c ON c.id = sc.contractor_id
      LEFT JOIN LATERAL adms_rate_for(sc.id, current_date) r ON true
      LEFT JOIN unit_types ut ON ut.code = r.unit_type
"""


@router.get("/projects/{project_id}/service-codes")
async def list_service_codes(ctx: ProjectContext, user: CurrentUser):
    async with db.read() as conn:
        recs = await conn.fetch(
            f"{_SERVICE_CODE_SELECT} WHERE sc.project_id = $1 AND sc.deleted_at IS NULL "
            f"ORDER BY sc.code", ctx["project"]["id"])
        for_each = await conn.fetch(
            """
            SELECT r.*, ut.abbreviation, ut.label AS unit_label
              FROM rates r
              JOIN service_codes sc ON sc.id = r.service_code_id
              JOIN unit_types ut ON ut.code = r.unit_type
             WHERE sc.project_id = $1 ORDER BY r.effective_from DESC
            """, ctx["project"]["id"])
    rates_by_code: dict[str, list] = {}
    for r in db.rows(for_each):
        rates_by_code.setdefault(str(r["service_code_id"]), []).append(r)
    items = db.rows(recs)
    for item in items:
        item["rates"] = rates_by_code.get(str(item["id"]), [])
    return {"items": items}


@router.post("/projects/{project_id}/service-codes", status_code=201)
async def create_service_code(ctx: ProjectContext, body: ServiceCodeBody,
                              user: CurrentUser,
                              _: dict = Depends(require_permission("service_code.manage"))):
    async with db.tx(user) as conn:
        rec = await conn.fetchrow(
            """
            INSERT INTO service_codes (project_id, code, name, contractor_id,
                                       description, fema_category)
            VALUES ($1, $2, $3, $4, $5, $6) RETURNING *
            """,
            ctx["project"]["id"], body.code, body.name, body.contractor_id,
            body.description, body.fema_category)
        if body.rate_amount is not None and body.rate_unit_type:
            await conn.execute(
                "INSERT INTO rates (service_code_id, amount, unit_type) "
                "VALUES ($1, $2, $3)",
                rec["id"], body.rate_amount, body.rate_unit_type)
        full = await conn.fetchrow(f"{_SERVICE_CODE_SELECT} WHERE sc.id = $1", rec["id"])
    return db.row(full)


@router.patch("/service-codes/{service_code_id}")
async def update_service_code(service_code_id: uuid.UUID, user: CurrentUser,
                              payload: dict[str, Any] = Body(...),
                              _: dict = Depends(require_permission("service_code.manage"))):
    allowed = {"code", "name", "contractor_id", "description", "fema_category",
               "is_active", "metadata"}
    data = {k: v for k, v in payload.items() if k in allowed}
    if not data:
        raise bad_request("No updatable fields supplied")
    sql, args = db.build_update("service_codes", data,
                                "id = $1 AND deleted_at IS NULL", [service_code_id],
                                returning="id")
    async with db.tx(user) as conn:
        found = await conn.fetchval(sql, *args)
        if found is None:
            raise not_found("Service code")
        rec = await conn.fetchrow(f"{_SERVICE_CODE_SELECT} WHERE sc.id = $1", found)
    return db.row(rec)


@router.delete("/service-codes/{service_code_id}", status_code=204)
async def delete_service_code(service_code_id: uuid.UUID, user: CurrentUser,
                              _: dict = Depends(require_permission("service_code.manage"))):
    async with db.tx(user) as conn:
        in_use = await conn.fetchval(
            "SELECT count(*) FROM rules WHERE service_code_id = $1 "
            "AND deleted_at IS NULL", service_code_id)
        if in_use:
            raise conflict(
                f"{in_use} rule(s) still reference this service code. "
                "Retire those rules first.")
        await conn.execute(
            "UPDATE service_codes SET deleted_at = now(), is_active = false "
            "WHERE id = $1", service_code_id)
    return None


@router.post("/service-codes/{service_code_id}/rates", status_code=201)
async def add_rate(service_code_id: uuid.UUID, body: RateBody, user: CurrentUser,
                   _: dict = Depends(require_permission("rate.manage"))):
    """Rates are effective-dated, so a mid-project change never rewrites
    transactions that were already computed."""
    data = {k: v for k, v in body.model_dump(exclude_none=True).items()}
    data["service_code_id"] = service_code_id
    async with db.tx(user) as conn:
        if body.effective_from:
            await conn.execute(
                """
                UPDATE rates SET effective_to = ($1::date - 1)
                 WHERE service_code_id = $2 AND effective_to IS NULL
                   AND effective_from < $1::date
                """, body.effective_from, service_code_id)
        sql, args = db.build_insert("rates", data)
        rec = await conn.fetchrow(sql, *args)
    return db.row(rec)


# ---------------------------------------------------------------------------
# Rules
# ---------------------------------------------------------------------------
class StatementBody(BaseModel):
    operand_code: str
    operator_code: str
    value: Any = None
    value_label: Optional[str] = None
    negate: bool = False


class RuleBody(BaseModel):
    """One rule.

    transaction_sequence and priority answer different questions and are the
    two most commonly confused fields on this model. The sequence is the order
    the transactions stack on one ticket: a haul is 1 and the tipping fee it
    incurs is 2, and both bill. Priority decides which of several ALTERNATIVES
    at the same sequence wins, which is the if/else, and only matters next to
    stop_on_match. 0028 has the reasoning."""
    name: str = Field(min_length=2)
    ticket_type_id: uuid.UUID
    service_code_id: uuid.UUID
    contract_id: uuid.UUID
    description: Optional[str] = None
    match_mode: str = "all"
    priority: int = 100
    transaction_sequence: int = Field(default=1, ge=1)
    stop_on_match: bool = False
    quantity_override: Optional[float] = None
    effective_from: Optional[date] = None
    effective_to: Optional[date] = None
    is_active: bool = True
    statements: list[StatementBody] = []


_RULE_SELECT = """
    SELECT r.*, tt.code AS ticket_type_code, tt.label AS ticket_type_label,
           sc.code AS service_code, sc.name AS service_code_name,
           ct.name AS contractor_name,
           k.contract_number, k.title AS contract_title,
           rt.amount AS rate_amount, rt.unit_type,
           ut.abbreviation AS unit_abbrev,
           (SELECT count(*) FROM transactions tx WHERE tx.rule_id = r.id) AS match_count,
           (SELECT COALESCE(SUM(tx.amount), 0) FROM transactions tx
             WHERE tx.rule_id = r.id) AS billed_total,
           COALESCE((
              SELECT jsonb_agg(jsonb_build_object(
                        'id', rs.id, 'sequence', rs.sequence,
                        'operand_code', rs.operand_code,
                        'operand_label', ro.label,
                        'data_type', ro.data_type,
                        'operator_code', rs.operator_code,
                        'operator_symbol', op.symbol,
                        'operator_label', op.label,
                        'value', rs.value, 'value_label', rs.value_label,
                        'negate', rs.negate) ORDER BY rs.sequence)
                FROM rule_statements rs
                LEFT JOIN rule_operands ro ON ro.code = rs.operand_code
                LEFT JOIN rule_operators op ON op.code = rs.operator_code
               WHERE rs.rule_id = r.id), '[]'::jsonb) AS statements
      FROM rules r
      JOIN ticket_types tt ON tt.id = r.ticket_type_id
      JOIN service_codes sc ON sc.id = r.service_code_id
      JOIN contractors ct ON ct.id = sc.contractor_id
      JOIN contracts k ON k.id = r.contract_id
      LEFT JOIN LATERAL adms_rate_for(sc.id, current_date) rt ON true
      LEFT JOIN unit_types ut ON ut.code = rt.unit_type
"""


@router.get("/projects/{project_id}/rules")
async def list_rules(ctx: ProjectContext, user: CurrentUser,
                     ticket_type_id: Optional[uuid.UUID] = None):
    where = ["r.project_id = $1", "r.deleted_at IS NULL"]
    args: list[Any] = [ctx["project"]["id"]]
    if ticket_type_id:
        args.append(ticket_type_id)
        where.append(f"r.ticket_type_id = ${len(args)}")
    async with db.read() as conn:
        recs = await conn.fetch(
            f"{_RULE_SELECT} WHERE {' AND '.join(where)} "
            f"ORDER BY tt.sort_order, r.priority, r.name", *args)
    return {"items": db.rows(recs)}


@router.get("/projects/{project_id}/rules/map")
async def rule_map(ctx: ProjectContext, user: CurrentUser):
    """The whole chain, one row per rule, plus what is not covered at all.

    A rule on its own does not answer the question a person checking a project
    actually has, which is whether every kind of work this project does reaches
    an invoice under the right code, rate, contract and contractor. That needs
    the chain in one row and it needs the gaps named next to it."""
    project_id = ctx["project"]["id"]
    async with db.read() as conn:
        rows = await conn.fetch(
            """
            SELECT * FROM rule_map
             WHERE project_id = $1
             ORDER BY cardinality(problems) DESC, ticket_type_label,
                      priority, rule_name
            """, project_id)
        readiness = await conn.fetchrow(
            "SELECT unruled_ticket_types, unruled_service_codes, "
            "       ready_for_field, ready_for_billing "
            "  FROM project_readiness_summary WHERE project_id = $1", project_id)
        codes = await conn.fetch(
            """
            SELECT sc.id, sc.code, sc.name, ct.name AS contractor_name,
                   r.amount AS rate_amount, ut.abbreviation AS unit_abbrev
              FROM service_codes sc
              JOIN contractors ct ON ct.id = sc.contractor_id
              LEFT JOIN LATERAL adms_rate_for(sc.id, current_date) r ON true
              LEFT JOIN unit_types ut ON ut.code = r.unit_type
             WHERE sc.project_id = $1 AND sc.is_active AND sc.deleted_at IS NULL
               AND NOT EXISTS (SELECT 1 FROM rules ru
                                WHERE ru.service_code_id = sc.id
                                  AND ru.is_active AND ru.deleted_at IS NULL)
             ORDER BY sc.code
            """, project_id)

    items = db.rows(rows)
    summary = db.row(readiness) or {}
    return {
        "items": items,
        "total": len(items),
        "unruled_ticket_types": summary.get("unruled_ticket_types") or [],
        "unruled_service_codes": db.rows(codes),
        "ready_for_field": summary.get("ready_for_field"),
        "ready_for_billing": summary.get("ready_for_billing"),
        "with_problems": sum(1 for i in items if i["problems"]),
    }


@router.get("/rules/{rule_id}")
async def get_rule(rule_id: uuid.UUID, user: CurrentUser):
    async with db.read() as conn:
        rec = await conn.fetchrow(
            f"{_RULE_SELECT} WHERE r.id = $1 AND r.deleted_at IS NULL", rule_id)
    if rec is None:
        raise not_found("Rule")
    return db.row(rec)


async def _write_statements(conn, rule_id: uuid.UUID,
                            statements: list[StatementBody]) -> None:
    await conn.execute("DELETE FROM rule_statements WHERE rule_id = $1", rule_id)
    for seq, st in enumerate(statements, start=1):
        await conn.execute(
            """
            INSERT INTO rule_statements (rule_id, sequence, operand_code,
                                         operator_code, value, value_label, negate)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            """,
            rule_id, seq, st.operand_code, st.operator_code,
            st.value, st.value_label, st.negate)


@router.post("/projects/{project_id}/rules", status_code=201)
async def create_rule(ctx: ProjectContext, body: RuleBody, user: CurrentUser,
                      _: dict = Depends(require_permission("rule.manage"))):
    """A rule cannot be saved without a service code and a contract; the
    database enforces both, plus that each belongs to this project."""
    payload = body.model_dump(exclude={"statements"}, exclude_none=True)
    payload["project_id"] = ctx["project"]["id"]
    payload["created_by"] = user["id"]
    sql, args = db.build_insert("rules", payload, returning="id")
    async with db.tx(user) as conn:
        rule_id = await conn.fetchval(sql, *args)
        await _write_statements(conn, rule_id, body.statements)
        rec = await conn.fetchrow(f"{_RULE_SELECT} WHERE r.id = $1", rule_id)
    return db.row(rec)


class RuleSet(BaseModel):
    """A set of rules written together, or not at all."""
    rules: list[RuleBody] = Field(min_length=1, max_length=25)


@router.post("/projects/{project_id}/rules/batch", status_code=201)
async def create_rule_set(ctx: ProjectContext, body: RuleSet, user: CurrentUser,
                          _: dict = Depends(require_permission("rule.manage"))):
    """Write several rules as one unit.

    An if/else is two rows: the branch that wins carries stop_on_match, the
    fallback sits behind it at the same transaction_sequence, and the pair only
    means anything together. Writing them with two POSTs leaves a window where
    the "if" exists without its "else", which on a live project means every
    ticket the else was meant to catch quietly bills nothing. So they go in one
    transaction and the database refuses or accepts the whole set.

    The same applies to a haul and the tipping fee that follows it: two rules,
    different sequences, one intent, and half of it is worse than none."""
    project_id = ctx["project"]["id"]

    names = [r.name for r in body.rules]
    if len(set(names)) != len(names):
        raise bad_request(
            "Two rules in this set share a name, and a name is unique on a "
            "project. Say what each one does differently.",
            code="duplicate_rule_name")

    written: list[dict[str, Any]] = []
    async with db.tx(user) as conn:
        for rule in body.rules:
            payload = rule.model_dump(exclude={"statements"}, exclude_none=True)
            payload["project_id"] = project_id
            payload["created_by"] = user["id"]
            sql, args = db.build_insert("rules", payload, returning="id")
            rule_id = await conn.fetchval(sql, *args)
            await _write_statements(conn, rule_id, rule.statements)
            written.append(rule_id)
        recs = await conn.fetch(
            f"{_RULE_SELECT} WHERE r.id = ANY($1::uuid[]) "
            f"ORDER BY r.transaction_sequence, r.priority", written)

    items = db.rows(recs)
    return {
        "items": items,
        "written": len(items),
        "summary": (
            f"{len(items)} rule{'s' if len(items) != 1 else ''} written: "
            + ", ".join(i["name"] for i in items)),
    }


@router.put("/rules/{rule_id}")
async def update_rule(rule_id: uuid.UUID, body: RuleBody, user: CurrentUser,
                      _: dict = Depends(require_permission("rule.manage"))):
    payload = body.model_dump(exclude={"statements"}, exclude_none=True)
    sql, args = db.build_update("rules", payload, "id = $1 AND deleted_at IS NULL",
                                [rule_id], returning="id")
    async with db.tx(user) as conn:
        found = await conn.fetchval(sql, *args)
        if found is None:
            raise not_found("Rule")
        await _write_statements(conn, rule_id, body.statements)
        rec = await conn.fetchrow(f"{_RULE_SELECT} WHERE r.id = $1", rule_id)
    return db.row(rec)


@router.patch("/rules/{rule_id}")
async def patch_rule(rule_id: uuid.UUID, user: CurrentUser,
                     payload: dict[str, Any] = Body(...),
                     _: dict = Depends(require_permission("rule.manage"))):
    """Change one link in the chain without rewriting the rule.

    PUT replaces the statements, which is right when somebody is editing the
    conditions and wrong when they are fixing a service code from the map. The
    conditions are the part nobody wants silently cleared, so this leaves them
    exactly where they are."""
    allowed = {"name", "description", "ticket_type_id", "service_code_id",
               "contract_id", "priority", "transaction_sequence", "is_active",
               "stop_on_match", "match_mode", "quantity_override",
               "effective_from", "effective_to"}
    data = {k: v for k, v in payload.items() if k in allowed}
    if not data:
        raise bad_request(
            "Nothing to change on this rule.", code="empty_update",
            allowed=sorted(allowed))
    sql, args = db.build_update("rules", data, "id = $1 AND deleted_at IS NULL",
                                [rule_id], returning="id")
    async with db.tx(user) as conn:
        found = await conn.fetchval(sql, *args)
        if found is None:
            raise not_found("Rule")
        rec = await conn.fetchrow(f"{_RULE_SELECT} WHERE r.id = $1", found)
    return db.row(rec)


@router.delete("/rules/{rule_id}")
async def delete_rule(rule_id: uuid.UUID, user: CurrentUser,
                      _: dict = Depends(require_permission("rule.manage"))):
    """A rule that has priced work is retired, never removed.

    Every transaction names the rule that made it, and a transaction whose rule
    vanished cannot be explained to an auditor. Retiring stops it matching new
    tickets and leaves the explanation in place. The walkthrough reported this
    as "I was only able to retire the rule", because both outcomes returned the
    same silent 204: the response now says which one happened and why."""
    async with db.tx(user) as conn:
        priced = int(await conn.fetchval(
            "SELECT count(*) FROM transactions WHERE rule_id = $1", rule_id) or 0)
        rec = await conn.fetchrow(
            "UPDATE rules SET deleted_at = now(), is_active = false "
            "WHERE id = $1 AND deleted_at IS NULL RETURNING name", rule_id)
        if rec is None:
            raise not_found("Rule")

    if priced:
        return {
            "rule": rec["name"], "outcome": "retired", "transactions": priced,
            "message": (
                f"Retired. This rule priced {priced} transaction"
                f"{'s' if priced != 1 else ''}, so it stops matching new tickets "
                f"and every transaction it made still names it."),
        }
    return {
        "rule": rec["name"], "outcome": "removed", "transactions": 0,
        "message": "Removed. This rule never priced anything.",
    }


@router.post("/rules/{rule_id}/test")
async def test_rule(rule_id: uuid.UUID, user: CurrentUser,
                    limit: int = Query(25, le=200),
                    _: dict = Depends(require_permission("rule.manage"))):
    """Dry run: which of this project's completed tickets would this rule
    match, and what would each be worth? Writes nothing."""
    async with db.read() as conn:
        rule = await conn.fetchrow(
            f"{_RULE_SELECT} WHERE r.id = $1 AND r.deleted_at IS NULL", rule_id)
        if rule is None:
            raise not_found("Rule")

        candidates = await conn.fetch(
            """
            SELECT t.id, t.ticket_number, t.debris_type, t.status,
                   te.billable_cubic_yards, te.net_tons, te.haul_miles,
                   adms_rule_matches(t.id, $1) AS matches
              FROM tickets t
              JOIN ticket_evaluation te ON te.ticket_id = t.id
             WHERE t.project_id = $2 AND t.ticket_type_id = $3
               AND t.status = 'completed' AND NOT t.is_void AND t.deleted_at IS NULL
             ORDER BY t.completed_at DESC NULLS LAST
             LIMIT $4
            """,
            rule_id, rule["project_id"], rule["ticket_type_id"], limit)

        matched = [dict(c) for c in candidates if c["matches"]]
        for m in matched:
            m["quantity"] = float(await conn.fetchval(
                "SELECT adms_quantity_for($1, $2)", m["id"],
                rule["unit_type"] or "per_each") or 0)
            m["amount"] = round(m["quantity"] * float(rule["rate_amount"] or 0), 2)

    return {
        "rule": db.row(rule),
        "sampled": len(candidates),
        "matched": len(matched),
        "estimated_total": round(sum(m["amount"] for m in matched), 2),
        "matches": matched[:limit],
    }


# ---------------------------------------------------------------------------
# Transactions
# ---------------------------------------------------------------------------
@router.get("/projects/{project_id}/transactions")
async def list_transactions(
    ctx: ProjectContext, paging: Paging, user: CurrentUser,
    contractor_id: Optional[uuid.UUID] = None,
    service_code_id: Optional[uuid.UUID] = None,
    invoice_status: Optional[str] = Query(None, description="uninvoiced | invoiced"),
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    _: dict = Depends(require_permission("transaction.read")),
):
    where = ["project_id = $1"]
    args: list[Any] = [ctx["project"]["id"]]
    if contractor_id:
        args.append(contractor_id)
        where.append(
            f"contractor_name = (SELECT name FROM contractors WHERE id = ${len(args)})")
    if service_code_id:
        args.append(service_code_id)
        where.append(
            f"service_code = (SELECT code FROM service_codes WHERE id = ${len(args)})")
    if invoice_status == "uninvoiced":
        where.append("invoice_id IS NULL")
    elif invoice_status == "invoiced":
        where.append("invoice_id IS NOT NULL")
    if date_from:
        args.append(date_from)
        where.append(f"computed_at >= ${len(args)}::date")
    if date_to:
        args.append(date_to)
        where.append(f"computed_at < (${len(args)}::date + 1)")

    clause = " AND ".join(where)
    async with db.read() as conn:
        total = await conn.fetchval(
            f"SELECT count(*) FROM transaction_ledger WHERE {clause}", *args)
        summary = await conn.fetchrow(
            f"SELECT COALESCE(SUM(amount), 0) AS total_amount, "
            f"       COALESCE(SUM(quantity), 0) AS total_quantity "
            f"  FROM transaction_ledger WHERE {clause}", *args)
        recs = await conn.fetch(
            f"SELECT * FROM transaction_ledger WHERE {clause} "
            f"ORDER BY computed_at DESC LIMIT ${len(args)+1} OFFSET ${len(args)+2}",
            *args, paging["limit"], paging["offset"])
    page = db.Page.of(db.rows(recs), total, paging["limit"], paging["offset"])
    page["summary"] = db.row(summary)
    return page


@router.post("/transactions/{transaction_id}/reverse")
async def reverse_transaction(transaction_id: uuid.UUID, user: CurrentUser,
                              payload: dict[str, Any] = Body(...),
                              _: dict = Depends(require_permission("transaction.reverse"))):
    reason = payload.get("reason")
    if not reason:
        raise bad_request("A reason is required to reverse a transaction")
    async with db.tx({**user, "reason": reason}) as conn:
        new_id = await conn.fetchval(
            "SELECT adms_reverse_transaction($1, $2, $3)",
            transaction_id, reason, user["id"])
        rec = await conn.fetchrow(
            "SELECT * FROM transaction_ledger WHERE id = $1", new_id)
    return db.row(rec)


# ---------------------------------------------------------------------------
# Invoices
# ---------------------------------------------------------------------------
class InvoiceBody(BaseModel):
    contractor_id: uuid.UUID
    contract_id: uuid.UUID
    period_start: Optional[date] = None
    period_end: Optional[date] = None
    notes: Optional[str] = None
    include_uninvoiced: bool = True


@router.get("/projects/{project_id}/invoices")
async def list_invoices(ctx: ProjectContext, user: CurrentUser,
                        _: dict = Depends(require_permission("invoice.manage"))):
    async with db.read() as conn:
        recs = await conn.fetch(
            """
            SELECT i.*, c.name AS contractor_name, k.contract_number,
                   (SELECT count(*) FROM invoice_lines il WHERE il.invoice_id = i.id)
                       AS line_count
              FROM invoices i
              JOIN contractors c ON c.id = i.contractor_id
              JOIN contracts k ON k.id = i.contract_id
             WHERE i.project_id = $1 ORDER BY i.created_at DESC
            """, ctx["project"]["id"])
    return {"items": db.rows(recs)}


@router.post("/projects/{project_id}/invoices", status_code=201)
async def create_invoice(ctx: ProjectContext, body: InvoiceBody, user: CurrentUser,
                         _: dict = Depends(require_permission("invoice.manage"))):
    """Builds an invoice from every uninvoiced transaction in the period. Lines
    reference transactions; the transactions themselves are never touched."""
    pid = ctx["project"]["id"]
    async with db.tx(user) as conn:
        number = await conn.fetchval(
            "SELECT adms_next_number($1, 'INV-')", f"invoice:{pid}")
        invoice = await conn.fetchrow(
            """
            INSERT INTO invoices (invoice_number, project_id, contractor_id,
                                  contract_id, period_start, period_end, notes,
                                  created_by)
            VALUES ($1, $2, $3, $4, $5::date, $6::date, $7, $8) RETURNING *
            """,
            number, pid, body.contractor_id, body.contract_id,
            body.period_start, body.period_end, body.notes, user["id"])

        line_count = 0
        if body.include_uninvoiced:
            candidates = await conn.fetch(
                """
                SELECT tx.id, tx.amount FROM transactions tx
                  JOIN tickets t ON t.id = tx.ticket_id
             LEFT JOIN invoice_lines il ON il.transaction_id = tx.id
                 WHERE tx.project_id = $1 AND tx.contractor_id = $2
                   AND tx.contract_id = $3 AND il.id IS NULL
                   AND ($4::date IS NULL OR t.completed_at::date >= $4::date)
                   AND ($5::date IS NULL OR t.completed_at::date <= $5::date)
                 ORDER BY tx.computed_at
                """,
                pid, body.contractor_id, body.contract_id,
                body.period_start, body.period_end)
            for n, cand in enumerate(candidates, start=1):
                await conn.execute(
                    "INSERT INTO invoice_lines (invoice_id, transaction_id, "
                    "line_number, amount) VALUES ($1, $2, $3, $4)",
                    invoice["id"], cand["id"], n, cand["amount"])
            line_count = len(candidates)

        full = await conn.fetchrow("SELECT * FROM invoices WHERE id = $1", invoice["id"])
    return {**db.row(full), "line_count": line_count}


@router.get("/invoices/{invoice_id}")
async def get_invoice(invoice_id: uuid.UUID, user: CurrentUser,
                      _: dict = Depends(require_permission("invoice.manage"))):
    async with db.read() as conn:
        invoice = await conn.fetchrow(
            """
            SELECT i.*, c.name AS contractor_name, k.contract_number, k.title,
                   p.name AS project_name, cl.name AS client_name
              FROM invoices i
              JOIN contractors c ON c.id = i.contractor_id
              JOIN contracts k ON k.id = i.contract_id
              JOIN projects p ON p.id = i.project_id
              JOIN clients cl ON cl.id = p.client_id
             WHERE i.id = $1
            """, invoice_id)
        if invoice is None:
            raise not_found("Invoice")
        lines = await conn.fetch(
            """
            SELECT il.*, tl.transaction_number, tl.ticket_id, tl.ticket_number,
                   tl.service_code, tl.service_code_name, tl.quantity,
                   tl.unit_abbrev, tl.rate_amount, tl.rule_name,
                   -- A line whose transaction has since been reversed and
                   -- recomputed is the case D7 found: the ledger moved and the
                   -- invoice went on reading its old total.
                   tl.superseded_at, (tl.superseded_at IS NULL) AS is_live
              FROM invoice_lines il
              JOIN transaction_ledger tl ON tl.id = il.transaction_id
             WHERE il.invoice_id = $1 ORDER BY il.line_number
            """, invoice_id)
        rollup = await conn.fetch(
            """
            SELECT tl.service_code, tl.service_code_name, tl.unit_abbrev,
                   SUM(tl.quantity) AS quantity, SUM(il.amount) AS amount,
                   count(*) AS lines
              FROM invoice_lines il
              JOIN transaction_ledger tl ON tl.id = il.transaction_id
             WHERE il.invoice_id = $1
             GROUP BY 1, 2, 3 ORDER BY 1
            """, invoice_id)
        integrity = await conn.fetchrow(
            "SELECT * FROM invoice_integrity WHERE invoice_id = $1", invoice_id)
    return {"invoice": db.row(invoice), "lines": db.rows(lines),
            "by_service_code": db.rows(rollup),
            "integrity": db.row(integrity)}


# draft -> submitted -> approved -> paid, with rejected hanging off submitted
# and reopening to draft. The walkthrough found the last two missing: "no
# reason was required. And no opportunity to reopen and fix it to resubmit
# later exists."
_INVOICE_NEXT = {
    "draft": {"submitted", "void"},
    "submitted": {"approved", "rejected", "draft"},
    "rejected": {"draft", "void"},
    "approved": {"paid", "submitted"},
    "paid": set(),
    "void": set(),
}


@router.patch("/invoices/{invoice_id}")
async def update_invoice(invoice_id: uuid.UUID, user: CurrentUser,
                         payload: dict[str, Any] = Body(...),
                         _: dict = Depends(require_permission("invoice.manage"))):
    """Move an invoice along, adjust it, or send it back.

    Rejecting requires a reason and reopening is a real path, because an
    invoice that can only be rejected into silence leaves somebody making a
    phone call the system should have made unnecessary."""
    allowed = {"status", "notes", "adjustments", "period_start", "period_end",
               "rejection_reason", "adjustment_reason"}
    data = {k: v for k, v in payload.items() if k in allowed}
    if not data:
        raise bad_request("Nothing to change on this invoice.", code="empty_update")

    async with db.tx(user) as conn:
        current = await conn.fetchrow(
            "SELECT status, subtotal FROM invoices WHERE id = $1", invoice_id)
        if current is None:
            raise not_found("Invoice")

        target = data.get("status")
        if target and target != current["status"]:
            if target not in _INVOICE_NEXT.get(current["status"], set()):
                raise conflict(
                    f"An invoice that is {current['status']} cannot become "
                    f"{target}. From here it can be "
                    + (", ".join(sorted(_INVOICE_NEXT[current["status"]]))
                       or "left as it is") + ".",
                    code="invoice_transition_invalid",
                    allowed=sorted(_INVOICE_NEXT[current["status"]]))

            if target in ("approved", "paid"):
                await require_permission("invoice.approve")(user)
            if target == "rejected":
                await require_permission("invoice.approve")(user)
                if not (data.get("rejection_reason") or "").strip():
                    raise bad_request(
                        "Rejecting an invoice needs a reason. It is what the "
                        "person reopening it has to work from.",
                        code="rejection_reason_required")
                data["rejected_by"] = user["id"]
                data["rejected_at"] = "now()"
            if target == "draft":
                # Reopening clears the rejection so the next submission is not
                # read as still carrying it.
                data["rejection_reason"] = None
                data["rejected_at"] = None
                data["rejected_by"] = None

        if data.get("adjustments") is not None and float(data["adjustments"] or 0) != 0:
            if not (data.get("adjustment_reason") or "").strip():
                raise bad_request(
                    "An adjustment needs a line on what it is for. It appears "
                    "on the invoice the client reads.",
                    code="adjustment_reason_required")

        data.pop("approved_at", None)
        sets = {k: v for k, v in data.items()
                if k not in ("rejected_at", "approved_at")}
        sql, args = db.build_update("invoices", sets, "id = $1", [invoice_id])
        rec = await conn.fetchrow(sql, *args)
        if rec is None:
            raise not_found("Invoice")

        if target == "approved":
            await conn.execute(
                "UPDATE invoices SET approved_at = now(), approved_by = $1 "
                "WHERE id = $2", user["id"], invoice_id)
        if target == "rejected":
            await conn.execute(
                "UPDATE invoices SET rejected_at = now() WHERE id = $1", invoice_id)
        if target == "draft":
            await conn.execute(
                "UPDATE invoices SET rejected_at = NULL WHERE id = $1", invoice_id)
        if data.get("adjustments") is not None:
            await conn.execute(
                "UPDATE invoices SET total = subtotal + adjustments WHERE id = $1",
                invoice_id)
        rec = await conn.fetchrow("SELECT * FROM invoices WHERE id = $1", invoice_id)
    return db.row(rec)


@router.delete("/invoices/{invoice_id}/lines/{line_id}", status_code=204)
async def remove_invoice_line(invoice_id: uuid.UUID, line_id: uuid.UUID,
                              user: CurrentUser,
                              _: dict = Depends(require_permission("invoice.manage"))):
    """Take a line off a draft. The transaction goes back to uninvoiced, so the
    next invoice picks it up rather than it falling out of billing entirely."""
    async with db.tx(user) as conn:
        status = await conn.fetchval(
            "SELECT status FROM invoices WHERE id = $1", invoice_id)
        if status is None:
            raise not_found("Invoice")
        if status != "draft":
            raise conflict(
                f"This invoice has been {status}, so its lines are fixed. "
                f"Reopen it to draft first.",
                code="invoice_not_draft")

        gone = await conn.fetchval(
            "DELETE FROM invoice_lines WHERE id = $1 AND invoice_id = $2 "
            "RETURNING id", line_id, invoice_id)
        if gone is None:
            raise not_found("Invoice line")
    return None


# ---------------------------------------------------------------------------
# Contract line items
#
# A contract PDF is a list of priced lines. Those lines are what service codes,
# rates and rules get built from, so they live here as rows a person can accept
# or reject. The parser is a later pass; this is the structure it will feed, and
# the manual path that works without it.
# ---------------------------------------------------------------------------
_LINE_ITEM_STATUSES = {"draft", "accepted", "rejected"}


class LineItemBody(BaseModel):
    """Create shape. A line item with no description cannot be reviewed."""
    description: str = Field(min_length=2)
    line_number: Optional[int] = None
    item_code: Optional[str] = None
    unit_type_code: Optional[str] = None
    unit_price: Optional[float] = Field(default=None, ge=0)
    debris_type_code: Optional[str] = None
    service_category: Optional[str] = None
    effective_from: Optional[date] = None
    effective_to: Optional[date] = None
    source_page: Optional[int] = None
    source_text: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None


class LineItemPatch(BaseModel):
    """Update shape. Every field is optional because a review action sends one
    field and nothing else, and a partial edit must not have to resend the row."""
    description: Optional[str] = Field(default=None, min_length=2)
    line_number: Optional[int] = None
    item_code: Optional[str] = None
    unit_type_code: Optional[str] = None
    unit_price: Optional[float] = Field(default=None, ge=0)
    debris_type_code: Optional[str] = None
    service_category: Optional[str] = None
    effective_from: Optional[date] = None
    effective_to: Optional[date] = None
    source_page: Optional[int] = None
    source_text: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None


class LineItemImport(BaseModel):
    text: str = Field(min_length=1)
    dry_run: bool = True


class FromLineItems(BaseModel):
    line_item_ids: list[uuid.UUID] = Field(min_length=1)
    contractor_id: Optional[uuid.UUID] = None
    fema_category: Optional[str] = None


_LINE_ITEM_SELECT = "SELECT * FROM contract_line_item_review"
# Same rows, but the status column is this project's decision rather than
# the contract level one. 0027 has the reasoning.
_LINE_ITEM_PROJECT_SELECT = "SELECT * FROM contract_line_item_project_review"

_LINE_FIELDS = [
    tabular.Field_("line_number", ("line", "line no", "no", "number", "item no",
                                   "line number", "seq"), tabular.is_id, priority=20),
    tabular.Field_("item_code", ("item code", "code", "item", "ref", "pay item"),
                   priority=30),
    tabular.Field_("description", ("description", "item description", "scope",
                                   "work", "detail", "service"),
                   tabular.is_sentence, priority=10),
    tabular.Field_("unit_type_code", ("unit", "uom", "unit of measure", "units",
                                      "measure"), priority=40),
    tabular.Field_("unit_price", ("unit price", "price", "rate", "amount", "cost",
                                  "unit cost"), tabular.is_money, priority=15),
    tabular.Field_("debris_type_code", ("debris", "debris type", "material",
                                        "stream", "type"), priority=60),
    tabular.Field_("service_category", ("category", "service category", "class"),
                   priority=70),
]

# What people actually write in a unit column.
_UNIT_SYNONYMS = {
    "cy": "per_cubic_yard", "c.y.": "per_cubic_yard", "cubic yard": "per_cubic_yard",
    "cubic yards": "per_cubic_yard", "cuyd": "per_cubic_yard", "yd3": "per_cubic_yard",
    "ton": "per_ton", "tons": "per_ton", "tn": "per_ton",
    "mile": "per_mile", "miles": "per_mile", "mi": "per_mile",
    "hour": "per_labor_hour", "hr": "per_labor_hour", "hrs": "per_labor_hour",
    "labor hour": "per_labor_hour", "man hour": "per_labor_hour",
    "equipment hour": "per_equip_hour", "eq hr": "per_equip_hour",
    "each": "per_each", "ea": "per_each", "ea.": "per_each",
    "unit": "per_unit", "units": "per_unit", "count": "per_unit",
    "stump": "per_unit", "tree": "per_unit",
    "inch": "per_diameter_in", "diameter inch": "per_diameter_in",
    "dia": "per_diameter_in", "in": "per_diameter_in",
    "lf": "per_linear_foot", "linear foot": "per_linear_foot",
    "linear feet": "per_linear_foot", "ft": "per_linear_foot",
    "ls": "flat_fee", "lump sum": "flat_fee", "flat": "flat_fee",
}

_DEBRIS_SYNONYMS = {
    "veg": "VEG", "vegetative": "VEG", "vegetation": "VEG", "woody": "VEG",
    "green waste": "VEG", "c&d": "CD", "c and d": "CD", "cd": "CD",
    "construction": "CD", "construction and demolition": "CD", "demo": "CD",
    "mixed": "MIXED", "hhw": "HHW", "hazardous": "HHW",
    "white goods": "WHITE", "appliances": "WHITE", "white": "WHITE",
    "ewaste": "EWASTE", "e-waste": "EWASTE", "electronics": "EWASTE",
    "soil": "SOIL", "mud": "SOIL", "sand": "SAND",
    "vehicle": "VEHICLE", "vessel": "VEHICLE", "car": "VEHICLE",
    "stump": "STUMP", "stumps": "STUMP", "hanger": "HANGER", "hangers": "HANGER",
    "leaner": "LEANER", "leaners": "LEANER", "putrescent": "PUTRES",
}


async def _lookup_maps(conn) -> tuple[dict[str, str], dict[str, str]]:
    units = await conn.fetch("SELECT code, label, abbreviation FROM unit_types")
    debris = await conn.fetch("SELECT code, label FROM debris_types")
    unit_map = dict(_UNIT_SYNONYMS)
    for u in units:
        unit_map[u["code"].lower()] = u["code"]
        unit_map[u["label"].lower()] = u["code"]
        unit_map[u["abbreviation"].lower()] = u["code"]
    debris_map = dict(_DEBRIS_SYNONYMS)
    for d in debris:
        debris_map[d["code"].lower()] = d["code"]
        debris_map[d["label"].lower()] = d["code"]
    return unit_map, debris_map


def _resolve(value: Optional[str], table: dict[str, str]) -> Optional[str]:
    if not value:
        return None
    key = str(value).strip().lower()
    return table.get(key) or table.get(key.rstrip("s")) or None


async def _contract_or_404(conn, contract_id: uuid.UUID) -> dict[str, Any]:
    rec = await conn.fetchrow(
        "SELECT * FROM contracts WHERE id = $1 AND deleted_at IS NULL", contract_id)
    if rec is None:
        raise not_found("Contract")
    return dict(rec)


@router.get("/contracts/{contract_id}/line-items")
async def list_line_items(contract_id: uuid.UUID, user: CurrentUser,
                          status: Optional[str] = None,
                          project_id: Optional[uuid.UUID] = None,
                          _: dict = Depends(require_permission("ticket.read.project"))):
    """The contract's lines, and where a project is named, that project's view.

    A contract is a priced schedule used on project after project, so the
    accept and reject state a caller sees has to be the state on the project
    being set up. Without project_id this is the contract wide read the
    contract detail screen wants."""
    scoped = project_id is not None
    select = (_LINE_ITEM_PROJECT_SELECT if scoped else _LINE_ITEM_SELECT)
    where = ["contract_id = $1"]
    args: list[Any] = [contract_id]
    if scoped:
        args.append(project_id)
        where.append(f"project_id = ${len(args)}")
    if status:
        args.append(status)
        where.append(f"status = ${len(args)}")
    async with db.read() as conn:
        if scoped and not await conn.fetchval(
            "SELECT 1 FROM project_contracts WHERE project_id = $1 AND contract_id = $2",
            project_id, contract_id,
        ):
            raise bad_request(
                "That contract is not linked to this project yet, so there is "
                "nothing for the project to decide on.",
                code="contract_not_on_project")
        recs = await conn.fetch(
            f"{select} WHERE {' AND '.join(where)} "
            f"ORDER BY line_number NULLS LAST, created_at", *args)
    items = db.rows(recs)
    return {
        "items": items,
        "total": len(items),
        "scoped_to_project": scoped,
        "counts": {
            s: sum(1 for i in items if i["status"] == s)
            for s in ("draft", "accepted", "rejected")
        },
    }


@router.post("/contracts/{contract_id}/line-items", status_code=201)
async def create_line_item(contract_id: uuid.UUID, body: LineItemBody,
                           user: CurrentUser,
                           _: dict = Depends(require_permission("contract.manage"))):
    payload = body.model_dump(exclude_none=True)
    payload["contract_id"] = contract_id
    async with db.tx(user) as conn:
        await _contract_or_404(conn, contract_id)
        sql, args = db.build_insert("contract_line_items", payload, returning="id")
        new_id = await conn.fetchval(sql, *args)
        rec = await conn.fetchrow(f"{_LINE_ITEM_SELECT} WHERE id = $1", new_id)
    return db.row(rec)


@router.patch("/line-items/{line_item_id}")
async def update_line_item(line_item_id: uuid.UUID, body: LineItemPatch,
                           user: CurrentUser,
                           _: dict = Depends(require_permission("contract.manage"))):
    payload = body.model_dump(exclude_none=True)
    if not payload:
        raise bad_request("Nothing to change on this line item.",
                          code="empty_update")
    if body.status is not None and body.status not in _LINE_ITEM_STATUSES:
        raise bad_request(
            "A line item is draft, accepted or rejected.",
            code="line_item_status_invalid", allowed=sorted(_LINE_ITEM_STATUSES))
    if body.status in ("accepted", "rejected"):
        payload["reviewed_by"] = user["id"]
    sql, args = db.build_update("contract_line_items", payload,
                                "id = $1 AND deleted_at IS NULL", [line_item_id],
                                returning="id")
    async with db.tx(user) as conn:
        found = await conn.fetchval(sql, *args)
        if found is None:
            raise not_found("Line item")
        if body.status in ("accepted", "rejected"):
            await conn.execute(
                "UPDATE contract_line_items SET reviewed_at = now() WHERE id = $1", found)
        rec = await conn.fetchrow(f"{_LINE_ITEM_SELECT} WHERE id = $1", found)
    return db.row(rec)


@router.delete("/line-items/{line_item_id}", status_code=204)
async def remove_line_item(line_item_id: uuid.UUID, user: CurrentUser,
                           _: dict = Depends(require_permission("contract.manage"))):
    async with db.tx(user) as conn:
        await conn.execute(
            "UPDATE contract_line_items SET deleted_at = now() WHERE id = $1",
            line_item_id)
    return None


@router.post("/contracts/{contract_id}/line-items/import")
async def import_line_items(contract_id: uuid.UUID, body: LineItemImport,
                            user: CurrentUser,
                            _: dict = Depends(require_permission("contract.manage"))):
    """Takes whatever was pasted and says what it would do before doing it.

    Dry run is the default. The answer is a table the caller renders and the
    user corrects, not a count of successes and failures."""
    parsed = tabular.parse(body.text, _LINE_FIELDS)
    if not parsed.rows:
        raise bad_request(
            "Nothing readable in that paste. A block copied out of the contract "
            "spreadsheet, or one line item per line, both work.",
            code="nothing_parsed")

    async with db.read() as conn:
        await _contract_or_404(conn, contract_id)
        unit_map, debris_map = await _lookup_maps(conn)
        existing = await conn.fetch(
            "SELECT id, line_number, item_code FROM contract_line_items "
            "WHERE contract_id = $1 AND deleted_at IS NULL", contract_id)

    by_number = {r["line_number"]: r["id"] for r in existing if r["line_number"]}
    by_code = {(r["item_code"] or "").lower(): r["id"] for r in existing if r["item_code"]}

    plan: list[dict[str, Any]] = []
    for index, raw in enumerate(parsed.rows):
        problems: list[str] = []
        line_number = None
        if raw.get("line_number"):
            digits = "".join(c for c in raw["line_number"] if c.isdigit())
            line_number = int(digits) if digits else None

        unit_code = _resolve(raw.get("unit_type_code"), unit_map)
        if raw.get("unit_type_code") and not unit_code:
            problems.append(f"the unit \"{raw['unit_type_code']}\" is not one we know")

        debris_code = _resolve(raw.get("debris_type_code"), debris_map)
        if raw.get("debris_type_code") and not debris_code:
            problems.append(
                f"the debris type \"{raw['debris_type_code']}\" is not one we know")

        price = tabular.to_number(raw.get("unit_price"))
        if raw.get("unit_price") and price is None:
            problems.append(f"\"{raw['unit_price']}\" is not a price")

        description = (raw.get("description") or "").strip()
        if not description:
            problems.append("no description, so there is nothing to bill against")

        match = by_number.get(line_number) if line_number else None
        if match is None and raw.get("item_code"):
            match = by_code.get(raw["item_code"].lower())

        plan.append({
            "row": index + 1,
            "action": "skip" if problems else ("update" if match else "create"),
            "existing_id": str(match) if match else None,
            "problems": problems,
            "source_text": parsed.source_lines[index] if index < len(parsed.source_lines) else "",
            "values": {
                "line_number": line_number,
                "item_code": raw.get("item_code"),
                "description": description,
                "unit_type_code": unit_code,
                "unit_price": price,
                "debris_type_code": debris_code,
                "service_category": raw.get("service_category"),
            },
        })

    creates = [p for p in plan if p["action"] == "create"]
    updates = [p for p in plan if p["action"] == "update"]
    skips = [p for p in plan if p["action"] == "skip"]

    summary = (
        f"{parsed.describe()} "
        f"{len(creates)} would be added, {len(updates)} already on this contract "
        f"and would be updated, {len(skips)} cannot be used yet."
    )

    if body.dry_run:
        return {"dry_run": True, "summary": summary, "rows": plan,
                "columns": parsed.columns, "header": parsed.header_row,
                "unmapped_columns": parsed.unmapped}

    # One transaction. A half-imported contract never happens.
    written = 0
    async with db.tx(user) as conn:
        for p in plan:
            if p["action"] == "skip":
                continue
            values = {k: v for k, v in p["values"].items() if v is not None}
            values["source_text"] = p["source_text"]
            if p["action"] == "create":
                values["contract_id"] = contract_id
                sql, args = db.build_insert("contract_line_items", values, returning="id")
                await conn.fetchval(sql, *args)
            else:
                sql, args = db.build_update(
                    "contract_line_items", values, "id = $1",
                    [uuid.UUID(p["existing_id"])], returning="id")
                await conn.fetchval(sql, *args)
            written += 1
        recs = await conn.fetch(
            f"{_LINE_ITEM_SELECT} WHERE contract_id = $1 "
            f"ORDER BY line_number NULLS LAST, created_at", contract_id)

    return {"dry_run": False, "summary": summary, "written": written,
            "skipped": len(skips), "items": db.rows(recs)}


@router.post("/projects/{project_id}/service-codes/from-line-items", status_code=201)
async def service_codes_from_line_items(
    ctx: ProjectContext, body: FromLineItems, user: CurrentUser,
    _: dict = Depends(require_permission("service_code.manage")),
):
    """Turn accepted contract lines into billable codes, in one transaction.

    This is the manual version of the automation and the step the parser will
    feed later. Each code points back at the line it came from, and the line
    records the code it produced."""
    project_id = ctx["project"]["id"]
    created: list[dict[str, Any]] = []
    skipped: list[dict[str, Any]] = []

    async with db.tx(user) as conn:
        lines = await conn.fetch(
            """
            SELECT li.*, c.contractor_id AS contract_contractor_id,
                   c.contract_number,
                   EXISTS (SELECT 1 FROM project_contracts pc
                            WHERE pc.project_id = $2
                              AND pc.contract_id = li.contract_id) AS on_project,
                   (SELECT sc.id FROM service_codes sc
                     WHERE sc.project_id = $2
                       AND sc.contract_line_item_id = li.id
                       AND sc.deleted_at IS NULL
                     ORDER BY sc.created_at LIMIT 1) AS existing_code_id,
                   (SELECT sc.code FROM service_codes sc
                     WHERE sc.project_id = $2
                       AND sc.contract_line_item_id = li.id
                       AND sc.deleted_at IS NULL
                     ORDER BY sc.created_at LIMIT 1) AS existing_code,
                   (SELECT s2.code
                      FROM contract_line_item_decisions d2
                      JOIN service_codes s2 ON s2.id = d2.service_code_id
                     WHERE d2.contract_line_item_id = li.id
                       AND d2.project_id <> $2
                       AND d2.status = 'accepted'
                       AND s2.deleted_at IS NULL
                     ORDER BY d2.reviewed_at LIMIT 1) AS code_used_elsewhere
              FROM contract_line_items li
              JOIN contracts c ON c.id = li.contract_id
             WHERE li.id = ANY($1::uuid[]) AND li.deleted_at IS NULL
            """, list(body.line_item_ids), project_id)
        if len(lines) != len(set(body.line_item_ids)):
            raise not_found("One or more line items")

        off_project = [r for r in lines if not r["on_project"]]
        if off_project:
            raise bad_request(
                "Line items from a contract that is not linked to this project: "
                + ", ".join(sorted({r["contract_number"] for r in off_project}))
                + ". Link the contract to the project first.",
                code="contract_not_on_project")

        taken = {r["code"].lower() for r in await conn.fetch(
            "SELECT code FROM service_codes WHERE project_id = $1 AND deleted_at IS NULL",
            project_id)}

        for line in lines:
            # Already coded on this project. Saying so beats quietly minting a
            # second code with a -2 on the end that nobody asked for.
            if line["existing_code_id"] is not None:
                skipped.append({
                    "line_item_id": str(line["id"]),
                    "line_number": line["line_number"],
                    "service_code": line["existing_code"],
                    "reason": (f"Already billed on this project as "
                               f"{line['existing_code']}."),
                })
                await _record_decision(conn, project_id, line["id"], "accepted",
                                       line["existing_code_id"], user["id"])
                continue

            contractor_id = body.contractor_id or line["contract_contractor_id"]
            code = _code_for(line, taken, line["code_used_elsewhere"])
            taken.add(code.lower())
            name = (line["description"] or "").strip()
            rec = await conn.fetchrow(
                """
                INSERT INTO service_codes (project_id, code, name, contractor_id,
                                           description, fema_category,
                                           contract_id, contract_line_item_id)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id
                """,
                project_id, code, name[:120], contractor_id,
                name if len(name) > 120 else None, body.fema_category,
                line["contract_id"], line["id"])

            if line["unit_price"] is not None and line["unit_type_code"]:
                await conn.execute(
                    """
                    INSERT INTO rates (service_code_id, amount, unit_type,
                                       effective_from, notes)
                    VALUES ($1, $2, $3, COALESCE($4::date, current_date), $5)
                    """,
                    rec["id"], line["unit_price"], line["unit_type_code"],
                    line["effective_from"],
                    f"Opening rate from contract line {line['line_number'] or line['item_code']}")

            await _record_decision(conn, project_id, line["id"], "accepted",
                                   rec["id"], user["id"])

            # The contract level columns stay as curation and provenance: the
            # first project to accept a line is what the parser ranking pass
            # reads later. They no longer gate any project, so they are only
            # written where they are still empty.
            await conn.execute(
                """
                UPDATE contract_line_items
                   SET status = CASE WHEN status = 'draft' THEN 'accepted'
                                     ELSE status END,
                       accepted_service_code_id =
                           COALESCE(accepted_service_code_id, $2),
                       reviewed_by = COALESCE(reviewed_by, $3),
                       reviewed_at = COALESCE(reviewed_at, now())
                 WHERE id = $1
                """, line["id"], rec["id"], user["id"])

            full = await conn.fetchrow(f"{_SERVICE_CODE_SELECT} WHERE sc.id = $1", rec["id"])
            created.append(db.row(full))

    return {"items": created, "created": len(created),
            "skipped": skipped, "reused": len(skipped)}


async def _record_decision(conn, project_id, line_item_id, status,
                           service_code_id, actor_id) -> None:
    """One decision per project and line, written or replaced in place.

    A decision on one project says nothing about the same line on another, so
    this never touches a sibling row. 0027 is where that reasoning lives."""
    await conn.execute(
        """
        INSERT INTO contract_line_item_decisions
            (project_id, contract_line_item_id, status, service_code_id,
             reviewed_by, reviewed_at)
        VALUES ($1, $2, $3, $4, $5, now())
        ON CONFLICT (project_id, contract_line_item_id) DO UPDATE
           SET status = EXCLUDED.status,
               service_code_id = EXCLUDED.service_code_id,
               reviewed_by = EXCLUDED.reviewed_by,
               reviewed_at = now()
        """, project_id, line_item_id, status, service_code_id, actor_id)


def _code_for(line: dict[str, Any], taken: set[str],
              used_elsewhere: Optional[str] = None) -> str:
    """A short, stable code for a contract line.

    Codes are unique per project and only per project, so the same contract
    line is free to carry the same code on every project it is billed on. That
    is the first choice here: a line already billing as ROW-VEG somewhere else
    comes up as ROW-VEG again rather than being renamed for no reason. Failing
    that, the contract's own item code, because a pay item number is what
    people look for on an invoice. Failing that, the debris stream."""
    if used_elsewhere and used_elsewhere.lower() not in taken:
        return used_elsewhere

    raw = (line["item_code"] or "").strip().upper()
    # A pay item reads 2.02, not 202. Keeping the separator keeps it findable
    # in the PDF it came from.
    base = "-".join(part for part in re.split(r"[^A-Za-z0-9]+", raw) if part)
    if not base:
        parts = [line["debris_type_code"] or "SVC"]
        if line["line_number"]:
            parts.append(str(line["line_number"]))
        base = "-".join(parts)
    base = base[:28] or "SVC"
    code = base
    suffix = 2
    while code.lower() in taken:
        code = f"{base}-{suffix}"
        suffix += 1
    return code


class LineItemDecision(BaseModel):
    """What a project says about one contract line. Accepting is done by
    generating the service code, so only these two land here."""
    status: str
    notes: Optional[str] = None


@router.post("/projects/{project_id}/line-items/{line_item_id}/decision")
async def decide_line_item(ctx: ProjectContext, line_item_id: uuid.UUID,
                           body: LineItemDecision, user: CurrentUser,
                           _: dict = Depends(require_permission("service_code.manage"))):
    """Reject a line on this project, or put it back on the table.

    Rejecting used to be written on the line item itself, which meant a line
    ruled out on one declaration was ruled out on every project that contract
    ever touched. A rejection is a project's call and stays with the project."""
    project_id = ctx["project"]["id"]
    if body.status not in ("rejected", "draft"):
        raise bad_request(
            "A project rejects a line or puts it back to draft. Accepting is "
            "done by generating the service code, so the code and the decision "
            "are written together.",
            code="line_item_decision_invalid", allowed=["rejected", "draft"])

    async with db.tx(user) as conn:
        line = await conn.fetchrow(
            """
            SELECT li.id, li.contract_id,
                   EXISTS (SELECT 1 FROM project_contracts pc
                            WHERE pc.project_id = $2 AND pc.contract_id = li.contract_id)
                       AS on_project,
                   (SELECT sc.code FROM service_codes sc
                     WHERE sc.project_id = $2 AND sc.contract_line_item_id = li.id
                       AND sc.deleted_at IS NULL LIMIT 1) AS existing_code
              FROM contract_line_items li
             WHERE li.id = $1 AND li.deleted_at IS NULL
            """, line_item_id, project_id)
        if line is None:
            raise not_found("Line item")
        if not line["on_project"]:
            raise bad_request(
                "That line belongs to a contract that is not linked to this "
                "project.", code="contract_not_on_project")
        if line["existing_code"]:
            raise bad_request(
                f"This line is already billing on this project as "
                f"{line['existing_code']}. Retire that service code first, and "
                f"the line goes back on the table.",
                code="line_item_already_billing")

        if body.status == "draft":
            await conn.execute(
                "DELETE FROM contract_line_item_decisions "
                "WHERE project_id = $1 AND contract_line_item_id = $2",
                project_id, line_item_id)
        else:
            await _record_decision(conn, project_id, line_item_id, "rejected",
                                   None, user["id"])
            if body.notes:
                await conn.execute(
                    "UPDATE contract_line_item_decisions SET notes = $3 "
                    "WHERE project_id = $1 AND contract_line_item_id = $2",
                    project_id, line_item_id, body.notes)

        rec = await conn.fetchrow(
            f"{_LINE_ITEM_PROJECT_SELECT} WHERE id = $1 AND project_id = $2",
            line_item_id, project_id)
    return db.row(rec)


# ---------------------------------------------------------------------------
# Contract intake staging (Phase 6)
#
# Dropping a contract PDF registers the link and stages it. Nothing reads the
# file yet, and the interface says so rather than implying otherwise. What this
# does buy now is the review surface: proposed line items can be seeded by hand,
# accepted or rejected, and turned into service codes, so the parser later drops
# into a path that already works end to end.
# ---------------------------------------------------------------------------
class IngestionCreate(BaseModel):
    document_id: Optional[uuid.UUID] = None
    title: Optional[str] = None
    url: Optional[str] = None
    provider: str = "sharepoint"
    notes: Optional[str] = None


class ProposalBody(BaseModel):
    """A line item as a parser would propose it, or as a person seeds one."""
    description: str = Field(min_length=2)
    line_number: Optional[int] = None
    item_code: Optional[str] = None
    unit_type_code: Optional[str] = None
    unit_price: Optional[float] = Field(default=None, ge=0)
    debris_type_code: Optional[str] = None
    service_category: Optional[str] = None
    source_page: Optional[int] = None
    source_text: Optional[str] = None
    extraction_confidence: Optional[float] = Field(default=None, ge=0, le=1)


_INGESTION_SELECT = """
    SELECT ci.*, d.title AS document_title, d.url AS document_url,
           d.provider, u.full_name AS uploaded_by_name,
           (SELECT count(*) FROM contract_line_items li
             WHERE li.ingestion_id = ci.id AND li.deleted_at IS NULL
               AND li.status = 'draft') AS awaiting_count
      FROM contract_ingestions ci
      LEFT JOIN documents d ON d.id = ci.document_id
      LEFT JOIN users u ON u.id = ci.uploaded_by
"""


@router.get("/contracts/{contract_id}/ingestions")
async def list_ingestions(contract_id: uuid.UUID, user: CurrentUser,
                          _: dict = Depends(require_permission("ticket.read.project"))):
    async with db.read() as conn:
        recs = await conn.fetch(
            f"{_INGESTION_SELECT} WHERE ci.contract_id = $1 ORDER BY ci.created_at DESC",
            contract_id)
    return {"items": db.rows(recs), "total": len(recs),
            "parsing_enabled": False,
            "note": ("Extraction from the PDF is a later pass. Staged documents are "
                     "registered and reviewable now, and nothing is reading them yet.")}


@router.post("/contracts/{contract_id}/ingestions", status_code=201)
async def stage_contract_document(contract_id: uuid.UUID, body: IngestionCreate,
                                  user: CurrentUser,
                                  _: dict = Depends(require_permission("contract.manage"))):
    """Registers the document link and stages it for extraction.

    The file itself stays wherever the Box or SharePoint link points. This never
    takes custody of it."""
    if not body.document_id and not (body.title and body.url):
        raise bad_request(
            "Send an existing document_id, or a title and a link to register one.",
            code="document_required")

    async with db.tx(user) as conn:
        await _contract_or_404(conn, contract_id)
        document_id = body.document_id
        if document_id is None:
            url = str(body.url).strip()
            if not url.lower().startswith(("http://", "https://")):
                raise bad_request(
                    "The contract link has to be a full http or https URL into Box, "
                    "SharePoint or wherever the PDF lives.",
                    code="document_url_invalid")
            document_id = await conn.fetchval(
                """
                INSERT INTO documents (entity_type, entity_id, kind_code, title, url,
                                       provider, created_by)
                VALUES ('contracts', $1, 'contract', $2, $3, $4, $5)
                RETURNING id
                """, contract_id, body.title, url, body.provider, user["id"])

        new_id = await conn.fetchval(
            """
            INSERT INTO contract_ingestions (contract_id, document_id, status,
                                             uploaded_by, notes)
            VALUES ($1, $2, 'parsing_not_enabled', $3, $4)
            RETURNING id
            """, contract_id, document_id, user["id"], body.notes)
        rec = await conn.fetchrow(f"{_INGESTION_SELECT} WHERE ci.id = $1", new_id)
    return db.row(rec)


@router.post("/ingestions/{ingestion_id}/proposals", status_code=201)
async def seed_proposals(ingestion_id: uuid.UUID, user: CurrentUser,
                         body: list[ProposalBody] = Body(...),
                         _: dict = Depends(require_permission("contract.manage"))):
    """Proposed line items against a staged document.

    Today these are seeded by hand, which is what lets the review screen be
    built and tested before any parser exists. Tomorrow the parser writes the
    same rows and nothing downstream changes."""
    if not body:
        raise bad_request("No proposals supplied")

    async with db.tx(user) as conn:
        ingestion = await conn.fetchrow(
            "SELECT * FROM contract_ingestions WHERE id = $1", ingestion_id)
        if ingestion is None:
            raise not_found("Ingestion")

        for item in body:
            payload = item.model_dump(exclude_none=True)
            payload["contract_id"] = ingestion["contract_id"]
            payload["ingestion_id"] = ingestion_id
            payload["status"] = "draft"
            sql, args = db.build_insert("contract_line_items", payload, returning="id")
            await conn.fetchval(sql, *args)

        await conn.execute(
            """
            UPDATE contract_ingestions
               SET proposed_count = (SELECT count(*) FROM contract_line_items
                                      WHERE ingestion_id = $1 AND deleted_at IS NULL),
                   status = 'parsed', parsed_at = now(),
                   parser_version = COALESCE(parser_version, 'seeded-by-hand')
             WHERE id = $1
            """, ingestion_id)
        rec = await conn.fetchrow(f"{_INGESTION_SELECT} WHERE ci.id = $1", ingestion_id)
    return db.row(rec)


@router.get("/ingestions/{ingestion_id}/proposals")
async def list_proposals(ingestion_id: uuid.UUID, user: CurrentUser,
                         _: dict = Depends(require_permission("ticket.read.project"))):
    async with db.read() as conn:
        recs = await conn.fetch(
            f"{_LINE_ITEM_SELECT} WHERE ingestion_id = $1 "
            f"ORDER BY line_number NULLS LAST, created_at", ingestion_id)
    items = db.rows(recs)
    return {
        "items": items, "total": len(items),
        "counts": {s: sum(1 for i in items if i["status"] == s)
                   for s in ("draft", "accepted", "rejected")},
    }


@router.post("/ingestions/{ingestion_id}/close")
async def close_ingestion(ingestion_id: uuid.UUID, user: CurrentUser,
                          _: dict = Depends(require_permission("contract.manage"))):
    """Marks the review done and records how it went, which is the accept and
    reject history a later ranking pass learns from."""
    async with db.tx(user) as conn:
        rec = await conn.fetchrow(
            """
            UPDATE contract_ingestions ci
               SET status = 'reviewed',
                   accepted_count = (SELECT count(*) FROM contract_line_items
                                      WHERE ingestion_id = ci.id AND status = 'accepted'),
                   rejected_count = (SELECT count(*) FROM contract_line_items
                                      WHERE ingestion_id = ci.id AND status = 'rejected')
             WHERE ci.id = $1
         RETURNING ci.id
            """, ingestion_id)
        if rec is None:
            raise not_found("Ingestion")
        full = await conn.fetchrow(f"{_INGESTION_SELECT} WHERE ci.id = $1", rec["id"])
    return db.row(full)


# ---------------------------------------------------------------------------
# Rules from the contract
#
# A contract line item already drives service code creation. A rule is what
# connects a service code to a transaction, and once the line item is captured
# the rule is mostly derivable from it: the code and the contract come off the
# line's own bridge, the ticket type follows from the debris stream or the unit,
# and the base conditions follow from the contractor and that stream.
#
# What is derivable is proposed. What is not is asked for. Nothing is written
# until a person says so, which is the same dry-run-then-confirm shape the line
# item import already uses, for the same reason: a generated billing rule that
# nobody read is worse than no rule at all.
# ---------------------------------------------------------------------------

# Tipping fees and other pass-through costs are deliberately NOT shaped here.
# How one is billed varies by contract: at cost, at cost plus a markup, a flat
# rate per ton, a gate fee the client pays directly. Guessing produces a rule
# that looks right and bills wrong, so these are detected, held back, and put
# in front of a person with the question named.
_PASS_THROUGH_PATTERNS = (
    "tipping", "tip fee", "tipping fee", "disposal fee", "landfill fee",
    "gate fee", "host fee", "franchise fee", "pass through", "pass-through",
    "passthrough", "pass thru", "at cost", "cost plus", "cost-plus",
    "reimbursable", "reimbursement", "markup", "mark-up",
)

# A line that prices in bands. Detected, never resolved: the boundaries are
# asked for, because reading "0 to 10 miles" out of contract prose and being
# one mile wrong is a silent pricing error on every haul.
_TIERED_PATTERNS = (
    "tier", "tiered", "band", "bracket", "bracketed", "zone rate",
    "mileage band", "per mile over", "and over", "or more", "or greater",
)
_RANGE_RE = re.compile(
    r"\b\d+(?:\.\d+)?\s*(?:to|through|thru|-|\u2013)\s*\d+(?:\.\d+)?\b")

# Debris streams whose rate sheets are written in bands as a matter of course.
# Stated in 0022: "Hangers are flat rate. Leaners and stumps are on tiers based
# on the rate sheet."
_TIERED_DEBRIS = {"STUMP", "LEANER"}

# The ticket type a unit implies where the debris stream does not say. Only the
# units that point at exactly one kind of work appear here; per_unit, per_each,
# flat_fee and per_linear_foot are all genuinely ambiguous and are asked about.
_UNIT_TO_TYPE_KIND = {
    "per_cubic_yard": "load",
    "per_ton": "load",
    "per_mile": "haul_out",
    "per_diameter_in": "unit_rate",
    "per_labor_hour": "unit_rate",
    "per_equip_hour": "unit_rate",
}

# The quantity guard a rule gets so it cannot fire on a ticket that measured
# nothing. Keyed by the unit the rate is written in.
_UNIT_TO_GUARD = {
    "per_cubic_yard": ("cubic_yards", "greater than 0 CY"),
    "per_ton":        ("tons", "greater than 0 tons"),
    "per_mile":       ("distance", "more than 0 miles"),
    "per_diameter_in": ("stump_diameter", "greater than 0 inches"),
    "per_labor_hour": ("labor_hours", "more than 0 hours"),
    "per_equip_hour": ("equipment_hours", "more than 0 hours"),
    "per_unit":       ("unit_count", "at least one counted"),
}


class RuleProposalRequest(BaseModel):
    """Dry run by default, exactly like the line item import.

    line_item_ids and service_code_ids both narrow what is proposed. Neither
    given means every active code on the project that no rule references yet,
    which is the set that can never bill as things stand."""
    line_item_ids: list[uuid.UUID] = []
    service_code_ids: list[uuid.UUID] = []
    include_ruled: bool = False
    dry_run: bool = True
    proposals: list["ConfirmedProposal"] = []


class TierBand(BaseModel):
    label: Optional[str] = None
    from_value: float = Field(default=0, ge=0)
    to_value: Optional[float] = Field(default=None, ge=0)
    amount: float = Field(ge=0)


class ConfirmedTiers(BaseModel):
    """What the person supplied for a banded line. tier_source is the
    ticket_metrics column whose value picks the band."""
    tier_source: str
    bands: list[TierBand] = Field(min_length=1)


class ConfirmedProposal(BaseModel):
    service_code_id: uuid.UUID
    ticket_type_id: uuid.UUID
    contract_id: uuid.UUID
    name: str = Field(min_length=2)
    description: Optional[str] = None
    match_mode: str = "all"
    priority: int = 100
    transaction_sequence: int = Field(default=1, ge=1)
    stop_on_match: bool = False
    statements: list[StatementBody] = []
    tiers: Optional[ConfirmedTiers] = None


RuleProposalRequest.model_rebuild()


def _looks_like(text: str, needles: tuple[str, ...]) -> Optional[str]:
    low = (text or "").lower()
    for needle in needles:
        if needle in low:
            return needle
    return None


async def _proposal_context(conn, project_id: uuid.UUID) -> dict[str, Any]:
    """Everything the derivation reads, fetched once."""
    types = await conn.fetch(
        """
        SELECT tt.id, tt.code, tt.label, tt.kind, tt.sort_order
          FROM project_ticket_types ptt
          JOIN ticket_types tt ON tt.id = ptt.ticket_type_id
         WHERE ptt.project_id = $1 AND ptt.is_active
           AND tt.is_active AND tt.billable AND NOT tt.is_system
         ORDER BY tt.sort_order, tt.label
        """, project_id)
    debris = await conn.fetch(
        "SELECT code, label, ticket_type_codes FROM debris_types")
    contracts = await conn.fetch(
        """
        SELECT pc.contract_id, c.contract_number, pc.is_primary
          FROM project_contracts pc
          JOIN contracts c ON c.id = pc.contract_id
         WHERE pc.project_id = $1
         ORDER BY pc.is_primary DESC, c.contract_number
        """, project_id)
    operands = await conn.fetch(
        "SELECT code, label, data_type FROM rule_operands WHERE is_active")
    taken = await conn.fetch(
        "SELECT name FROM rules WHERE project_id = $1 AND deleted_at IS NULL",
        project_id)
    return {
        "types": [dict(t) for t in types],
        "debris": {d["code"]: dict(d) for d in debris},
        "contracts": [dict(c) for c in contracts],
        "operands": {o["code"]: dict(o) for o in operands},
        "taken": {r["name"].lower() for r in taken},
    }


def _statement(ctx: dict[str, Any], operand: str, operator: str,
               value: Any, label: str) -> Optional[dict[str, Any]]:
    meta = ctx["operands"].get(operand)
    if meta is None:
        return None
    symbol = {"eq": "=", "in": "in", "gt": ">"}.get(operator, operator)
    return {
        "operand_code": operand, "operand_label": meta["label"],
        "operator_code": operator, "operator_symbol": symbol,
        "value": value, "value_label": label, "negate": False,
    }


def _unique_name(base: str, taken: set[str]) -> str:
    name = base[:120]
    suffix = 2
    while name.lower() in taken:
        name = f"{base[:112]} ({suffix})"
        suffix += 1
    taken.add(name.lower())
    return name


def _propose_one(code: dict[str, Any], ctx: dict[str, Any]) -> dict[str, Any]:
    """One service code in, one proposed rule out, with what is still unknown
    named rather than filled in."""
    text = " ".join(str(x) for x in (
        code.get("line_description") or code.get("name") or "",
        code.get("service_category") or "",
        code.get("item_code") or "",
        code.get("code") or "",
    ))
    debris_code = code.get("debris_type_code")
    unit = code.get("current_unit_type") or code.get("line_unit_type_code")

    needs: list[dict[str, str]] = []
    blocked: Optional[str] = None

    # ---- what kind of line is this ----------------------------------------
    kind = "standard"
    pass_hit = _looks_like(text, _PASS_THROUGH_PATTERNS)
    if pass_hit:
        kind = "pass_through"
        blocked = (
            f'This line reads as a pass-through cost ("{pass_hit}"). How one is '
            "billed varies by contract: at cost, at cost plus a markup, a flat "
            "rate, or paid by the client directly. Confirm the basis against "
            "the contract and write this rule by hand."
        )
    elif (code.get("quantity_mode") == "tiered"
          or debris_code in _TIERED_DEBRIS
          or _looks_like(text, _TIERED_PATTERNS)
          or _RANGE_RE.search(text)):
        kind = "tiered"
        needs.append({
            "field": "tier_boundaries",
            "why": ("This line prices in bands. The boundaries have to come "
                    "from the rate sheet, not from the wording of the line."),
        })

    # ---- which ticket type -------------------------------------------------
    enabled = ctx["types"]
    by_code = {t["code"]: t for t in enabled}
    by_kind: dict[str, list[dict[str, Any]]] = {}
    for t in enabled:
        by_kind.setdefault(t["kind"], []).append(t)

    candidates: list[dict[str, Any]] = []
    source = None
    debris = ctx["debris"].get(debris_code) if debris_code else None
    if debris and debris.get("ticket_type_codes"):
        candidates = [by_code[c] for c in debris["ticket_type_codes"] if c in by_code]
        if candidates:
            source = f"the {debris['label']} stream"
    if not candidates and unit in _UNIT_TO_TYPE_KIND:
        candidates = by_kind.get(_UNIT_TO_TYPE_KIND[unit], [])
        if candidates:
            source = f"the {unit.replace('_', ' ')} rate"

    ticket_type = candidates[0] if candidates else None
    if ticket_type is None:
        needs.append({
            "field": "ticket_type",
            "why": ("Nothing on this line says which ticket type bills it. "
                    "Pick the one the field will raise."),
        })
    elif len(candidates) > 1:
        needs.append({
            "field": "ticket_type",
            "why": (f"{source} bills on more than one ticket type. "
                    f"{candidates[0]['label']} is pre-filled; change it if that "
                    f"is not the one."),
        })

    # ---- the base conditions ----------------------------------------------
    statements = []
    st = _statement(ctx, "contractor", "eq", str(code["contractor_id"]),
                    code.get("contractor_name") or "this contractor")
    if st:
        statements.append(st)
    if debris_code:
        st = _statement(ctx, "debris_type", "eq", debris_code,
                        (debris or {}).get("label") or debris_code)
        if st:
            statements.append(st)
    if kind != "tiered" and code.get("quantity_mode") != "flat":
        guard = _UNIT_TO_GUARD.get(unit)
        if guard:
            st = _statement(ctx, guard[0], "gt", 0, guard[1])
            if st:
                statements.append(st)

    # ---- which contract ----------------------------------------------------
    contract_id = code.get("contract_id")
    contract_number = code.get("contract_number")
    if contract_id is None and ctx["contracts"]:
        fallback = ctx["contracts"][0]
        contract_id = fallback["contract_id"]
        contract_number = fallback["contract_number"]
        needs.append({
            "field": "contract",
            "why": (f"This code is not tied to a contract, so the project's "
                    f"primary contract {contract_number} is pre-filled."),
        })
    if contract_id is None:
        blocked = blocked or (
            "No contract is linked to this project, and a rule cannot be saved "
            "without one.")

    label = (ticket_type or {}).get("label") or "an unassigned type"
    base_name = f"{code['code']} on {label}"

    return {
        "service_code_id": str(code["id"]),
        "service_code": code["code"],
        "service_code_name": code["name"],
        "contractor_id": str(code["contractor_id"]),
        "contractor_name": code.get("contractor_name"),
        "contract_id": str(contract_id) if contract_id else None,
        "contract_number": contract_number,
        "line_item_id": str(code["contract_line_item_id"])
                        if code.get("contract_line_item_id") else None,
        "line_number": code.get("line_number"),
        "item_code": code.get("item_code"),
        "description": code.get("line_description") or code["name"],
        "unit_type_code": unit,
        "unit_abbrev": code.get("current_unit_abbrev"),
        "unit_price": (float(code["current_rate"])
                       if code.get("current_rate") is not None else None),
        "debris_type_code": debris_code,
        "quantity_mode": code.get("quantity_mode"),
        "ticket_type_id": str(ticket_type["id"]) if ticket_type else None,
        "ticket_type_label": (ticket_type or {}).get("label"),
        "ticket_type_source": source,
        "ticket_type_options": [
            {"id": str(t["id"]), "code": t["code"], "label": t["label"]}
            for t in (candidates or enabled)],
        "name": _unique_name(base_name, ctx["taken"]),
        "match_mode": "all",
        "priority": 100,
        "statements": statements,
        "kind": kind,
        "needs": needs,
        "blocked": blocked,
        "tier_source_suggestion": (
            "haul_miles" if unit == "per_mile"
            else "stump_diameter_inches" if unit == "per_diameter_in"
            else "net_tons" if unit == "per_ton"
            else "billable_cubic_yards" if unit == "per_cubic_yard"
            else None) if kind == "tiered" else None,
    }


_PROPOSAL_CODE_SELECT = """
    SELECT sc.id, sc.code, sc.name, sc.contractor_id, sc.contract_id,
           sc.contract_line_item_id, sc.quantity_mode,
           ct.name AS contractor_name,
           k.contract_number,
           li.description   AS line_description,
           li.line_number, li.item_code, li.service_category,
           li.debris_type_code,
           li.unit_type_code AS line_unit_type_code,
           r.amount AS current_rate, r.unit_type AS current_unit_type,
           ut.abbreviation AS current_unit_abbrev,
           (SELECT count(*) FROM rules ru
             WHERE ru.service_code_id = sc.id AND ru.is_active
               AND ru.deleted_at IS NULL) AS rule_count
      FROM service_codes sc
      JOIN contractors ct ON ct.id = sc.contractor_id
      LEFT JOIN contracts k ON k.id = sc.contract_id
      LEFT JOIN contract_line_items li ON li.id = sc.contract_line_item_id
      LEFT JOIN LATERAL adms_rate_for(sc.id, current_date) r ON true
      LEFT JOIN unit_types ut ON ut.code = r.unit_type
"""


@router.post("/projects/{project_id}/rules/from-line-items")
async def rules_from_line_items(
    ctx_project: ProjectContext, body: RuleProposalRequest, user: CurrentUser,
    _: dict = Depends(require_permission("rule.manage")),
):
    """Propose a rule per billable service code, then write the ones confirmed.

    Dry run is the default and is the whole point: the answer is a table
    somebody reads and corrects, not a count of rules that appeared."""
    project_id = ctx_project["project"]["id"]

    where = ["sc.project_id = $1", "sc.deleted_at IS NULL", "sc.is_active"]
    args: list[Any] = [project_id]
    if body.service_code_ids:
        args.append(list(body.service_code_ids))
        where.append(f"sc.id = ANY(${len(args)}::uuid[])")
    if body.line_item_ids:
        args.append(list(body.line_item_ids))
        where.append(f"sc.contract_line_item_id = ANY(${len(args)}::uuid[])")

    async with db.read() as conn:
        codes = await conn.fetch(
            f"{_PROPOSAL_CODE_SELECT} WHERE {' AND '.join(where)} ORDER BY sc.code",
            *args)
        ctx = await _proposal_context(conn, project_id)

    if not ctx["types"]:
        raise bad_request(
            "No billable ticket type is enabled on this project, so there is "
            "nothing for a rule to bill against. Enable the ticket types the "
            "field will raise first.",
            code="no_billable_ticket_type")

    proposals: list[dict[str, Any]] = []
    skipped: list[dict[str, Any]] = []
    for rec in codes:
        code = dict(rec)
        if code["rule_count"] and not body.include_ruled:
            skipped.append({
                "service_code": code["code"],
                "reason": (f"{code['rule_count']} rule"
                           f"{'s' if code['rule_count'] != 1 else ''} already "
                           f"reference this code."),
            })
            continue
        proposals.append(_propose_one(code, ctx))

    ready = [p for p in proposals if not p["blocked"] and not p["needs"]]
    asking = [p for p in proposals if not p["blocked"] and p["needs"]]
    held = [p for p in proposals if p["blocked"]]

    summary = (
        f"{len(proposals)} code{'s' if len(proposals) != 1 else ''} with no rule. "
        f"{len(ready)} can be written as proposed, {len(asking)} need an answer "
        f"first, {len(held)} are held back."
    )

    if body.dry_run:
        return {
            "dry_run": True, "summary": summary, "proposals": proposals,
            "skipped": skipped,
            "counts": {"proposed": len(proposals), "ready": len(ready),
                       "asking": len(asking), "held": len(held),
                       "skipped": len(skipped)},
        }

    if not body.proposals:
        raise bad_request(
            "Nothing was confirmed. Run the proposal, check what it derived, "
            "and send back the rules you want written.",
            code="nothing_confirmed")

    written: list[dict[str, Any]] = []
    async with db.tx(user) as conn:
        for confirmed in body.proposals:
            payload = confirmed.model_dump(
                exclude={"statements", "tiers"}, exclude_none=True)
            payload["project_id"] = project_id
            payload["created_by"] = user["id"]
            sql, args = db.build_insert("rules", payload, returning="id")
            rule_id = await conn.fetchval(sql, *args)
            await _write_statements(conn, rule_id, confirmed.statements)

            if confirmed.tiers:
                # A banded line is one tiered rate, not a rule per band: the
                # bands live on the rate sheet and adms_price_for already reads
                # them, so the rule stays one statement of intent.
                await conn.execute(
                    "UPDATE service_codes SET quantity_mode = 'tiered' WHERE id = $1",
                    confirmed.service_code_id)
                rate_id = await conn.fetchval(
                    "SELECT id FROM adms_rate_for($1, current_date)",
                    confirmed.service_code_id)
                if rate_id is None:
                    raise bad_request(
                        f"{confirmed.name} prices in bands but its service code "
                        f"has no rate in effect, so there is nothing to hang "
                        f"them on. Add the opening rate first.",
                        code="tiered_without_rate")
                await conn.execute(
                    "UPDATE rates SET tier_source = $2 WHERE id = $1",
                    rate_id, confirmed.tiers.tier_source)
                await conn.execute("DELETE FROM rate_tiers WHERE rate_id = $1", rate_id)
                for order, band in enumerate(confirmed.tiers.bands):
                    await conn.execute(
                        """
                        INSERT INTO rate_tiers (rate_id, label, from_value,
                                                to_value, amount, sort_order)
                        VALUES ($1, $2, $3, $4, $5, $6)
                        """,
                        rate_id, band.label, band.from_value, band.to_value,
                        band.amount, order)

            rec = await conn.fetchrow(f"{_RULE_SELECT} WHERE r.id = $1", rule_id)
            written.append(db.row(rec))

    return {"dry_run": False, "written": len(written), "items": written,
            "summary": f"{len(written)} rule"
                       f"{'s' if len(written) != 1 else ''} written."}
