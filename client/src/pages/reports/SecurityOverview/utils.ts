/**
 * Utility functions for Security Overview module
 */
import { SecurityScores, ServiceViolation, VulnerabilityTrend, ComplianceStatus } from './types';

/**
 * Get color class based on score value
 * @param score Score value (0-100)
 * @returns Tailwind CSS class for the score color
 */
export const getScoreColorClass = (score: number): string => {
  if (score >= 90) return 'bg-green-500';
  if (score >= 80) return 'bg-blue-500';
  if (score >= 70) return 'bg-yellow-500';
  return 'bg-red-500';
};

/**
 * Get color class based on compliance status
 * @param status Compliance status
 * @returns Tailwind CSS class for the status color
 */
export const getStatusColorClass = (status: string): string => {
  switch (status) {
    case 'Compliant':
      return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
    case 'Warning':
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400';
    case 'Non-Compliant':
      return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
    default:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
  }
};

/**
 * Format field name for display (convert camelCase to Title Case)
 * @param name Field name in camelCase
 * @returns Formatted field name
 */
export const formatFieldName = (name: string): string => {
  return name.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
};

/**
 * Prepare security scores export data
 * @param scores Security scores object
 * @returns Export-ready data
 */
export const prepareScoresExportData = (scores: SecurityScores): Record<string, unknown>[] => {
  return Object.entries(scores)
    .filter(([key]) => key !== 'overall')
    .map(([key, value]) => ({
      Category: formatFieldName(key),
      Score: value,
      Rating: value >= 90 ? 'Excellent' : 
              value >= 80 ? 'Good' : 
              value >= 70 ? 'Fair' : 'Poor'
    }));
};

/**
 * Prepare violations export data
 * @param violations Service violations array
 * @returns Export-ready data
 */
export const prepareViolationsExportData = (violations: ServiceViolation[]): Record<string, unknown>[] => {
  return violations.map(item => ({
    Service: item.service,
    'Violation Count': item.count,
    'Percentage': ((item.count / 20) * 100).toFixed(1) + '%'
  }));
};

/**
 * Prepare compliance status export data
 * @param status Compliance status array
 * @returns Export-ready data
 */
export const prepareComplianceExportData = (status: ComplianceStatus[]): Record<string, unknown>[] => {
  return status.map(item => ({
    Framework: item.framework,
    Status: item.status,
    'Last Checked': item.lastChecked
  }));
};

/**
 * Prepare vulnerability trend export data
 * @param trends Vulnerability trend array
 * @returns Export-ready data
 */
export const prepareVulnerabilityExportData = (trends: VulnerabilityTrend[]): Record<string, unknown>[] => {
  return trends.map(item => ({
    Month: item.month,
    Critical: item.critical,
    High: item.high,
    Medium: item.medium,
    Low: item.low,
    Total: item.critical + item.high + item.medium + item.low
  }));
};

/**
 * Generate overall security overview export data
 * @param scores Security scores
 * @param violations Service violations
 * @param compliance Compliance status
 * @returns Export-ready data combining all sections
 */
export const prepareSecurityOverviewExport = (
  scores: SecurityScores,
  violations: ServiceViolation[],
  compliance: ComplianceStatus[]
): Record<string, unknown>[] => {
  const result: Record<string, unknown>[] = [
    { Section: 'SECURITY OVERVIEW SUMMARY', Data: '' },
    { 'Overall Score': scores.overall },
    { 'Compliant Frameworks': compliance.filter(c => c.status === 'Compliant').length },
    { 'Total Frameworks': compliance.length },
    { 'Total Violations': violations.reduce((sum, v) => sum + v.count, 0) },
    { Section: 'SECURITY SCORES BY CATEGORY', Data: '' },
    ...prepareScoresExportData(scores),
    { Section: 'COMPLIANCE STATUS', Data: '' },
    ...prepareComplianceExportData(compliance),
    { Section: 'VIOLATIONS BY SERVICE', Data: '' },
    ...prepareViolationsExportData(violations)
  ];
  
  return result;
};
