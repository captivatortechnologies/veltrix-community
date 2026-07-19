# -*- coding: utf-8 -*-

from .base import BaseResource


class LogForwardingResource(BaseResource):
    """Handles log-forwarding destinations (``/api/log-forwarding``)."""
    RESOURCE_PATH = "log-forwarding"  # Note the hyphen

    def list(self, **kwargs):
        """Lists all log-forwarding destinations (GET /api/log-forwarding)."""
        return self._list(**kwargs)

    def create(self, name, forwarding_type, endpoint, **kwargs):
        """Creates a log-forwarding destination (POST /api/log-forwarding).

        Args:
            name: Display name of the destination.
            forwarding_type: Destination type (e.g. ``splunk``, ``datadog``, ``custom``).
            endpoint: The destination endpoint URL.
        """
        data = {"name": name, "type": forwarding_type, "endpoint": endpoint}
        return self._create(data=data, **kwargs)

    def update(self, destination_id, name=None, forwarding_type=None, endpoint=None,
               status=None, **kwargs):
        """Updates a log-forwarding destination (PUT /api/log-forwarding/{id})."""
        data = {
            "name": name,
            "type": forwarding_type,
            "endpoint": endpoint,
            "status": status,
        }
        data = {k: v for k, v in data.items() if v is not None}
        return self._update(resource_id=destination_id, data=data, **kwargs)

    def delete(self, destination_id, **kwargs):
        """Deletes a log-forwarding destination (DELETE /api/log-forwarding/{id})."""
        return self._delete(resource_id=destination_id, **kwargs)

    def test(self, destination_id, **kwargs):
        """Tests a log-forwarding destination (POST /api/log-forwarding/{id}/test)."""
        return self._action(resource_id=destination_id, action="test", method="POST", **kwargs)
