# syntax=docker/dockerfile:1
# Open ADMS API, built with backend/ as the build context.
#
# This is the image Railway builds when the api service's Root Directory is
# /backend, which is what the installer now sets explicitly. Paths here are
# relative to backend/, so nothing outside the API is in the context.
#
# A second, equivalent Dockerfile lives at the repository root and copies from
# backend/ instead. Both exist on purpose: whichever Root Directory the service
# ends up with, / or /backend, there is a valid build. Change one, change both.
FROM python:3.11-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PORT=8080

WORKDIR /app

RUN apt-get update \
 && apt-get install -y --no-install-recommends curl \
 && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

RUN useradd --create-home --uid 10001 adms && chown -R adms:adms /app
USER adms

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://localhost:${PORT}/health || exit 1

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT} --proxy-headers --forwarded-allow-ips='*'"]
