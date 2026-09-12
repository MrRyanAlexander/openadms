"""Certification measurement: the tape measure, not the answer.

The requirement in one line: "Do not just record the answer. Record the
measurements that produced the answer."

A human stands at the trailer with a tape, enters what they measured, and the
application hands back the volume. The endpoint that matters most here is
`/measurements/preview`, which is stateless and runs the same
`adms_shape_volume` the saved worksheet runs. That is the only way the number
on the monitor's device, the number on the paper form and the number the
certification carries can be guaranteed to be the same number.

Everything is in inches, because that is what comes off a tape.
"""
from __future__ import annotations

import uuid
from typing import Any, Optional

import asyncpg
from fastapi import APIRouter, Body, Depends, Query
from pydantic import BaseModel, Field

from .. import db
from ..deps import CurrentUser, require_permission
from ..errors import bad_request, conflict, not_found

router = APIRouter(tags=["measurements"])

_SLOTS = ("front", "rear", "side", "interior", "placard", "measurement",
          "paper_form", "other")


class SectionBody(BaseModel):
    label: str = Field(min_length=1, max_length=120)
    shape_code: str
    role: str = Field(default="base", pattern="^(base|addition|deduction)$")
    quantity: int = Field(default=1, ge=1, le=99)
    dimensions: dict[str, Any] = Field(default_factory=dict)
    notes: Optional[str] = None
    sequence: Optional[int] = None


class PreviewBody(BaseModel):
    sections: list[SectionBody] = Field(min_length=1, max_length=40)
    rounding_rule: str = Field(
        default="exact",
        pattern="^(exact|nearest_tenth|nearest_half|nearest_whole|down_whole)$")
    container_type_code: Optional[str] = None


class WorksheetBody(BaseModel):
    container_type_code: str
    intended_use: Optional[str] = None
    measurement_method: str = Field(
        default="tape", pattern="^(tape|laser|manufacturer_drawing|other)$")
    measured_on: Optional[str] = None
    measured_by_name: Optional[str] = None
    interior_only: bool = True
    door_included: bool = True
    paper_form_number: Optional[str] = None
    rounding_rule: str = Field(
        default="exact",
        pattern="^(exact|nearest_tenth|nearest_half|nearest_whole|down_whole)$")
    device_notes: Optional[str] = None
    # A worksheet can arrive complete from the field in one call, which is what
    # the device does when it comes back into signal.
    sections: Optional[list[SectionBody]] = None


class MediaBody(BaseModel):
    slot: str = "other"
    storage_url: str
    thumbnail_url: Optional[str] = None
    description: Optional[str] = None
    captured_at: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    content_type: Optional[str] = None
    section_id: Optional[uuid.UUID] = None


# ---------------------------------------------------------------------------
# The catalogs. Both screens build their forms from these, so a new shape or a
# new container type needs no client release.
# ---------------------------------------------------------------------------
@router.get("/measurements/shapes")
async def list_shapes(user: CurrentUser):
    """Every calculation method, with the dimensions each one asks for."""
    async with db.read() as conn:
        rows = await conn.fetch(
            "SELECT * FROM measurement_shapes WHERE is_active ORDER BY sort_order")
    return {"items": db.rows(rows)}


@router.get("/measurements/container-types")
async def list_container_types(user: CurrentUser,
                               category: Optional[str] = Query(None)):
    """What can be measured, what it is normally used for, which photographs it
    needs, and a worksheet to start from."""
    where = ["is_active"]
    args: list[Any] = []
    if category:
        args.append(category)
        where.append(f"category = ${len(args)}")
    async with db.read() as conn:
        rows = await conn.fetch(
            f"SELECT * FROM container_types WHERE {' AND '.join(where)} "
            f"ORDER BY sort_order, label", *args)
    return {"items": db.rows(rows)}


# ---------------------------------------------------------------------------
# The calculator.
# ---------------------------------------------------------------------------
async def _compute(conn, sections: list[SectionBody], rounding: str,
                   container_type_code: Optional[str]) -> dict[str, Any]:
    payload = [{
        "ord": i,
        "shape_code": s.shape_code,
        "dimensions": s.dimensions,
    } for i, s in enumerate(sections, start=1)]

    try:
        computed = await conn.fetch(
            """
            SELECT x.ord, adms_shape_volume(x.shape_code, x.dimensions) AS unit
              FROM jsonb_to_recordset($1)
                   AS x(ord integer, shape_code text, dimensions jsonb)
             ORDER BY x.ord
            """, payload)
    except asyncpg.PostgresError:
        # One query is right for a device recalculating as somebody types, but
        # a refusal has to name the section it came from rather than the batch.
        for i, s in enumerate(sections, start=1):
            try:
                await conn.fetchval("SELECT adms_shape_volume($1, $2)",
                                    s.shape_code, s.dimensions)
            except asyncpg.PostgresError as exc:
                raise bad_request(
                    f"{s.label}: {getattr(exc, 'message', None) or exc}",
                    code="section_refused", section=i, label=s.label) from exc
        raise

    units = {int(r["ord"]): float(r["unit"]) for r in computed}
    out_sections = []
    base = additions = deductions = 0.0

    for i, s in enumerate(sections, start=1):
        unit = round(units.get(i, 0.0), 3)
        total = round(unit * s.quantity, 3)
        if s.role == "base":
            base += total
        elif s.role == "addition":
            additions += total
        else:
            deductions += total
        out_sections.append({
            "sequence": s.sequence or i,
            "label": s.label,
            "shape_code": s.shape_code,
            "role": s.role,
            "quantity": s.quantity,
            "dimensions": s.dimensions,
            "unit_cubic_inches": unit,
            "cubic_inches": total,
            "cubic_feet": round(total / 1728.0, 4),
            "cubic_yards": round(total / 46656.0, 4),
            "notes": s.notes,
        })

    total_in = round(base + additions - deductions, 3)
    if total_in < 0:
        raise bad_request(
            "The deductions on this worksheet remove more than the container "
            "holds. Check the deducted sections before going further.",
            code="deductions_exceed_volume")

    cy = await conn.fetchval("SELECT adms_round_capacity($1::numeric, $2)",
                             total_in / 46656.0, rounding)

    out: dict[str, Any] = {
        "sections": out_sections,
        "base_cubic_inches": round(base, 3),
        "addition_cubic_inches": round(additions, 3),
        "deduction_cubic_inches": round(deductions, 3),
        "total_cubic_inches": total_in,
        "total_cubic_feet": round(total_in / 1728.0, 4),
        "total_cubic_yards": round(total_in / 46656.0, 4),
        "rounding_rule": rounding,
        "capacity_cy": float(cy or 0),
    }

    # What this kind of equipment normally comes out at. Said rather than
    # enforced: unusual equipment is real, and a reviewer decides.
    if container_type_code:
        band = await conn.fetchrow(
            "SELECT label, typical_min_cy, typical_max_cy FROM container_types "
            " WHERE code = $1", container_type_code)
        if band and band["typical_min_cy"] is not None:
            low = float(band["typical_min_cy"])
            high = float(band["typical_max_cy"])
            out["typical_min_cy"] = low
            out["typical_max_cy"] = high
            out["within_typical_range"] = low <= out["total_cubic_yards"] <= high
            if not out["within_typical_range"]:
                out["range_note"] = (
                    f"A {band['label'].lower()} normally measures between "
                    f"{low:g} and {high:g} CY. This one is "
                    f"{out['total_cubic_yards']:g}.")

    out["message"] = (
        f"{out['capacity_cy']:g} CY from "
        f"{len(out_sections)} section{'' if len(out_sections) == 1 else 's'}. "
        f"{total_in:,.0f} cubic inches, "
        f"{out['total_cubic_feet']:,.1f} cubic feet.")
    return out


@router.post("/measurements/preview")
async def preview_measurement(body: PreviewBody, user: CurrentUser):
    """What these measurements come to, without saving anything.

    The field app calls this while the monitor is still holding the tape, which
    is how the device gives back the cubic inches that go on the paper form.
    Same function the saved worksheet uses, so the two cannot disagree."""
    async with db.read() as conn:
        return await _compute(conn, body.sections, body.rounding_rule,
                              body.container_type_code)


# ---------------------------------------------------------------------------
# The worksheet on a certification.
# ---------------------------------------------------------------------------
async def _worksheet(conn, certification_id: uuid.UUID) -> Optional[dict]:
    row = await conn.fetchrow(
        "SELECT * FROM certification_measurement_detail WHERE certification_id = $1",
        certification_id)
    return db.row(row) if row else None


async def _require_draft(conn, certification_id: uuid.UUID) -> dict[str, Any]:
    cert = await conn.fetchrow(
        "SELECT id, project_id, status FROM project_equipment_certifications "
        " WHERE id = $1", certification_id)
    if cert is None:
        raise not_found("Certification")
    if cert["status"] != "draft":
        raise conflict(
            f"This certification is {cert['status']}, so its measurements are "
            "closed. Record a correction if the number was wrong.",
            code="measurement_closed", status=cert["status"])
    return dict(cert)


@router.get("/certifications/{certification_id}/measurement")
async def get_measurement(certification_id: uuid.UUID, user: CurrentUser,
                          _: dict = Depends(require_permission("equipment.manage"))):
    """How this capacity was determined: the container, the sections, the
    dimensions, the formula and the arithmetic."""
    async with db.read() as conn:
        sheet = await _worksheet(conn, certification_id)
        if sheet is None:
            cert = await conn.fetchrow(
                "SELECT id, certified_capacity_cy, status "
                "  FROM project_equipment_certifications WHERE id = $1",
                certification_id)
            if cert is None:
                raise not_found("Certification")
            # Not an error. It is the finding: this capacity was typed.
            return {
                "certification_id": str(certification_id),
                "measured": False,
                "certified_capacity_cy": cert["certified_capacity_cy"],
                "message": (
                    "This capacity was entered directly. Nothing in the record "
                    "says how it was reached, which is what the review queue "
                    "raises against it."),
            }
        evidence = await conn.fetchrow(
            "SELECT * FROM certification_evidence WHERE certification_id = $1",
            certification_id)
    sheet["measured"] = True
    sheet["evidence"] = db.row(evidence)
    return sheet


@router.post("/certifications/{certification_id}/measurement", status_code=201)
async def save_measurement(certification_id: uuid.UUID, body: WorksheetBody,
                           user: CurrentUser,
                           _: dict = Depends(require_permission("equipment.manage"))):
    """Start or replace the worksheet on a draft certification.

    Replacing it clears the sections rather than merging them, because a
    half replaced worksheet is a number nobody can defend."""
    async with db.tx(user) as conn:
        await _require_draft(conn, certification_id)

        await conn.execute(
            "DELETE FROM certification_measurements WHERE certification_id = $1",
            certification_id)

        sheet = await conn.fetchrow(
            """
            INSERT INTO certification_measurements (
                certification_id, container_type_code, intended_use,
                measurement_method, measured_by, measured_by_name, measured_on,
                interior_only, door_included, paper_form_number, rounding_rule,
                device_notes, created_by)
            VALUES ($1, $2, $3, $4, $5, $6,
                    COALESCE($7::date, current_date), $8, $9, $10, $11, $12, $5)
            RETURNING *
            """, certification_id, body.container_type_code, body.intended_use,
            body.measurement_method, user["id"],
            body.measured_by_name or user["full_name"], body.measured_on,
            body.interior_only, body.door_included, body.paper_form_number,
            body.rounding_rule, body.device_notes)

        if body.sections:
            await _write_sections(conn, sheet["id"], body.sections, start=1)

        out = await _worksheet(conn, certification_id)
    return out


async def _write_sections(conn, measurement_id, sections: list[SectionBody],
                          start: int = 1) -> int:
    """Sections go in one at a time so a refusal can name the one that failed.

    The volume of each is computed by trigger, so nothing here does arithmetic
    the database would do differently."""
    written = 0
    for offset, s in enumerate(sections):
        try:
            await conn.execute(
                """
                INSERT INTO certification_sections (
                    measurement_id, sequence, label, shape_code, role,
                    quantity, dimensions, notes)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                """, measurement_id, s.sequence or (start + offset), s.label,
                s.shape_code, s.role, s.quantity, s.dimensions, s.notes)
            written += 1
        except asyncpg.PostgresError as exc:
            raise bad_request(
                f"{s.label}: {getattr(exc, 'message', None) or exc}",
                code="section_refused", label=s.label) from exc
    return written


@router.post("/certifications/{certification_id}/measurement/sections",
             status_code=201)
async def add_section(certification_id: uuid.UUID, body: SectionBody,
                      user: CurrentUser,
                      _: dict = Depends(require_permission("equipment.manage"))):
    """Add one measured shape to the worksheet."""
    async with db.tx(user) as conn:
        await _require_draft(conn, certification_id)
        measurement_id = await conn.fetchval(
            "SELECT id FROM certification_measurements WHERE certification_id = $1",
            certification_id)
        if measurement_id is None:
            raise bad_request(
                "Say what is being measured before measuring it. Pick a "
                "container type first.", code="worksheet_missing")

        if body.sequence is None:
            body.sequence = await conn.fetchval(
                "SELECT COALESCE(max(sequence), 0) + 1 FROM certification_sections"
                " WHERE measurement_id = $1", measurement_id)

        await _write_sections(conn, measurement_id, [body])
        out = await _worksheet(conn, certification_id)
    return out


@router.patch("/measurements/sections/{section_id}")
async def update_section(section_id: uuid.UUID, body: SectionBody,
                         user: CurrentUser,
                         _: dict = Depends(require_permission("equipment.manage"))):
    """Correct one measurement on an open worksheet."""
    async with db.tx(user) as conn:
        cert_id = await conn.fetchval(
            """
            SELECT m.certification_id FROM certification_sections s
              JOIN certification_measurements m ON m.id = s.measurement_id
             WHERE s.id = $1
            """, section_id)
        if cert_id is None:
            raise not_found("Section")
        await _require_draft(conn, cert_id)

        try:
            await conn.execute(
                """
                UPDATE certification_sections
                   SET label = $2, shape_code = $3, role = $4, quantity = $5,
                       dimensions = $6, notes = $7
                 WHERE id = $1
                """, section_id, body.label, body.shape_code, body.role,
                body.quantity, body.dimensions, body.notes)
        except asyncpg.PostgresError as exc:
            raise bad_request(getattr(exc, "message", None) or str(exc),
                              code="section_refused") from exc

        out = await _worksheet(conn, cert_id)
    return out


@router.delete("/measurements/sections/{section_id}")
async def delete_section(section_id: uuid.UUID, user: CurrentUser,
                         _: dict = Depends(require_permission("equipment.manage"))):
    """Take a shape back off an open worksheet."""
    async with db.tx(user) as conn:
        cert_id = await conn.fetchval(
            """
            SELECT m.certification_id FROM certification_sections s
              JOIN certification_measurements m ON m.id = s.measurement_id
             WHERE s.id = $1
            """, section_id)
        if cert_id is None:
            raise not_found("Section")
        await _require_draft(conn, cert_id)
        await conn.execute("DELETE FROM certification_sections WHERE id = $1",
                           section_id)
        out = await _worksheet(conn, cert_id)
    return out


# ---------------------------------------------------------------------------
# The photographs.
# ---------------------------------------------------------------------------
@router.get("/certifications/{certification_id}/media")
async def list_media(certification_id: uuid.UUID, user: CurrentUser,
                     _: dict = Depends(require_permission("equipment.manage"))):
    """Every photograph on this certification, and which required ones are
    still missing."""
    async with db.read() as conn:
        rows = await conn.fetch(
            "SELECT * FROM certification_media "
            " WHERE certification_id = $1 AND deleted_at IS NULL "
            " ORDER BY slot, created_at", certification_id)
        evidence = await conn.fetchrow(
            "SELECT * FROM certification_evidence WHERE certification_id = $1",
            certification_id)
    return {"items": db.rows(rows), "evidence": db.row(evidence)}


@router.post("/certifications/{certification_id}/media", status_code=201)
async def add_media(certification_id: uuid.UUID, body: MediaBody,
                    user: CurrentUser,
                    _: dict = Depends(require_permission("equipment.manage"))):
    """Attach a photograph. The file lives in Box or SharePoint; this holds the
    link, the same as every other document in the system."""
    if body.slot not in _SLOTS:
        raise bad_request(
            "That is not one of the photographs a certification carries.",
            code="slot_invalid", allowed=list(_SLOTS))
    url = (body.storage_url or "").strip()
    if not url.lower().startswith(("http://", "https://")) or " " in url:
        raise bad_request(
            "A photograph link has to be a full http or https URL into "
            "wherever the file lives.", code="media_url_invalid")

    async with db.tx(user) as conn:
        exists = await conn.fetchval(
            "SELECT 1 FROM project_equipment_certifications WHERE id = $1",
            certification_id)
        if not exists:
            raise not_found("Certification")
        rec = await conn.fetchrow(
            """
            INSERT INTO certification_media (
                certification_id, slot, section_id, description, storage_url,
                thumbnail_url, content_type, latitude, longitude, captured_at,
                uploaded_by)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::timestamptz, $11)
            RETURNING *
            """, certification_id, body.slot, body.section_id, body.description,
            url, body.thumbnail_url, body.content_type, body.latitude,
            body.longitude, body.captured_at, user["id"])
    return db.row(rec)


@router.delete("/certifications/{certification_id}/media/{media_id}",
               status_code=204)
async def delete_media(certification_id: uuid.UUID, media_id: uuid.UUID,
                       user: CurrentUser,
                       _: dict = Depends(require_permission("equipment.manage"))):
    async with db.tx(user) as conn:
        await conn.execute(
            "UPDATE certification_media SET deleted_at = now() "
            " WHERE id = $1 AND certification_id = $2", media_id, certification_id)
    return None
