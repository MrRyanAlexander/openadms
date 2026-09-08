"""Service codes, rates, the rule builder, transactions, and invoices."""
from __future__ import annotations

import uuid
from datetime import date
from typing import Any, Optional

from fastapi import APIRouter, Body, Depends, Query
from pydantic import BaseModel, Field

from .. import db
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
    name: str = Field(min_length=2)
    ticket_type_id: uuid.UUID
    service_code_id: uuid.UUID
    contract_id: uuid.UUID
    description: Optional[str] = None
    match_mode: str = "all"
    priority: int = 100
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


@router.delete("/rules/{rule_id}", status_code=204)
async def delete_rule(rule_id: uuid.UUID, user: CurrentUser,
                      _: dict = Depends(require_permission("rule.manage"))):
    async with db.tx(user) as conn:
        await conn.execute(
            "UPDATE rules SET deleted_at = now(), is_active = false WHERE id = $1",
            rule_id)
    return None


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
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
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
            SELECT il.*, tl.transaction_number, tl.ticket_number, tl.service_code,
                   tl.service_code_name, tl.quantity, tl.unit_abbrev,
                   tl.rate_amount, tl.rule_name
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
    return {"invoice": db.row(invoice), "lines": db.rows(lines),
            "by_service_code": db.rows(rollup)}


@router.patch("/invoices/{invoice_id}")
async def update_invoice(invoice_id: uuid.UUID, user: CurrentUser,
                         payload: dict[str, Any] = Body(...),
                         _: dict = Depends(require_permission("invoice.manage"))):
    allowed = {"status", "notes", "adjustments", "period_start", "period_end"}
    data = {k: v for k, v in payload.items() if k in allowed}
    if data.get("status") in ("approved", "paid"):
        require = require_permission("invoice.approve")
        await require(user)
        if data["status"] == "approved":
            data["approved_at"] = "now()"
    data.pop("approved_at", None)

    sql, args = db.build_update("invoices", data, "id = $1", [invoice_id])
    async with db.tx(user) as conn:
        rec = await conn.fetchrow(sql, *args)
        if rec is None:
            raise not_found("Invoice")
        if data.get("status") == "approved":
            await conn.execute(
                "UPDATE invoices SET approved_at = now(), approved_by = $1 "
                "WHERE id = $2", user["id"], invoice_id)
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
    async with db.tx(user) as conn:
        await conn.execute(
            "DELETE FROM invoice_lines WHERE id = $1 AND invoice_id = $2",
            line_id, invoice_id)
    return None
