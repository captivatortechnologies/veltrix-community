# -*- coding: utf-8 -*-

from .base import BaseResource


class WebhooksResource(BaseResource):
    """Handles inbound webhook ingress (``/api/webhooks``).

    Webhook ingress is enabled by default on the server and can be turned off
    via the ``platform.webhooks`` feature flag.
    """
    RESOURCE_PATH = "webhooks"

    def receive_generic(self, source, event, payload, timestamp=None, metadata=None, **kwargs):
        """Posts a generic webhook event (POST /api/webhooks)."""
        data = {
            "source": source,
            "event": event,
            "payload": payload,
            "timestamp": timestamp,
            "metadata": metadata,
        }
        data = {k: v for k, v in data.items() if v is not None}
        return self._create(data=data, **kwargs)

    def receive_github(self, payload=None, headers=None, **kwargs):
        """Posts a GitHub webhook event (POST /api/webhooks/github)."""
        return self._http_client.post(
            f"{self.RESOURCE_PATH}/github", data=payload, headers=headers, **kwargs
        )

    def health_check(self, **kwargs):
        """Checks webhook ingress health (GET /api/webhooks/health)."""
        return self._http_client.get(f"{self.RESOURCE_PATH}/health", **kwargs)
