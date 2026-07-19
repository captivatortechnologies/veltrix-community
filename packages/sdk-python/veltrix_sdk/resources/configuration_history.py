# -*- coding: utf-8 -*-

from .base import BaseResource

class ConfigurationHistoryResource(BaseResource):
    """Handles read access to configuration history / version-control records.

    Tracks the versioned history of configuration changes (author, approvals,
    comments) produced by the configuration canvas and pipeline.

    Note:
        The base route (``/api/configuration-history``) matches the Community
        Edition server surface. The method surface below follows standard REST
        conventions; verify method-level shapes against the server as the OSS
        API stabilizes.
    """
    RESOURCE_PATH = "configuration-history"

    def list(self, params=None, **kwargs):
        """Retrieves configuration history entries, optionally filtered via ``params``."""
        return self._list(params=params, **kwargs)

    def get(self, history_id, **kwargs):
        """Retrieves a specific configuration history entry by its ID."""
        return self._get(resource_id=history_id, **kwargs)
