# -*- coding: utf-8 -*-

from .base import BaseResource

class EnvironmentsResource(BaseResource):
    """Handles operations related to environments.

    Environments are deployment targets used by the pipeline engine (e.g.
    ``dev``, ``staging``, ``production``).

    Note:
        The base route (``/api/environments``) matches the Community Edition
        server surface. The method surface below follows standard REST
        conventions; verify method-level shapes against the server as the
        OSS API stabilizes.
    """
    RESOURCE_PATH = "environments"

    def list(self, **kwargs):
        """Retrieves all environments for the authenticated organization."""
        return self._list(**kwargs)

    def get(self, environment_id, **kwargs):
        """Retrieves a specific environment by its ID."""
        return self._get(resource_id=environment_id, **kwargs)

    def create(self, name, description=None, **kwargs):
        """Creates a new environment."""
        data = {"name": name, "description": description}
        data = {k: v for k, v in data.items() if v is not None}
        return self._create(data=data, **kwargs)

    def update(self, environment_id, name=None, description=None, **kwargs):
        """Updates an existing environment."""
        data = {"name": name, "description": description}
        data = {k: v for k, v in data.items() if v is not None}
        return self._update(resource_id=environment_id, data=data, **kwargs)

    def delete(self, environment_id, **kwargs):
        """Deletes an environment by its ID."""
        return self._delete(resource_id=environment_id, **kwargs)
