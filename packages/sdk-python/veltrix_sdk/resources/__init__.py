# -*- coding: utf-8 -*-

# Resource classes exposed by the Veltrix Community Edition SDK. The surface
# mirrors the OSS server's registered routes and is kept in lock-step with the
# TypeScript SDK (``@veltrix/sdk``). Billing (payment/payment_methods/
# subscription), BYOL cloud provisioning, multi-tenant customer/MSSP admin, and
# network (IPAM) resources are intentionally absent so the surface matches the
# Community Edition server API.

from .auth import AuthResource
from .me import MeResource
from .profile import ProfileResource
from .organization import OrganizationResource
from .users import UsersResource
from .roles import RolesResource
from .api_keys import ApiKeysResource
from .tools import ToolsResource
from .customer_tools import CustomerToolsResource
from .components import ComponentsResource
from .credentials import CredentialsResource
from .tags import TagsResource
from .environments import EnvironmentsResource
from .connectivity import ConnectivityResource
from .connectivity_providers import ConnectivityProvidersResource
from .tailscale import TailscaleResource
from .tailscale_config import TailscaleConfigResource
from .log_forwarding import LogForwardingResource
from .log_entries import LogEntriesResource
from .reports import ReportsResource
from .configuration_canvas import ConfigurationCanvasResource
from .configuration_history import ConfigurationHistoryResource
from .pipeline import PipelineResource
from .apps import AppsResource
from .sandboxes import SandboxesResource
from .webhooks import WebhooksResource
from .brand import BrandResource
from .feature_flags import FeatureFlagsResource
from .cognito import CognitoResource

__all__ = [
    "AuthResource",
    "MeResource",
    "ProfileResource",
    "OrganizationResource",
    "UsersResource",
    "RolesResource",
    "ApiKeysResource",
    "ToolsResource",
    "CustomerToolsResource",
    "ComponentsResource",
    "CredentialsResource",
    "TagsResource",
    "EnvironmentsResource",
    "ConnectivityResource",
    "ConnectivityProvidersResource",
    "TailscaleResource",
    "TailscaleConfigResource",
    "LogForwardingResource",
    "LogEntriesResource",
    "ReportsResource",
    "ConfigurationCanvasResource",
    "ConfigurationHistoryResource",
    "PipelineResource",
    "AppsResource",
    "SandboxesResource",
    "WebhooksResource",
    "BrandResource",
    "FeatureFlagsResource",
    "CognitoResource",
]
