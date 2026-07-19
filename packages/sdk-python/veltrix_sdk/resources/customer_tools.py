# -*- coding: utf-8 -*-

from .base import BaseResource


class CustomerToolsResource(BaseResource):
    """Per-tenant tool enablement (``/api/customers/{customerId}/tools``)."""
    RESOURCE_PATH = "customers"

    def list(self, customer_id, **kwargs):
        """Lists the tools configured for a customer.

        Corresponds to GET /api/customers/{customerId}/tools.
        """
        path = f"{self.RESOURCE_PATH}/{customer_id}/tools"
        return self._http_client.get(path, **kwargs)

    def add(self, customer_id, data, **kwargs):
        """Adds a tool to a customer's configured tools.

        Corresponds to POST /api/customers/{customerId}/tools.
        """
        path = f"{self.RESOURCE_PATH}/{customer_id}/tools"
        return self._http_client.post(path, data=data, **kwargs)

    def remove(self, customer_id, tool_id, **kwargs):
        """Removes a tool from a customer's configured tools.

        Corresponds to DELETE /api/customers/{customerId}/tools/{toolId}.
        """
        path = f"{self.RESOURCE_PATH}/{customer_id}/tools/{tool_id}"
        return self._http_client.delete(path, **kwargs)
