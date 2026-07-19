# -*- coding: utf-8 -*-

from .base import BaseResource


class PipelineResource(BaseResource):
    """Handles the deployment pipeline (``/api/pipeline``).

    The pipeline engine drives every approved configuration canvas through
    deploy -> monitor -> drift-detect. Deployments are created by deploying a
    canvas (there is no standalone "create deployment" endpoint); every other
    operation acts on an existing canvas or deployment.
    """
    RESOURCE_PATH = "pipeline"

    def validate_canvas(self, canvas_id, **kwargs):
        """Runs the app validator against a canvas (POST /canvas/{id}/validate)."""
        return self._http_client.post(f"{self.RESOURCE_PATH}/canvas/{canvas_id}/validate", **kwargs)

    def deploy_canvas(self, canvas_id, data, **kwargs):
        """Queues a deployment of an approved canvas to a target environment.

        POST /canvas/{id}/deploy -- ``data`` requires ``environmentId`` and
        accepts an optional ``strategy``.
        """
        return self._http_client.post(f"{self.RESOURCE_PATH}/canvas/{canvas_id}/deploy", data=data, **kwargs)

    def list_canvas_deployments(self, canvas_id, params=None, **kwargs):
        """Deployment history for a canvas (GET /canvas/{id}/deployments)."""
        return self._http_client.get(f"{self.RESOURCE_PATH}/canvas/{canvas_id}/deployments", params=params, **kwargs)

    def get_deployment(self, deployment_id, **kwargs):
        """Detailed status of a deployment (GET /deployments/{id})."""
        return self._http_client.get(f"{self.RESOURCE_PATH}/deployments/{deployment_id}", **kwargs)

    def rollback_deployment(self, deployment_id, data, **kwargs):
        """Rolls a deployment back to the previous version.

        POST /deployments/{id}/rollback -- ``data`` requires ``reason``.
        """
        return self._http_client.post(f"{self.RESOURCE_PATH}/deployments/{deployment_id}/rollback", data=data, **kwargs)

    def pause_deployment(self, deployment_id, **kwargs):
        """Pauses an in-progress (canary/rolling) deployment (POST /deployments/{id}/pause)."""
        return self._http_client.post(f"{self.RESOURCE_PATH}/deployments/{deployment_id}/pause", **kwargs)

    def resume_deployment(self, deployment_id, **kwargs):
        """Resumes a paused deployment (POST /deployments/{id}/resume)."""
        return self._http_client.post(f"{self.RESOURCE_PATH}/deployments/{deployment_id}/resume", **kwargs)

    def promote_deployment(self, deployment_id, data, **kwargs):
        """Promotes a successful deployment to the next environment.

        POST /deployments/{id}/promote -- ``data`` requires ``targetEnvironmentId``.
        """
        return self._http_client.post(f"{self.RESOURCE_PATH}/deployments/{deployment_id}/promote", data=data, **kwargs)

    def get_summary(self, **kwargs):
        """Pipeline dashboard metrics for the customer (GET /summary)."""
        return self._http_client.get(f"{self.RESOURCE_PATH}/summary", **kwargs)

    def get_environment_matrix(self, **kwargs):
        """Matrix of canvases and their deployment status per environment (GET /environment-matrix)."""
        return self._http_client.get(f"{self.RESOURCE_PATH}/environment-matrix", **kwargs)

    def list_drift(self, params=None, **kwargs):
        """Drift-detection records for the customer (GET /drift)."""
        return self._http_client.get(f"{self.RESOURCE_PATH}/drift", params=params, **kwargs)

    def resolve_drift(self, drift_id, data, **kwargs):
        """Acknowledges and resolves a drift record.

        POST /drift/{id}/resolve -- ``data`` requires ``action``.
        """
        return self._http_client.post(f"{self.RESOURCE_PATH}/drift/{drift_id}/resolve", data=data, **kwargs)
