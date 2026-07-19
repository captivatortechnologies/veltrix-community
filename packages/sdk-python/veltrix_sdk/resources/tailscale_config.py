# -*- coding: utf-8 -*-

from .base import BaseResource


class TailscaleConfigResource(BaseResource):
    """Handles the tenant Tailscale configuration (``/api/tailscale-config``)."""
    RESOURCE_PATH = "tailscale-config"  # Note the hyphen

    def get(self, **kwargs):
        """Retrieves the Tailscale configuration (GET /api/tailscale-config)."""
        return self._list(**kwargs)

    def set(self, tailnet, api_key, api_url=None, **kwargs):
        """Creates/updates the Tailscale configuration (POST /api/tailscale-config)."""
        data = {"tailnet": tailnet, "apiKey": api_key, "apiUrl": api_url}
        data = {k: v for k, v in data.items() if v is not None}
        return self._create(data=data, **kwargs)

    def delete(self, **kwargs):
        """Deletes the Tailscale configuration (DELETE /api/tailscale-config)."""
        return self._http_client.delete(self._get_path(), **kwargs)

    def check(self, **kwargs):
        """Checks whether Tailscale is configured (GET /api/tailscale-config/check)."""
        return self._http_client.get(f"{self.RESOURCE_PATH}/check", **kwargs)
