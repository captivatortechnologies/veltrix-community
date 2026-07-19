# -*- coding: utf-8 -*-

from .base import BaseResource


class LogEntriesResource(BaseResource):
    """Handles platform log entries (``/api/logs``)."""
    RESOURCE_PATH = "logs"

    def list(self, page=None, limit=None, level=None, source=None,
             from_date=None, to_date=None, **kwargs):
        """Lists log entries with pagination/filtering (GET /api/logs)."""
        params = {
            "page": page,
            "limit": limit,
            "level": level,
            "source": source,
            "fromDate": from_date,
            "toDate": to_date,
        }
        params = {k: v for k, v in params.items() if v is not None}
        return self._list(params=params, **kwargs)

    def create(self, level, source, message, details=None, **kwargs):
        """Creates a log entry (POST /api/logs)."""
        data = {"level": level, "source": source, "message": message, "details": details}
        data = {k: v for k, v in data.items() if v is not None}
        return self._create(data=data, **kwargs)

    def get(self, log_id, **kwargs):
        """Retrieves a specific log entry by its ID (GET /api/logs/{id})."""
        return self._get(resource_id=log_id, **kwargs)

    def delete(self, log_id, **kwargs):
        """Deletes a log entry by its ID (DELETE /api/logs/{id})."""
        return self._delete(resource_id=log_id, **kwargs)

    def get_sources(self, **kwargs):
        """Retrieves the distinct set of log sources (GET /api/logs/sources)."""
        return self._http_client.get(f"{self.RESOURCE_PATH}/sources", **kwargs)

    def get_levels(self, **kwargs):
        """Retrieves the distinct set of log levels (GET /api/logs/levels)."""
        return self._http_client.get(f"{self.RESOURCE_PATH}/levels", **kwargs)
