import React from 'react';
import Tabs from '../../components/ui/Tabs';
import UserManagement from '../../features/access-control/UserManagement';
import RoleManagement from '../../features/access-control/RoleManagement';
import IdentityProvider from './IdentityProviderPage';

/**
 * Access Control hub: user management, role management (RBAC), and identity
 * provider (SSO) configuration. In the hosted commercial product, Role
 * Management and Identity Provider were gated behind a paid subscription
 * tier; the Community Edition ships every pipeline/RBAC/SSO feature free, so
 * all three tabs are always available here. Authorization is still enforced
 * the normal way server-side (`hasPermission('role', 'read')`, etc.) — there
 * is no separate subscription-tier check to mirror on the client.
 */
const AccessControlPage: React.FC = () => {
  const tabs = [
    {
      label: 'User Management',
      content: <UserManagement />,
    },
    {
      label: 'Role Management',
      content: <RoleManagement />,
    },
    {
      label: 'Identity Provider',
      content: <IdentityProvider />,
    },
  ];

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6 text-gray-900 dark:text-white">Access Control</h1>
      <Tabs tabs={tabs} />
    </div>
  );
};

export default AccessControlPage;
