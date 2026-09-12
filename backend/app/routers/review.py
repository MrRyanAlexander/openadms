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
              FROM review_flags f
              JOIN ticket_flag_kinds k ON k.code = f.issue_code
             WHERE f.project_id = $1 AND f.subject_kind = 'ticket'
               AND f.cleared_at IS NULL
             GROUP BY 1, 2, 3, 4, 5
             ORDER BY CASE k.severity WHEN 'serious' THEN 1
                                      WHEN 'review' THEN 2 ELSE 3 END,
                      count(*) DESC
            """, pid)
        last_scan = await conn.fetchval(
            "SELECT max(raised_at) FROM review_flags "
            " WHERE project_id = $1 AND subject_kind = 'ticket'", pid)
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
        # Certifications are checked by the same button. A reviewer thinking
        # "re-check this project" does not mean "re-check the tickets and then
        # go and find the other screen".
        certified = await conn.fetchval(
            """
            SELECT count(*) FROM (
                SELECT adms_flag_certification(id)
                  FROM project_equipment_certifications
                 WHERE project_id = $1
                   AND status IN ('submitted', 'active', 'rejected')) s
            """, pid)

        open_now = await conn.fetchrow(
            """
            SELECT count(*) AS flags,
                   count(DISTINCT subject_id) AS tickets,
                   count(*) FILTER (WHERE severity = 'serious') AS serious
              FROM review_flags
             WHERE project_id = $1 AND subject_kind = 'ticket'
               AND cleared_at IS NULL
            """, pid)
        cleared = await conn.fetchval(
            "SELECT count(*) FROM review_flags "
            " WHERE project_id = $1 AND subject_kind = 'ticket'"
            "   AND cleared_at > now() - interval '1 minute'",
            pid)

    out = db.row(open_now)
    out["tickets_checked"] = int(checked or 0)
    out["certifications_checked"] = int(certified or 0)
    out["cleared_now"] = int(cleared or 0)
    out["message"] = (
        f"Checked {checked} ticket{'s' if checked != 1 else ''}"
        + (f" and {certified} certification{'s' if certified != 1 else ''}"
           if certified else "") + ". "
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
        subject = await conn.fetchrow(
            """
            SELECT project_id,
                   COALESCE(completed_at, destination_at, origin_at, created_at)
                       AS occurred_at
              FROM tickets WHERE id = $1 AND deleted_at IS NULL
            """, ticket_id)
        if subject is None:
            raise not_found("Ticket")

        # The review row is opened here if this is the first time anybody has
        # touched the ticket, and its age counts from when the load happened
        # rather than from this click.
        item_id = await conn.fetchval(
            "SELECT adms_review_item('ticket', $1, $2, $3, $4, $5)",
            ticket_id, subject["project_id"], user["id"], user["full_name"],
            subject["occurred_at"])
        was = await conn.fetchval(
            "SELECT state FROM review_items WHERE id = $1", item_id)

        rec = await conn.fetchrow(
            """
            UPDATE review_items
               SET state = $2::text,
                   issue_code = $3::text,
                   notes = COALESCE($4::text, notes),
                   reviewed_by = $5::uuid,
                   reviewed_by_name = $6::text,
                   reviewed_at = CASE WHEN $2 = 'pending'
                                      THEN NULL ELSE now() END,
                   resolved_by = CASE WHEN $2 = 'resolved'
                                      THEN $5::uuid ELSE NULL::uuid END,
                   resolved_at = CASE WHEN $2 = 'resolved'
                                      THEN now() ELSE NULL::timestamptz END,
                   resolution = COALESCE($7::text, resolution),
                   reopened_count = reopened_count
                       + CASE WHEN $2 = 'pending' AND state <> 'pending'
                              THEN 1 ELSE 0 END
             WHERE id = $1
            RETURNING *, subject_id AS ticket_id
            """, item_id, body.state, body.issue_code, body.notes,
            user["id"], user["full_name"], body.resolution)

        # The decision itself is history now, not a column that gets written
        # over. A ticket approved, reopened and approved again reads as three
        # events rather than as one approval.
        await conn.execute(
            """
            INSERT INTO review_events (
                review_item_id, event, from_state, to_state, issue_code,
                note, actor_id, actor_name)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            """, item_id,
            "reopened" if (body.state == "pending" and was != "pending")
            else "decided",
            was, body.state, body.issue_code,
            body.resolution or body.notes, user["id"], user["full_name"])

        # Approving a ticket settles the flags on it. They stay readable as
        # history; what changes is that the queue stops asking about them.
        if body.state in ("approved", "resolved"):
            await conn.execute(
                """
                UPDATE review_flags
                   SET cleared_at = now(), cleared_by = $2,
                       cleared_reason = $3
                 WHERE subject_kind = 'ticket' AND subject_id = $1
                   AND cleared_at IS NULL
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
    ids = [str(t) for t in body.ticket_ids]
    async with db.tx({**user, "reason": body.notes or ""}) as conn:
        # Open a review row for anything in the selection that has never been
        # touched. Separate statement on purpose: a data modifying CTE would
        # not see rows the function inserted inside the same statement.
        await conn.execute(
            """
            SELECT adms_review_item('ticket', t.id, $1, $3::uuid, $4::text,
                       COALESCE(t.completed_at, t.destination_at,
                                t.origin_at, t.created_at))
              FROM tickets t
             WHERE t.project_id = $1 AND t.id = ANY ($2::uuid[])
               AND t.deleted_at IS NULL AND NOT t.is_void
            """, pid, ids, user["id"], user["full_name"])

        decided = await conn.fetch(
            """
            UPDATE review_items
               SET state = $3::text,
                   issue_code = $4::text,
                   notes = COALESCE($5::text, notes),
                   reviewed_by = $6::uuid,
                   reviewed_by_name = $7::text,
                   reviewed_at = now()
             WHERE project_id = $1 AND subject_kind = 'ticket'
               AND subject_id = ANY ($2::uuid[])
            RETURNING id, state
            """, pid, ids, body.state, body.issue_code, body.notes,
            user["id"], user["full_name"])
        done = len(decided)

        if decided:
            await conn.execute(
                """
                INSERT INTO review_events (
                    review_item_id, event, to_state, issue_code, note,
                    actor_id, actor_name)
                SELECT id, 'decided', $2::text, $3::text, $4::text,
                       $5::uuid, $6::text
                  FROM unnest($1::uuid[]) AS id
                """, [r["id"] for r in decided], body.state, body.issue_code,
                body.notes, user["id"], user["full_name"])

        if body.state in ("approved", "resolved"):
            await conn.execute(
                """
                UPDATE review_flags
                   SET cleared_at = now(), cleared_by = $3,
                       cleared_reason = $4
                 WHERE project_id = $1 AND subject_kind = 'ticket'
                   AND subject_id = ANY ($2::uuid[])
                   AND cleared_at IS NULL
                """, pid, ids, user["id"],
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
            SELECT f.*, f.issue_code AS flag_code, f.subject_id AS ticket_id,
                   k.label, k.description, k.domain
              FROM review_flags f
              JOIN ticket_flag_kinds k ON k.code = f.issue_code
             WHERE f.subject_kind = 'ticket' AND f.subject_id = $1
               {'' if include_cleared else 'AND f.cleared_at IS NULL'}
             ORDER BY CASE f.severity WHEN 'serious' THEN 1
                                      WHEN 'review' THEN 2 ELSE 3 END, k.sort_order
            """, ticket_id)
        review = await conn.fetchrow(
            "SELECT *, subject_id AS ticket_id FROM review_items "
            " WHERE subject_kind = 'ticket' AND subject_id = $1", ticket_id)
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


# ===========================================================================
# The unified review surface
#
# "The review framework should not be limited to tickets. The same general
#  review concept should support records such as tickets, surveys, incident
#  reports, certifications, contracts, permits."
#
# One queue, one decision path, one history, whatever the record is. Invoices
# are deliberately absent: they belong to an invoice analyst, and forcing them
# in here would make this queue somebody else's work as well.
#
# The endpoint that shapes the screens is `/review/{kind}/{id}`. It returns
# everything the reviewer needs in one read, because the whole complaint about
# the old flow was navigation: tabs to open, windows to compare, a map in
# another browser. Bringing the evidence together is the point.
# ===========================================================================

_KINDS = ("ticket", "certification")


class DecisionBody(BaseModel):
    state: str = Field(pattern="^(approved|flagged|resolved|pending)$")
    issue_code: Optional[str] = None
    notes: Optional[str] = None
    resolution: Optional[str] = None


class NoteBody(BaseModel):
    note: str = Field(min_length=1, max_length=4000)


class AlertBody(BaseModel):
    to_user_id: Optional[uuid.UUID] = None
    to_role_code: Optional[str] = None
    subject: str = Field(min_length=1, max_length=200)
    body: Optional[str] = None
    severity: str = Field(default="review", pattern="^(info|review|serious)$")


class EscalateBody(BaseModel):
    level: str = Field(default="supervisor", pattern="^(supervisor|management|none)$")
    reason: str = Field(min_length=4, max_length=2000)
    notify_user_id: Optional[uuid.UUID] = None


def _check_kind(kind: str) -> str:
    if kind not in _KINDS:
        raise bad_request(
            f"There is no review kind called {kind}.",
            code="kind_unknown", allowed=list(_KINDS))
    return kind


@router.get("/issue-kinds")
async def issue_kinds(user: CurrentUser, subject_kind: Optional[str] = None):
    """Every check the detectors can raise, filtered to one kind of record.

    A certification check has no business in a ticket filter, which is why the
    catalog knows which kinds each check applies to."""
    where = ["is_active"]
    args: list[Any] = []
    if subject_kind:
        args.append(subject_kind)
        where.append(f"${len(args)} = ANY (subject_kinds)")
    async with db.read() as conn:
        rows = await conn.fetch(
            f"SELECT * FROM review_issue_kinds WHERE {' AND '.join(where)} "
            f"ORDER BY sort_order", *args)
        kinds = await conn.fetch(
            "SELECT * FROM review_subject_kinds WHERE is_active ORDER BY sort_order")
    return {"items": db.rows(rows), "subject_kinds": db.rows(kinds)}


@router.get("/projects/{project_id}/review/queue")
async def review_queue_all(
    ctx: ProjectContext, user: CurrentUser, paging: Paging,
    state: str = Query("pending", pattern="^(pending|approved|flagged|resolved|open|all)$"),
    subject_kind: Optional[str] = None,
    record_kind: Optional[str] = Query(
        None, description="load, haul_out, unit_rate, incident, custom, certification"),
    flagged_only: bool = Query(False),
    issue_code: Optional[str] = None,
    severity: Optional[str] = Query(None, pattern="^(info|review|serious)$"),
    party_id: Optional[uuid.UUID] = None,
    escalated_only: bool = Query(False),
    overdue_only: bool = Query(False),
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    q: Optional[str] = None,
    sort: str = Query("worst", pattern="^(worst|oldest|newest|value|waiting)$"),
    _: dict = Depends(require_permission("ticket.read.project")),
):
    """Everything waiting on a reviewer, whatever kind of record it is.

    The eight questions the requirement asks a list to answer are the columns:
    what needs review, what kind it is, why, the record information, how long
    it has waited, whether it carries issues, whether it has been decided or
    escalated, and whether the same issue keeps coming back.

    The last of those is attached to the page being returned rather than
    computed in the view, because joining the pattern view for every row costs
    a scan on a project with 25,000 tickets."""
    pid = ctx["project"]["id"]
    where = ["project_id = $1"]
    args: list[Any] = [pid]

    def add(clause: str, value: Any):
        args.append(value)
        where.append(clause.format(n=len(args)))

    if state == "open":
        where.append("review_state IN ('pending', 'flagged')")
    elif state != "all":
        add("review_state = ${n}", state)
    if subject_kind:
        add("subject_kind = ${n}", _check_kind(subject_kind))
    if record_kind:
        add("record_kind = ${n}", record_kind)
    if flagged_only:
        where.append("open_flags > 0")
    if issue_code:
        add("${n} = ANY (flag_codes)", issue_code)
    if severity:
        add("worst_severity = ${n}", severity)
    if party_id:
        add("party_id = ${n}", party_id)
    if escalated_only:
        where.append("escalation_level <> 'none'")
    if date_from:
        add("occurred_at >= ${n}", date_from)
    if date_to:
        add("occurred_at < (${n}::date + 1)", date_to)
    if q:
        add("(title ILIKE ${n} OR unit_number ILIKE ${n} OR party_name ILIKE ${n})",
            f"%{q}%")

    order = {
        # Severity first, then the oldest work, because a serious flag on a
        # three week old record is the one that hurts at closeout.
        "worst": "CASE worst_severity WHEN 'serious' THEN 1 WHEN 'review' THEN 2 "
                 "WHEN 'info' THEN 3 ELSE 4 END, waiting_since",
        "waiting": "waiting_days DESC",
        "oldest": "occurred_at",
        "newest": "occurred_at DESC",
        "value": "value_amount DESC NULLS LAST",
    }[sort]

    async with db.read() as conn:
        policy = await conn.fetchrow("SELECT * FROM adms_review_policy($1)", pid)
        if overdue_only:
            args.append(policy["overdue_days"])
            where.append(f"waiting_days > ${len(args)}")

        clause = " AND ".join(where)
        total = await conn.fetchval(
            f"SELECT count(*) FROM review_queue WHERE {clause}", *args)
        rows = await conn.fetch(
            f"SELECT * FROM review_queue WHERE {clause} "
            f"ORDER BY {order} NULLS LAST LIMIT ${len(args)+1} OFFSET ${len(args)+2}",
            *args, paging["limit"], paging["offset"])

        items = db.rows(rows)
        # The repeat signal, for this page only.
        parties = {(r["subject_kind"], r["party_id"]) for r in items
                   if r["party_id"]}
        patterns: dict[tuple, list] = {}
        if parties:
            pat_rows = await conn.fetch(
                """
                SELECT * FROM review_issue_patterns
                 WHERE project_id = $1 AND party_id = ANY ($2::uuid[])
                   AND open_occurrences > 0
                """, pid, [p[1] for p in parties])
            for r in pat_rows:
                patterns.setdefault((r["subject_kind"], r["party_id"]), []).append(r)

        window = ("last_7_days" if policy["repeat_window_days"] <= 7
                  else "last_30_days")
        for item in items:
            hits = patterns.get((item["subject_kind"], item["party_id"]), [])
            codes = set(item["flag_codes"] or [])
            repeats = [p for p in hits
                       if p["issue_code"] in codes
                       and p[window] >= policy["repeat_count"]]
            item["repeat_issues"] = [{
                "issue_code": p["issue_code"],
                "label": p["issue_label"],
                "occurrences": p[window],
                "window_days": policy["repeat_window_days"],
                "party_name": p["party_name"],
            } for p in repeats]
            item["is_overdue"] = (
                float(item["waiting_days"] or 0) > policy["overdue_days"]
                and item["review_state"] in ("pending", "flagged"))

    page = db.Page.of(items, total, paging["limit"], paging["offset"])
    page["policy"] = db.row(policy)
    return page


@router.get("/projects/{project_id}/review/overview")
async def review_overview(ctx: ProjectContext, user: CurrentUser,
                          _: dict = Depends(require_permission("ticket.read.project"))):
    """The shape of the day across every kind of record."""
    pid = ctx["project"]["id"]
    async with db.read() as conn:
        policy = await conn.fetchrow("SELECT * FROM adms_review_policy($1)", pid)
        by_kind = await conn.fetch(
            """
            SELECT q.subject_kind, k.label, k.plural_label,
                   count(*) AS records,
                   count(*) FILTER (WHERE q.review_state = 'pending')  AS unreviewed,
                   count(*) FILTER (WHERE q.review_state = 'flagged')  AS flagged,
                   count(*) FILTER (WHERE q.review_state = 'approved') AS approved,
                   count(*) FILTER (WHERE q.open_flags > 0)            AS with_flags,
                   count(*) FILTER (WHERE q.worst_severity = 'serious') AS serious,
                   count(*) FILTER (WHERE q.escalation_level <> 'none') AS escalated,
                   count(*) FILTER (WHERE q.review_state IN ('pending', 'flagged')
                                      AND q.waiting_days > $2)         AS overdue,
                   COALESCE(sum(q.value_amount)
                            FILTER (WHERE q.review_state = 'pending'), 0)
                       AS unreviewed_value,
                   round(max(q.waiting_days), 1) AS longest_wait_days
              FROM review_queue q
              JOIN review_subject_kinds k ON k.code = q.subject_kind
             WHERE q.project_id = $1
             GROUP BY q.subject_kind, k.label, k.plural_label, k.sort_order
             ORDER BY k.sort_order
            """, pid, policy["overdue_days"])
        by_issue = await conn.fetch(
            """
            SELECT f.subject_kind, k.code, k.label, k.description, k.severity,
                   k.domain, count(*) AS records
              FROM review_flags f
              JOIN review_issue_kinds k ON k.code = f.issue_code
             WHERE f.project_id = $1 AND f.cleared_at IS NULL
             GROUP BY 1, 2, 3, 4, 5, 6
             ORDER BY CASE k.severity WHEN 'serious' THEN 1
                                      WHEN 'review' THEN 2 ELSE 3 END,
                      count(*) DESC
            """, pid)
        patterns = await conn.fetch(
            """
            SELECT * FROM review_issue_patterns
             WHERE project_id = $1 AND open_occurrences > 0
               AND CASE WHEN $2 <= 7 THEN last_7_days ELSE last_30_days END >= $3
             ORDER BY open_occurrences DESC LIMIT 10
            """, pid, policy["repeat_window_days"], policy["repeat_count"])
        escalations = await conn.fetchval(
            "SELECT count(*) FROM adms_review_escalation_candidates($1)", pid)
        last_scan = await conn.fetchval(
            "SELECT max(raised_at) FROM review_flags WHERE project_id = $1", pid)

    totals: dict[str, Any] = {
        "records": 0, "unreviewed": 0, "flagged": 0, "serious": 0,
        "overdue": 0, "escalated": 0,
    }
    kinds = db.rows(by_kind)
    for row in kinds:
        for key in totals:
            totals[key] += int(row[key] or 0)

    return {
        "totals": totals,
        "by_kind": kinds,
        "by_issue": db.rows(by_issue),
        "repeating": db.rows(patterns),
        "escalation_candidates": int(escalations or 0),
        "policy": db.row(policy),
        "last_scan": last_scan,
    }


@router.get("/projects/{project_id}/review/patterns")
async def review_patterns(ctx: ProjectContext, user: CurrentUser,
                          _: dict = Depends(require_permission("ticket.read.project"))):
    """The same problem, again. What is recurring, from whom, how often."""
    async with db.read() as conn:
        rows = await conn.fetch(
            "SELECT * FROM review_issue_patterns WHERE project_id = $1 "
            " ORDER BY open_occurrences DESC, occurrences DESC",
            ctx["project"]["id"])
    return {"items": db.rows(rows)}


@router.get("/projects/{project_id}/review/escalations")
async def escalation_candidates(ctx: ProjectContext, user: CurrentUser,
                                _: dict = Depends(require_permission("ticket.read.project"))):
    """What meets this project's escalation thresholds, and why.

    Suggested, never automatic. The system helps spot a pattern; a person
    decides whether it needs management rather than another correction."""
    pid = ctx["project"]["id"]
    async with db.read() as conn:
        rows = await conn.fetch(
            "SELECT * FROM adms_review_escalation_candidates($1)", pid)
        policy = await conn.fetchrow("SELECT * FROM adms_review_policy($1)", pid)
    return {"items": db.rows(rows), "policy": db.row(policy)}


# ---------------------------------------------------------------------------
# One record, everything a reviewer needs, in one read.
#
# The reviewer's question is not "are the fields filled in". It is "does the
# evidence support what this record says happened". That question is answered
# by putting the photographs, the location, the times and the relationships in
# front of one person at once, which is what this returns.
# ---------------------------------------------------------------------------
async def _common(conn, kind: str, subject_id: uuid.UUID) -> dict[str, Any]:
    row = await conn.fetchrow(
        "SELECT * FROM review_queue WHERE subject_kind = $1 AND subject_id = $2",
        kind, subject_id)
    if row is None:
        raise not_found("Record")

    flags = await conn.fetch(
        """
        SELECT f.*, k.label, k.description, k.domain
          FROM review_flags f
          JOIN review_issue_kinds k ON k.code = f.issue_code
         WHERE f.subject_kind = $1 AND f.subject_id = $2
         ORDER BY f.cleared_at NULLS FIRST,
                  CASE f.severity WHEN 'serious' THEN 1
                                  WHEN 'review' THEN 2 ELSE 3 END, k.sort_order
        """, kind, subject_id)

    item = await conn.fetchrow(
        "SELECT * FROM review_items WHERE subject_kind = $1 AND subject_id = $2",
        kind, subject_id)
    events = []
    alerts = []
    if item:
        events = await conn.fetch(
            "SELECT * FROM review_events WHERE review_item_id = $1 "
            " ORDER BY occurred_at, id", item["id"])
        alerts = await conn.fetch(
            """
            SELECT a.*, u.full_name AS to_name
              FROM review_alerts a
              LEFT JOIN users u ON u.id = a.to_user_id
             WHERE a.review_item_id = $1 ORDER BY a.sent_at DESC
            """, item["id"])

    evidence = await conn.fetchrow(
        "SELECT * FROM review_evidence WHERE subject_kind = $1 AND subject_id = $2",
        kind, subject_id)

    # What is recurring around whoever produced this record. A fourth missing
    # photograph from one monitor is a different decision from a first.
    patterns = []
    if row["party_id"]:
        patterns = await conn.fetch(
            """
            SELECT * FROM review_issue_patterns
             WHERE project_id = $1 AND subject_kind = $2 AND party_id = $3
               AND occurrences > 1
             ORDER BY open_occurrences DESC
            """, row["project_id"], kind, row["party_id"])

    return {
        "subject_kind": kind,
        "subject_id": str(subject_id),
        "identity": db.row(row),
        "flags": db.rows(flags),
        "review": db.row(item),
        "history": db.rows(events),
        "alerts": db.rows(alerts),
        "evidence": db.row(evidence),
        "patterns": db.rows(patterns),
    }


async def _ticket_bundle(conn, ticket_id: uuid.UUID,
                         out: dict[str, Any]) -> dict[str, Any]:
    t = await conn.fetchrow(
        """
        SELECT t.*, o.ticket_type_label, o.ticket_type_code, o.kind,
               o.contractor_name, o.truck_number, o.debris_label,
               o.destination_site_name, o.billable_cubic_yards, o.net_tons,
               o.haul_miles, o.transaction_total, o.created_by_name,
               o.project_name, o.incident_category, o.severity AS incident_severity,
               tt.stage_schema, tt.field_schema, tt.requires_photo,
               tt.requires_equipment, tt.supports_waypoints
          FROM tickets t
          JOIN ticket_overview o ON o.id = t.id
          JOIN ticket_types tt ON tt.id = t.ticket_type_id
         WHERE t.id = $1
        """, ticket_id)
    if t is None:
        raise not_found("Ticket")

    media = await conn.fetch(
        "SELECT * FROM ticket_media WHERE ticket_id = $1 AND deleted_at IS NULL "
        " ORDER BY COALESCE(captured_at, created_at)", ticket_id)
    stages = await conn.fetch(
        """
        SELECT s.*, u.full_name AS monitor_full_name, ds.name AS site_name
          FROM ticket_stages s
          LEFT JOIN users u ON u.id = s.monitor_id
          LEFT JOIN disposal_sites ds ON ds.id = s.site_id
         WHERE s.ticket_id = $1 ORDER BY s.sequence
        """, ticket_id)
    waypoints = await conn.fetch(
        "SELECT * FROM ticket_waypoints WHERE ticket_id = $1 ORDER BY sequence",
        ticket_id)

    # ------------------------------------------------------------- location
    #
    # "The reviewer currently uses a separate GeoPortal map application ...
    #  visually compares the information." What that comparison needs is the
    #  point, the address, the site, and the rest of that monitor and truck's
    #  day. Gathering it here is what removes the second browser window.
    service_date = (t["completed_at"] or t["destination_at"] or t["origin_at"]
                    or t["created_at"])
    day_track = await conn.fetch(
        """
        SELECT t2.id, t2.ticket_number, t2.origin_latitude, t2.origin_longitude,
               t2.origin_address, t2.origin_street, t2.origin_at, t2.destination_at,
               t2.completed_at, t2.load_call_pct, t2.equipment_id, t2.created_by,
               e.unit_number, m.billable_cubic_yards,
               (t2.id = $2) AS is_this_one
          FROM tickets t2
          LEFT JOIN equipment e ON e.id = t2.equipment_id
          LEFT JOIN ticket_metrics m ON m.ticket_id = t2.id
         WHERE t2.project_id = $1
           AND t2.deleted_at IS NULL AND NOT t2.is_void
           AND COALESCE(t2.completed_at, t2.destination_at, t2.origin_at,
                        t2.created_at)::date = $3::date
           AND (t2.created_by = $4 OR ($5::uuid IS NOT NULL
                                       AND t2.equipment_id = $5::uuid))
         ORDER BY COALESCE(t2.origin_at, t2.created_at)
        """, t["project_id"], ticket_id, service_date, t["created_by"],
        t["equipment_id"])

    same_street = await conn.fetch(
        """
        SELECT t2.id, t2.ticket_number, t2.origin_latitude, t2.origin_longitude,
               t2.origin_at,
               adms_distance_miles($2, $3, t2.origin_latitude, t2.origin_longitude)
                   AS miles_away
          FROM tickets t2
         WHERE t2.project_id = $1 AND t2.id <> $4
           AND t2.deleted_at IS NULL AND NOT t2.is_void
           AND $5::text IS NOT NULL
           AND lower(btrim(t2.origin_street)) = lower(btrim($5::text))
         ORDER BY 6 NULLS LAST LIMIT 8
        """, t["project_id"], t["origin_latitude"], t["origin_longitude"],
        ticket_id, t["origin_street"])

    site = await conn.fetchrow(
        """
        SELECT ds.id, ds.name, ds.latitude, ds.longitude, ds.site_kind,
               ps.is_active, ps.permit_status
          FROM disposal_sites ds
          LEFT JOIN project_sites ps ON ps.site_id = ds.id
                                    AND ps.project_id = $2
         WHERE ds.id = $1
        """, t["destination_site_id"], t["project_id"]) \
        if t["destination_site_id"] else None

    haul_line = None
    if (t["origin_latitude"] is not None and site
            and site["latitude"] is not None):
        haul_line = await conn.fetchval(
            "SELECT adms_distance_miles($1, $2, $3, $4)",
            t["origin_latitude"], t["origin_longitude"],
            site["latitude"], site["longitude"])

    # ----------------------------------------------------------------- time
    #
    # "Does the sequence of events and the amount of time between events make
    #  sense?" So the gaps are named rather than left to be worked out from
    # two timestamps.
    sequence = []
    previous = None
    for point in [
        ("Loading", t["origin_at"]),
        ("At the site", t["destination_at"]),
        ("Completed", t["completed_at"]),
    ]:
        label, at = point
        if at is None:
            continue
        gap = None if previous is None else round(
            (at - previous).total_seconds() / 60.0, 1)
        sequence.append({"label": label, "at": at, "gap_minutes": gap})
        previous = at

    # --------------------------------------------------------- relationships
    certification = None
    if t["certification_id"]:
        certification = await conn.fetchrow(
            """
            SELECT c.id, c.certified_capacity_cy, c.method, c.applies_from,
                   c.status, c.certification_number,
                   (m.id IS NOT NULL) AS is_measured,
                   m.container_type_code, m.total_cubic_yards, m.section_count
              FROM project_equipment_certifications c
              LEFT JOIN certification_measurements m ON m.certification_id = c.id
             WHERE c.id = $1
            """, t["certification_id"])

    neighbours = await conn.fetch(
        """
        (SELECT 'previous' AS position, t2.id, t2.ticket_number, t2.completed_at,
                t2.origin_address
           FROM tickets t2
          WHERE t2.project_id = $1 AND t2.equipment_id = $2 AND t2.id <> $3
            AND t2.deleted_at IS NULL AND NOT t2.is_void
            AND COALESCE(t2.completed_at, t2.created_at) < $4
          ORDER BY COALESCE(t2.completed_at, t2.created_at) DESC LIMIT 1)
        UNION ALL
        (SELECT 'next', t2.id, t2.ticket_number, t2.completed_at, t2.origin_address
           FROM tickets t2
          WHERE t2.project_id = $1 AND t2.equipment_id = $2 AND t2.id <> $3
            AND t2.deleted_at IS NULL AND NOT t2.is_void
            AND COALESCE(t2.completed_at, t2.created_at) > $4
          ORDER BY COALESCE(t2.completed_at, t2.created_at) LIMIT 1)
        """, t["project_id"], t["equipment_id"], ticket_id, service_date) \
        if t["equipment_id"] else []

    # ----------------------------------------------------------- compliance
    #
    # "The reviewer understands what is allowed for the project and for each
    #  ticket type." The system surfaces the rule; it does not decide.
    compliance = await conn.fetchrow(
        """
        SELECT
          (SELECT is_active FROM project_ticket_types
            WHERE project_id = $1 AND ticket_type_id = $2) AS type_enabled,
          (SELECT bool_or(is_active) FROM project_sites
            WHERE project_id = $1 AND site_id = $3) AS site_active,
          (SELECT permit_status FROM project_sites
            WHERE project_id = $1 AND site_id = $3 LIMIT 1)
              AS site_permit_status,
          (SELECT count(*) > 0 FROM project_scopes
            WHERE project_id = $1 AND debris_type_code = $4 AND is_enabled)
              AS debris_stream_enabled
        """, t["project_id"], t["ticket_type_id"], t["destination_site_id"],
        t["debris_type"])

    row = db.row(t)
    out["record"] = row
    out["media"] = db.rows(media)
    out["stages"] = db.rows(stages)
    out["location"] = {
        "origin": {
            "latitude": row["origin_latitude"],
            "longitude": row["origin_longitude"],
            "address": row["origin_address"],
            "street": row["origin_street"],
            "at": row["origin_at"],
            "site_id": row["origin_site_id"],
        },
        "destination": db.row(site),
        "haul_miles_straight_line": (
            round(float(haul_line), 2) if haul_line is not None else None),
        "haul_miles_recorded": row["haul_miles"],
        "waypoints": db.rows(waypoints),
        "day_track": db.rows(day_track),
        "same_street": db.rows(same_street),
    }
    out["time"] = {
        "service_date": service_date,
        "sequence": sequence,
        "cycle_minutes": (
            round((row["destination_at"] - row["origin_at"]).total_seconds() / 60.0, 1)
            if row["origin_at"] and row["destination_at"] else None),
    }
    out["relationships"] = {
        "monitor": {"id": row["created_by"], "name": row["created_by_name"]},
        "driver": row["driver_name"],
        "unit": row["truck_number"],
        "contractor": row["contractor_name"],
        "certification": db.row(certification),
        "neighbours": db.rows(neighbours),
    }
    # The arithmetic, shown rather than asserted.
    out["measurements"] = {
        "certified_capacity_cy": row["certified_capacity_cy"],
        "load_call_pct": row["load_call_pct"],
        "billable_cubic_yards": row["billable_cubic_yards"],
        "net_tons": row["net_tons"],
        "quantity": row["quantity"],
        "quantity_unit": row["quantity_unit"],
        "explanation": (
            f"{float(row['certified_capacity_cy']):g} CY certified "
            f"times {float(row['load_call_pct']):g}% called "
            f"is {float(row['billable_cubic_yards'] or 0):g} CY billable"
            if row["certified_capacity_cy"] and row["load_call_pct"] else None),
    }
    out["compliance"] = db.row(compliance)
    out["declared"] = {
        "stage_schema": row["stage_schema"],
        "field_schema": row["field_schema"],
        "requires_photo": row["requires_photo"],
    }
    return out


async def _certification_bundle(conn, certification_id: uuid.UUID,
                                out: dict[str, Any]) -> dict[str, Any]:
    cert = await conn.fetchrow(
        """
        SELECT c.*, e.unit_number, e.equipment_type, e.placard_code, e.make,
               e.model, e.model_year, ctr.name AS contractor_name,
               u.full_name AS measured_by_full_name,
               p.project_code, p.name AS project_name
          FROM project_equipment_certifications c
          JOIN equipment e ON e.id = c.equipment_id
          JOIN projects p ON p.id = c.project_id
          LEFT JOIN contractors ctr ON ctr.id = e.contractor_id
          LEFT JOIN users u ON u.id = c.measured_by
         WHERE c.id = $1
        """, certification_id)
    if cert is None:
        raise not_found("Certification")

    worksheet = await conn.fetchrow(
        "SELECT * FROM certification_measurement_detail WHERE certification_id = $1",
        certification_id)
    media = await conn.fetch(
        "SELECT * FROM certification_media WHERE certification_id = $1 "
        "  AND deleted_at IS NULL ORDER BY slot, created_at", certification_id)
    chain = await conn.fetch(
        """
        SELECT c.id, c.certified_capacity_cy, c.method, c.status, c.applies_from,
               c.measured_on, c.superseded_reason, c.notes,
               (m.id IS NOT NULL) AS is_measured,
               (SELECT count(*) FROM tickets t
                 WHERE t.certification_id = c.id
                   AND t.deleted_at IS NULL AND NOT t.is_void) AS tickets_priced
          FROM project_equipment_certifications c
          LEFT JOIN certification_measurements m ON m.certification_id = c.id
         WHERE c.project_id = $1 AND c.equipment_id = $2
         ORDER BY c.applies_from, c.created_at
        """, cert["project_id"], cert["equipment_id"])
    priced = await conn.fetchrow(
        """
        SELECT count(*) AS tickets,
               min(COALESCE(t.completed_at, t.created_at))::date AS first_day,
               max(COALESCE(t.completed_at, t.created_at))::date AS last_day,
               COALESCE(sum(o.billable_cubic_yards), 0) AS cubic_yards,
               COALESCE(sum(o.transaction_total), 0) AS billed
          FROM tickets t JOIN ticket_overview o ON o.id = t.id
         WHERE t.certification_id = $1 AND t.deleted_at IS NULL AND NOT t.is_void
        """, certification_id)

    row = db.row(cert)
    out["record"] = row
    out["media"] = db.rows(media)
    out["measurements"] = db.row(worksheet) or {
        "measured": False,
        "note": ("This capacity was entered directly. Nothing in the record "
                 "says how it was reached."),
    }
    out["relationships"] = {
        "unit": row["unit_number"],
        "placard": row["placard_code"],
        "contractor": row["contractor_name"],
        "measured_by": row["measured_by_full_name"] or row["measured_by_name"],
        "chain": db.rows(chain),
    }
    # What is riding on this number.
    out["impact"] = db.row(priced)
    out["time"] = {
        "service_date": row["measured_on"],
        "sequence": [s for s in [
            {"label": "Measured", "at": row["measured_on"], "gap_minutes": None},
            {"label": "Submitted", "at": row["submitted_at"], "gap_minutes": None}
            if row["submitted_at"] else None,
            {"label": "Approved", "at": row["approved_at"], "gap_minutes": None}
            if row["approved_at"] else None,
        ] if s],
    }
    out["compliance"] = {
        "applies_from": row["applies_from"],
        "expires_on": row["expires_on"],
        "status": row["status"],
        "placard_matches": (
            None if not (row["certification_number"] and row["placard_code"])
            else row["certification_number"].strip().lower()
                 == row["placard_code"].strip().lower()),
    }
    return out


@router.get("/review/{subject_kind}/{subject_id}")
async def review_record(subject_kind: str, subject_id: uuid.UUID,
                        user: CurrentUser,
                        _: dict = Depends(require_permission("ticket.read.project"))):
    """Everything about one record a reviewer has to judge, in one read.

    Identity, why it is here, the evidence with what was required beside it,
    where it happened, when, who and what was involved, the arithmetic, the
    project rules it has to satisfy, related records, and the history of the
    review itself. The shape adapts to the kind of record; the contract does
    not."""
    kind = _check_kind(subject_kind)
    async with db.read() as conn:
        out = await _common(conn, kind, subject_id)
        if kind == "ticket":
            return await _ticket_bundle(conn, subject_id, out)
        return await _certification_bundle(conn, subject_id, out)


# ---------------------------------------------------------------------------
# The outcomes.
#
# "The reviewer needs clear ways to approve, flag an issue, add notes, update
#  information, send an alert, and escalate."
#
# Updating a record is the record's own endpoint, because correcting a ticket
# and correcting a certification are genuinely different acts. Everything else
# is the same regardless of what is being reviewed, so it lives here once.
# ---------------------------------------------------------------------------
async def _open_item(conn, kind: str, subject_id: uuid.UUID,
                     user: dict[str, Any]) -> tuple[uuid.UUID, uuid.UUID, str]:
    """The review row for a record, opened if this is the first touch."""
    row = await conn.fetchrow(
        "SELECT project_id, occurred_at, title FROM review_subjects "
        " WHERE subject_kind = $1 AND subject_id = $2", kind, subject_id)
    if row is None:
        raise not_found("Record")
    item_id = await conn.fetchval(
        "SELECT adms_review_item($1, $2, $3, $4, $5, $6)",
        kind, subject_id, row["project_id"], user["id"], user["full_name"],
        row["occurred_at"])
    return item_id, row["project_id"], row["title"]


@router.post("/review/{subject_kind}/{subject_id}/decision")
async def record_decision(subject_kind: str, subject_id: uuid.UUID,
                          body: DecisionBody, user: CurrentUser,
                          _: dict = Depends(require_permission("ticket.update"))):
    """Approve, flag, resolve or reopen one record.

    Flagging has to say what is wrong, because a flag with no claim behind it
    is just a record somebody moved past."""
    kind = _check_kind(subject_kind)
    if body.state == "flagged" and not (body.issue_code or (body.notes or "").strip()):
        raise bad_request(
            "Flagging needs an issue or a note saying what is wrong.",
            code="issue_required")
    if body.state == "resolved" and not (body.resolution or "").strip():
        raise bad_request("Resolving needs a line on what was done.",
                          code="resolution_required")

    reason = body.resolution or body.notes or ""
    async with db.tx({**user, "reason": reason}) as conn:
        item_id, _project, _title = await _open_item(conn, kind, subject_id, user)
        was = await conn.fetchval("SELECT state FROM review_items WHERE id = $1",
                                  item_id)
        await conn.execute(
            """
            UPDATE review_items
               SET state = $2::text,
                   issue_code = $3::text,
                   notes = COALESCE($4::text, notes),
                   reviewed_by = $5::uuid, reviewed_by_name = $6::text,
                   reviewed_at = CASE WHEN $2 = 'pending' THEN NULL ELSE now() END,
                   resolved_by = CASE WHEN $2 = 'resolved'
                                      THEN $5::uuid ELSE NULL::uuid END,
                   resolved_at = CASE WHEN $2 = 'resolved'
                                      THEN now() ELSE NULL::timestamptz END,
                   resolution = COALESCE($7::text, resolution),
                   reopened_count = reopened_count
                       + CASE WHEN $2 = 'pending' AND state <> 'pending'
                              THEN 1 ELSE 0 END
             WHERE id = $1
            """, item_id, body.state, body.issue_code, body.notes,
            user["id"], user["full_name"], body.resolution)
        await conn.execute(
            """
            INSERT INTO review_events (
                review_item_id, event, from_state, to_state, issue_code, note,
                actor_id, actor_name)
            VALUES ($1, $2, $3, $4, $5, NULLIF($6, ''), $7, $8)
            """, item_id,
            "reopened" if (body.state == "pending" and was != "pending")
            else "decided",
            was, body.state, body.issue_code, reason, user["id"],
            user["full_name"])

        # Deciding settles the flags. They stay readable as history; what
        # changes is that the queue stops asking about them.
        if body.state in ("approved", "resolved"):
            await conn.execute(
                """
                UPDATE review_flags
                   SET cleared_at = now(), cleared_by = $3, cleared_reason = $4
                 WHERE subject_kind = $1 AND subject_id = $2
                   AND cleared_at IS NULL
                """, kind, subject_id, user["id"],
                f"Reviewed by {user['full_name']}"
                + (f": {reason}" if reason else ""))

        row = await conn.fetchrow(
            "SELECT * FROM review_queue WHERE subject_kind = $1 AND subject_id = $2",
            kind, subject_id)
    return db.row(row)


@router.post("/review/{subject_kind}/{subject_id}/note")
async def add_note(subject_kind: str, subject_id: uuid.UUID, body: NoteBody,
                   user: CurrentUser,
                   _: dict = Depends(require_permission("ticket.update"))):
    """Leave a note without deciding anything.

    Half a review is a real state. Somebody looked, wrote down what they saw,
    and has to come back to it."""
    kind = _check_kind(subject_kind)
    async with db.tx({**user, "reason": body.note}) as conn:
        item_id, _project, _title = await _open_item(conn, kind, subject_id, user)
        await conn.execute(
            """
            INSERT INTO review_events (
                review_item_id, event, note, actor_id, actor_name)
            VALUES ($1, 'noted', $2, $3, $4)
            """, item_id, body.note, user["id"], user["full_name"])
        events = await conn.fetch(
            "SELECT * FROM review_events WHERE review_item_id = $1 "
            " ORDER BY occurred_at, id", item_id)
    return {"history": db.rows(events)}


@router.post("/review/{subject_kind}/{subject_id}/alert", status_code=201)
async def send_alert(subject_kind: str, subject_id: uuid.UUID, body: AlertBody,
                     user: CurrentUser,
                     _: dict = Depends(require_permission("ticket.update"))):
    """Put this record in front of whoever has to act on it.

    "The list should also be supported by notifications/alerts elsewhere in the
     application so users know that work is waiting for them." In app only for
    now, but the record of who was told and when is the part that matters."""
    kind = _check_kind(subject_kind)
    if not (body.to_user_id or body.to_role_code):
        raise bad_request("Say who this is going to.", code="recipient_required")

    async with db.tx({**user, "reason": body.subject}) as conn:
        item_id, project_id, title = await _open_item(conn, kind, subject_id, user)
        rec = await conn.fetchrow(
            """
            INSERT INTO review_alerts (
                review_item_id, project_id, to_user_id, to_role_code,
                subject, body, severity, sent_by, sent_by_name)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING *
            """, item_id, project_id, body.to_user_id, body.to_role_code,
            body.subject, body.body, body.severity, user["id"],
            user["full_name"])
        await conn.execute(
            """
            INSERT INTO review_events (
                review_item_id, event, note, detail, actor_id, actor_name)
            VALUES ($1, 'alerted', $2, $3, $4, $5)
            """, item_id, body.subject,
            {"to_user_id": str(body.to_user_id) if body.to_user_id else None,
             "to_role_code": body.to_role_code, "record": title},
            user["id"], user["full_name"])
    out = db.row(rec)
    out["message"] = f"Sent. {title} is on their list."
    return out


@router.post("/review/{subject_kind}/{subject_id}/escalate")
async def escalate(subject_kind: str, subject_id: uuid.UUID, body: EscalateBody,
                   user: CurrentUser,
                   _: dict = Depends(require_permission("ticket.update"))):
    """Raise this above another correction.

    Escalation is for when too much time has passed, the same problem keeps
    happening, or the thing needs management rather than another fix. The
    system suggests candidates; a person decides, which is why this is an
    endpoint somebody calls rather than a job that runs."""
    kind = _check_kind(subject_kind)
    async with db.tx({**user, "reason": body.reason}) as conn:
        item_id, project_id, title = await _open_item(conn, kind, subject_id, user)
        was = await conn.fetchval(
            "SELECT escalation_level FROM review_items WHERE id = $1", item_id)

        if body.level == "none":
            await conn.execute(
                """
                UPDATE review_items
                   SET escalation_level = 'none', escalated_at = NULL,
                       escalated_by = NULL, escalation_reason = NULL
                 WHERE id = $1
                """, item_id)
        else:
            await conn.execute(
                """
                UPDATE review_items
                   SET escalation_level = $2, escalated_at = now(),
                       escalated_by = $3, escalation_reason = $4
                 WHERE id = $1
                """, item_id, body.level, user["id"], body.reason)

        await conn.execute(
            """
            INSERT INTO review_events (
                review_item_id, event, note, detail, actor_id, actor_name)
            VALUES ($1, $2, $3, $4, $5, $6)
            """, item_id,
            "escalated" if body.level != "none" else "de_escalated",
            body.reason, {"from": was, "to": body.level},
            user["id"], user["full_name"])

        if body.notify_user_id:
            await conn.execute(
                """
                INSERT INTO review_alerts (
                    review_item_id, project_id, to_user_id, subject, body,
                    severity, sent_by, sent_by_name)
                VALUES ($1, $2, $3, $4, $5, 'serious', $6, $7)
                """, item_id, project_id, body.notify_user_id,
                f"Escalated: {title}", body.reason, user["id"],
                user["full_name"])

        row = await conn.fetchrow(
            "SELECT * FROM review_queue WHERE subject_kind = $1 AND subject_id = $2",
            kind, subject_id)
    return db.row(row)


@router.get("/review/inbox")
async def review_inbox(user: CurrentUser, unread_only: bool = Query(False)):
    """Review work somebody has put in front of this person."""
    where = ["a.to_user_id = $1"]
    if unread_only:
        where.append("a.read_at IS NULL")
    async with db.read() as conn:
        rows = await conn.fetch(
            f"""
            SELECT a.*, i.subject_kind, i.subject_id, i.state AS review_state,
                   s.title, s.record_kind_label, p.project_code
              FROM review_alerts a
              JOIN review_items i ON i.id = a.review_item_id
              LEFT JOIN review_subjects s ON s.subject_kind = i.subject_kind
                                         AND s.subject_id = i.subject_id
              JOIN projects p ON p.id = a.project_id
             WHERE {' AND '.join(where)}
             ORDER BY a.sent_at DESC LIMIT 100
            """, user["id"])
        unread = await conn.fetchval(
            "SELECT count(*) FROM review_alerts "
            " WHERE to_user_id = $1 AND read_at IS NULL", user["id"])
    return {"items": db.rows(rows), "unread": int(unread or 0)}


@router.post("/review/alerts/{alert_id}/acknowledge")
async def acknowledge_alert(alert_id: uuid.UUID, user: CurrentUser):
    """Say it has been seen and picked up."""
    async with db.tx(user) as conn:
        rec = await conn.fetchrow(
            """
            UPDATE review_alerts
               SET read_at = COALESCE(read_at, now()),
                   acknowledged_at = now(), acknowledged_by = $2
             WHERE id = $1 AND to_user_id = $2
            RETURNING *
            """, alert_id, user["id"])
        if rec is None:
            raise not_found("Alert")
    return db.row(rec)
