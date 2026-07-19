import React from 'react';
import { Edit2, Trash2 } from 'lucide-react';
import { Modal } from '../../../components/shared/Modal';
import { Button } from '../../../components/shared/Button';
import { Badge } from '../../../components/shared/Badge';

/** The subset of a user record this modal renders. */
export interface UserDetail {
  id: string | number;
  email: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  phoneNumber?: string;
  role?: string;
  authProvider?: string;
}

export interface UserDetailModalProps {
  /** The user to show. `null` keeps the modal closed. */
  user: UserDetail | null;
  /** Whether to surface the auth-provider row (Cognito installs only). */
  cognitoEnabled?: boolean;
  onClose: () => void;
  onEdit: (user: UserDetail) => void;
  onDelete: (user: UserDetail) => void;
}

function displayName(user: UserDetail): string {
  if (user.firstName || user.lastName) return `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim();
  return user.name || user.email;
}

const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="grid grid-cols-[120px_1fr] gap-3 py-2 border-b border-border last:border-b-0">
    <span className="text-sm text-content-secondary">{label}</span>
    <span className="text-sm text-content-primary break-words">{children}</span>
  </div>
);

/**
 * Read-only details for a single user, opened by clicking a row in the users
 * table. Shows identity, contact, role and auth provider, with Edit and Delete
 * actions in the footer.
 */
export const UserDetailModal: React.FC<UserDetailModalProps> = ({
  user,
  cognitoEnabled = false,
  onClose,
  onEdit,
  onDelete,
}) => {
  return (
    <Modal
      isOpen={user !== null}
      onClose={onClose}
      title={user ? displayName(user) : undefined}
      subtitle={user?.email}
      size="md"
      footer={
        user ? (
          <>
            <Button
              variant="danger"
              leftIcon={<Trash2 size={16} aria-hidden="true" />}
              onClick={() => onDelete(user)}
            >
              Delete
            </Button>
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
            <Button
              variant="primary"
              leftIcon={<Edit2 size={16} aria-hidden="true" />}
              onClick={() => onEdit(user)}
            >
              Edit
            </Button>
          </>
        ) : null
      }
    >
      {user && (
        <div>
          <Row label="Name">{displayName(user)}</Row>
          <Row label="Email">{user.email}</Row>
          <Row label="Phone">{user.phoneNumber || '—'}</Row>
          <Row label="Role">
            <Badge variant={user.role === 'Admin' ? 'primary' : 'secondary'}>{user.role || 'User'}</Badge>
          </Row>
          {cognitoEnabled && (
            <Row label="Auth provider">
              <Badge variant="secondary">{user.authProvider || 'LOCAL'}</Badge>
            </Row>
          )}
        </div>
      )}
    </Modal>
  );
};

export default UserDetailModal;
