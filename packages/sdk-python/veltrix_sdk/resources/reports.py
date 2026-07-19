# -*- coding: utf-8 -*-

from .base import BaseResource


class ReportsResource(BaseResource):
    """Handles tenant-scoped reporting (``/api/reports``).

    Each endpoint aggregates real data for the caller's tenant into a fixed,
    named report -- there is no list/get-by-id surface.
    """
    RESOURCE_PATH = "reports"

    def get_audit_logs(self, params=None, **kwargs):
        """Unified activity feed (GET /audit-logs)."""
        return self._http_client.get(f"{self.RESOURCE_PATH}/audit-logs", params=params, **kwargs)

    def get_user_activity(self, params=None, **kwargs):
        """User-activity report -- stats, sessions, actions (GET /user-activity)."""
        return self._http_client.get(f"{self.RESOURCE_PATH}/user-activity", params=params, **kwargs)

    def get_resource_usage(self, params=None, **kwargs):
        """Resource-usage report -- real inventory (GET /resource-usage)."""
        return self._http_client.get(f"{self.RESOURCE_PATH}/resource-usage", params=params, **kwargs)

    def get_security_overview(self, params=None, **kwargs):
        """Security-overview report -- derived posture (GET /security-overview)."""
        return self._http_client.get(f"{self.RESOURCE_PATH}/security-overview", params=params, **kwargs)

    def get_compliance(self, params=None, **kwargs):
        """Compliance report -- frameworks + controls (GET /compliance)."""
        return self._http_client.get(f"{self.RESOURCE_PATH}/compliance", params=params, **kwargs)
