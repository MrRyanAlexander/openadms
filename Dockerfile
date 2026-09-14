# syntax=docker/dockerfile:1
# =============================================================================
# Open ADMS API image.
#
# This is the ONLY Dockerfile that builds the API. It lives at the repository
# root on purpose.
#
# Railway builds a GitHub service by looking for `Dockerfile` at the root of
# the service's source directory, and the service's Root Directory is left at
# its default. That default is the one build setting nobody has to apply,
# verify, or repair, so there is nothing here that can silently drift.
#
# An earlier layout kept a second, near-identical Dockerfile in backend/ and
# pointed Railway at it with a Root Directory of /backend. Setting that from
# the CLI stages the change instead of committing it, so the setting reported
# success and never landed, and this file quietly built instead. Both files had
# to be kept in sync by hand and the mismatch was invisible. One file removes
# the whole class of problem.
#
# The build context is this directory. .dockerignore trims it to the API, so
# the context stays small even though it starts at the root.
# =============================================================================
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
