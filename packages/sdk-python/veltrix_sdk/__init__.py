# -*- coding: utf-8 -*-

"""
Veltrix Python SDK
~~~~~~~~~~~~~~~~~~

A lightweight ``requests``-based client for the Veltrix API — the
Security-as-Code platform (Community Edition).

Basic usage:

    from veltrix_sdk import VeltrixClient

    client = VeltrixClient(api_key="YOUR_API_KEY", base_url="http://localhost:5000/api")
    roles = client.roles.list()

:copyright: (c) 2026 The Veltrix Community Edition contributors.
:license: MIT, see LICENSE for more details.
"""

__version__ = "0.1.0"

from .client import VeltrixClient
from .exceptions import (
    VeltrixError,
    APIError,
    AuthenticationError,
    PermissionError,
    NotFoundError,
    RateLimitError,
    BadRequestError,
    ServerError,
)

# Configure a null handler so importing the SDK never emits log output
# unless the host application opts in.
import logging
logging.getLogger(__name__).addHandler(logging.NullHandler())

__all__ = [
    "VeltrixClient",
    "VeltrixError",
    "APIError",
    "AuthenticationError",
    "PermissionError",
    "NotFoundError",
    "RateLimitError",
    "BadRequestError",
    "ServerError",
    "__version__",
]
