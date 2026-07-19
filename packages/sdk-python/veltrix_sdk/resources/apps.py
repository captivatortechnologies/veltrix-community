# -*- coding: utf-8 -*-

from .base import BaseResource


class AppsResource(BaseResource):
    """Handles platform apps (``/api/apps``).

    Apps are the pluggable security tools that extend the platform via the app
    engine: browse the marketplace, install/uninstall, enable/disable per
    tenant, upgrade, manage settings, and run per-app connection tests /
    operations. Apps are identified by their manifest slug (``app_id``), not a
    UUID. (The binary multipart upload route, POST /api/apps/upload, is
    intentionally not wrapped.)
    """
    RESOURCE_PATH = "apps"

    def list(self, **kwargs):
        """Lists all apps with installation status for the customer (GET /)."""
        return self._list(**kwargs)

    def list_enabled(self, **kwargs):
        """Lists enabled apps with client config, for the app loader (GET /enabled)."""
        return self._http_client.get(f"{self.RESOURCE_PATH}/enabled", **kwargs)

    def get_marketplace(self, params=None, **kwargs):
        """Browses the marketplace catalog (GET /marketplace). Optional ``params``: search, category."""
        return self._http_client.get(f"{self.RESOURCE_PATH}/marketplace", params=params, **kwargs)

    def get(self, app_id, **kwargs):
        """Gets app detail (GET /{appId})."""
        return self._get(resource_id=app_id, **kwargs)

    def enable(self, app_id, **kwargs):
        """Enables an app for the customer (POST /{appId}/enable)."""
        return self._action(resource_id=app_id, action="enable", method="POST", **kwargs)

    def disable(self, app_id, **kwargs):
        """Disables an app for the customer -- data preserved (POST /{appId}/disable)."""
        return self._action(resource_id=app_id, action="disable", method="POST", **kwargs)

    def get_version(self, app_id, **kwargs):
        """This tenant's version status + upgrade availability (GET /{appId}/version)."""
        return self._action(resource_id=app_id, action="version", method="GET", **kwargs)

    def upgrade(self, app_id, **kwargs):
        """Upgrades the app for this tenant (POST /{appId}/upgrade)."""
        return self._action(resource_id=app_id, action="upgrade", method="POST", **kwargs)

    def install(self, app_id, **kwargs):
        """Installs an app from the marketplace/built-in catalog (POST /{appId}/install)."""
        return self._action(resource_id=app_id, action="install", method="POST", **kwargs)

    def uninstall(self, app_id, **kwargs):
        """Uninstalls a custom/marketplace app (DELETE /{appId})."""
        return self._delete(resource_id=app_id, **kwargs)

    def install_from_url(self, url, **kwargs):
        """Installs an app from a remote package URL (POST /install-from-url -- body: {url})."""
        return self._http_client.post(f"{self.RESOURCE_PATH}/install-from-url", data={"url": url}, **kwargs)

    def get_settings(self, app_id, **kwargs):
        """Gets customer-specific app settings, merged with manifest defaults (GET /{appId}/settings)."""
        return self._action(resource_id=app_id, action="settings", method="GET", **kwargs)

    def update_settings(self, app_id, settings, **kwargs):
        """Updates customer-specific app settings (PUT /{appId}/settings -- body: {settings})."""
        return self._http_client.put(f"{self.RESOURCE_PATH}/{app_id}/settings", data={"settings": settings}, **kwargs)

    def get_config_template(self, app_id, config_type_id, **kwargs):
        """Gets a config type's canvas template, parsed YAML (GET /{appId}/config-types/{configTypeId}/canvas)."""
        return self._http_client.get(f"{self.RESOURCE_PATH}/{app_id}/config-types/{config_type_id}/canvas", **kwargs)

    def get_config_defaults(self, app_id, config_type_id, **kwargs):
        """Gets a config type's defaults, parsed YAML (GET /{appId}/config-types/{configTypeId}/defaults)."""
        return self._http_client.get(f"{self.RESOURCE_PATH}/{app_id}/config-types/{config_type_id}/defaults", **kwargs)

    def test_connection(self, app_id, credential_id, **kwargs):
        """Tests a connection's endpoint + credential in-process (POST /{appId}/connections/{credentialId}/test)."""
        return self._http_client.post(f"{self.RESOURCE_PATH}/{app_id}/connections/{credential_id}/test", **kwargs)

    def run_operation(self, app_id, operation_id, data=None, **kwargs):
        """Runs a declared app operation such as restart/export/retry.

        POST /{appId}/operations/{operationId} -- ``data`` accepts
        ``credentialId`` and ``params``.
        """
        return self._http_client.post(f"{self.RESOURCE_PATH}/{app_id}/operations/{operation_id}", data=data, **kwargs)
