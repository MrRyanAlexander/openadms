"""Authentication. Passwords are bcrypt, sessions are refresh tokens stored as
sha256 digests, and every attempt is written to the audit trail."""
from __future__ import annotations

import ipaddress
import uuid
from typing import Any, Optional

from fastapi import APIRouter, Request
from pydantic import BaseModel, Field

from .. import db
from ..deps import CurrentUser
from ..errors import unauthorized
from ..security import (
    create_access_token,
    create_refresh_token,
    hash_password,
    hash_refresh_token,
    verify_password,
)

router = APIRouter(prefix="/auth", tags=["auth"])

MAX_FAILED = 8


class LoginBody(BaseModel):
    username: str = Field(min_length=1)
    password: str = Field(min_length=1)


class RefreshBody(BaseModel):
    refresh_token: str


class PasswordBody(BaseModel):
    current_password: Optional[str] = None
    new_password: str = Field(min_length=8)


def _client_ip(request: Request) -> Optional[str]:
    """Behind Netlify/Railway the real address arrives in a forwarding header."""
    forwarded = request.headers.get("x-forwarded-for", "")
    candidate = forwarded.split(",")[0].strip() if forwarded else (
        request.client.host if request.client else "")
    try:
        ipaddress.ip_address(candidate)
        return candidate
    except ValueError:
        return None


async def _issue(conn, user: dict[str, Any], request: Request) -> dict[str, Any]:
    token, digest, expires = create_refresh_token()
    await conn.execute(
        """
        INSERT INTO user_sessions (user_id, refresh_hash, user_agent, ip_address, expires_at)
        VALUES ($1, $2, $3, $4::inet, $5)
        """,
        user["id"], digest, request.headers.get("user-agent", "")[:500],
        _client_ip(request), expires,
    )
    access = create_access_token(
        str(user["id"]),
        {"role": user["global_role"], "name": user["full_name"],
         "username": user["username"]},
    )
    return {"access_token": access, "refresh_token": token, "token_type": "bearer"}


@router.post("/login")
async def login(body: LoginBody, request: Request):
    async with db.read() as conn:
        user = await conn.fetchrow(
            """
            SELECT u.*, r.rank AS role_rank, r.label AS role_label
              FROM users u JOIN roles r ON r.code = u.global_role
             WHERE lower(u.username) = lower($1) AND u.deleted_at IS NULL
            """,
            body.username,
        )

    if user is None or not verify_password(body.password, user["password_hash"]):
        if user is not None:
            async with db.tx({"source": "api"}) as conn:
                await conn.execute(
                    "UPDATE users SET failed_logins = failed_logins + 1 WHERE id = $1",
                    user["id"])
                await conn.execute(
                    """
                    INSERT INTO audit_events (entity_type, entity_id, action, actor_id,
                                              actor_name, source, changed)
                    VALUES ('users', $1, 'login_failed', $1, $2, 'api', '{}'::jsonb)
                    """,
                    user["id"], user["full_name"])
        raise unauthorized("Username or password is incorrect")

    if not user["is_active"]:
        raise unauthorized("Account is disabled")
    if user["failed_logins"] >= MAX_FAILED:
        raise unauthorized("Account is locked. Ask an administrator to reset it.")

    actor = {"id": user["id"], "full_name": user["full_name"],
             "global_role": user["global_role"], "source": "api"}
    async with db.tx(actor) as conn:
        tokens = await _issue(conn, dict(user), request)
        await conn.execute(
            "UPDATE users SET last_login_at = now(), failed_logins = 0 WHERE id = $1",
            user["id"])
        await conn.execute(
            """
            INSERT INTO audit_events (entity_type, entity_id, action, actor_id,
                                      actor_name, actor_role, source, changed)
            VALUES ('users', $1, 'login', $1, $2, $3, 'api', '{}'::jsonb)
            """,
            user["id"], user["full_name"], user["global_role"])

        projects = await conn.fetch(
            """
            SELECT p.id, p.name, p.project_code, p.status, pa.project_role,
                   pa.can_create_tickets, pa.can_review_tickets
              FROM project_assignments pa
              JOIN projects p ON p.id = pa.project_id
             WHERE pa.user_id = $1 AND pa.is_active AND p.deleted_at IS NULL
             ORDER BY p.name
            """,
            user["id"])

    return {
        **tokens,
        "user": {
            "id": str(user["id"]), "username": user["username"],
            "full_name": user["full_name"], "email": user["email"],
            "monitor_id": user["monitor_id"], "role": user["global_role"],
            "role_label": user["role_label"], "role_rank": user["role_rank"],
            "must_reset": user["must_reset"],
        },
        "projects": db.rows(projects),
    }


@router.post("/refresh")
async def refresh(body: RefreshBody, request: Request):
    digest = hash_refresh_token(body.refresh_token)
    async with db.read() as conn:
        session = await conn.fetchrow(
            """
            SELECT s.*, u.global_role, u.full_name, u.username, u.is_active
              FROM user_sessions s JOIN users u ON u.id = s.user_id
             WHERE s.refresh_hash = $1 AND s.revoked_at IS NULL
               AND s.expires_at > now() AND u.deleted_at IS NULL
            """,
            digest,
        )
    if session is None or not session["is_active"]:
        raise unauthorized("Refresh token is invalid or expired")

    actor = {"id": session["user_id"], "full_name": session["full_name"],
             "global_role": session["global_role"]}
    async with db.tx(actor) as conn:
        await conn.execute(
            "UPDATE user_sessions SET revoked_at = now() WHERE id = $1", session["id"])
        tokens = await _issue(conn, {
            "id": session["user_id"], "global_role": session["global_role"],
            "full_name": session["full_name"], "username": session["username"],
        }, request)
    return tokens


@router.post("/logout", status_code=204)
async def logout(body: RefreshBody, user: CurrentUser):
    async with db.tx(user) as conn:
        await conn.execute(
            "UPDATE user_sessions SET revoked_at = now() "
            "WHERE refresh_hash = $1 AND user_id = $2",
            hash_refresh_token(body.refresh_token), user["id"])
    return None


@router.get("/me")
async def me(user: CurrentUser):
    async with db.read() as conn:
        projects = await conn.fetch(
            """
            SELECT p.id, p.name, p.project_code, p.status, p.timezone,
                   pa.project_role, pa.can_create_tickets, pa.can_review_tickets
              FROM project_assignments pa
              JOIN projects p ON p.id = pa.project_id
             WHERE pa.user_id = $1 AND pa.is_active AND p.deleted_at IS NULL
             ORDER BY p.name
            """,
            user["id"])
        permissions = await conn.fetch(
            "SELECT permission_code, permission_domain FROM role_permission_matrix "
            "WHERE role_code = $1 ORDER BY permission_domain, permission_code",
            user["global_role"])
    return {
        "user": {k: v for k, v in user.items() if k not in ("password_hash",)},
        "projects": db.rows(projects),
        "permissions": [p["permission_code"] for p in permissions],
    }


@router.post("/password", status_code=204)
async def change_password(body: PasswordBody, user: CurrentUser):
    async with db.read() as conn:
        current = await conn.fetchval(
            "SELECT password_hash FROM users WHERE id = $1", user["id"])
    if current and not verify_password(body.current_password or "", current):
        raise unauthorized("Current password is incorrect")

    async with db.tx(user) as conn:
        await conn.execute(
            "UPDATE users SET password_hash = $1, must_reset = false WHERE id = $2",
            hash_password(body.new_password), user["id"])
        await conn.execute(
            "UPDATE user_sessions SET revoked_at = now() "
            "WHERE user_id = $1 AND revoked_at IS NULL", user["id"])
    return None
