import React, { useState, useEffect } from 'react';
import { getOrganization, updateOrganization, OrganizationDetails } from '../../services/organizationService';

const OrganizationPage: React.FC = () => {
  const [organization, setOrganization] = useState<OrganizationDetails>({
    name: '',
    shortName: '',
    website: '',
    phone: '',
    email: '',
    address: '',
    city: '',
    state: '',
    zipCode: '',
    country: '',
    industry: '',
    description: '',
    logo: '',
  });

  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<OrganizationDetails>(organization);
  const [isSaving, setIsSaving] = useState(false);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchOrganizationData = async () => {
      try {
        setError(null);
        const data = await getOrganization();
        setOrganization(data);
        setFormData(data);
      } catch (err) {
        console.error('Error fetching organization data:', err);
        setError('Failed to load organization data. Please try again later.');
      }
    };
    
    fetchOrganizationData();
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setLogoPreview(reader.result as string);
        setFormData({ ...formData, logo: reader.result as string });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setError(null);
    
    try {
      const updatedOrganization = await updateOrganization(formData);
      setOrganization(updatedOrganization);
      setIsEditing(false);
    } catch (err) {
      console.error('Error updating organization:', err);
      setError('Failed to update organization. Please try again later.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setFormData(organization);
    setLogoPreview(null);
    setIsEditing(false);
  };

  return (
    <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Organization Information</h1>
        {!isEditing ? (
          <button
            onClick={() => setIsEditing(true)}
            className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded"
          >
            Edit Information
          </button>
        ) : null}
      </div>

      {error && (
        <div className="bg-red-100 dark:bg-red-900/30 border-l-4 border-red-500 text-red-700 dark:text-red-300 p-4 rounded mb-6" role="alert">
          <p>{error}</p>
        </div>
      )}

      {isEditing ? (
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Organization Name
              </label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border rounded text-gray-900 bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Shortname
              </label>
              <input
                type="text"
                name="shortName"
                value={formData.shortName ?? ''}
                onChange={handleInputChange}
                placeholder="e.g. acme-prod"
                pattern="[a-z0-9][a-z0-9-]{0,29}[a-z0-9]"
                className="w-full px-3 py-2 border rounded text-gray-900 bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                A unique, human-readable identifier (lowercase letters, numbers and hyphens) used to tag your
                provisioned cloud resources. Leave blank to use your account ID.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Website
              </label>
              <input
                type="url"
                name="website"
                value={formData.website ?? ''}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border rounded text-gray-900 bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Phone
              </label>
              <input
                type="tel"
                name="phone"
                value={formData.phone ?? ''}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border rounded text-gray-900 bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Email
              </label>
              <input
                type="email"
                name="email"
                value={formData.email ?? ''}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border rounded text-gray-900 bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                required
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Address
              </label>
              <input
                type="text"
                name="address"
                value={formData.address ?? ''}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border rounded text-gray-900 bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                City
              </label>
              <input
                type="text"
                name="city"
                value={formData.city ?? ''}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border rounded text-gray-900 bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                State/Province
              </label>
              <input
                type="text"
                name="state"
                value={formData.state ?? ''}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border rounded text-gray-900 bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                ZIP/Postal Code
              </label>
              <input
                type="text"
                name="zipCode"
                value={formData.zipCode ?? ''}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border rounded text-gray-900 bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Country
              </label>
              <input
                type="text"
                name="country"
                value={formData.country ?? ''}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border rounded text-gray-900 bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Industry
              </label>
              <input
                type="text"
                name="industry"
                value={formData.industry ?? ''}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border rounded text-gray-900 bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              />
            </div>
            
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Description
              </label>
              <textarea
                name="description"
                value={formData.description ?? ''}
                onChange={handleInputChange}
                rows={3}
                className="w-full px-3 py-2 border rounded text-gray-900 bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              />
            </div>
            
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Logo
              </label>
              <input
                type="file"
                accept="image/*"
                onChange={handleLogoChange}
                className="w-full px-3 py-2 border rounded text-gray-900 bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              />
              {logoPreview && (
                <div className="mt-2">
                  <img src={logoPreview} alt="Logo Preview" className="h-20 object-contain" />
                </div>
              )}
            </div>
          </div>
          
          <div className="flex justify-end space-x-3">
            <button
              type="button"
              onClick={handleCancel}
              className="px-4 py-2 border rounded text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded flex items-center"
            >
              {isSaving ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Saving...
                </>
              ) : (
                'Save Changes'
              )}
            </button>
          </div>
        </form>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Organization Name</h3>
              <p className="mt-1 text-sm text-gray-900 dark:text-gray-100">{organization.name}</p>
            </div>

            <div>
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Shortname</h3>
              <p className="mt-1 text-sm text-gray-900 dark:text-gray-100">
                {organization.shortName || <span className="text-gray-400">Not set</span>}
              </p>
            </div>

            <div>
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Website</h3>
              <p className="mt-1 text-sm text-gray-900 dark:text-gray-100">
                <a href={organization.website ?? undefined} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">
                  {organization.website}
                </a>
              </p>
            </div>
            
            <div>
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Phone</h3>
              <p className="mt-1 text-sm text-gray-900 dark:text-gray-100">{organization.phone}</p>
            </div>
            
            <div>
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Email</h3>
              <p className="mt-1 text-sm text-gray-900 dark:text-gray-100">
                <a href={`mailto:${organization.email}`} className="text-blue-500 hover:underline">
                  {organization.email}
                </a>
              </p>
            </div>
            
            <div>
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Address</h3>
              <p className="mt-1 text-sm text-gray-900 dark:text-gray-100">
                {organization.address}<br />
                {organization.city}, {organization.state} {organization.zipCode}<br />
                {organization.country}
              </p>
            </div>
            
            <div>
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Industry</h3>
              <p className="mt-1 text-sm text-gray-900 dark:text-gray-100">{organization.industry}</p>
            </div>
            
            <div className="md:col-span-2">
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Description</h3>
              <p className="mt-1 text-sm text-gray-900 dark:text-gray-100">{organization.description}</p>
            </div>
            
            {organization.logo && (
              <div>
                <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Logo</h3>
                <div className="mt-1">
                  <img src={organization.logo} alt="Organization Logo" className="h-20 object-contain" />
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default OrganizationPage;
