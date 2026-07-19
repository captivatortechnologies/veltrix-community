# -*- coding: utf-8 -*-
"""Unit tests for VeltrixClient wiring, auth headers and base-URL handling.

These tests exercise only local behaviour (header construction, resource
wiring, URL defaults) and never make network calls.
"""

import pytest

from veltrix_sdk import (
    VeltrixClient,
    VeltrixError,
    AuthenticationError,
    NotFoundError,
)
from veltrix_sdk.http_client import DEFAULT_BASE_URL


# --- Base URL ---------------------------------------------------------------

def test_default_base_url():
    client = VeltrixClient()
    assert client._http_client.base_url == "http://localhost:5000/api"
    assert DEFAULT_BASE_URL == "http://localhost:5000/api"


def test_custom_base_url_strips_trailing_slash():
    client = VeltrixClient(base_url="https://veltrix.example.com/api/")
    assert client._http_client.base_url == "https://veltrix.example.com/api"


# --- Auth headers -----------------------------------------------------------

def test_api_key_header():
    client = VeltrixClient(api_key="abc123")
    headers = client._http_client._get_default_headers()
    assert headers["Authorization"] == "ApiKey abc123"
    assert headers["User-Agent"].startswith("VeltrixPythonSDK/")


def test_jwt_header():
    client = VeltrixClient(jwt_token="jwt.token.value")
    headers = client._http_client._get_default_headers()
    assert headers["Authorization"] == "Bearer jwt.token.value"


def test_api_key_takes_precedence_over_jwt():
    client = VeltrixClient(api_key="abc123", jwt_token="jwt.token.value")
    headers = client._http_client._get_default_headers()
    assert headers["Authorization"] == "ApiKey abc123"


def test_customer_id_header():
    client = VeltrixClient(api_key="abc123", customer_id="org-1")
    headers = client._http_client._get_default_headers()
    assert headers["X-Customer-ID"] == "org-1"


def test_no_auth_headers_when_anonymous():
    client = VeltrixClient()
    headers = client._http_client._get_default_headers()
    assert "Authorization" not in headers
    assert "X-Customer-ID" not in headers


# --- Auth mutators ----------------------------------------------------------

def test_set_jwt_clears_api_key():
    client = VeltrixClient(api_key="abc123")
    client.set_jwt_token("new.jwt")
    assert client._http_client.api_key is None
    assert client._http_client.session.headers["Authorization"] == "Bearer new.jwt"


def test_set_api_key_clears_jwt():
    client = VeltrixClient(jwt_token="jwt.value")
    client.set_api_key("key-2")
    assert client._http_client.jwt_token is None
    assert client._http_client.session.headers["Authorization"] == "ApiKey key-2"


def test_set_customer_id_updates_header():
    client = VeltrixClient(api_key="abc123")
    client.set_customer_id("org-42")
    assert client._http_client.session.headers["X-Customer-ID"] == "org-42"


# --- Resource wiring --------------------------------------------------------

EXPECTED_RESOURCES = [
    "auth",
    "me",
    "profile",
    "organization",
    "users",
    "roles",
    "api_keys",
    "tools",
    "customer_tools",
    "components",
    "credentials",
    "tags",
    "environments",
    "connectivity",
    "connectivity_providers",
    "tailscale",
    "tailscale_config",
    "log_forwarding",
    "log_entries",
    "reports",
    "configuration_canvas",
    "configuration_history",
    "pipeline",
    "apps",
    "sandboxes",
    "webhooks",
    "brand",
    "feature_flags",
    "cognito",
]


@pytest.mark.parametrize("name", EXPECTED_RESOURCES)
def test_resource_accessor_present(name):
    client = VeltrixClient()
    assert getattr(client, name) is not None


def test_billing_resources_removed():
    client = VeltrixClient()
    for dropped in (
        "payment",
        "payment_methods",
        "subscription",
        "customers",
        "byol",
        "cloud_providers",
        "mssp",
        "platform_admin",
        "group_admin",
        "network",
    ):
        assert not hasattr(client, dropped)


def test_resource_paths():
    client = VeltrixClient()
    assert client.api_keys.RESOURCE_PATH == "api-keys"
    assert client.configuration_canvas.RESOURCE_PATH == "configuration-canvas"
    assert client.configuration_history.RESOURCE_PATH == "configuration-history"
    assert client.organization.RESOURCE_PATH == "organization"
    assert client.tailscale_config.RESOURCE_PATH == "tailscale-config"
    assert client.log_forwarding.RESOURCE_PATH == "log-forwarding"
    assert client.log_entries.RESOURCE_PATH == "logs"
    assert client.connectivity_providers.RESOURCE_PATH == "connectivity-providers"
    assert client.feature_flags.RESOURCE_PATH == "feature-flags"


# --- Exception hierarchy ----------------------------------------------------

# --- Refined resource routes ------------------------------------------------


class _RecordingHttp:
    """Stub http client that records (method, path, params, data) without I/O."""

    def __init__(self):
        self.calls = []

    def _rec(self, method, path, params=None, data=None):
        self.calls.append((method, path, params, data))
        return {}

    def get(self, path, params=None, headers=None):
        return self._rec("GET", path, params=params)

    def post(self, path, data=None, params=None, headers=None):
        return self._rec("POST", path, params=params, data=data)

    def put(self, path, data=None, params=None, headers=None):
        return self._rec("PUT", path, params=params, data=data)

    def patch(self, path, data=None, params=None, headers=None):
        return self._rec("PATCH", path, params=params, data=data)

    def delete(self, path, params=None, headers=None):
        return self._rec("DELETE", path, params=params)

    def request(self, method, path, params=None, data=None, headers=None):
        return self._rec(method, path, params=params, data=data)


def _stubbed_client():
    client = VeltrixClient()
    http = _RecordingHttp()
    for name in (
        "pipeline",
        "configuration_canvas",
        "configuration_history",
        "reports",
        "environments",
        "apps",
        "sandboxes",
    ):
        getattr(client, name)._http_client = http
    return client, http


def test_pipeline_routes():
    client, http = _stubbed_client()
    client.pipeline.validate_canvas("C")
    client.pipeline.deploy_canvas("C", {"environmentId": "E"})
    client.pipeline.rollback_deployment("D", {"reason": "x"})
    client.pipeline.resolve_drift("DR", {"action": "ignore"})
    assert [(m, p) for (m, p, _, _) in http.calls] == [
        ("POST", "pipeline/canvas/C/validate"),
        ("POST", "pipeline/canvas/C/deploy"),
        ("POST", "pipeline/deployments/D/rollback"),
        ("POST", "pipeline/drift/DR/resolve"),
    ]


def test_configuration_canvas_routes():
    client, http = _stubbed_client()
    client.configuration_canvas.update_status("C", {"status": "APPROVED"})
    client.configuration_canvas.get_version("C", "H")
    client.configuration_canvas.add_comment("C", {"body": "hi"})
    assert [(m, p) for (m, p, _, _) in http.calls] == [
        ("PATCH", "configuration-canvas/C/status"),
        ("GET", "configuration-canvas/C/versions/H"),
        ("POST", "configuration-canvas/C/comments"),
    ]


def test_configuration_history_routes():
    client, http = _stubbed_client()
    client.configuration_history.approve("X")
    client.configuration_history.reject("Y", {"reason": "no"})
    client.configuration_history.revert("V1")
    assert http.calls == [
        ("POST", "configuration-history/approve/X", None, None),
        ("POST", "configuration-history/reject/Y", None, {"reason": "no"}),
        ("POST", "configuration-history/revert", None, {"versionId": "V1"}),
    ]


def test_reports_routes():
    client, http = _stubbed_client()
    client.reports.get_audit_logs()
    client.reports.get_user_activity()
    client.reports.get_resource_usage()
    client.reports.get_security_overview()
    client.reports.get_compliance()
    assert [p for (_, p, _, _) in http.calls] == [
        "reports/audit-logs",
        "reports/user-activity",
        "reports/resource-usage",
        "reports/security-overview",
        "reports/compliance",
    ]


def test_environments_routes_have_no_single_get():
    client, http = _stubbed_client()
    assert not hasattr(client.environments, "get")
    client.environments.get_policy("ENV")
    client.environments.update_policy("ENV", {"requireApproval": True})
    assert http.calls == [
        ("GET", "environments/ENV/policy", None, None),
        ("PUT", "environments/ENV/policy", None, {"requireApproval": True}),
    ]


def test_apps_routes():
    client, http = _stubbed_client()
    client.apps.enable("slug")
    client.apps.install_from_url("http://x/y.zip")
    client.apps.get_config_template("slug", "ct")
    client.apps.run_operation("slug", "op", {"params": {}})
    assert [(m, p) for (m, p, _, _) in http.calls] == [
        ("POST", "apps/slug/enable"),
        ("POST", "apps/install-from-url"),
        ("GET", "apps/slug/config-types/ct/canvas"),
        ("POST", "apps/slug/operations/op"),
    ]


def test_sandboxes_routes():
    client, http = _stubbed_client()
    client.sandboxes.get_file("SB", "a/b.ts")
    client.sandboxes.run("SB", {"configTypeId": "ct", "handler": "validate"})
    assert http.calls == [
        ("GET", "sandboxes/SB/file", {"path": "a/b.ts"}, None),
        ("POST", "sandboxes/SB/run", None, {"configTypeId": "ct", "handler": "validate"}),
    ]


def test_exception_hierarchy():
    assert issubclass(AuthenticationError, VeltrixError)
    assert issubclass(NotFoundError, VeltrixError)


def test_error_str_includes_request_id():
    err = VeltrixError(message="boom", headers={"request-id": "req-1"})
    assert "req-1" in str(err)
    assert "boom" in str(err)
