/**
 * ApprovalSubmissionDialog - Dialog for submitting configuration for approval
 *
 * Features:
 * - Select target environment/tag for deployment
 * - Select approver(s) from user list
 * - Add optional comment
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Search, X, Users, Server, MessageSquare } from 'lucide-react';
import { MultiSelect } from '../../MultiSelect';

interface User {
  id: string;
  name: string;
  email: string;
  role?: string;
}

interface Tag {
  id: string;
  name: string;
  color?: string;
}

interface ApprovalSubmissionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: ApprovalSubmissionData) => Promise<void>;
  configName: string;
  fetchUsers: () => Promise<User[]>;
  fetchTags: () => Promise<Tag[]>;
  /** Pre-select environments already chosen on the canvas */
  initialSelectedEnvironments?: string[];
}

export interface ApprovalSubmissionData {
  environmentIds: string[];
  approverIds: string[];
  comment?: string;
}

export const ApprovalSubmissionDialog: React.FC<ApprovalSubmissionDialogProps> = ({
  isOpen,
  onClose,
  onSubmit,
  configName,
  fetchUsers,
  fetchTags,
  initialSelectedEnvironments = [],
}) => {
  // State
  const [users, setUsers] = useState<User[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [selectedApprovers, setSelectedApprovers] = useState<string[]>([]);
  const [selectedEnvironments, setSelectedEnvironments] = useState<string[]>(initialSelectedEnvironments);
  const [comment, setComment] = useState('');
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [usersData, tagsData] = await Promise.all([
        fetchUsers(),
        fetchTags(),
      ]);
      setUsers(usersData);
      setTags(tagsData);
    } catch (err) {
      setError('Failed to load users and environments');
      console.error('Error loading data:', err);
    } finally {
      setIsLoading(false);
    }
  }, [fetchUsers, fetchTags]);

  // Load users and tags when dialog opens, pre-select environments from canvas
  useEffect(() => {
    if (isOpen) {
      loadData();
      setSelectedEnvironments(initialSelectedEnvironments);
    }
  }, [isOpen, loadData, initialSelectedEnvironments]);

  // Filter users based on search
  const filteredUsers = users.filter(user =>
    user.name.toLowerCase().includes(userSearchQuery.toLowerCase()) ||
    user.email.toLowerCase().includes(userSearchQuery.toLowerCase())
  );

  // Toggle approver selection
  const handleApproverToggle = useCallback((userId: string) => {
    setSelectedApprovers(prev =>
      prev.includes(userId)
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  }, []);

  // Handle submit
  const handleSubmit = async () => {
    if (selectedApprovers.length === 0) {
      setError('Please select at least one approver');
      return;
    }
    if (selectedEnvironments.length === 0) {
      setError('Please select at least one environment');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        environmentIds: selectedEnvironments,
        approverIds: selectedApprovers,
        comment: comment.trim() || undefined,
      });
      // Reset state and close
      setSelectedApprovers([]);
      setSelectedEnvironments([]);
      setComment('');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit for approval');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle close
  const handleClose = () => {
    if (!isSubmitting) {
      setSelectedApprovers([]);
      setSelectedEnvironments([]);
      setComment('');
      setUserSearchQuery('');
      setError(null);
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Submit for Approval
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {configName}
            </p>
          </div>
          <button
            onClick={handleClose}
            disabled={isSubmitting}
            className="text-gray-400 hover:text-gray-500 dark:text-gray-300 dark:hover:text-gray-200 disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Error message */}
          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md text-sm text-red-700 dark:text-red-300">
              {error}
            </div>
          )}

          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : (
            <>
              {/* Environment Selection */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Server className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                  <h4 className="text-sm font-medium text-gray-900 dark:text-white">
                    Target Environment(s) <span className="text-red-500">*</span>
                  </h4>
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                  Select the environment(s) where this configuration will be deployed
                </p>
                {tags.length > 0 ? (
                  <MultiSelect
                    aria-label="Target environments"
                    placeholder="Select environments…"
                    options={tags.map((tag) => ({ value: tag.id, label: tag.name }))}
                    value={selectedEnvironments}
                    onChange={setSelectedEnvironments}
                  />
                ) : (
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    No environments available
                  </p>
                )}
              </div>

              {/* Approver Selection */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Users className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                  <h4 className="text-sm font-medium text-gray-900 dark:text-white">
                    Approver(s) <span className="text-red-500">*</span>
                  </h4>
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                  Select who should review and approve this configuration
                </p>

                {/* Search input */}
                <div className="relative mb-3">
                  <input
                    type="text"
                    placeholder="Search users..."
                    value={userSearchQuery}
                    onChange={(e) => setUserSearchQuery(e.target.value)}
                    className="w-full px-3 py-2 pl-10 border rounded-md bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white placeholder-gray-400"
                  />
                  <Search className="h-4 w-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                </div>

                {/* Selected approvers chips */}
                {selectedApprovers.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-3">
                    {selectedApprovers.map(approverId => {
                      const user = users.find(u => u.id === approverId);
                      return user ? (
                        <span
                          key={approverId}
                          className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-sm rounded-full"
                        >
                          {user.name}
                          <button
                            onClick={() => handleApproverToggle(approverId)}
                            className="hover:text-blue-900 dark:hover:text-blue-100"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ) : null;
                    })}
                  </div>
                )}

                {/* Users list */}
                <div className="max-h-48 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-md">
                  {filteredUsers.length > 0 ? (
                    <ul className="divide-y divide-gray-200 dark:divide-gray-700">
                      {filteredUsers.map(user => (
                        <li key={user.id}>
                          <label className="flex items-center gap-3 p-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700">
                            <input
                              type="checkbox"
                              checked={selectedApprovers.includes(user.id)}
                              onChange={() => handleApproverToggle(user.id)}
                              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                            />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                                {user.name}
                              </p>
                              <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                {user.email}
                              </p>
                            </div>
                            {user.role && (
                              <span className="text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-600 text-gray-600 dark:text-gray-300 rounded">
                                {user.role}
                              </span>
                            )}
                          </label>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="p-4 text-center text-sm text-gray-500 dark:text-gray-400">
                      {userSearchQuery ? 'No users found' : 'No users available'}
                    </p>
                  )}
                </div>
              </div>

              {/* Comment */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <MessageSquare className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                  <h4 className="text-sm font-medium text-gray-900 dark:text-white">
                    Comment (Optional)
                  </h4>
                </div>
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Add a note for the approvers..."
                  rows={3}
                  className="w-full px-3 py-2 border rounded-md bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white placeholder-gray-400 resize-none"
                />
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
          <button
            onClick={handleClose}
            disabled={isSubmitting}
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 font-medium disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || selectedApprovers.length === 0 || selectedEnvironments.length === 0}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isSubmitting ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                Submitting...
              </>
            ) : (
              'Submit for Approval'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ApprovalSubmissionDialog;
