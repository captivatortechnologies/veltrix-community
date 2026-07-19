# -*- coding: utf-8 -*-

from .base import BaseResource

class ReportsResource(BaseResource):
    """Handles read access to platform reports.

    Note:
        The base route (``/api/reports``) matches the Community Edition server
        surface. The method surface below follows standard REST conventions;
        verify method-level shapes against the server as the OSS API stabilizes.
    """
    RESOURCE_PATH = "reports"

    def list(self, params=None, **kwargs):
        """Retrieves the available reports, optionally filtered via ``params``."""
        return self._list(params=params, **kwargs)

    def get(self, report_id, params=None, **kwargs):
        """Retrieves a specific report by its ID."""
        return self._get(resource_id=report_id, params=params, **kwargs)
