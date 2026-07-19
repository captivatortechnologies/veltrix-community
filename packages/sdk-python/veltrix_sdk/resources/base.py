# -*- coding: utf-8 -*-

class BaseResource:
    """Base class for API resources."""

    # Define the resource path prefix (e.g., 'roles', 'components').
    # This should be overridden by subclasses.
    RESOURCE_PATH = ""

    def __init__(self, http_client):
        self._http_client = http_client
        if not self.RESOURCE_PATH:
            raise NotImplementedError("Subclasses must define RESOURCE_PATH")

    def _get_path(self, resource_id=None, action=None):
        """Constructs the full API path for a resource or action."""
        path = self.RESOURCE_PATH
        if resource_id:
            path = f"{path}/{resource_id}"
        if action:
            path = f"{path}/{action}"
        return path

    def _list(self, params=None, **kwargs):
        """Generic method to list resources."""
        path = self._get_path()
        return self._http_client.get(path, params=params, **kwargs)

    def _get(self, resource_id, params=None, **kwargs):
        """Generic method to retrieve a specific resource by ID."""
        path = self._get_path(resource_id=resource_id)
        return self._http_client.get(path, params=params, **kwargs)

    def _create(self, data, params=None, **kwargs):
        """Generic method to create a resource."""
        path = self._get_path()
        return self._http_client.post(path, data=data, params=params, **kwargs)

    def _update(self, resource_id, data, params=None, **kwargs):
        """Generic method to update a specific resource by ID."""
        path = self._get_path(resource_id=resource_id)
        return self._http_client.put(path, data=data, params=params, **kwargs)

    def _patch(self, resource_id, data, params=None, **kwargs):
        """Generic method to partially update a specific resource by ID."""
        path = self._get_path(resource_id=resource_id)
        return self._http_client.patch(path, data=data, params=params, **kwargs)

    def _delete(self, resource_id, params=None, **kwargs):
        """Generic method to delete a specific resource by ID."""
        path = self._get_path(resource_id=resource_id)
        return self._http_client.delete(path, params=params, **kwargs)

    def _action(self, resource_id, action, method='POST', data=None, params=None, **kwargs):
        """Generic method to perform an action on a resource."""
        path = self._get_path(resource_id=resource_id, action=action)
        return self._http_client.request(method, path, data=data, params=params, **kwargs)
