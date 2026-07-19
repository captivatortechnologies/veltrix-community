# -*- coding: utf-8 -*-

class VeltrixError(Exception):
    """Base exception class for Veltrix SDK errors."""
    def __init__(self, message=None, http_body=None, http_status=None, json_body=None, headers=None):
        super(VeltrixError, self).__init__(message)
        self.message = message
        self.http_body = http_body
        self.http_status = http_status
        self.json_body = json_body
        self.headers = headers or {}
        self.request_id = self.headers.get("request-id", None)

    def __str__(self):
        msg = self.message or "<empty message>"
        if self.request_id:
            return f"Request {self.request_id}: {msg}"
        else:
            return msg

    def __repr__(self):
        return f"{self.__class__.__name__}(message={self.message!r}, http_status={self.http_status!r})"


class APIError(VeltrixError):
    """Raised when the API returns an error."""
    pass


class AuthenticationError(VeltrixError):
    """Raised for authentication errors (401)."""
    pass


class PermissionError(VeltrixError):
    """Raised for permission errors (403)."""
    pass


class NotFoundError(VeltrixError):
    """Raised when a resource is not found (404)."""
    pass


class RateLimitError(VeltrixError):
    """Raised when the rate limit is exceeded (429)."""
    pass


class BadRequestError(VeltrixError):
    """Raised for bad requests (400)."""
    pass


class ServerError(VeltrixError):
    """Raised for server errors (5xx)."""
    pass
