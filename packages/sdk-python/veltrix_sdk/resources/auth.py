# -*- coding: utf-8 -*-

from .base import BaseResource

class AuthResource(BaseResource):
    """Handles authentication operations."""
    # Auth endpoints don't follow the standard resource pattern,
    # so we won't use RESOURCE_PATH or the base methods directly.
    # We define specific methods for each auth action.
    RESOURCE_PATH = "auth"  # Base path segment

    def check_user(self, email, **kwargs):
        """
        Checks if a user with the given email exists.

        Args:
            email (str): The email address to check.
            **kwargs: Additional keyword arguments for the request.

        Returns:
            dict: An object containing 'exists' (bool) and 'authProvider' (str or None).
        """
        path = f"{self.RESOURCE_PATH}/check-user"
        data = {"email": email}
        return self._http_client.post(path, data=data, **kwargs)

    def login(self, email, password, **kwargs):
        """
        Authenticates a user with email and password.

        Args:
            email (str): The user's email address.
            password (str): The user's password.
            **kwargs: Additional keyword arguments for the request.

        Returns:
            dict: An object containing the JWT 'token' and 'user' details.
        """
        path = f"{self.RESOURCE_PATH}/login"
        data = {"email": email, "password": password}
        return self._http_client.post(path, data=data, **kwargs)

    def register(self, name, email, password, customer_id=None, **kwargs):
        """
        Registers a new user.

        Args:
            name (str): The user's full name.
            email (str): The user's email address.
            password (str): The user's password (min 8 characters).
            customer_id (str, optional): The ID of the organization to associate the
                user with. Optional for single-tenant deployments where the server
                resolves the default organization. Defaults to None.
            **kwargs: Additional keyword arguments for the request.

        Returns:
            dict: An object containing the new user's 'id', 'email', and 'name'.
        """
        path = f"{self.RESOURCE_PATH}/register"
        data = {
            "name": name,
            "email": email,
            "password": password,
            "customerId": customer_id,
        }
        data = {k: v for k, v in data.items() if v is not None}
        return self._http_client.post(path, data=data, **kwargs)

    def get_me(self, **kwargs):
        """
        Retrieves information about the currently authenticated user (using JWT).

        Args:
            **kwargs: Additional keyword arguments for the request.

        Returns:
            dict: An object containing the current user's details.
        """
        path = f"{self.RESOURCE_PATH}/me"
        # This requires bearer token auth, which http_client handles if jwt_token was provided
        return self._http_client.get(path, **kwargs)

    def change_password(self, current_password, new_password, **kwargs):
        """
        Changes the password for the currently authenticated user (using JWT).

        Args:
            current_password (str): The user's current password.
            new_password (str): The desired new password (min 8 characters).
            **kwargs: Additional keyword arguments for the request.

        Returns:
            dict: An object indicating success status and a message.
        """
        path = f"{self.RESOURCE_PATH}/change-password"
        data = {
            "currentPassword": current_password,
            "newPassword": new_password,
        }
        # This requires bearer token auth
        return self._http_client.post(path, data=data, **kwargs)

    # --- API Key Authentication Methods ---
    # These are separate from user auth but fall under the 'authentication' tag in the spec

    def authenticate_api_key(self, api_key, api_key_id=None, **kwargs):
        """
        Authenticates using an API key to get context like customerId, type, scopes.
        Note: This is for validating a key, not for setting auth for subsequent SDK calls.
              Use VeltrixClient(api_key=...) for SDK authentication.

        Args:
            api_key (str): The API key value.
            api_key_id (str, optional): The ID of the API key (for more secure lookup). Defaults to None.
            **kwargs: Additional keyword arguments for the request.

        Returns:
            dict: An object containing authentication status and details.
        """
        path = f"{self.RESOURCE_PATH}/api-key"  # Endpoint path from spec
        data = {"apiKey": api_key, "apiKeyId": api_key_id}
        data = {k: v for k, v in data.items() if v is not None}
        # This specific endpoint likely doesn't require prior auth in http_client
        return self._http_client.post(path, data=data, **kwargs)

    def verify_api_key_header(self, api_key_id=None, **kwargs):
        """
        Verifies the API key provided in the 'X-API-Key' header of the request.
        This is typically used server-side. The SDK client itself handles auth headers.

        Args:
            api_key_id (str, optional): The ID of the API key (sent via X-API-Key-ID header).
            **kwargs: Additional keyword arguments for the request, including headers.

        Returns:
            dict: An object indicating validity and details if valid.
        """
        path = f"{self.RESOURCE_PATH}/api-key/verify"  # Endpoint path from spec
        headers = kwargs.pop('headers', {})
        if api_key_id:
            headers['X-API-Key-ID'] = api_key_id
        # Assumes the API key itself is passed in the Authorization header by http_client
        return self._http_client.get(path, headers=headers, **kwargs)

    def check_api_key_auth_header(self, **kwargs):
        """
        Checks the authentication status based on the 'Authorization: ApiKey ...' header.
        This is typically used server-side. The SDK client itself handles auth headers.

        Args:
            **kwargs: Additional keyword arguments for the request.

        Returns:
            dict: An object indicating authentication status and details.
        """
        path = f"{self.RESOURCE_PATH}/api-key/check"  # Endpoint path from spec
        # Assumes the API key is passed in the Authorization header by http_client
        return self._http_client.get(path, **kwargs)
