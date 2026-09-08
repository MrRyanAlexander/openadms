"""Instance identity, peer management, and the signed peer read endpoint."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, Body, Depends, Request
from pydantic import BaseModel, Field

from .. import db, federation
from ..config import settings
from ..deps import CurrentUser, require_permission
from ..errors import bad_request, forbidden, not_found
from ..security import generate_instance_key, generate_keypair

router = APIRouter(tags=["instance"])


class InstanceBody(BaseModel):
    display_name: Optional[str] = None
    organization: Optional[str] = None
    registry_opt_in: Optional[bool] = None
    registry_url: Optional[str] = None
    settings: Optional[dict[str, Any]] = None


class PeerBody(BaseModel):
    instance_key: str = Field(min_length=16)
    display_name: str
    base_url: Optional[str] = None
    public_key_pem: Optional[str] = None
    trust_state: str = "pending"
    notes: Optional[str] = None


@router.get("/instance")
async def get_instance(user: CurrentUser):
    """The instance's public identity. The private key never appears here."""
    record = await federation.local_instance()
    if not record:
        raise not_found("Instance identity")
    return record


@router.post("/instance", status_code=201)
async def provision_instance(user: CurrentUser, body: InstanceBody = Body(default=None),
                             _: dict = Depends(require_permission("instance.manage"))):
    """Mint the INSTANCE_UNIQUE_KEY and signing key pair. Runs once; the
    installer normally does this before the API is first started."""
    existing = await federation.local_instance()
    if existing:
        raise bad_request("This deployment already has an instance identity")
    private_pem, public_pem = generate_keypair()
    async with db.tx(user) as conn:
        rec = await conn.fetchrow(
            """
            INSERT INTO instance (instance_key, display_name, organization,
                                  public_key_pem, private_key_pem)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id, instance_key, display_name, organization, public_key_pem
            """,
            settings.instance_key or generate_instance_key(),
            (body.display_name if body else None) or "Open ADMS",
            body.organization if body else None,
            public_pem, private_pem)
    return db.row(rec)


@router.patch("/instance")
async def update_instance(body: InstanceBody, user: CurrentUser,
                          _: dict = Depends(require_permission("instance.manage"))):
    data = body.model_dump(exclude_none=True)
    if not data:
        raise bad_request("No updatable fields supplied")
    sql, args = db.build_update(
        "instance", data, "singleton", [],
        returning="id, instance_key, display_name, organization, public_key_pem, "
                  "registry_opt_in, registry_url, settings")
    async with db.tx(user) as conn:
        rec = await conn.fetchrow(sql, *args)
    return db.row(rec)


@router.post("/instance/rotate-keys")
async def rotate_keys(user: CurrentUser,
                      _: dict = Depends(require_permission("instance.manage"))):
    """Rotates the signing key pair. The INSTANCE_UNIQUE_KEY is deliberately
    left alone, since peers reference this deployment by it."""
    private_pem, public_pem = generate_keypair()
    async with db.tx({**user, "reason": "key rotation"}) as conn:
        rec = await conn.fetchrow(
            "UPDATE instance SET public_key_pem = $1, private_key_pem = $2 "
            "WHERE singleton RETURNING instance_key, public_key_pem",
            public_pem, private_pem)
    return db.row(rec)


# ---------------------------------------------------------------------------
# Peers
# ---------------------------------------------------------------------------
@router.get("/peers")
async def list_peers(user: CurrentUser,
                     _: dict = Depends(require_permission("peer.manage"))):
    async with db.read() as conn:
        recs = await conn.fetch(
            """
            SELECT p.*,
                   (SELECT count(*) FROM projects pr
                     WHERE pr.allowed_viewers @> ARRAY[p.instance_key]) AS shared_projects,
                   (SELECT count(*) FROM tickets t
                     WHERE t.allowed_viewers @> ARRAY[p.instance_key]) AS shared_tickets
              FROM peer_instances p ORDER BY p.display_name
            """)
    return {"items": db.rows(recs)}


@router.post("/peers", status_code=201)
async def add_peer(body: PeerBody, user: CurrentUser,
                   _: dict = Depends(require_permission("peer.manage"))):
    sql, args = db.build_insert("peer_instances", body.model_dump(exclude_none=True))
    async with db.tx(user) as conn:
        rec = await conn.fetchrow(sql, *args)
    return db.row(rec)


@router.patch("/peers/{peer_id}")
async def update_peer(peer_id: uuid.UUID, user: CurrentUser,
                      payload: dict[str, Any] = Body(...),
                      _: dict = Depends(require_permission("peer.manage"))):
    allowed = {"display_name", "base_url", "public_key_pem", "trust_state", "notes"}
    data = {k: v for k, v in payload.items() if k in allowed}
    if not data:
        raise bad_request("No updatable fields supplied")
    sql, args = db.build_update("peer_instances", data, "id = $1", [peer_id])
    async with db.tx(user) as conn:
        rec = await conn.fetchrow(sql, *args)
    if rec is None:
        raise not_found("Peer")
    return db.row(rec)


@router.delete("/peers/{peer_id}", status_code=204)
async def remove_peer(peer_id: uuid.UUID, user: CurrentUser,
                      _: dict = Depends(require_permission("peer.manage"))):
    async with db.tx(user) as conn:
        await conn.execute("DELETE FROM peer_instances WHERE id = $1", peer_id)
    return None


# ---------------------------------------------------------------------------
# The signed peer read surface
# ---------------------------------------------------------------------------
@router.get("/peer/projects/{project_id}/tickets")
async def peer_read_tickets(project_id: uuid.UUID, request: Request,
                            limit: int = 100, offset: int = 0):
    """What a peer instance calls. Public projects answer to anyone; restricted
    projects answer only to an allow-listed key presenting a valid signature."""
    async with db.read() as conn:
        project = await conn.fetchrow(
            "SELECT * FROM projects WHERE id = $1 AND deleted_at IS NULL", project_id)
    if project is None:
        raise not_found("Project")

    record = dict(project)
    record["_entity_type"] = "projects"
    record["project_id"] = project_id
    await federation.assert_readable(record, request, user=None)

    async with db.read() as conn:
        tickets = await conn.fetch(
            """
            SELECT id, ticket_number, ticket_type_code, status, debris_type,
                   load_call_pct, billable_cubic_yards, net_tons,
                   origin_address, origin_at, destination_site_name, destination_at,
                   contractor_name, truck_number, completed_at
              FROM ticket_overview
             WHERE project_id = $1 AND NOT is_void
               AND visibility_flag <> 'private'
             ORDER BY completed_at DESC NULLS LAST
             LIMIT $2 OFFSET $3
            """, project_id, min(limit, 500), offset)
    return {
        "project": {"id": str(project["id"]), "name": project["name"],
                    "project_code": project["project_code"],
                    "visibility_flag": project["visibility_flag"]},
        "served_by": (await federation.local_instance()).get("instance_key"),
        "served_at": datetime.now(timezone.utc).isoformat(),
        "items": db.rows(tickets),
    }


@router.get("/peer/identity")
async def peer_identity():
    """Unauthenticated. How a peer discovers this instance's key and public key
    so it can be added on the other side."""
    record = await federation.local_instance()
    if not record:
        raise not_found("Instance identity")
    return {
        "instance_key": record["instance_key"],
        "display_name": record["display_name"],
        "organization": record.get("organization"),
        "public_key_pem": record.get("public_key_pem"),
        "api_version": settings.version,
    }
