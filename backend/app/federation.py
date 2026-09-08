"""The cryptographic visibility engine, carried across from OmniTodo.

private     the record never leaves this instance
public      anyone may read it, no signature required
restricted  a peer whose INSTANCE_UNIQUE_KEY is in allowed_viewers may read it
            once it presents a valid Ed25519 X-Signature over the request
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from fastapi import Request

from . import db
from .config import settings
from .errors import forbidden, unauthorized
from .security import body_digest, signing_payload, verify_signature

SIGNATURE_HEADER = "x-signature"
INSTANCE_HEADER = "x-instance-key"
TIMESTAMP_HEADER = "x-timestamp"
NONCE_HEADER = "x-nonce"


async def local_instance() -> dict[str, Any]:
    async with db.read() as conn:
        rec = await conn.fetchrow(
            "SELECT id, instance_key, display_name, organization, public_key_pem,"
            "       registry_opt_in, registry_url, settings, created_at"
            "  FROM instance LIMIT 1"
        )
    return dict(rec) if rec else {}


async def verify_peer(request: Request, body: bytes = b"") -> Optional[dict[str, Any]]:
    """Returns the trusted peer record, or None when the call is not a signed
    peer request. Raises when a peer request is present but does not verify."""
    instance_key = request.headers.get(INSTANCE_HEADER)
    signature = request.headers.get(SIGNATURE_HEADER)
    if not instance_key or not signature:
        return None

    timestamp = request.headers.get(TIMESTAMP_HEADER, "")
    nonce = request.headers.get(NONCE_HEADER, "")
    if not timestamp or not nonce:
        raise unauthorized("Signed peer requests require a timestamp and a nonce")

    try:
        sent_at = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
    except ValueError as exc:
        raise unauthorized("X-Timestamp is not a valid ISO 8601 instant") from exc

    skew = abs((datetime.now(timezone.utc) - sent_at).total_seconds())
    if skew > settings.peer_signature_skew_seconds:
        raise unauthorized(
            f"Signature timestamp is {int(skew)}s out of tolerance"
        )

    async with db.read() as conn:
        peer = await conn.fetchrow(
            "SELECT * FROM peer_instances WHERE instance_key = $1", instance_key
        )
    if peer is None:
        raise forbidden("Unknown peer instance")
    if peer["trust_state"] != "trusted":
        raise forbidden(f"Peer instance is {peer['trust_state']}")
    if not peer["public_key_pem"]:
        raise forbidden("Peer instance has no public key on file")

    payload = signing_payload(
        request.method, request.url.path, instance_key, timestamp, nonce,
        body_digest(body),
    )
    if not verify_signature(peer["public_key_pem"], payload, signature):
        raise unauthorized("Signature verification failed")

    # Replay protection.
    async with db.tx({"source": "peer_sync"}) as conn:
        inserted = await conn.fetchval(
            """
            INSERT INTO peer_request_nonces (nonce, instance_key)
            VALUES ($1, $2) ON CONFLICT (nonce) DO NOTHING
            RETURNING nonce
            """,
            nonce, instance_key,
        )
        if inserted is None:
            raise unauthorized("Nonce has already been used")
        await conn.execute(
            "DELETE FROM peer_request_nonces WHERE seen_at < now() - interval '1 day'"
        )
        await conn.execute(
            "UPDATE peer_instances SET last_seen_at = now() WHERE instance_key = $1",
            instance_key,
        )

    return dict(peer)


def visibility_allows(record: dict[str, Any], peer_key: Optional[str],
                      is_local_user: bool) -> bool:
    flag = record.get("visibility_flag", "private")
    if flag == "public":
        return True
    if is_local_user:
        return True
    if flag == "restricted" and peer_key:
        return peer_key in (record.get("allowed_viewers") or [])
    return False


async def assert_readable(record: dict[str, Any], request: Request,
                          user: Optional[dict[str, Any]], body: bytes = b"") -> None:
    peer = await verify_peer(request, body)
    peer_key = peer["instance_key"] if peer else None
    if not visibility_allows(record, peer_key, user is not None):
        raise forbidden("This record is not shared with you")

    if peer_key:
        async with db.tx({"instance_key": peer_key, "source": "peer_sync"}) as conn:
            await conn.execute(
                """
                INSERT INTO audit_events (entity_type, entity_id, project_id, action,
                                          actor_instance_key, source, changed)
                VALUES ($1, $2, $3, 'peer_read', $4, 'peer_sync', '{}'::jsonb)
                """,
                record.get("_entity_type", "tickets"),
                record.get("id"),
                record.get("project_id"),
                peer_key,
            )
