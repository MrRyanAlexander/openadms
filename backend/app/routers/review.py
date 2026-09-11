"""Ticket review: the data manager's day.

The dashboard answers what the project produced. This answers what looks wrong,
which is the question somebody is actually working on at nine in the morning
three weeks into an event:

    "we are hunting for the issues: times that don't make sense, duplicate
     tickets ... location data that doesn't match up"

    "I spend most of my day auditing tickets for accuracy ... and then marking
     each ticket QC approved or if there is some issue"

Flags are what the system noticed. The review is what a person decided, and it
is the review that matters: a closeout package asserting that loads were
monitored is really asserting that somebody looked at them.

Nothing here blocks billing. A flagged ticket still bills and still invoices; it
is simply visible, which is the same line the permit design took.
"""
from __future__ import annotations

import uuid
from datetime import date
from typing import Any, Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field

from .. import db
from ..deps import CurrentUser, Paging, ProjectContext, require_permission
from ..errors import bad_request, not_found

router = APIRouter(tags=["review"])


class ReviewBody(BaseModel):
    state: str = Field(pattern="^(approved|flagged|resolved|pending)$")
    issue_code: Optional[str] = None
    notes: Optional[str] = None
    resolution: Optional[str] = None


class BulkReviewBody(BaseModel):
    ticket_ids: list[uuid.UUID] = Field(min_length=1, max_length=500)
    state: str = Field(pattern="^(approved|flagged|resolved)$")
    issue_code: Optional[str] = None
    notes: Optional[str] = None


@router.get("/flag-kinds")
async def flag_kinds(user: CurrentUser):
    """What the detector can raise, with the wording a reviewer reads."""
    async with db.read() as conn:
        rows = await conn.fetch(
            "SELECT * FROM ticket_flag_kinds WHERE is_active ORDER BY sort_order")
    return {"items": db.rows(rows)}


@router.get("/projects/{project_id}/review")
async def review_queue(
    ctx: ProjectContext, user: CurrentUser, paging: Paging,
    state: str = Query("pending", pattern="^(pending|approved|flagged|resolved|all)$"),
    flagged_only: bool = Query(False, description="Only tickets the detector raised something on"),
    flag_code: Optional[str] = None,
    severity: Optional[str] = Query(None, pattern="^(info|review|serious)$"),
    monitor_id: Optional[uuid.UUID] = None,
    ticket_type: Optional[str] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    q: Optional[str] = None,
    sort: str = Query("worst", pattern="^(worst|oldest|newest|value)$"),
    _: dict = Depends(require_permission("ticket.read.project")),
):
    """The work queue.

    Default view is what has not been looked at, worst first, because that is
    the order a reviewer wants at the start of a day rather than ticket order."""
    where = ["project_id = $1"]
    args: list[Any] = [ctx["project"]["id"]]

    def add(clause: str, value: Any):
        args.append(value)
        where.append(clause.format(n=len(args)))

    if state != "all":
        add("review_state = ${n}", state)
    if flagged_only:
        where.append("open_flags > 0")
    if flag_code:
        add("${n} = ANY (flag_codes)", flag_code)
    if severity:
        add("worst_severity = ${n}", severity)
    if monitor_id:
        add("monitor_id = ${n}", monitor_id)
    if ticket_type:
        add("ticket_type_code = ${n}", ticket_type)
    if date_from:
        add("completed_at >= ${n}", date_from)
    if date_to:
        add("completed_at < (${n}::date + 1)", date_to)
    if q:
        add("(ticket_number ILIKE ${n} OR unit_number ILIKE ${n} "
            "OR monitor_name ILIKE ${n})", f"%{q}%")

    order = {
        # Severity first, then the oldest work, because a serious flag on a
        # three week old ticket is the one that hurts at closeout.
        "worst": "CASE worst_severity WHEN 'serious' THEN 1 WHEN 'review' THEN 2 "
                 "WHEN 'info' THEN 3 ELSE 4 END, completed_at",
        "oldest": "completed_at",
        "newest": "completed_at DESC",
        "value": "transaction_total DESC NULLS LAST",
    }[sort]

    clause = " AND ".join(where)
    async with db.read() as conn:
        total = await conn.fetchval(
            f"SELECT count(*) FROM ticket_review_queue WHERE {clause}", *args)
        rows = await conn.fetch(
            f"SELECT * FROM ticket_review_queue WHERE {clause} "
            f"ORDER BY {order} NULLS LAST LIMIT ${len(args)+1} OFFSET ${len(args)+2}",
            *args, paging["limit"], paging["offset"])
    return db.Page.of(db.rows(rows), total, paging["limit"], paging["offset"])


@router.get("/projects/{project_id}/review/summary")
async def review_summary(ctx: ProjectContext, user: CurrentUser,
                         _: dict = Depends(require_permission("ticket.read.project"))):
    """The shape of the day: how much is unreviewed, how much is flagged, and
    what the detector is complaining about most."""
    pid = ctx["project"]["id"]
    async with db.read() as conn:
        states = await conn.fetchrow(
            """
            SELECT count(*) AS tickets,
                   count(*) FILTER (WHERE review_state = 'pending')  AS unreviewed,
                   count(*) FILTER (WHERE review_state = 'approved') AS approved,
                   count(*) FILTER (WHERE review_state = 'flagged')  AS flagged,
                   count(*) FILTER (WHERE review_state = 'resolved') AS resolved,
                   count(*) FILTER (WHERE open_flags > 0)            AS with_flags,
                   count(*) FILTER (WHERE worst_severity = 'serious') AS serious,
                   COALESCE(sum(transaction_total)
                            FILTER (WHERE review_state = 'pending'), 0)
                       AS unreviewed_value
              FROM ticket_review_queue WHERE project_id = $1
            """, pid)
        by_flag = await conn.fetch(
            """
            SELECT k.code, k.label, k.description, k.severity, k.domain,
                   count(*) AS tickets
              FROM ticket_flags f
              JOIN ticket_flag_kinds k ON k.code = f.flag_code
             WHERE f.project_id = $1 AND f.cleared_at IS NULL
             GROUP BY 1, 2, 3, 4, 5
             ORDER BY CASE k.severity WHEN 'serious' THEN 1
                                      WHEN 'review' THEN 2 ELSE 3 END,
                      count(*) DESC
            """, pid)
        last_scan = await conn.fetchval(
            "SELECT max(raised_at) FROM ticket_flags WHERE project_id = $1", pid)
    out = db.row(states)
    out["by_flag"] = db.rows(by_flag)
    out["last_scan"] = last_scan
    return out


@router.post("/projects/{project_id}/review/scan")
async def scan_project(ctx: ProjectContext, user: CurrentUser,
                       limit: int = Query(5000, le=50000),
                       _: dict = Depends(require_permission("ticket.update"))):
    """Run every detector over the project.

    Cheap to re-run and safe to re-run: a flag that is still true is left where
    it is, one that has stopped being true is cleared with a reason. So running
    this after a morning of corrections reports what the corrections fixed."""
    pid = ctx["project"]["id"]
    async with db.tx(user) as conn:
        checked = await conn.fetchval(
            """
            SELECT count(*) FROM (
                SELECT adms_flag_ticket(id) FROM tickets
                 WHERE project_id = $1 AND deleted_at IS NULL AND NOT is_void
                 ORDER BY completed_at DESC NULLS LAST LIMIT $2) s
            """, pid, limit)
        open_now = await conn.fetchrow(
            """
            SELECT count(*) AS flags,
                   count(DISTINCT ticket_id) AS tickets,
                   count(*) FILTER (WHERE severity = 'serious') AS serious
              FROM ticket_flags WHERE project_id = $1 AND cleared_at IS NULL
            """, pid)
        cleared = await conn.fetchval(
            "SELECT count(*) FROM ticket_flags "
            " WHERE project_id = $1 AND cleared_at > now() - interval '1 minute'",
            pid)

    out = db.row(open_now)
    out["tickets_checked"] = int(checked or 0)
    out["cleared_now"] = int(cleared or 0)
    out["message"] = (
        f"Checked {checked} ticket{'s' if checked != 1 else ''}. "
        f"{out['flags']} open flag{'s' if out['flags'] != 1 else ''} on "
        f"{out['tickets']} of them"
        + (f", {out['serious']} serious" if out["serious"] else "")
        + (f". {cleared} cleared since the last look." if cleared else "."))
    return out


@router.post("/tickets/{ticket_id}/review")
async def review_ticket(ticket_id: uuid.UUID, body: ReviewBody, user: CurrentUser,
                        _: dict = Depends(require_permission("ticket.update"))):
    """Record the decision on one ticket.

    Flagging has to say what is wrong, because a flag with no claim is just a
    ticket somebody moved past."""
    if body.state == "flagged" and not (body.issue_code or (body.notes or "").strip()):
        raise bad_request(
            "Flagging a ticket needs an issue or a note saying what is wrong.",
            code="issue_required")
    if body.state == "resolved" and not (body.resolution or "").strip():
        raise bad_request("Resolving needs a line on what was done.",
                          code="resolution_required")

    async with db.tx({**user, "reason": body.notes or body.resolution or ""}) as conn:
        project_id = await conn.fetchval(
            "SELECT project_id FROM tickets WHERE id = $1 AND deleted_at IS NULL",
            ticket_id)
        if project_id is None:
            raise not_found("Ticket")

        rec = await conn.fetchrow(
            """
            INSERT INTO ticket_reviews (
                ticket_id, project_id, state, issue_code, notes,
                reviewed_by, reviewed_by_name, reviewed_at,
                resolved_by, resolved_at, resolution)
            VALUES ($1::uuid, $2::uuid, $3::text, $4::text, $5::text,
                    $6::uuid, $7::text,
                    CASE WHEN $3 = 'pending' THEN NULL ELSE now() END,
                    CASE WHEN $3 = 'resolved' THEN $6::uuid ELSE NULL::uuid END,
                    CASE WHEN $3 = 'resolved' THEN now() ELSE NULL::timestamptz END,
                    $8::text)
            ON CONFLICT (ticket_id) DO UPDATE
               SET state = EXCLUDED.state,
                   issue_code = EXCLUDED.issue_code,
                   notes = COALESCE(EXCLUDED.notes, ticket_reviews.notes),
                   reviewed_by = EXCLUDED.reviewed_by,
                   reviewed_by_name = EXCLUDED.reviewed_by_name,
                   reviewed_at = EXCLUDED.reviewed_at,
                   resolved_by = EXCLUDED.resolved_by,
                   resolved_at = EXCLUDED.resolved_at,
                   resolution = COALESCE(EXCLUDED.resolution, ticket_reviews.resolution)
            RETURNING *
            """, ticket_id, project_id, body.state, body.issue_code, body.notes,
            user["id"], user["full_name"], body.resolution)

        # Approving a ticket settles the flags on it. They stay readable as
        # history; what changes is that the queue stops asking about them.
        if body.state in ("approved", "resolved"):
            await conn.execute(
                """
                UPDATE ticket_flags
                   SET cleared_at = now(), cleared_by = $2,
                       cleared_reason = $3
                 WHERE ticket_id = $1 AND cleared_at IS NULL
                """, ticket_id, user["id"],
                f"Reviewed by {user['full_name']}"
                + (f": {body.resolution or body.notes}"
                   if (body.resolution or body.notes) else ""))

        row = await conn.fetchrow(
            "SELECT * FROM ticket_review_queue WHERE ticket_id = $1", ticket_id)
    return db.row(row) or db.row(rec)


@router.post("/projects/{project_id}/review/bulk")
async def review_bulk(ctx: ProjectContext, body: BulkReviewBody, user: CurrentUser,
                      _: dict = Depends(require_permission("ticket.update"))):
    """Approve or flag a selection in one go.

    Working a queue one modal at a time is how a reviewer ends the day with a
    hundred tickets left, so the obvious case is one action."""
    if body.state == "flagged" and not (body.issue_code or (body.notes or "").strip()):
        raise bad_request(
            "Flagging needs an issue or a note saying what is wrong.",
            code="issue_required")

    pid = ctx["project"]["id"]
    async with db.tx({**user, "reason": body.notes or ""}) as conn:
        done = await conn.fetchval(
            """
            WITH targets AS (
                SELECT id FROM tickets
                 WHERE project_id = $1 AND id = ANY ($2::uuid[])
                   AND deleted_at IS NULL AND NOT is_void
            ), written AS (
                INSERT INTO ticket_reviews (
                    ticket_id, project_id, state, issue_code, notes,
                    reviewed_by, reviewed_by_name, reviewed_at)
                SELECT id, $1, $3, $4, $5, $6, $7, now() FROM targets
                ON CONFLICT (ticket_id) DO UPDATE
                   SET state = EXCLUDED.state, issue_code = EXCLUDED.issue_code,
                       notes = COALESCE(EXCLUDED.notes, ticket_reviews.notes),
                       reviewed_by = EXCLUDED.reviewed_by,
                       reviewed_by_name = EXCLUDED.reviewed_by_name,
                       reviewed_at = now()
                RETURNING ticket_id
            )
            SELECT count(*) FROM written
            """, pid, [str(t) for t in body.ticket_ids], body.state,
            body.issue_code, body.notes, user["id"], user["full_name"])

        if body.state in ("approved", "resolved"):
            await conn.execute(
                """
                UPDATE ticket_flags
                   SET cleared_at = now(), cleared_by = $3,
                       cleared_reason = $4
                 WHERE project_id = $1 AND ticket_id = ANY ($2::uuid[])
                   AND cleared_at IS NULL
                """, pid, [str(t) for t in body.ticket_ids], user["id"],
                f"Reviewed by {user['full_name']}")

    return {"reviewed": int(done or 0), "state": body.state,
            "message": f"{done} ticket{'s' if done != 1 else ''} marked {body.state}."}


@router.get("/tickets/{ticket_id}/flags")
async def ticket_flags(ticket_id: uuid.UUID, user: CurrentUser,
                       include_cleared: bool = Query(False),
                       _: dict = Depends(require_permission("ticket.read.project"))):
    """Why this ticket is in the queue, in the reviewer's words and with the
    numbers that triggered each check."""
    async with db.read() as conn:
        rows = await conn.fetch(
            f"""
            SELECT f.*, k.label, k.description, k.domain
              FROM ticket_flags f
              JOIN ticket_flag_kinds k ON k.code = f.flag_code
             WHERE f.ticket_id = $1
               {'' if include_cleared else 'AND f.cleared_at IS NULL'}
             ORDER BY CASE f.severity WHEN 'serious' THEN 1
                                      WHEN 'review' THEN 2 ELSE 3 END, k.sort_order
            """, ticket_id)
        review = await conn.fetchrow(
            "SELECT * FROM ticket_reviews WHERE ticket_id = $1", ticket_id)
    return {"flags": db.rows(rows), "review": db.row(review)}


@router.get("/projects/{project_id}/monitor-accuracy")
async def monitor_accuracy(
    ctx: ProjectContext, user: CurrentUser,
    _: dict = Depends(require_permission("ticket.read.project")),
):
    """Most accurate and least accurate, rather than most active.

    Most active is a vanity number. The question a supervisor is really asking
    is who needs retraining, and that is approval rate over reviewed work."""
    async with db.read() as conn:
        rows = await conn.fetch(
            """
            SELECT * FROM monitor_accuracy WHERE project_id = $1
             ORDER BY approval_rate ASC NULLS LAST, flagged DESC
            """, ctx["project"]["id"])
    items = db.rows(rows)
    return {
        "items": items,
        # Named rather than left to the reader, because the point of the screen
        # is the decision that follows it.
        "needs_attention": [r for r in items
                            if r["approval_rate"] is not None
                            and float(r["approval_rate"]) < 80][:5],
    }
