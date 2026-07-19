# -*- coding: utf-8 -*-

from .base import BaseResource


class ConfigurationCanvasResource(BaseResource):
    """Handles the configuration canvas (``/api/configuration-canvas``).

    The configuration canvas is the visual authoring surface where security
    configuration (sections, fields) is composed, versioned, reviewed and
    approved before it flows through the pipeline.
    """
    RESOURCE_PATH = "configuration-canvas"

    def list(self, params=None, **kwargs):
        """Lists canvases (GET /).

        Optional ``params``: toolType, entityType, status, page, limit,
        sortBy, sortOrder.
        """
        return self._list(params=params, **kwargs)

    def get(self, canvas_id, **kwargs):
        """Gets a single canvas (GET /{id})."""
        return self._get(resource_id=canvas_id, **kwargs)

    def create(self, data, **kwargs):
        """Creates a canvas (POST /). ``data`` requires name, toolType, entityType."""
        return self._create(data=data, **kwargs)

    def update(self, canvas_id, data, **kwargs):
        """Updates a canvas (PUT /{id})."""
        return self._update(resource_id=canvas_id, data=data, **kwargs)

    def delete(self, canvas_id, **kwargs):
        """Deletes a canvas -- draft or archived only (DELETE /{id})."""
        return self._delete(resource_id=canvas_id, **kwargs)

    def update_status(self, canvas_id, data, **kwargs):
        """Updates canvas status for the approval workflow (PATCH /{id}/status).

        ``data`` requires ``status`` and accepts an optional ``comment``.
        """
        return self._action(resource_id=canvas_id, action="status", method="PATCH", data=data, **kwargs)

    def get_history(self, canvas_id, params=None, **kwargs):
        """Version history of a canvas (GET /{id}/history)."""
        return self._http_client.get(f"{self.RESOURCE_PATH}/{canvas_id}/history", params=params, **kwargs)

    def duplicate(self, canvas_id, data, **kwargs):
        """Duplicates a canvas (POST /{id}/duplicate). ``data`` requires ``name``."""
        return self._action(resource_id=canvas_id, action="duplicate", method="POST", data=data, **kwargs)

    def export(self, canvas_id, **kwargs):
        """Exports a canvas as JSON (GET /{id}/export)."""
        return self._http_client.get(f"{self.RESOURCE_PATH}/{canvas_id}/export", **kwargs)

    def get_version(self, canvas_id, history_id, **kwargs):
        """Gets a specific version entry (GET /{id}/versions/{historyId})."""
        return self._http_client.get(f"{self.RESOURCE_PATH}/{canvas_id}/versions/{history_id}", **kwargs)

    def restore_version(self, canvas_id, history_id, **kwargs):
        """Restores a canvas to a previous version -- draft only (POST /{id}/versions/{historyId}/restore)."""
        return self._http_client.post(f"{self.RESOURCE_PATH}/{canvas_id}/versions/{history_id}/restore", **kwargs)

    def compare_versions(self, canvas_id, params, **kwargs):
        """Compares two versions (GET /{id}/compare).

        ``params`` requires ``historyId1`` and ``historyId2``.
        """
        return self._http_client.get(f"{self.RESOURCE_PATH}/{canvas_id}/compare", params=params, **kwargs)

    def label_version(self, canvas_id, history_id, data, **kwargs):
        """Labels/comments a version (PATCH /{id}/versions/{historyId}/label). ``data`` requires ``label``."""
        return self._http_client.patch(f"{self.RESOURCE_PATH}/{canvas_id}/versions/{history_id}/label", data=data, **kwargs)

    def submit_for_approval(self, canvas_id, data, **kwargs):
        """Submits a canvas for approval (POST /{id}/submit-for-approval).

        ``data`` requires ``approverIds`` and accepts ``environmentTagIds`` and ``comment``.
        """
        return self._action(resource_id=canvas_id, action="submit-for-approval", method="POST", data=data, **kwargs)

    def get_approvals(self, canvas_id, **kwargs):
        """Approval status for a canvas (GET /{id}/approvals)."""
        return self._http_client.get(f"{self.RESOURCE_PATH}/{canvas_id}/approvals", **kwargs)

    def approve(self, canvas_id, data=None, **kwargs):
        """Approves a canvas as an assigned approver (POST /{id}/approve). ``data`` accepts ``comment``."""
        return self._action(resource_id=canvas_id, action="approve", method="POST", data=data, **kwargs)

    def reject(self, canvas_id, data, **kwargs):
        """Rejects a canvas as an assigned approver (POST /{id}/reject). ``data`` requires ``reason``."""
        return self._action(resource_id=canvas_id, action="reject", method="POST", data=data, **kwargs)

    def get_comments(self, canvas_id, params=None, **kwargs):
        """Threaded review comments for a canvas (GET /{id}/comments). Optional ``params``: historyId."""
        return self._http_client.get(f"{self.RESOURCE_PATH}/{canvas_id}/comments", params=params, **kwargs)

    def add_comment(self, canvas_id, data, **kwargs):
        """Adds a review comment (POST /{id}/comments).

        ``data`` requires ``body`` and accepts ``historyId`` and ``parentId``.
        """
        return self._action(resource_id=canvas_id, action="comments", method="POST", data=data, **kwargs)

    def update_comment(self, canvas_id, comment_id, data, **kwargs):
        """Updates a review comment (PATCH /{id}/comments/{commentId}). ``data`` accepts ``body`` and ``resolved``."""
        return self._http_client.patch(f"{self.RESOURCE_PATH}/{canvas_id}/comments/{comment_id}", data=data, **kwargs)

    def delete_comment(self, canvas_id, comment_id, **kwargs):
        """Deletes a review comment (DELETE /{id}/comments/{commentId})."""
        return self._http_client.delete(f"{self.RESOURCE_PATH}/{canvas_id}/comments/{comment_id}", **kwargs)
