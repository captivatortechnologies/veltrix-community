# -*- coding: utf-8 -*-

from .base import BaseResource


class MeResource(BaseResource):
    """Endpoints scoped to the authenticated user themselves (``/api/me``)."""
    RESOURCE_PATH = "me"

    def get_permissions(self, **kwargs):
        """Retrieves the current user's resolved permission snapshot.

        Corresponds to GET /api/me/permissions.
        """
        return self._http_client.get(f"{self.RESOURCE_PATH}/permissions", **kwargs)
