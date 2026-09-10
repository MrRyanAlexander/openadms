# syntax=docker/dockerfile:1
# Open ADMS API. Small, single-stage, generic web port.
#
# This lives at the repository root deliberately. Railway builds from the root
# of the repo unless a service's Root Directory is changed, and that setting is
# a staged, dashboard-only change the CLI cannot reliably commit. Keeping the
# Dockerfile here means the default is already correct: nothing to set, nothing
# to click, nothing to forget. .dockerignore trims the context to the backend.
FROM python:3.11-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PORT=8080

WORKDIR /app

RUN apt-get update \
 && apt-get install -y --no-install-recommends curl \
 && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/app ./app

RUN useradd --create-home --uid 10001 adms && chown -R adms:adms /app
USER adms

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://localhost:${PORT}/health || exit 1

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT} --proxy-headers --forwarded-allow-ips='*'"]
