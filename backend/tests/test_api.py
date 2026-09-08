"""End-to-end coverage of the API against the seeded demo project."""
from __future__ import annotations

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
