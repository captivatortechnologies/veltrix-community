# -*- coding: utf-8 -*-

from .base import BaseResource


class SandboxesResource(BaseResource):
    """Handles developer sandboxes (``/api/sandboxes``).

    Sandboxes power the Veltrix CLI dev mode: an isolated, per-tenant workspace
    that syncs app sources, edits individual files, scaffolds config types, and
    runs pipeline handlers in an isolated runner.

    Note:
        The whole module is gated behind the ``platform.sandbox`` feature flag
        (off by default): every route returns 404 while it is disabled. The two
        binary-transport routes (GET /:id/client.mjs, PUT /:id/sync/files -- raw
        JS / tar.gz) are intentionally not wrapped here.
    """
    RESOURCE_PATH = "sandboxes"

    def list(self, **kwargs):
        """Lists sandboxes for the tenant (GET /)."""
        return self._list(**kwargs)

    def get(self, sandbox_id, **kwargs):
        """Gets a sandbox with its live manifest summary once synced (GET /{id})."""
        return self._get(resource_id=sandbox_id, **kwargs)

    def create(self, data, **kwargs):
        """Creates a sandbox (POST / -- body: {name, appId})."""
        return self._create(data=data, **kwargs)

    def delete(self, sandbox_id, **kwargs):
        """Deletes a sandbox record + its synced files (DELETE /{id})."""
        return self._delete(resource_id=sandbox_id, **kwargs)

    def list_files(self, sandbox_id, params=None, **kwargs):
        """Lists synced files, paginated (GET /{id}/files). Optional ``params``: limit, offset."""
        return self._http_client.get(f"{self.RESOURCE_PATH}/{sandbox_id}/files", params=params, **kwargs)

    def get_file(self, sandbox_id, file_path, **kwargs):
        """Reads one synced file's content (GET /{id}/file?path=...)."""
        return self._http_client.get(f"{self.RESOURCE_PATH}/{sandbox_id}/file", params={"path": file_path}, **kwargs)

    def write_file(self, sandbox_id, data, **kwargs):
        """Creates/overwrites one file (PUT /{id}/file).

        ``data`` requires ``path``, ``content`` and ``encoding`` ('utf8' or
        'base64'); pass ``expectedSha256`` for optimistic concurrency.
        """
        return self._http_client.put(f"{self.RESOURCE_PATH}/{sandbox_id}/file", data=data, **kwargs)

    def delete_file(self, sandbox_id, file_path, **kwargs):
        """Deletes one synced file (DELETE /{id}/file?path=...)."""
        return self._http_client.delete(f"{self.RESOURCE_PATH}/{sandbox_id}/file", params={"path": file_path}, **kwargs)

    def add_config_type(self, sandbox_id, data, **kwargs):
        """Scaffolds a new configuration type into the synced app (POST /{id}/config-types).

        ``data`` requires ``id`` and accepts ``name`` and ``componentTypes``.
        """
        return self._http_client.post(f"{self.RESOURCE_PATH}/{sandbox_id}/config-types", data=data, **kwargs)

    def sync_manifest(self, sandbox_id, manifest, **kwargs):
        """Computes a sync manifest diff -- step 1 of a CLI sync (POST /{id}/sync/manifest).

        ``manifest`` is a list of ``{path, sha256, size}`` entries; the server
        answers which files to upload and which to delete.
        """
        return self._http_client.post(f"{self.RESOURCE_PATH}/{sandbox_id}/sync/manifest", data=manifest, **kwargs)

    def run(self, sandbox_id, data, **kwargs):
        """Runs a synced pipeline handler in the isolated runner (POST /{id}/run).

        ``data`` requires ``configTypeId`` and ``handler`` and accepts
        ``canvas`` and ``componentId``.
        """
        return self._http_client.post(f"{self.RESOURCE_PATH}/{sandbox_id}/run", data=data, **kwargs)
