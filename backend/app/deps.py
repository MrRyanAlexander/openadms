"""Request dependencies: who is calling, what they may do, and which project
they are acting inside."""
from __future__ import annotations

import uuid
from typing import Annotated, Any, Optional, Sequence

from fastapi import Depends, Header, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from . import db
from .errors import forbidden, not_found, unauthorized
from .security import decode_token

bearer = HTTPBearer(auto_error=False)


async def current_user(
    request: Request,
    creds: Annotated[Optional[HTTPAuthorizationCredentials], Depends(bearer)],
) -> dict[str, Any]:
    if creds is None:
        raise unauthorized()

    payload = decode_token(creds.credentials)
    if payload.get("typ") != "access":
        raise unauthorized("Wrong token type")

    async with db.read() as conn:
        user = await conn.fetchrow(
            """
            SELECT u.id, u.username, u.email, u.full_name, u.monitor_id,
                   u.global_role, u.is_active, u.preferences,
                   r.rank AS role_rank, r.label AS role_label
              FROM users u JOIN roles r ON r.code = u.global_role
             WHERE u.id = $1 AND u.deleted_at IS NULL
            """,
            uuid.UUID(payload["sub"]),
        )

    if user is None or not user["is_active"]:
        raise unauthorized("Account is inactive")

    actor = dict(user)
    actor["request_id"] = request.headers.get("x-request-id", "")
    actor["source"] = "field_app" if request.headers.get(
        "x-client") == "field" else "back_office"
    request.state.actor = actor
    return actor


CurrentUser = Annotated[dict[str, Any], Depends(current_user)]


def require_permission(*codes: str):
    """Role ranks are cumulative, so one lookup answers the whole question.

    The refusal names the permission that is missing rather than only the role,
    because "you need worker.manage" is actionable and "you are a Manager" is
    not."""

    async def _guard(user: CurrentUser) -> dict[str, Any]:
        async with db.read() as conn:
            rows = await conn.fetch(
                """
                SELECT p AS code, adms_role_has_permission($1, p) AS ok
                  FROM unnest($2::text[]) p
                """,
                user["global_role"], list(codes),
            )
        missing = [r["code"] for r in rows if not r["ok"]]
        if missing:
            raise forbidden(permission_refusal(user, missing))
        return user

    return _guard


def permission_refusal(user: dict[str, Any], codes: Sequence[str],
                       action: Optional[str] = None) -> str:
    """One wording for every refusal, so the message always names the permission."""
    listed = ", ".join(codes)
    lead = f"{action} needs" if action else "This action needs"
    noun = "permission" if len(codes) == 1 else "permissions"
    return (f"{lead} the {listed} {noun}. "
            f"Your role ({user['role_label']}) does not include it.")


async def has_permission(user: dict[str, Any], code: str) -> bool:
    """The same question as require_permission, asked inside a handler.

    Some writes are only partly gated: creating a monitor is worker.manage work,
    while promoting that monitor to admin is user.manage work, and the handler
    cannot know which it is until it has read the body."""
    async with db.read() as conn:
        return bool(await conn.fetchval(
            "SELECT adms_role_has_permission($1, $2)", user["global_role"], code))


async def project_context(
    project_id: uuid.UUID,
    user: CurrentUser,
) -> dict[str, Any]:
    """The active project must always be in context, and the caller must be on
    it. Admins see every project; everyone else sees only their assignments."""
    async with db.read() as conn:
        project = await conn.fetchrow(
            "SELECT * FROM projects WHERE id = $1 AND deleted_at IS NULL", project_id
        )
        if project is None:
            raise not_found("Project")

        assignment = await conn.fetchrow(
            """
            SELECT pa.*, r.rank AS project_rank
              FROM project_assignments pa
              JOIN roles r ON r.code = pa.project_role
             WHERE pa.project_id = $1 AND pa.user_id = $2 AND pa.is_active
            """,
            project_id, user["id"],
        )

    if assignment is None and user["role_rank"] < 40:
        raise forbidden("You are not assigned to this project")

    return {
        "project": dict(project),
        "assignment": dict(assignment) if assignment else None,
        # An admin acts at admin rank everywhere; otherwise the higher of the
        # global role and the project role applies.
        "effective_rank": max(
            user["role_rank"],
            assignment["project_rank"] if assignment else 0,
        ),
        "can_create_tickets": bool(
            assignment["can_create_tickets"] if assignment else user["role_rank"] >= 40
        ),
        "can_review_tickets": bool(
            assignment["can_review_tickets"] if assignment else user["role_rank"] >= 30
        ),
    }


ProjectContext = Annotated[dict[str, Any], Depends(project_context)]


async def optional_user(
    request: Request,
    creds: Annotated[Optional[HTTPAuthorizationCredentials], Depends(bearer)],
) -> Optional[dict[str, Any]]:
    if creds is None:
        return None
    try:
        return await current_user(request, creds)
    except Exception:
        return None


def paging(limit: int = 50, offset: int = 0) -> dict[str, int]:
    return {"limit": max(1, min(limit, 500)), "offset": max(0, offset)}


Paging = Annotated[dict[str, int], Depends(paging)]
