# -*- coding: utf-8 -*-

from .base import BaseResource


class TailscaleResource(BaseResource):
    """Handles Tailscale devices, keys and (admin) global configuration.

    Maps to ``/api/tailscale`` on the Community Edition server.
    """
    RESOURCE_PATH = "tailscale"

    def get_config(self, **kwargs):
        """Retrieves the tenant Tailscale config (GET /api/tailscale/config)."""
        return self._http_client.get(f"{self.RESOURCE_PATH}/config", **kwargs)

    def list_devices(self, **kwargs):
        """Lists Tailscale devices (GET /api/tailscale/devices)."""
        return self._http_client.get(f"{self.RESOURCE_PATH}/devices", **kwargs)

    def get_device(self, device_id, **kwargs):
        """Retrieves a single Tailscale device (GET /api/tailscale/devices/{id})."""
        return self._http_client.get(f"{self.RESOURCE_PATH}/devices/{device_id}", **kwargs)

    def generate_key(self, component_id, description, customer_id, reusable=None,
                     ephemeral=None, tags=None, **kwargs):
        """Generates a Tailscale auth key (POST /api/tailscale/keys)."""
        data = {
            "componentId": component_id,
            "description": description,
            "customerId": customer_id,
            "reusable": reusable,
            "ephemeral": ephemeral,
            "tags": tags,
        }
        data = {k: v for k, v in data.items() if v is not None}
        return self._http_client.post(f"{self.RESOURCE_PATH}/keys", data=data, **kwargs)

    def delete_device(self, device_id, **kwargs):
        """Deletes a Tailscale device (DELETE /api/tailscale/device/{id})."""
        return self._http_client.delete(f"{self.RESOURCE_PATH}/device/{device_id}", **kwargs)

    # --- Global config (admin only) ---

    def get_global_config(self, **kwargs):
        """Retrieves the global Tailscale config (GET /api/tailscale/global-config)."""
        return self._http_client.get(f"{self.RESOURCE_PATH}/global-config", **kwargs)

    def set_global_config(self, tailnet, api_key, api_url=None, **kwargs):
        """Sets the global Tailscale config (POST /api/tailscale/global-config)."""
        data = {"tailnet": tailnet, "apiKey": api_key, "apiUrl": api_url}
        data = {k: v for k, v in data.items() if v is not None}
        return self._http_client.post(f"{self.RESOURCE_PATH}/global-config", data=data, **kwargs)

    def delete_global_config(self, **kwargs):
        """Deletes the global Tailscale config (DELETE /api/tailscale/global-config)."""
        return self._http_client.delete(f"{self.RESOURCE_PATH}/global-config", **kwargs)
