"""Open ADMS API.

One process, one database URL, one CORS pattern. Everything the field app and
the back office need is here; nothing else is.
"""
from __future__ import annotations

import logging
import time
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import ORJSONResponse

from . import db
from .config import settings
from .errors import ApiError, api_error_handler, http_error_handler
from .routers import (auth, billing, catalog, certifications, closeout,
                      documents, instance,
                      lookups, org, projects, reports, review, tickets)

logging.basicConfig(
    level=getattr(logging, settings.log_level.upper(), logging.INFO),
    format="%(asctime)s %(levelname)-7s %(name)s  %(message)s",
)
log = logging.getLogger("openadms")


@asynccontextmanager
async def lifespan(app: FastAPI):
    await db.connect()
    async with db.read() as conn:
        version = await conn.fetchval("SELECT version()")
        applied = await conn.fetchval(
            "SELECT count(*) FROM schema_migrations") or 0
        key = await conn.fetchval("SELECT instance_key FROM instance LIMIT 1")
    log.info("Connected: %s", version.split(",")[0])
    log.info("Migrations applied: %s", applied)
    log.info("Instance key: %s", (key[:12] + "...") if key else "not provisioned")
    yield
    await db.disconnect()


app = FastAPI(
    title=settings.app_name,
    version=settings.version,
    description=(
        "Automated Debris Management System. Tickets are the unit of work and "
        "the unit of billing; rules turn completed tickets into locked "
        "transactions; every change leaves an immutable audit artifact."
    ),
    default_response_class=ORJSONResponse,
    lifespan=lifespan,
    docs_url="/docs",
    openapi_url="/openapi.json",
)

# Flexible CORS by pattern, because the frontends deploy to dynamically
# generated preview URLs.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.extra_origins or ["*"] if not settings.cors_origin_regex else settings.extra_origins,
    allow_origin_regex=settings.cors_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    # Content-Disposition has to be readable by the client, or a download
    # arrives named "download" whatever the server called it.
    expose_headers=["X-Request-Id", "X-Response-Time", "Content-Disposition"],
    max_age=86400,
)


@app.middleware("http")
async def request_context(request: Request, call_next):
    request_id = request.headers.get("x-request-id") or uuid.uuid4().hex[:16]
    started = time.perf_counter()
    request.state.request_id = request_id
    response = await call_next(request)
    elapsed = (time.perf_counter() - started) * 1000
    response.headers["X-Request-Id"] = request_id
    response.headers["X-Response-Time"] = f"{elapsed:.1f}ms"
    return response


app.add_exception_handler(ApiError, api_error_handler)
app.add_exception_handler(HTTPException, http_error_handler)


@app.get("/", tags=["meta"])
async def root():
    return {
        "name": settings.app_name,
        "version": settings.version,
        "environment": settings.environment,
        "docs": "/docs",
    }


@app.get("/health", tags=["meta"])
async def health():
    """Liveness plus a real query, so a half-open database shows up as down."""
    started = time.perf_counter()
    try:
        async with db.read() as conn:
            await conn.fetchval("SELECT 1")
            counts = await conn.fetchrow(
                """
                SELECT (SELECT count(*) FROM projects WHERE deleted_at IS NULL) AS projects,
                       (SELECT count(*) FROM tickets WHERE deleted_at IS NULL) AS tickets,
                       (SELECT count(*) FROM schema_migrations) AS migrations
                """)
        return {
            "status": "ok",
            "database": "connected",
            "latency_ms": round((time.perf_counter() - started) * 1000, 2),
            **dict(counts),
        }
    except Exception as exc:  # pragma: no cover - health must never raise
        return ORJSONResponse(
            status_code=503,
            content={"status": "degraded", "database": "unavailable",
                     "detail": str(exc)},
        )


API = "/api/v1"
app.include_router(auth.router, prefix=API)
app.include_router(lookups.router, prefix=API)
app.include_router(catalog.router, prefix=API)
app.include_router(projects.router, prefix=API)
app.include_router(tickets.router, prefix=API)
app.include_router(billing.router, prefix=API)
app.include_router(reports.router, prefix=API)
app.include_router(instance.router, prefix=API)
app.include_router(documents.router, prefix=API)
app.include_router(closeout.router, prefix=API)
app.include_router(certifications.router, prefix=API)
app.include_router(review.router, prefix=API)
for r in org.routers:
    app.include_router(r, prefix=API)


if __name__ == "__main__":  # pragma: no cover
    import uvicorn

    uvicorn.run("app.main:app", host="0.0.0.0", port=settings.port,
                log_level=settings.log_level)
