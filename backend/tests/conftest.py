"""Test fixtures. The suite runs against a live database seeded by
database/setup.sh --with-demo, because the rules engine and the audit trail
live in the database and stubbing them out would test nothing."""
from __future__ import annotations

import os

import pytest
from fastapi.testclient import TestClient

os.environ.setdefault(
    "DATABASE_URL", "postgresql://adms:adms@127.0.0.1:5432/openadms")
os.environ.setdefault("JWT_SECRET", "test-secret-not-for-production")

from app.main import app  # noqa: E402

DEMO_PASSWORD = "openadms"


@pytest.fixture(scope="session")
def client():
    with TestClient(app) as c:
        yield c


def _login(client: TestClient, username: str) -> dict:
    response = client.post("/api/v1/auth/login",
                           json={"username": username, "password": DEMO_PASSWORD})
    assert response.status_code == 200, response.text
    return response.json()


@pytest.fixture(scope="session")
def admin(client):
    return _login(client, "admin")


@pytest.fixture(scope="session")
def monitor(client):
    return _login(client, "jmiller")


@pytest.fixture(scope="session")
def analyst(client):
    return _login(client, "analyst")


@pytest.fixture(scope="session")
def auth(admin):
    return {"Authorization": f"Bearer {admin['access_token']}"}


@pytest.fixture(scope="session")
def monitor_auth(monitor):
    return {"Authorization": f"Bearer {monitor['access_token']}",
            "X-Client": "field"}


@pytest.fixture(scope="session")
def analyst_auth(analyst):
    return {"Authorization": f"Bearer {analyst['access_token']}"}


@pytest.fixture(scope="session")
def project_id(admin):
    """Always the seeded demo project, never a project a test created."""
    demo = next((p for p in admin["projects"]
                 if p["project_code"] == "STL-2026-ROW"), None)
    assert demo is not None, (
        "The demo project is missing. Run database/setup.sh --with-demo first.")
    return demo["id"]
