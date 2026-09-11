"""Database access. One asyncpg pool, one place where audit actor context is
pushed into the session so the database triggers can attribute every change."""
from __future__ import annotations

import datetime as dt
import json
import re
import uuid as uuidlib
from contextlib import asynccontextmanager
from typing import Any, AsyncIterator, Iterable, Optional

import asyncpg

from .config import settings
from .errors import bad_request, conflict, not_found, unprocessable

_pool: Optional[asyncpg.Pool] = None


async def _init_connection(conn: asyncpg.Connection) -> None:
    """Return jsonb as parsed Python objects rather than strings."""
    await conn.set_type_codec(
        "jsonb", encoder=json.dumps, decoder=json.loads, schema="pg_catalog"
    )
    await conn.set_type_codec(
        "json", encoder=json.dumps, decoder=json.loads, schema="pg_catalog"
    )


async def connect() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        _pool = await asyncpg.create_pool(
            dsn=settings.asyncpg_dsn,
            min_size=settings.db_pool_min,
            max_size=settings.db_pool_max,
            command_timeout=settings.db_command_timeout,
            init=_init_connection,
        )
        await _load_column_types(_pool)
    return _pool


# ---------------------------------------------------------------------------
# Column type cache. JSON gives us strings where the database wants dates,
# uuids and jsonb, so the statement builders below emit an explicit cast per
# column rather than guessing from the value.
# ---------------------------------------------------------------------------
_COLUMN_TYPES: dict[str, dict[str, str]] = {}

# jsonb/json are deliberately absent: the connection codec already encodes
# Python objects for those columns, and a cast would make asyncpg treat the
# parameter as text and store a JSON string instead of an object.
_CASTS = {
    "date": "date",
    "timestamp with time zone": "timestamptz",
    "timestamp without time zone": "timestamp",
    "uuid": "uuid",
}


async def _load_column_types(p: asyncpg.Pool) -> None:
    async with p.acquire() as conn:
        records = await conn.fetch(
            """
            SELECT table_name, column_name, data_type
              FROM information_schema.columns
             WHERE table_schema = 'public'
            """
        )
    _COLUMN_TYPES.clear()
    for r in records:
        _COLUMN_TYPES.setdefault(r["table_name"], {})[r["column_name"]] = r["data_type"]


def has_column(table: str, column: str) -> bool:
    return column in _COLUMN_TYPES.get(table, {})


async def dependents_of(conn: Any, table: str, item_id: Any) -> list[dict[str, Any]]:
    """Every live row in another table that points at this one.

    Read from pg_constraint rather than a hand-kept list, so a new foreign key
    is covered the day it is added. Archiving a record that something still
    references has to be refused with the reason, because a soft delete does
    not meet the ON DELETE RESTRICT the database would have applied to a real
    one, and a client that vanishes from under a live contract with no warning is the
    black hole the walkthrough found."""
    refs = await conn.fetch(
        """
        SELECT src.relname AS child_table, att.attname AS child_column
          FROM pg_constraint con
          JOIN pg_class src ON src.oid = con.conrelid
          JOIN pg_class tgt ON tgt.oid = con.confrelid
          JOIN pg_attribute att
            ON att.attrelid = con.conrelid AND att.attnum = con.conkey[1]
         WHERE con.contype = 'f'
           AND tgt.relname = $1
           AND array_length(con.conkey, 1) = 1
        """, table)

    found: list[dict[str, Any]] = []
    for r in refs:
        child, column = r["child_table"], r["child_column"]
        alive = " AND deleted_at IS NULL" if has_column(child, "deleted_at") else ""
        count = await conn.fetchval(
            f'SELECT count(*) FROM "{child}" WHERE "{column}" = $1{alive}', item_id)
        if count:
            found.append({"table": child, "column": column, "count": int(count)})
    return sorted(found, key=lambda d: -d["count"])


def _cast_for(table: str, column: str) -> Optional[str]:
    return _CASTS.get(_COLUMN_TYPES.get(table, {}).get(column, ""))


def _adapt(value: Any, cast: Optional[str]) -> Any:
    """An explicit cast makes asyncpg bind the parameter as that type, so JSON
    strings are parsed into the Python objects the driver expects."""
    if cast is None or value is None or not isinstance(value, str):
        return value
    text = value.strip()
    if not text:
        return None
    try:
        if cast == "uuid":
            return uuidlib.UUID(text)
        if cast == "date":
            return dt.date.fromisoformat(text[:10])
        parsed = dt.datetime.fromisoformat(text.replace("Z", "+00:00"))
        if cast == "timestamp" and parsed.tzinfo is not None:
            return parsed.replace(tzinfo=None)
        return parsed
    except ValueError as exc:
        raise bad_request(f"'{value}' is not a valid {cast}") from exc


async def disconnect() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None


def pool() -> asyncpg.Pool:
    if _pool is None:
        raise RuntimeError("Database pool is not initialised")
    return _pool


# ---------------------------------------------------------------------------
# Actor context
# ---------------------------------------------------------------------------
async def _apply_actor(conn: asyncpg.Connection, actor: dict[str, Any] | None) -> None:
    """Push actor identity into session GUCs the audit trigger reads."""
    actor = actor or {}
    pairs = {
        "adms.actor_id": str(actor.get("id", "") or ""),
        "adms.actor_name": actor.get("full_name", "") or "",
        "adms.actor_role": actor.get("global_role", "") or "",
        "adms.instance_key": actor.get("instance_key", "") or "",
        "adms.source": actor.get("source", "api"),
        "adms.request_id": actor.get("request_id", "") or "",
        "adms.reason": actor.get("reason", "") or "",
    }
    for key, value in pairs.items():
        await conn.execute("SELECT set_config($1, $2, true)", key, value)


@asynccontextmanager
async def tx(actor: dict[str, Any] | None = None) -> AsyncIterator[asyncpg.Connection]:
    """A write transaction with audit context attached."""
    async with pool().acquire() as conn:
        async with conn.transaction():
            await _apply_actor(conn, actor)
            try:
                yield conn
            except asyncpg.PostgresError as exc:
                raise translate(exc) from exc


@asynccontextmanager
async def read() -> AsyncIterator[asyncpg.Connection]:
    async with pool().acquire() as conn:
        try:
            yield conn
        except asyncpg.PostgresError as exc:
            raise translate(exc) from exc


# ---------------------------------------------------------------------------
# Error translation: database constraints are the source of truth, so their
# messages are surfaced rather than swallowed.
# ---------------------------------------------------------------------------
_CONSTRAINT_HINTS = {
    "tickets_number_key": "That ticket number is already in use.",
    "users_username_key": "That username is already taken.",
    "users_email_key": "That email address is already registered.",
    "invoice_lines_transaction_once": "That transaction is already on an invoice.",
    "transactions_one_per_ticket_rule": "That ticket already has a transaction for this rule.",
    "instance_only_one": "This deployment already has an instance identity.",
    "contract_line_items_number_key":
        "That line number is already used on this contract.",
    "service_codes_project_code_key":
        "That service code already exists on this project.",
    "contacts_one_primary_per_entity":
        "There is already a primary contact here. Change that one first.",
    "users_employer_employee_id_key":
        "That employee ID is already used by this employer.",
}


def translate(exc: asyncpg.PostgresError) -> Exception:
    message = getattr(exc, "message", None) or str(exc) or exc.__class__.__name__
    constraint = getattr(exc, "constraint_name", None)

    if isinstance(exc, asyncpg.UniqueViolationError):
        return conflict(_CONSTRAINT_HINTS.get(constraint or "", message),
                        constraint=constraint)
    if isinstance(exc, asyncpg.ForeignKeyViolationError):
        return unprocessable(message, constraint=constraint)
    if isinstance(exc, asyncpg.CheckViolationError):
        return unprocessable(message, constraint=constraint)
    if isinstance(exc, asyncpg.RestrictViolationError):
        return conflict(message, constraint=constraint)
    if isinstance(exc, asyncpg.NoDataFoundError):
        return not_found(message)
    if isinstance(exc, asyncpg.RaiseError):
        return unprocessable(message)
    return bad_request(message)


# ---------------------------------------------------------------------------
# Small helpers so routers stay declarative
# ---------------------------------------------------------------------------
def rows(records: Iterable[asyncpg.Record]) -> list[dict[str, Any]]:
    return [dict(r) for r in records]


def row(record: Optional[asyncpg.Record]) -> Optional[dict[str, Any]]:
    return dict(record) if record is not None else None


_IDENT = re.compile(r"^[a-z_][a-z0-9_]*$")


def _ident(name: str) -> str:
    if not _IDENT.match(name):
        raise bad_request(f"Invalid identifier: {name}")
    return name


def build_insert(table: str, payload: dict[str, Any], returning: str = "*") -> tuple[str, list]:
    cols = [_ident(k) for k in payload]
    casts = [_cast_for(table, c) for c in cols]
    vals = [_adapt(v, cast) for v, cast in zip(payload.values(), casts)]
    placeholders = ", ".join(
        f"${i}" + (f"::{cast}" if cast else "")
        for i, cast in enumerate(casts, start=1)
    )
    sql = (
        f"INSERT INTO {_ident(table)} ({', '.join(cols)}) "
        f"VALUES ({placeholders}) RETURNING {returning}"
    )
    return sql, vals


def build_update(
    table: str, payload: dict[str, Any], where: str, where_args: list, returning: str = "*"
) -> tuple[str, list]:
    cols = [_ident(k) for k in payload]
    casts = [_cast_for(table, c) for c in cols]
    vals = [_adapt(v, cast) for v, cast in zip(payload.values(), casts)]
    sets = ", ".join(
        f"{c} = ${i}" + (f"::{cast}" if cast else "")
        for i, (c, cast) in enumerate(zip(cols, casts), start=1)
    )
    offset = len(vals)
    where_sql = re.sub(r"\$(\d+)", lambda m: f"${int(m.group(1)) + offset}", where)
    sql = f"UPDATE {_ident(table)} SET {sets} WHERE {where_sql} RETURNING {returning}"
    return sql, vals + list(where_args)


class Page(dict):
    """Uniform list envelope: items plus the paging the UI needs."""

    @classmethod
    def of(cls, items: list[dict], total: int, limit: int, offset: int) -> "Page":
        return cls(
            items=items,
            total=total,
            limit=limit,
            offset=offset,
            has_more=offset + len(items) < total,
        )
