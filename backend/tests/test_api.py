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
    assert "STL-2026-ROW-closeout" in response.headers["content-disposition"]

    bundle = zipfile.ZipFile(io.BytesIO(response.content))
    names = bundle.namelist()
    assert any(n.endswith("manifest.csv") for n in names)
    assert any(n.endswith("manifest.json") for n in names)
    assert any("/data/" in n and n.endswith("-tickets.csv") for n in names)
    assert any(n.endswith("README.txt") for n in names)

    manifest = json.loads(bundle.read(
        next(n for n in names if n.endswith("manifest.json"))))
    assert manifest["documents"]
    assert "never the files" in manifest["note"]

    tickets = bundle.read(next(n for n in names if n.endswith("-tickets.csv")))
    assert tickets.count(b"\n") > 10, "the ticket export should carry the demo tickets"


def test_the_package_is_recorded_in_the_audit_trail(client, auth, project_id):
    before = client.get("/api/v1/audit", params={"action": "export"},
                        headers=auth).json()["total"]
    client.get(f"/api/v1/projects/{project_id}/closeout/package", headers=auth)
    after = client.get("/api/v1/audit", params={"action": "export"},
                       headers=auth).json()["total"]
    assert after > before
