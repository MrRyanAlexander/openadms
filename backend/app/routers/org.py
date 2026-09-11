"""Clients, contractors, contracts, disposal sites, equipment, and users.
These sit above the project layer and are linked into projects explicitly."""
from __future__ import annotations

import re
import uuid
from typing import Any, Optional

from fastapi import APIRouter, Body, Depends, Query
from pydantic import BaseModel, EmailStr, Field

from .. import crud, db
from ..deps import (CurrentUser, Paging, has_permission, permission_refusal,
                    require_permission)
from ..errors import bad_request, forbidden, not_found
from .. import tabular
from ..names import apply_name, split_name
from ..security import hash_password

clients = crud.make_router(
    table="clients", prefix="/clients", tags=["organization"],
    read_permission="ticket.read.project", write_permission="client.manage",
    searchable=("name", "code", "city", "fema_applicant_id"),
    allowed_fields=(
        "name", "code", "client_type", "fema_applicant_id", "duns_uei",
        "primary_contact", "contact_email", "contact_phone", "address_line1",
        "address_line2", "city", "state_code", "postal_code", "notes",
        "is_active", "metadata",
    ),
)

contractors = crud.make_router(
    table="contractors", prefix="/contractors", tags=["organization"],
    read_permission="ticket.read.project", write_permission="contractor.manage",
    searchable=("name", "code", "city"),
    allowed_fields=(
        "name", "code", "contractor_type", "primary_contact", "contact_email",
        "contact_phone", "address_line1", "city", "state_code", "postal_code",
        "is_active", "metadata",
    ),
)

# ---------------------------------------------------------------------------
# Contracts. A contract with no document link, no type, no status or no start
# date is a contract nothing can safely bill under, so those four are required
# here as well as in the form. The database constraint follows in 0021; this is
# the layer an import or a direct API call hits first.
# ---------------------------------------------------------------------------
CONTRACT_REQUIRED = ("contract_number", "title", "client_id", "contractor_id",
                     "contract_type", "status", "effective_from", "document_url")

_URL_SHAPE = re.compile(r"^https?://[^\s]+$", re.IGNORECASE)


def validate_contract(data: dict[str, Any], creating: bool) -> dict[str, Any]:
    missing = [f for f in CONTRACT_REQUIRED
               if (creating and data.get(f) in (None, ""))
               or (not creating and f in data and data[f] in (None, ""))]
    if missing:
        raise bad_request(
            "A contract needs " + ", ".join(missing).replace("_", " ") + ".",
            code="contract_incomplete", missing=missing)

    url = data.get("document_url")
    if url is not None and not _URL_SHAPE.match(str(url).strip()):
        raise bad_request(
            "The signed document link must be a full http or https URL into "
            "Box, SharePoint or wherever the executed contract lives.",
            code="document_url_invalid")
    if url is not None:
        data["document_url"] = str(url).strip()
    return data


contract_extras = APIRouter(prefix="/contracts", tags=["organization"])


@contract_extras.get("/remediation")
async def contracts_needing_remediation(
    user: CurrentUser,
    _: dict = Depends(require_permission("ticket.read.project")),
):
    """Contracts already in the database that predate the required document
    link. They are listed rather than left to fail at billing time."""
    async with db.read() as conn:
        rows = await conn.fetch(
            """
            SELECT c.id, c.contract_number, c.title, c.status,
                   cl.name AS client_name, ct.name AS contractor_name,
                   c.document_url, c.effective_from, c.contract_type,
                   ARRAY_REMOVE(ARRAY[
                       CASE WHEN c.document_url IS NULL OR btrim(c.document_url) = ''
                            THEN 'document_url' END,
                       CASE WHEN c.effective_from IS NULL
                            THEN 'effective_from' END
                   ], NULL) AS missing
              FROM contracts c
              JOIN clients cl ON cl.id = c.client_id
              JOIN contractors ct ON ct.id = c.contractor_id
             WHERE c.deleted_at IS NULL
               AND (c.document_url IS NULL OR btrim(c.document_url) = ''
                    OR c.effective_from IS NULL)
             ORDER BY c.contract_number
            """)
    return {"items": db.rows(rows), "total": len(rows)}


@contract_extras.get("/{contract_id}/overview")
async def contract_overview(
    contract_id: uuid.UUID, user: CurrentUser,
    _: dict = Depends(require_permission("ticket.read.project")),
):
    """A contract read from above any single project: every project it serves,
    what has been billed against it across all of them, and how much of its
    not-to-exceed that leaves."""
    async with db.read() as conn:
        contract = await conn.fetchrow(
            """
            SELECT c.*, cl.name AS client_name, ct.name AS contractor_name
              FROM contracts c
              JOIN clients cl ON cl.id = c.client_id
              JOIN contractors ct ON ct.id = c.contractor_id
             WHERE c.id = $1 AND c.deleted_at IS NULL
            """, contract_id)
        if contract is None:
            raise not_found("Contract")

        projects = await conn.fetch(
            """
            SELECT p.id, p.name, p.project_code, p.status, pc.is_primary,
                   pc.linked_on, cl.name AS client_name,
                   COALESCE(SUM(tx.amount), 0) AS billed
              FROM project_contracts pc
              JOIN projects p ON p.id = pc.project_id AND p.deleted_at IS NULL
              JOIN clients cl ON cl.id = p.client_id
              LEFT JOIN rules r ON r.contract_id = pc.contract_id
                                AND r.project_id = p.id
              LEFT JOIN transactions tx ON tx.rule_id = r.id
             WHERE pc.contract_id = $1
             GROUP BY p.id, p.name, p.project_code, p.status, pc.is_primary,
                      pc.linked_on, cl.name
             ORDER BY pc.is_primary DESC, p.name
            """, contract_id)

        documents = await conn.fetch(
            """
            SELECT d.*, k.label AS kind_label, w.watch_state, w.days_until_expiry
              FROM documents d
              JOIN document_kinds k ON k.code = d.kind_code
              LEFT JOIN document_watch w ON w.id = d.id
             WHERE d.entity_type = 'contracts' AND d.entity_id = $1
               AND d.deleted_at IS NULL
             ORDER BY d.effective_from DESC NULLS LAST
            """, contract_id)

        lines = await conn.fetch(
            "SELECT * FROM contract_line_item_review WHERE contract_id = $1 "
            "ORDER BY line_number NULLS LAST", contract_id)

    billed = sum(float(p["billed"] or 0) for p in projects)
    nte = float(contract["not_to_exceed"] or 0)
    return {
        **db.row(contract),
        "projects": db.rows(projects),
        "documents": db.rows(documents),
        "line_items": db.rows(lines),
        "billed_total": billed,
        "nte_remaining": (nte - billed) if nte else None,
        "nte_burn_pct": round(billed / nte * 100, 1) if nte else None,
    }


contracts = crud.make_router(
    table="contracts", prefix="/contracts", tags=["organization"],
    validate=validate_contract,
    read_permission="ticket.read.project", write_permission="contract.manage",
    searchable=("contract_number", "title"), order_by="contract_number",
    allowed_fields=(
        "contract_number", "title", "client_id", "contractor_id", "contract_type",
        "status", "executed_on", "effective_from", "effective_to",
        "not_to_exceed", "document_url", "notes", "metadata",
    ),
    alias="c",
    select_sql="""
        SELECT c.*, cl.name AS client_name, ct.name AS contractor_name,
               (SELECT count(*) FROM project_contracts pc
                 WHERE pc.contract_id = c.id) AS project_count,
               (SELECT count(*) FROM contract_line_items li
                 WHERE li.contract_id = c.id AND li.deleted_at IS NULL) AS line_item_count
          FROM contracts c
          JOIN clients cl ON cl.id = c.client_id
          JOIN contractors ct ON ct.id = c.contractor_id
    """,
)

sites = crud.make_router(
    table="disposal_sites", prefix="/sites", tags=["organization"],
    read_permission="ticket.read.project", write_permission="site.manage",
    searchable=("name", "site_code", "city", "permit_number"),
    allowed_fields=(
        "name", "site_code", "site_kind", "operator_id", "address_line1", "city",
        "state_code", "postal_code", "latitude", "longitude", "permit_number",
        "permit_expires_on", "permit_url", "has_scale", "accepted_debris",
        "capacity_cy", "is_active", "metadata",
    ),
)

equipment = crud.make_router(
    table="equipment", prefix="/equipment", tags=["organization"],
    read_permission="ticket.read.project", write_permission="equipment.manage",
    searchable=("unit_number", "license_plate", "barcode", "placard_code"),
    order_by="unit_number",
    allowed_fields=(
        "unit_number", "contractor_id", "equipment_type", "make", "model",
        "model_year", "license_plate", "vin", "capacity_cy", "tare_weight_lbs",
        "certified_on", "certification_exp", "placard_code", "barcode",
        "is_active", "metadata",
    ),
)

disasters = crud.make_router(
    table="disasters", prefix="/disasters", tags=["organization"],
    read_permission="ticket.read.project", write_permission="project.create",
    searchable=("declaration_code", "name"), order_by="declared_on DESC NULLS LAST",
    soft_delete=False,
    allowed_fields=(
        "declaration_code", "name", "incident_type", "declared_on",
        "incident_start", "incident_end", "state_code", "metadata",
    ),
)

# ---------------------------------------------------------------------------
# Users need password handling, so they get a hand-written router.
#
# Worker administration is split across two permissions. Putting a monitor or a
# manager into the system is crew work and sits on worker.manage at Manager
# rank, which is what the Workers screen has always assumed. Handing someone
# analyst or admin rank, touching an account that already holds it, and taking
# an account away are all account administration and stay on user.manage at
# Admin rank. The body decides which of the two a request is, so the split is
# enforced inside the handler rather than on the route.
# ---------------------------------------------------------------------------
users = APIRouter(prefix="/users", tags=["organization"])

ELEVATED_ROLE_RANK = 30  # analyst and above


async def _role_rank(code: str) -> int:
    async with db.read() as conn:
        rank = await conn.fetchval("SELECT rank FROM roles WHERE code = $1", code)
    if rank is None:
        raise bad_request(f"Unknown role: {code}")
    return int(rank)


async def _guard_granting_role(actor: dict[str, Any], role_code: Optional[str]) -> None:
    if not role_code:
        return
    if await _role_rank(role_code) < ELEVATED_ROLE_RANK:
        return
    if not await has_permission(actor, "user.manage"):
        raise forbidden(permission_refusal(
            actor, ["user.manage"], f"Granting {role_code} rank"))


async def _guard_editing_target(actor: dict[str, Any], user_id: uuid.UUID) -> dict[str, Any]:
    """Editing an account that already sits at analyst rank or above is account
    administration whatever field is being changed, so it needs user.manage."""
    async with db.read() as conn:
        rec = await conn.fetchrow(
            """
            SELECT u.id, u.global_role, u.is_active, r.rank
              FROM users u JOIN roles r ON r.code = u.global_role
             WHERE u.id = $1 AND u.deleted_at IS NULL
            """, user_id)
    if rec is None:
        raise not_found("User")
    if rec["rank"] >= ELEVATED_ROLE_RANK and not await has_permission(actor, "user.manage"):
        raise forbidden(permission_refusal(
            actor, ["user.manage"], f"Editing a {rec['global_role']} account"))
    return dict(rec)


class UserCreate(BaseModel):
    # Optional because nobody should have to invent one. Derived from the name
    # by the same helper the paste importer uses when it is left out.
    username: Optional[str] = Field(default=None, min_length=2, max_length=64)
    # The parts are the stored truth. full_name is accepted as a convenience
    # and split, because most real input arrives as one string.
    first_name: Optional[str] = None
    middle_name: Optional[str] = None
    last_name: Optional[str] = None
    full_name: Optional[str] = None
    employee_id: Optional[str] = None
    employer_contractor_id: Optional[uuid.UUID] = None
    employer_name: Optional[str] = None
    global_role: str = "monitor"
    email: Optional[EmailStr] = None
    monitor_id: Optional[str] = None
    phone: Optional[str] = None
    password: Optional[str] = Field(default=None, min_length=8)
    is_active: bool = True


class UserUpdate(BaseModel):
    first_name: Optional[str] = None
    middle_name: Optional[str] = None
    last_name: Optional[str] = None
    full_name: Optional[str] = None
    employee_id: Optional[str] = None
    employer_contractor_id: Optional[uuid.UUID] = None
    employer_name: Optional[str] = None
    global_role: Optional[str] = None
    email: Optional[EmailStr] = None
    monitor_id: Optional[str] = None
    phone: Optional[str] = None
    is_active: Optional[bool] = None
    password: Optional[str] = Field(default=None, min_length=8)


_USER_SELECT = """
    SELECT u.id, u.username, u.email, u.full_name, u.first_name, u.middle_name,
           u.last_name, u.employee_id, u.employer_contractor_id, u.employer_name,
           COALESCE(ct.name, u.employer_name) AS employer_label,
           u.monitor_id, u.global_role,
           u.phone, u.is_active, u.must_reset, u.last_login_at, u.created_at,
           r.label AS role_label, r.rank AS role_rank,
           (SELECT count(*) FROM project_assignments pa
             WHERE pa.user_id = u.id AND pa.is_active) AS project_count,
           (SELECT count(*) FROM tickets t WHERE t.created_by = u.id
             AND t.deleted_at IS NULL) AS tickets_created
      FROM users u
      JOIN roles r ON r.code = u.global_role
      LEFT JOIN contractors ct ON ct.id = u.employer_contractor_id
"""


@users.get("")
async def list_users(
    paging: Paging, user: CurrentUser,
    q: Optional[str] = None,
    role: Optional[str] = None,
    project_id: Optional[uuid.UUID] = None,
    _: dict = Depends(require_permission("worker.manage")),
):
    where = ["u.deleted_at IS NULL"]
    args: list[Any] = []
    if q:
        args.append(f"%{q}%")
        where.append(
            f"(u.full_name ILIKE ${len(args)} OR u.username ILIKE ${len(args)}"
            f" OR u.monitor_id ILIKE ${len(args)}"
            f" OR u.employee_id ILIKE ${len(args)}"
            f" OR u.employer_name ILIKE ${len(args)})")
    if role:
        args.append(role)
        where.append(f"u.global_role = ${len(args)}")
    if project_id:
        args.append(project_id)
        where.append(
            f"EXISTS (SELECT 1 FROM project_assignments pa WHERE pa.user_id = u.id "
            f"AND pa.project_id = ${len(args)} AND pa.is_active)")

    clause = " AND ".join(where)
    async with db.read() as conn:
        total = await conn.fetchval(
            f"SELECT count(*) FROM users u WHERE {clause}", *args)
        recs = await conn.fetch(
            f"{_USER_SELECT} WHERE {clause} ORDER BY u.full_name "
            f"LIMIT ${len(args)+1} OFFSET ${len(args)+2}",
            *args, paging["limit"], paging["offset"])
    return db.Page.of(db.rows(recs), total, paging["limit"], paging["offset"])


# ---------------------------------------------------------------------------
# Bulk worker import.
#
# Built for someone who has never heard the word delimiter. One box. They paste
# what they copied, and the parsed rows come back as a table they correct before
# anything is written. The format is sniffed, never asked. Dry run is the
# default. The commit is one transaction, so a half-imported crew list never
# happens.
# ---------------------------------------------------------------------------
class UserImport(BaseModel):
    text: str = Field(min_length=1)
    dry_run: bool = True
    global_role: str = "monitor"
    employer_contractor_id: Optional[uuid.UUID] = None
    employer_name: Optional[str] = None
    default_password: Optional[str] = Field(default=None, min_length=8)


class BulkPassword(BaseModel):
    user_ids: list[uuid.UUID] = Field(min_length=1)
    password: str = Field(min_length=8)
    must_reset: bool = True


_IMPORT_FIELDS = [
    tabular.Field_("full_name", ("name", "full name", "worker", "employee",
                                 "employee name", "worker name", "person"),
                   tabular.is_name, priority=30),
    tabular.Field_("first_name", ("first", "first name", "given", "given name"),
                   priority=10),
    tabular.Field_("last_name", ("last", "last name", "surname", "family name"),
                   priority=11),
    tabular.Field_("middle_name", ("middle", "middle name", "mi"), priority=12),
    tabular.Field_("email", ("email", "e mail", "email address", "mail"),
                   tabular.is_email, priority=5),
    tabular.Field_("phone", ("phone", "mobile", "cell", "telephone", "phone number"),
                   tabular.is_phone, priority=6),
    tabular.Field_("employee_id", ("employee id", "employee no", "badge", "id",
                                   "emp id", "payroll", "payroll id"),
                   tabular.is_id, priority=20),
    tabular.Field_("monitor_id", ("monitor id", "monitor", "mon id"), priority=21),
    tabular.Field_("employer_name", ("company", "employer", "firm", "subcontractor",
                                     "company name", "vendor"), priority=40),
    tabular.Field_("username", ("username", "user name", "login", "user"), priority=41),
]


async def _next_monitor_id(conn: Any, prefix: str = "MON-") -> str:
    """The next free monitor ID in the prefix's sequence.

    Monitor IDs are system-unique keys printed on every ticket, and the
    walkthrough asked for a suggestion rather than a guess: pasting a crew list
    with a missing or wrong ID should not be the user's problem to solve.

    The next number is checked against what is actually issued rather than taken
    as one past the highest. IDs entered by hand leave gaps and do not always
    end in digits, and a candidate that is already taken fails at the write,
    which is the worst place to find out."""
    issued = {(r["monitor_id"] or "").upper() for r in await conn.fetch(
        "SELECT monitor_id FROM users WHERE monitor_id IS NOT NULL")}
    n = 0
    for value in issued:
        if value.startswith(prefix.upper()) and value[len(prefix):].isdigit():
            n = max(n, int(value[len(prefix):]))
    while True:
        n += 1
        candidate = f"{prefix}{n:03d}"
        if candidate.upper() not in issued:
            return candidate


def _username_for(row: dict[str, Any], taken: set[str]) -> str:
    """A username nobody has to invent. First initial and last name, which is
    what people expect, with a number only where it collides."""
    first = (row.get("first_name") or "").strip()
    last = (row.get("last_name") or "").strip()
    base = ((first[:1] + last) if last else (first or "worker")).lower()
    base = "".join(c for c in base if c.isalnum()) or "worker"
    name = base
    suffix = 2
    while name in taken:
        name = f"{base}{suffix}"
        suffix += 1
    return name


@users.post("/import")
async def import_users(body: UserImport, user: CurrentUser,
                       _: dict = Depends(require_permission("worker.manage"))):
    parsed = tabular.parse(body.text, _IMPORT_FIELDS)
    if not parsed.rows:
        raise bad_request(
            "Nothing readable in that paste. A block copied out of a spreadsheet, "
            "a table copied out of an email, or one name per line all work.",
            code="nothing_parsed")

    await _guard_granting_role(user, body.global_role)

    async with db.read() as conn:
        existing = await conn.fetch(
            """
            SELECT id, username, lower(email::text) AS email, employee_id,
                   employer_contractor_id, lower(employer_name) AS employer_name,
                   lower(full_name) AS full_name
              FROM users WHERE deleted_at IS NULL
            """)
        # J1: a monitor ID is a system-unique key printed on every ticket, and
        # asking somebody pasting a crew list to invent twenty of them is asking
        # for twenty collisions. The next free number in the sequence is
        # suggested instead, shown in the preview, and editable like every other
        # cell before anything is written.
        issued = await conn.fetch(
            "SELECT monitor_id FROM users WHERE monitor_id IS NOT NULL")

    # Numbering on from the highest is not enough on its own. An ID that does
    # not end in digits, or one issued out of sequence, leaves gaps that max+1
    # walks straight into, and the collision only shows up at the write. So the
    # whole set is held and every candidate is checked against it.
    issued_ids = {(r["monitor_id"] or "").upper() for r in issued}
    taken_monitor_ids = set(issued_ids)
    # Including the ones inside this paste. A preview suggests IDs for the rows
    # that need them; the corrected table comes back carrying those suggestions
    # and one row still blank, and an allocator that only knew what was already
    # in the database would hand that row an ID another row is about to take.
    taken_monitor_ids |= {(r.get("monitor_id") or "").strip().upper()
                          for r in parsed.rows if r.get("monitor_id")}
    next_monitor = 0
    for value in taken_monitor_ids:
        if value.startswith("MON-") and value[4:].isdigit():
            next_monitor = max(next_monitor, int(value[4:]))

    def suggest_monitor_id() -> str:
        nonlocal next_monitor
        while True:
            next_monitor += 1
            candidate = f"MON-{next_monitor:03d}"
            if candidate.upper() not in taken_monitor_ids:
                taken_monitor_ids.add(candidate.upper())
                return candidate

    taken_usernames = {r["username"].lower() for r in existing}
    by_badge = {(str(r["employer_contractor_id"] or r["employer_name"] or ""),
                 (r["employee_id"] or "").lower()): r["id"]
                for r in existing if r["employee_id"]}
    by_email = {r["email"]: r["id"] for r in existing if r["email"]}
    by_name = {((r["full_name"] or ""),
                str(r["employer_contractor_id"] or r["employer_name"] or "")): r["id"]
               for r in existing if r["full_name"]}

    employer_key = str(body.employer_contractor_id or body.employer_name or "")

    plan: list[dict[str, Any]] = []
    seen_in_paste: set[str] = set()
    monitor_ids_in_paste: set[str] = set()

    for index, raw in enumerate(parsed.rows):
        problems: list[str] = []
        row = dict(raw)
        source = parsed.source_lines[index] if index < len(parsed.source_lines) else ""

        # The split is shown, never applied silently, and the original string is
        # kept so a bad split is always recoverable.
        whole = row.pop("full_name", None)
        if whole and not (row.get("first_name") or row.get("last_name")):
            row.update({k: v for k, v in split_name(whole).items() if v})

        if not (row.get("first_name") or row.get("last_name")):
            problems.append("no name in this row, so there is nobody to create")

        row.setdefault("employer_name", body.employer_name)
        if body.employer_contractor_id:
            row["employer_contractor_id"] = str(body.employer_contractor_id)

        this_employer = str(row.get("employer_contractor_id")
                            or row.get("employer_name") or employer_key or "")

        match = None
        if row.get("employee_id"):
            match = by_badge.get((this_employer, row["employee_id"].lower()))
        if match is None and row.get("email"):
            match = by_email.get(row["email"].lower())
        if match is None and (row.get("first_name") or row.get("last_name")):
            whole_lower = " ".join(
                p for p in (row.get("first_name"), row.get("middle_name"),
                            row.get("last_name")) if p).lower()
            match = by_name.get((whole_lower, this_employer))

        # Two Mike Johnsons at two firms is normal. The same paste twice is
        # normal too, so a duplicate inside one paste is caught separately.
        fingerprint = "|".join([
            (row.get("employee_id") or "").lower(), this_employer,
            (row.get("email") or "").lower(),
            (row.get("first_name") or "").lower(), (row.get("last_name") or "").lower()])
        if fingerprint in seen_in_paste and not problems:
            problems.append("this row appears twice in what you pasted")
        seen_in_paste.add(fingerprint)

        username = row.get("username")
        if not username and not problems and match is None:
            username = _username_for(row, taken_usernames)
            taken_usernames.add(username)
        if username:
            row["username"] = username

        # Suggested, not imposed: numbered on from the highest already issued,
        # and only for rows that are actually going to create somebody.
        # A monitor ID somebody typed is checked here rather than left to fail
        # against a unique index halfway through the write, where the message
        # names a constraint and not the row.
        typed_monitor = (row.get("monitor_id") or "").strip().upper()
        if typed_monitor and match is None:
            if typed_monitor in monitor_ids_in_paste:
                problems.append("this monitor ID appears twice in what you pasted")
            elif typed_monitor in issued_ids:
                problems.append(
                    f"monitor ID {row['monitor_id']} already belongs to somebody else")
            monitor_ids_in_paste.add(typed_monitor)

        suggested_monitor = False
        if not row.get("monitor_id") and not problems and match is None:
            row["monitor_id"] = suggest_monitor_id()
            suggested_monitor = True

        plan.append({
            "row": index + 1,
            "action": "skip" if problems else ("update" if match else "create"),
            "existing_id": str(match) if match else None,
            "problems": problems,
            "source_text": source,
            "suggested": (["monitor_id"] if suggested_monitor else [])
                         + (["username"] if username and not raw.get("username") else []),
            "values": {k: v for k, v in row.items() if v},
        })

    creates = [p for p in plan if p["action"] == "create"]
    updates = [p for p in plan if p["action"] == "update"]
    skips = [p for p in plan if p["action"] == "skip"]

    summary = (
        f"{parsed.describe()} "
        f"{len(creates)} {'is' if len(creates) == 1 else 'are'} new. "
        f"{len(updates)} already here and would be updated. "
        f"{len(skips)} cannot be used yet.")

    if body.dry_run:
        return {"dry_run": True, "summary": summary, "rows": plan,
                "columns": parsed.columns, "header": parsed.header_row,
                "unmapped_columns": parsed.unmapped}

    password_hash = hash_password(body.default_password) if body.default_password else None
    written = 0
    async with db.tx(user) as conn:
        for p in plan:
            if p["action"] == "skip":
                continue
            values = dict(p["values"])
            if p["action"] == "create":
                values["global_role"] = body.global_role
                values["password_hash"] = password_hash
                values["must_reset"] = True
                sql, args = db.build_insert("users", values, returning="id")
                await conn.fetchval(sql, *args)
            else:
                values.pop("username", None)
                sql, args = db.build_update("users", values, "id = $1",
                                            [uuid.UUID(p["existing_id"])],
                                            returning="id")
                await conn.fetchval(sql, *args)
            written += 1

    return {"dry_run": False, "summary": summary, "written": written,
            "created": len(creates), "updated": len(updates), "skipped": len(skips)}


@users.post("/bulk-password")
async def bulk_password(body: BulkPassword, user: CurrentUser,
                        _: dict = Depends(require_permission("worker.manage"))):
    """One password across an explicit set of accounts, with a reset required on
    first sign in. Explicit: never "everyone", never "all new"."""
    async with db.read() as conn:
        targets = await conn.fetch(
            """
            SELECT u.id, u.username, r.rank
              FROM users u JOIN roles r ON r.code = u.global_role
             WHERE u.id = ANY($1::uuid[]) AND u.deleted_at IS NULL
            """, list(body.user_ids))

    if len(targets) != len(set(body.user_ids)):
        raise not_found("One or more of those accounts")

    elevated = [t for t in targets if t["rank"] >= ELEVATED_ROLE_RANK]
    if elevated and not await has_permission(user, "user.manage"):
        raise forbidden(permission_refusal(
            user, ["user.manage"],
            f"Setting the password on {len(elevated)} account(s) at analyst rank or above"))

    hashed = hash_password(body.password)
    async with db.tx({**user, "reason": "bulk password set"}) as conn:
        await conn.execute(
            """
            UPDATE users SET password_hash = $2, must_reset = $3, failed_logins = 0,
                             locked_until = NULL
             WHERE id = ANY($1::uuid[])
            """, [t["id"] for t in targets], hashed, body.must_reset)
        # Anyone signed in on an old password is signed out.
        await conn.execute(
            "UPDATE user_sessions SET revoked_at = now() "
            "WHERE user_id = ANY($1::uuid[]) AND revoked_at IS NULL",
            [t["id"] for t in targets])

    return {"updated": len(targets), "must_reset": body.must_reset,
            "usernames": [t["username"] for t in targets]}


@users.get("/{user_id}")
async def get_user(user_id: uuid.UUID, user: CurrentUser,
                   _: dict = Depends(require_permission("worker.manage"))):
    async with db.read() as conn:
        rec = await conn.fetchrow(
            f"{_USER_SELECT} WHERE u.id = $1 AND u.deleted_at IS NULL", user_id)
        assignments = await conn.fetch(
            """
            SELECT pa.*, p.name AS project_name, p.project_code
              FROM project_assignments pa JOIN projects p ON p.id = pa.project_id
             WHERE pa.user_id = $1 ORDER BY p.name
            """, user_id)
    if rec is None:
        raise not_found("User")
    return {**db.row(rec), "assignments": db.rows(assignments)}


@users.post("", status_code=201)
async def create_user(body: UserCreate, user: CurrentUser,
                      _: dict = Depends(require_permission("worker.manage"))):
    await _guard_granting_role(user, body.global_role)
    payload = apply_name(body.model_dump(exclude_none=True))
    if not (payload.get("first_name") or payload.get("last_name")):
        raise bad_request("A worker needs a name.", code="name_required")
    raw = payload.pop("password", None)
    payload["password_hash"] = hash_password(raw) if raw else None
    payload["must_reset"] = raw is None
    if payload.get("email"):
        payload["email"] = str(payload["email"])
    async with db.tx(user) as conn:
        if not payload.get("username"):
            taken = {r["username"].lower() for r in
                     await conn.fetch("SELECT username FROM users")}
            payload["username"] = _username_for(payload, taken)
        # A monitor writes tickets, and the monitor ID is what is printed on
        # them. Suggesting the next free one beats asking someone to guess a
        # key the system owns.
        if not payload.get("monitor_id") and payload.get("global_role", "monitor") == "monitor":
            payload["monitor_id"] = await _next_monitor_id(conn)
        sql, args = db.build_insert("users", payload, returning="id")
        new_id = await conn.fetchval(sql, *args)
        rec = await conn.fetchrow(f"{_USER_SELECT} WHERE u.id = $1", new_id)
    return db.row(rec)


@users.patch("/{user_id}")
async def update_user(user_id: uuid.UUID, body: UserUpdate, user: CurrentUser,
                      _: dict = Depends(require_permission("worker.manage"))):
    await _guard_editing_target(user, user_id)
    await _guard_granting_role(user, body.global_role)
    if body.is_active is False and not await has_permission(user, "user.manage"):
        raise forbidden(permission_refusal(
            user, ["user.manage"], "Deactivating an account"))
    payload = apply_name(body.model_dump(exclude_none=True))
    raw = payload.pop("password", None)
    if raw:
        payload["password_hash"] = hash_password(raw)
        payload["must_reset"] = False
    if payload.get("email"):
        payload["email"] = str(payload["email"])
    if not payload:
        return await get_user(user_id, user, user)
    sql, args = db.build_update("users", payload, "id = $1", [user_id], returning="id")
    async with db.tx(user) as conn:
        updated = await conn.fetchval(sql, *args)
        if updated is None:
            raise not_found("User")
        rec = await conn.fetchrow(f"{_USER_SELECT} WHERE u.id = $1", updated)
    return db.row(rec)


@users.delete("/{user_id}", status_code=204)
async def deactivate_user(user_id: uuid.UUID, user: CurrentUser,
                          _: dict = Depends(require_permission("user.manage"))):
    if user_id == user["id"]:
        raise bad_request("You cannot deactivate your own account")
    async with db.tx(user) as conn:
        await conn.execute(
            "UPDATE users SET is_active = false, deleted_at = now() WHERE id = $1",
            user_id)
        await conn.execute(
            "UPDATE user_sessions SET revoked_at = now() "
            "WHERE user_id = $1 AND revoked_at IS NULL", user_id)
    return None


# contract_extras is listed before contracts so /contracts/remediation is
# matched before /contracts/{item_id} tries to read it as a uuid.
routers = [clients, contractors, contract_extras, contracts, sites,
           equipment, disasters, users]
