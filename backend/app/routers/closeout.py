"""Closeout packaging.

At project completion the client gets a zip: the data exported to spreadsheets
under an agreed naming convention, and a manifest accounting for every document
the project collected. The manifest is the audit answer to what was gathered,
where it lives, who verified it and when, and it says plainly what is still
unverified rather than quietly leaving it out.

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


@router.get("/projects/{project_id}/closeout/naming")
async def get_naming(ctx: ProjectContext, user: CurrentUser,
                     _: dict = Depends(require_permission("report.run"))):
    """The template, and what it actually produces. A naming convention nobody
    can see the output of is a naming convention nobody trusts."""
    pid = ctx["project"]["id"]
    async with db.read() as conn:
        template = await _naming_for(conn, pid)
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

    project = ctx["project"]
    rendered = [
        {
            "kind": s["kind_label"],
            "filename": render(template, {
                "project_code": project["project_code"],
                "project_name": project["name"],
                "kind": s["kind_code"],
                "title": s["title"],
                "date": s["dated"],
                "contract_number": s["contract_number"],
            }) + ".pdf",
        }
        for s in samples
    ]
    return {"template": template, "default": DEFAULT_TEMPLATE,
            "tokens": list(TOKENS), "examples": rendered}


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
    return await get_naming(ctx, user, user)


# ---------------------------------------------------------------------------
# The manifest
# ---------------------------------------------------------------------------
MANIFEST_COLUMNS = ["filename", "kind", "title", "belongs_to", "source_url",
                    "provider", "verification_status", "verified_by", "verified_at",
                    "effective_from", "expires_on", "requested_from", "requested_on"]

DATASETS = {"tickets": "ticket_overview", "transactions": "transaction_ledger",
            "audit": "audit_trail"}


async def _manifest_rows(conn, project: dict[str, Any], template: str) -> list[dict]:
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
                "project_code": project["project_code"],
                "project_name": project["name"],
                "client": d["belongs_to"],
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
                            _: dict = Depends(require_permission("report.run"))):
    project = ctx["project"]
    async with db.read() as conn:
        template = await _naming_for(conn, project["id"])
        rows = await _manifest_rows(conn, project, template)
        counts = {}
        for name, view in DATASETS.items():
            counts[name] = await conn.fetchval(
                f"SELECT count(*) FROM {view} WHERE project_id = $1", project["id"])
        readiness = await conn.fetchrow(
            "SELECT * FROM project_readiness_summary WHERE project_id = $1",
            project["id"])

    unverified = [r for r in rows if r["verification_status"] != "verified"]
    expired = [r for r in rows if r["expires_on"] and r["expires_on"] < str(date.today())]

    return {
        "project_code": project["project_code"],
        "project_name": project["name"],
        "naming_template": template,
        "documents": rows,
        "document_count": len(rows),
        "datasets": counts,
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
                           _: dict = Depends(require_permission("report.run"))):
    """The zip itself: the data as spreadsheets, plus the manifest.

    Assembled from the registry rather than by hand, which is the whole point:
    nobody has to remember what was collected."""
    project = ctx["project"]
    wanted = [d.strip() for d in datasets.split(",") if d.strip() in DATASETS]

    async with db.tx(user) as conn:
        template = await _naming_for(conn, project["id"])
        rows = await _manifest_rows(conn, project, template)

        exports: dict[str, tuple[list[str], list[dict]]] = {}
        for name in wanted:
            recs = await conn.fetch(
                f"SELECT * FROM {DATASETS[name]} WHERE project_id = $1 LIMIT 50000",
                project["id"])
            data = db.rows(recs)
            columns = list(data[0].keys()) if data else []
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
             "datasets": {k: len(v[1]) for k, v in exports.items()}})

    stamp = datetime.now(timezone.utc).date().isoformat()
    base = slug(f"{project['project_code']}-closeout-{stamp}")

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(f"{base}/manifest.csv", _csv(MANIFEST_COLUMNS, rows))
        zf.writestr(f"{base}/manifest.json", json.dumps({
            "project_code": project["project_code"],
            "project_name": project["name"],
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "generated_by": user["full_name"],
            "naming_template": template,
            "documents": rows,
            "note": ("Documents live in Box or SharePoint. This package carries "
                     "their links and their verification state, never the files."),
        }, indent=2, default=str))
        for name, (columns, data) in exports.items():
            zf.writestr(f"{base}/data/{slug(project['project_code'])}-{name}.csv",
                        _csv(columns, data))
        zf.writestr(f"{base}/README.txt",
                    f"Closeout package for {project['project_code']} "
                    f"({project['name']})\n"
                    f"Generated {stamp} by {user['full_name']}\n\n"
                    f"manifest.csv  every document this project collected, with the "
                    f"link it lives behind and who verified it\n"
                    f"data/         the project's records exported as spreadsheets\n\n"
                    f"The documents themselves are not in this package. The manifest "
                    f"names where each one lives.\n")

    buffer.seek(0)
    return StreamingResponse(
        buffer, media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{base}.zip"'})
