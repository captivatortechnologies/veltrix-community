# -*- coding: utf-8 -*-

from .base import BaseResource


class FeatureFlagsResource(BaseResource):
    """Public feature-flags endpoint (``/api/feature-flags``).

    Used by clients to conditionally enable UI/behaviour. Public — no
    authentication required.
    """
    RESOURCE_PATH = "feature-flags"

    def get(self, **kwargs):
        """Retrieves the deployment's feature flags (GET /api/feature-flags)."""
        return self._list(**kwargs)
