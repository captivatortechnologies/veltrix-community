# -*- coding: utf-8 -*-

from .base import BaseResource

class PipelineResource(BaseResource):
    """Handles operations related to the deployment pipeline.

    The pipeline engine drives every security configuration change through
    author -> validate -> approve -> deploy (direct / rolling / canary /
    blue-green) -> monitor -> drift-detect. Deployments are the primary
    entities exposed here.

    Note:
        The base route (``/api/pipeline``) matches the Community Edition server
        surface. The method surface below follows standard REST conventions;
        verify method-level shapes (and any strategy/approval sub-actions)
        against the server as the OSS API stabilizes.
    """
    RESOURCE_PATH = "pipeline"

    def list_deployments(self, params=None, **kwargs):
        """Retrieves pipeline deployments, optionally filtered via ``params``."""
        path = f"{self.RESOURCE_PATH}/deployments"
        return self._http_client.get(path, params=params, **kwargs)

    def get_deployment(self, deployment_id, **kwargs):
        """Retrieves a specific deployment by its ID."""
        path = f"{self.RESOURCE_PATH}/deployments/{deployment_id}"
        return self._http_client.get(path, **kwargs)

    def create_deployment(self, data, **kwargs):
        """Creates (triggers) a new deployment from the given payload."""
        path = f"{self.RESOURCE_PATH}/deployments"
        return self._http_client.post(path, data=data, **kwargs)
