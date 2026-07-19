# -*- coding: utf-8 -*-

import json

import requests

from .exceptions import (
    APIError, AuthenticationError, PermissionError, NotFoundError,
    RateLimitError, BadRequestError, ServerError, VeltrixError
)
from . import __version__

# Default API base URL for a self-hosted Veltrix Community Edition server.
DEFAULT_BASE_URL = "http://localhost:5000/api"


class HttpClient:
    """Handles HTTP requests to the Veltrix API."""

    def __init__(self, api_key=None, jwt_token=None, customer_id=None, base_url=DEFAULT_BASE_URL, timeout=60):
        self.api_key = api_key
        self.jwt_token = jwt_token
        self.customer_id = customer_id
        self.base_url = (base_url or DEFAULT_BASE_URL).rstrip('/')
        self.timeout = timeout
        self.session = requests.Session()
        self.session.headers.update(self._get_default_headers())

    def _get_default_headers(self):
        headers = {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "User-Agent": f"VeltrixPythonSDK/{__version__}",
        }
        if self.api_key:
            # Prefer ApiKey format if both JWT and API key are somehow provided
            headers["Authorization"] = f"ApiKey {self.api_key}"
        elif self.jwt_token:
            headers["Authorization"] = f"Bearer {self.jwt_token}"

        # Add customer ID header if provided
        if self.customer_id:
            headers["X-Customer-ID"] = self.customer_id

        return headers

    def _handle_response(self, response):
        """Processes the HTTP response and handles errors."""
        status_code = response.status_code
        try:
            json_body = response.json()
        except json.JSONDecodeError:
            json_body = None

        if 200 <= status_code < 300:
            return json_body

        message = None
        if json_body and isinstance(json_body, dict):
            message = json_body.get("error") or json_body.get("message")

        if not message:
            try:
                response.raise_for_status()  # Raise default requests error if no specific message
            except requests.exceptions.HTTPError as e:
                message = str(e)

        error_args = {
            "message": message,
            "http_body": response.content,
            "http_status": status_code,
            "json_body": json_body,
            "headers": response.headers,
        }

        if status_code == 400:
            raise BadRequestError(**error_args)
        elif status_code == 401:
            raise AuthenticationError(**error_args)
        elif status_code == 403:
            raise PermissionError(**error_args)
        elif status_code == 404:
            raise NotFoundError(**error_args)
        elif status_code == 429:
            raise RateLimitError(**error_args)
        elif 500 <= status_code < 600:
            raise ServerError(**error_args)
        else:
            raise APIError(**error_args)

    def request(self, method, path, params=None, data=None, headers=None):
        """Makes an HTTP request."""
        url = f"{self.base_url}/{path.lstrip('/')}"
        request_headers = self.session.headers.copy()
        if headers:
            request_headers.update(headers)

        try:
            response = self.session.request(
                method=method.upper(),
                url=url,
                params=params,
                json=data,  # requests automatically handles JSON encoding
                headers=request_headers,
                timeout=self.timeout
            )
            return self._handle_response(response)
        except requests.exceptions.Timeout as e:
            raise VeltrixError(f"Request timed out: {e}")
        except requests.exceptions.RequestException as e:
            raise VeltrixError(f"An error occurred during the request: {e}")

    def get(self, path, params=None, headers=None):
        return self.request("GET", path, params=params, headers=headers)

    def post(self, path, data=None, params=None, headers=None):
        return self.request("POST", path, params=params, data=data, headers=headers)

    def put(self, path, data=None, params=None, headers=None):
        return self.request("PUT", path, params=params, data=data, headers=headers)

    def delete(self, path, params=None, headers=None):
        # DELETE requests might not return JSON, handle potential 204 No Content
        url = f"{self.base_url}/{path.lstrip('/')}"
        request_headers = self.session.headers.copy()
        if headers:
            request_headers.update(headers)

        try:
            response = self.session.request(
                method="DELETE",
                url=url,
                params=params,
                headers=request_headers,
                timeout=self.timeout
            )
            if response.status_code == 204:
                return None  # Successfully deleted, no content to parse
            return self._handle_response(response)  # Handle other statuses/errors
        except requests.exceptions.Timeout as e:
            raise VeltrixError(f"Request timed out: {e}")
        except requests.exceptions.RequestException as e:
            raise VeltrixError(f"An error occurred during the request: {e}")

    def patch(self, path, data=None, params=None, headers=None):
        return self.request("PATCH", path, params=params, data=data, headers=headers)
