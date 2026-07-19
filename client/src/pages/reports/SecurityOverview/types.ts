/**
 * Type definitions for Security Overview module
 */

export interface MetricCardProps {
  title: string;
  value: string | number;
  change?: number;
  icon?: React.ReactNode;
  className?: string;
}

export interface ChartCardProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}

// Security scores for different domains
export interface SecurityScores {
  overall: number;
  identityAccess: number;
  dataProtection: number;
  networkSecurity: number;
  deviceSecurity: number;
  applicationSecurity: number;
}

// Service violation data
export interface ServiceViolation {
  service: string;
  count: number;
}

// Monthly vulnerability data by severity
export interface VulnerabilityTrend {
  month: string;
  critical: number;
  high: number;
  medium: number;
  low: number;
}

// Compliance check status
export interface ComplianceStatus {
  framework: string;
  status: 'Compliant' | 'Non-Compliant' | 'Warning';
  lastChecked: string;
}
