# -*- coding: utf-8 -*-

from .base import BaseResource

class OrganizationResource(BaseResource):
    """Handles operations related to the organization details.

    In the Community Edition the platform is single-tenant: there is one
    organization, and this resource reads and updates its details. (This
    replaces the multi-tenant ``customers`` resource from the hosted product.)
    """
    # Note: The API path is /api/organization/
    RESOURCE_PATH = "organization"

    def get(self, **kwargs):
        """
        Retrieves the organization details associated with the authenticated user.

        Args:
            **kwargs: Additional keyword arguments for the request.

        Returns:
            dict: The organization details object.
        """
        # Corresponds to GET /api/organization/
        # Uses the base path, so _list() which maps to GET on base path works
        return self._list(**kwargs)

    def update(self, name=None, website=None, phone=None, email=None, address=None, city=None, state=None, zip_code=None, country=None, industry=None, description=None, logo=None, **kwargs):
        """
        Updates the organization details associated with the authenticated user.

        Args:
            name (str, optional): New name for the organization.
            website (str, optional): New website URL.
            phone (str, optional): New phone number.
            email (str, optional): New contact email.
            address (str, optional): New street address.
            city (str, optional): New city.
            state (str, optional): New state/province.
            zip_code (str, optional): New zip/postal code.
            country (str, optional): New country.
            industry (str, optional): New industry.
            description (str, optional): New description.
            logo (str, optional): New logo URL or base64 data (check API spec for format).
            **kwargs: Additional keyword arguments for the request.

        Returns:
            dict: The updated organization details object.
        """
        # Corresponds to PUT /api/organization/
        data = {
            "name": name,
            "website": website,
            "phone": phone,
            "email": email,
            "address": address,
            "city": city,
            "state": state,
            "zipCode": zip_code,  # Note camelCase from spec
            "country": country,
            "industry": industry,
            "description": description,
            "logo": logo,
        }
        data = {k: v for k, v in data.items() if v is not None}
        # Uses the base path
        path = self._get_path()
        return self._http_client.put(path, data=data, **kwargs)
