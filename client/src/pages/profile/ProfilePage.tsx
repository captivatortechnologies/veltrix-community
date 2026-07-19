import React, { useState, useEffect } from 'react';
import { User, Mail, Building, Phone, MapPin, Calendar, Edit2, Save, X } from 'lucide-react';
import { getProfile, updateProfile, UserProfile } from '../../services/profileService';

const ProfilePage: React.FC = () => {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editedProfile, setEditedProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    const fetchProfile = async () => {
      setIsLoading(true);
      try {
        const profileData = await getProfile();
        setProfile(profileData);
        setEditedProfile(profileData);
      } catch (err) {
        console.error('Error fetching profile:', err);
        setError('Failed to load profile. Please try again later.');
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchProfile();
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    
    if (editedProfile) {
      setEditedProfile({
        ...editedProfile,
        [name]: value
      });
    }
  };

  const handleSave = async () => {
    if (!editedProfile) return;
    
    setIsLoading(true);
    try {
      // Only send the fields that can be updated
      const updatedProfile = await updateProfile({
        name: editedProfile.name,
        organization: editedProfile.organization,
        phone: editedProfile.phone,
        location: editedProfile.location,
        bio: editedProfile.bio,
        avatarUrl: editedProfile.avatarUrl
      });
      
      setProfile(updatedProfile);
      setIsEditing(false);
      setSuccessMessage('Profile updated successfully!');
      
      // Clear success message after 3 seconds
      setTimeout(() => {
        setSuccessMessage(null);
      }, 3000);
    } catch (err) {
      console.error('Error updating profile:', err);
      setError('Failed to update profile. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    setEditedProfile(profile);
    setIsEditing(false);
  };

  if (isLoading && !profile) {
    return (
      <div className="flex justify-center items-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (error && !profile) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-6" role="alert">
          <p>{error}</p>
        </div>
      </div>
    );
  }

  if (!profile) {
    return null;
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">My Profile</h1>
      
      {successMessage && (
        <div className="bg-green-100 border-l-4 border-green-500 text-green-700 p-4 mb-6" role="alert">
          <p>{successMessage}</p>
        </div>
      )}
      
      {error && (
        <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-6" role="alert">
          <p>{error}</p>
        </div>
      )}
      
      <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg overflow-hidden">
        {/* Profile header */}
        <div className="bg-blue-600 dark:bg-blue-800 p-6 flex flex-col md:flex-row items-center md:items-start space-y-4 md:space-y-0 md:space-x-6">
          <div className="w-24 h-24 rounded-full overflow-hidden border-4 border-white">
            <img 
              src={profile.avatarUrl} 
              alt={profile.name} 
              className="w-full h-full object-cover"
            />
          </div>
          <div className="text-center md:text-left">
            <h2 className="text-2xl font-bold text-white">{profile.name}</h2>
            <p className="text-blue-200">{profile.role}</p>
            <p className="text-blue-100 mt-1">{profile.organization}</p>
          </div>
          
          {!isEditing ? (
            <button 
              onClick={() => setIsEditing(true)}
              className="ml-auto bg-white text-blue-600 hover:bg-blue-50 px-4 py-2 rounded-md flex items-center"
            >
              <Edit2 size={16} className="mr-2" />
              Edit Profile
            </button>
          ) : (
            <div className="ml-auto flex space-x-2">
              <button 
                onClick={handleSave}
                className="bg-green-500 text-white hover:bg-green-600 px-4 py-2 rounded-md flex items-center"
                disabled={isLoading}
              >
                <Save size={16} className="mr-2" />
                Save
              </button>
              <button 
                onClick={handleCancel}
                className="bg-gray-300 text-gray-700 hover:bg-gray-400 px-4 py-2 rounded-md flex items-center"
              >
                <X size={16} className="mr-2" />
                Cancel
              </button>
            </div>
          )}
        </div>
        
        {/* Profile details */}
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Basic Information */}
            <div>
              <h3 className="text-lg font-semibold mb-4 border-b pb-2 dark:border-gray-700">Basic Information</h3>
              
              <div className="space-y-4">
                <div className="flex items-start">
                  <User className="w-5 h-5 text-gray-500 dark:text-gray-400 mt-1 mr-3" />
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Full Name</p>
                    {isEditing ? (
                      <input
                        type="text"
                        name="name"
                        value={editedProfile?.name || ''}
                        onChange={handleInputChange}
                        className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm placeholder-gray-400 dark:placeholder-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      />
                    ) : (
                      <p className="font-medium">{profile.name}</p>
                    )}
                  </div>
                </div>
                
                <div className="flex items-start">
                  <Mail className="w-5 h-5 text-gray-500 dark:text-gray-400 mt-1 mr-3" />
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Email</p>
                    <p className="font-medium">{profile.email}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">(Email cannot be changed)</p>
                  </div>
                </div>
                
                <div className="flex items-start">
                  <Building className="w-5 h-5 text-gray-500 dark:text-gray-400 mt-1 mr-3" />
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Organization</p>
                    {isEditing ? (
                      <input
                        type="text"
                        name="organization"
                        value={editedProfile?.organization || ''}
                        onChange={handleInputChange}
                        className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm placeholder-gray-400 dark:placeholder-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      />
                    ) : (
                      <p className="font-medium">{profile.organization}</p>
                    )}
                  </div>
                </div>
                
                <div className="flex items-start">
                  <Phone className="w-5 h-5 text-gray-500 dark:text-gray-400 mt-1 mr-3" />
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Phone</p>
                    {isEditing ? (
                      <input
                        type="text"
                        name="phone"
                        value={editedProfile?.phone || ''}
                        onChange={handleInputChange}
                        className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm placeholder-gray-400 dark:placeholder-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      />
                    ) : (
                      <p className="font-medium">{profile.phone}</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
            
            {/* Additional Information */}
            <div>
              <h3 className="text-lg font-semibold mb-4 border-b pb-2 dark:border-gray-700">Additional Information</h3>
              
              <div className="space-y-4">
                <div className="flex items-start">
                  <MapPin className="w-5 h-5 text-gray-500 dark:text-gray-400 mt-1 mr-3" />
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Location</p>
                    {isEditing ? (
                      <input
                        type="text"
                        name="location"
                        value={editedProfile?.location || ''}
                        onChange={handleInputChange}
                        className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm placeholder-gray-400 dark:placeholder-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      />
                    ) : (
                      <p className="font-medium">{profile.location}</p>
                    )}
                  </div>
                </div>
                
                <div className="flex items-start">
                  <Calendar className="w-5 h-5 text-gray-500 dark:text-gray-400 mt-1 mr-3" />
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Joined</p>
                    <p className="font-medium">
                      {profile.joinDate ? new Date(profile.joinDate).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                      }) : 'N/A'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          {/* Bio */}
          <div className="mt-6">
            <h3 className="text-lg font-semibold mb-4 border-b pb-2 dark:border-gray-700">Bio</h3>
            
            {isEditing ? (
              <textarea
                name="bio"
                value={editedProfile?.bio || ''}
                onChange={handleInputChange}
                rows={4}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm placeholder-gray-400 dark:placeholder-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              />
            ) : (
              <p className="text-gray-700 dark:text-gray-300">{profile.bio}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfilePage;
