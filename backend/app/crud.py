"""A small factory for the flat reference tables. Anything with real domain
behaviour gets a hand-written router instead."""
from __future__ import annotations

import uuid
from typing import Annotated, Any, Callable, Optional, Sequence

from fastapi import APIRouter, Body, Depends, Query

from . import db
from .deps import CurrentUser, Paging, require_permission
from .errors import not_found


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
        _: dict = Depends(require_permission(read_permission)),
    ):
        where = [alive]
        args: list[Any] = []
        if q and searchable:
            args.append(f"%{q}%")
            terms = " OR ".join(f"{p}{c}::text ILIKE ${len(args)}" for c in searchable)
            where.append(f"({terms})")
        if active_only:
            where.append(f"{p}is_active")

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

    @router.delete("/{item_id}", status_code=204)
    async def delete_item(
        item_id: uuid.UUID,
        user: CurrentUser,
        _: dict = Depends(require_permission(write_permission)),
    ):
        async with db.tx(user) as conn:
            if soft_delete:
                # Not every table has is_active; contracts, for one, does not.
                sets = "deleted_at = now()"
                if db.has_column(table, "is_active"):
                    sets += ", is_active = false"
                await conn.execute(
                    f"UPDATE {table} SET {sets} WHERE id = $1", item_id)
            else:
                await conn.execute(f"DELETE FROM {table} WHERE id = $1", item_id)
        return None

    return router
