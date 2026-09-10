# syntax=docker/dockerfile:1
# Open ADMS API. Small, single-stage, generic web port.
#
# Built with the repository root as the build context, which is why every COPY
# is prefixed with backend/. .dockerignore trims the context down to the API.
#
# The installer points the Railway api service at Root Directory /backend, and
# backend/Dockerfile is the equivalent file for that context. This one stays
# because it is what docker-compose, App Runner and Cloud Run build, and
# because it keeps a service left at / building correctly instead of failing
# with nothing to explain it. The two files differ only in their COPY paths:
# change one, change both.
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
