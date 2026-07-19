# -*- coding: utf-8 -*-

from .base import BaseResource


class ConfigurationHistoryResource(BaseResource):
    """Handles configuration history (``/api/configuration-history``).

    A versioned audit history of configuration changes (author, approvals,
    reverts) across every entity type. Powers the client's history/audit views
    and the approval workflow.
    """
    RESOURCE_PATH = "configuration-history"

    def list(self, params=None, **kwargs):
        """Lists history entries (GET /).

        Optional ``params`` filters: action, entityType, entityId, userId,
        deployState, startDate, endDate, searchTerm, page, limit
        (comma-separated for the list-valued filters).
        """
        return self._list(params=params, **kwargs)

    def get(self, history_id, **kwargs):
        """Gets a single history entry (GET /{id})."""
        return self._get(resource_id=history_id, **kwargs)

    def list_pending_approvals(self, params=None, **kwargs):
        """Pending approvals (GET /pending-approvals). Optional ``params``: entityType, entityId."""
        return self._http_client.get(f"{self.RESOURCE_PATH}/pending-approvals", params=params, **kwargs)

    def get_entity_types(self, **kwargs):
        """Distinct entity types for filter dropdowns (GET /entity-types)."""
        return self._http_client.get(f"{self.RESOURCE_PATH}/entity-types", **kwargs)

    def get_users(self, **kwargs):
        """Distinct users for filter dropdowns (GET /users)."""
        return self._http_client.get(f"{self.RESOURCE_PATH}/users", **kwargs)

    def create(self, data, **kwargs):
        """Creates a history entry (POST /). ``data`` requires action, entityType, entityId."""
        return self._create(data=data, **kwargs)

    def approve(self, entry_id, **kwargs):
        """Approves a pending change (POST /approve/{id})."""
        return self._http_client.post(f"{self.RESOURCE_PATH}/approve/{entry_id}", **kwargs)

    def reject(self, entry_id, data=None, **kwargs):
        """Rejects a pending change (POST /reject/{id}). ``data`` accepts ``reason``."""
        return self._http_client.post(f"{self.RESOURCE_PATH}/reject/{entry_id}", data=data, **kwargs)

    def revert(self, version_id, **kwargs):
        """Reverts to a previous version (POST /revert -- body: {versionId})."""
        return self._http_client.post(f"{self.RESOURCE_PATH}/revert", data={"versionId": version_id}, **kwargs)
