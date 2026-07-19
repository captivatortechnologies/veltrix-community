import React from 'react';
import { CheckCircle, XCircle, Clock, Users } from 'lucide-react';
import { ApprovalStatus, ApprovalEntry } from '../api/configurationCanvasApi';

interface ApprovalStatusBadgeProps {
  approvalStatus: ApprovalStatus | null;
  compact?: boolean;
  showTooltip?: boolean;
}

/**
 * ApprovalStatusBadge - Displays the current approval status of a configuration
 *
 * Shows:
 * - Summary of approvals (X of Y approved)
 * - Individual approver status in expanded mode
 * - Color-coded badges for quick status identification
 */
const ApprovalStatusBadge: React.FC<ApprovalStatusBadgeProps> = ({
  approvalStatus,
  compact = false,
  showTooltip = true,
}) => {
  if (!approvalStatus || approvalStatus.approvals.length === 0) {
    return null;
  }

  const { summary, approvals } = approvalStatus;

  // Determine overall status
  const getOverallStatus = () => {
    if (summary.rejected > 0) return 'rejected';
    if (summary.approved === summary.total) return 'approved';
    if (summary.pending === summary.total) return 'pending';
    return 'in_progress';
  };

  const overallStatus = getOverallStatus();

  // Status colors and icons
  const statusConfig = {
    pending: {
      bgColor: 'bg-yellow-100 dark:bg-yellow-900/30',
      textColor: 'text-yellow-700 dark:text-yellow-300',
      borderColor: 'border-yellow-200 dark:border-yellow-800',
      icon: Clock,
      label: 'Pending Approval',
    },
    in_progress: {
      bgColor: 'bg-blue-100 dark:bg-blue-900/30',
      textColor: 'text-blue-700 dark:text-blue-300',
      borderColor: 'border-blue-200 dark:border-blue-800',
      icon: Users,
      label: 'Partially Approved',
    },
    approved: {
      bgColor: 'bg-green-100 dark:bg-green-900/30',
      textColor: 'text-green-700 dark:text-green-300',
      borderColor: 'border-green-200 dark:border-green-800',
      icon: CheckCircle,
      label: 'Approved',
    },
    rejected: {
      bgColor: 'bg-red-100 dark:bg-red-900/30',
      textColor: 'text-red-700 dark:text-red-300',
      borderColor: 'border-red-200 dark:border-red-800',
      icon: XCircle,
      label: 'Rejected',
    },
  };

  const config = statusConfig[overallStatus];
  const Icon = config.icon;

  if (compact) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 px-2 py-1 text-xs font-medium rounded-full ${config.bgColor} ${config.textColor}`}
        title={showTooltip ? `${summary.approved}/${summary.total} approved` : undefined}
      >
        <Icon className="w-3.5 h-3.5" />
        {summary.approved}/{summary.total}
      </span>
    );
  }

  return (
    <div className={`rounded-lg border ${config.borderColor} ${config.bgColor} p-4`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Icon className={`w-5 h-5 ${config.textColor}`} />
          <span className={`font-medium ${config.textColor}`}>{config.label}</span>
        </div>
        <span className={`text-sm ${config.textColor}`}>
          {summary.approved} of {summary.total} approved
        </span>
      </div>

      {/* Approver list */}
      <div className="space-y-2">
        {approvals.map((approval: ApprovalEntry) => (
          <ApproverStatusRow key={approval.id} approval={approval} />
        ))}
      </div>
    </div>
  );
};

interface ApproverStatusRowProps {
  approval: ApprovalEntry;
}

const ApproverStatusRow: React.FC<ApproverStatusRowProps> = ({ approval }) => {
  const statusStyles = {
    PENDING: {
      bgColor: 'bg-yellow-100 dark:bg-yellow-900/30',
      textColor: 'text-yellow-700 dark:text-yellow-300',
      icon: Clock,
      label: 'Pending',
    },
    APPROVED: {
      bgColor: 'bg-green-100 dark:bg-green-900/30',
      textColor: 'text-green-700 dark:text-green-300',
      icon: CheckCircle,
      label: 'Approved',
    },
    REJECTED: {
      bgColor: 'bg-red-100 dark:bg-red-900/30',
      textColor: 'text-red-700 dark:text-red-300',
      icon: XCircle,
      label: 'Rejected',
    },
  };

  const style = statusStyles[approval.status];
  const Icon = style.icon;

  return (
    <div className="flex items-center justify-between py-2 px-3 bg-white dark:bg-gray-800 rounded-md">
      <div className="flex items-center gap-3">
        {/* Avatar placeholder */}
        <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
          <span className="text-sm font-medium text-gray-600 dark:text-gray-300">
            {approval.approver.name?.[0]?.toUpperCase() || approval.approver.email[0].toUpperCase()}
          </span>
        </div>
        <div>
          <p className="text-sm font-medium text-gray-900 dark:text-white">
            {approval.approver.name || approval.approver.email}
          </p>
          {approval.comment && (
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[200px]">
              {approval.comment}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        {approval.respondedAt && (
          <span className="text-xs text-gray-400 dark:text-gray-500">
            {new Date(approval.respondedAt).toLocaleDateString()}
          </span>
        )}
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full ${style.bgColor} ${style.textColor}`}
        >
          <Icon className="w-3 h-3" />
          {style.label}
        </span>
      </div>
    </div>
  );
};

export default ApprovalStatusBadge;
