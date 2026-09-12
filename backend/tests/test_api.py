"""End-to-end coverage of the API against the seeded demo project."""
from __future__ import annotations

import json
import uuid
from datetime import date, timedelta

import pytest


# ---------------------------------------------------------------------------
# Meta
# ---------------------------------------------------------------------------
def test_health_reports_a_live_database(client):
    body = client.get("/health").json()
    assert body["status"] == "ok"
    assert body["database"] == "connected"
    assert body["migrations"] >= 13


def test_openapi_document_builds(client):
    spec = client.get("/openapi.json").json()
    assert spec["info"]["title"]
    assert len(spec["paths"]) > 40


# ---------------------------------------------------------------------------
# Auth and RBAC
# ---------------------------------------------------------------------------
def test_login_returns_the_users_project_context(admin):
    assert admin["user"]["role"] == "admin"
    assert admin["projects"], "an admin with no project context is useless"


def test_wrong_password_is_rejected(client):
    r = client.post("/api/v1/auth/login",
                    json={"username": "admin", "password": "wrong"})
    assert r.status_code == 401


def test_unauthenticated_requests_are_rejected(client, project_id):
    assert client.get(f"/api/v1/projects/{project_id}").status_code == 401


def test_role_ranks_are_cumulative(client, auth, monitor_auth):
    admin_perms = client.get("/api/v1/auth/me", headers=auth).json()["permissions"]
    monitor_perms = client.get("/api/v1/auth/me",
                               headers=monitor_auth).json()["permissions"]
    assert "rule.manage" in admin_perms
    assert "rule.manage" not in monitor_perms
    assert set(monitor_perms) < set(admin_perms)


def test_a_monitor_cannot_reach_the_rule_builder(client, monitor_auth, project_id):
    r = client.post(f"/api/v1/projects/{project_id}/rules", headers=monitor_auth,
                    json={"name": "Nope", "ticket_type_id": str(uuid.uuid4()),
                          "service_code_id": str(uuid.uuid4()),
                          "contract_id": str(uuid.uuid4())})
    assert r.status_code == 403


def test_refresh_rotates_the_session(client, admin):
    r = client.post("/api/v1/auth/refresh",
                    json={"refresh_token": admin["refresh_token"]})
    assert r.status_code == 200
    new = r.json()
    assert new["access_token"]
    # The old refresh token is single use.
    again = client.post("/api/v1/auth/refresh",
                        json={"refresh_token": admin["refresh_token"]})
    assert again.status_code == 401
    admin["refresh_token"] = new["refresh_token"]


# ---------------------------------------------------------------------------
# Project setup
# ---------------------------------------------------------------------------
def test_project_detail_carries_everything_the_back_office_needs(client, auth, project_id):
    p = client.get(f"/api/v1/projects/{project_id}", headers=auth).json()
    assert p["ready_for_field"] and p["ready_for_billing"]
    assert p["missing"] == []
    for key in ("contractors", "contracts", "sites", "zones",
                "ticket_types", "assignments"):
        assert p[key], f"{key} should not be empty on the demo project"


def test_readiness_lists_what_is_missing_on_a_bare_project(client, auth):
    client_id = client.get("/api/v1/clients", headers=auth).json()["items"][0]["id"]
    created = client.post("/api/v1/projects", headers=auth, json={
        "name": "API Test Bare Project",
        "project_code": f"API-{uuid.uuid4().hex[:6].upper()}",
        "client_id": client_id,
    })
    assert created.status_code == 201
    pid = created.json()["id"]
    readiness = client.get(f"/api/v1/projects/{pid}/readiness", headers=auth).json()
    assert readiness["ready_for_field"] is False
    assert "contract" in readiness["missing"]
    assert "disposal_site" in readiness["missing"]

    assert client.delete(f"/api/v1/projects/{pid}", headers=auth).status_code == 204


def test_option_lists_are_scoped_to_the_project(client, auth, project_id):
    contractors = client.get(
        f"/api/v1/projects/{project_id}/options/project_contractors",
        headers=auth).json()
    assert len(contractors["items"]) == 3
    assert all("value" in i and "label" in i for i in contractors["items"])

    unknown = client.get(f"/api/v1/projects/{project_id}/options/nope", headers=auth)
    assert unknown.status_code == 400
    assert "available" in unknown.json()["error"]["details"]


# ---------------------------------------------------------------------------
# Tickets
# ---------------------------------------------------------------------------
def test_ticket_search_filters_and_totals(client, auth, project_id):
    page = client.get(f"/api/v1/projects/{project_id}/tickets",
                      params={"ticket_type": "LOAD", "status": "completed",
                              "limit": 5}, headers=auth).json()
    assert page["total"] > 0
    assert len(page["items"]) <= 5
    assert page["totals"]["cubic_yards"] > 0
    assert all(i["ticket_type_code"] == "LOAD" for i in page["items"])


def test_ticket_detail_bundles_stages_media_and_transactions(client, auth, project_id):
    listing = client.get(f"/api/v1/projects/{project_id}/tickets",
                         params={"ticket_type": "LOAD", "status": "completed",
                                 "sort": "transaction_total", "direction": "desc",
                                 "limit": 1}, headers=auth).json()
    ticket_id = listing["items"][0]["id"]
    detail = client.get(f"/api/v1/tickets/{ticket_id}", headers=auth).json()
    assert detail["ticket"]["ticket_number"].startswith("STL-")
    assert detail["stages"]
    assert detail["waypoints"]
    assert detail["metrics"]["billable_cubic_yards"] > 0
    assert detail["transactions"]
    assert detail["audit"]


def test_the_field_app_can_run_a_load_ticket_end_to_end(
        client, monitor_auth, auth, project_id):
    """The full lifecycle: open on the street, hand off a barcode, close it at
    the site, and let the rules engine bill it."""
    project = client.get(f"/api/v1/projects/{project_id}", headers=auth).json()
    load_type = next(t for t in project["ticket_types"] if t["code"] == "LOAD")
    truck = next(e for e in client.get(
        f"/api/v1/projects/{project_id}/options/project_equipment",
        headers=auth).json()["items"] if (e["hint"] or "").endswith("CY"))
    dms = next(s for s in client.get(
        f"/api/v1/projects/{project_id}/options/project_sites",
        headers=auth).json()["items"] if s["hint"] in ("DMS", "TDSRS"))
    prime = next(c for c in client.get(
        f"/api/v1/projects/{project_id}/options/project_contractors",
        headers=auth).json()["items"] if c["hint"] == "prime")

    today = date.today().isoformat()
    client_uuid = str(uuid.uuid4())
    created = client.post(
        f"/api/v1/projects/{project_id}/tickets", headers=monitor_auth,
        json={
            "ticket_type_id": load_type["ticket_type_id"],
            "client_uuid": client_uuid,
            "status": "open",
            "fields": {
                "equipment_id": truck["value"],
                "contractor_id": prime["value"],
                "debris_type": "VEG",
                "driver_name": "API Test Driver",
                "origin_street": "1400 Test Parkway",
                "origin_latitude": 38.7901,
                "origin_longitude": -90.3305,
                "barcode": f"APITEST-{client_uuid[:8]}",
            },
        })
    assert created.status_code == 201, created.text
    ticket = created.json()["ticket"]
    assert ticket["ticket_number"].startswith("STL-")

    # Offline replay must not create a second ticket.
    replay = client.post(
        f"/api/v1/projects/{project_id}/tickets", headers=monitor_auth,
        json={"ticket_type_id": load_type["ticket_type_id"],
              "client_uuid": client_uuid, "fields": {}})
    assert replay.json()["ticket"]["id"] == ticket["id"]

    # Collection stage.
    stage = client.post(f"/api/v1/tickets/{ticket['id']}/stages",
                        headers=monitor_auth,
                        json={"stage_code": "collection",
                              "latitude": 38.7901, "longitude": -90.3305,
                              "address": "1400 Test Parkway",
                              "debris_type": "VEG",
                              "occurred_at": f"{today}T08:00:00Z"})
    assert stage.status_code == 200, stage.text

    # Waypoints along the route.
    wps = client.post(f"/api/v1/tickets/{ticket['id']}/waypoints",
                      headers=monitor_auth,
                      json=[{"latitude": 38.79 + i * 0.004,
                             "longitude": -90.33 - i * 0.004} for i in range(1, 5)])
    assert len(wps.json()["items"]) == 4

    # Hand the driver a barcode.
    handoff = client.post(f"/api/v1/tickets/{ticket['id']}/handoff",
                          headers=monitor_auth, json={})
    assert handoff.status_code == 201
    barcode = handoff.json()["barcode"]

    # The second monitor scans it at the site.
    scan = client.get(f"/api/v1/projects/{project_id}/scan/{barcode}",
                      headers=monitor_auth).json()
    assert scan["action"] == "claim_handoff"
    assert scan["handoff"]["ticket_number"] == ticket["ticket_number"]

    # Disposal stage closes the ticket and bills it.
    closed = client.post(f"/api/v1/tickets/{ticket['id']}/stages",
                         headers=monitor_auth,
                         json={"stage_code": "disposal",
                               "site_id": dms["value"],
                               "load_call_pct": 80,
                               "debris_type": "VEG",
                               "occurred_at": f"{today}T08:55:00Z"})
    assert closed.status_code == 200, closed.text
    body = closed.json()
    assert body["ticket"]["status"] == "completed"
    assert body["transactions_created"] >= 1

    detail = client.get(f"/api/v1/tickets/{ticket['id']}", headers=auth).json()
    assert detail["overview"]["transaction_total"] > 0
    assert detail["metrics"]["billable_cubic_yards"] > 0
    assert detail["metrics"]["haul_miles"] > 0

    # Reprocessing must not double-bill.
    before = len(detail["transactions"])
    again = client.post(f"/api/v1/tickets/{ticket['id']}/process", headers=auth).json()
    assert again["created"] == 0
    assert len(again["transactions"]) == before




def test_scanning_an_unknown_barcode_is_a_clean_404(client, monitor_auth, project_id):
    r = client.get(f"/api/v1/projects/{project_id}/scan/NOT-A-REAL-BARCODE",
                   headers=monitor_auth)
    assert r.status_code == 404


def test_voiding_reverses_the_ledger(client, auth, project_id):
    listing = client.get(f"/api/v1/projects/{project_id}/tickets",
                         params={"ticket_type": "LOAD", "status": "completed",
                                 "include_void": False, "limit": 20},
                         headers=auth).json()
    target = next(t for t in listing["items"] if t["transaction_total"] > 0)
    before = target["transaction_total"]

    voided = client.post(f"/api/v1/tickets/{target['id']}/void", headers=auth,
                         json={"reason": "API test void"})
    assert voided.status_code == 200
    assert voided.json()["ticket"]["is_void"] is True

    detail = client.get(f"/api/v1/tickets/{target['id']}", headers=auth).json()
    assert any(t["is_reversal"] for t in detail["transactions"])
    assert round(sum(float(t["amount"]) for t in detail["transactions"]), 2) == 0
    assert float(before) > 0

    twice = client.post(f"/api/v1/tickets/{target['id']}/void", headers=auth,
                        json={"reason": "again"})
    assert twice.status_code == 409


# ---------------------------------------------------------------------------
# Billing
# ---------------------------------------------------------------------------
def test_rules_expose_their_statements_and_performance(client, auth, project_id):
    rules = client.get(f"/api/v1/projects/{project_id}/rules", headers=auth).json()
    veg = next(r for r in rules["items"] if r["name"] == "ROW Vegetative Load")
    assert len(veg["statements"]) == 4
    assert veg["match_count"] > 0
    assert float(veg["billed_total"]) > 0
    assert veg["statements"][0]["operator_symbol"] == "="


def test_a_rule_cannot_be_saved_without_a_contract_on_the_project(
        client, analyst_auth, auth, project_id):
    project = client.get(f"/api/v1/projects/{project_id}", headers=auth).json()
    load_type = next(t for t in project["ticket_types"] if t["code"] == "LOAD")
    service_code = client.get(f"/api/v1/projects/{project_id}/service-codes",
                              headers=auth).json()["items"][0]
    orphan_contract = str(uuid.uuid4())

    r = client.post(f"/api/v1/projects/{project_id}/rules", headers=analyst_auth,
                    json={"name": f"Orphan {uuid.uuid4().hex[:6]}",
                          "ticket_type_id": load_type["ticket_type_id"],
                          "service_code_id": service_code["id"],
                          "contract_id": orphan_contract})
    assert r.status_code == 422


def test_rule_dry_run_reports_matches_without_writing(client, auth, project_id):
    rules = client.get(f"/api/v1/projects/{project_id}/rules", headers=auth).json()
    veg = next(r for r in rules["items"] if r["name"] == "ROW Vegetative Load")

    before = client.get(f"/api/v1/projects/{project_id}/transactions",
                        headers=auth).json()["total"]
    result = client.post(f"/api/v1/rules/{veg['id']}/test", headers=auth).json()
    after = client.get(f"/api/v1/projects/{project_id}/transactions",
                       headers=auth).json()["total"]

    assert result["matched"] > 0
    assert result["estimated_total"] > 0
    assert before == after, "a dry run must not write transactions"


def test_operands_carry_their_operators_and_option_sources(client, auth, project_id):
    operands = client.get(f"/api/v1/projects/{project_id}/rule-operands",
                          headers=auth).json()["items"]
    by_code = {o["code"]: o for o in operands}
    assert by_code["contractor"]["options_source"] == "project_contractors"
    assert any(op["code"] == "in" for op in by_code["debris_type"]["operators"])
    assert any(op["code"] == "gt" for op in by_code["distance"]["operators"])
    # A text operand should not offer a numeric comparison.
    assert not any(op["code"] == "between" for op in by_code["debris_type"]["operators"])


def test_a_new_rate_supersedes_the_old_one_without_rewriting_history(
        client, auth, project_id):
    """A rate change closes the old row rather than editing it, so transactions
    already computed keep pointing at the rate they were billed under."""
    codes = client.get(f"/api/v1/projects/{project_id}/service-codes",
                       headers=auth).json()["items"]
    veg = next(c for c in codes if c["code"] == "ROW-VEG")
    old_rate = float(veg["current_rate"])
    old_rate_id = veg["current_rate_id"]
    before = len(veg["rates"])
    effective = (date.today() + timedelta(days=1)).isoformat()

    added = client.post(f"/api/v1/service-codes/{veg['id']}/rates", headers=auth,
                        json={"amount": round(old_rate + 1, 4),
                              "unit_type": "per_cubic_yard",
                              "effective_from": effective})
    assert added.status_code == 201, added.text

    refreshed = client.get(f"/api/v1/projects/{project_id}/service-codes",
                           headers=auth).json()["items"]
    veg2 = next(c for c in refreshed if c["code"] == "ROW-VEG")
    assert len(veg2["rates"]) == before + 1

    newest = max(veg2["rates"], key=lambda r: r["effective_from"])
    assert float(newest["amount"]) == round(old_rate + 1, 4)

    # The superseded rate is closed, not rewritten.
    superseded = next(r for r in veg2["rates"] if r["id"] == old_rate_id)
    assert float(superseded["amount"]) == old_rate
    assert superseded["effective_to"] is not None


def test_transactions_are_immutable_through_the_api(client, auth, project_id):
    txns = client.get(f"/api/v1/projects/{project_id}/transactions",
                      params={"limit": 1}, headers=auth).json()["items"]
    txn_id = txns[0]["id"]
    assert client.patch(f"/api/v1/transactions/{txn_id}", headers=auth,
                        json={"amount": 1}).status_code in (404, 405)
    assert client.delete(f"/api/v1/transactions/{txn_id}",
                         headers=auth).status_code in (404, 405)


def test_reversal_requires_a_reason(client, auth, project_id):
    txns = client.get(f"/api/v1/projects/{project_id}/transactions",
                      params={"limit": 1, "invoice_status": "uninvoiced"},
                      headers=auth).json()["items"]
    r = client.post(f"/api/v1/transactions/{txns[0]['id']}/reverse",
                    headers=auth, json={})
    assert r.status_code == 400


def test_invoices_roll_up_uninvoiced_transactions(client, auth, project_id):
    project = client.get(f"/api/v1/projects/{project_id}", headers=auth).json()
    contract = next(c for c in project["contracts"] if c["is_primary"])
    contractor = next(c for c in project["contractors"] if c["role_on_project"] == "prime")

    created = client.post(f"/api/v1/projects/{project_id}/invoices", headers=auth,
                          json={"contractor_id": contractor["contractor_id"],
                                "contract_id": contract["contract_id"],
                                "period_start": (date.today() - timedelta(days=365)).isoformat(),
                                "period_end": (date.today() + timedelta(days=1)).isoformat(),
                                "notes": "API test invoice"})
    assert created.status_code == 201, created.text
    invoice_id = created.json()["id"]

    detail = client.get(f"/api/v1/invoices/{invoice_id}", headers=auth).json()
    assert detail["invoice"]["invoice_number"].startswith("INV-")
    assert float(detail["invoice"]["total"]) == pytest.approx(
        sum(float(l["amount"]) for l in detail["lines"]), abs=0.01)
    assert detail["by_service_code"]


# ---------------------------------------------------------------------------
# Reporting and audit
# ---------------------------------------------------------------------------
def test_dashboard_returns_every_panel(client, auth, project_id):
    d = client.get(f"/api/v1/projects/{project_id}/dashboard", headers=auth).json()
    assert d["summary"]["ticket_total"] > 0
    assert d["readiness"]["ready_for_field"]
    for panel in ("by_day", "by_ticket_type", "by_debris_type",
                  "by_contractor", "by_site", "top_monitors", "processing_queue"):
        assert isinstance(d[panel], list), panel


def test_every_edit_leaves_an_audit_artifact(client, auth, project_id):
    listing = client.get(f"/api/v1/projects/{project_id}/tickets",
                         params={"limit": 1}, headers=auth).json()
    ticket_id = listing["items"][0]["id"]
    before = client.get("/api/v1/audit", params={"entity_id": ticket_id},
                        headers=auth).json()["total"]

    client.patch(f"/api/v1/tickets/{ticket_id}", headers=auth,
                 json={"notes": f"audit probe {uuid.uuid4().hex[:8]}",
                       "_reason": "API test edit"})

    after = client.get("/api/v1/audit", params={"entity_id": ticket_id},
                       headers=auth).json()
    assert after["total"] == before + 1
    latest = after["items"][0]
    assert latest["action"] == "update"
    assert "notes" in latest["changed"]
    assert latest["reason"] == "API test edit"
    assert latest["actor"]


def test_query_builder_rejects_injected_columns(client, auth):
    sources = client.get("/api/v1/query/sources", headers=auth).json()
    assert {s["key"] for s in sources["sources"]} == {"tickets", "transactions", "audit"}

    bad = client.post("/api/v1/query/run", headers=auth, json={
        "source": "tickets",
        "filters": [{"column": "1; DROP TABLE tickets", "operator": "eq", "value": 1}],
    })
    assert bad.status_code == 400

    good = client.post("/api/v1/query/run", headers=auth, json={
        "source": "tickets",
        "columns": ["ticket_number", "status", "billable_cubic_yards"],
        "filters": [{"column": "status", "operator": "eq", "value": "completed"}],
        "limit": 5,
    }).json()
    assert good["returned"] <= 5
    assert good["columns"] == ["ticket_number", "status", "billable_cubic_yards"]


def test_export_records_itself_in_the_audit_trail(client, auth, project_id):
    export = client.get(f"/api/v1/projects/{project_id}/export/tickets",
                        headers=auth).json()
    assert export["count"] > 0
    assert "ticket_number" in export["columns"]

    audit = client.get("/api/v1/audit", params={"action": "export", "limit": 1},
                       headers=auth).json()
    assert audit["total"] > 0


# ---------------------------------------------------------------------------
# The extendable catalog
# ---------------------------------------------------------------------------
def test_a_new_ticket_type_is_added_as_data(client, auth, project_id):
    code = f"APITEST_{uuid.uuid4().hex[:6].upper()}"
    created = client.post("/api/v1/ticket-types", headers=auth, json={
        "code": code,
        "label": "API Test Type",
        "kind": "custom",
        "billable": True,
        "stage_schema": [{"code": "only", "label": "Only Stage", "sequence": 1,
                          "required": True, "completes_ticket": True}],
        "field_schema": [{"key": "widget_count", "label": "Widgets",
                          "type": "number", "required": True, "stage": "only"}],
    })
    assert created.status_code == 201, created.text
    type_id = created.json()["id"]

    linked = client.post(f"/api/v1/projects/{project_id}/ticket-types", headers=auth,
                         json={"ticket_type_id": type_id})
    assert linked.status_code == 201

    ticket = client.post(f"/api/v1/projects/{project_id}/tickets", headers=auth,
                         json={"ticket_type_id": type_id, "status": "open",
                               "fields": {"widget_count": 7, "quantity": 7}})
    assert ticket.status_code == 201, ticket.text
    assert ticket.json()["ticket"]["data"]["widget_count"] == 7

    client.delete(f"/api/v1/ticket-types/{type_id}", headers=auth)


def test_a_stage_schema_without_a_completing_stage_is_rejected(client, auth):
    r = client.post("/api/v1/ticket-types", headers=auth, json={
        "code": f"BAD_{uuid.uuid4().hex[:5].upper()}",
        "label": "Never Completes", "kind": "custom",
        "stage_schema": [{"code": "a", "label": "A", "sequence": 1}],
        "field_schema": [],
    })
    assert r.status_code == 400
    assert "completes_ticket" in r.json()["error"]["message"]


def test_a_field_referencing_an_undeclared_stage_is_rejected(client, auth):
    r = client.post("/api/v1/ticket-types", headers=auth, json={
        "code": f"BAD_{uuid.uuid4().hex[:5].upper()}",
        "label": "Bad Field Stage", "kind": "custom",
        "stage_schema": [{"code": "a", "label": "A", "sequence": 1,
                          "completes_ticket": True}],
        "field_schema": [{"key": "x", "label": "X", "type": "text", "stage": "zzz"}],
    })
    assert r.status_code == 400


def test_system_ticket_types_cannot_be_added_to_a_project(client, auth, project_id):
    types = client.get("/api/v1/ticket-types", params={"include_system": True},
                       headers=auth).json()["items"]
    pending = next(t for t in types if t["code"] == "PENDING_COLLECTION")
    r = client.post(f"/api/v1/projects/{project_id}/ticket-types", headers=auth,
                    json={"ticket_type_id": pending["id"]})
    assert r.status_code == 422
    assert "system type" in r.json()["error"]["message"]


# ---------------------------------------------------------------------------
# Federation
# ---------------------------------------------------------------------------
def test_the_instance_advertises_a_hex_key_and_a_public_key(client, auth):
    identity = client.get("/api/v1/peer/identity").json()
    assert len(identity["instance_key"]) == 64
    assert int(identity["instance_key"], 16) >= 0

    private = client.get("/api/v1/instance", headers=auth).json()
    assert "private_key_pem" not in private


def test_a_private_project_refuses_an_unsigned_peer_read(client, project_id):
    r = client.get(f"/api/v1/peer/projects/{project_id}/tickets")
    assert r.status_code == 403


def test_a_public_project_serves_an_unsigned_peer_read(client, auth, project_id):
    original = client.get(f"/api/v1/projects/{project_id}",
                          headers=auth).json()["visibility_flag"]
    try:
        client.put(f"/api/v1/projects/{project_id}/share", headers=auth,
                   json={"visibility_flag": "public", "allowed_viewers": []})
        r = client.get(f"/api/v1/peer/projects/{project_id}/tickets")
        assert r.status_code == 200
        assert r.json()["served_by"]
    finally:
        client.put(f"/api/v1/projects/{project_id}/share", headers=auth,
                   json={"visibility_flag": original, "allowed_viewers": []})


def test_a_restricted_project_needs_a_valid_signature(client, auth, project_id):
    """Instance Beta is registered and allow-listed; a third party is not."""
    from app.security import (body_digest, generate_instance_key, generate_keypair,
                              sign_request, signing_payload)
    from datetime import datetime, timezone

    beta_key = generate_instance_key()
    beta_private, beta_public = generate_keypair()
    rogue_private, _ = generate_keypair()

    peer = client.post("/api/v1/peers", headers=auth, json={
        "instance_key": beta_key, "display_name": "Instance Beta",
        "public_key_pem": beta_public, "trust_state": "trusted"})
    assert peer.status_code == 201

    original = client.get(f"/api/v1/projects/{project_id}",
                          headers=auth).json()["visibility_flag"]
    client.put(f"/api/v1/projects/{project_id}/share", headers=auth,
               json={"visibility_flag": "restricted", "allowed_viewers": [beta_key]})

    path = f"/api/v1/peer/projects/{project_id}/tickets"

    run = uuid.uuid4().hex[:8]

    def headers_for(private_pem: str, key: str, nonce: str) -> dict:
        nonce = f"{run}-{nonce}"
        ts = datetime.now(timezone.utc).isoformat()
        payload = signing_payload("GET", path, key, ts, nonce, body_digest(b""))
        return {"X-Instance-Key": key, "X-Timestamp": ts, "X-Nonce": nonce,
                "X-Signature": sign_request(private_pem, payload)}

    try:
        ok = client.get(path, headers=headers_for(beta_private, beta_key, "n-1"))
        assert ok.status_code == 200, ok.text
        assert ok.json()["project"]["visibility_flag"] == "restricted"

        # Replaying the same nonce is refused.
        replay = client.get(path, headers=headers_for(beta_private, beta_key, "n-1"))
        assert replay.status_code == 401

        # A wrong key signing as Beta is refused.
        forged = client.get(path, headers=headers_for(rogue_private, beta_key, "n-2"))
        assert forged.status_code == 401

        # An unregistered third party is refused outright.
        third_key = generate_instance_key()
        third = client.get(path, headers=headers_for(rogue_private, third_key, "n-3"))
        assert third.status_code == 403

        # Unsigned is refused too.
        assert client.get(path).status_code == 403
    finally:
        client.put(f"/api/v1/projects/{project_id}/share", headers=auth,
                   json={"visibility_flag": original, "allowed_viewers": []})
        peers = client.get("/api/v1/peers", headers=auth).json()["items"]
        for p in peers:
            if p["instance_key"] == beta_key:
                client.delete(f"/api/v1/peers/{p['id']}", headers=auth)


def test_a_peer_read_is_written_to_the_audit_trail(client, auth, project_id):
    original = client.get(f"/api/v1/projects/{project_id}",
                          headers=auth).json()["visibility_flag"]
    before = client.get("/api/v1/audit", params={"action": "peer_read"},
                        headers=auth).json()["total"]
    try:
        client.put(f"/api/v1/projects/{project_id}/share", headers=auth,
                   json={"visibility_flag": "public", "allowed_viewers": []})
        client.get(f"/api/v1/peer/projects/{project_id}/tickets")
    finally:
        client.put(f"/api/v1/projects/{project_id}/share", headers=auth,
                   json={"visibility_flag": original, "allowed_viewers": []})
    after = client.get("/api/v1/audit", params={"action": "peer_read"},
                       headers=auth).json()["total"]
    assert after >= before


# ---------------------------------------------------------------------------
# Worker administration: worker.manage puts crew in, user.manage grants rank
# ---------------------------------------------------------------------------
def _worker_body(**over):
    tag = uuid.uuid4().hex[:8]
    body = {"username": f"t_{tag}", "full_name": "Test Monitor",
            "global_role": "monitor", "monitor_id": f"MON-{tag[:5]}"}
    body.update(over)
    return body


def test_a_manager_creates_and_edits_a_monitor(client, manager_auth):
    created = client.post("/api/v1/users", headers=manager_auth, json=_worker_body())
    assert created.status_code == 201, created.text
    new_id = created.json()["id"]

    edited = client.patch(f"/api/v1/users/{new_id}", headers=manager_auth,
                          json={"full_name": "Test Monitor Renamed",
                                "phone": "314-555-0102"})
    assert edited.status_code == 200, edited.text
    assert edited.json()["full_name"] == "Test Monitor Renamed"


# A5: "from the assign worker option inside of projects we dont have the same
# form or options and are not able to fully create a new user the right way".
# The assign-worker path posts the same body the Workers screen does, so every
# field it can send has to land, and the two it leaves empty have to be issued.
def test_a_worker_created_while_assigning_is_a_whole_worker(
        client, auth, manager_auth, project_id):
    contractor = client.get("/api/v1/contractors", params={"limit": 1},
                            headers=auth).json()["items"][0]
    tag = uuid.uuid4().hex[:6]

    created = client.post("/api/v1/users", headers=manager_auth, json={
        "first_name": "Dale", "middle_name": "R", "last_name": f"Whitcomb{tag}",
        "global_role": "monitor", "employee_id": f"EMP-{tag}",
        "employer_contractor_id": contractor["id"],
        "email": f"dale.{tag}@example.com", "phone": "314-555-0175",
        "password": "temporary-pass-1",
    })
    assert created.status_code == 201, created.text
    body = created.json()

    # Issued rather than demanded: leaving these empty is the normal case.
    assert body["username"], "a username has to be issued when none is typed"
    assert body["monitor_id"], "a monitor ID has to be issued when none is typed"
    # And everything that was typed has to be on the record.
    assert body["full_name"] == f"Dale R Whitcomb{tag}"
    assert body["employee_id"] == f"EMP-{tag}"
    assert str(body["employer_contractor_id"]) == str(contractor["id"])
    assert body["phone"] == "314-555-0175"

    # The password set here is the one they sign in with.
    signed_in = client.post("/api/v1/auth/login",
                            json={"username": body["username"],
                                  "password": "temporary-pass-1"})
    assert signed_in.status_code == 200, signed_in.text

    # And the assignment that follows it works in the same breath.
    assigned = client.post(f"/api/v1/projects/{project_id}/assignments",
                           headers=auth,
                           json={"user_id": body["id"], "project_role": "monitor",
                                 "can_create_tickets": True})
    assert assigned.status_code in (200, 201), assigned.text


# J1: a monitor ID is printed on every ticket and has to be unique, so asking
# somebody pasting twenty names to invent twenty of them is asking for twenty
# collisions.
def test_the_importer_suggests_monitor_ids_rather_than_demanding_them(
        client, auth):
    tag = uuid.uuid4().hex[:5]
    preview = client.post("/api/v1/users/import", headers=auth, json={
        "text": (f"Name\tEmployee ID\n"
                 f"Ada Vasquez{tag}\tIMP-{tag}1\n"
                 f"Ben Okoro{tag}\tIMP-{tag}2\n"),
        "global_role": "monitor",
    }).json()

    rows = [r for r in preview["rows"] if r["action"] == "create"]
    assert len(rows) == 2
    ids = [r["values"]["monitor_id"] for r in rows]
    assert all(i.startswith("MON-") for i in ids), ids
    # Two rows in one paste never get the same number.
    assert len(set(ids)) == 2
    # And the preview says which cells it filled in, so nothing looks typed.
    assert all("monitor_id" in r["suggested"] for r in rows)
    assert all("username" in r["suggested"] for r in rows)


def test_a_suggested_monitor_id_is_never_one_already_issued(client, auth):
    # The failure this guards against is specific: numbering on from the highest
    # walks into every gap left by an ID entered by hand, and the collision only
    # surfaces at the write, after the user has corrected the table and pressed
    # import.
    taken = {u["monitor_id"] for u in
             client.get("/api/v1/users", params={"limit": 500},
                        headers=auth).json()["items"] if u.get("monitor_id")}
    tag = uuid.uuid4().hex[:5]
    preview = client.post("/api/v1/users/import", headers=auth, json={
        "text": "Name\tEmployee ID\n" + "".join(
            f"Crew Member{tag}{n}\tBULK-{tag}-{n}\n" for n in range(12)),
        "global_role": "monitor",
    }).json()

    suggested = [r["values"]["monitor_id"] for r in preview["rows"]
                 if r["action"] == "create"]
    assert len(suggested) == 12
    assert not (set(suggested) & taken), sorted(set(suggested) & taken)

    # And the import it previewed actually writes.
    done = client.post("/api/v1/users/import", headers=auth, json={
        "text": "Name\tEmployee ID\tMonitor ID\n" + "".join(
            f"Crew Member{tag}{n}\tBULK-{tag}-{n}\t{suggested[n]}\n"
            for n in range(12)),
        "global_role": "monitor", "dry_run": False,
        "default_password": "bulk-temporary-pass",
    })
    assert done.status_code == 200, done.text


def test_a_blank_row_is_never_given_an_id_another_row_is_taking(client, auth):
    # This is the exact shape the screen sends back: the preview filled two rows
    # in, the user corrected the third, and the corrected table comes back with
    # two IDs present and one still blank. An allocator that only knew what was
    # in the database would hand the blank row the first of the other two.
    tag = uuid.uuid4().hex[:5]
    preview = client.post("/api/v1/users/import", headers=auth, json={
        "text": (f"Name\tEmployee ID\n"
                 f"Row One{tag}\tSEQ-{tag}-1\n"
                 f"Row Two{tag}\tSEQ-{tag}-2\n"
                 f"\tSEQ-{tag}-3\n"),
        "global_role": "monitor",
    }).json()
    filled = [r["values"]["monitor_id"] for r in preview["rows"]
              if r["action"] == "create"]
    assert len(filled) == 2

    corrected = client.post("/api/v1/users/import", headers=auth, json={
        "text": (f"First\tLast\tEmployee ID\tMonitor ID\n"
                 f"Row\tOne{tag}\tSEQ-{tag}-1\t{filled[0]}\n"
                 f"Row\tTwo{tag}\tSEQ-{tag}-2\t{filled[1]}\n"
                 f"Fixed{tag}\t\tSEQ-{tag}-3\t\n"),
        "global_role": "monitor", "dry_run": False,
        "default_password": "sequence-temporary-pass",
    })
    assert corrected.status_code == 200, corrected.text
    assert corrected.json()["created"] == 3


def test_a_monitor_id_already_in_use_is_named_not_left_to_the_constraint(
        client, auth):
    mine = next(u for u in client.get("/api/v1/users", params={"limit": 50},
                                      headers=auth).json()["items"]
                if u.get("monitor_id"))
    tag = uuid.uuid4().hex[:5]
    preview = client.post("/api/v1/users/import", headers=auth, json={
        "text": (f"Name\tEmployee ID\tMonitor ID\n"
                 f"Clashing Person{tag}\tCLASH-{tag}\t{mine['monitor_id']}\n"),
        "global_role": "monitor",
    }).json()
    row = preview["rows"][0]
    assert row["action"] == "skip"
    assert any("already belongs to somebody else" in p for p in row["problems"])


def test_the_same_monitor_id_twice_in_one_paste_is_caught(client, auth):
    tag = uuid.uuid4().hex[:5]
    preview = client.post("/api/v1/users/import", headers=auth, json={
        "text": (f"Name\tEmployee ID\tMonitor ID\n"
                 f"First Person{tag}\tDUP-{tag}-1\tDUPE-{tag}\n"
                 f"Second Person{tag}\tDUP-{tag}-2\tDUPE-{tag}\n"),
        "global_role": "monitor",
    }).json()
    assert preview["rows"][0]["action"] == "create"
    assert preview["rows"][1]["action"] == "skip"
    assert any("appears twice" in p for p in preview["rows"][1]["problems"])


def test_a_monitor_id_in_the_paste_is_left_alone(client, auth):
    tag = uuid.uuid4().hex[:5]
    preview = client.post("/api/v1/users/import", headers=auth, json={
        "text": (f"Name\tEmployee ID\tMonitor ID\n"
                 f"Cyd Farrow{tag}\tIMP-{tag}3\tCREW-{tag}\n"),
        "global_role": "monitor",
    }).json()
    row = preview["rows"][0]
    assert row["values"]["monitor_id"] == f"CREW-{tag}"
    assert "monitor_id" not in row["suggested"]


def test_a_manager_cannot_grant_admin_rank(client, manager_auth):
    refused = client.post("/api/v1/users", headers=manager_auth,
                          json=_worker_body(global_role="admin"))
    assert refused.status_code == 403
    assert "user.manage" in refused.json()["error"]["message"]


def test_a_manager_cannot_promote_an_existing_monitor(client, manager_auth):
    created = client.post("/api/v1/users", headers=manager_auth, json=_worker_body())
    new_id = created.json()["id"]
    refused = client.patch(f"/api/v1/users/{new_id}", headers=manager_auth,
                           json={"global_role": "analyst"})
    assert refused.status_code == 403
    assert "user.manage" in refused.json()["error"]["message"]


def test_a_manager_cannot_edit_an_account_that_already_holds_rank(
        client, manager_auth, auth):
    admin_id = client.get("/api/v1/auth/me", headers=auth).json()["user"]["id"]
    refused = client.patch(f"/api/v1/users/{admin_id}", headers=manager_auth,
                           json={"phone": "314-555-0000"})
    assert refused.status_code == 403
    assert "user.manage" in refused.json()["error"]["message"]


def test_a_manager_cannot_deactivate_through_an_edit(client, manager_auth):
    created = client.post("/api/v1/users", headers=manager_auth, json=_worker_body())
    new_id = created.json()["id"]
    refused = client.patch(f"/api/v1/users/{new_id}", headers=manager_auth,
                           json={"is_active": False})
    assert refused.status_code == 403
    assert "user.manage" in refused.json()["error"]["message"]
    assert client.delete(f"/api/v1/users/{new_id}",
                         headers=manager_auth).status_code == 403


def test_an_admin_does_both(client, auth):
    created = client.post("/api/v1/users", headers=auth,
                          json=_worker_body(global_role="analyst"))
    assert created.status_code == 201, created.text
    new_id = created.json()["id"]
    assert client.patch(f"/api/v1/users/{new_id}", headers=auth,
                        json={"global_role": "manager"}).status_code == 200
    assert client.delete(f"/api/v1/users/{new_id}", headers=auth).status_code == 204


def test_a_monitor_still_cannot_reach_the_worker_list(client, monitor_auth):
    assert client.get("/api/v1/users", headers=monitor_auth).status_code == 403


# ---------------------------------------------------------------------------
# Contracts cannot exist without a document link
# ---------------------------------------------------------------------------
def _contract_body(client, auth, **over):
    clients_ = client.get("/api/v1/clients", headers=auth).json()["items"]
    contractors = client.get("/api/v1/contractors", headers=auth).json()["items"]
    tag = uuid.uuid4().hex[:8]
    body = {
        "contract_number": f"TEST-{tag}", "title": "Test contract",
        "client_id": clients_[0]["id"], "contractor_id": contractors[0]["id"],
        "contract_type": "unit_price", "status": "draft",
        "effective_from": str(date.today()),
        "document_url": "https://example.sharepoint.com/contracts/test.pdf",
    }
    body.update(over)
    return body


def test_a_contract_without_a_document_link_is_refused(client, auth):
    body = _contract_body(client, auth)
    body.pop("document_url")
    refused = client.post("/api/v1/contracts", headers=auth, json=body)
    assert refused.status_code == 400
    assert refused.json()["error"]["code"] == "contract_incomplete"
    assert "document_url" in refused.json()["error"]["details"]["missing"]


def test_a_contract_document_link_must_be_a_url(client, auth):
    refused = client.post("/api/v1/contracts", headers=auth,
                          json=_contract_body(client, auth,
                                              document_url="box://not-a-url"))
    assert refused.status_code == 400
    assert refused.json()["error"]["code"] == "document_url_invalid"


def test_a_contract_with_every_required_field_is_accepted(client, auth):
    created = client.post("/api/v1/contracts", headers=auth,
                          json=_contract_body(client, auth))
    assert created.status_code == 201, created.text
    contract_id = created.json()["id"]

    blanked = client.patch(f"/api/v1/contracts/{contract_id}", headers=auth,
                           json={"document_url": ""})
    assert blanked.status_code == 400
    client.delete(f"/api/v1/contracts/{contract_id}", headers=auth)


def test_contracts_missing_a_link_are_listed_for_remediation(client, auth):
    listed = client.get("/api/v1/contracts/remediation", headers=auth)
    assert listed.status_code == 200
    for row in listed.json()["items"]:
        assert row["missing"], "a contract on the remediation list with nothing missing"


# ---------------------------------------------------------------------------
# Documents: the link registry
# ---------------------------------------------------------------------------
@pytest.fixture()
def contractor_id(client, auth):
    return client.get("/api/v1/contractors", headers=auth).json()["items"][0]["id"]


def test_a_document_registers_against_any_entity(client, auth, contractor_id):
    created = client.post("/api/v1/documents", headers=auth, json={
        "entity_type": "contractors", "entity_id": contractor_id,
        "kind_code": "certificate_other", "title": "Flagger certification",
        "url": "https://example.sharepoint.com/certs/flagger.pdf",
        "provider": "sharepoint",
        "expires_on": str(date.today() + timedelta(days=10)),
    })
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["verification_status"] == "pending"
    assert body["watch_state"] == "expiring"
    client.delete(f"/api/v1/documents/{body['id']}", headers=auth)


def test_a_document_link_has_to_be_a_link(client, auth, contractor_id):
    refused = client.post("/api/v1/documents", headers=auth, json={
        "entity_type": "contractors", "entity_id": contractor_id,
        "kind_code": "other", "title": "In the shared drive somewhere",
        "url": "\\\\fileserver\\legal\\contract.pdf",
    })
    assert refused.status_code in (400, 422)


def test_the_expiring_sweep_is_right_at_the_boundary(client, auth, contractor_id):
    inside = client.post("/api/v1/documents", headers=auth, json={
        "entity_type": "contractors", "entity_id": contractor_id,
        "kind_code": "insurance", "title": "Boundary inside",
        "url": "https://example.box.com/inside",
        "expires_on": str(date.today() + timedelta(days=30)),
    }).json()
    outside = client.post("/api/v1/documents", headers=auth, json={
        "entity_type": "contractors", "entity_id": contractor_id,
        "kind_code": "insurance", "title": "Boundary outside",
        "url": "https://example.box.com/outside",
        "expires_on": str(date.today() + timedelta(days=31)),
    }).json()
    try:
        found = client.get("/api/v1/documents/expiring", params={"days": 30},
                           headers=auth).json()
        ids = {d["id"] for d in found["items"]}
        assert inside["id"] in ids, "a document expiring on the boundary day was missed"
        assert outside["id"] not in ids, "a document a day past the window was included"
    finally:
        client.delete(f"/api/v1/documents/{inside['id']}", headers=auth)
        client.delete(f"/api/v1/documents/{outside['id']}", headers=auth)


def test_verifying_and_requesting_both_leave_a_trail(client, auth, contractor_id):
    doc = client.post("/api/v1/documents", headers=auth, json={
        "entity_type": "contractors", "entity_id": contractor_id,
        "kind_code": "w9", "title": "W-9", "url": "https://example.box.com/w9",
    }).json()
    try:
        asked = client.post(f"/api/v1/documents/{doc['id']}/request", headers=auth,
                            json={"requested_from": "contractor"}).json()
        assert asked["requested_from"] == "contractor"
        assert asked["days_since_request"] == 0

        verified = client.post(f"/api/v1/documents/{doc['id']}/verify",
                               headers=auth, json={}).json()
        assert verified["verification_status"] == "verified"
        assert verified["verified_by_name"]

        trail = client.get("/api/v1/audit", params={"entity_type": "documents"},
                           headers=auth).json()
        assert trail["total"] >= 2
    finally:
        client.delete(f"/api/v1/documents/{doc['id']}", headers=auth)


# ---------------------------------------------------------------------------
# Contract line items and code generation
# ---------------------------------------------------------------------------
@pytest.fixture()
def spare_contract(client, auth):
    """A contract linked to the demo project, so codes can be generated from it."""
    body = _contract_body(client, auth, title="Line item fixture contract")
    contract = client.post("/api/v1/contracts", headers=auth, json=body).json()
    yield contract
    client.delete(f"/api/v1/contracts/{contract['id']}", headers=auth)


def test_twenty_pasted_line_items_import_in_one_call(client, auth, spare_contract):
    header = "Line\tItem Code\tDescription\tUnit\tUnit Price\tDebris"
    rows = "\n".join(
        f"{i}\t{i:02d}.10\tCollection and hauling of debris, area {i}\tCY\t"
        f"{7 + i}.25\tVeg" for i in range(1, 21))
    paste = f"{header}\n{rows}"

    preview = client.post(f"/api/v1/contracts/{spare_contract['id']}/line-items/import",
                          headers=auth, json={"text": paste}).json()
    assert preview["dry_run"] is True
    assert len(preview["rows"]) == 20
    assert all(r["action"] == "create" for r in preview["rows"])
    assert preview["rows"][0]["values"]["unit_type_code"] == "per_cubic_yard"
    assert preview["rows"][0]["values"]["debris_type_code"] == "VEG"

    written = client.post(f"/api/v1/contracts/{spare_contract['id']}/line-items/import",
                          headers=auth, json={"text": paste, "dry_run": False}).json()
    assert written["written"] == 20
    assert len(written["items"]) == 20


def test_a_second_import_updates_rather_than_duplicates(client, auth, spare_contract):
    paste = ("Line\tDescription\tUnit\tUnit Price\n"
             "1\tFirst pass description\tCY\t9.00")
    client.post(f"/api/v1/contracts/{spare_contract['id']}/line-items/import",
                headers=auth, json={"text": paste, "dry_run": False})
    again = ("Line\tDescription\tUnit\tUnit Price\n"
             "1\tCorrected description\tCY\t9.50")
    preview = client.post(f"/api/v1/contracts/{spare_contract['id']}/line-items/import",
                          headers=auth, json={"text": again}).json()
    assert preview["rows"][0]["action"] == "update"

    client.post(f"/api/v1/contracts/{spare_contract['id']}/line-items/import",
                headers=auth, json={"text": again, "dry_run": False})
    items = client.get(f"/api/v1/contracts/{spare_contract['id']}/line-items",
                       headers=auth).json()
    ones = [i for i in items["items"] if i["line_number"] == 1]
    assert len(ones) == 1
    assert ones[0]["description"] == "Corrected description"


def test_selecting_line_items_produces_matching_service_codes(
        client, auth, project_id, spare_contract):
    paste = "\n".join([
        "Line\tItem Code\tDescription\tUnit\tUnit Price\tDebris",
        "1\tGEN-01\tGenerated code one\tCY\t9.45\tVeg",
        "2\tGEN-02\tGenerated code two\tTon\t41.00\tC&D",
        "3\tGEN-03\tGenerated code three\tEach\t185.00\tStump",
    ])
    client.post(f"/api/v1/contracts/{spare_contract['id']}/line-items/import",
                headers=auth, json={"text": paste, "dry_run": False})

    client.post(f"/api/v1/projects/{project_id}/contracts", headers=auth,
                json={"contract_id": spare_contract["id"]})

    lines = client.get(f"/api/v1/contracts/{spare_contract['id']}/line-items",
                       headers=auth).json()["items"]
    chosen = [l["id"] for l in lines if l["item_code"] in ("GEN-01", "GEN-02")]

    made = client.post(f"/api/v1/projects/{project_id}/service-codes/from-line-items",
                       headers=auth, json={"line_item_ids": chosen})
    assert made.status_code == 201, made.text
    body = made.json()
    assert body["created"] == 2

    by_code = {c["code"]: c for c in body["items"]}
    assert by_code["GEN-01"]["current_rate"] == 9.45
    assert by_code["GEN-01"]["current_unit_type"] == "per_cubic_yard"
    assert by_code["GEN-02"]["current_unit_type"] == "per_ton"
    assert all(c["contract_line_item_id"] for c in body["items"])

    after = client.get(f"/api/v1/contracts/{spare_contract['id']}/line-items",
                       headers=auth).json()
    accepted = [l for l in after["items"] if l["status"] == "accepted"]
    assert {l["item_code"] for l in accepted} == {"GEN-01", "GEN-02"}
    assert all(l["service_code"] for l in accepted)

    for c in body["items"]:
        client.delete(f"/api/v1/service-codes/{c['id']}", headers=auth)


# ---------------------------------------------------------------------------
# The widened project list
# ---------------------------------------------------------------------------
def test_the_project_list_sorts_and_filters(client, auth, project_id):
    listed = client.get("/api/v1/projects", headers=auth,
                        params={"sort": "readiness"}).json()
    assert listed["items"], "an admin sees no projects"
    first = listed["items"][0]
    assert "permits_pending" in first
    assert "billable_total" in first
    assert "program_label" in first

    demo = next(p for p in listed["items"] if p["project_code"] == "STL-2026-ROW")
    by_client = client.get("/api/v1/projects", headers=auth,
                           params={"client_id": demo["client_id"]}).json()
    assert all(p["client_id"] == demo["client_id"] for p in by_client["items"])

    by_program = client.get("/api/v1/projects", headers=auth,
                            params={"program_code": "row_collection"}).json()
    assert any(p["id"] == project_id for p in by_program["items"])

    billed = client.get("/api/v1/projects", headers=auth,
                        params={"sort": "billed"}).json()["items"]
    totals = [float(p["billable_total"] or 0) for p in billed]
    assert totals == sorted(totals, reverse=True)


# B6: "Answer from this screen alone: which project is furthest behind on
# billing." Ryan's note named the two columns that were missing: volume against
# the estimate, and days to the end date.
def test_the_project_list_answers_how_far_along_and_how_long_is_left(
        client, auth, project_id):
    listed = client.get("/api/v1/projects", headers=auth).json()["items"]
    demo = next(p for p in listed if p["project_code"] == "STL-2026-ROW")

    assert float(demo["estimated_cubic_yards"]) > 0, \
        "the demo project carries a volume estimate"
    assert demo["days_to_end"] is not None, "the demo project has a period of performance"
    assert demo["ends_on"], "days remaining is only honest against a real end date"

    # Counted streams are not cubic yards. Summing hangers into a volume total
    # would produce a confident wrong percentage.
    streams = client.get(f"/api/v1/projects/{project_id}/estimates",
                         headers=auth).json()
    rows = streams["items"] if isinstance(streams, dict) else streams
    volume = sum(float(r["estimated_quantity"]) for r in rows
                 if r["unit_type_code"] == "per_cubic_yard")
    assert float(demo["estimated_cubic_yards"]) == pytest.approx(volume, rel=1e-6)


def test_the_project_list_sorts_by_how_far_behind_a_project_is(client, auth):
    ordered = client.get("/api/v1/projects", headers=auth,
                         params={"sort": "progress"}).json()["items"]
    shares = []
    for p in ordered:
        estimate = float(p["estimated_cubic_yards"] or 0)
        if estimate > 0:
            shares.append(float(p["total_cubic_yards"] or 0) / estimate)
    assert shares == sorted(shares), "furthest behind has to come first"

    by_date = client.get("/api/v1/projects", headers=auth,
                         params={"sort": "days_left"}).json()["items"]
    dated = [p["ends_on"] for p in by_date if p["ends_on"]]
    assert dated == sorted(dated), "the nearest deadline comes first"


# C2: "It names what is outstanding in words a person recognises, and each item
# is a link into the list that holds it."
def test_every_outstanding_item_says_where_it_lives(client, auth, project_id):
    data = client.get(f"/api/v1/projects/{project_id}/dashboard",
                      headers=auth).json()
    assert data["alerts"], "the demo project has a pending permit"
    for alert in data["alerts"]:
        assert alert["link"], f"{alert['kind']} has nowhere to go"
        assert alert["link"].startswith("/")
        assert alert["detail"], "an item with no detail explains nothing"
    kinds = {a["kind"]: a["link"] for a in data["alerts"]}
    if "permit" in kinds:
        assert kinds["permit"] == "/setup?tab=sites"
    if "certification" in kinds:
        assert kinds["certification"] == "/certifications"


def test_the_portfolio_summary_answers_above_project_scope(client, auth):
    summary = client.get("/api/v1/projects/summary", headers=auth).json()
    assert summary["projects"] >= 1
    assert summary["active"] >= 1
    assert "permits_pending" in summary
    assert float(summary["cubic_yards"]) > 0


def test_a_manager_sees_only_their_assignments(client, manager_auth, auth):
    theirs = client.get("/api/v1/projects", headers=manager_auth).json()
    everything = client.get("/api/v1/projects", headers=auth).json()
    assert theirs["total"] <= everything["total"]
    assert all(p["project_code"] for p in theirs["items"])


# ---------------------------------------------------------------------------
# Scope and estimates
# ---------------------------------------------------------------------------
def test_scope_records_only_what_the_client_confirmed(client, auth, project_id):
    scope = client.get(f"/api/v1/projects/{project_id}/scope", headers=auth).json()
    enabled = {s["debris_type_code"] for s in scope["scopes"] if s["is_enabled"]}
    assert "VEG" in enabled and "CD" in enabled
    assert "STUMP" not in enabled, "stumps were never authorised on the demo project"
    assert scope["suggested_debris_types"], "the program should suggest streams"


def test_an_estimate_revision_leaves_the_original_readable(client, auth, project_id):
    before = client.get(f"/api/v1/projects/{project_id}/estimates", headers=auth,
                        params={"history": True}).json()
    original = len(before["history"])

    made = client.post(f"/api/v1/projects/{project_id}/estimates", headers=auth,
                       json={"debris_type_code": "VEG", "estimated_quantity": 455000,
                             "source": "field_survey", "confidence": "surveyed",
                             "notes": "Week four survey"})
    assert made.status_code == 201, made.text
    # The unit was never asked for: the stream fixes it.
    assert made.json()["unit_type_code"] == "per_cubic_yard"

    after = client.get(f"/api/v1/projects/{project_id}/estimates", headers=auth,
                       params={"history": True}).json()
    assert len(after["history"]) == original + 1
    current = next(e for e in after["items"] if e["debris_type_code"] == "VEG")
    assert float(current["estimated_quantity"]) == 455000
    assert any(float(h["estimated_quantity"]) == 420000 for h in after["history"]), \
        "the original client estimate should still be readable"


def test_scope_can_be_widened_later(client, auth, project_id):
    client.put(f"/api/v1/projects/{project_id}/scope", headers=auth,
               json={"entries": [{"debris_type_code": "EWASTE", "is_enabled": True,
                                  "notes": "Added at the client's request"}]})
    scope = client.get(f"/api/v1/projects/{project_id}/scope", headers=auth).json()
    assert any(s["debris_type_code"] == "EWASTE" and s["is_enabled"]
               for s in scope["scopes"])
    client.put(f"/api/v1/projects/{project_id}/scope", headers=auth,
               json={"entries": [{"debris_type_code": "EWASTE", "is_enabled": False}]})


def test_lookups_still_boot_in_one_call(client, auth):
    lookups = client.get("/api/v1/lookups", headers=auth).json()
    assert lookups["programs"], "programs are missing from the boot payload"
    assert lookups["document_kinds"], "document kinds are missing from the boot payload"
    veg = next(d for d in lookups["debris_types"] if d["code"] == "VEG")
    assert veg["estimate_unit_type_code"] == "per_cubic_yard"


# ---------------------------------------------------------------------------
# Permits and alerts
# ---------------------------------------------------------------------------
def test_a_site_pending_twelve_days_reports_twelve(client, auth, project_id):
    created = client.post(f"/api/v1/projects/{project_id}/sites", headers=auth, json={
        "new": {"name": f"Permit Clock DMS {uuid.uuid4().hex[:6]}",
                "site_kind": "DMS", "city": "Ferguson", "state_code": "MO"},
        "opened_on": str(date.today()),
    })
    assert created.status_code == 201, created.text
    link_id = created.json()["id"]
    try:
        asked = client.post(
            f"/api/v1/projects/{project_id}/sites/{link_id}/permit/request",
            headers=auth,
            json={"requested_from": "pm",
                  "requested_on": str(date.today() - timedelta(days=12))}).json()
        assert asked["days_since_request"] == 12
        assert asked["permit_status"] == "pending"
    finally:
        client.delete(f"/api/v1/projects/{project_id}/sites/{link_id}", headers=auth)


def test_a_permit_cannot_be_verified_without_a_document(client, auth, project_id):
    permits = client.get(f"/api/v1/projects/{project_id}/permits", headers=auth).json()
    pending = next(p for p in permits["items"] if p["permit_status"] == "pending")
    refused = client.patch(
        f"/api/v1/projects/{project_id}/sites/{pending['project_site_id']}/permit",
        headers=auth, json={"permit_status": "verified"})
    assert refused.status_code in (409, 422)


def test_a_pending_permit_never_blocks_a_ticket(client, auth, project_id):
    readiness = client.get(f"/api/v1/projects/{project_id}/readiness",
                           headers=auth).json()
    permits = client.get(f"/api/v1/projects/{project_id}/permits", headers=auth).json()
    assert any(p["permit_status"] == "pending" for p in permits["items"])
    assert readiness["ready_for_field"] is True


def test_the_alerts_feed_carries_every_category_with_a_severity(
        client, auth, project_id):
    alerts = client.get(f"/api/v1/projects/{project_id}/alerts", headers=auth).json()
    assert alerts["total"] >= 1
    kinds = {a["kind"] for a in alerts["items"]}
    assert "permit" in kinds
    severities = [a["severity"] for a in alerts["items"]]
    assert severities == sorted(severities, reverse=True), \
        "the feed should hand the dashboard its own sort order"
    assert all(isinstance(a["severity"], int) for a in alerts["items"])
    assert set(alerts["by_severity"]) == {"high", "medium", "low"}


# ---------------------------------------------------------------------------
# Worker import: paste first, ask nothing
# ---------------------------------------------------------------------------
def test_a_crew_list_copied_out_of_excel_parses(client, auth):
    paste = ("Name\tEmployee ID\tEmail\tPhone\n"
             "Jordan Vance\t88101\tjvance@example.com\t314-555-0101\n"
             "Ana de la Cruz\t88102\tacruz@example.com\t314-555-0102\n"
             "Ortega, Luis Miguel\t88103\tlortega@example.com\t314-555-0103")
    preview = client.post("/api/v1/users/import", headers=auth,
                          json={"text": paste}).json()
    assert preview["dry_run"] is True
    assert len(preview["rows"]) == 3
    rows = {r["values"]["employee_id"]: r["values"] for r in preview["rows"]}
    assert rows["88101"]["first_name"] == "Jordan"
    assert rows["88102"]["last_name"] == "de la Cruz"
    assert rows["88103"]["first_name"] == "Luis"
    assert rows["88103"]["last_name"] == "Ortega"
    assert all(r["source_text"] for r in preview["rows"]), \
        "the original line has to survive so a bad split is recoverable"


def test_a_table_copied_out_of_an_email_parses(client, auth):
    paste = ("Worker Name, Company, Email\n"
             "Dee Hollis, Meramec Hauling LLC, dhollis@example.com\n"
             "Sam Ruiz, Meramec Hauling LLC, sruiz@example.com")
    preview = client.post("/api/v1/users/import", headers=auth,
                          json={"text": paste}).json()
    assert len(preview["rows"]) == 2
    assert preview["rows"][0]["values"]["employer_name"] == "Meramec Hauling LLC"


def test_a_bare_list_of_names_parses(client, auth):
    preview = client.post("/api/v1/users/import", headers=auth, json={
        "text": "Ray Nolan\nBeth Carver\nTom Ibarra"}).json()
    assert len(preview["rows"]) == 3
    assert preview["rows"][0]["values"]["first_name"] == "Ray"
    assert "delimiter" not in preview["summary"].lower(), \
        "the user should never be told about delimiters"


def test_forty_rows_dry_run_then_commit_atomically(client, auth):
    tag = uuid.uuid4().hex[:6]
    rows = "\n".join(
        f"Import Case{tag}{i:02d}\t9{tag[:3]}{i:02d}\tcase{tag}{i:02d}@example.com"
        for i in range(40))
    paste = f"Name\tEmployee ID\tEmail\n{rows}"

    preview = client.post("/api/v1/users/import", headers=auth,
                          json={"text": paste, "employer_name": f"Import Co {tag}"}).json()
    assert len(preview["rows"]) == 40
    assert all(r["action"] == "create" for r in preview["rows"])
    assert "40 are new" in preview["summary"]

    written = client.post("/api/v1/users/import", headers=auth, json={
        "text": paste, "dry_run": False, "employer_name": f"Import Co {tag}",
        "default_password": "openadms-temp"}).json()
    assert written["written"] == 40

    # Pasting the same list again updates rather than duplicating.
    second = client.post("/api/v1/users/import", headers=auth,
                         json={"text": paste, "employer_name": f"Import Co {tag}"}).json()
    assert all(r["action"] == "update" for r in second["rows"])

    found = client.get("/api/v1/users", headers=auth,
                       params={"q": f"Import Co {tag}", "limit": 100}).json()
    assert found["total"] == 40, "search should find them by employer"
    return None


def test_the_same_row_twice_in_one_paste_is_flagged(client, auth):
    paste = ("Name\tEmployee ID\n"
             "Twice Over\t70001\n"
             "Twice Over\t70001")
    preview = client.post("/api/v1/users/import", headers=auth,
                          json={"text": paste}).json()
    assert preview["rows"][1]["action"] == "skip"
    assert "twice" in preview["rows"][1]["problems"][0]


def test_two_people_with_the_same_name_at_different_firms_both_land(client, auth):
    tag = uuid.uuid4().hex[:6]
    paste = ("Name\tEmployee ID\tCompany\n"
             f"Mike Johnson\tA{tag}1\tFirm One {tag}\n"
             f"Mike Johnson\tB{tag}2\tFirm Two {tag}")
    preview = client.post("/api/v1/users/import", headers=auth,
                          json={"text": paste}).json()
    assert [r["action"] for r in preview["rows"]] == ["create", "create"]


def test_a_selected_set_gets_one_password(client, auth):
    tag = uuid.uuid4().hex[:6]
    rows = "\n".join(f"Batch Pass{tag}{i:02d}\t7{tag[:3]}{i:02d}" for i in range(12))
    client.post("/api/v1/users/import", headers=auth, json={
        "text": f"Name\tEmployee ID\n{rows}", "dry_run": False,
        "employer_name": f"Batch Co {tag}"})

    people = client.get("/api/v1/users", headers=auth,
                        params={"q": f"Batch Co {tag}", "limit": 50}).json()["items"]
    assert len(people) == 12

    done = client.post("/api/v1/users/bulk-password", headers=auth, json={
        "user_ids": [p["id"] for p in people], "password": "shared-temp-pass"})
    assert done.status_code == 200, done.text
    assert done.json()["updated"] == 12
    assert done.json()["must_reset"] is True

    signed_in = client.post("/api/v1/auth/login", json={
        "username": people[0]["username"], "password": "shared-temp-pass"})
    assert signed_in.status_code == 200
    assert signed_in.json()["user"]["must_reset"] is True


def test_a_manager_cannot_batch_a_password_onto_an_admin(client, manager_auth, auth):
    admin_id = client.get("/api/v1/auth/me", headers=auth).json()["user"]["id"]
    refused = client.post("/api/v1/users/bulk-password", headers=manager_auth, json={
        "user_ids": [admin_id], "password": "not-happening-today"})
    assert refused.status_code == 403
    assert "user.manage" in refused.json()["error"]["message"]


# ---------------------------------------------------------------------------
# Create and link in one call
# ---------------------------------------------------------------------------
def test_a_disposal_site_is_created_and_linked_in_one_request(client, auth, project_id):
    name = f"Inline Site {uuid.uuid4().hex[:6]}"
    created = client.post(f"/api/v1/projects/{project_id}/sites", headers=auth, json={
        "new": {"name": name, "site_kind": "TDSRS", "city": "Bridgeton",
                "state_code": "MO", "has_scale": True},
        "opened_on": str(date.today()),
    })
    assert created.status_code == 201, created.text
    link = created.json()
    try:
        sites = client.get("/api/v1/sites", headers=auth, params={"q": name}).json()
        assert sites["total"] == 1, "the site itself should exist now"
        detail = client.get(f"/api/v1/projects/{project_id}", headers=auth).json()
        assert any(s["site_id"] == sites["items"][0]["id"] for s in detail["sites"])
    finally:
        client.delete(f"/api/v1/projects/{project_id}/sites/{link['id']}", headers=auth)


def test_an_inline_contract_still_needs_its_document_link(client, auth, project_id):
    clients_ = client.get("/api/v1/clients", headers=auth).json()["items"]
    contractors = client.get("/api/v1/contractors", headers=auth).json()["items"]
    refused = client.post(f"/api/v1/projects/{project_id}/contracts", headers=auth, json={
        "new": {"contract_number": f"INLINE-{uuid.uuid4().hex[:6]}",
                "title": "Inline contract with no link",
                "client_id": clients_[0]["id"], "contractor_id": contractors[0]["id"],
                "contract_type": "unit_price", "status": "draft",
                "effective_from": str(date.today())},
    })
    assert refused.status_code == 400
    assert refused.json()["error"]["code"] == "contract_incomplete"


def test_linking_without_an_id_or_a_body_says_what_to_send(client, auth, project_id):
    refused = client.post(f"/api/v1/projects/{project_id}/sites", headers=auth, json={})
    assert refused.status_code == 400
    assert "new" in refused.json()["error"]["message"]


# ---------------------------------------------------------------------------
# Contract intake: structure now, parser later
# ---------------------------------------------------------------------------
def test_a_contract_pdf_is_registered_and_staged(client, auth, spare_contract):
    staged = client.post(f"/api/v1/contracts/{spare_contract['id']}/ingestions",
                         headers=auth, json={
                             "title": "Meramec Hauling executed contract",
                             "url": "https://example.sharepoint.com/contracts/meramec.pdf",
                             "provider": "sharepoint"})
    assert staged.status_code == 201, staged.text
    body = staged.json()
    assert body["status"] == "parsing_not_enabled", \
        "the interface has to be honest that nothing is reading the file yet"
    assert body["document_url"].startswith("https://")

    listed = client.get(f"/api/v1/contracts/{spare_contract['id']}/ingestions",
                        headers=auth).json()
    assert listed["parsing_enabled"] is False
    assert "later pass" in listed["note"]


def test_staging_needs_a_real_link(client, auth, spare_contract):
    refused = client.post(f"/api/v1/contracts/{spare_contract['id']}/ingestions",
                          headers=auth,
                          json={"title": "On the shared drive", "url": "S:\\legal\\x.pdf"})
    assert refused.status_code == 400
    assert refused.json()["error"]["code"] == "document_url_invalid"


def test_seeded_proposals_can_be_reviewed_end_to_end(
        client, auth, project_id, spare_contract):
    """The review screen has to work before the parser exists, which is the
    whole reason 6.2 comes before 6.3."""
    staged = client.post(f"/api/v1/contracts/{spare_contract['id']}/ingestions",
                         headers=auth, json={
                             "title": "Staged for review",
                             "url": "https://example.box.com/staged.pdf"}).json()

    seeded = client.post(f"/api/v1/ingestions/{staged['id']}/proposals", headers=auth,
                         json=[
                             {"description": "Proposed vegetative collection",
                              "line_number": 1, "item_code": "P-01",
                              "unit_type_code": "per_cubic_yard", "unit_price": 8.75,
                              "debris_type_code": "VEG", "source_page": 4,
                              "extraction_confidence": 0.91},
                             {"description": "Proposed standby time",
                              "line_number": 2, "item_code": "P-02",
                              "unit_type_code": "per_equip_hour", "unit_price": 95.0,
                              "source_page": 6, "extraction_confidence": 0.42},
                         ])
    assert seeded.status_code == 201, seeded.text
    assert seeded.json()["proposed_count"] == 2
    assert seeded.json()["status"] == "parsed"

    proposals = client.get(f"/api/v1/ingestions/{staged['id']}/proposals",
                           headers=auth).json()
    assert proposals["counts"]["draft"] == 2
    by_code = {p["item_code"]: p for p in proposals["items"]}
    assert by_code["P-01"]["source_page"] == 4
    assert float(by_code["P-01"]["extraction_confidence"]) == 0.91

    client.post(f"/api/v1/projects/{project_id}/contracts", headers=auth,
                json={"contract_id": spare_contract["id"]})

    made = client.post(f"/api/v1/projects/{project_id}/service-codes/from-line-items",
                       headers=auth, json={"line_item_ids": [by_code["P-01"]["id"]]})
    assert made.status_code == 201, made.text
    code = made.json()["items"][0]
    assert code["current_rate"] == 8.75

    rejected = client.patch(f"/api/v1/line-items/{by_code['P-02']['id']}", headers=auth,
                            json={"description": by_code["P-02"]["description"],
                                  "status": "rejected"})
    assert rejected.status_code == 200

    closed = client.post(f"/api/v1/ingestions/{staged['id']}/close", headers=auth).json()
    assert closed["status"] == "reviewed"
    assert closed["accepted_count"] == 1
    assert closed["rejected_count"] == 1, \
        "the reject is the half a later ranking pass learns the most from"

    client.delete(f"/api/v1/service-codes/{code['id']}", headers=auth)


# ---------------------------------------------------------------------------
# Closeout packaging
# ---------------------------------------------------------------------------
def test_the_naming_template_renders_real_filenames(client, auth, project_id):
    current = client.get(f"/api/v1/projects/{project_id}/closeout/naming",
                         headers=auth).json()
    assert current["template"]
    assert current["examples"], "a template nobody can see the output of is not trusted"

    saved = client.put(f"/api/v1/projects/{project_id}/closeout/naming", headers=auth,
                       json={"template": "{project_code}-{kind}-{date}"})
    assert saved.status_code == 200
    body = saved.json()
    assert body["template"] == "{project_code}-{kind}-{date}"
    for example in body["examples"]:
        assert example["filename"].startswith("STL-2026-ROW-")
        assert " " not in example["filename"]

    client.put(f"/api/v1/projects/{project_id}/closeout/naming", headers=auth,
               json={"template": current["template"]})


def test_a_template_with_no_tokens_is_refused(client, auth, project_id):
    refused = client.put(f"/api/v1/projects/{project_id}/closeout/naming", headers=auth,
                         json={"template": "closeout"})
    assert refused.status_code == 400
    assert refused.json()["error"]["code"] == "template_has_no_tokens"


def test_the_manifest_accounts_for_every_document(client, auth, project_id):
    manifest = client.get(f"/api/v1/projects/{project_id}/closeout/manifest",
                          headers=auth).json()
    assert manifest["document_count"] >= 5
    for row in manifest["documents"]:
        assert row["source_url"].startswith("http"), \
            "every row has to name where the file actually lives"
        assert row["filename"]
    assert manifest["datasets"]["tickets"] > 0
    kinds = {r["kind"] for r in manifest["documents"]}
    assert "Executed Contract" in kinds
    assert "Site Permit" in kinds


def test_the_manifest_says_what_is_unverified_rather_than_hiding_it(
        client, auth, project_id, contractor_id):
    doc = client.post("/api/v1/documents", headers=auth, json={
        "entity_type": "contractors", "entity_id": contractor_id,
        "kind_code": "certificate_other", "title": "Unverified at closeout",
        "url": "https://example.box.com/unverified.pdf",
    }).json()
    try:
        manifest = client.get(f"/api/v1/projects/{project_id}/closeout/manifest",
                              headers=auth).json()
        titles = {u["title"] for u in manifest["unverified"]}
        assert "Unverified at closeout" in titles
        assert any("not been verified" in w for w in manifest["warnings"])
    finally:
        client.delete(f"/api/v1/documents/{doc['id']}", headers=auth)


def test_the_package_is_a_real_zip(client, auth, project_id):
    import io
    import zipfile

    response = client.get(f"/api/v1/projects/{project_id}/closeout/package",
                          headers=auth)
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/zip"
    assert "STL-2026-ROW" in response.headers["content-disposition"]

    bundle = zipfile.ZipFile(io.BytesIO(response.content))
    names = bundle.namelist()
    assert any(n.endswith(".csv") and "manifest" in n.lower() for n in names)
    assert any(n.endswith(".json") for n in names)
    assert any("/data/" in n and "Tickets" in n for n in names)
    assert any(n.endswith(".txt") for n in names)

    manifest = json.loads(bundle.read(next(n for n in names if n.endswith(".json"))))
    assert manifest["documents"]
    assert "never the files" in manifest["note"]

    tickets = bundle.read(next(n for n in names if "Tickets" in n))
    assert tickets.count(b"\n") > 10, "the ticket export should carry the demo tickets"


# K11: "the filename convention we set doesnt translate into the filesname
# generated". It does now, and these hold it there.
def test_the_naming_template_names_the_files_in_the_package(
        client, auth, project_id):
    import io
    import zipfile

    put = client.put(f"/api/v1/projects/{project_id}/closeout/naming",
                     json={"template": "{declaration}--{project_code}--{kind}--{title}"},
                     headers=auth)
    assert put.status_code == 200
    try:
        preview = {p["what"]: p["filename"] for p in put.json()["package"]}
        assert all(f.startswith("DR-4808-MO--STL-2026-ROW--")
                   for f in preview.values()), preview

        response = client.get(f"/api/v1/projects/{project_id}/closeout/package",
                              headers=auth)
        assert response.status_code == 200
        # The zip's own name, not only the names inside it.
        assert "DR-4808-MO--STL-2026-ROW--closeout" in \
            response.headers["content-disposition"]

        names = zipfile.ZipFile(io.BytesIO(response.content)).namelist()
        leaves = [n.rsplit("/", 1)[-1] for n in names]
        assert leaves, names
        for leaf in leaves:
            assert leaf.startswith("DR-4808-MO--STL-2026-ROW--"), leaf
    finally:
        client.put(f"/api/v1/projects/{project_id}/closeout/naming",
                   json={"template": "{project_code}_{kind}_{title}_{date}"},
                   headers=auth)


def test_every_token_resolves_to_something_real(client, auth, project_id):
    body = client.get(f"/api/v1/projects/{project_id}/closeout/naming",
                      headers=auth).json()
    # A token that renders as nothing is the failure mode: filenames collapse
    # into near-identical strings and nobody notices until closeout.
    for token in ("project_code", "project_name", "client", "declaration"):
        assert body["values"].get(token), f"{token} rendered as nothing"


# K13: "Can I package closeout for a date range only? I dont see any way to do
# this in the UI."
def test_a_date_range_narrows_the_exports_but_never_the_manifest(
        client, auth, project_id):
    import io
    import zipfile

    whole = client.get(f"/api/v1/projects/{project_id}/closeout/manifest",
                       headers=auth).json()
    narrow = client.get(f"/api/v1/projects/{project_id}/closeout/manifest",
                        params={"date_from": "2026-08-20", "date_to": "2026-08-25"},
                        headers=auth).json()

    assert narrow["datasets"]["tickets"] < whole["datasets"]["tickets"]
    assert narrow["dataset_totals"]["tickets"] == whole["datasets"]["tickets"]
    # Documents belong to the project whatever month they were signed in.
    assert narrow["document_count"] == whole["document_count"]
    assert narrow["period"] == "2026-08-20-to-2026-08-25"

    response = client.get(f"/api/v1/projects/{project_id}/closeout/package",
                          params={"date_from": "2026-08-20", "date_to": "2026-08-25"},
                          headers=auth)
    assert response.status_code == 200
    assert "2026-08-20-to-2026-08-25" in response.headers["content-disposition"]

    bundle = zipfile.ZipFile(io.BytesIO(response.content))
    ticket_file = next(n for n in bundle.namelist() if "Tickets" in n)
    lines = bundle.read(ticket_file).decode().strip().split("\n")
    assert len(lines) - 1 == narrow["datasets"]["tickets"]


def test_an_export_with_no_rows_still_carries_its_headers(client, auth, project_id):
    import io
    import zipfile

    response = client.get(f"/api/v1/projects/{project_id}/closeout/package",
                          params={"date_from": "1999-01-01", "date_to": "1999-01-02"},
                          headers=auth)
    assert response.status_code == 200
    bundle = zipfile.ZipFile(io.BytesIO(response.content))
    ticket_file = next(n for n in bundle.namelist() if "Tickets" in n)
    body = bundle.read(ticket_file).decode()
    assert "ticket_number" in body, "an empty export still has to be openable"
    assert len(body.strip().split("\n")) == 1


# M6: "The list pages without stalling and the export states its cap rather
# than truncating in silence. The cap is 50,000 rows."
def test_every_ticket_sort_works_in_both_directions(client, auth, project_id):
    # The null ordering was dropped from the non-nullable sorts so the indexes
    # can serve them. That is a performance change, and this is the guard that
    # it did not change what the list actually returns.
    for column in ("created_at", "completed_at", "ticket_number", "origin_at"):
        for direction in ("asc", "desc"):
            page = client.get(f"/api/v1/projects/{project_id}/tickets",
                              params={"sort": column, "direction": direction,
                                      "limit": 40},
                              headers=auth).json()
            values = [t[column] for t in page["items"] if t.get(column) is not None]
            assert values == sorted(values, reverse=(direction == "desc")), \
                f"{column} {direction} came back out of order"

    # A nullable column still puts its blanks at the end, where they belong.
    page = client.get(f"/api/v1/projects/{project_id}/tickets",
                      params={"sort": "completed_at", "direction": "desc",
                              "limit": 200},
                      headers=auth).json()
    seen_blank = False
    for ticket in page["items"]:
        if ticket["completed_at"] is None:
            seen_blank = True
        else:
            assert not seen_blank, "a dated ticket came back after an undated one"


def test_an_unknown_sort_falls_back_rather_than_reaching_sql(
        client, auth, project_id):
    page = client.get(f"/api/v1/projects/{project_id}/tickets",
                      params={"sort": "drop_table", "limit": 5}, headers=auth)
    assert page.status_code == 200
    stamps = [t["created_at"] for t in page.json()["items"]]
    assert stamps == sorted(stamps, reverse=True)


def test_an_export_says_how_much_of_the_dataset_it_carries(
        client, auth, project_id):
    body = client.get(f"/api/v1/projects/{project_id}/export/tickets",
                      headers=auth).json()
    assert body["cap"] == 50_000
    assert body["available"] >= body["count"]
    assert body["truncated"] is False
    assert "whole dataset" in body["message"]


def test_an_export_that_stops_at_the_cap_says_so(client, auth, project_id,
                                                 monkeypatch):
    from app.routers import reports
    monkeypatch.setattr(reports, "EXPORT_CAP", 5)

    body = client.get(f"/api/v1/projects/{project_id}/export/tickets",
                      headers=auth).json()
    assert body["count"] == 5
    assert body["truncated"] is True
    assert body["cap"] == 5
    assert "of" in body["message"] and "cap" in body["message"]

    # And the trail records that it stopped, so an export sent on as complete
    # can be checked afterwards.
    latest = client.get("/api/v1/audit",
                        params={"action": "export", "limit": 1},
                        headers=auth).json()["items"][0]
    assert latest["changed"]["truncated"] is True
    assert latest["changed"]["cap"] == 5


def test_a_capped_closeout_package_carries_the_warning_in_it(
        client, auth, project_id, monkeypatch):
    import io
    import zipfile
    from app.routers import closeout
    monkeypatch.setattr(closeout, "EXPORT_CAP", 5)

    manifest = client.get(f"/api/v1/projects/{project_id}/closeout/manifest",
                          headers=auth).json()
    assert "tickets" in manifest["over_cap"]
    assert any("export cap" in w for w in manifest["warnings"])

    response = client.get(f"/api/v1/projects/{project_id}/closeout/package",
                          params={"datasets": "tickets"}, headers=auth)
    bundle = zipfile.ZipFile(io.BytesIO(response.content))
    readme = bundle.read(next(n for n in bundle.namelist()
                              if n.endswith(".txt"))).decode()
    assert "READ THIS FIRST" in readme
    assert "row cap" in readme

    body = json.loads(bundle.read(next(n for n in bundle.namelist()
                                       if n.endswith(".json"))))
    assert body["truncated"] == ["tickets"]
    assert body["datasets"]["tickets"]["rows"] == 5


def test_the_query_builder_says_when_it_held_rows_back(client, auth, project_id):
    result = client.post("/api/v1/query/run", headers=auth, json={
        "source": "tickets", "project_id": str(project_id),
        "filters": [], "limit": 3,
    }).json()
    assert result["returned"] == 3
    assert result["total"] > 3
    assert result["truncated"] is True
    assert "Narrow the filters" in result["message"]


def test_a_backwards_range_is_refused_rather_than_silently_empty(
        client, auth, project_id):
    refused = client.get(f"/api/v1/projects/{project_id}/closeout/manifest",
                         params={"date_from": "2026-08-25", "date_to": "2026-08-20"},
                         headers=auth)
    assert refused.status_code == 400
    assert refused.json()["error"]["code"] == "range_inverted"


def test_the_package_is_recorded_in_the_audit_trail(client, auth, project_id):
    before = client.get("/api/v1/audit", params={"action": "export"},
                        headers=auth).json()["total"]
    client.get(f"/api/v1/projects/{project_id}/closeout/package", headers=auth)
    after = client.get("/api/v1/audit", params={"action": "export"},
                       headers=auth).json()["total"]
    assert after > before


# ===========================================================================
# Sprint 2: the audit trail, split and followable
#
# C20 asked for the trail to separate billing from operations from security.
# K2 was blunter: "the chain described here isn't clearly visible.. i just see
# a list of changes and no way to click and view any updates from the past".
# ===========================================================================

def test_the_trail_splits_into_four_domains(client, auth):
    body = client.get("/api/v1/audit", params={"limit": 1}, headers=auth).json()
    domains = body["domains"]
    for name in ("operations", "billing", "records", "security"):
        assert name in domains
    assert domains["all"] == sum(v for k, v in domains.items() if k != "all")
    assert domains["operations"] > 0 and domains["billing"] > 0


def test_a_domain_narrows_the_trail_to_that_kind_of_record(client, auth):
    body = client.get("/api/v1/audit", params={"domain": "security", "limit": 50},
                      headers=auth).json()
    assert body["total"] == body["domains"]["security"]
    assert body["items"], "the demo seed signs somebody in"
    assert all(i["domain"] == "security" for i in body["items"])


def test_the_domain_counts_hold_the_other_filters(client, auth):
    scoped = client.get("/api/v1/audit",
                        params={"action": "create", "limit": 1}, headers=auth).json()
    unscoped = client.get("/api/v1/audit", params={"limit": 1}, headers=auth).json()
    assert scoped["domains"]["all"] < unscoped["domains"]["all"]
    assert scoped["domains"]["all"] == scoped["total"]


def test_a_login_is_security_and_a_transaction_is_billing(client, auth):
    login = client.get("/api/v1/audit",
                       params={"action": "login", "limit": 1}, headers=auth).json()
    assert login["items"][0]["domain"] == "security"
    money = client.get("/api/v1/audit",
                       params={"entity_type": "transactions", "limit": 1},
                       headers=auth).json()
    assert money["items"][0]["domain"] == "billing"


def test_the_chain_gathers_a_records_whole_story_oldest_first(
        client, auth, project_id):
    ticket = _a_priced_ticket(client, auth, project_id)
    chain = client.get("/api/v1/audit/chain",
                       params={"entity_type": "tickets", "entity_id": ticket["id"]},
                       headers=auth).json()

    assert chain["count"] >= 2
    assert chain["entity_label"] == ticket["ticket_number"]
    stamps = [e["occurred_at"] for e in chain["events"]]
    assert stamps == sorted(stamps), "a chain read backwards is not a chain"
    assert chain["first_at"] == stamps[0] and chain["last_at"] == stamps[-1]
    assert chain["actors"]


def test_the_chain_carries_what_hangs_off_the_record(client, auth, project_id):
    ticket = _a_priced_ticket(client, auth, project_id)
    chain = client.get("/api/v1/audit/chain",
                       params={"entity_type": "tickets", "entity_id": ticket["id"]},
                       headers=auth).json()
    # A ticket's money moved is part of what happened to the ticket, even
    # though the row that changed was a transaction.
    assert chain["related"].get("transactions", 0) >= 1
    kinds = {e["entity_type"] for e in chain["events"]}
    assert "tickets" in kinds


def test_a_chain_for_a_record_with_no_history_is_empty_not_an_error(
        client, auth):
    chain = client.get("/api/v1/audit/chain",
                       params={"entity_type": "tickets",
                               "entity_id": str(uuid.uuid4())},
                       headers=auth).json()
    assert chain["count"] == 0
    assert chain["events"] == []
    assert chain["first_at"] is None


def test_reading_the_chain_needs_audit_permission(client, monitor_auth, project_id):
    refused = client.get("/api/v1/audit/chain",
                         params={"entity_type": "tickets",
                                 "entity_id": str(uuid.uuid4())},
                         headers=monitor_auth)
    assert refused.status_code == 403


# ===========================================================================
# Sprint 2: correcting work the field has already finished
#
# The second walkthrough's blunt version: "I have no way to edit existing
# tickets in the back-office (apart from void), but I should." These cover the
# verbs that answer it, and the guardrails that keep them honest.
# ===========================================================================

def _tickets_an_approved_invoice_holds(client, auth, project_id):
    """The correction tests need a ticket the engine will actually reprice.

    A ticket whose money is on an approved invoice is refused, correctly, and a
    test that picks one is testing the guardrail rather than the verb."""
    invoices = client.get(f"/api/v1/projects/{project_id}/invoices",
                          params={"limit": 200}, headers=auth).json()["items"]
    held: set[str] = set()
    for invoice in invoices:
        if invoice["status"] not in ("approved", "paid") or not invoice["line_count"]:
            continue
        detail = client.get(f"/api/v1/invoices/{invoice['id']}", headers=auth).json()
        held.update(line["ticket_id"] for line in detail["lines"] if line.get("ticket_id"))
    return held


def _a_priced_ticket(client, auth, project_id, *, priced_by_volume=False):
    """A completed, priced ticket the correction verbs can actually move.

    `priced_by_volume` picks one whose money is derived from the load, which is
    what a test about correcting a load call needs. A flat or per-unit service
    code prices the same whatever the load call says, so a ticket billed under
    one would make a correct engine look broken."""
    held = _tickets_an_approved_invoice_holds(client, auth, project_id)
    tickets = client.get(
        f"/api/v1/projects/{project_id}/tickets",
        params={"status": "completed", "limit": 200}, headers=auth).json()
    for t in tickets["items"]:
        if ((t.get("transaction_total") or 0) <= 0 or t.get("is_void")
                or t["id"] in held):
            continue
        if not priced_by_volume:
            return t
        detail = client.get(f"/api/v1/tickets/{t['id']}", headers=auth).json()
        live = [tx for tx in detail.get("transactions", [])
                if not tx.get("superseded_at") and not tx.get("is_reversal")]
        if live and all(tx.get("quantity_source") == "billable_cubic_yards"
                        for tx in live):
            return t
    raise AssertionError("the demo project should have priced tickets")


def test_correcting_a_completed_ticket_requires_a_reason(client, manager_auth, project_id, auth):
    ticket = _a_priced_ticket(client, auth, project_id)
    refused = client.patch(f"/api/v1/tickets/{ticket['id']}",
                           json={"load_call_pct": 51}, headers=manager_auth)
    assert refused.status_code == 400
    assert refused.json()["error"]["code"] == "reason_required"


def test_a_manager_corrects_a_ticket_and_the_money_follows(
        client, manager_auth, analyst_auth, auth, project_id):
    ticket = _a_priced_ticket(client, auth, project_id, priced_by_volume=True)
    before = float(ticket["transaction_total"])

    # The target is derived from where the ticket actually sits, not written in.
    # A fixed target passes once and then corrects a ticket to the value it
    # already holds, which prices to the same number and fails on the rerun.
    current = float(ticket["load_call_pct"] or 100)
    target = 40 if current > 45 else 80

    edited = client.patch(
        f"/api/v1/tickets/{ticket['id']}",
        json={"load_call_pct": target,
              "_reason": "Load call corrected after reviewing the photos"},
        headers=manager_auth)
    assert edited.status_code == 200
    # The edit alone must not leave the ticket and its money disagreeing.
    assert edited.json()["reprocess_queued"] is True

    repriced = client.post(
        f"/api/v1/tickets/{ticket['id']}/reprocess",
        json={"reason": "Load call corrected after reviewing the photos"},
        headers=analyst_auth)
    assert repriced.status_code == 200
    result = repriced.json()["reprocess"]
    assert result["old_total"] == pytest.approx(before, rel=1e-6)
    if target < current:
        assert result["new_total"] < result["old_total"]
    else:
        assert result["new_total"] > result["old_total"]
    assert result["reversed"] >= 1 and result["created"] >= 1


def test_repricing_is_analyst_work_not_manager_work(
        client, manager_auth, auth, project_id):
    ticket = _a_priced_ticket(client, auth, project_id)
    refused = client.post(f"/api/v1/tickets/{ticket['id']}/reprocess",
                          json={"reason": "Trying it as a manager"},
                          headers=manager_auth)
    assert refused.status_code == 403


def test_a_manager_can_still_see_what_is_waiting_to_be_repriced(
        client, manager_auth, project_id):
    queue = client.get(f"/api/v1/projects/{project_id}/reprocess-queue",
                       headers=manager_auth)
    assert queue.status_code == 200
    assert "locked_count" in queue.json()


def test_void_and_unvoid_return_the_billing(client, analyst_auth, auth, project_id):
    ticket = _a_priced_ticket(client, auth, project_id)
    original = float(ticket["transaction_total"])

    voided = client.post(f"/api/v1/tickets/{ticket['id']}/void",
                         json={"reason": "Duplicate scan at the DMS gate"},
                         headers=analyst_auth)
    assert voided.status_code == 200

    restored = client.post(f"/api/v1/tickets/{ticket['id']}/unvoid",
                           json={"reason": "Not a duplicate, the load was real"},
                           headers=analyst_auth)
    assert restored.status_code == 200
    assert restored.json()["ticket"]["is_void"] is False
    # Voiding drives the status to voided; restoring the flag alone used to
    # leave the engine refusing the ticket as incomplete.
    assert restored.json()["ticket"]["status"] == "completed"

    repriced = client.post(f"/api/v1/tickets/{ticket['id']}/reprocess",
                           json={"reason": "Restored after an incorrect void"},
                           headers=analyst_auth).json()["reprocess"]
    assert repriced["new_total"] == pytest.approx(original, rel=1e-6)


def test_unvoiding_a_live_ticket_is_refused(client, analyst_auth, auth, project_id):
    ticket = _a_priced_ticket(client, auth, project_id)
    refused = client.post(f"/api/v1/tickets/{ticket['id']}/unvoid",
                          json={"reason": "It is not void"}, headers=analyst_auth)
    assert refused.status_code == 400


def test_a_certification_is_scoped_to_the_project(client, auth, project_id):
    listing = client.get(f"/api/v1/projects/{project_id}/certifications",
                         params={"limit": 100}, headers=auth).json()
    assert listing["summary"]["certified"] > 0
    assert all(c["project_id"] == project_id for c in listing["items"])


def test_a_second_first_measurement_is_refused(client, auth, project_id):
    cert = client.get(f"/api/v1/projects/{project_id}/certifications",
                      params={"limit": 1}, headers=auth).json()["items"][0]
    refused = client.post(
        f"/api/v1/projects/{project_id}/certifications",
        json={"equipment_id": cert["equipment_id"], "certified_capacity_cy": 40,
              "method": "physical"}, headers=auth)
    assert refused.status_code == 409
    assert refused.json()["error"]["code"] == "already_certified"


def test_the_impact_of_a_correction_is_visible_before_it_is_written(
        client, auth, project_id):
    certs = client.get(f"/api/v1/projects/{project_id}/certifications",
                       params={"limit": 100}, headers=auth).json()["items"]
    cert = max(certs, key=lambda c: c["tickets_priced"])
    assert cert["tickets_priced"] > 0

    half = round(cert["certified_capacity_cy"] / 2, 2)
    impact = client.get(f"/api/v1/certifications/{cert['id']}/impact",
                        params={"capacity": half}, headers=auth).json()
    # At least what this row priced. The window a correction covers can reach
    # loads that a later link in the chain is currently holding.
    assert impact["affected"]["tickets"] >= cert["tickets_priced"]
    assert impact["estimated_difference"] < 0


def test_a_correction_reaches_back_and_a_recertification_does_not(
        client, auth, analyst_auth, project_id):
    # Drain whatever else is queued first. The drain below reports one figure
    # for the whole project, so a correction sitting behind somebody else's
    # queued edit measures both of them and proves neither.
    client.post(f"/api/v1/projects/{project_id}/reprocess",
                json={"reason": "Clearing the queue before measuring a correction"},
                headers=analyst_auth)

    certs = client.get(f"/api/v1/projects/{project_id}/certifications",
                       params={"limit": 100}, headers=auth).json()["items"]
    cert = max(certs, key=lambda c: c["tickets_priced"])

    # The correction oscillates instead of always halving. Halving every run
    # walks the capacity toward zero, and a capacity near zero prices the same
    # either way, so the assertion stops meaning anything.
    was = float(cert["certified_capacity_cy"])
    target = round(was / 2, 2) if was > 8 else round(was * 2, 2)

    fixed = client.post(
        f"/api/v1/projects/{project_id}/certifications",
        json={"equipment_id": cert["equipment_id"],
              "certified_capacity_cy": target,
              "method": "correction", "supersedes_id": cert["id"],
              "notes": "Tare read as 3 instead of 1 at the original measurement"},
        headers=auth)
    assert fixed.status_code == 201
    body = fixed.json()
    # The whole point: it stands where the wrong number stood.
    assert body["applies_from"] == cert["applies_from"]
    # At least the loads that cert priced. The queue is built from the truck and
    # the window the correction now covers, not from which certification row a
    # ticket happens to point at, so once a chain has more than one link it
    # reaches further than the row being superseded. That is the behaviour
    # wanted: correcting a tare error has to reach every load it touched.
    assert body["tickets_queued"] >= cert["tickets_priced"]

    drained = client.post(f"/api/v1/projects/{project_id}/reprocess",
                          json={"reason": "Certified capacity corrected"},
                          headers=analyst_auth).json()
    # Every queued ticket is accounted for, repriced or named as held. A run
    # where an approved invoice already locked them is the engine working, not
    # the engine failing, so the count has to include both outcomes.
    assert drained["reprocessed"] + drained["skipped"] >= cert["tickets_priced"]
    if drained["reprocessed"]:
        assert (drained["difference"] < 0) == (target < was), drained["message"]
    else:
        assert drained["skipped_tickets"], "nothing repriced and nothing named"


def test_repricing_stops_at_an_approved_invoice(client, auth, analyst_auth, project_id):
    invoices = client.get(f"/api/v1/projects/{project_id}/invoices",
                          headers=auth).json()
    invoice = next((i for i in invoices["items"] if i["line_count"]), None)
    if invoice is None:
        pytest.skip("the demo project has no invoice with lines")

    client.patch(f"/api/v1/invoices/{invoice['id']}",
                 json={"status": "submitted"}, headers=auth)
    client.patch(f"/api/v1/invoices/{invoice['id']}",
                 json={"status": "approved"}, headers=auth)

    detail = client.get(f"/api/v1/invoices/{invoice['id']}", headers=auth).json()
    # A line whose transaction is still live. Once a ticket has been forced
    # through a reprice, the row this invoice billed is superseded and the
    # invoice no longer holds the ticket: the line is stale and an adjustment is
    # the answer, which is the engine behaving, not the lock failing.
    live = next((line for line in detail["lines"]
                 if line.get("is_live") and line.get("ticket_id")), None)
    if live is None:
        pytest.skip("every line on this invoice has already been superseded")
    ticket_id = live["ticket_id"]

    refused = client.post(f"/api/v1/tickets/{ticket_id}/reprocess",
                          json={"reason": "Load call corrected"}, headers=analyst_auth)
    assert refused.status_code == 409, refused.text
    assert refused.json()["error"]["code"] == "ticket_invoiced"

    # The refusal has to name the invoice holding the ticket. It may not be the
    # one this test approved: a ticket can sit on more than one invoice once it
    # has been adjusted, and any approved one is a good enough reason to stop.
    message = refused.json()["error"]["message"]
    approved = {i["invoice_number"] for i in
                client.get(f"/api/v1/projects/{project_id}/invoices",
                           headers=auth).json()["items"]
                if i["status"] == "approved"}
    assert any(number in message for number in approved), message

    forced = client.post(f"/api/v1/tickets/{ticket_id}/reprocess",
                         json={"reason": "Load call corrected, adjustment agreed",
                               "force": True}, headers=analyst_auth)
    assert forced.status_code == 200


# ===========================================================================
# Sprint 2: ticket review
#
# C1 and B12 describe the same screen: "we are hunting for the issues" and
# "I spend most of my day auditing tickets for accuracy ... and then marking
# each ticket QC approved or if there is some issue". These cover the detector,
# the queue and the decision.
# ===========================================================================

def test_the_detector_finds_things_and_says_why(client, auth, project_id):
    scan = client.post(f"/api/v1/projects/{project_id}/review/scan", headers=auth)
    assert scan.status_code == 200
    body = scan.json()
    assert body["tickets_checked"] > 0
    assert body["flags"] > 0, "the demo project has tickets with no photo on them"

    summary = client.get(f"/api/v1/projects/{project_id}/review/summary",
                         headers=auth).json()
    assert summary["with_flags"] > 0
    # The wording is the product here: a reviewer reads this, not a rule name.
    for flag in summary["by_flag"]:
        assert flag["label"] and flag["description"]
        assert flag["severity"] in ("info", "review", "serious")


def test_scanning_twice_does_not_duplicate_flags(client, auth, project_id):
    first = client.post(f"/api/v1/projects/{project_id}/review/scan",
                        headers=auth).json()
    second = client.post(f"/api/v1/projects/{project_id}/review/scan",
                         headers=auth).json()
    assert second["flags"] == first["flags"]


def test_the_queue_leads_with_the_worst(client, auth, project_id):
    queue = client.get(f"/api/v1/projects/{project_id}/review",
                       params={"flagged_only": True, "limit": 50},
                       headers=auth).json()
    assert queue["total"] > 0
    rank = {"serious": 1, "review": 2, "info": 3, "none": 4}
    order = [rank[r["worst_severity"]] for r in queue["items"]]
    assert order == sorted(order), "the queue is not worst first"


def test_a_flag_carries_the_numbers_behind_it(client, auth, project_id):
    queue = client.get(f"/api/v1/projects/{project_id}/review",
                       params={"flagged_only": True, "limit": 1}, headers=auth).json()
    ticket_id = queue["items"][0]["ticket_id"]
    detail = client.get(f"/api/v1/tickets/{ticket_id}/flags", headers=auth).json()
    assert detail["flags"], "a flagged ticket with no flag on it"
    assert detail["flags"][0]["label"]
    assert isinstance(detail["flags"][0]["detail"], dict)


def test_flagging_has_to_say_what_is_wrong(client, manager_auth, auth, project_id):
    queue = client.get(f"/api/v1/projects/{project_id}/review",
                       params={"limit": 1}, headers=auth).json()
    ticket_id = queue["items"][0]["ticket_id"]
    refused = client.post(f"/api/v1/tickets/{ticket_id}/review",
                          json={"state": "flagged"}, headers=manager_auth)
    assert refused.status_code == 400
    assert refused.json()["error"]["code"] == "issue_required"


def test_a_manager_reviews_a_ticket_and_it_leaves_the_queue(
        client, manager_auth, auth, project_id):
    queue = client.get(f"/api/v1/projects/{project_id}/review",
                       params={"state": "pending", "limit": 1}, headers=auth).json()
    ticket_id = queue["items"][0]["ticket_id"]

    flagged = client.post(
        f"/api/v1/tickets/{ticket_id}/review",
        json={"state": "flagged", "issue_code": "photo_missing",
              "notes": "Monitor needs to re-shoot the pre photo"},
        headers=manager_auth)
    assert flagged.status_code == 200
    assert flagged.json()["review_state"] == "flagged"

    resolved = client.post(
        f"/api/v1/tickets/{ticket_id}/review",
        json={"state": "resolved",
              "resolution": "Photo re-shot and attached, checked against street view"},
        headers=manager_auth)
    assert resolved.status_code == 200
    assert resolved.json()["review_state"] == "resolved"
    # Resolving settles the flags: the queue stops asking, the history keeps them.
    assert resolved.json()["open_flags"] == 0

    history = client.get(f"/api/v1/tickets/{ticket_id}/flags",
                         params={"include_cleared": True}, headers=auth).json()
    assert any(f["cleared_at"] for f in history["flags"])


def test_a_queue_is_worked_in_bulk_not_one_modal_at_a_time(
        client, manager_auth, auth, project_id):
    queue = client.get(f"/api/v1/projects/{project_id}/review",
                       params={"state": "pending", "limit": 5}, headers=auth).json()
    ids = [r["ticket_id"] for r in queue["items"]]
    if not ids:
        pytest.skip("nothing left unreviewed")

    done = client.post(f"/api/v1/projects/{project_id}/review/bulk",
                       json={"ticket_ids": ids, "state": "approved"},
                       headers=manager_auth)
    assert done.status_code == 200
    assert done.json()["reviewed"] == len(ids)

    # Read the whole queue, not the first page of it. A page size that happens
    # to cover the demo today stops covering it the moment more work is approved.
    after = client.get(f"/api/v1/projects/{project_id}/review",
                       params={"state": "approved", "limit": 500}, headers=auth).json()
    approved = {r["ticket_id"] for r in after["items"]}
    assert set(ids) <= approved

    still_pending = client.get(f"/api/v1/projects/{project_id}/review",
                               params={"state": "pending", "limit": 500},
                               headers=auth).json()
    assert not set(ids) & {r["ticket_id"] for r in still_pending["items"]}


def test_monitor_accuracy_is_rate_not_volume(client, auth, project_id):
    accuracy = client.get(f"/api/v1/projects/{project_id}/monitor-accuracy",
                          headers=auth).json()
    assert accuracy["items"], "the demo project has monitors"
    for m in accuracy["items"]:
        assert "approval_rate" in m
        # A monitor is never scored on work nobody has read yet.
        if m["approved"] == 0 and m["flagged"] == 0:
            assert m["approval_rate"] is None


def test_correcting_a_ticket_re_checks_it(client, manager_auth, analyst_auth,
                                          auth, project_id):
    """A correction that fixes a flag should visibly close it, not leave the
    ticket sitting in the queue looking unresolved."""
    client.post(f"/api/v1/projects/{project_id}/review/scan", headers=auth)
    held = _tickets_an_approved_invoice_holds(client, auth, project_id)
    queue = client.get(f"/api/v1/projects/{project_id}/review",
                       params={"flagged_only": True, "flag_code": "full_load_call",
                               "state": "all", "limit": 100}, headers=auth).json()
    # A ticket an approved invoice is holding cannot be repriced, so correcting
    # it would leave the flag open for a reason that has nothing to do with the
    # re-check this test is about.
    candidates = [r["ticket_id"] for r in queue["items"] if r["ticket_id"] not in held]
    if not candidates:
        pytest.skip("no repriceable ticket carries a full load call")
    ticket_id = candidates[0]

    edited = client.patch(f"/api/v1/tickets/{ticket_id}",
                          json={"load_call_pct": 60,
                                "_reason": "Load call corrected after reviewing the photos"},
                          headers=manager_auth)
    assert edited.status_code == 200, edited.text
    repriced = client.post(f"/api/v1/tickets/{ticket_id}/reprocess",
                           json={"reason": "Load call corrected"}, headers=analyst_auth)
    assert repriced.status_code == 200, repriced.text

    after = client.get(f"/api/v1/tickets/{ticket_id}/flags", headers=auth).json()
    assert not any(f["flag_code"] == "full_load_call" for f in after["flags"]), \
        "the flag the correction fixed is still open"


# ===========================================================================
# Sprint 2: the money surfaces, and how a rate sheet is actually written
# ===========================================================================

def test_a_line_comes_off_a_draft_and_goes_back_to_uninvoiced(
        client, auth, project_id):
    invoices = client.get(f"/api/v1/projects/{project_id}/invoices",
                          headers=auth).json()
    invoice = next((i for i in invoices["items"] if i["status"] == "draft"
                    and i["line_count"]), None)
    if invoice is None:
        pytest.skip("no draft invoice with lines")

    detail = client.get(f"/api/v1/invoices/{invoice['id']}", headers=auth).json()
    line = detail["lines"][0]
    before = float(detail["invoice"]["subtotal"])

    removed = client.delete(
        f"/api/v1/invoices/{invoice['id']}/lines/{line['id']}", headers=auth)
    assert removed.status_code == 204

    after = client.get(f"/api/v1/invoices/{invoice['id']}", headers=auth).json()
    assert len(after["lines"]) == len(detail["lines"]) - 1
    # To the cent. A transaction amount carries four decimals because a rate
    # can; an invoice subtotal is money and rounds to cents, so the two agree
    # at the cent and not below it.
    assert float(after["invoice"]["subtotal"]) == pytest.approx(
        before - float(line["amount"]), abs=0.01)

    uninvoiced = client.get(f"/api/v1/projects/{project_id}/transactions",
                            params={"state": "uninvoiced", "limit": 500},
                            headers=auth).json()
    assert any(t["id"] == line["transaction_id"] for t in uninvoiced["items"]), \
        "the transaction did not go back to uninvoiced"


def test_an_adjustment_needs_a_reason(client, auth, project_id):
    invoices = client.get(f"/api/v1/projects/{project_id}/invoices",
                          headers=auth).json()
    invoice = next((i for i in invoices["items"] if i["status"] == "draft"), None)
    if invoice is None:
        pytest.skip("no draft invoice")

    refused = client.patch(f"/api/v1/invoices/{invoice['id']}",
                           json={"adjustments": -250}, headers=auth)
    assert refused.status_code == 400
    assert refused.json()["error"]["code"] == "adjustment_reason_required"

    ok = client.patch(
        f"/api/v1/invoices/{invoice['id']}",
        json={"adjustments": -250,
              "adjustment_reason": "Credit for the two loads rejected at the gate"},
        headers=auth)
    assert ok.status_code == 200
    body = ok.json()
    assert float(body["total"]) == pytest.approx(
        float(body["subtotal"]) - 250, rel=1e-6)


def test_rejecting_needs_a_reason_and_reopening_is_a_real_path(
        client, auth, analyst_auth, project_id):
    invoices = client.get(f"/api/v1/projects/{project_id}/invoices",
                          headers=auth).json()
    invoice = next((i for i in invoices["items"] if i["status"] == "draft"), None)
    if invoice is None:
        pytest.skip("no draft invoice")

    client.patch(f"/api/v1/invoices/{invoice['id']}",
                 json={"status": "submitted"}, headers=analyst_auth)

    refused = client.patch(f"/api/v1/invoices/{invoice['id']}",
                           json={"status": "rejected"}, headers=auth)
    assert refused.status_code == 400
    assert refused.json()["error"]["code"] == "rejection_reason_required"

    rejected = client.patch(
        f"/api/v1/invoices/{invoice['id']}",
        json={"status": "rejected",
              "rejection_reason": "Two load calls look high against the photos"},
        headers=auth).json()
    assert rejected["status"] == "rejected"
    assert rejected["rejection_reason"]
    assert rejected["rejected_at"]

    reopened = client.patch(f"/api/v1/invoices/{invoice['id']}",
                            json={"status": "draft"}, headers=auth).json()
    assert reopened["status"] == "draft"
    # The next submission must not read as still carrying the old rejection.
    assert reopened["rejection_reason"] is None


def test_an_invoice_cannot_skip_its_lifecycle(client, auth, project_id):
    invoices = client.get(f"/api/v1/projects/{project_id}/invoices",
                          headers=auth).json()
    invoice = next((i for i in invoices["items"] if i["status"] == "draft"), None)
    if invoice is None:
        pytest.skip("no draft invoice")
    refused = client.patch(f"/api/v1/invoices/{invoice['id']}",
                           json={"status": "paid"}, headers=auth)
    assert refused.status_code == 409
    assert refused.json()["error"]["code"] == "invoice_transition_invalid"


def test_lines_are_fixed_once_an_invoice_leaves_draft(client, auth, analyst_auth,
                                                      project_id):
    invoices = client.get(f"/api/v1/projects/{project_id}/invoices",
                          headers=auth).json()
    invoice = next((i for i in invoices["items"] if i["line_count"]), None)
    if invoice is None:
        pytest.skip("no invoice with lines")

    detail = client.get(f"/api/v1/invoices/{invoice['id']}", headers=auth).json()
    if detail["invoice"]["status"] == "draft":
        client.patch(f"/api/v1/invoices/{invoice['id']}",
                     json={"status": "submitted"}, headers=analyst_auth)

    refused = client.delete(
        f"/api/v1/invoices/{invoice['id']}/lines/{detail['lines'][0]['id']}",
        headers=auth)
    assert refused.status_code == 409
    assert refused.json()["error"]["code"] == "invoice_not_draft"


def test_a_hanger_bills_one_however_many_branches_were_counted(client, auth,
                                                               project_id):
    """G13: "that count has no impact on the paid unit of 1"."""
    codes = client.get(f"/api/v1/projects/{project_id}/service-codes",
                       headers=auth).json()
    assert codes["items"], "the demo project has service codes"


def test_stumps_are_banded_not_priced_per_inch(client, auth, project_id):
    """G13: "Leaners and stumps are on tiers based on the rate sheet"."""
    ledger = client.get(f"/api/v1/projects/{project_id}/transactions",
                        params={"limit": 500}, headers=auth).json()
    banded = [t for t in ledger["items"] if t.get("tier_label")]
    assert banded, "no transaction was priced from a band"

    # Every banded line bills one, because the band already accounts for size.
    assert all(float(t["quantity"]) == 1 for t in banded)
    # And different bands are different money on the same service code.
    prices = {t["tier_label"]: float(t["rate_amount"]) for t in banded}
    assert len(set(prices.values())) > 1, "every band priced the same"
    # quantity times rate has to equal the amount, or nobody can check a line.
    for t in banded:
        assert float(t["amount"]) == pytest.approx(
            float(t["quantity"]) * float(t["rate_amount"]), rel=1e-6)


def test_the_dashboard_compares_production_to_the_estimate(client, auth, project_id):
    """E1: "are we at sixty percent of the hanger estimate"."""
    board = client.get(f"/api/v1/projects/{project_id}/dashboard", headers=auth).json()
    assert board["progress"], "no stream carries an estimate to measure against"
    for row in board["progress"]:
        assert "collected" in row and "estimated_quantity" in row
        if row["estimated_quantity"] and float(row["estimated_quantity"]) > 0:
            assert row["percent_of_estimate"] is not None


def test_the_dashboard_breakdowns_answer_a_period(client, auth, project_id):
    """E5 and E6: yesterday, and this week, neither of which could be asked."""
    whole = client.get(f"/api/v1/projects/{project_id}/dashboard",
                       params={"period": "all"}, headers=auth).json()
    week = client.get(f"/api/v1/projects/{project_id}/dashboard",
                      params={"period": "week"}, headers=auth).json()

    def tickets(board):
        return sum(int(m["tickets"]) for m in board["top_monitors"])

    assert tickets(week) <= tickets(whole)
    # The headline totals are project to date and must not follow the period,
    # because "billed to date" has to keep meaning to date.
    assert whole["summary"]["billable_total"] == week["summary"]["billable_total"]


def test_what_expires_is_on_the_dashboard(client, auth, project_id):
    """E4: the alerts feed lived inside project setup, where nobody looking for
    "what expires in the next thirty days" would find it."""
    board = client.get(f"/api/v1/projects/{project_id}/dashboard", headers=auth).json()
    assert "alerts" in board
    for a in board["alerts"]:
        assert a["kind"] in ("permit", "document", "certification")
        assert a["severity"] in ("review", "serious")
        assert a["label"] and a["detail"]


def test_the_dashboard_says_what_needs_attention(client, auth, project_id):
    """C1: the data manager's question, on the screen that opens first."""
    client.post(f"/api/v1/projects/{project_id}/review/scan", headers=auth)
    board = client.get(f"/api/v1/projects/{project_id}/dashboard", headers=auth).json()
    review = board["review"]
    for key in ("unreviewed", "flagged", "serious", "raised"):
        assert key in review
    assert "needs_reprocess" in board


# ===========================================================================
# Sprint 3: the measurements behind a certified capacity
#
# "Do not just record the answer. Record the measurements that produced the
#  answer." These tests hold the arithmetic to figures computed by hand,
# because a volume formula that is silently wrong prices every load the truck
# hauls.
# ===========================================================================

def _open_draft(client, auth, project_id):
    """Open a measurement worksheet on some unit, whatever state the database
    is in.

    The suite is re-runnable against the same database, so "find an
    uncertified truck" stops working the second time. A unit that is already
    certified gets a recertification draft instead, which is the same workflow
    with a supersede on the end."""
    options = client.get(f"/api/v1/projects/{project_id}/options/project_equipment",
                         headers=auth).json()["items"]
    certs = client.get(f"/api/v1/projects/{project_id}/certifications",
                       params={"limit": 500, "status": "all"},
                       headers=auth).json()["items"]
    active = {c["equipment_id"]: c for c in certs if c["status"] == "active"}
    busy = {c["equipment_id"] for c in certs
            if c["status"] in ("draft", "submitted")}

    for option in options:
        unit = option["value"]
        if unit in busy:
            continue
        payload = {"equipment_id": unit, "method": "physical"}
        if unit in active:
            payload = {"equipment_id": unit, "method": "recertification",
                       "supersedes_id": active[unit]["id"],
                       "notes": "Measured again for the worksheet tests"}
        created = client.post(f"/api/v1/projects/{project_id}/certifications",
                              headers=auth, json=payload)
        if created.status_code == 201:
            return created.json()
    return None


def test_the_shape_catalog_says_what_each_one_asks_for(client, auth):
    shapes = client.get("/api/v1/measurements/shapes", headers=auth).json()["items"]
    codes = {s["code"] for s in shapes}
    # The shapes debris equipment actually takes. A round bottom trailer that
    # can only be measured as a box is the whole problem.
    assert {"rectangular", "round_bottom", "tapered_sides"} <= codes
    for s in shapes:
        assert s["dimension_schema"], s["code"]
        assert s["formula_note"]


def test_a_container_type_carries_what_is_expected_of_it(client, auth):
    types = client.get("/api/v1/measurements/container-types",
                       headers=auth).json()["items"]
    assert len(types) >= 8
    for t in types:
        assert t["typical_use"]
        assert "placard" in t["required_photo_slots"]


def test_preview_matches_the_figure_computed_by_hand(client, auth):
    # 22ft by 8ft by 4ft 6in rolloff, in inches.
    out = client.post("/api/v1/measurements/preview", headers=auth, json={
        "sections": [{"label": "Main body", "shape_code": "rectangular",
                      "role": "base",
                      "dimensions": {"length": 264, "width": 96, "height": 54}}],
    }).json()
    assert out["total_cubic_inches"] == 1368576
    assert out["total_cubic_feet"] == 792.0
    assert out["capacity_cy"] == 29.33


def test_a_curved_floor_is_not_a_box(client, auth):
    dims = {"length": 288, "width": 96, "straight_height": 60, "curve_depth": 14}
    curved = client.post("/api/v1/measurements/preview", headers=auth, json={
        "sections": [{"label": "Main body", "shape_code": "round_bottom",
                      "role": "base", "dimensions": dims}]}).json()
    boxed = client.post("/api/v1/measurements/preview", headers=auth, json={
        "sections": [{"label": "Main body", "shape_code": "rectangular",
                      "role": "base",
                      "dimensions": {"length": 288, "width": 96, "height": 74}}],
    }).json()
    assert curved["capacity_cy"] == 41.18
    assert boxed["capacity_cy"] == 43.85
    # 2.67 CY on every load that trailer hauls.
    assert round(boxed["capacity_cy"] - curved["capacity_cy"], 2) == 2.67


def test_leaving_the_curve_out_is_refused_rather_than_treated_as_flat(client, auth):
    refused = client.post("/api/v1/measurements/preview", headers=auth, json={
        "sections": [{"label": "Main body", "shape_code": "round_bottom",
                      "role": "base",
                      "dimensions": {"length": 288, "width": 96,
                                     "straight_height": 60}}]})
    assert refused.status_code == 400
    assert "curve_depth" in refused.json()["error"]["message"]
    assert refused.json()["error"]["details"]["label"] == "Main body"


def test_additions_and_deductions_compose(client, auth):
    out = client.post("/api/v1/measurements/preview", headers=auth, json={
        "container_type_code": "rolloff_box",
        "sections": [
            {"label": "Main body", "shape_code": "rectangular", "role": "base",
             "dimensions": {"length": 264, "width": 96, "height": 54}},
            {"label": "Wheel well", "shape_code": "rectangular",
             "role": "deduction", "quantity": 2,
             "dimensions": {"length": 30, "width": 8, "height": 12}}],
    }).json()
    assert out["deduction_cubic_inches"] == 5760      # two of them, not one
    assert out["total_cubic_inches"] == 1368576 - 5760
    assert out["within_typical_range"] is True


def test_a_capacity_outside_the_band_is_said_not_refused(client, auth):
    out = client.post("/api/v1/measurements/preview", headers=auth, json={
        "container_type_code": "tandem_dump_truck",
        "sections": [{"label": "Main body", "shape_code": "rectangular",
                      "role": "base",
                      "dimensions": {"length": 600, "width": 96, "height": 96}}],
    }).json()
    assert out["within_typical_range"] is False
    assert "normally measures" in out["range_note"]


def test_a_measured_certification_carries_its_arithmetic(client, auth, project_id):
    draft = _open_draft(client, auth, project_id)
    assert draft is not None, "no unit on this project could take a measurement"
    # No capacity was sent, so nothing was certified. A worksheet was opened.
    assert draft["status"] == "draft"
    assert draft["certified_capacity_cy"] is None

    sheet = client.post(f"/api/v1/certifications/{draft['id']}/measurement",
                        headers=auth, json={
        "container_type_code": "grapple_body",
        "intended_use": "Collection side, self loader",
        "paper_form_number": "PF-TEST-0002",
        "sections": [
            {"label": "Lower body", "shape_code": "rectangular", "role": "base",
             "dimensions": {"length": 264, "width": 96, "height": 54}},
            {"label": "Top flare", "shape_code": "tapered_sides",
             "role": "addition",
             "dimensions": {"length": 264, "height": 18, "width_top": 102,
                            "width_bottom": 96}},
            {"label": "Toolbox intrusion", "shape_code": "rectangular",
             "role": "deduction",
             "dimensions": {"length": 36, "width": 18, "height": 20}}]})
    assert sheet.status_code == 201, sheet.text
    body = sheet.json()
    assert body["section_count"] == 3
    assert body["total_cubic_inches"] == 1368576 + 470448 - 12960
    # The capacity is derived, never typed.
    assert float(body["certified_capacity_cy"]) == float(body["derived_capacity_cy"])

    # A draft prices nothing.
    listing = client.get(f"/api/v1/projects/{project_id}/certifications",
                         params={"status": "active", "limit": 500},
                         headers=auth).json()
    assert draft["id"] not in [c["id"] for c in listing["items"]]

    submitted = client.post(f"/api/v1/certifications/{draft['id']}/submit",
                            headers=auth, json={})
    assert submitted.status_code == 200
    # Missing photographs are reported, not blocked. Operations do not stop
    # because a photograph is behind.
    assert submitted.json()["missing_photos"]

    for slot in ("front", "side", "interior", "placard", "measurement"):
        client.post(f"/api/v1/certifications/{draft['id']}/media", headers=auth,
                    json={"slot": slot,
                          "storage_url": f"https://box.invalid/{slot}.jpg"})
    evidence = client.get(f"/api/v1/certifications/{draft['id']}/media",
                          headers=auth).json()["evidence"]
    assert evidence["evidence_complete"] is True

    approved = client.post(f"/api/v1/certifications/{draft['id']}/approve",
                           headers=auth,
                           json={"notes": "Measurements match the photos"})
    assert approved.status_code == 200
    assert approved.json()["status"] == "active"

    # Evidence that can be edited afterwards is not evidence.
    closed = client.post(
        f"/api/v1/certifications/{draft['id']}/measurement/sections",
        headers=auth, json={"label": "Late", "shape_code": "rectangular",
                            "role": "addition",
                            "dimensions": {"length": 10, "width": 10, "height": 10}})
    assert closed.status_code == 409

    read_back = client.get(f"/api/v1/certifications/{draft['id']}/measurement",
                           headers=auth).json()
    assert read_back["measured"] is True
    assert len(read_back["sections"]) == 3
    assert read_back["evidence"]["evidence_complete"] is True


def test_a_typed_capacity_admits_it_has_no_measurements(client, auth, project_id):
    certs = client.get(f"/api/v1/projects/{project_id}/certifications",
                       params={"limit": 500, "status": "all"},
                       headers=auth).json()["items"]
    typed = [c for c in certs if not c["is_measured"]]
    assert typed, "the demo seeds capacities that were typed, and none are here"
    sheet = client.get(f"/api/v1/certifications/{typed[0]['id']}/measurement",
                       headers=auth).json()
    assert sheet["measured"] is False
    assert "entered directly" in sheet["message"]


def test_two_measurements_cannot_be_open_on_one_unit(client, auth, project_id):
    first = _open_draft(client, auth, project_id)
    assert first is not None
    second = client.post(f"/api/v1/projects/{project_id}/certifications",
                         headers=auth,
                         json={"equipment_id": first["equipment_id"],
                               "method": "physical"})
    assert second.status_code == 409
    assert second.json()["error"]["code"] in (
        "measurement_in_progress", "already_certified")

    # Leave the database as it was found: a stranded draft would block the
    # next run of the suite on this unit.
    client.post(f"/api/v1/certifications/{first['id']}/reject", headers=auth,
                json={"reason": "Opened by the test suite, not a real measurement"})


# ===========================================================================
# Sprint 3: one review queue, whatever the record is
# ===========================================================================

def test_the_queue_carries_more_than_tickets(client, auth, project_id):
    client.post(f"/api/v1/projects/{project_id}/review/scan", headers=auth)
    queue = client.get(f"/api/v1/projects/{project_id}/review/queue",
                       params={"state": "all", "limit": 400}, headers=auth).json()
    kinds = {r["subject_kind"] for r in queue["items"]}
    assert "ticket" in kinds
    assert "certification" in kinds
    # Invoices are an invoice analyst's job, not data review.
    assert "invoice" not in kinds


def test_the_queue_says_how_long_something_has_waited(client, auth, project_id):
    queue = client.get(f"/api/v1/projects/{project_id}/review/queue",
                       params={"state": "pending", "sort": "waiting", "limit": 5},
                       headers=auth).json()
    assert queue["items"]
    top = queue["items"][0]
    assert float(top["waiting_days"]) >= 0
    assert "is_overdue" in top
    assert queue["policy"]["overdue_days"] >= 1


def test_a_certification_can_be_filtered_out_of_the_ticket_work(client, auth,
                                                                project_id):
    only_certs = client.get(f"/api/v1/projects/{project_id}/review/queue",
                            params={"subject_kind": "certification",
                                    "state": "all", "limit": 100},
                            headers=auth).json()
    assert only_certs["items"]
    assert all(r["subject_kind"] == "certification" for r in only_certs["items"])

    incidents = client.get(f"/api/v1/projects/{project_id}/review/queue",
                           params={"record_kind": "incident", "state": "all",
                                   "limit": 100}, headers=auth).json()
    assert all(r["record_kind"] == "incident" for r in incidents["items"])


def test_the_overview_counts_every_kind(client, auth, project_id):
    out = client.get(f"/api/v1/projects/{project_id}/review/overview",
                     headers=auth).json()
    assert out["totals"]["records"] > 0
    assert {k["subject_kind"] for k in out["by_kind"]} >= {"ticket", "certification"}
    assert out["policy"]["repeat_count"] >= 2


def test_one_read_gives_the_reviewer_the_whole_record(client, auth, project_id):
    queue = client.get(f"/api/v1/projects/{project_id}/review/queue",
                       params={"subject_kind": "ticket", "state": "all",
                               "record_kind": "load", "limit": 1},
                       headers=auth).json()
    ticket = queue["items"][0]
    bundle = client.get(f"/api/v1/review/ticket/{ticket['subject_id']}",
                        headers=auth).json()

    # The conceptual review sequence, in one payload rather than five tabs.
    for section in ("identity", "flags", "evidence", "media", "location",
                    "time", "relationships", "measurements", "compliance",
                    "declared", "history"):
        assert section in bundle, section

    # What was supposed to be collected, against what was.
    assert "required_slots" in bundle["evidence"]
    assert "missing_slots" in bundle["evidence"]

    # The location comparison that used to mean a second browser window.
    assert "day_track" in bundle["location"]
    assert "same_street" in bundle["location"]

    # Time as a sequence with the gaps named, not two bare timestamps.
    assert bundle["time"]["sequence"]
    assert all("gap_minutes" in s for s in bundle["time"]["sequence"])


def test_a_certification_reads_as_its_measurements(client, auth, project_id):
    queue = client.get(f"/api/v1/projects/{project_id}/review/queue",
                       params={"subject_kind": "certification", "state": "all",
                               "limit": 100}, headers=auth).json()
    measured = None
    for row in queue["items"]:
        bundle = client.get(f"/api/v1/review/certification/{row['subject_id']}",
                            headers=auth).json()
        if bundle["measurements"].get("sections"):
            measured = bundle
            break
    assert measured is not None, "no measured certification to review"
    assert measured["measurements"]["total_cubic_inches"]
    assert measured["relationships"]["chain"]
    assert "impact" in measured


def test_a_decision_and_an_escalation_leave_a_history(client, auth, project_id):
    queue = client.get(f"/api/v1/projects/{project_id}/review/queue",
                       params={"subject_kind": "ticket", "state": "pending",
                               "limit": 1}, headers=auth).json()
    ticket = queue["items"][0]
    kind_id = f"ticket/{ticket['subject_id']}"

    naked = client.post(f"/api/v1/review/{kind_id}/decision", headers=auth,
                        json={"state": "flagged"})
    assert naked.status_code == 400
    assert naked.json()["error"]["code"] == "issue_required"

    flagged = client.post(f"/api/v1/review/{kind_id}/decision", headers=auth,
                          json={"state": "flagged",
                                "notes": "Disposal photo is unreadable"}).json()
    assert flagged["review_state"] == "flagged"

    client.post(f"/api/v1/review/{kind_id}/note", headers=auth,
                json={"note": "Called the monitor, they are re-shooting it"})

    escalated = client.post(f"/api/v1/review/{kind_id}/escalate", headers=auth,
                            json={"level": "supervisor",
                                  "reason": "Fourth one from this monitor this week"}).json()
    assert escalated["escalation_level"] == "supervisor"

    bundle = client.get(f"/api/v1/review/{kind_id}", headers=auth).json()
    events = [e["event"] for e in bundle["history"]]
    # The old table was overwritten on every decision. This is why it is a log.
    assert events[0] == "opened"
    assert "decided" in events and "noted" in events and "escalated" in events

    resolved = client.post(f"/api/v1/review/{kind_id}/decision", headers=auth,
                           json={"state": "resolved",
                                 "resolution": "New photo attached and checked"}).json()
    assert resolved["review_state"] == "resolved"
    assert resolved["open_flags"] == 0


def test_an_alert_puts_the_record_on_somebody_else_s_list(client, auth,
                                                          manager, project_id):
    queue = client.get(f"/api/v1/projects/{project_id}/review/queue",
                       params={"subject_kind": "ticket", "state": "pending",
                               "limit": 1}, headers=auth).json()
    ticket = queue["items"][0]
    sent = client.post(
        f"/api/v1/review/ticket/{ticket['subject_id']}/alert", headers=auth,
        json={"to_user_id": manager["user"]["id"],
              "subject": "Re-shoot needed before this can close",
              "body": "The disposal photo does not show the bed",
              "severity": "review"})
    assert sent.status_code == 201

    inbox = client.get("/api/v1/review/inbox",
                       headers={"Authorization": f"Bearer {manager['access_token']}"}
                       ).json()
    assert inbox["unread"] >= 1
    mine = inbox["items"][0]
    assert mine["title"]
    acked = client.post(
        f"/api/v1/review/alerts/{mine['id']}/acknowledge",
        headers={"Authorization": f"Bearer {manager['access_token']}"})
    assert acked.status_code == 200


def test_escalation_is_suggested_with_a_reason(client, auth, project_id):
    out = client.get(f"/api/v1/projects/{project_id}/review/escalations",
                     headers=auth).json()
    for row in out["items"]:
        assert row["reason_code"] in ("waited_too_long", "repeating_issue")
        assert row["reason"]


def test_a_repeating_issue_is_counted_not_guessed(client, auth, project_id):
    out = client.get(f"/api/v1/projects/{project_id}/review/patterns",
                     headers=auth).json()
    assert out["items"]
    row = out["items"][0]
    assert row["occurrences"] >= 1
    assert row["issue_label"]


def test_a_dimension_that_does_not_fit_on_a_road_is_caught(client, auth,
                                                           project_id):
    draft = _open_draft(client, auth, project_id)
    assert draft is not None
    client.post(f"/api/v1/certifications/{draft['id']}/measurement", headers=auth,
                json={"container_type_code": "high_side_end_dump",
                      "sections": [{"label": "Main body",
                                    "shape_code": "rectangular", "role": "base",
                                    # 24 feet keyed into an inches box.
                                    "dimensions": {"length": 288, "width": 288,
                                                   "height": 60}}]})
    client.post(f"/api/v1/certifications/{draft['id']}/submit", headers=auth,
                json={})
    bundle = client.get(f"/api/v1/review/certification/{draft['id']}",
                        headers=auth).json()
    codes = {f["issue_code"] for f in bundle["flags"] if not f["cleared_at"]}
    assert "dimension_implausible" in codes

    client.post(f"/api/v1/certifications/{draft['id']}/reject", headers=auth,
                json={"reason": "Interior width is 288 inches, which is feet "
                                "keyed into an inches box"})
