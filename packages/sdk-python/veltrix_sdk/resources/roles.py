# -*- coding: utf-8 -*-

from .base import BaseResource

class RolesResource(BaseResource):
    """Handles operations related to roles and permissions (RBAC)."""
    RESOURCE_PATH = "roles"

    def list(self, **kwargs):
        """
        Retrieves all roles for the authenticated organization.

        Args:
            **kwargs: Additional keyword arguments for the request.

        Returns:
            list: A list of role objects, potentially including permissions.
        """
        # Corresponds to GET /api/roles
        return self._list(**kwargs)

    def create(self, name, description=None, permissions=None, **kwargs):
        """
        Creates a new role for the authenticated organization.

        Args:
            name (str): The name of the role.
            description (str, optional): Description for the role. Defaults to None.
            permissions (list[dict], optional): List of permission objects,
                                                each like {"resource": "...", "action": "..."}.
                                                Defaults to None.
            **kwargs: Additional keyword arguments for the request.

        Returns:
            dict: The newly created role object.
        """
        # Corresponds to POST /api/roles
        data = {
            "name": name,
            "description": description,
            "permissions": permissions,
        }
        data = {k: v for k, v in data.items() if v is not None}
        return self._create(data=data, **kwargs)

    def get(self, role_id, **kwargs):
        """
        Retrieves a specific role by its ID.

        Args:
            role_id (str): The ID of the role to retrieve.
            **kwargs: Additional keyword arguments for the request.

        Returns:
            dict: The role object, potentially including permissions.
        """
        # Corresponds to GET /api/roles/{id}
        return self._get(resource_id=role_id, **kwargs)

    def update(self, role_id, name=None, description=None, permissions=None, **kwargs):
        """
        Updates an existing role.

        Args:
            role_id (str): The ID of the role to update.
            name (str, optional): New name for the role.
            description (str, optional): New description for the role.
            permissions (list[dict], optional): New list of permission objects
                                                ({"resource": "...", "action": "..."}).
            **kwargs: Additional keyword arguments for the request.

        Returns:
            dict: The updated role object.
        """
        # Corresponds to PUT /api/roles/{id}
        data = {
            "name": name,
            "description": description,
            "permissions": permissions,
        }
        data = {k: v for k, v in data.items() if v is not None}
        return self._update(resource_id=role_id, data=data, **kwargs)

    def delete(self, role_id, **kwargs):
        """
        Deletes an existing role.

        Args:
            role_id (str): The ID of the role to delete.
            **kwargs: Additional keyword arguments for the request.

        Returns:
            None: Returns None on successful (204 No Content) deletion.
        """
        # Corresponds to DELETE /api/roles/{id}
        return self._delete(resource_id=role_id, **kwargs)

    # --- Helper endpoints for permissions ---

    def list_available_resources(self, **kwargs):
        """
        Retrieves a list of all available resource names for defining permissions.

        Args:
            **kwargs: Additional keyword arguments for the request.

        Returns:
            list: A list of resource name strings.
        """
        # Corresponds to GET /api/resources
        # Path is different from the base resource path
        path = "resources"
        return self._http_client.get(path, **kwargs)

    def list_resource_actions(self, resource_name, **kwargs):
        """
        Retrieves a list of available actions for a specific resource.

        Args:
            resource_name (str): The name of the resource (e.g., 'components', 'roles').
            **kwargs: Additional keyword arguments for the request.

        Returns:
            list: A list of action name strings for the specified resource.
        """
        # Corresponds to GET /api/resources/{resource}/actions
        # Path is different from the base resource path
        path = f"resources/{resource_name}/actions"
        return self._http_client.get(path, **kwargs)
