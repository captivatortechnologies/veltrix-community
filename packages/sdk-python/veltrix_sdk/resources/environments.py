# -*- coding: utf-8 -*-

from .base import BaseResource


class EnvironmentsResource(BaseResource):
    """Handles deployment environments (``/api/environments``).

    Environments are deployment targets used by the pipeline engine (e.g.
    ``dev``, ``staging``, ``production``). They are Tag-backed and carry an
    ownership + a per-environment deployment policy. There is no
    single-environment GET route; read the full set via :meth:`list`.
    """
    RESOURCE_PATH = "environments"

    def list(self, **kwargs):
        """Lists environments with ownership, policy and usage counts (GET /)."""
        return self._list(**kwargs)

    def create(self, name, owner_id=None, **kwargs):
        """Creates an environment (POST / -- body: {name, ownerId?})."""
        data = {"name": name}
        if owner_id is not None:
            data["ownerId"] = owner_id
        return self._create(data=data, **kwargs)

    def update(self, environment_id, name=None, owner_id=None, **kwargs):
        """Updates an environment's name / owner (PUT /{id})."""
        data = {"name": name, "ownerId": owner_id}
        data = {k: v for k, v in data.items() if v is not None}
        return self._update(resource_id=environment_id, data=data, **kwargs)

    def delete(self, environment_id, **kwargs):
        """Deletes an environment (DELETE /{id})."""
        return self._delete(resource_id=environment_id, **kwargs)

    def get_policy(self, environment_id, **kwargs):
        """Gets an environment's deployment policy (GET /{id}/policy)."""
        return self._http_client.get(f"{self.RESOURCE_PATH}/{environment_id}/policy", **kwargs)

    def update_policy(self, environment_id, data, **kwargs):
        """Creates/updates an environment's deployment policy (PUT /{id}/policy)."""
        return self._http_client.put(f"{self.RESOURCE_PATH}/{environment_id}/policy", data=data, **kwargs)
