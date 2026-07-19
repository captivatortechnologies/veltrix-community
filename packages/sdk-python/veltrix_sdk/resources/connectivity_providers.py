# -*- coding: utf-8 -*-

from .base import BaseResource


class ConnectivityProvidersResource(BaseResource):
    """Handles connectivity providers (``/api/connectivity-providers``).

    Generic connectivity adapters (SSH / WireGuard / self-managed Tailscale).
    All routes require admin privileges on the server.
    """
    RESOURCE_PATH = "connectivity-providers"

    def list(self, **kwargs):
        """Lists connectivity providers (GET /api/connectivity-providers)."""
        return self._list(**kwargs)

    def get(self, provider_id, **kwargs):
        """Retrieves a connectivity provider by ID."""
        return self._get(resource_id=provider_id, **kwargs)

    def create(self, data, **kwargs):
        """Creates a connectivity provider (POST /api/connectivity-providers)."""
        return self._create(data=data, **kwargs)

    def update(self, provider_id, data, **kwargs):
        """Updates a connectivity provider (PUT /api/connectivity-providers/{id})."""
        return self._update(resource_id=provider_id, data=data, **kwargs)

    def delete(self, provider_id, **kwargs):
        """Deletes a connectivity provider (DELETE /api/connectivity-providers/{id})."""
        return self._delete(resource_id=provider_id, **kwargs)

    def test(self, provider_id, **kwargs):
        """Tests a provider's connection (POST /api/connectivity-providers/{id}/test)."""
        return self._action(resource_id=provider_id, action="test", method="POST", **kwargs)

    def set_default(self, provider_id, **kwargs):
        """Marks a provider as the default (POST /api/connectivity-providers/{id}/set-default)."""
        return self._action(resource_id=provider_id, action="set-default", method="POST", **kwargs)
