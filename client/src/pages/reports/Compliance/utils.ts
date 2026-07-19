/**
 * Utility functions for Compliance module
 */
import { ComplianceControl, ComplianceFramework } from './types';

/**
 * Format date from ISO format to readable format
 * @param dateString ISO date string
 * @returns Formatted date string
 */
export const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  }).format(date);
};

/**
 * Get color class based on compliance status
 * @param status Compliance status
 * @returns Tailwind CSS classes for the status
 */
export const getStatusColorClass = (status: string): string => {
  switch (status) {
    case 'Compliant':
      return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
    case 'Partially Compliant':
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400';
    case 'Not Applicable':
      return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
    case 'Non-Compliant':
      return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
    default:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
  }
};

/**
 * Get color class for compliance score
 * @param score Compliance score (0-100)
 * @returns Tailwind CSS class for the score
 */
export const getScoreColorClass = (score: number): string => {
  if (score >= 90) return 'bg-green-500';
  if (score >= 80) return 'bg-yellow-500';
  return 'bg-red-500';
};

/**
 * Filter controls based on selected framework, search term, and compliance status
 * @param controls Array of compliance controls
 * @param selectedFramework Selected framework ID (or null for all)
 * @param searchTerm Search term
 * @param compliance Compliance filter ('all', 'compliant', 'non-compliant')
 * @returns Filtered array of compliance controls
 */
export const filterControls = (
  controls: ComplianceControl[],
  selectedFramework: string | null,
  searchTerm: string,
  compliance: 'all' | 'compliant' | 'non-compliant'
): ComplianceControl[] => {
  return controls.filter(control => {
    // Filter by framework if one is selected
    if (selectedFramework && control.frameworkId !== selectedFramework) {
      return false;
    }
    
    // Filter by compliance status
    if (compliance === 'compliant' && control.status !== 'Compliant') {
      return false;
    }
    if (compliance === 'non-compliant' && (control.status === 'Compliant' || control.status === 'Not Applicable')) {
      return false;
    }
    
    // Filter by search term
    if (searchTerm) {
      const searchTermLower = searchTerm.toLowerCase();
      return (
        control.controlId.toLowerCase().includes(searchTermLower) ||
        control.title.toLowerCase().includes(searchTermLower) ||
        control.description.toLowerCase().includes(searchTermLower)
      );
    }
    
    return true;
  });
};

/**
 * Prepare export data for compliance frameworks
 * @param frameworks Array of compliance frameworks
 * @returns Export-ready data for frameworks
 */
export const prepareFrameworksExportData = (frameworks: ComplianceFramework[]): Record<string, unknown>[] => {
  return frameworks.map(framework => ({
    'Framework': framework.name,
    'Description': framework.description,
    'Compliance Status': framework.status,
    'Compliance Score': `${framework.score}%`,
    'Total Controls': framework.controls.total,
    'Compliant Controls': framework.controls.compliant,
    'Non-Compliant Controls': framework.controls.nonCompliant,
    'N/A Controls': framework.controls.notApplicable,
    'Last Assessment': formatDate(framework.lastAssessment)
  }));
};

/**
 * Prepare export data for compliance controls
 * @param controls Array of compliance controls
 * @param frameworks Array of compliance frameworks (for looking up names)
 * @returns Export-ready data for controls
 */
export const prepareControlsExportData = (
  controls: ComplianceControl[],
  frameworks: ComplianceFramework[]
): Record<string, unknown>[] => {
  return controls.map(control => {
    const framework = frameworks.find(f => f.id === control.frameworkId);
    return {
      'Framework': framework?.name || control.frameworkId,
      'Control ID': control.controlId,
      'Title': control.title,
      'Description': control.description,
      'Requirement': control.requirement,
      'Status': control.status,
      'Evidence': control.evidence,
      'Last Tested': formatDate(control.lastTested),
      'Remediation': control.remediation || 'N/A'
    };
  });
};
