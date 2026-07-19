import React, { useState, useEffect } from 'react';
import { getLocalUsers, getRoles, createUser, updateUser, deleteUser } from '../../services/userService';
import { User } from '../../services/authService';
import { createCognitoUser, getCognitoUsers } from '../../services/cognitoService';
import { Trash2, Edit, Plus, X, AlertTriangle } from 'lucide-react';
import { Button } from '../../components/shared/Button';
import { UserDetailModal } from './components/UserDetailModal';
import { UserFormDialog } from './components/UserFormDialog';

// Extend the User interface to include authProvider
interface ExtendedUser extends Omit<User, 'id'> {
  id: string | number;
  authProvider?: string;
}

interface Role {
  id: string;
  name: string;
}

const UserManagement: React.FC = () => {
  const [users, setUsers] = useState<ExtendedUser[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [newUser, setNewUser] = useState({ 
    name: '', 
    firstName: '',
    lastName: '',
    phoneNumber: '',
    email: '', 
    password: '', 
    roleId: '1', // Default to role ID 1
    authProvider: 'COGNITO' 
  });
  const [isAddingUser, setIsAddingUser] = useState(false);
  const [isEditingUser, setIsEditingUser] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cognitoEnabled, setCognitoEnabled] = useState(true);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [userToDelete, setUserToDelete] = useState<ExtendedUser | null>(null);
  const [detailUser, setDetailUser] = useState<ExtendedUser | null>(null);

  // Fetch users and roles
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        
        // Check if Cognito is enabled
        let cognitoConfig;
        try {
          // Import and use the getCognitoConfig function from authService
          const { getCognitoConfig } = await import('../../services/authService');
          cognitoConfig = await getCognitoConfig();
          setCognitoEnabled(cognitoConfig?.enabled || false);
        } catch (error) {
          console.error('Error checking Cognito status:', error);
          setCognitoEnabled(false);
        }
        
        // Fetch roles
        const rolesData = await getRoles();
        setRoles(rolesData);
        
        // Fetch local users (authProvider = 'LOCAL')
        const localUsers = await getLocalUsers();
        
        // If Cognito is enabled, fetch Cognito users
        let cognitoUsers: ExtendedUser[] = [];
        if (cognitoConfig?.enabled) {
          try {
            const fetchedCognitoUsers = await getCognitoUsers();
            
            // Convert CognitoUser to ExtendedUser
            cognitoUsers = fetchedCognitoUsers.map(user => ({
              id: user.id,
              email: user.email,
              name: user.name || '',
              firstName: user.firstName || '',
              lastName: user.lastName || '',
              phoneNumber: user.phoneNumber || '',
              role: user.role,
              customerId: user.customerId,
              authProvider: 'COGNITO'
            }));
          } catch (error) {
            console.error('Error fetching Cognito users:', error);
          }
        }
        
        // Combine local and Cognito users
        setUsers([...localUsers, ...cognitoUsers]);
        
        setLoading(false);
      } catch (error) {
        console.error('Error fetching data:', error);
        setError('Failed to load users and roles');
        setLoading(false);
      }
    };
    
    fetchData();
  }, []);

  const handleFieldChange = (field: keyof typeof newUser, value: string) => {
    setNewUser((prev) => ({ ...prev, [field]: value }));
  };

  const handleAddUser = async () => {
    try {
      setError(null);
      
      // Check required fields based on auth provider
      if ((!newUser.firstName && !newUser.lastName && !newUser.name) || !newUser.email || !newUser.roleId) {
        setError('Name (First or Last), email, and role are required');
        return;
      }
      
      // Password is only required for LOCAL auth
      if (newUser.authProvider === 'LOCAL' && !newUser.password) {
        setError('Password is required for local accounts');
        return;
      }
      
      let createdUser;
      const roleId = newUser.roleId;
      
      // If Cognito is selected as the auth provider, create the user in Cognito
      if (newUser.authProvider === 'COGNITO') {
        try {
          // Create user in Cognito
          const cognitoResult = await createCognitoUser({
            name: newUser.name || `${newUser.firstName} ${newUser.lastName}`.trim(),
            firstName: newUser.firstName,
            lastName: newUser.lastName,
            phoneNumber: newUser.phoneNumber,
            email: newUser.email,
            password: newUser.password,
            roleId: roleId
          });
          
          // If successful, add to local state
          if (cognitoResult && cognitoResult.success) {
            // If the database save was successful, use the database user
            if (cognitoResult.dbSaveSuccess && cognitoResult.dbUser) {
              const role = roles.find(r => r.id === cognitoResult.dbUser?.roleId);
              
              setUsers([...users, {
                id: cognitoResult.dbUser.id,
                name: cognitoResult.dbUser.name,
                firstName: cognitoResult.dbUser.firstName,
                lastName: cognitoResult.dbUser.lastName,
                phoneNumber: cognitoResult.dbUser.phoneNumber,
                email: cognitoResult.dbUser.email,
                role: role?.name || 'User',
                authProvider: cognitoResult.dbUser.authProvider,
                customerId: cognitoResult.dbUser.customerId
              }]);
            } else {
              // If the database save failed, use the data from the form
              const role = roles.find(r => r.id === roleId);
              
              // Add to local state with a placeholder ID
              // Get the first customer ID from the existing users, or use a placeholder
              const customerId = users.length > 0 ? users[0].customerId : 'cognito-customer';
              
              setUsers([...users, {
                id: cognitoResult.cognitoUserId || Date.now(),
                name: newUser.name || `${newUser.firstName} ${newUser.lastName}`.trim(),
                firstName: newUser.firstName,
                lastName: newUser.lastName,
                phoneNumber: newUser.phoneNumber,
                email: newUser.email,
                role: role?.name || 'User',
                authProvider: 'COGNITO',
                customerId
              }]);
              
              // Show a warning that the database save failed
              console.warn('User created in Cognito but failed to save to database');
            }
            
            // Reset form
            setNewUser({ 
              name: '', 
              firstName: '',
              lastName: '',
              phoneNumber: '',
              email: '', 
              password: '', 
              roleId: '', 
              authProvider: 'COGNITO' 
            });
            setIsAddingUser(false);
            
            return;
          } else {
            throw new Error(cognitoResult?.error || 'Failed to create user in Cognito');
          }
        } catch (cognitoError) {
          console.error('Error creating user in Cognito:', cognitoError);
          setError('Failed to create user in Cognito: ' + (cognitoError instanceof Error ? cognitoError.message : 'Unknown error'));
          return;
        }
      } else {
        // For LOCAL auth, create user in the database
        createdUser = await createUser({
          name: newUser.name || `${newUser.firstName} ${newUser.lastName}`.trim(),
          firstName: newUser.firstName,
          lastName: newUser.lastName,
          phoneNumber: newUser.phoneNumber,
          email: newUser.email,
          password: newUser.password,
          roleId: roleId,
          authProvider: 'LOCAL'
        });
        
        // Add to local state
        const role = roles.find(r => r.id === roleId);
        setUsers([...users, {
          ...createdUser,
          role: role?.name || 'Unknown',
          authProvider: 'LOCAL'
        }]);
        
        // Reset form
        setNewUser({ 
          name: '', 
          firstName: '',
          lastName: '',
          phoneNumber: '',
          email: '', 
          password: '', 
          roleId: '', 
          authProvider: 'COGNITO' 
        });
        setIsAddingUser(false);
      }
    } catch (error) {
      console.error('Error creating user:', error);
      setError('Failed to create user: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  };

  const handleEditStart = (user: ExtendedUser) => {
    // Find the role ID for this user
    const userRole = roles.find(r => r.name === user.role);
    
    setNewUser({
      name: user.name || '',
      firstName: user.firstName || '',
      lastName: user.lastName || '',
      phoneNumber: user.phoneNumber || '',
      email: user.email,
      password: '',
      roleId: userRole?.id.toString() || '',
      authProvider: user.authProvider || 'LOCAL'
    });
    
    setEditingUserId(user.id);
    setIsEditingUser(true);
    setIsAddingUser(true);
  };

  const handleEditSave = async () => {
    try {
      if (!editingUserId) return;
      
      setError(null);
      
      if ((!newUser.firstName && !newUser.lastName && !newUser.name) || !newUser.email || !newUser.roleId) {
        setError('Name (First or Last), email, and role are required');
        return;
      }
      
      // Prepare update data
      const updateData: {
        name?: string;
        firstName?: string;
        lastName?: string;
        phoneNumber?: string;
        email: string;
        roleId: string;
        password?: string;
      } = {
        email: newUser.email,
        roleId: newUser.roleId
      };
      
      // Include name fields
      if (newUser.name) {
        updateData.name = newUser.name;
      }
      if (newUser.firstName) {
        updateData.firstName = newUser.firstName;
      }
      if (newUser.lastName) {
        updateData.lastName = newUser.lastName;
      }
      if (newUser.phoneNumber) {
        updateData.phoneNumber = newUser.phoneNumber;
      }
      
      // Only include password if it was changed
      if (newUser.password) {
        updateData.password = newUser.password;
      }
      
      // Update user
      await updateUser(editingUserId, updateData);
      
      // Update local state
      const roleId = newUser.roleId;
      const role = roles.find(r => r.id === roleId);
      setUsers(users.map(user => 
        user.id === editingUserId 
          ? { 
              ...user, 
              name: newUser.name,
              firstName: newUser.firstName,
              lastName: newUser.lastName,
              phoneNumber: newUser.phoneNumber,
              email: newUser.email, 
              role: role?.name || 'Unknown'
            } 
          : user
      ));
      
      // Reset form
      setNewUser({ 
        name: '', 
        firstName: '',
        lastName: '',
        phoneNumber: '',
        email: '', 
        password: '', 
        roleId: '', 
        authProvider: 'COGNITO' 
      });
      setIsAddingUser(false);
      setIsEditingUser(false);
      setEditingUserId(null);
    } catch (error) {
      console.error('Error updating user:', error);
      setError('Failed to update user');
    }
  };

  const handleDeleteUser = async (id: string | number) => {
    try {
      // Delete user
      await deleteUser(id);
      
      // Update local state
      setUsers(users.filter(user => user.id !== id));
      setShowDeleteConfirm(false);
      setUserToDelete(null);
      setError(null);
    } catch (error) {
      console.error('Error deleting user:', error);
      setError('Failed to delete user');
    }
  };

  const handleCancel = () => {
    setNewUser({ 
      name: '', 
      firstName: '',
      lastName: '',
      phoneNumber: '',
      email: '', 
      password: '', 
      roleId: '', 
      authProvider: 'COGNITO' 
    });
    setIsAddingUser(false);
    setIsEditingUser(false);
    setEditingUserId(null);
    setError(null);
  };

  if (loading) {
    return <div className="text-center py-4">Loading users...</div>;
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Users</h2>
        <Button
          variant="primary"
          leftIcon={<Plus size={16} aria-hidden="true" />}
          onClick={() => {
            setIsEditingUser(false);
            setEditingUserId(null);
            setNewUser({
              name: '',
              firstName: '',
              lastName: '',
              phoneNumber: '',
              email: '',
              password: '',
              roleId: '',
              authProvider: cognitoEnabled ? 'COGNITO' : 'LOCAL',
            });
            setError(null);
            setIsAddingUser(true);
          }}
        >
          Add user
        </Button>
      </div>

      {error && !isAddingUser && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          <span className="font-bold">Error:</span> {error}
          <button 
            className="float-right" 
            onClick={() => setError(null)}
          >
            <X size={16} />
          </button>
        </div>
      )}

      <UserFormDialog
        isOpen={isAddingUser}
        isEditing={isEditingUser}
        values={newUser}
        onChange={handleFieldChange}
        roles={roles}
        cognitoEnabled={cognitoEnabled}
        error={error}
        onSubmit={isEditingUser ? handleEditSave : handleAddUser}
        onClose={handleCancel}
      />

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-700">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                Name
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                Email
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                Phone
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                Role
              </th>
              {cognitoEnabled && (
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Auth Provider
                </th>
              )}
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
            {users.length === 0 ? (
              <tr>
                <td colSpan={cognitoEnabled ? 6 : 5} className="px-6 py-4 text-center text-gray-500 dark:text-gray-400">
                  No users found
                </td>
              </tr>
            ) : (
              users.map((user) => (
                <tr
                  key={user.id}
                  className="hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
                  onClick={() => setDetailUser(user)}
                  title="View user details"
                >
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900 dark:text-white">
                      {user.firstName && user.lastName 
                        ? `${user.firstName} ${user.lastName}` 
                        : user.name || ''}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-500 dark:text-gray-300">{user.email}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-500 dark:text-gray-300">{user.phoneNumber || '-'}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                      user.role === 'Admin' 
                        ? 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200' 
                        : user.role === 'User'
                        ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                        : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
                    }`}>
                      {user.role}
                    </span>
                  </td>
                  {cognitoEnabled && (
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        user.authProvider === 'COGNITO' 
                          ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' 
                          : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                      }`}>
                        {user.authProvider || 'LOCAL'}
                      </span>
                    </td>
                  )}
                  <td
                    className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      className="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300 p-1 rounded-full hover:bg-blue-100 dark:hover:bg-blue-900 mr-3"
                      onClick={() => handleEditStart(user)}
                      title="Edit user"
                    >
                      <Edit size={18} />
                    </button>
                    <button
                      className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300 p-1 rounded-full hover:bg-red-100 dark:hover:bg-red-900"
                      onClick={() => {
                        setUserToDelete(user);
                        setShowDeleteConfirm(true);
                      }}
                      title="Delete user"
                    >
                      <Trash2 size={18} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      
      {/* Delete Confirmation Dialog */}
      {showDeleteConfirm && userToDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6">
            <div className="flex items-center text-red-600 dark:text-red-400 mb-4">
              <AlertTriangle size={24} className="mr-2" />
              <h3 className="text-lg font-medium">Delete User</h3>
            </div>
            <p className="text-gray-700 dark:text-gray-300 mb-6">
              Are you sure you want to delete the user "{userToDelete.firstName && userToDelete.lastName 
                ? `${userToDelete.firstName} ${userToDelete.lastName}` 
                : userToDelete.name || userToDelete.email}"? This action cannot be undone.
            </p>
            <div className="flex justify-end space-x-2">
              <button
                className="px-4 py-2 bg-gray-300 hover:bg-gray-400 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-white rounded"
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setUserToDelete(null);
                }}
              >
                Cancel
              </button>
              <button
                className="px-4 py-2 bg-red-600 hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-800 text-white rounded"
                onClick={() => {
                  handleDeleteUser(userToDelete.id);
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      <UserDetailModal
        user={detailUser}
        cognitoEnabled={cognitoEnabled}
        onClose={() => setDetailUser(null)}
        onEdit={() => {
          if (!detailUser) return;
          const u = detailUser;
          setDetailUser(null);
          handleEditStart(u);
        }}
        onDelete={() => {
          if (!detailUser) return;
          setUserToDelete(detailUser);
          setShowDeleteConfirm(true);
          setDetailUser(null);
        }}
      />
    </div>
  );
};

export default UserManagement;
