"""Equipment certification, per project.

A truck is certified under a declaration, never once for all time, and the
certified capacity multiplied by the monitor's load call is the billable volume
on every load ticket. That puts this router directly under the money, and it is
why nothing here edits a row: a new measurement supersedes the one before it,
and the chain is the evidence.

The endpoint worth reading first is `/impact`. Correcting a measurement can
reprice a week of loads, and the walkthrough was explicit that this happens and
has to be visible before anyone commits to it: "someone mistakenly put a 3
instead of a 1 and it added 40CY to the trailer that hauled loads for 5 days
before our team caught it". So a correction is proposed, its cost is shown, and
only then is it written.
"""
from __future__ import annotations

import uuid
from datetime import date
from typing import Any, Optional

import asyncpg
from fastapi import APIRouter, Body, Depends, Query
from pydantic import BaseModel, Field

from .. import db
from ..deps import CurrentUser, Paging, ProjectContext, require_permission
from ..errors import bad_request, conflict, not_found

router = APIRouter(tags=["certifications"])


class CertificationBody(BaseModel):
    equipment_id: uuid.UUID
    # Optional now. Leaving it out opens a draft to be measured, which is the
    # path the requirement asks for: the capacity comes out of the worksheet
    # rather than out of somebody's head.
    certified_capacity_cy: Optional[float] = Field(default=None, gt=0)
    tare_weight_lbs: Optional[float] = Field(default=None, ge=0)
    certification_number: Optional[str] = None
    method: str = "physical"
    measured_on: Optional[date] = None
    expires_on: Optional[date] = None
    measured_by_name: Optional[str] = None
    document_id: Optional[uuid.UUID] = None
    notes: Optional[str] = None
    # Naming the row this replaces is what makes a chain a chain. A correction
    # additionally inherits its applies_from, which is how it reaches back over
    # the tickets the wrong number priced.
    supersedes_id: Optional[uuid.UUID] = None


_METHODS = {"physical", "manufacturer", "recertification", "correction"}

_CERT_SELECT = """
SELECT pec.*, e.unit_number, e.equipment_type, e.contractor_id,
       c.name AS contractor_name,
       u.full_name AS measured_by_full_name,
       d.url AS document_url, d.title AS document_title,
       m.id AS measurement_id, m.container_type_code, m.total_cubic_inches,
       m.total_cubic_yards AS measured_cubic_yards, m.section_count,
       ct.label AS container_label,
       (m.id IS NOT NULL) AS is_measured,
       -- What a correction would actually reach. A void ticket resolved to
       -- this certification once and is never repriced, so counting it here
       -- would promise more work than the impact preview reports.
       (SELECT count(*) FROM tickets t
         WHERE t.certification_id = pec.id
           AND t.deleted_at IS NULL AND NOT t.is_void) AS tickets_priced
  FROM project_equipment_certifications pec
  JOIN equipment e        ON e.id = pec.equipment_id
  LEFT JOIN contractors c ON c.id = e.contractor_id
  LEFT JOIN users u       ON u.id = pec.measured_by
  LEFT JOIN documents d   ON d.id = pec.document_id
  LEFT JOIN certification_measurements m ON m.certification_id = pec.id
  LEFT JOIN container_types ct ON ct.code = m.container_type_code
"""


@router.get("/projects/{project_id}/certifications")
async def list_certifications(
    ctx: ProjectContext, user: CurrentUser, paging: Paging,
    q: Optional[str] = Query(None, description="Unit number or certification number"),
    status: str = Query(
        "active",
        pattern="^(draft|submitted|rejected|active|superseded|revoked|open|all)$"),
    expiring_days: Optional[int] = Query(None, ge=0, le=365),
    _: dict = Depends(require_permission("equipment.manage")),
):
    """Every certification on this project.

    Defaults to the live ones, which is the answer to "how many trucks are
    certified and working this project right now" that the walkthrough could
    not get without leaving the project entirely."""
    where = ["pec.project_id = $1"]
    args: list[Any] = [ctx["project"]["id"]]

    if status == "open":
        # What is waiting on somebody: a worksheet being filled in, or one
        # submitted and not yet reviewed.
        where.append("pec.status IN ('draft', 'submitted')")
    elif status != "all":
        args.append(status)
        where.append(f"pec.status = ${len(args)}")
    if q:
        args.append(f"%{q}%")
        where.append(f"(e.unit_number ILIKE ${len(args)} "
                     f"OR pec.certification_number ILIKE ${len(args)})")
    if expiring_days is not None:
        args.append(expiring_days)
        where.append(f"pec.expires_on IS NOT NULL "
                     f"AND pec.expires_on <= current_date + ${len(args)}::integer")

    clause = " AND ".join(where)
    async with db.read() as conn:
        total = await conn.fetchval(
            f"""SELECT count(*) FROM project_equipment_certifications pec
                  JOIN equipment e ON e.id = pec.equipment_id
                 WHERE {clause}""", *args)
        rows = await conn.fetch(
            f"{_CERT_SELECT} WHERE {clause} "
            f"ORDER BY e.unit_number, pec.applies_from DESC "
            f"LIMIT ${len(args)+1} OFFSET ${len(args)+2}",
            *args, paging["limit"], paging["offset"])
        summary = await conn.fetchrow(
            """
            SELECT count(*) AS certified,
                   count(*) FILTER (WHERE is_expired) AS expired,
                   count(*) FILTER (WHERE days_to_expiry BETWEEN 0 AND 30)
                       AS expiring_soon,
                   COALESCE(sum(certified_capacity_cy), 0) AS total_capacity_cy
              FROM project_equipment_current WHERE project_id = $1
            """, ctx["project"]["id"])

    page = db.Page.of(db.rows(rows), total, paging["limit"], paging["offset"])
    page["summary"] = db.row(summary)
    return page


@router.get("/certifications/{certification_id}")
async def get_certification(certification_id: uuid.UUID, user: CurrentUser,
                            _: dict = Depends(require_permission("equipment.manage"))):
    async with db.read() as conn:
        rec = await conn.fetchrow(f"{_CERT_SELECT} WHERE pec.id = $1", certification_id)
        if rec is None:
            raise not_found("Certification")
        chain = await conn.fetch(
            f"""{_CERT_SELECT}
                WHERE pec.project_id = $1 AND pec.equipment_id = $2
                ORDER BY pec.applies_from, pec.created_at""",
            rec["project_id"], rec["equipment_id"])
    out = db.row(rec)
    out["chain"] = db.rows(chain)
    return out


@router.get("/certifications/{certification_id}/impact")
async def certification_impact(
    certification_id: uuid.UUID, user: CurrentUser,
    capacity: Optional[float] = Query(
        None, gt=0, description="Proposed capacity, to price the change before it exists"),
    _: dict = Depends(require_permission("equipment.manage")),
):
    """What changing this measurement would touch, and what it would cost.

    Answers the question in the order it gets asked: how many tickets, over what
    dates, worth how much now, and how much after. Pass `capacity` to price a
    correction that has not been written yet."""
    async with db.read() as conn:
        cert = await conn.fetchrow(
            "SELECT * FROM project_equipment_certifications WHERE id = $1",
            certification_id)
        if cert is None:
            raise not_found("Certification")

        affected = await conn.fetchrow(
            """
            SELECT count(*) AS tickets,
                   min(COALESCE(t.completed_at, t.created_at))::date AS first_day,
                   max(COALESCE(t.completed_at, t.created_at))::date AS last_day,
                   COALESCE(sum(o.billable_cubic_yards), 0) AS cubic_yards,
                   COALESCE(sum(o.transaction_total), 0)    AS billed
              FROM tickets t
              JOIN ticket_overview o ON o.id = t.id
             WHERE t.certification_id = $1 AND t.deleted_at IS NULL AND NOT t.is_void
            """, certification_id)

        locked = await conn.fetch(
            """
            SELECT DISTINCT i.invoice_number, i.status
              FROM tickets t
              JOIN transactions tx ON tx.ticket_id = t.id AND tx.superseded_at IS NULL
              JOIN invoice_lines il ON il.transaction_id = tx.id
              JOIN invoices i ON i.id = il.invoice_id
             WHERE t.certification_id = $1 AND i.status IN ('approved', 'paid')
            """, certification_id)

    out = {
        "certification_id": str(certification_id),
        "current_capacity_cy": float(cert["certified_capacity_cy"]),
        "applies_from": cert["applies_from"],
        "affected": db.row(affected),
        "locked_invoices": [r["invoice_number"] for r in locked],
    }

    if capacity is not None:
        current = float(cert["certified_capacity_cy"])
        billed = float(affected["billed"] or 0)
        # Volume scales linearly with certified capacity, so the money does too.
        # An estimate, deliberately: the exact figure comes out of the engine
        # when the tickets are actually repriced.
        factor = capacity / current if current else 0
        out["proposed_capacity_cy"] = capacity
        out["estimated_billed_after"] = round(billed * factor, 2)
        out["estimated_difference"] = round(billed * factor - billed, 2)

    return out


@router.post("/projects/{project_id}/certifications", status_code=201)
async def create_certification(ctx: ProjectContext, body: CertificationBody,
                               user: CurrentUser,
                               _: dict = Depends(require_permission("equipment.manage"))):
    """Certify a truck on this project, or supersede the certification it has.

    Nothing is repriced here. The tickets a correction reaches are queued and
    counted, because one trailer can carry a week of loads and that decision
    belongs to whoever is looking at the count."""
    if body.method not in _METHODS:
        raise bad_request(
            "A certification is measured physically, taken from the "
            "manufacturer, recertified, or corrected.",
            code="method_invalid", allowed=sorted(_METHODS))

    pid = ctx["project"]["id"]
    async with db.tx({**user, "reason": body.notes or ""}) as conn:
        linked = await conn.fetchval(
            """
            SELECT 1 FROM equipment e
              JOIN project_contractors pc ON pc.contractor_id = e.contractor_id
             WHERE e.id = $1 AND pc.project_id = $2 AND pc.is_active
               AND e.deleted_at IS NULL
            """, body.equipment_id, pid)
        if not linked:
            raise bad_request(
                "That equipment belongs to a contractor who is not on this "
                "project, so it cannot be certified here.",
                code="equipment_not_on_project")

        current = await conn.fetchrow(
            "SELECT id FROM project_equipment_certifications "
            " WHERE project_id = $1 AND equipment_id = $2 AND status = 'active'",
            pid, body.equipment_id)

        # Replacing a live certification reprices work, so the method has to
        # say which kind of replacement this is. Accepting a bare "physical"
        # over an existing measurement would move money on a word that reads
        # like a first measurement.
        if current and body.method in ("physical", "manufacturer"):
            raise conflict(
                f"{'That truck' if not body.certification_number else body.certification_number} "
                "already has a certification in force on this project. Use "
                "recertification if it was measured again, or correction if the "
                "previous number was wrong. The two reach different tickets.",
                code="already_certified",
                current_certification=str(current["id"]))

        open_draft = await conn.fetchval(
            "SELECT id FROM project_equipment_certifications "
            " WHERE project_id = $1 AND equipment_id = $2 "
            "   AND status IN ('draft', 'submitted')", pid, body.equipment_id)
        if open_draft:
            raise conflict(
                "There is already a measurement open on this unit for this "
                "project. Finish it or discard it before starting another.",
                code="measurement_in_progress",
                certification=str(open_draft))

        supersedes = body.supersedes_id or (current["id"] if current else None)
        if body.method == "correction" and not supersedes:
            raise bad_request(
                "A correction has to name the measurement it corrects.",
                code="correction_needs_target")
        if body.method == "recertification" and not supersedes:
            raise bad_request(
                "A recertification replaces a measurement, and this truck has "
                "none on this project yet. Record the first one as a physical "
                "measurement.",
                code="nothing_to_recertify")

        # No capacity means nobody has measured yet, so this opens a worksheet
        # rather than certifying anything. Nothing a draft carries prices a
        # ticket until a reviewer approves it.
        status = "active" if body.certified_capacity_cy is not None else "draft"

        try:
            rec = await conn.fetchrow(
                """
                INSERT INTO project_equipment_certifications (
                    project_id, equipment_id, certification_number,
                    certified_capacity_cy, tare_weight_lbs, method, measured_on,
                    expires_on, measured_by, measured_by_name, document_id,
                    supersedes_id, notes, status, created_by)
                VALUES ($1, $2, $3, $4, $5, $6,
                        COALESCE($7::date, current_date), $8::date, $9, $10, $11,
                        $12, $13, $14, $9)
                RETURNING *
                """,
                pid, body.equipment_id, body.certification_number,
                body.certified_capacity_cy, body.tare_weight_lbs, body.method,
                body.measured_on, body.expires_on, user["id"],
                body.measured_by_name or user["full_name"], body.document_id,
                supersedes, body.notes, status)
        except asyncpg.PostgresError as exc:
            raise bad_request(str(getattr(exc, "message", None) or exc),
                              code="certification_refused") from exc

        queued = 0
        if supersedes and status == "active":
            queued = await conn.fetchval(
                "SELECT adms_queue_reprocess('certification', $1, $2)",
                rec["id"],
                body.notes or f"Certification {body.method} for this equipment")

        # A capacity with no measurements behind it is a finding, so say so
        # here rather than waiting for the next sweep.
        if status == "active":
            await conn.execute("SELECT adms_flag_certification($1)", rec["id"])

        out = await conn.fetchrow(f"{_CERT_SELECT} WHERE pec.id = $1", rec["id"])

    result = db.row(out)
    result["tickets_queued"] = int(queued or 0)
    if status == "draft":
        result["message"] = (
            "Draft open. Measure the interior and the capacity is worked out "
            "from the measurements.")
    else:
        result["message"] = (
            f"Certified at {body.certified_capacity_cy:g} CY."
            + (f" {queued} ticket{'s' if queued != 1 else ''} now need repricing."
               if queued else "")
            + " This capacity has no measurements behind it, so it is on the "
              "review queue until somebody records them."
        )
    return result


# ---------------------------------------------------------------------------
# Field submission, and the review decision that lets a measurement price work.
#
# "Certification creation and certification review are different stages." The
# field user measures and submits; a reviewer looks at the photographs and the
# arithmetic and decides. Nothing reaches a load ticket in between.
# ---------------------------------------------------------------------------
@router.post("/certifications/{certification_id}/submit")
async def submit_certification(certification_id: uuid.UUID, user: CurrentUser,
                               payload: dict[str, Any] = Body(default={}),
                               _: dict = Depends(require_permission("equipment.manage"))):
    """Send a finished measurement for review."""
    async with db.tx({**user, "reason": payload.get("notes") or ""}) as conn:
        cert = await conn.fetchrow(
            "SELECT * FROM project_equipment_certifications WHERE id = $1",
            certification_id)
        if cert is None:
            raise not_found("Certification")
        if cert["status"] != "draft":
            raise conflict(
                f"This certification is {cert['status']}, so there is nothing "
                "to submit.", code="not_a_draft")
        if cert["certified_capacity_cy"] is None:
            raise bad_request(
                "There is no capacity yet. Measure the interior first: the "
                "number comes out of the worksheet.",
                code="nothing_measured")

        missing = await conn.fetchval(
            "SELECT missing_slots FROM certification_evidence "
            " WHERE certification_id = $1", certification_id)
        # Not a gate. Operations do not stop because a photograph is missing,
        # and the reviewer is told what is absent rather than the monitor being
        # blocked at the truck.
        await conn.execute(
            """
            UPDATE project_equipment_certifications
               SET status = 'submitted', submitted_at = now(), submitted_by = $2
             WHERE id = $1
            """, certification_id, user["id"])

        await conn.execute("SELECT adms_flag_certification($1)", certification_id)
        await conn.fetchval(
            "SELECT adms_review_item('certification', $1, $2, $3, $4, now())",
            certification_id, cert["project_id"], user["id"], user["full_name"])

        out = await conn.fetchrow(f"{_CERT_SELECT} WHERE pec.id = $1",
                                  certification_id)

    result = db.row(out)
    result["missing_photos"] = list(missing or [])
    result["message"] = (
        "Submitted for review."
        + (f" {len(missing)} required photograph"
           f"{'s are' if len(missing) != 1 else ' is'} missing, which the "
           f"reviewer will see." if missing else ""))
    return result


@router.post("/certifications/{certification_id}/approve")
async def approve_certification(certification_id: uuid.UUID, user: CurrentUser,
                                payload: dict[str, Any] = Body(default={}),
                                _: dict = Depends(require_permission("equipment.manage"))):
    """Approve a measurement, which is the moment it starts pricing loads.

    Superseding the measurement it replaces happens here rather than at entry,
    because until now nobody had looked at it."""
    notes = (payload.get("notes") or "").strip()
    async with db.tx({**user, "reason": notes}) as conn:
        cert = await conn.fetchrow(
            "SELECT * FROM project_equipment_certifications WHERE id = $1",
            certification_id)
        if cert is None:
            raise not_found("Certification")
        if cert["status"] not in ("draft", "submitted"):
            raise conflict(
                f"This certification is {cert['status']}, so there is nothing "
                "to approve.", code="not_reviewable")

        try:
            await conn.execute(
                """
                UPDATE project_equipment_certifications
                   SET status = 'active', approved_at = now(), approved_by = $2
                 WHERE id = $1
                """, certification_id, user["id"])
        except asyncpg.PostgresError as exc:
            raise bad_request(str(getattr(exc, "message", None) or exc),
                              code="approval_refused") from exc

        queued = 0
        if cert["supersedes_id"]:
            queued = await conn.fetchval(
                "SELECT adms_queue_reprocess('certification', $1, $2)",
                certification_id,
                notes or f"Certification {cert['method']} approved")

        await conn.execute("SELECT adms_flag_certification($1)", certification_id)
        await _record_decision(conn, certification_id, cert["project_id"], user,
                               "approved", notes=notes)

        out = await conn.fetchrow(f"{_CERT_SELECT} WHERE pec.id = $1",
                                  certification_id)

    result = db.row(out)
    result["tickets_queued"] = int(queued or 0)
    result["message"] = (
        f"Approved at {float(out['certified_capacity_cy']):g} CY."
        + (f" {queued} ticket{'s' if queued != 1 else ''} now need repricing."
           if queued else ""))
    return result


@router.post("/certifications/{certification_id}/reject")
async def reject_certification(certification_id: uuid.UUID, user: CurrentUser,
                               payload: dict[str, Any] = Body(...),
                               _: dict = Depends(require_permission("equipment.manage"))):
    """Refuse a measurement, with what has to be fixed.

    The worksheet stays readable. Rejecting is a decision about a measurement,
    not a way of deleting one."""
    reason = (payload.get("reason") or "").strip()
    if len(reason) < 4:
        raise bad_request(
            "Rejecting a measurement needs a line on what is wrong with it, "
            "because somebody has to go back to the truck.",
            code="reason_required")

    async with db.tx({**user, "reason": reason}) as conn:
        cert = await conn.fetchrow(
            "SELECT * FROM project_equipment_certifications WHERE id = $1",
            certification_id)
        if cert is None:
            raise not_found("Certification")
        if cert["status"] not in ("draft", "submitted"):
            raise conflict(
                f"This certification is {cert['status']}, so there is nothing "
                "to reject.", code="not_reviewable")

        await conn.execute(
            """
            UPDATE project_equipment_certifications
               SET status = 'rejected', rejected_reason = $2
             WHERE id = $1
            """, certification_id, reason)
        await _record_decision(conn, certification_id, cert["project_id"], user,
                               "flagged", notes=reason)
        out = await conn.fetchrow(f"{_CERT_SELECT} WHERE pec.id = $1",
                                  certification_id)

    result = db.row(out)
    result["message"] = "Sent back. The measurement stays on the record."
    return result


async def _record_decision(conn, certification_id, project_id, user, state,
                           notes: str = "") -> None:
    """Write the reviewer's decision onto the shared review spine.

    Certifications and tickets are decided in the same table on purpose: one
    queue, one history, one set of escalation rules."""
    item_id = await conn.fetchval(
        "SELECT adms_review_item('certification', $1, $2, $3, $4, now())",
        certification_id, project_id, user["id"], user["full_name"])
    was = await conn.fetchval("SELECT state FROM review_items WHERE id = $1",
                              item_id)
    await conn.execute(
        """
        UPDATE review_items
           SET state = $2::text,
               notes = COALESCE(NULLIF($3::text, ''), notes),
               reviewed_by = $4::uuid, reviewed_by_name = $5::text,
               reviewed_at = now()
         WHERE id = $1
        """, item_id, state, notes, user["id"], user["full_name"])
    await conn.execute(
        """
        INSERT INTO review_events (
            review_item_id, event, from_state, to_state, note,
            actor_id, actor_name)
        VALUES ($1, 'decided', $2, $3, NULLIF($4, ''), $5, $6)
        """, item_id, was, state, notes, user["id"], user["full_name"])

    if state == "approved":
        await conn.execute(
            """
            UPDATE review_flags
               SET cleared_at = now(), cleared_by = $2,
                   cleared_reason = $3
             WHERE subject_kind = 'certification' AND subject_id = $1
               AND cleared_at IS NULL
            """, certification_id, user["id"],
            f"Reviewed by {user['full_name']}")


@router.post("/certifications/{certification_id}/revoke")
async def revoke_certification(certification_id: uuid.UUID, user: CurrentUser,
                               payload: dict[str, Any] = Body(...),
                               _: dict = Depends(require_permission("equipment.manage"))):
    """Take a certification out of force without putting another in its place.

    For a truck that has left the project or a measurement nobody stands behind.
    Tickets already priced under it keep their snapshot; what changes is that
    nothing new resolves to it."""
    reason = (payload.get("reason") or "").strip()
    if len(reason) < 4:
        raise bad_request("Revoking a certification needs a reason.",
                          code="reason_required")

    async with db.tx({**user, "reason": reason}) as conn:
        rec = await conn.fetchrow(
            """
            UPDATE project_equipment_certifications
               SET status = 'revoked', superseded_at = now(),
                   superseded_reason = $2
             WHERE id = $1 AND status = 'active'
             RETURNING id
            """, certification_id, reason)
        if rec is None:
            raise conflict(
                "That certification is not the one in force, so there is "
                "nothing to revoke.", code="not_active")
        out = await conn.fetchrow(f"{_CERT_SELECT} WHERE pec.id = $1", certification_id)
    return db.row(out)
