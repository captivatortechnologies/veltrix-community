import React, { useState, useEffect } from 'react';
import { User, Lock, Bell, Save, Check } from 'lucide-react';
import { getSettings, updateSettings, UserSettings } from '../../services/profileService';
import { changePassword } from '../../services/authService';
import { TwoFactorSection } from './TwoFactorSection';

const ProfileSettingsPage: React.FC = () => {
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  
  // Password change state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);

  useEffect(() => {
    const fetchSettings = async () => {
      setIsLoading(true);
      try {
        const settingsData = await getSettings();
        setSettings(settingsData);
      } catch (err) {
        console.error('Error fetching settings:', err);
        setError('Failed to load settings. Please try again later.');
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchSettings();
  }, []);

  const handleNotificationChange = (type: 'email' | 'browser' | 'mobile') => {
    if (!settings) return;
    
    setSettings({
      ...settings,
      notifications: {
        ...settings.notifications,
        [type]: !settings.notifications[type]
      }
    });
  };

  // 2FA state is server-owned and only changes through the code-verified
  // /auth/2fa/* endpoints (see TwoFactorSection) — this merely syncs the
  // local copy after the section reports a change.
  const handleTwoFactorStatusChange = (enabled: boolean) => {
    setSettings((prev) => (prev ? { ...prev, twoFactorEnabled: enabled } : prev));
  };

  const handleSaveSettings = async () => {
    if (!settings) return;

    setIsLoading(true);
    try {
      await updateSettings({
        notifications: settings.notifications
      });
      
      setSuccessMessage('Settings updated successfully!');
      
      // Clear success message after 3 seconds
      setTimeout(() => {
        setSuccessMessage(null);
      }, 3000);
    } catch (err) {
      console.error('Error updating settings:', err);
      setError('Failed to update settings. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Reset messages
    setPasswordError(null);
    setPasswordSuccess(null);
    
    // Validate passwords
    if (!currentPassword) {
      setPasswordError('Current password is required');
      return;
    }
    
    if (!newPassword) {
      setPasswordError('New password is required');
      return;
    }
    
    if (newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters');
      return;
    }
    
    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match');
      return;
    }
    
    setIsLoading(true);
    try {
      await changePassword(currentPassword, newPassword);
      
      setPasswordSuccess('Password changed successfully!');
      
      // Clear form
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      
      // Clear success message after 3 seconds
      setTimeout(() => {
        setPasswordSuccess(null);
      }, 3000);
    } catch (err) {
      console.error('Error changing password:', err);
      setPasswordError('Failed to change password. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading && !settings) {
    return (
      <div className="flex justify-center items-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (error && !settings) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-6" role="alert">
          <p>{error}</p>
        </div>
      </div>
    );
  }

  if (!settings) {
    return null;
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">Account Settings</h1>
      
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
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Sidebar */}
        <div className="md:col-span-1">
          <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg p-4">
            <div className="flex items-center space-x-3 p-3 bg-blue-50 dark:bg-blue-900 rounded-md">
              <User className="h-5 w-5 text-blue-500" />
              <span className="font-medium">Account</span>
            </div>
            <div className="mt-2">
              <a 
                href="/profile" 
                className="flex items-center space-x-3 p-3 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <User className="h-5 w-5 text-gray-500 dark:text-gray-400" />
                <span>Profile</span>
              </a>
              <a 
                href="/profile/settings" 
                className="flex items-center space-x-3 p-3 rounded-md bg-gray-100 dark:bg-gray-700"
              >
                <Lock className="h-5 w-5 text-gray-500 dark:text-gray-400" />
                <span>Security & Password</span>
              </a>
              <a 
                href="/profile/notifications" 
                className="flex items-center space-x-3 p-3 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <Bell className="h-5 w-5 text-gray-500 dark:text-gray-400" />
                <span>Notifications</span>
              </a>
            </div>
          </div>
        </div>
        
        {/* Main content */}
        <div className="md:col-span-2">
          {/* Security Settings */}
          <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg overflow-hidden mb-6">
            <div className="border-b border-gray-200 dark:border-gray-700 px-6 py-4">
              <h2 className="text-lg font-semibold">Security Settings</h2>
            </div>
            <div className="p-6">
              <TwoFactorSection
                enabled={settings.twoFactorEnabled}
                onStatusChange={handleTwoFactorStatusChange}
              />


              <div className="mb-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium">Notification Preferences</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                      Manage how you receive notifications
                    </p>
                  </div>
                </div>
                
                <div className="mt-4 space-y-3">
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="email-notifications"
                      checked={settings.notifications.email}
                      onChange={() => handleNotificationChange('email')}
                      className="h-4 w-4 text-blue-600 border-gray-300 rounded"
                    />
                    <label htmlFor="email-notifications" className="ml-2 block text-sm text-gray-700 dark:text-gray-300">
                      Email Notifications
                    </label>
                  </div>
                  
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="browser-notifications"
                      checked={settings.notifications.browser}
                      onChange={() => handleNotificationChange('browser')}
                      className="h-4 w-4 text-blue-600 border-gray-300 rounded"
                    />
                    <label htmlFor="browser-notifications" className="ml-2 block text-sm text-gray-700 dark:text-gray-300">
                      Browser Notifications
                    </label>
                  </div>
                  
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="mobile-notifications"
                      checked={settings.notifications.mobile}
                      onChange={() => handleNotificationChange('mobile')}
                      className="h-4 w-4 text-blue-600 border-gray-300 rounded"
                    />
                    <label htmlFor="mobile-notifications" className="ml-2 block text-sm text-gray-700 dark:text-gray-300">
                      Mobile Notifications
                    </label>
                  </div>
                </div>
              </div>
              
              <div className="mb-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium">Session Management</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                      Manage your active sessions and sign out from other devices
                    </p>
                  </div>
                  <button className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 text-sm font-medium">
                    Manage Sessions
                  </button>
                </div>
              </div>
              
              <div className="flex justify-end">
                <button
                  onClick={handleSaveSettings}
                  className="bg-blue-600 text-white hover:bg-blue-700 px-4 py-2 rounded-md flex items-center"
                  disabled={isLoading}
                >
                  <Save size={16} className="mr-2" />
                  Save Changes
                </button>
              </div>
            </div>
          </div>
          
          {/* Password Change */}
          <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg overflow-hidden">
            <div className="border-b border-gray-200 dark:border-gray-700 px-6 py-4">
              <h2 className="text-lg font-semibold">Change Password</h2>
            </div>
            <div className="p-6">
              {passwordSuccess && (
                <div className="bg-green-100 border-l-4 border-green-500 text-green-700 p-4 mb-6" role="alert">
                  <div className="flex items-center">
                    <Check className="h-5 w-5 mr-2" />
                    <p>{passwordSuccess}</p>
                  </div>
                </div>
              )}
              
              {passwordError && (
                <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-6" role="alert">
                  <p>{passwordError}</p>
                </div>
              )}
              
              <form onSubmit={handlePasswordChange}>
                <div className="mb-4">
                  <label htmlFor="current-password" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Current Password
                  </label>
                  <input
                    id="current-password"
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm placeholder-gray-400 dark:placeholder-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                
                <div className="mb-4">
                  <label htmlFor="new-password" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    New Password
                  </label>
                  <input
                    id="new-password"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm placeholder-gray-400 dark:placeholder-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Password must be at least 8 characters long
                  </p>
                </div>
                
                <div className="mb-6">
                  <label htmlFor="confirm-password" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Confirm New Password
                  </label>
                  <input
                    id="confirm-password"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm placeholder-gray-400 dark:placeholder-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                
                <div className="flex justify-end">
                  <button
                    type="submit"
                    className="bg-blue-600 text-white hover:bg-blue-700 px-4 py-2 rounded-md flex items-center"
                    disabled={isLoading}
                  >
                    <Lock size={16} className="mr-2" />
                    Change Password
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfileSettingsPage;
