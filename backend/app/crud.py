"""A small factory for the flat reference tables. Anything with real domain
behaviour gets a hand-written router instead."""
from __future__ import annotations

import uuid
from typing import Annotated, Any, Callable, Optional, Sequence

from fastapi import APIRouter, Body, Depends, Query

from . import db
from .db import has_column
from .deps import CurrentUser, Paging, require_permission
from .errors import bad_request, conflict, not_found


def make_router(
    *,
    table: str,
    prefix: str,
    tags: Sequence[str],
    read_permission: str,
    write_permission: str,
    searchable: Sequence[str] = ("name",),
    order_by: str = "name",
    soft_delete: bool = True,
    allowed_fields: Sequence[str] = (),
    select_sql: Optional[str] = None,
    alias: str = "",
    validate: Optional[Callable[[dict[str, Any], bool], dict[str, Any]]] = None,
) -> APIRouter:
    router = APIRouter(prefix=prefix, tags=list(tags))
    base_select = select_sql or f"SELECT * FROM {table}"
    p = f"{alias}." if alias else ""
    alive = f"{p}deleted_at IS NULL" if soft_delete else "TRUE"

    def clean(payload: dict[str, Any], *, creating: bool) -> dict[str, Any]:
        data = payload if not allowed_fields else {
            k: v for k, v in payload.items() if k in allowed_fields}
        # A table whose rules the interface must not be the only thing enforcing
        # gets a validator here, so an import or a direct API call meets the
        # same wall the form does.
        return validate(data, creating) if validate else data

    @router.get("")
    async def list_items(
        paging: Paging,
        user: CurrentUser,
        q: Optional[str] = Query(None, description="Free-text search"),
        active_only: bool = Query(False),
        state: str = Query(
            "current",
            pattern="^(current|active|inactive|archived|all)$",
            description="current hides archived records, active and inactive "
                        "narrow to one, archived shows only archived, all shows "
                        "everything"),
        _: dict = Depends(require_permission(read_permission)),
    ):
        """`current` is the default because a deactivated record has to stay
        visible. Hiding it is what made deactivation feel like deletion: the row
        left the only screen that could have brought it back."""
        args: list[Any] = []
        where: list[str] = []
        live = has_column(table, "is_active")

        if state == "archived":
            where.append("FALSE" if not soft_delete else f"{p}deleted_at IS NOT NULL")
        elif state == "all":
            where.append("TRUE")
        else:
            where.append(alive)
            if state == "active" or active_only:
                if live:
                    where.append(f"{p}is_active")
            elif state == "inactive":
                where.append(f"NOT {p}is_active" if live else "FALSE")

        if q and searchable:
            args.append(f"%{q}%")
            terms = " OR ".join(f"{p}{c}::text ILIKE ${len(args)}" for c in searchable)
            where.append(f"({terms})")

        clause = " AND ".join(where)
        count_from = f"{table} {alias}" if alias else table
        async with db.read() as conn:
            total = await conn.fetchval(
                f"SELECT count(*) FROM {count_from} WHERE {clause}", *args)
            args2 = args + [paging["limit"], paging["offset"]]
            items = await conn.fetch(
                f"{base_select} WHERE {clause} ORDER BY {p}{order_by} "
                f"LIMIT ${len(args) + 1} OFFSET ${len(args) + 2}",
                *args2,
            )
        return db.Page.of(db.rows(items), total, paging["limit"], paging["offset"])

    @router.get("/{item_id}")
    async def get_item(
        item_id: uuid.UUID,
        user: CurrentUser,
        _: dict = Depends(require_permission(read_permission)),
    ):
        async with db.read() as conn:
            rec = await conn.fetchrow(
                f"{base_select} WHERE {p}id = $1 AND {alive}", item_id)
        if rec is None:
            raise not_found(table.rstrip("s").replace("_", " ").title())
        return db.row(rec)

    @router.post("", status_code=201)
    async def create_item(
        user: CurrentUser,
        payload: dict[str, Any] = Body(...),
        _: dict = Depends(require_permission(write_permission)),
    ):
        data = clean(payload, creating=True)
        sql, args = db.build_insert(table, data)
        async with db.tx(user) as conn:
            rec = await conn.fetchrow(sql, *args)
        return db.row(rec)

    @router.patch("/{item_id}")
    async def update_item(
        item_id: uuid.UUID,
        user: CurrentUser,
        payload: dict[str, Any] = Body(...),
        _: dict = Depends(require_permission(write_permission)),
    ):
        data = clean(payload, creating=False)
        data.pop("id", None)
        if not data:
            return await get_item(item_id, user, user)
        sql, args = db.build_update(table, data, f"id = $1 AND {alive}", [item_id])
        async with db.tx(user) as conn:
            rec = await conn.fetchrow(sql, *args)
        if rec is None:
            raise not_found(table)
        return db.row(rec)

    @router.get("/{item_id}/dependents")
    async def item_dependents(
        item_id: uuid.UUID,
        user: CurrentUser,
        _: dict = Depends(require_permission(read_permission)),
    ):
        """What archiving this record would strand. The interface reads this to
        name the consequence before asking anyone to confirm it."""
        async with db.read() as conn:
            found = await db.dependents_of(conn, table, item_id)
        return {"table": table, "id": str(item_id), "dependents": found,
                "can_archive": not found}

    @router.delete("/{item_id}", status_code=204)
    async def delete_item(
        item_id: uuid.UUID,
        user: CurrentUser,
        force: bool = Query(
            False, description="Archive even though live records still "
                               "reference this one"),
        _: dict = Depends(require_permission(write_permission)),
    ):
        """Archive, not deactivate. Deactivating is a PATCH of is_active and
        leaves the record on the list; archiving takes it off the list, so it
        is refused while anything live still points at it."""
        async with db.tx(user) as conn:
            if soft_delete:
                found = await db.dependents_of(conn, table, item_id)
                if found and not force:
                    raise conflict(
                        "This record is still in use by "
                        + ", ".join(
                            f"{d['count']} {d['table'].replace('_', ' ')}"
                            for d in found[:3])
                        + ". Archiving it would leave those without it.",
                        code="record_in_use", dependents=found)
                # Not every table has is_active; contracts, for one, does not.
                sets = "deleted_at = now()"
                if db.has_column(table, "is_active"):
                    sets += ", is_active = false"
                done = await conn.fetchval(
                    f"UPDATE {table} SET {sets} "
                    f"WHERE id = $1 AND deleted_at IS NULL RETURNING id", item_id)
                if done is None:
                    raise not_found(table)
            else:
                await conn.execute(f"DELETE FROM {table} WHERE id = $1", item_id)
        return None

    @router.post("/{item_id}/restore")
    async def restore_item(
        item_id: uuid.UUID,
        user: CurrentUser,
        _: dict = Depends(require_permission(write_permission)),
    ):
        """Bring an archived record back. Nothing was ever removed, so this is
        the other half of archive and the reason archive is safe."""
        if not soft_delete:
            raise bad_request("This record type is not archived, so there is "
                              "nothing to restore.", code="not_archivable")
        sets = "deleted_at = NULL"
        if db.has_column(table, "is_active"):
            sets += ", is_active = true"
        async with db.tx(user) as conn:
            rec = await conn.fetchrow(
                f"UPDATE {table} SET {sets} WHERE id = $1 RETURNING *", item_id)
        if rec is None:
            raise not_found(table)
        return db.row(rec)

    return router
