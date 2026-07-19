# -*- coding: utf-8 -*-

from .base import BaseResource


class SandboxesResource(BaseResource):
    """Handles developer sandboxes (``/api/sandboxes``).

    Note:
        Sandboxes power the Veltrix CLI dev mode and are gated behind the
        ``platform.sandbox`` feature flag (off by default; every route returns
        404 while disabled). Only the core CRUD surface is exposed here; the
        richer file-sync / run endpoints are intentionally left out as
        *provisional* until the OSS API stabilizes.
    """
    RESOURCE_PATH = "sandboxes"

    def list(self, **kwargs):
        """Lists sandboxes for the authenticated tenant (GET /api/sandboxes)."""
        return self._list(**kwargs)

    def get(self, sandbox_id, **kwargs):
        """Retrieves a sandbox by ID (GET /api/sandboxes/{id})."""
        return self._get(resource_id=sandbox_id, **kwargs)

    def create(self, data, **kwargs):
        """Creates a sandbox (POST /api/sandboxes)."""
        return self._create(data=data, **kwargs)

    def delete(self, sandbox_id, **kwargs):
        """Deletes a sandbox by ID (DELETE /api/sandboxes/{id})."""
        return self._delete(resource_id=sandbox_id, **kwargs)
