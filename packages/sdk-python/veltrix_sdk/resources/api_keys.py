# -*- coding: utf-8 -*-

from .base import BaseResource

class ApiKeysResource(BaseResource):
    """Handles operations related to API keys."""
    RESOURCE_PATH = "api-keys"  # Note the hyphenated path from the spec

    def list(self, **kwargs):
        """
        Retrieves all API keys for the authenticated organization.

        Args:
            **kwargs: Additional keyword arguments for the request.

        Returns:
            list: A list of API key objects (key value is usually masked or omitted).
        """
        # Corresponds to GET /api/api-keys
        return self._list(**kwargs)

    def create(self, name, key_type, expires_at=None, scopes=None, **kwargs):
        """
        Creates a new API key.

        Args:
            name (str): The name for the API key (3-64 characters).
            key_type (str): Type of key ('api', 'admin', or 'webhook').
            expires_at (str, optional): ISO 8601 formatted expiration date. Defaults to None (no expiration).
            scopes (list[str], optional): List of permission scopes. Defaults to None.
            **kwargs: Additional keyword arguments for the request.

        Returns:
            dict: The newly created API key object, including the key value.
        """
        # Corresponds to POST /api/api-keys
        data = {
            "name": name,
            "type": key_type,  # Renamed from 'type' to avoid keyword conflict
            "expiresAt": expires_at,
            "scopes": scopes,
        }
        data = {k: v for k, v in data.items() if v is not None}
        return self._create(data=data, **kwargs)

    def get(self, key_id, **kwargs):
        """
        Retrieves a specific API key by its ID (key value is usually masked or omitted).

        Args:
            key_id (str): The ID of the API key to retrieve.
            **kwargs: Additional keyword arguments for the request.

        Returns:
            dict: The API key object.
        """
        # Corresponds to GET /api/api-keys/{id}
        return self._get(resource_id=key_id, **kwargs)

    def update(self, key_id, name=None, expires_at=None, revoked=None, scopes=None, **kwargs):
        """
        Updates an existing API key.

        Args:
            key_id (str): The ID of the API key to update.
            name (str, optional): New name for the API key (3-64 characters).
            expires_at (str or None, optional): New ISO 8601 expiration date, or None to remove expiration.
            revoked (bool, optional): Set the revoked status.
            scopes (list[str], optional): New list of permission scopes.
            **kwargs: Additional keyword arguments for the request.

        Returns:
            dict: The updated API key object.
        """
        # Corresponds to PUT /api/api-keys/{id}
        data = {
            "name": name,
            "expiresAt": expires_at,
            "revoked": revoked,
            "scopes": scopes,
        }
        data = {k: v for k, v in data.items() if v is not None}
        return self._update(resource_id=key_id, data=data, **kwargs)

    def delete(self, key_id, **kwargs):
        """
        Deletes an API key by its ID.

        Args:
            key_id (str): The ID of the API key to delete.
            **kwargs: Additional keyword arguments for the request.

        Returns:
            None: Returns None on successful (204 No Content) deletion.
        """
        # Corresponds to DELETE /api/api-keys/{id}
        return self._delete(resource_id=key_id, **kwargs)

    def regenerate(self, key_id, retain_name=True, expires_at=None, **kwargs):
        """
        Regenerates an API key, invalidating the old key value.

        Args:
            key_id (str): The ID of the API key to regenerate.
            retain_name (bool, optional): Whether to keep the existing name. Defaults to True.
            expires_at (str, optional): New ISO 8601 expiration date. Defaults to None.
            **kwargs: Additional keyword arguments for the request.

        Returns:
            dict: The regenerated API key object, including the new key value.
        """
        # Corresponds to POST /api/api-keys/{id}/regenerate
        action = "regenerate"
        data = {
            "retainName": retain_name,
            "expiresAt": expires_at,
        }
        data = {k: v for k, v in data.items() if v is not None}
        # Use _action helper as it's a POST to a sub-path
        return self._action(resource_id=key_id, action=action, method='POST', data=data, **kwargs)

    def revoke(self, key_id, **kwargs):
        """
        Revokes an API key, making it inactive.

        Args:
            key_id (str): The ID of the API key to revoke.
            **kwargs: Additional keyword arguments for the request.

        Returns:
            dict: The updated (revoked) API key object.
        """
        # Corresponds to POST /api/api-keys/{id}/revoke
        action = "revoke"
        # Use _action helper as it's a POST to a sub-path with no body
        return self._action(resource_id=key_id, action=action, method='POST', **kwargs)
