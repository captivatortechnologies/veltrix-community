# -*- coding: utf-8 -*-

from .base import BaseResource


class ToolsResource(BaseResource):
    """Handles the security tool inventory (``/api/tools``)."""
    RESOURCE_PATH = "tools"

    def list(self, vendor=None, category=None, search=None, customer_id=None, **kwargs):
        """Lists tools, optionally filtered by vendor/category/search."""
        params = {
            "vendor": vendor,
            "category": category,
            "search": search,
            "customerId": customer_id,
        }
        params = {k: v for k, v in params.items() if v is not None}
        return self._list(params=params, **kwargs)

    def create(self, name, description, vendor, category, logo_url=None,
               customer_id=None, **kwargs):
        """Creates a new tool."""
        data = {
            "name": name,
            "description": description,
            "vendor": vendor,
            "category": category,
            "logoUrl": logo_url,
            "customerId": customer_id,
        }
        data = {k: v for k, v in data.items() if v is not None}
        return self._create(data=data, **kwargs)

    def get(self, tool_id, **kwargs):
        """Retrieves a specific tool by its ID."""
        return self._get(resource_id=tool_id, **kwargs)

    def update(self, tool_id, name=None, description=None, vendor=None,
               category=None, logo_url=None, is_active=None, customer_id=None, **kwargs):
        """Updates an existing tool."""
        data = {
            "name": name,
            "description": description,
            "vendor": vendor,
            "category": category,
            "logoUrl": logo_url,
            "isActive": is_active,
            "customerId": customer_id,
        }
        data = {k: v for k, v in data.items() if v is not None}
        return self._update(resource_id=tool_id, data=data, **kwargs)

    def delete(self, tool_id, **kwargs):
        """Deletes a tool by its ID."""
        return self._delete(resource_id=tool_id, **kwargs)

    def get_vendors(self, customer_id=None, **kwargs):
        """Retrieves the distinct list of tool vendors (GET /api/tools/vendors)."""
        params = {"customerId": customer_id} if customer_id is not None else None
        return self._http_client.get(f"{self.RESOURCE_PATH}/vendors", params=params, **kwargs)

    def get_categories(self, customer_id=None, **kwargs):
        """Retrieves the distinct list of tool categories (GET /api/tools/categories)."""
        params = {"customerId": customer_id} if customer_id is not None else None
        return self._http_client.get(f"{self.RESOURCE_PATH}/categories", params=params, **kwargs)
