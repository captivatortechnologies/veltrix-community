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

def test_exception_hierarchy():
    assert issubclass(AuthenticationError, VeltrixError)
    assert issubclass(NotFoundError, VeltrixError)


def test_error_str_includes_request_id():
    err = VeltrixError(message="boom", headers={"request-id": "req-1"})
    assert "req-1" in str(err)
    assert "boom" in str(err)
