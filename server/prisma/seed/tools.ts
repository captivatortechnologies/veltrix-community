/**
 * Seeds the global Tool catalog — vendor names and public logo URLs only,
 * no credentials or tenant data. Safe to run repeatedly (upsert by name).
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const TOOLS = [
  // Identity & Access Management
  { name: 'Okta', description: 'Cloud-based identity and access management platform for secure authentication', vendor: 'Okta Inc.', category: 'Identity & Access Management', logoUrl: 'https://logo.clearbit.com/okta.com', isActive: true },
  { name: 'Auth0', description: 'Identity platform for application builders and developers', vendor: 'Okta Inc.', category: 'Identity & Access Management', logoUrl: 'https://logo.clearbit.com/auth0.com', isActive: true },
  { name: 'Azure Active Directory', description: 'Microsoft cloud-based identity and access management service', vendor: 'Microsoft', category: 'Identity & Access Management', logoUrl: 'https://logo.clearbit.com/microsoft.com', isActive: true },

  // Endpoint Management
  { name: 'Jamf Pro', description: 'Apple device management platform for IT and security teams', vendor: 'Jamf', category: 'Endpoint Management', logoUrl: 'https://logo.clearbit.com/jamf.com', isActive: true },
  { name: 'Microsoft Intune', description: 'Cloud-based unified endpoint management platform', vendor: 'Microsoft', category: 'Endpoint Management', logoUrl: 'https://logo.clearbit.com/microsoft.com', isActive: true },

  // Cloud Infrastructure
  { name: 'Amazon Web Services', description: 'Comprehensive cloud computing platform with extensive services', vendor: 'Amazon', category: 'Cloud Infrastructure', logoUrl: 'https://logo.clearbit.com/aws.amazon.com', isActive: true },
  { name: 'Microsoft Azure', description: 'Cloud computing service for building, testing, and managing applications', vendor: 'Microsoft', category: 'Cloud Infrastructure', logoUrl: 'https://logo.clearbit.com/azure.microsoft.com', isActive: true },
  { name: 'Google Cloud Platform', description: 'Suite of cloud computing services for infrastructure and applications', vendor: 'Google', category: 'Cloud Infrastructure', logoUrl: 'https://logo.clearbit.com/cloud.google.com', isActive: true },

  // Observability
  { name: 'Splunk Enterprise', description: 'On-premises log management and analytics platform for operational intelligence', vendor: 'Splunk Inc.', category: 'Observability', logoUrl: 'https://logo.clearbit.com/splunk.com', isActive: true },
  { name: 'Datadog', description: 'Monitoring and analytics platform for cloud-scale applications', vendor: 'Datadog Inc.', category: 'Observability', logoUrl: 'https://logo.clearbit.com/datadoghq.com', isActive: true },
  { name: 'New Relic', description: 'Full-stack observability platform for modern cloud environments', vendor: 'New Relic Inc.', category: 'Observability', logoUrl: 'https://logo.clearbit.com/newrelic.com', isActive: true },

  // Security
  { name: 'CrowdStrike Falcon', description: 'Cloud-native endpoint protection and threat intelligence platform', vendor: 'CrowdStrike', category: 'Security', logoUrl: 'https://logo.clearbit.com/crowdstrike.com', isActive: true },
  { name: 'SentinelOne', description: 'Autonomous AI-powered endpoint protection and response platform', vendor: 'SentinelOne', category: 'Security', logoUrl: 'https://logo.clearbit.com/sentinelone.com', isActive: true },
  { name: 'Palo Alto Networks', description: 'Next-generation firewall and advanced security platform', vendor: 'Palo Alto Networks', category: 'Security', logoUrl: 'https://logo.clearbit.com/paloaltonetworks.com', isActive: true },

  // Networking
  { name: 'Cisco Meraki', description: 'Cloud-managed IT solutions for networking and security', vendor: 'Cisco Systems', category: 'Networking', logoUrl: 'https://logo.clearbit.com/meraki.cisco.com', isActive: true },
  { name: 'Cloudflare', description: 'Web performance and security platform with global CDN', vendor: 'Cloudflare Inc.', category: 'Networking', logoUrl: 'https://logo.clearbit.com/cloudflare.com', isActive: true },

  // Collaboration
  { name: 'Slack', description: 'Team collaboration and communication platform', vendor: 'Salesforce', category: 'Collaboration', logoUrl: 'https://logo.clearbit.com/slack.com', isActive: true },
  { name: 'Microsoft Teams', description: 'Unified communication and collaboration platform', vendor: 'Microsoft', category: 'Collaboration', logoUrl: 'https://logo.clearbit.com/microsoft.com', isActive: true },
  { name: 'Zoom', description: 'Video conferencing and online meeting platform', vendor: 'Zoom Video Communications', category: 'Collaboration', logoUrl: 'https://logo.clearbit.com/zoom.us', isActive: true },

  // DevOps
  { name: 'GitHub', description: 'Development platform for version control and collaboration', vendor: 'Microsoft', category: 'DevOps', logoUrl: 'https://logo.clearbit.com/github.com', isActive: true },
  { name: 'GitLab', description: 'DevOps platform for the entire software development lifecycle', vendor: 'GitLab Inc.', category: 'DevOps', logoUrl: 'https://logo.clearbit.com/gitlab.com', isActive: true },
  { name: 'Jenkins', description: 'Open source automation server for continuous integration', vendor: 'CloudBees', category: 'DevOps', logoUrl: 'https://logo.clearbit.com/jenkins.io', isActive: true },

  // Monitoring
  { name: 'Prometheus', description: 'Open-source systems monitoring and alerting toolkit', vendor: 'CNCF', category: 'Monitoring', logoUrl: 'https://logo.clearbit.com/prometheus.io', isActive: true },
  { name: 'Grafana', description: 'Multi-platform analytics and interactive visualization platform', vendor: 'Grafana Labs', category: 'Monitoring', logoUrl: 'https://logo.clearbit.com/grafana.com', isActive: true },
];

async function seedTools(): Promise<void> {
  try {
    console.log('Seeding tool catalog...');

    for (const tool of TOOLS) {
      await prisma.tool.upsert({ where: { name: tool.name }, update: tool, create: tool });
    }

    console.log(`Tool catalog seeded (${TOOLS.length} tools).`);
  } finally {
    await prisma.$disconnect();
  }
}

export default seedTools;

if (require.main === module) {
  seedTools()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Error seeding tools:', error);
      process.exit(1);
    });
}
