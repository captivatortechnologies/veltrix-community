# -*- coding: utf-8 -*-

from .base import BaseResource


class ProfileResource(BaseResource):
    """Handles the authenticated user's own profile and settings.

    Maps to ``/api/profile`` and ``/api/profile/settings`` on the Community
    Edition server.
    """
    RESOURCE_PATH = "profile"

    def get(self, **kwargs):
        """Retrieves the authenticated user's profile (GET /api/profile)."""
        return self._list(**kwargs)

    def update(self, name=None, organization=None, phone=None, location=None,
               bio=None, avatar_url=None, **kwargs):
        """Updates the authenticated user's profile (PUT /api/profile)."""
        data = {
            "name": name,
            "organization": organization,
            "phone": phone,
            "location": location,
            "bio": bio,
            "avatarUrl": avatar_url,
        }
        data = {k: v for k, v in data.items() if v is not None}
        return self._http_client.put(self._get_path(), data=data, **kwargs)

    def get_settings(self, **kwargs):
        """Retrieves the authenticated user's settings (GET /api/profile/settings)."""
        path = f"{self.RESOURCE_PATH}/settings"
        return self._http_client.get(path, **kwargs)

    def update_settings(self, notifications=None, two_factor_enabled=None, **kwargs):
        """Updates the authenticated user's settings (PUT /api/profile/settings)."""
        data = {
            "notifications": notifications,
            "twoFactorEnabled": two_factor_enabled,
        }
        data = {k: v for k, v in data.items() if v is not None}
        path = f"{self.RESOURCE_PATH}/settings"
        return self._http_client.put(path, data=data, **kwargs)
