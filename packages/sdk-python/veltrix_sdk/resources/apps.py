# -*- coding: utf-8 -*-

from .base import BaseResource

class AppsResource(BaseResource):
    """Handles operations related to platform apps.

    Apps are the pluggable security tools that extend the platform via the app
    engine (marketplace listing, installation, configuration).

    Note:
        The base route (``/api/apps``) matches the Community Edition server
        surface. The method surface below follows standard REST conventions;
        verify method-level shapes (installation / configuration sub-actions)
        against the server as the OSS API stabilizes.
    """
    RESOURCE_PATH = "apps"

    def list(self, **kwargs):
        """Retrieves the available / installed apps."""
        return self._list(**kwargs)

    def get(self, app_id, **kwargs):
        """Retrieves a specific app by its ID."""
        return self._get(resource_id=app_id, **kwargs)

    def create(self, data, **kwargs):
        """Registers a new app from the given payload."""
        return self._create(data=data, **kwargs)

    def update(self, app_id, data, **kwargs):
        """Updates an existing app."""
        return self._update(resource_id=app_id, data=data, **kwargs)

    def delete(self, app_id, **kwargs):
        """Removes an app by its ID."""
        return self._delete(resource_id=app_id, **kwargs)
