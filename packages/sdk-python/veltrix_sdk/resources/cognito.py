# -*- coding: utf-8 -*-

from .base import BaseResource


class CognitoResource(BaseResource):
    """Optional AWS Cognito SSO integration (``/api/cognito``).

    The Community Edition defaults to self-hosted local auth; these endpoints
    are only active when the server's ``oauth.cognito`` feature flag is enabled.
    """
    RESOURCE_PATH = "cognito"

    def get_config(self, **kwargs):
        """Retrieves the Cognito configuration (GET /api/cognito)."""
        return self._list(**kwargs)

    def save_config(self, data, **kwargs):
        """Saves the Cognito configuration (POST /api/cognito/config)."""
        return self._http_client.post(f"{self.RESOURCE_PATH}/config", data=data, **kwargs)

    def reset_config(self, **kwargs):
        """Resets the Cognito configuration (DELETE /api/cognito/config/reset)."""
        return self._http_client.delete(f"{self.RESOURCE_PATH}/config/reset", **kwargs)

    def disable_for_sso(self, sso_type, **kwargs):
        """Disables local auth in favour of SSO (POST /api/cognito/disable-for-sso)."""
        return self._http_client.post(
            f"{self.RESOURCE_PATH}/disable-for-sso", data={"ssoType": sso_type}, **kwargs
        )

    def handle_callback(self, code, redirect_uri, **kwargs):
        """Exchanges an OAuth code for Cognito tokens (POST /api/cognito/handle-callback)."""
        data = {"code": code, "redirectUri": redirect_uri}
        return self._http_client.post(f"{self.RESOURCE_PATH}/handle-callback", data=data, **kwargs)

    def exchange_token(self, id_token, access_token, **kwargs):
        """Exchanges Cognito tokens for a Veltrix JWT (POST /api/cognito/token-exchange)."""
        data = {"idToken": id_token, "accessToken": access_token}
        return self._http_client.post(f"{self.RESOURCE_PATH}/token-exchange", data=data, **kwargs)

    def list_cognito_users(self, **kwargs):
        """Lists Cognito user-pool users (GET /api/cognito/cognito-users)."""
        return self._http_client.get(f"{self.RESOURCE_PATH}/cognito-users", **kwargs)

    def create_cognito_user(self, email, role_id, name=None, first_name=None,
                            last_name=None, phone_number=None, password=None, **kwargs):
        """Creates a Cognito user (POST /api/cognito/create-user)."""
        data = {
            "email": email,
            "roleId": role_id,
            "name": name,
            "firstName": first_name,
            "lastName": last_name,
            "phoneNumber": phone_number,
            "password": password,
        }
        data = {k: v for k, v in data.items() if v is not None}
        return self._http_client.post(f"{self.RESOURCE_PATH}/create-user", data=data, **kwargs)
