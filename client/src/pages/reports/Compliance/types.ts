/**
 * Type definitions for Compliance module
 */

export interface ComplianceFramework {
  id: string;
  name: string;
  description: string;
  lastAssessment: string;
  status: 'Compliant' | 'Non-Compliant' | 'Partially Compliant' | 'Not Applicable';
  score: number;
  controls: {
    total: number;
    compliant: number;
    nonCompliant: number;
    notApplicable: number;
  };
}

export interface ComplianceControl {
  id: string;
  frameworkId: string;
  controlId: string;
  title: string;
  description: string;
  requirement: string;
  status: 'Compliant' | 'Non-Compliant' | 'Partially Compliant' | 'Not Applicable';
  evidence: string;
  lastTested: string;
  remediation?: string;
}
