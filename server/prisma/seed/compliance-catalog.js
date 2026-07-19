"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Global compliance catalog: standard frameworks + controls. Per-organization
 * posture is derived at read time from real security signals (see the
 * reports module); each control's `category` names the signal that
 * auto-assesses it. A category of 'manual' (or unmapped) leaves the control
 * "Not Applicable" until an explicit ComplianceControlStatus override is
 * recorded.
 *
 * Idempotent: upserts by framework key + (frameworkId, code).
 */
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
const FRAMEWORKS = [
    {
        key: 'soc2',
        name: 'SOC 2',
        description: 'AICPA Trust Services Criteria for security, availability, and confidentiality.',
        version: '2017 TSC',
        controls: [
            { code: 'CC5.2', title: 'Logical Access Controls', description: 'Role-based access control governs who can perform which actions.', requirement: 'Implement RBAC across the platform.', category: 'accessControl' },
            { code: 'CC6.1', title: 'Protection of Data at Rest', description: 'Sensitive credentials and secrets are encrypted at rest.', requirement: 'Encrypt stored credential secrets.', category: 'encryption' },
            { code: 'CC6.2', title: 'Strong Authentication', description: 'Users authenticate with MFA or federated SSO.', requirement: 'Require MFA/SSO for user accounts.', category: 'mfa' },
            { code: 'CC6.6', title: 'Boundary / Network Protection', description: 'Deployment targets are reached over governed ZTNA connections.', requirement: 'Route target access through a connectivity provider.', category: 'network' },
            { code: 'CC7.1', title: 'Configuration Drift Detection', description: 'Deviations from approved configuration are detected and resolved.', requirement: 'Detect and remediate configuration drift.', category: 'drift' },
            { code: 'CC7.2', title: 'Security Monitoring / Audit Trail', description: 'Security-relevant events are logged for review.', requirement: 'Maintain an audit trail of activity.', category: 'auditLogging' },
            { code: 'CC8.1', title: 'Change Management Approvals', description: 'Configuration changes are governed by an approval policy.', requirement: 'Require approvals for controlled environments.', category: 'approvals' },
        ],
    },
    {
        key: 'iso27001',
        name: 'ISO 27001',
        description: 'ISO/IEC 27001:2022 Annex A information-security controls.',
        version: '2022',
        controls: [
            { code: 'A.5.15', title: 'Access Control', description: 'Access to information is restricted per role.', requirement: 'Enforce role-based access control.', category: 'accessControl' },
            { code: 'A.5.17', title: 'Authentication Information', description: 'Secure log-on with multi-factor or federated authentication.', requirement: 'Require MFA/SSO.', category: 'mfa' },
            { code: 'A.8.24', title: 'Use of Cryptography', description: 'Secrets are protected using cryptography at rest.', requirement: 'Encrypt stored secrets.', category: 'encryption' },
            { code: 'A.8.9', title: 'Configuration Management', description: 'Systems are held to an approved, drift-free configuration.', requirement: 'Detect and resolve drift.', category: 'drift' },
            { code: 'A.8.15', title: 'Logging', description: 'Events are recorded and retained for review.', requirement: 'Maintain event logs.', category: 'auditLogging' },
            { code: 'A.8.20', title: 'Network Security', description: 'Network access to targets is secured.', requirement: 'Use governed connectivity providers.', category: 'network' },
            { code: 'A.8.32', title: 'Change Management', description: 'Changes follow a controlled approval process.', requirement: 'Require change approvals.', category: 'approvals' },
        ],
    },
    {
        key: 'cis',
        name: 'CIS Controls',
        description: 'Center for Internet Security Critical Security Controls v8.',
        version: 'v8',
        controls: [
            { code: '3.11', title: 'Encrypt Data at Rest', description: 'Encrypt sensitive stored data.', requirement: 'Encrypt credential secrets at rest.', category: 'encryption' },
            { code: '6.3', title: 'Require MFA', description: 'Require multi-factor authentication for accounts.', requirement: 'Enable MFA/SSO for users.', category: 'mfa' },
            { code: '6.8', title: 'Role-Based Access Control', description: 'Grant access using defined roles.', requirement: 'Define and use RBAC roles.', category: 'accessControl' },
            { code: '8.2', title: 'Collect Audit Logs', description: 'Collect audit logs across the platform.', requirement: 'Record audit events.', category: 'auditLogging' },
            { code: '12.6', title: 'Secure Network Management', description: 'Manage target access securely.', requirement: 'Use ZTNA connectivity providers.', category: 'network' },
            { code: '4.1', title: 'Secure Configuration Process', description: 'Maintain a secure, monitored configuration baseline.', requirement: 'Detect configuration drift.', category: 'drift' },
            { code: '4.6', title: 'Change Management', description: 'Manage configuration changes through approvals.', requirement: 'Require approvals for changes.', category: 'approvals' },
        ],
    },
];
async function seedComplianceCatalog() {
    try {
        console.log('Seeding compliance catalog (frameworks + controls)...');
        for (const fw of FRAMEWORKS) {
            const framework = await prisma.complianceFramework.upsert({
                where: { key: fw.key },
                update: { name: fw.name, description: fw.description, version: fw.version },
                create: { key: fw.key, name: fw.name, description: fw.description, version: fw.version },
            });
            for (const c of fw.controls) {
                await prisma.complianceControl.upsert({
                    where: { frameworkId_code: { frameworkId: framework.id, code: c.code } },
                    update: { title: c.title, description: c.description, requirement: c.requirement, category: c.category },
                    create: {
                        frameworkId: framework.id,
                        code: c.code,
                        title: c.title,
                        description: c.description,
                        requirement: c.requirement,
                        category: c.category,
                    },
                });
            }
        }
        console.log(`Compliance catalog seeded (${FRAMEWORKS.length} frameworks).`);
    }
    finally {
        await prisma.$disconnect();
    }
}
exports.default = seedComplianceCatalog;
if (require.main === module) {
    seedComplianceCatalog()
        .then(() => process.exit(0))
        .catch((error) => {
        console.error('Error seeding compliance catalog:', error);
        process.exit(1);
    });
}
//# sourceMappingURL=compliance-catalog.js.map