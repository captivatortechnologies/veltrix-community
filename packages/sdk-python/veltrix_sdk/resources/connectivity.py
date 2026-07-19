# -*- coding: utf-8 -*-

from .base import BaseResource

class ConnectivityResource(BaseResource):
    """Handles operations related to component connectivity details."""
    RESOURCE_PATH = "connectivity"

    def get_for_component(self, component_id, **kwargs):
        """
        Retrieves connectivity details for a specific component.

        Args:
            component_id (str): The ID of the component.
            **kwargs: Additional keyword arguments for the request.

        Returns:
            dict: The connectivity details object for the component.
        """
        # Corresponds to GET /api/connectivity/component/{componentId}
        path = f"{self.RESOURCE_PATH}/component/{component_id}"
        return self._http_client.get(path, **kwargs)

    def update_for_component(self, component_id, status=None, ssh_command=None, https_url=None, tailscale_key=None, tailscale_device_id=None, tailscale_device_ip=None, **kwargs):
        """
        Updates connectivity details for a specific component.

        Args:
            component_id (str): The ID of the component.
            status (str, optional): New status.
            ssh_command (str, optional): New SSH command.
            https_url (str, optional): New HTTPS URL.
            tailscale_key (str, optional): New Tailscale key.
            tailscale_device_id (str, optional): New Tailscale device ID.
            tailscale_device_ip (str, optional): New Tailscale device IP.
            **kwargs: Additional keyword arguments for the request.

        Returns:
            dict: The updated connectivity details object.
        """
        # Corresponds to PUT /api/connectivity/component/{componentId}
        path = f"{self.RESOURCE_PATH}/component/{component_id}"
        data = {
            "status": status,
            "sshCommand": ssh_command,
            "httpsUrl": https_url,
            "tailscaleKey": tailscale_key,
            "tailscaleDeviceId": tailscale_device_id,
            "tailscaleDeviceIP": tailscale_device_ip,
        }
        data = {k: v for k, v in data.items() if v is not None}
        return self._http_client.put(path, data=data, **kwargs)

    def delete_for_component(self, component_id, **kwargs):
        """
        Deletes connectivity details for a specific component.

        Args:
            component_id (str): The ID of the component.
            **kwargs: Additional keyword arguments for the request.

        Returns:
            dict: A confirmation message (API returns 200 OK with message).
        """
        # Corresponds to DELETE /api/connectivity/component/{componentId}
        # API spec indicates 200 OK with message
        path = f"{self.RESOURCE_PATH}/component/{component_id}"
        return self._http_client.delete(path, **kwargs)

    def create_or_update(self, component_id, status=None, ssh_command=None, https_url=None, **kwargs):
        """
        Creates or updates connectivity details for a component.

        Args:
            component_id (str): The ID of the component.
            status (str, optional): Status of the connectivity.
            ssh_command (str, optional): SSH command for connection.
            https_url (str, optional): HTTPS URL for connection.
            **kwargs: Additional keyword arguments for the request.

        Returns:
            dict: The created or updated connectivity details object.
        """
        # Corresponds to POST /api/connectivity/
        # Note: This uses the base path POST, not the component-specific path
        data = {
            "componentId": component_id,
            "status": status,
            "sshCommand": ssh_command,
            "httpsUrl": https_url,
        }
        data = {k: v for k, v in data.items() if v is not None}
        return self._create(data=data, **kwargs)  # Using base _create method

    def regenerate_key(self, component_id, **kwargs):
        """
        Regenerates the connectivity key for a specific component.

        Args:
            component_id (str): The ID of the component.
            **kwargs: Additional keyword arguments for the request.

        Returns:
            dict: The updated connectivity details object with the new key.
        """
        # Corresponds to POST /api/connectivity/component/{componentId}/regenerate-key
        path = f"{self.RESOURCE_PATH}/component/{component_id}/regenerate-key"
        # Use http_client directly as it's a POST to a sub-path with no body
        return self._http_client.post(path, **kwargs)
