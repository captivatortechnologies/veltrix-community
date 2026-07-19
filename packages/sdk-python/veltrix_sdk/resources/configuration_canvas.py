# -*- coding: utf-8 -*-

from .base import BaseResource

class ConfigurationCanvasResource(BaseResource):
    """Handles operations related to the configuration canvas.

    The configuration canvas is the visual authoring surface where security
    configuration (sections, fields) is composed before it flows through the
    pipeline.

    Note:
        The base route (``/api/configuration-canvas``) matches the Community
        Edition server surface. The method surface below follows standard REST
        conventions; verify method-level shapes against the server as the OSS
        API stabilizes.
    """
    RESOURCE_PATH = "configuration-canvas"

    def list(self, **kwargs):
        """Retrieves configuration canvases for the authenticated organization."""
        return self._list(**kwargs)

    def get(self, canvas_id, **kwargs):
        """Retrieves a specific configuration canvas by its ID."""
        return self._get(resource_id=canvas_id, **kwargs)

    def create(self, data, **kwargs):
        """Creates a new configuration canvas from the given payload."""
        return self._create(data=data, **kwargs)

    def update(self, canvas_id, data, **kwargs):
        """Updates an existing configuration canvas."""
        return self._update(resource_id=canvas_id, data=data, **kwargs)

    def delete(self, canvas_id, **kwargs):
        """Deletes a configuration canvas by its ID."""
        return self._delete(resource_id=canvas_id, **kwargs)
