# -*- coding: utf-8 -*-

from .http_client import HttpClient, DEFAULT_BASE_URL
from .resources.auth import AuthResource
from .resources.roles import RolesResource
from .resources.users import UsersResource
from .resources.components import ComponentsResource
from .resources.credentials import CredentialsResource
from .resources.tags import TagsResource
from .resources.api_keys import ApiKeysResource
from .resources.connectivity import ConnectivityResource
from .resources.organization import OrganizationResource
from .resources.environments import EnvironmentsResource
from .resources.configuration_canvas import ConfigurationCanvasResource
from .resources.configuration_history import ConfigurationHistoryResource
from .resources.pipeline import PipelineResource
from .resources.apps import AppsResource
from .resources.reports import ReportsResource


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
        self._roles = RolesResource(self._http_client)
        self._users = UsersResource(self._http_client)
        self._components = ComponentsResource(self._http_client)
        self._credentials = CredentialsResource(self._http_client)
        self._tags = TagsResource(self._http_client)
        self._api_keys = ApiKeysResource(self._http_client)
        self._connectivity = ConnectivityResource(self._http_client)
        self._organization = OrganizationResource(self._http_client)
        self._environments = EnvironmentsResource(self._http_client)
        self._configuration_canvas = ConfigurationCanvasResource(self._http_client)
        self._configuration_history = ConfigurationHistoryResource(self._http_client)
        self._pipeline = PipelineResource(self._http_client)
        self._apps = AppsResource(self._http_client)
        self._reports = ReportsResource(self._http_client)

    # --- Resource Properties ---
    @property
    def auth(self):
        """Access the Auth resource."""
        return self._auth

    @property
    def roles(self):
        """Access the Roles resource (RBAC)."""
        return self._roles

    @property
    def users(self):
        """Access the Users resource (admin)."""
        return self._users

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
    def api_keys(self):
        """Access the API Keys resource."""
        return self._api_keys

    @property
    def connectivity(self):
        """Access the Connectivity resource."""
        return self._connectivity

    @property
    def organization(self):
        """Access the Organization resource."""
        return self._organization

    @property
    def environments(self):
        """Access the Environments resource."""
        return self._environments

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
    def reports(self):
        """Access the Reports resource."""
        return self._reports

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
