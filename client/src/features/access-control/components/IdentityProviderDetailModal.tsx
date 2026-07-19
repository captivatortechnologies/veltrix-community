import React from 'react';
import { Settings2 } from 'lucide-react';
import { Modal } from '../../../components/shared/Modal';
import { Button } from '../../../components/shared/Button';
import { Badge } from '../../../components/shared/Badge';

/** Config keys that hold a secret — rendered as a presence indicator, never a value. */
const SECRET_KEYS = new Set(['clientSecret', 'awsSecretAccessKey']);

/** The subset of an identity-provider record this modal renders. */
export interface IdpProviderDetail {
  id: string;
  name: string;
  type: string;
  enabled: boolean;
  isCustomerSpecific: boolean;
  config: Record<string, string>;
  hasClientSecret?: boolean;
  hasAwsSecretAccessKey?: boolean;
}

export interface IdentityProviderDetailModalProps {
  /** The provider to show. `null` keeps the modal closed. */
  provider: IdpProviderDetail | null;
  /** Human label for the provider's user-provisioning (JIT) mode, when applicable. */
  jitModeLabel?: string;
  onClose: () => void;
  /** Open the provider's configuration editor. */
  onEdit: (provider: IdpProviderDetail) => void;
}

/** Turn a camelCase config key into a readable label (matches the editor's labels). */
function formatLabel(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (s) => s.toUpperCase())
    .replace(/Url/g, 'URL')
    .replace(/Uri/g, 'URI')
    .replace(/Id/g, 'ID');
}

function hasStoredSecret(provider: IdpProviderDetail, key: string): boolean {
  return key === 'clientSecret' ? Boolean(provider.hasClientSecret) : Boolean(provider.hasAwsSecretAccessKey);
}

const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="grid grid-cols-[150px_1fr] gap-3 py-2 border-b border-border last:border-b-0">
    <span className="text-sm text-content-secondary">{label}</span>
    <span className="text-sm text-content-primary break-words">{children}</span>
  </div>
);

/**
 * Read-only details for a single identity provider, opened by clicking a provider
 * card. Summarizes status, scope, user-provisioning mode and every config field
 * (secrets shown only as "configured"/"Not set"). Providers are a fixed catalog,
 * so there is no delete — the footer offers Edit configuration, which opens the
 * inline editor.
 */
export const IdentityProviderDetailModal: React.FC<IdentityProviderDetailModalProps> = ({
  provider,
  jitModeLabel,
  onClose,
  onEdit,
}) => {
  return (
    <Modal
      isOpen={provider !== null}
      onClose={onClose}
      title={provider?.name}
      subtitle={provider ? `${provider.type.toUpperCase()} identity provider` : undefined}
      size="md"
      footer={
        provider ? (
          <>
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
            <Button
              variant="primary"
              leftIcon={<Settings2 size={16} aria-hidden="true" />}
              onClick={() => onEdit(provider)}
            >
              Edit configuration
            </Button>
          </>
        ) : null
      }
    >
      {provider && (
        <div>
          <Row label="Status">
            <Badge variant={provider.enabled ? 'success' : 'secondary'}>
              {provider.enabled ? 'Enabled' : 'Disabled'}
            </Badge>
          </Row>
          <Row label="Scope">
            {provider.isCustomerSpecific ? 'This organization only' : 'Platform-wide default'}
          </Row>
          {jitModeLabel && <Row label="User provisioning">{jitModeLabel}</Row>}
          {Object.entries(provider.config).map(([key, value]) => (
            <Row key={key} label={formatLabel(key)}>
              {SECRET_KEYS.has(key) ? (
                hasStoredSecret(provider, key) ? (
                  <span className="text-content-secondary">•••• configured</span>
                ) : (
                  <span className="text-content-tertiary">Not set</span>
                )
              ) : value ? (
                value
              ) : (
                <span className="text-content-tertiary">Not set</span>
              )}
            </Row>
          ))}
        </div>
      )}
    </Modal>
  );
};

export default IdentityProviderDetailModal;
