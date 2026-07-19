# -*- coding: utf-8 -*-

from .base import BaseResource

class ComponentsResource(BaseResource):
    """Handles operations related to components."""
    RESOURCE_PATH = "components"

    def list(self, **kwargs):
        """
        Retrieves all components for the authenticated organization.

        Args:
            **kwargs: Additional keyword arguments for the request.

        Returns:
            list: A list of component objects.
        """
        # Corresponds to GET /api/components
        return self._list(**kwargs)

    def create(self, name, tool_id, description=None, configuration=None, status=None, **kwargs):
        """
        Creates a new component for the authenticated organization.

        Args:
            name (str): The name of the component.
            tool_id (str): The ID of the tool this component belongs to.
            description (str, optional): Description for the component. Defaults to None.
            configuration (dict, optional): Configuration object for the component. Defaults to None.
            status (str, optional): Initial status of the component. Defaults to None.
            **kwargs: Additional keyword arguments for the request.

        Returns:
            dict: The newly created component object.
        """
        # Corresponds to POST /api/components
        data = {
            "name": name,
            "toolId": tool_id,
            "description": description,
            "configuration": configuration,
            "status": status,
        }
        data = {k: v for k, v in data.items() if v is not None}
        return self._create(data=data, **kwargs)

    def list_for_tool(self, tool_id, **kwargs):
        """
        Retrieves all components associated with a specific tool.

        Args:
            tool_id (str): The ID of the tool.
            **kwargs: Additional keyword arguments for the request.

        Returns:
            list: A list of component objects for the specified tool.
        """
        # Corresponds to GET /api/tools/{toolId}/components
        path = f"tools/{tool_id}/components"
        return self._http_client.get(path, **kwargs)

    def get(self, component_id, **kwargs):
        """
        Retrieves a specific component by its ID.

        Args:
            component_id (str): The ID of the component to retrieve.
            **kwargs: Additional keyword arguments for the request.

        Returns:
            dict: The component object.
        """
        # Corresponds to GET /api/components/{id}
        return self._get(resource_id=component_id, **kwargs)

    def update(self, component_id, name=None, description=None, configuration=None, status=None, **kwargs):
        """
        Updates an existing component.

        Args:
            component_id (str): The ID of the component to update.
            name (str, optional): New name for the component.
            description (str, optional): New description for the component.
            configuration (dict, optional): New configuration object.
            status (str, optional): New status for the component.
            **kwargs: Additional keyword arguments for the request.

        Returns:
            dict: The updated component object.
        """
        # Corresponds to PUT /api/components/{id}
        data = {
            "name": name,
            "description": description,
            "configuration": configuration,
            "status": status,
        }
        data = {k: v for k, v in data.items() if v is not None}
        return self._update(resource_id=component_id, data=data, **kwargs)

    def delete(self, component_id, **kwargs):
        """
        Deletes an existing component.

        Args:
            component_id (str): The ID of the component to delete.
            **kwargs: Additional keyword arguments for the request.

        Returns:
            None: Returns None on successful (204 No Content) deletion.
        """
        # Corresponds to DELETE /api/components/{id}
        return self._delete(resource_id=component_id, **kwargs)
