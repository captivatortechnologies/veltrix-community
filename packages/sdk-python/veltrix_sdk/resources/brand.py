# -*- coding: utf-8 -*-

from .base import BaseResource


class BrandResource(BaseResource):
    """Public branding endpoint (``/api/brand``).

    Returns the deployment's branding (name, tagline, logo URL). Public — no
    authentication required.
    """
    RESOURCE_PATH = "brand"

    def get(self, **kwargs):
        """Retrieves the deployment branding (GET /api/brand)."""
        return self._list(**kwargs)
