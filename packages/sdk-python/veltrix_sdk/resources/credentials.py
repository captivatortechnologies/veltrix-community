# -*- coding: utf-8 -*-

from .base import BaseResource

class CredentialsResource(BaseResource):
    """Handles operations related to credentials."""
    RESOURCE_PATH = "credentials"

    def list_for_tool(self, tool_id, **kwargs):
        """
        Retrieves all credentials associated with a specific tool.

        Args:
            tool_id (str): The ID of the tool.
            **kwargs: Additional keyword arguments for the request.

        Returns:
            list: A list of credential objects for the specified tool.
        """
        # This path is different from the standard resource path
        path = f"tools/{tool_id}/credentials"
        return self._http_client.get(path, **kwargs)

    def get(self, credential_id, **kwargs):
        """
        Retrieves a specific credential by its ID.

        Args:
            credential_id (str): The ID of the credential to retrieve.
            **kwargs: Additional keyword arguments for the request.

        Returns:
            dict: The credential object.
        """
        return self._get(resource_id=credential_id, **kwargs)

    def create(self, name, username, password, tool_id, tag_ids, api_token=None, certificate=None, credential_type=None, customer_id=None, **kwargs):
        """
        Creates a new credential.

        Args:
            name (str): The name of the credential.
            username (str): The username for the credential.
            password (str): The password for the credential.
            tool_id (str): The ID of the tool this credential belongs to.
            tag_ids (list[str]): List of tag IDs to associate with the credential.
            api_token (str, optional): API token, if applicable. Defaults to None.
            certificate (str, optional): Certificate content, if applicable. Defaults to None.
            credential_type (str, optional): Type of credential (e.g., 'ssh', 'api_key'). Defaults to None.
            customer_id (str, optional): Associate with a specific organization (admin only). Defaults to None.
            **kwargs: Additional keyword arguments for the request.

        Returns:
            dict: The newly created credential object.
        """
        data = {
            "name": name,
            "username": username,
            "password": password,
            "toolId": tool_id,
            "tagIds": tag_ids,
            "apiToken": api_token,
            "certificate": certificate,
            "type": credential_type,  # Renamed from 'type' in spec to avoid keyword conflict
            "customerId": customer_id,
        }
        data = {k: v for k, v in data.items() if v is not None}
        return self._create(data=data, **kwargs)

    def update(self, credential_id, name=None, username=None, password=None, api_token=None, certificate=None, credential_type=None, tag_ids=None, **kwargs):
        """
        Updates an existing credential.

        Args:
            credential_id (str): The ID of the credential to update.
            name (str, optional): New name for the credential.
            username (str, optional): New username for the credential.
            password (str, optional): New password for the credential.
            api_token (str, optional): New API token.
            certificate (str, optional): New certificate content.
            credential_type (str, optional): New type for the credential.
            tag_ids (list[str], optional): New list of associated tag IDs.
            **kwargs: Additional keyword arguments for the request.

        Returns:
            dict: The updated credential object.
        """
        data = {
            "name": name,
            "username": username,
            "password": password,
            "apiToken": api_token,
            "certificate": certificate,
            "type": credential_type,  # Renamed from 'type' in spec
            "tagIds": tag_ids,
        }
        data = {k: v for k, v in data.items() if v is not None}
        return self._update(resource_id=credential_id, data=data, **kwargs)

    def delete(self, credential_id, **kwargs):
        """
        Deletes a credential by its ID.

        Args:
            credential_id (str): The ID of the credential to delete.
            **kwargs: Additional keyword arguments for the request.

        Returns:
            dict: A confirmation message (API returns 200 OK with message).
        """
        # API spec indicates 200 OK with message, not 204 No Content
        return self._delete(resource_id=credential_id, **kwargs)
