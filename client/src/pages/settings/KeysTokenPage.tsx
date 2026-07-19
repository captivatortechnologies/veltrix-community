import React, { useState, useEffect, useCallback } from 'react';
import { Copy, Key, Shield } from 'lucide-react';
import { useToast } from '../../components/shared/Toast';
import { getApiKeys, createApiKey, deleteApiKey, type ApiKey } from '../../services/apiKeyService';
import { getRoles } from '../../services/userService';

// Expiration presets (days). `null` => never expires.
const EXPIRATION_DAYS: Record<string, number | null> = {
  never: null,
  '30': 30,
  '90': 90,
  '180': 180,
  '365': 365,
};

/**
 * Keys & Tokens — lists and manages the CURRENT tenant's API keys. All data
 * comes from the tenant-scoped `/api/api-keys` endpoints (apiKeyService), which
 * resolve the customer from the caller's JWT server-side, so a tenant only ever
 * sees its own keys. Stored keys are returned masked; a newly created key's full
 * value is shown exactly once.
 */
const KeysTokenPage: React.FC = () => {
  const toast = useToast();
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyType, setNewKeyType] = useState<'api' | 'admin'>('api');
  const [newKeyExpiration, setNewKeyExpiration] = useState('never');
  const [newKeyRoleId, setNewKeyRoleId] = useState('');
  const [roles, setRoles] = useState<{ id: string; name: string }[]>([]);
  const [newKey, setNewKey] = useState<ApiKey | null>(null);

  const loadKeys = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setApiKeys(await getApiKeys());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load API keys');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadKeys();
  }, [loadKeys]);

  // Roles power the required "Access role" selector — a key's permissions are
  // governed by the RBAC role it's bound to.
  useEffect(() => {
    getRoles()
      .then(setRoles)
      .catch(() => setRoles([]));
  }, []);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard!');
  };

  const handleCreateKey = async () => {
    if (!newKeyName.trim()) {
      toast.warning('Please enter a name for the key');
      return;
    }
    if (!newKeyRoleId) {
      toast.warning('Please select an access role for the key');
      return;
    }
    setCreating(true);
    try {
      const days = EXPIRATION_DAYS[newKeyExpiration];
      const expiresAt = days ? new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString() : undefined;
      const created = await createApiKey({
        name: newKeyName.trim(),
        type: newKeyType,
        expiresAt,
        roleId: newKeyRoleId,
      });
      // The full key value is returned once, on create — show it before masking.
      setNewKey(created);
      setNewKeyName('');
      setNewKeyType('api');
      setNewKeyExpiration('never');
      setNewKeyRoleId('');
      setIsCreating(false);
      await loadKeys();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to create API key');
    } finally {
      setCreating(false);
    }
  };

  const handleDoneWithNewKey = () => {
    // The refreshed list already includes the new key (masked, from the server).
    setNewKey(null);
  };

  const handleDeleteKey = async (id: string) => {
    if (!confirm('Are you sure you want to delete this key? This action cannot be undone.')) {
      return;
    }
    try {
      await deleteApiKey(id);
      setApiKeys((prev) => prev.filter((key) => key.id !== id));
      toast.success('API key deleted');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to delete API key');
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Never';

    const date = new Date(dateString);
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  };

  return (
    <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">API Keys & Tokens</h1>
        {!isCreating && !newKey && (
          <button
            onClick={() => setIsCreating(true)}
            className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded flex items-center"
          >
            <Key className="h-4 w-4 mr-2" />
            Create New Key
          </button>
        )}
      </div>

      <p className="text-gray-600 dark:text-gray-400 mb-6">
        API keys provide access to the Veltrix API. Admin keys have elevated privileges and should be used with caution.
        Keys are only displayed once when created and cannot be retrieved later.
      </p>

      {isCreating && (
        <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg mb-6">
          <h2 className="text-lg font-medium mb-4">Create New Key</h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Key Name
              </label>
              <input
                type="text"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                placeholder="e.g., Production API Key"
                className="w-full px-3 py-2 border rounded text-gray-900 bg-white dark:bg-gray-800 dark:border-gray-600 dark:text-white"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Key Type
              </label>
              <div className="flex space-x-4">
                <label className="inline-flex items-center">
                  <input
                    type="radio"
                    name="keyType"
                    value="api"
                    checked={newKeyType === 'api'}
                    onChange={() => setNewKeyType('api')}
                    className="h-4 w-4 text-blue-600"
                  />
                  <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">API Key</span>
                </label>
                <label className="inline-flex items-center">
                  <input
                    type="radio"
                    name="keyType"
                    value="admin"
                    checked={newKeyType === 'admin'}
                    onChange={() => setNewKeyType('admin')}
                    className="h-4 w-4 text-blue-600"
                  />
                  <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">Admin Key</span>
                </label>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Access Role
              </label>
              <select
                value={newKeyRoleId}
                onChange={(e) => setNewKeyRoleId(e.target.value)}
                className="w-full px-3 py-2 border rounded text-gray-900 bg-white dark:bg-gray-800 dark:border-gray-600 dark:text-white"
                required
              >
                <option value="">Select a role…</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                The key inherits this role's permissions — it can only do what the role allows.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Expiration
              </label>
              <select
                value={newKeyExpiration}
                onChange={(e) => setNewKeyExpiration(e.target.value)}
                className="w-full px-3 py-2 border rounded text-gray-900 bg-white dark:bg-gray-800 dark:border-gray-600 dark:text-white"
              >
                <option value="never">Never</option>
                <option value="30">30 days</option>
                <option value="90">90 days</option>
                <option value="180">180 days</option>
                <option value="365">1 year</option>
              </select>
            </div>

            <div className="flex justify-end space-x-3 pt-2">
              <button
                onClick={() => setIsCreating(false)}
                disabled={creating}
                className="px-4 py-2 border rounded text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => void handleCreateKey()}
                disabled={creating}
                className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50"
              >
                {creating ? 'Creating…' : 'Create Key'}
              </button>
            </div>
          </div>
        </div>
      )}

      {newKey && (
        <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 p-4 rounded-lg mb-6">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-medium text-blue-800 dark:text-blue-300">New Key Created</h2>
            <div className="text-sm text-blue-600 dark:text-blue-400">
              {newKey.type === 'admin' ? 'Admin Key' : newKey.type === 'webhook' ? 'Webhook Key' : 'API Key'}
            </div>
          </div>

          <div className="mb-4">
            <p className="text-sm text-blue-800 dark:text-blue-300 font-medium mb-1">
              {newKey.name}
              {newKey.roleName && (
                <span className="ml-2 font-normal text-blue-600 dark:text-blue-400">· {newKey.roleName} role</span>
              )}
            </p>
            <div className="flex items-center">
              <code className="bg-blue-100 dark:bg-blue-800 px-3 py-2 rounded text-blue-800 dark:text-blue-300 flex-1 font-mono text-sm break-all">
                {newKey.key}
              </code>
              <button
                onClick={() => copyToClipboard(newKey.key)}
                className="ml-2 p-2 text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300"
                title="Copy to clipboard"
              >
                <Copy className="h-5 w-5" />
              </button>
            </div>
          </div>

          <div className="bg-yellow-100 dark:bg-yellow-900/30 p-3 rounded text-yellow-800 dark:text-yellow-300 text-sm mb-4">
            <strong>Important:</strong> This key will only be displayed once. Please copy it now and store it securely.
          </div>

          <div className="text-right">
            <button
              onClick={handleDoneWithNewKey}
              className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300" role="alert">
          Failed to load API keys: {error}
          <button onClick={() => void loadKeys()} className="ml-3 font-medium underline">
            Retry
          </button>
        </div>
      ) : loading ? (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">Loading API keys…</div>
      ) : apiKeys.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Name
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Type
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Role
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Key
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Created
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Last Used
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Expires
                </th>
                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {apiKeys.map((key) => (
                <tr key={key.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100">
                    {key.name}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      key.type === 'admin'
                        ? 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300'
                        : 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300'
                    }`}>
                      {key.type === 'admin' ? (
                        <>
                          <Shield className="h-3 w-3 mr-1" />
                          Admin
                        </>
                      ) : (
                        <>
                          <Key className="h-3 w-3 mr-1" />
                          {key.type === 'webhook' ? 'Webhook' : 'API'}
                        </>
                      )}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    {key.roleName || '—'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400 font-mono">
                    {key.key}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    {formatDate(key.createdAt)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    {formatDate(key.lastUsed)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    {key.expiresAt ? formatDate(key.expiresAt) : 'Never'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button
                      onClick={() => void handleDeleteKey(key.id)}
                      className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
          No API keys found. Click "Create New Key" to get started.
        </div>
      )}
    </div>
  );
};

export default KeysTokenPage;
