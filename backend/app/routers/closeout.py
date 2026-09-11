"""Closeout packaging.

At project completion the client gets a zip: the data exported to spreadsheets
under an agreed naming convention, and a manifest accounting for every document
the project collected. The manifest is the audit answer to what was gathered,
where it lives, who verified it and when, and it says plainly what is still
unverified rather than leaving it out for someone to discover.

The documents themselves stay in Box or SharePoint. The package carries their
links, not their bytes, which is the same promise the registry makes everywhere
else.
"""
from __future__ import annotations

import csv
import io
import json
import re
import uuid
import zipfile
from datetime import date, datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, Body, Depends, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from .. import db
from ..deps import CurrentUser, ProjectContext, require_permission
from ..errors import bad_request

router = APIRouter(tags=["closeout"])

# What a filename may be built from. Anything else in a template is left alone
# so a typo shows up as itself rather than as an empty string.
TOKENS = ("project_code", "project_name", "client", "declaration", "kind",
          "title", "date", "contract_number", "seq")

DEFAULT_TEMPLATE = "{project_code}_{kind}_{title}_{date}"

_UNSAFE = re.compile(r"[^A-Za-z0-9._-]+")


class NamingBody(BaseModel):
    template: str


def slug(value: Any, limit: int = 60) -> str:
    """Filesystem-safe, and readable by the person who has to find the file."""
    text = _UNSAFE.sub("-", str(value or "")).strip("-._")
    return text[:limit] or "untitled"


def render(template: str, values: dict[str, Any]) -> str:
    out = template
    for token in TOKENS:
        out = out.replace("{" + token + "}", slug(values.get(token, "")))
    return slug(out, 160)


async def _naming_for(conn, project_id: uuid.UUID) -> str:
    settings = await conn.fetchval(
        "SELECT settings FROM projects WHERE id = $1", project_id) or {}
    return (settings.get("closeout") or {}).get("naming_template") or DEFAULT_TEMPLATE


async def _base_tokens(conn, project: dict[str, Any]) -> dict[str, Any]:
    """The values every filename in a package shares.

    Filled once, from the project, so {client} and {declaration} render as what
    they mean rather than as nothing. A token that silently produces an empty
    string is how a naming convention turns into a folder of near-identical
    filenames."""
    row = await conn.fetchrow(
        """
        SELECT cl.name AS client_name,
               ds.declaration_code,
               ct.contract_number
          FROM projects p
          LEFT JOIN clients cl   ON cl.id = p.client_id
          LEFT JOIN disasters ds ON ds.id = p.disaster_id
          LEFT JOIN contracts ct ON ct.id = p.primary_contract_id
         WHERE p.id = $1
        """, project["id"])
    return {
        "project_code": project["project_code"],
        "project_name": project["name"],
        "client": (row and row["client_name"]) or "",
        "declaration": (row and row["declaration_code"]) or "",
        "contract_number": (row and row["contract_number"]) or "",
    }


def _period_token(date_from: Optional[date], date_to: Optional[date]) -> str:
    """What {date} means for a package: the range if one was asked for, and the
    build date otherwise. The filename has to say which period it covers, or the
    second package looks exactly like the first."""
    stamp = datetime.now(timezone.utc).date().isoformat()
    if date_from and date_to:
        return f"{date_from.isoformat()}-to-{date_to.isoformat()}"
    if date_from:
        return f"from-{date_from.isoformat()}"
    if date_to:
        return f"through-{date_to.isoformat()}"
    return stamp


def _package_filenames(template: str, base: dict[str, Any], period: str,
                       wanted: list[str]) -> dict[str, str]:
    """Name every file the zip will hold, from the same template.

    The complaint this answers is exact: a convention that named the rows in
    the manifest but not the files on disk. Every name in a package now comes
    from here, the archive included."""
    dataset_title = {"tickets": "Tickets", "transactions": "Transactions",
                     "audit": "Audit-History"}
    names: dict[str, str] = {}
    for key, title in (("manifest.csv", "Document-Manifest"),
                       ("manifest.json", "Document-Manifest"),
                       ("readme", "README")):
        kind = "readme" if key == "readme" else "manifest"
        ext = "txt" if key == "readme" else key.split(".")[1]
        names[key] = render(template, {**base, "kind": kind, "title": title,
                                       "date": period, "seq": ""}) + "." + ext
    for name in wanted:
        names[name] = render(template, {
            **base, "kind": "export", "title": dataset_title.get(name, name),
            "date": period, "seq": ""}) + ".csv"
    names["archive"] = render(template, {**base, "kind": "closeout",
                                         "title": "Package", "date": period,
                                         "seq": ""})
    return names


@router.get("/projects/{project_id}/closeout/naming")
async def get_naming(ctx: ProjectContext, user: CurrentUser,
                     date_from: Optional[date] = None,
                     date_to: Optional[date] = None,
                     _: dict = Depends(require_permission("report.run"))):
    """The template, and what it actually produces. A naming convention nobody
    can see the output of is a naming convention nobody trusts, and one that
    names the manifest rows but not the files in the zip is worse than none."""
    pid = ctx["project"]["id"]
    async with db.read() as conn:
        template = await _naming_for(conn, pid)
        base = await _base_tokens(conn, ctx["project"])
        samples = await conn.fetch(
            """
            SELECT d.title, k.label AS kind_label, d.kind_code,
                   COALESCE(d.effective_from, d.created_at::date) AS dated,
                   c.contract_number
              FROM documents d
              JOIN document_kinds k ON k.code = d.kind_code
              LEFT JOIN contracts c ON c.id = d.entity_id AND d.entity_type = 'contracts'
             WHERE d.deleted_at IS NULL
               AND (d.project_id = $1 OR d.entity_id = $1
                    OR d.entity_type IN ('contracts', 'contractors', 'disposal_sites'))
             ORDER BY k.sort_order
             LIMIT 8
            """, pid)

    rendered = [
        {
            "kind": s["kind_label"],
            "filename": render(template, {
                **base,
                "kind": s["kind_code"],
                "title": s["title"],
                "date": s["dated"],
                "contract_number": s["contract_number"] or base["contract_number"],
                "seq": f"{i:03d}",
            }) + ".pdf",
        }
        for i, s in enumerate(samples, start=1)
    ]

    period = _period_token(date_from, date_to)
    names = _package_filenames(template, base, period,
                               ["tickets", "transactions", "audit"])
    package = [
        {"what": "Document manifest", "filename": names["manifest.csv"]},
        {"what": "Manifest (JSON)", "filename": names["manifest.json"]},
        {"what": "Ticket export", "filename": names["tickets"]},
        {"what": "Transaction export", "filename": names["transactions"]},
        {"what": "Audit export", "filename": names["audit"]},
        {"what": "Readme", "filename": names["readme"]},
        {"what": "The zip itself", "filename": names["archive"] + ".zip"},
    ]

    return {"template": template, "default": DEFAULT_TEMPLATE,
            "tokens": list(TOKENS), "examples": rendered,
            "package": package, "values": {**base, "date": period}}


@router.put("/projects/{project_id}/closeout/naming")
async def set_naming(ctx: ProjectContext, body: NamingBody, user: CurrentUser,
                     _: dict = Depends(require_permission("project.update"))):
    template = body.template.strip()
    if not template:
        raise bad_request("A naming template cannot be empty")
    if not any("{" + t + "}" in template for t in TOKENS):
        raise bad_request(
            "That template has no tokens in it, so every file would be named the "
            "same thing. Use at least one of: " + ", ".join("{" + t + "}" for t in TOKENS),
            code="template_has_no_tokens")

    async with db.tx(user) as conn:
        await conn.execute(
            """
            UPDATE projects
               SET settings = jsonb_set(
                     COALESCE(settings, '{}'::jsonb), '{closeout}',
                     COALESCE(settings -> 'closeout', '{}'::jsonb)
                       || jsonb_build_object('naming_template', $2::text), true)
             WHERE id = $1
            """, ctx["project"]["id"], template)
    return await get_naming(ctx, user, None, None, user)


# ---------------------------------------------------------------------------
# The manifest
# ---------------------------------------------------------------------------
MANIFEST_COLUMNS = ["filename", "kind", "title", "belongs_to", "source_url",
                    "provider", "verification_status", "verified_by", "verified_at",
                    "effective_from", "expires_on", "requested_from", "requested_on"]

DATASETS = {"tickets": "ticket_overview", "transactions": "transaction_ledger",
            "audit": "audit_trail"}

# Which column a date range means for each export. A range that silently meant
# something different per dataset would be worse than no range at all.
DATASET_DATE = {
    "tickets": "COALESCE(completed_at, created_at)",
    "transactions": "computed_at",
    "audit": "occurred_at",
}


def _range_clause(dataset: str, date_from: Optional[date],
                  date_to: Optional[date], args: list[Any]) -> str:
    """Appends bound parameters and returns the extra WHERE text."""
    column = DATASET_DATE[dataset]
    parts = []
    if date_from:
        args.append(date_from)
        parts.append(f"{column} >= ${len(args)}::date")
    if date_to:
        args.append(date_to)
        parts.append(f"{column} < (${len(args)}::date + 1)")
    return (" AND " + " AND ".join(parts)) if parts else ""


async def _manifest_rows(conn, project: dict[str, Any], template: str,
                         base: dict[str, Any]) -> list[dict]:
    pid = project["id"]
    docs = await conn.fetch(
        """
        SELECT d.*, k.label AS kind_label,
               v.full_name AS verified_by_name,
               CASE d.entity_type
                   WHEN 'contracts'      THEN (SELECT contract_number FROM contracts
                                                WHERE id = d.entity_id)
                   WHEN 'contractors'    THEN (SELECT name FROM contractors
                                                WHERE id = d.entity_id)
                   WHEN 'disposal_sites' THEN (SELECT name FROM disposal_sites
                                                WHERE id = d.entity_id)
                   WHEN 'clients'        THEN (SELECT name FROM clients
                                                WHERE id = d.entity_id)
                   WHEN 'projects'       THEN (SELECT name FROM projects
                                                WHERE id = d.entity_id)
                   ELSE d.entity_type
               END AS belongs_to
          FROM documents d
          JOIN document_kinds k ON k.code = d.kind_code
          LEFT JOIN users v ON v.id = d.verified_by
         WHERE d.deleted_at IS NULL
           AND (d.project_id = $1
                OR (d.entity_type = 'projects' AND d.entity_id = $1)
                OR (d.entity_type = 'contracts' AND d.entity_id IN (
                     SELECT contract_id FROM project_contracts WHERE project_id = $1))
                OR (d.entity_type = 'contractors' AND d.entity_id IN (
                     SELECT contractor_id FROM project_contractors WHERE project_id = $1))
                OR (d.entity_type = 'disposal_sites' AND d.entity_id IN (
                     SELECT site_id FROM project_sites WHERE project_id = $1))
                OR (d.entity_type = 'clients' AND d.entity_id = $2))
         ORDER BY k.sort_order, d.title
        """, pid, project["client_id"])

    rows = []
    for i, d in enumerate(docs, start=1):
        rows.append({
            "filename": render(template, {
                **base,
                "client": d["belongs_to"] or base["client"],
                "kind": d["kind_code"],
                "title": d["title"],
                "date": d["effective_from"] or d["created_at"].date(),
                "seq": f"{i:03d}",
            }) + ".pdf",
            "kind": d["kind_label"],
            "title": d["title"],
            "belongs_to": d["belongs_to"],
            "source_url": d["url"],
            "provider": d["provider"],
            "verification_status": d["verification_status"],
            "verified_by": d["verified_by_name"] or "",
            "verified_at": d["verified_at"].isoformat() if d["verified_at"] else "",
            "effective_from": str(d["effective_from"] or ""),
            "expires_on": str(d["expires_on"] or ""),
            "requested_from": d["requested_from"] or "",
            "requested_on": str(d["requested_on"] or ""),
        })
    return rows


@router.get("/projects/{project_id}/closeout/manifest")
async def closeout_manifest(ctx: ProjectContext, user: CurrentUser,
                            date_from: Optional[date] = None,
                            date_to: Optional[date] = None,
                            _: dict = Depends(require_permission("report.run"))):
    if date_from and date_to and date_to < date_from:
        raise bad_request("The end of the range falls before its start",
                          code="range_inverted")

    project = ctx["project"]
    async with db.read() as conn:
        template = await _naming_for(conn, project["id"])
        base = await _base_tokens(conn, project)
        rows = await _manifest_rows(conn, project, template, base)
        counts, totals = {}, {}
        for name, view in DATASETS.items():
            args: list[Any] = [project["id"]]
            extra = _range_clause(name, date_from, date_to, args)
            counts[name] = await conn.fetchval(
                f"SELECT count(*) FROM {view} WHERE project_id = $1{extra}", *args)
            totals[name] = await conn.fetchval(
                f"SELECT count(*) FROM {view} WHERE project_id = $1", project["id"])
        readiness = await conn.fetchrow(
            "SELECT * FROM project_readiness_summary WHERE project_id = $1",
            project["id"])

    unverified = [r for r in rows if r["verification_status"] != "verified"]
    expired = [r for r in rows if r["expires_on"] and r["expires_on"] < str(date.today())]
    period = _period_token(date_from, date_to)
    names = _package_filenames(template, base, period, list(DATASETS))

    return {
        "project_code": project["project_code"],
        "project_name": project["name"],
        "naming_template": template,
        "documents": rows,
        "document_count": len(rows),
        "datasets": counts,
        # What the same counts look like with no range applied, so the screen
        # can say how much a range is leaving out rather than just shrinking.
        "dataset_totals": totals,
        "date_from": date_from.isoformat() if date_from else None,
        "date_to": date_to.isoformat() if date_to else None,
        "period": period,
        "package_files": names,
        "unverified": [
            {"filename": r["filename"], "title": r["title"],
             "state": r["verification_status"]} for r in unverified],
        "expired": [{"filename": r["filename"], "expires_on": r["expires_on"]}
                    for r in expired],
        # Said out loud rather than left for someone to notice.
        "warnings": [
            w for w in [
                (f"{len(unverified)} document(s) in this package have not been verified"
                 if unverified else None),
                (f"{len(expired)} document(s) expired before closeout"
                 if expired else None),
                ("The project is not marked ready for billing, so the transaction "
                 "export may be incomplete"
                 if readiness and not readiness["ready_for_billing"] else None),
            ] if w
        ],
    }


def _csv(columns: list[str], rows: list[dict]) -> str:
    buffer = io.StringIO()
    writer = csv.DictWriter(buffer, fieldnames=columns, extrasaction="ignore")
    writer.writeheader()
    for row in rows:
        writer.writerow({c: row.get(c, "") for c in columns})
    return buffer.getvalue()


@router.get("/projects/{project_id}/closeout/package")
async def closeout_package(ctx: ProjectContext, user: CurrentUser,
                           datasets: str = Query("tickets,transactions,audit"),
                           date_from: Optional[date] = None,
                           date_to: Optional[date] = None,
                           _: dict = Depends(require_permission("report.run"))):
    """The zip itself: the data as spreadsheets, plus the manifest.

    Assembled from the registry rather than by hand, which is the whole point:
    nobody has to remember what was collected. Every name in it comes from the
    project's own template, including the zip, so a package built here and a
    package built next quarter file the same way.

    A date range narrows the exports, never the manifest. A document belongs to
    the project whatever month it was signed in, and dropping it from a period
    package would make the package look complete when it is not."""
    project = ctx["project"]
    wanted = [d.strip() for d in datasets.split(",") if d.strip() in DATASETS]
    if date_from and date_to and date_to < date_from:
        raise bad_request("The end of the range falls before its start",
                          code="range_inverted")

    async with db.tx(user) as conn:
        template = await _naming_for(conn, project["id"])
        tokens = await _base_tokens(conn, project)
        rows = await _manifest_rows(conn, project, template, tokens)

        exports: dict[str, tuple[list[str], list[dict]]] = {}
        for name in wanted:
            args: list[Any] = [project["id"]]
            extra = _range_clause(name, date_from, date_to, args)
            stmt = await conn.prepare(
                f"SELECT * FROM {DATASETS[name]} WHERE project_id = $1{extra} "
                f"LIMIT 50000")
            recs = await stmt.fetch(*args)
            data = db.rows(recs)
            # Headers come from the statement, not from the first row, so a
            # range that matches nothing still exports a readable, openable
            # spreadsheet rather than an empty file somebody has to ask about.
            columns = [a.name for a in stmt.get_attributes()]
            exports[name] = (columns, [
                {k: ("" if v is None else
                     v.isoformat() if isinstance(v, (datetime, date)) else
                     json.dumps(v) if isinstance(v, (dict, list)) else v)
                 for k, v in row.items()} for row in data])

        await conn.execute(
            """
            INSERT INTO audit_events (entity_type, entity_id, project_id, action,
                                      actor_id, actor_name, changed)
            VALUES ('projects', $1, $1, 'export', $2, $3, $4::jsonb)
            """, project["id"], user["id"], user["full_name"],
            {"closeout_package": True, "documents": len(rows),
             "date_from": date_from.isoformat() if date_from else None,
             "date_to": date_to.isoformat() if date_to else None,
             "datasets": {k: len(v[1]) for k, v in exports.items()}})

    stamp = datetime.now(timezone.utc).date().isoformat()
    period = _period_token(date_from, date_to)
    names = _package_filenames(template, tokens, period, wanted)
    base = names["archive"]
    if date_from and date_to:
        covers = f"records dated {date_from.isoformat()} through {date_to.isoformat()}"
    elif date_from:
        covers = f"records dated {date_from.isoformat()} onward"
    elif date_to:
        covers = f"records dated through {date_to.isoformat()}"
    else:
        covers = "every record on the project"

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(f"{base}/{names['manifest.csv']}", _csv(MANIFEST_COLUMNS, rows))
        zf.writestr(f"{base}/{names['manifest.json']}", json.dumps({
            "project_code": project["project_code"],
            "project_name": project["name"],
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "generated_by": user["full_name"],
            "naming_template": template,
            "period": period,
            "date_from": date_from.isoformat() if date_from else None,
            "date_to": date_to.isoformat() if date_to else None,
            "files": {k: v for k, v in names.items() if k != "archive"},
            "documents": rows,
            "note": ("Documents live in Box or SharePoint. This package carries "
                     "their links and their verification state, never the files."),
        }, indent=2, default=str))
        for name, (columns, data) in exports.items():
            zf.writestr(f"{base}/data/{names[name]}", _csv(columns, data))

        listing = "\n".join(
            f"data/{names[n]}\n    {len(exports[n][1])} row(s)" for n in exports)
        zf.writestr(f"{base}/{names['readme']}",
                    f"Closeout package for {project['project_code']} "
                    f"({project['name']})\n"
                    f"Generated {stamp} by {user['full_name']}\n"
                    f"Covers: {covers}\n"
                    f"Naming convention: {template}\n\n"
                    f"{names['manifest.csv']}\n"
                    f"    every document this project collected, with the link it "
                    f"lives behind and who verified it\n"
                    f"{names['manifest.json']}\n"
                    f"    the same manifest, machine readable, plus what this "
                    f"package covers\n"
                    f"{listing}\n\n"
                    f"Every filename above was generated from the project's naming "
                    f"convention, not typed by hand.\n\n"
                    f"The documents themselves are not in this package. The manifest "
                    f"names where each one lives. The manifest is never narrowed by a "
                    f"date range: a document belongs to the project whatever month it "
                    f"was signed in.\n")

    buffer.seek(0)
    return StreamingResponse(
        buffer, media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{base}.zip"'})
