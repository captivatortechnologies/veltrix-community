import React, { useState, useEffect, useCallback } from 'react';
import { X } from 'lucide-react';
import { User, authAxios, checkUserExists } from '../../services/authService';
import { createUser, updateUser, getRoles } from '../../services/userService';
import { getCognitoConfig } from '../../services/cognitoService';

// API URL
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

interface UserModalProps {
  user: User | null;
  isEditing: boolean;
  onClose: (refreshData?: boolean) => void;
}

interface Role {
  id: string | number;
  name: string;
}

const UserModal: React.FC<UserModalProps> = ({ user, isEditing, onClose }) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [roleId, setRoleId] = useState<string | number>(1);
  const [roles, setRoles] = useState<Role[]>([]);
  const [authProvider, setAuthProvider] = useState<string>('COGNITO');
  const [phoneError, setPhoneError] = useState<string | null>(null);
  
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch Cognito configuration
  const fetchCognitoConfig = useCallback(async () => {
    try {
      const config = await getCognitoConfig();
      console.log('Cognito config:', config);
    } catch (error) {
      console.error('Error fetching Cognito configuration:', error);
    }
  }, []);

  const fetchRoles = useCallback(async () => {
    try {
      const fetchedRoles = await getRoles();
      setRoles(fetchedRoles);
      
      // Set default role if creating a new user
      if (!user && fetchedRoles.length > 0) {
        // Default to 'User' role if available, otherwise first role
        const userRole = fetchedRoles.find(role => role.name === 'User');
        setRoleId(userRole ? userRole.id : fetchedRoles[0].id);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch roles';
      setError(errorMessage);
    }
  }, [user]);

  // Load roles and Cognito config on component mount
  useEffect(() => {
    fetchRoles();
    fetchCognitoConfig();
  }, [fetchRoles, fetchCognitoConfig]);

  // Handle setting form fields when editing a user
  useEffect(() => {
    // If editing an existing user, populate the form
    if (user && isEditing) {
      setName(user.name || '');
      setEmail(user.email || '');
      setPhoneNumber(user.phoneNumber || '');
      // We don't set the password when editing

      // Set auth provider if available
      if (user.authProvider) {
        setAuthProvider(user.authProvider);
      }

      // Find the role ID based on the role name
      if (roles.length > 0) {
        const userRole = roles.find(role => role.name === user.role);
        if (userRole) {
          setRoleId(userRole.id);
        }
      }
    }
  }, [user, isEditing, roles]);

  // The server-side implementation already checks both database and Cognito
  // So we'll use a single function to check if user exists anywhere
  const checkUserExistsAnywhere = async (email: string): Promise<{ exists: boolean; location?: string; authProvider?: string }> => {
    try {
      console.log(`Checking if user with email ${email} exists anywhere...`);
      
      // This function already checks both database and Cognito on the server side
      const result = await checkUserExists(email);
      
      console.log(`User existence check result:`, result);
      
      if (result.exists) {
        // Determine the location based on the authProvider
        const location = result.authProvider === 'COGNITO' ? 'Cognito' : 'database';
        console.log(`User exists in ${location} with auth provider: ${result.authProvider || 'unknown'}`);
        
        return { 
          exists: true, 
          location, 
          authProvider: result.authProvider 
        };
      }
      
      console.log(`User does not exist in either system`);
      return { exists: false };
    } catch (error) {
      console.error('Error checking if user exists:', error);
      // In case of error, assume user doesn't exist to avoid blocking legitimate user creation
      return { exists: false };
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    
    // Validate form
    if (!name || !email || (!user && authProvider === 'LOCAL' && !password)) {
      setError('Please fill in all required fields');
      return;
    }
    
    // Validate password match if creating new user with LOCAL auth
    if (!user && authProvider === 'LOCAL' && password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    
    // Check if there's a phone number error
    if (phoneError) {
      setError('Please fix the phone number format before submitting');
      return;
    }
    
    setIsLoading(true);
    
    try {
      // If creating a new user, check if the email already exists anywhere
      if (!user) {
        const userCheck = await checkUserExistsAnywhere(email);
        
        if (userCheck.exists) {
          // User exists somewhere
          const locationText = userCheck.location === 'database' ? 'the database' : 'Cognito';
          const authProviderText = userCheck.authProvider ? ` (${userCheck.authProvider})` : '';
          
          setError(`A user with this email already exists in ${locationText}${authProviderText}.`);
          setIsLoading(false);
          return;
        }
      }
      
      if (user) {
        // Update existing user
        await updateUser(user.id, {
          name,
          email,
          phoneNumber,
          roleId
        });
      } else {
        if (authProvider === 'LOCAL') {
          // Create local user with password
          await createUser({
            name,
            email,
            phoneNumber,
            password, // Required for LOCAL auth
            roleId,
            authProvider
          });
        } else {
          // For Cognito users, we need to handle this differently
          // The backend should generate a temporary password and send it via email
          try {
            // Get the customer ID from localStorage
            const customerId = localStorage.getItem('customerId') || "00000000-0000-0000-0000-000000000001";
            
            // Make a direct API call for Cognito users to bypass the password requirement
            await authAxios.post(`${API_URL}/users`, {
              name,
              email,
              phoneNumber,
              roleId,
              authProvider: 'COGNITO',
              customerId
            });
          } catch (error) {
            if (error instanceof Error) {
              throw new Error(error.message);
            }
            throw new Error('Failed to create Cognito user');
          }
        }
      }
      
      onClose(true); // Close modal and refresh data
    } catch (err) {
      // Check if this is a specific error about user already existing
      if (err instanceof Error && err.message.includes('already exists')) {
        setError(`A user with this email already exists in the database.`);
      } else if (err instanceof Error && typeof err.message === 'string') {
        // Try to parse the error message if it's JSON
        try {
          const errorObj = JSON.parse(err.message);
          if (errorObj.error && typeof errorObj.error === 'string') {
            setError(errorObj.error);
          } else {
            setError(err.message);
          }
        } catch {
          // If parsing fails, just use the error message
          setError(err.message);
        }
      } else {
        setError('Failed to save user');
      }
      setIsLoading(false);
    }
  };
  
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black bg-opacity-70 flex items-center justify-center">
      <div className={`bg-white dark:bg-gray-800 rounded-lg shadow-xl ${isEditing ? 'max-w-2xl' : 'max-w-md'} w-full mx-4 transition-all duration-300 transform ${isEditing ? 'scale-105' : 'scale-100'}`}>
        <div className="flex justify-between items-center p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            {isEditing ? (user ? 'Edit User' : 'Add User') : 'User Details'}
          </h2>
          <button
            onClick={() => onClose()}
            className="text-gray-400 hover:text-gray-500 focus:outline-none"
          >
            <X size={24} />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className={`p-6 ${isEditing ? 'grid grid-cols-1 md:grid-cols-2 gap-6' : 'space-y-4'}`}>
          {error && (
            <div className="mb-4 bg-red-100 dark:bg-red-900/30 border-l-4 border-red-500 text-red-700 dark:text-red-300 p-4 rounded col-span-2" role="alert">
              <p>{error}</p>
            </div>
          )}
          
          <div className={isEditing ? 'space-y-4 col-span-1' : 'space-y-4'}>
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Full Name
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={!isEditing}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white disabled:bg-gray-100 dark:disabled:bg-gray-800 disabled:cursor-not-allowed"
                required
              />
            </div>
            
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Email Address
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={!isEditing}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white disabled:bg-gray-100 dark:disabled:bg-gray-800 disabled:cursor-not-allowed"
                required
              />
            </div>
            
            <div>
              <label htmlFor="phoneNumber" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Phone Number
              </label>
              <input
                id="phoneNumber"
                type="tel"
                value={phoneNumber}
                onChange={(e) => {
                  setPhoneNumber(e.target.value);
                  // Validate phone number format
                  const phoneRegex = /^\+[1-9]\d{10,14}$/;
                  if (e.target.value && !phoneRegex.test(e.target.value)) {
                    setPhoneError('Phone number must be in format +12345678900');
                  } else {
                    setPhoneError(null);
                  }
                }}
                placeholder="+12345678900"
                disabled={!isEditing}
                className={`w-full px-3 py-2 border ${phoneError ? 'border-red-500 dark:border-red-400' : 'border-gray-300 dark:border-gray-600'} rounded-md shadow-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white disabled:bg-gray-100 dark:disabled:bg-gray-800 disabled:cursor-not-allowed`}
              />
              {phoneError && (
                <p className="mt-1 text-sm text-red-600 dark:text-red-400">{phoneError}</p>
              )}
            </div>
          </div>
          
          <div className={isEditing ? 'space-y-4 col-span-1' : 'space-y-4'}>
            {/* Role selection */}
            <div>
              <label htmlFor="role" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Role
              </label>
              <select
                id="role"
                value={roleId}
                onChange={(e) => setRoleId(Number(e.target.value))}
                disabled={!isEditing}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white disabled:bg-gray-100 dark:disabled:bg-gray-800 disabled:cursor-not-allowed"
                required
              >
                <option value="">Select a role</option>
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </select>
            </div>
            
            {/* Only show password fields for LOCAL auth provider */}
            {isEditing && !user && authProvider === 'LOCAL' && (
              <>
                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Password
                  </label>
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    required
                  />
                </div>
                
                <div>
                  <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Confirm Password
                  </label>
                  <input
                    id="confirmPassword"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    required
                  />
                </div>
              </>
            )}
            
            {/* Auth Provider Selection - only show when creating a new user */}
            {isEditing && !user && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Authentication Method
                </label>
                <div className="space-y-2">
                  <div className="flex items-center">
                    <input
                      id="auth-local"
                      name="auth-provider"
                      type="radio"
                      checked={authProvider === 'LOCAL'}
                      onChange={() => setAuthProvider('LOCAL')}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                    />
                    <label htmlFor="auth-local" className="ml-2 block text-sm text-gray-700 dark:text-gray-300">
                      Local Authentication
                    </label>
                  </div>
                  <div className="flex items-center">
                    <input
                      id="auth-cognito"
                      name="auth-provider"
                      type="radio"
                      checked={authProvider === 'COGNITO'}
                      onChange={() => setAuthProvider('COGNITO')}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                    />
                    <label htmlFor="auth-cognito" className="ml-2 block text-sm text-gray-700 dark:text-gray-300">
                      AWS Cognito
                    </label>
                  </div>
                </div>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {authProvider === 'COGNITO' 
                    ? 'User will authenticate through AWS Cognito.'
                    : 'User will authenticate with a local password.'}
                </p>
              </div>
            )}
          </div>
          
          {/* Show note about Cognito password handling */}
          {isEditing && !user && authProvider === 'COGNITO' && (
            <div className="bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-500 text-blue-700 dark:text-blue-300 p-4 rounded col-span-2">
              <p className="text-sm">
                When creating a Cognito user, a temporary password will be generated and sent to the user's email address.
                The user will be required to change their password on first login.
              </p>
            </div>
          )}
          
          {isEditing && (
            <div className={`${isEditing ? 'col-span-2' : ''} mt-6 flex justify-end space-x-3`}>
              <button
                type="button"
                onClick={() => onClose()}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isLoading}
                className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? 'Saving...' : 'Save'}
              </button>
            </div>
          )}
          
          {!isEditing && (
            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => onClose()}
                className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Close
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
};

export default UserModal;
