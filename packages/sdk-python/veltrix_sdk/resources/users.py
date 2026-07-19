# -*- coding: utf-8 -*-

from .base import BaseResource

class UsersResource(BaseResource):
    """Handles user management operations (typically admin-level)."""
    RESOURCE_PATH = "users"

    def list(self, auth_provider=None, **kwargs):
        """
        Retrieves a list of users, optionally filtered by auth provider.

        Args:
            auth_provider (str, optional): Filter by authentication provider (e.g. 'LOCAL').
            **kwargs: Additional keyword arguments for the request.

        Returns:
            list: A list of user objects.
        """
        # Corresponds to GET /api/users
        params = {"authProvider": auth_provider}
        params = {k: v for k, v in params.items() if v is not None}
        return self._list(params=params, **kwargs)

    def create(self, name, email, password, role_id, customer_id=None, auth_provider='LOCAL', **kwargs):
        """
        Creates a new user (typically admin-level).

        Args:
            name (str): Full name of the user.
            email (str): Email address for the user.
            password (str): Password for the user (required for LOCAL auth).
            role_id (str): ID of the role to assign to the user.
            customer_id (str, optional): ID of the organization the user belongs to.
                Optional for single-tenant deployments where the server resolves the
                default organization. Defaults to None.
            auth_provider (str, optional): Authentication provider. Defaults to 'LOCAL'.
            **kwargs: Additional keyword arguments for the request.

        Returns:
            dict: The newly created user object.
        """
        # Corresponds to POST /api/users
        data = {
            "name": name,
            "email": email,
            "password": password,
            "roleId": role_id,
            "customerId": customer_id,
            "authProvider": auth_provider,
        }
        data = {k: v for k, v in data.items() if v is not None}
        return self._create(data=data, **kwargs)

    def delete(self, user_id, **kwargs):
        """
        Deletes a user by their ID.

        Args:
            user_id (str): The ID of the user to delete.
            **kwargs: Additional keyword arguments for the request.

        Returns:
            None: Returns None on successful (204 No Content) deletion.
        """
        # Corresponds to DELETE /api/users/{id}
        return self._delete(resource_id=user_id, **kwargs)
