# -*- coding: utf-8 -*-

from .base import BaseResource

class TagsResource(BaseResource):
    """Handles operations related to tags, scoped to the authenticated organization."""
    RESOURCE_PATH = "tags"

    def list(self, **kwargs):
        """
        Retrieves all tags for the authenticated organization.

        Args:
            **kwargs: Additional keyword arguments for the request.

        Returns:
            list: A list of tag objects.
        """
        return self._list(**kwargs)

    def create(self, name, color=None, description=None, **kwargs):
        """
        Creates a new tag for the authenticated organization.

        Args:
            name (str): The name of the tag.
            color (str, optional): Hex color code for the tag. Defaults to None.
            description (str, optional): Description for the tag. Defaults to None.
            **kwargs: Additional keyword arguments for the request.

        Returns:
            dict: The newly created tag object.
        """
        data = {
            "name": name,
            "color": color,
            "description": description,
        }
        data = {k: v for k, v in data.items() if v is not None}
        return self._create(data=data, **kwargs)

    def get(self, tag_id, **kwargs):
        """
        Retrieves a specific tag by its ID.

        Args:
            tag_id (str): The ID of the tag to retrieve.
            **kwargs: Additional keyword arguments for the request.

        Returns:
            dict: The tag object.
        """
        return self._get(resource_id=tag_id, **kwargs)

    def update(self, tag_id, name=None, color=None, description=None, **kwargs):
        """
        Updates an existing tag for the authenticated organization.

        Args:
            tag_id (str): The ID of the tag to update.
            name (str, optional): New name for the tag.
            color (str, optional): New hex color code for the tag.
            description (str, optional): New description for the tag.
            **kwargs: Additional keyword arguments for the request.

        Returns:
            dict: The updated tag object.
        """
        data = {
            "name": name,
            "color": color,
            "description": description,
        }
        data = {k: v for k, v in data.items() if v is not None}
        return self._update(resource_id=tag_id, data=data, **kwargs)

    def delete(self, tag_id, **kwargs):
        """
        Deletes a tag for the authenticated organization.

        Args:
            tag_id (str): The ID of the tag to delete.
            **kwargs: Additional keyword arguments for the request.

        Returns:
            None: Returns None on successful (204 No Content) deletion.
        """
        return self._delete(resource_id=tag_id, **kwargs)
