import React, { useState, useEffect } from 'react';
import {
  getCognitoConfig,
  saveCognitoConfig,
  testCognitoConnection,
  disableCognitoForSso,
  resetCognitoConfig,
  type JitMode
} from '../../services/cognitoService';
import { googleService } from '../../services/googleService';
import { microsoftService } from '../../services/microsoftService';
import { oidcService } from '../../services/oidcService';
import type { TestConnectionResult } from '../../services/identityProviderTypes';
import { useToast } from '../../components/shared/Toast';
import { getAuthToken } from '../../services/authService';
import { Modal } from '../../components/shared/Modal';
import { Button } from '../../components/shared/Button';
import { IdentityProviderDetailModal } from '../../features/access-control/components/IdentityProviderDetailModal';

/** Config keys that hold a secret value — never pre-filled from the server, always rendered via the "Replace secret" affordance. */
const SECRET_CONFIG_KEYS = new Set(['clientSecret', 'awsSecretAccessKey']);

interface IdentityProvider {
  id: string;
  name: string;
  type: 'saml' | 'oidc' | 'google' | 'azure' | 'cognito';
  enabled: boolean;
  // I3: providers this admin is authorized for can be saved either as the
  // platform-wide default or scoped to just their own organization — the
  // save path previously never sent `isCustomerSpecific: true`, so a
  // "customer-specific" save silently fell back to overwriting the global
  // config instead.
  isCustomerSpecific: boolean;
  // I2: only meaningful for the real SSO providers (google/azure/cognito).
  jitMode?: JitMode;
  config: Record<string, string>;
  // URGENT security fix (2026-07-11): the server never returns a decrypted
  // secret — config.clientSecret/config.awsSecretAccessKey are always ''.
  // These presence flags are what render "•••• configured" vs "Not set".
  hasClientSecret?: boolean;
  hasAwsSecretAccessKey?: boolean;
}

const JIT_MODE_OPTIONS: { value: JitMode; label: string; hint: string }[] = [
  {
    value: 'domain-match',
    label: 'Match email domain to an organization',
    hint: "New users are provisioned under the organization whose domain matches their email (e.g. alice@acme.com → Acme). An unrecognized domain is rejected, not silently assigned to some other organization."
  },
  {
    value: 'disabled',
    label: 'Do not auto-create accounts',
    hint: 'Only users who already exist in Veltrix can sign in via this provider. New identities are rejected with a clear message.'
  },
  {
    value: 'legacy-first-customer',
    label: 'Auto-create under the first active organization (legacy)',
    hint: 'Every first-time sign-in is provisioned under whichever organization happens to be first. Not recommended for multi-tenant use — kept for configurations that already relied on this.'
  }
];

const IdentityProviderPage: React.FC = () => {
  const toast = useToast();
  const [providers, setProviders] = useState<IdentityProvider[]>([
    {
      id: 'saml',
      name: 'SAML',
      type: 'saml',
      enabled: false,
      isCustomerSpecific: false,
      config: {
        entityId: '',
        acsUrl: '',
        metadataUrl: '',
        certificate: '',
      },
    },
    {
      id: 'oidc',
      name: 'OAuth 2.0 / OIDC',
      type: 'oidc',
      enabled: false,
      isCustomerSpecific: false,
      jitMode: 'domain-match',
      config: {
        // OIDC discovery is fetched from `{issuer}/.well-known/openid-configuration`
        // — see oidcService.ts on the server.
        issuer: '',
        clientId: '',
        clientSecret: '',
        redirectUri: window.location.origin + '/oauth/callback',
        scope: 'openid email profile',
      },
    },
    {
      id: 'cognito',
      name: 'AWS Cognito',
      type: 'cognito',
      enabled: false,
      isCustomerSpecific: false,
      jitMode: 'domain-match',
      config: {
        userPoolId: '',
        userPoolRegion: 'us-east-1',
        clientId: '',
        clientSecret: '',
        // Hosted UI domain — distinct from userPoolId (I3); required for
        // sign-in to work, see cognitoService.getAuthUrl on the server.
        domain: '',
        redirectUri: window.location.origin + '/auth/cognito/callback',
        logoutUri: window.location.origin,
        scope: 'phone openid email',
        // I5: AWS creds for admin operations only (not needed for sign-in) —
        // optional, with an env-var fallback when left blank.
        awsAccessKeyId: '',
        awsSecretAccessKey: '',
      },
    },
    {
      id: 'google',
      name: 'Google Login',
      type: 'google',
      enabled: false,
      isCustomerSpecific: false,
      jitMode: 'domain-match',
      config: {
        clientId: '',
        clientSecret: '',
        redirectUri: window.location.origin + '/oauth/callback',
        scope: 'openid email profile',
      },
    },
    {
      id: 'azure',
      name: 'Microsoft Azure AD',
      type: 'azure',
      enabled: false,
      isCustomerSpecific: false,
      jitMode: 'domain-match',
      config: {
        tenantId: 'common',
        clientId: '',
        clientSecret: '',
        redirectUri: window.location.origin + '/oauth/callback',
        scope: 'openid email profile User.Read',
      },
    },
  ]);

  const [activeProvider, setActiveProvider] = useState<string | null>(null);
  const [detailProvider, setDetailProvider] = useState<IdentityProvider | null>(null);
  // I4: per-provider "Test connection" state — keyed by provider id.
  const [testState, setTestState] = useState<Record<string, { loading: boolean; result: TestConnectionResult | null }>>({});
  // URGENT security fix (2026-07-11): a secret field starts in "display"
  // mode ("•••• configured") once a value is stored; "Replace secret"
  // flips it into an editable password input for THAT field only. Keyed by
  // `${providerId}:${configKey}`.
  const [editingSecrets, setEditingSecrets] = useState<Record<string, boolean>>({});

  // Fetch all provider configurations on component mount
  useEffect(() => {
    const fetchConfigs = async () => {
      try {
        // Fetch Cognito config
        const cognitoConfig = await getCognitoConfig();

        // Fetch Google config
        const googleConfig = await googleService.getConfig();

        // Fetch Microsoft config
        const microsoftConfig = await microsoftService.getConfig();

        // Fetch generic OIDC config
        const oidcConfig = await oidcService.getConfig();

        // Update providers with fetched configurations
        setProviders((currentProviders) =>
          currentProviders.map((provider) => {
            // Update Cognito
            if (provider.type === 'cognito' && cognitoConfig && cognitoConfig.enabled) {
              return {
                ...provider,
                enabled: true,
                isCustomerSpecific: cognitoConfig.isCustomerSpecific ?? false,
                jitMode: cognitoConfig.jitMode || 'domain-match',
                // URGENT security fix (2026-07-11): clientSecret/awsSecretAccessKey
                // are always '' from the server now — hasClientSecret/hasAwsSecretAccessKey
                // drive the "•••• configured" display (see SECRET_CONFIG_KEYS rendering below).
                hasClientSecret: cognitoConfig.hasClientSecret ?? false,
                hasAwsSecretAccessKey: cognitoConfig.hasAwsSecretAccessKey ?? false,
                config: {
                  userPoolId: cognitoConfig.userPoolId,
                  userPoolRegion: cognitoConfig.userPoolRegion,
                  clientId: cognitoConfig.clientId,
                  clientSecret: '',
                  domain: cognitoConfig.domain || '',
                  redirectUri: cognitoConfig.redirectUri,
                  logoutUri: cognitoConfig.logoutUri,
                  scope: cognitoConfig.scope,
                  awsAccessKeyId: cognitoConfig.awsAccessKeyId || '',
                  awsSecretAccessKey: '',
                },
              };
            }

            // Update Google
            if (provider.type === 'google' && googleConfig) {
              return {
                ...provider,
                enabled: googleConfig.enabled,
                isCustomerSpecific: googleConfig.isCustomerSpecific ?? false,
                jitMode: googleConfig.jitMode || 'domain-match',
                hasClientSecret: googleConfig.hasClientSecret ?? false,
                config: {
                  clientId: googleConfig.clientId || '',
                  clientSecret: '',
                  redirectUri: googleConfig.redirectUri || window.location.origin + '/oauth/callback',
                  scope: googleConfig.scope || 'openid email profile',
                },
              };
            }

            // Update Microsoft
            if (provider.type === 'azure' && microsoftConfig) {
              return {
                ...provider,
                enabled: microsoftConfig.enabled,
                isCustomerSpecific: microsoftConfig.isCustomerSpecific ?? false,
                jitMode: microsoftConfig.jitMode || 'domain-match',
                hasClientSecret: microsoftConfig.hasClientSecret ?? false,
                config: {
                  tenantId: microsoftConfig.tenantId || 'common',
                  clientId: microsoftConfig.clientId || '',
                  clientSecret: '',
                  redirectUri: microsoftConfig.redirectUri || window.location.origin + '/oauth/callback',
                  scope: microsoftConfig.scope || 'openid email profile User.Read',
                },
              };
            }

            // Update generic OIDC
            if (provider.type === 'oidc' && oidcConfig) {
              return {
                ...provider,
                enabled: oidcConfig.enabled,
                isCustomerSpecific: oidcConfig.isCustomerSpecific ?? false,
                jitMode: oidcConfig.jitMode || 'domain-match',
                hasClientSecret: oidcConfig.hasClientSecret ?? false,
                config: {
                  issuer: oidcConfig.issuer || '',
                  clientId: oidcConfig.clientId || '',
                  clientSecret: '',
                  redirectUri: oidcConfig.redirectUri || window.location.origin + '/oauth/callback',
                  scope: oidcConfig.scope || 'openid email profile',
                },
              };
            }

            return provider;
          })
        );
      } catch (error) {
        console.error('Error fetching provider configurations:', error);
      }
    };

    fetchConfigs();
  }, []);

  const toggleProvider = async (id: string) => {
    const provider = providers.find(p => p.id === id);
    
    if (!provider) return;
    
    // If enabling a non-Cognito provider, disable Cognito
    if (!provider.enabled && provider.type !== 'cognito') {
      try {
        // Disable Cognito when another SSO option is selected
        await disableCognitoForSso(provider.type.toUpperCase());
        
        // Update providers state to reflect the change
        setProviders(
          providers.map((p) => {
            if (p.id === id) {
              // Enable the selected provider
              return { ...p, enabled: true };
            } else if (p.type === 'cognito') {
              // Disable Cognito
              return { ...p, enabled: false };
            }
            return p;
          })
        );
      } catch (error) {
        console.error(`Error disabling Cognito for SSO type ${provider.type}:`, error);
        // Still update the UI even if the API call fails
        setProviders(
          providers.map((p) =>
            p.id === id ? { ...p, enabled: !p.enabled } : p
          )
        );
      }
    } else {
      // For toggling Cognito or disabling any provider
      setProviders(
        providers.map((p) =>
          p.id === id ? { ...p, enabled: !p.enabled } : p
        )
      );
    }
  };

  const updateProviderConfig = (id: string, key: string, value: string) => {
    setProviders(
      providers.map((provider) =>
        provider.id === id
          ? { ...provider, config: { ...provider.config, [key]: value } }
          : provider
      )
    );
  };

  // I3: lets an admin choose whether a save applies globally (every tenant
  // without its own override) or only to their own organization.
  const setCustomerSpecific = (id: string, isCustomerSpecific: boolean) => {
    setProviders(
      providers.map((provider) => (provider.id === id ? { ...provider, isCustomerSpecific } : provider))
    );
  };

  const setJitMode = (id: string, jitMode: JitMode) => {
    setProviders(providers.map((provider) => (provider.id === id ? { ...provider, jitMode } : provider)));
  };

  const handleSave = async () => {
    try {
      // Uses the shared token accessor (checks both localStorage and
      // sessionStorage, respecting "Remember me") instead of reading
      // localStorage directly — a sessionStorage-only session used to
      // silently no-op this check (2026-07-11 fix). The actual request auth
      // is handled by authAxios's interceptor regardless; this is purely a
      // friendly early warning.
      if (!getAuthToken()) {
        toast.warning('Please login to save settings');
        return;
      }

      // Save each enabled provider. `isCustomerSpecific`/`jitMode` are now
      // threaded through on every save (I3 fix — this used to always save
      // the global config regardless of what the admin selected, and never
      // saved Cognito's configuration at all). An empty clientSecret/
      // awsSecretAccessKey (the field was never touched via "Replace
      // secret") preserves whatever the server already has stored —
      // preserve-on-omit, see oauth.utils.ts.
      for (const provider of providers) {
        if (provider.type === 'google' && provider.enabled) {
          await googleService.saveConfig({
            enabled: provider.enabled,
            clientId: provider.config.clientId,
            clientSecret: provider.config.clientSecret,
            redirectUri: provider.config.redirectUri,
            scope: provider.config.scope || 'openid email profile',
            isCustomerSpecific: provider.isCustomerSpecific,
            jitMode: provider.jitMode,
          });
        }

        if (provider.type === 'azure' && provider.enabled) {
          await microsoftService.saveConfig({
            enabled: provider.enabled,
            tenantId: provider.config.tenantId || 'common',
            clientId: provider.config.clientId,
            clientSecret: provider.config.clientSecret,
            redirectUri: provider.config.redirectUri,
            scope: provider.config.scope || 'openid email profile User.Read',
            isCustomerSpecific: provider.isCustomerSpecific,
            jitMode: provider.jitMode,
          });
        }

        if (provider.type === 'cognito' && provider.enabled) {
          await saveCognitoConfig({
            enabled: provider.enabled,
            userPoolId: provider.config.userPoolId,
            userPoolRegion: provider.config.userPoolRegion || 'us-east-1',
            clientId: provider.config.clientId,
            clientSecret: provider.config.clientSecret,
            domain: provider.config.domain,
            redirectUri: provider.config.redirectUri,
            logoutUri: provider.config.logoutUri,
            scope: provider.config.scope || 'phone openid email',
            isCustomerSpecific: provider.isCustomerSpecific,
            jitMode: provider.jitMode,
            awsAccessKeyId: provider.config.awsAccessKeyId,
            awsSecretAccessKey: provider.config.awsSecretAccessKey,
          });
        }

        if (provider.type === 'oidc' && provider.enabled) {
          await oidcService.saveConfig({
            enabled: provider.enabled,
            issuer: provider.config.issuer,
            clientId: provider.config.clientId,
            clientSecret: provider.config.clientSecret,
            redirectUri: provider.config.redirectUri,
            scope: provider.config.scope || 'openid email profile',
            isCustomerSpecific: provider.isCustomerSpecific,
            jitMode: provider.jitMode,
          });
        }
      }

      // Every enabled provider that just saved successfully now has SOME
      // secret persisted server-side (the save itself 400s otherwise — see
      // preserve-on-omit) — flip its display back to "•••• configured" and
      // collapse any open "Replace secret" editors instead of leaving them
      // showing blank fields until the next full page load.
      setProviders((current) =>
        current.map((provider) =>
          provider.enabled && (provider.type === 'google' || provider.type === 'azure' || provider.type === 'cognito' || provider.type === 'oidc')
            ? {
                ...provider,
                hasClientSecret: true,
                hasAwsSecretAccessKey: provider.type === 'cognito' ? Boolean(provider.config.awsSecretAccessKey) || provider.hasAwsSecretAccessKey : provider.hasAwsSecretAccessKey,
                config: { ...provider.config, clientSecret: '', awsSecretAccessKey: '' },
              }
            : provider
        )
      );
      setEditingSecrets({});

      toast.success('Identity provider settings saved successfully!');
    } catch (error) {
      console.error('Error saving provider settings:', error);
      toast.error('Failed to save settings. Please try again.');
    }
  };

  // I4: validate the values currently in the form against the real
  // provider, without saving first — so a bad Client Secret or wrong
  // Tenant ID is caught before it's persisted. An untouched (blank)
  // clientSecret field tests against the currently stored secret —
  // preserve-on-omit, resolved server-side (see google/microsoft/cognito
  // controller.ts testConnection).
  const handleTestConnection = async (provider: IdentityProvider) => {
    if (!getAuthToken()) {
      toast.warning('Please login to test this configuration');
      return;
    }

    setTestState((prev) => ({ ...prev, [provider.id]: { loading: true, result: null } }));

    let result: TestConnectionResult;
    try {
      if (provider.type === 'google') {
        result = await googleService.testConnection({
          clientId: provider.config.clientId,
          clientSecret: provider.config.clientSecret,
          redirectUri: provider.config.redirectUri,
        });
      } else if (provider.type === 'azure') {
        result = await microsoftService.testConnection({
          clientId: provider.config.clientId,
          clientSecret: provider.config.clientSecret,
          tenantId: provider.config.tenantId,
          redirectUri: provider.config.redirectUri,
        });
      } else if (provider.type === 'cognito') {
        result = await testCognitoConnection({
          userPoolId: provider.config.userPoolId,
          userPoolRegion: provider.config.userPoolRegion,
          clientId: provider.config.clientId,
          clientSecret: provider.config.clientSecret,
          domain: provider.config.domain
        });
      } else if (provider.type === 'oidc') {
        result = await oidcService.testConnection({
          issuer: provider.config.issuer,
          clientId: provider.config.clientId,
          clientSecret: provider.config.clientSecret,
          redirectUri: provider.config.redirectUri,
        });
      } else {
        result = { success: false, message: 'Testing is not available for this provider type.' };
      }
    } catch (error) {
      console.error(`Error testing ${provider.name} connection:`, error);
      result = { success: false, message: 'Failed to test this configuration. Please try again.' };
    }

    setTestState((prev) => ({ ...prev, [provider.id]: { loading: false, result } }));
  };

  // URGENT security fix (2026-07-11): the server never sends a secret's
  // real value (see SECRET_CONFIG_KEYS) — these helpers drive the
  // "•••• configured" / "Replace secret" affordance in place of a raw
  // bound input for clientSecret/awsSecretAccessKey.
  const secretEditKey = (provider: IdentityProvider, key: string) => `${provider.id}:${key}`;

  const hasStoredSecret = (provider: IdentityProvider, key: string): boolean =>
    key === 'clientSecret' ? Boolean(provider.hasClientSecret) : Boolean(provider.hasAwsSecretAccessKey);

  const startReplacingSecret = (provider: IdentityProvider, key: string) => {
    setEditingSecrets((prev) => ({ ...prev, [secretEditKey(provider, key)]: true }));
    updateProviderConfig(provider.id, key, '');
  };

  const cancelReplacingSecret = (provider: IdentityProvider, key: string) => {
    setEditingSecrets((prev) => ({ ...prev, [secretEditKey(provider, key)]: false }));
    updateProviderConfig(provider.id, key, '');
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Identity Providers</h1>
        <button
          onClick={handleSave}
          className="bg-blue-500 hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700 text-white px-4 py-2 rounded"
        >
          Save Changes
        </button>
      </div>

      <p className="text-gray-600 dark:text-gray-300 mb-8">
        Configure external identity providers to enable single sign-on for your users.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {providers.map((provider) => {
          // SAML remains a UI stub — no backend implementation exists.
          // Generic OAuth 2.0/OIDC graduated from stub to a real,
          // bring-your-own-issuer provider (discovery + JWKS verification on
          // the server, see server/src/module/oidc).
          const isComingSoon = provider.type === 'saml';

          return (
          <div key={provider.id} className={`border dark:border-gray-600 rounded-lg shadow-sm overflow-hidden ${isComingSoon ? 'opacity-60' : ''}`}>
            <div className="flex justify-between items-center p-4 bg-gray-50 dark:bg-gray-700 border-b dark:border-gray-600">
              <div
                className={`flex items-center rounded ${isComingSoon ? '' : 'cursor-pointer hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500'}`}
                {...(!isComingSoon
                  ? {
                      role: 'button',
                      tabIndex: 0,
                      'aria-label': `View details for ${provider.name}`,
                      onClick: () => setDetailProvider(provider),
                      onKeyDown: (e: React.KeyboardEvent) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setDetailProvider(provider);
                        }
                      },
                    }
                  : {})}
              >
                <span className="font-medium text-lg text-gray-900 dark:text-white">{provider.name}</span>
                <span
                  className={`ml-3 px-2 py-1 text-xs font-semibold rounded-full ${
                    isComingSoon
                      ? 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200'
                      : provider.enabled
                      ? 'bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-100'
                      : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                  }`}
                >
                  {isComingSoon ? 'Coming soon' : provider.enabled ? 'Enabled' : 'Disabled'}
                </span>
              </div>
              <div className="flex items-center">
                {!isComingSoon && (
                  <>
                    <label className="inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        className="sr-only peer"
                        checked={provider.enabled}
                        onChange={() => toggleProvider(provider.id)}
                      />
                      <div className="relative w-11 h-6 bg-gray-200 dark:bg-gray-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 dark:after:border-gray-600 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600 dark:peer-checked:bg-blue-700"></div>
                    </label>
                    <button
                      onClick={() => setActiveProvider(activeProvider === provider.id ? null : provider.id)}
                      className="ml-4 text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                    >
                      {activeProvider === provider.id ? 'Hide' : 'Configure'}
                    </button>
                  </>
                )}
              </div>
            </div>

            <Modal
              isOpen={!isComingSoon && activeProvider === provider.id}
              onClose={() => setActiveProvider(null)}
              title={`Configure ${provider.name}`}
              subtitle={`${provider.type.toUpperCase()} identity provider`}
              size="lg"
              footer={
                <>
                  <Button variant="secondary" onClick={() => setActiveProvider(null)}>
                    Close
                  </Button>
                  <Button
                    variant="primary"
                    onClick={async () => {
                      await handleSave();
                      setActiveProvider(null);
                    }}
                  >
                    Save changes
                  </Button>
                </>
              }
            >
              <div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {Object.entries(provider.config).map(([key, value]) => {
                    const label = key
                      .replace(/([A-Z])/g, ' $1')
                      .replace(/^./, (str) => str.toUpperCase())
                      .replace(/Url/g, 'URL')
                      .replace(/Uri/g, 'URI')
                      .replace(/Id/g, 'ID');

                    if (SECRET_CONFIG_KEYS.has(key)) {
                      const stored = hasStoredSecret(provider, key);
                      const isEditing = editingSecrets[secretEditKey(provider, key)] || !stored;

                      return (
                        <div key={key}>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            {label}
                          </label>
                          {isEditing ? (
                            <div className="flex items-center gap-2">
                              <input
                                type="password"
                                value={value}
                                onChange={(e) => updateProviderConfig(provider.id, key, e.target.value)}
                                className="w-full px-3 py-2 border dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                placeholder={stored ? 'Enter a new value to replace it' : `Enter ${key}`}
                                autoFocus={stored}
                              />
                              {stored && (
                                <button
                                  type="button"
                                  onClick={() => cancelReplacingSecret(provider, key)}
                                  className="px-3 py-2 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white whitespace-nowrap"
                                >
                                  Cancel
                                </button>
                              )}
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <span className="flex-1 px-3 py-2 border dark:border-gray-600 rounded bg-gray-50 dark:bg-gray-700 text-gray-500 dark:text-gray-400 text-sm">
                                •••• configured
                              </span>
                              <button
                                type="button"
                                onClick={() => startReplacingSecret(provider, key)}
                                className="px-3 py-2 text-sm bg-gray-200 hover:bg-gray-300 dark:bg-gray-600 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-200 rounded whitespace-nowrap"
                              >
                                Replace secret
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    }

                    return (
                      <div key={key}>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          {label}
                        </label>
                        <input
                          type="text"
                          value={value}
                          onChange={(e) => updateProviderConfig(provider.id, key, e.target.value)}
                          className="w-full px-3 py-2 border dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                          placeholder={`Enter ${key}`}
                        />
                      </div>
                    );
                  })}
                </div>

                {(provider.type === 'google' || provider.type === 'azure' || provider.type === 'cognito' || provider.type === 'oidc') && (
                  <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Configuration scope
                      </label>
                      <select
                        value={provider.isCustomerSpecific ? 'customer' : 'global'}
                        onChange={(e) => setCustomerSpecific(provider.id, e.target.value === 'customer')}
                        className="w-full px-3 py-2 border dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      >
                        <option value="global">Global default (every organization without its own override)</option>
                        <option value="customer">This organization only</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        New user provisioning (JIT)
                      </label>
                      <select
                        value={provider.jitMode || 'domain-match'}
                        onChange={(e) => setJitMode(provider.id, e.target.value as JitMode)}
                        className="w-full px-3 py-2 border dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      >
                        {JIT_MODE_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        {JIT_MODE_OPTIONS.find((opt) => opt.value === (provider.jitMode || 'domain-match'))?.hint}
                      </p>
                    </div>
                  </div>
                )}

                {(provider.type === 'google' || provider.type === 'azure' || provider.type === 'cognito' || provider.type === 'oidc') && (
                  <div className="mt-4">
                    <button
                      type="button"
                      onClick={() => handleTestConnection(provider)}
                      disabled={testState[provider.id]?.loading}
                      className="px-3 py-1.5 bg-gray-700 hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded text-sm"
                    >
                      {testState[provider.id]?.loading ? 'Testing…' : 'Test connection'}
                    </button>

                    {testState[provider.id]?.result && (
                      <div
                        className={`mt-3 p-3 rounded text-sm ${
                          testState[provider.id]!.result!.success
                            ? 'bg-green-50 dark:bg-green-900/30 text-green-800 dark:text-green-200 border border-green-200 dark:border-green-800'
                            : 'bg-red-50 dark:bg-red-900/30 text-red-800 dark:text-red-200 border border-red-200 dark:border-red-800'
                        }`}
                      >
                        <p className="font-medium">{testState[provider.id]!.result!.message}</p>
                        {testState[provider.id]!.result!.details && testState[provider.id]!.result!.details!.length > 0 && (
                          <ul className="list-disc list-inside mt-1 space-y-0.5 opacity-90">
                            {testState[provider.id]!.result!.details!.map((line, i) => (
                              <li key={i}>{line}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {provider.type === 'saml' && (
                  <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900 rounded text-sm text-blue-800 dark:text-blue-100">
                    <p className="font-medium">SAML Configuration Notes:</p>
                    <ul className="list-disc list-inside mt-1 space-y-1">
                      <li>Entity ID: {window.location.origin}</li>
                      <li>ACS URL: {window.location.origin}/auth/saml/callback</li>
                      <li>
                        You can upload your Identity Provider metadata XML file to automatically
                        configure these settings.
                      </li>
                    </ul>
                  </div>
                )}

                {provider.type === 'oidc' && (
                  <>
                    <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900 rounded text-sm text-blue-800 dark:text-blue-100">
                      <p className="font-medium">Generic OIDC Configuration Notes:</p>
                      <ul className="list-disc list-inside mt-1 space-y-1">
                        <li>Redirect URI: {window.location.origin}/oauth/callback</li>
                        <li>
                          Issuer must be the provider's base URL — discovery is fetched from
                          <code className="mx-1">{'{issuer}'}/.well-known/openid-configuration</code>.
                        </li>
                        <li>Add the redirect URI above to the provider's allowed redirect URIs.</li>
                        <li>Works with any OIDC-conformant identity provider (Okta, Auth0, Keycloak, PingFederate, …).</li>
                      </ul>
                    </div>
                    <div className="mt-4 flex justify-between items-center">
                      <button
                        onClick={async () => {
                          try {
                            if (!getAuthToken()) {
                              toast.warning('Please login first');
                              return;
                            }
                            const success = await oidcService.resetConfig();
                            if (success) {
                              const config = await oidcService.getConfig();
                              if (config) {
                                setProviders(
                                  providers.map((p) =>
                                    p.type === 'oidc'
                                      ? {
                                          ...p,
                                          enabled: config.enabled,
                                          hasClientSecret: config.hasClientSecret ?? false,
                                          config: {
                                            issuer: config.issuer || '',
                                            clientId: config.clientId || '',
                                            clientSecret: '',
                                            redirectUri: config.redirectUri || window.location.origin + '/oauth/callback',
                                            scope: config.scope || 'openid email profile',
                                          },
                                        }
                                      : p
                                  )
                                );
                                setEditingSecrets((prev) => ({ ...prev, ['oidc:clientSecret']: false }));
                                toast.success('OIDC configuration reset to global settings');
                              }
                            }
                          } catch (error) {
                            console.error('Error resetting OIDC configuration:', error);
                            toast.error('Error resetting OIDC configuration');
                          }
                        }}
                        className="px-3 py-1 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 rounded text-sm"
                      >
                        Reset to Global Settings
                      </button>
                    </div>
                  </>
                )}

                {provider.type === 'google' && (
                  <>
                    <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900 rounded text-sm text-blue-800 dark:text-blue-100">
                      <p className="font-medium">Google OAuth Configuration Notes:</p>
                      <ul className="list-disc list-inside mt-1 space-y-1">
                        <li>Redirect URI: {window.location.origin}/oauth/callback</li>
                        <li>Go to Google Cloud Console → APIs & Services → Credentials</li>
                        <li>Create OAuth 2.0 Client ID (Web application)</li>
                        <li>Add the redirect URI above to authorized redirect URIs</li>
                        <li>Copy Client ID and Client Secret from the credentials page</li>
                      </ul>
                    </div>
                    <div className="mt-4 flex justify-between items-center">
                      <button
                        onClick={async () => {
                          try {
                            if (!getAuthToken()) {
                              toast.warning('Please login first');
                              return;
                            }
                            const success = await googleService.resetConfig();
                            if (success) {
                              const config = await googleService.getConfig();
                              if (config) {
                                setProviders(
                                  providers.map((p) =>
                                    p.type === 'google'
                                      ? {
                                          ...p,
                                          enabled: config.enabled,
                                          hasClientSecret: config.hasClientSecret ?? false,
                                          config: {
                                            clientId: config.clientId || '',
                                            clientSecret: '',
                                            redirectUri: config.redirectUri || window.location.origin + '/oauth/callback',
                                            scope: config.scope || 'openid email profile',
                                          },
                                        }
                                      : p
                                  )
                                );
                                setEditingSecrets((prev) => ({ ...prev, ['google:clientSecret']: false }));
                                toast.success('Google configuration reset to global settings');
                              }
                            }
                          } catch (error) {
                            console.error('Error resetting Google configuration:', error);
                            toast.error('Error resetting Google configuration');
                          }
                        }}
                        className="px-3 py-1 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 rounded text-sm"
                      >
                        Reset to Global Settings
                      </button>
                    </div>
                  </>
                )}

                {provider.type === 'azure' && (
                  <>
                    <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900 rounded text-sm text-blue-800 dark:text-blue-100">
                      <p className="font-medium">Microsoft Azure AD Configuration Notes:</p>
                      <ul className="list-disc list-inside mt-1 space-y-1">
                        <li>Redirect URI: {window.location.origin}/oauth/callback</li>
                        <li>Go to Azure Portal → Azure Active Directory → App registrations</li>
                        <li>Register a new application or select existing</li>
                        <li>Add the redirect URI above to the app's redirect URIs</li>
                        <li>Create a client secret in Certificates & secrets</li>
                        <li>Copy Application (client) ID, Directory (tenant) ID, and Secret</li>
                        <li>Tenant ID: Use 'common' for multi-tenant or your tenant ID for single-tenant</li>
                      </ul>
                    </div>
                    <div className="mt-4 flex justify-between items-center">
                      <button
                        onClick={async () => {
                          try {
                            if (!getAuthToken()) {
                              toast.warning('Please login first');
                              return;
                            }
                            const success = await microsoftService.resetConfig();
                            if (success) {
                              const config = await microsoftService.getConfig();
                              if (config) {
                                setProviders(
                                  providers.map((p) =>
                                    p.type === 'azure'
                                      ? {
                                          ...p,
                                          enabled: config.enabled,
                                          hasClientSecret: config.hasClientSecret ?? false,
                                          config: {
                                            tenantId: config.tenantId || 'common',
                                            clientId: config.clientId || '',
                                            clientSecret: '',
                                            redirectUri: config.redirectUri || window.location.origin + '/oauth/callback',
                                            scope: config.scope || 'openid email profile User.Read',
                                          },
                                        }
                                      : p
                                  )
                                );
                                setEditingSecrets((prev) => ({ ...prev, ['azure:clientSecret']: false }));
                                toast.success('Microsoft configuration reset to global settings');
                              }
                            }
                          } catch (error) {
                            console.error('Error resetting Microsoft configuration:', error);
                            toast.error('Error resetting Microsoft configuration');
                          }
                        }}
                        className="px-3 py-1 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 rounded text-sm"
                      >
                        Reset to Global Settings
                      </button>
                    </div>
                  </>
                )}

                {provider.type === 'cognito' && (
                  <>
                    <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900 rounded text-sm text-blue-800 dark:text-blue-100">
                      <p className="font-medium">AWS Cognito Configuration Notes:</p>
                      <ul className="list-disc list-inside mt-1 space-y-1">
                        <li>Redirect URI: {window.location.origin}/auth/cognito/callback</li>
                        <li>Logout URI: {window.location.origin}</li>
                        <li>
                          The User Pool ID format is: region_poolid (e.g., us-east-1_abcd1234)
                        </li>
                        <li>
                          Configure these URIs in your Cognito User Pool App Client settings.
                        </li>
                      </ul>
                    </div>
                    <div className="mt-4 flex justify-between items-center">
                      <button
                        onClick={async () => {
                          try {
                            const success = await resetCognitoConfig();
                            if (success) {
                              // Fetch the global config
                              const config = await getCognitoConfig();
                              if (config) {
                                // Update the provider with global config
                                setProviders(
                                  providers.map((p) =>
                                    p.type === 'cognito'
                                      ? {
                                          ...p,
                                          enabled: config.enabled,
                                          hasClientSecret: config.hasClientSecret ?? false,
                                          hasAwsSecretAccessKey: config.hasAwsSecretAccessKey ?? false,
                                          config: {
                                            userPoolId: config.userPoolId,
                                            userPoolRegion: config.userPoolRegion,
                                            clientId: config.clientId,
                                            clientSecret: '',
                                            domain: config.domain || '',
                                            redirectUri: config.redirectUri,
                                            logoutUri: config.logoutUri,
                                            scope: config.scope,
                                            awsAccessKeyId: config.awsAccessKeyId || '',
                                            awsSecretAccessKey: '',
                                          },
                                        }
                                      : p
                                  )
                                );
                                setEditingSecrets((prev) => ({ ...prev, ['cognito:clientSecret']: false, ['cognito:awsSecretAccessKey']: false }));
                                toast.success('Cognito configuration reset to global settings');
                              }
                            } else {
                              toast.error('Failed to reset Cognito configuration');
                            }
                          } catch (error) {
                            console.error('Error resetting Cognito configuration:', error);
                            toast.error('Error resetting Cognito configuration');
                          }
                        }}
                        className="px-3 py-1 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 rounded text-sm"
                      >
                        Reset to Global Settings
                      </button>
                      <div className="text-xs text-gray-500 dark:text-gray-400">

                      </div>
                    </div>
                  </>
                )}
              </div>
            </Modal>

            {isComingSoon && (
              <div className="p-4 bg-white dark:bg-gray-800 text-sm text-gray-500 dark:text-gray-400">
                SAML single sign-on is not yet available.
              </div>
            )}
          </div>
          );
        })}
      </div>

      <IdentityProviderDetailModal
        provider={detailProvider}
        jitModeLabel={
          detailProvider && ['google', 'azure', 'cognito'].includes(detailProvider.type)
            ? JIT_MODE_OPTIONS.find((o) => o.value === (detailProvider.jitMode || 'domain-match'))?.label
            : undefined
        }
        onClose={() => setDetailProvider(null)}
        onEdit={(p) => {
          setDetailProvider(null);
          setActiveProvider(p.id);
        }}
      />
    </div>
  );
};

export default IdentityProviderPage;
