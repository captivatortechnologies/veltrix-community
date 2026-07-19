# -*- coding: utf-8 -*-

from .http_client import HttpClient, DEFAULT_BASE_URL
from .resources.auth import AuthResource
from .resources.me import MeResource
from .resources.profile import ProfileResource
from .resources.organization import OrganizationResource
from .resources.users import UsersResource
from .resources.roles import RolesResource
from .resources.api_keys import ApiKeysResource
from .resources.tools import ToolsResource
from .resources.customer_tools import CustomerToolsResource
from .resources.components import ComponentsResource
from .resources.credentials import CredentialsResource
from .resources.tags import TagsResource
from .resources.environments import EnvironmentsResource
from .resources.connectivity import ConnectivityResource
from .resources.connectivity_providers import ConnectivityProvidersResource
from .resources.tailscale import TailscaleResource
from .resources.tailscale_config import TailscaleConfigResource
from .resources.log_forwarding import LogForwardingResource
from .resources.log_entries import LogEntriesResource
from .resources.reports import ReportsResource
from .resources.configuration_canvas import ConfigurationCanvasResource
from .resources.configuration_history import ConfigurationHistoryResource
from .resources.pipeline import PipelineResource
from .resources.apps import AppsResource
from .resources.sandboxes import SandboxesResource
from .resources.webhooks import WebhooksResource
from .resources.brand import BrandResource
from .resources.feature_flags import FeatureFlagsResource
from .resources.cognito import CognitoResource


class VeltrixClient:
    """
    Main client for interacting with the Veltrix API (Community Edition).

    Usage:
        client = VeltrixClient(api_key="YOUR_API_KEY")
        # or
        client = VeltrixClient(jwt_token="YOUR_JWT_TOKEN")

        # Access resources:
        roles = client.roles.list()
        org = client.organization.get()

    The base URL is fully configurable via the ``base_url`` argument and
    defaults to a self-hosted server at ``http://localhost:5000/api``.
    """
    DEFAULT_BASE_URL = DEFAULT_BASE_URL

    def __init__(self, api_key=None, jwt_token=None, customer_id=None, base_url=None, timeout=60):
        """
        Initializes the VeltrixClient.

        Args:
            api_key (str, optional): Your Veltrix API key. Defaults to None.
            jwt_token (str, optional): Your Veltrix JWT token. Defaults to None.
                                       API key takes precedence if both are provided.
            customer_id (str, optional): The organization ID to scope requests to.
                                         Usually inferred from auth in single-tenant
                                         deployments; required only for some admin
                                         actions. Defaults to None.
            base_url (str, optional): The base URL for the Veltrix API.
                                      Defaults to http://localhost:5000/api.
            timeout (int, optional): Request timeout in seconds. Defaults to 60.
        """
        _base_url = base_url or self.DEFAULT_BASE_URL
        self._http_client = HttpClient(
            api_key=api_key,
            jwt_token=jwt_token,
            customer_id=customer_id,
            base_url=_base_url,
            timeout=timeout,
        )

        # Initialize resource handlers
        self._auth = AuthResource(self._http_client)
        self._me = MeResource(self._http_client)
        self._profile = ProfileResource(self._http_client)
        self._organization = OrganizationResource(self._http_client)
        self._users = UsersResource(self._http_client)
        self._roles = RolesResource(self._http_client)
        self._api_keys = ApiKeysResource(self._http_client)
        self._tools = ToolsResource(self._http_client)
        self._customer_tools = CustomerToolsResource(self._http_client)
        self._components = ComponentsResource(self._http_client)
        self._credentials = CredentialsResource(self._http_client)
        self._tags = TagsResource(self._http_client)
        self._environments = EnvironmentsResource(self._http_client)
        self._connectivity = ConnectivityResource(self._http_client)
        self._connectivity_providers = ConnectivityProvidersResource(self._http_client)
        self._tailscale = TailscaleResource(self._http_client)
        self._tailscale_config = TailscaleConfigResource(self._http_client)
        self._log_forwarding = LogForwardingResource(self._http_client)
        self._log_entries = LogEntriesResource(self._http_client)
        self._reports = ReportsResource(self._http_client)
        self._configuration_canvas = ConfigurationCanvasResource(self._http_client)
        self._configuration_history = ConfigurationHistoryResource(self._http_client)
        self._pipeline = PipelineResource(self._http_client)
        self._apps = AppsResource(self._http_client)
        self._sandboxes = SandboxesResource(self._http_client)
        self._webhooks = WebhooksResource(self._http_client)
        self._brand = BrandResource(self._http_client)
        self._feature_flags = FeatureFlagsResource(self._http_client)
        self._cognito = CognitoResource(self._http_client)

    # --- Resource Properties ---
    @property
    def auth(self):
        """Access the Auth resource."""
        return self._auth

    @property
    def me(self):
        """Access the Me resource (current-user permissions)."""
        return self._me

    @property
    def profile(self):
        """Access the Profile resource (current user's profile/settings)."""
        return self._profile

    @property
    def organization(self):
        """Access the Organization resource."""
        return self._organization

    @property
    def users(self):
        """Access the Users resource (admin)."""
        return self._users

    @property
    def roles(self):
        """Access the Roles resource (RBAC)."""
        return self._roles

    @property
    def api_keys(self):
        """Access the API Keys resource."""
        return self._api_keys

    @property
    def tools(self):
        """Access the Tools resource (security tool inventory)."""
        return self._tools

    @property
    def customer_tools(self):
        """Access the Customer Tools resource (per-tenant tool enablement)."""
        return self._customer_tools

    @property
    def components(self):
        """Access the Components resource."""
        return self._components

    @property
    def credentials(self):
        """Access the Credentials resource."""
        return self._credentials

    @property
    def tags(self):
        """Access the Tags resource."""
        return self._tags

    @property
    def environments(self):
        """Access the Environments resource."""
        return self._environments

    @property
    def connectivity(self):
        """Access the Connectivity resource."""
        return self._connectivity

    @property
    def connectivity_providers(self):
        """Access the Connectivity Providers resource (SSH/WireGuard/Tailscale adapters)."""
        return self._connectivity_providers

    @property
    def tailscale(self):
        """Access the Tailscale resource (devices/keys)."""
        return self._tailscale

    @property
    def tailscale_config(self):
        """Access the Tailscale configuration resource."""
        return self._tailscale_config

    @property
    def log_forwarding(self):
        """Access the Log Forwarding resource."""
        return self._log_forwarding

    @property
    def log_entries(self):
        """Access the Log Entries resource."""
        return self._log_entries

    @property
    def reports(self):
        """Access the Reports resource."""
        return self._reports

    @property
    def configuration_canvas(self):
        """Access the Configuration Canvas resource."""
        return self._configuration_canvas

    @property
    def configuration_history(self):
        """Access the Configuration History resource."""
        return self._configuration_history

    @property
    def pipeline(self):
        """Access the Pipeline (deployments) resource."""
        return self._pipeline

    @property
    def apps(self):
        """Access the Apps resource."""
        return self._apps

    @property
    def sandboxes(self):
        """Access the Sandboxes resource (Veltrix CLI dev mode; flag-gated)."""
        return self._sandboxes

    @property
    def webhooks(self):
        """Access the Webhooks resource (inbound webhook ingress)."""
        return self._webhooks

    @property
    def brand(self):
        """Access the Brand resource (public branding)."""
        return self._brand

    @property
    def feature_flags(self):
        """Access the Feature Flags resource (public feature flags)."""
        return self._feature_flags

    @property
    def cognito(self):
        """Access the Cognito resource (optional AWS Cognito SSO; disabled by default)."""
        return self._cognito

    # --- Auth mutators ---
    def set_customer_id(self, customer_id):
        """Sets or updates the organization ID for subsequent requests."""
        self._http_client.customer_id = customer_id
        self._http_client.session.headers.update(self._http_client._get_default_headers())

    def set_api_key(self, api_key):
        """Sets or updates the API key for subsequent requests."""
        self._http_client.api_key = api_key
        self._http_client.jwt_token = None  # Clear JWT if API key is set
        self._http_client.session.headers.update(self._http_client._get_default_headers())

    def set_jwt_token(self, jwt_token):
        """Sets or updates the JWT token for subsequent requests."""
        self._http_client.jwt_token = jwt_token
        self._http_client.api_key = None  # Clear API key if JWT is set
        self._http_client.session.headers.update(self._http_client._get_default_headers())
