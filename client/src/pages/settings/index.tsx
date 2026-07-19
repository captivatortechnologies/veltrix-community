import React from 'react';
import { Link } from 'react-router-dom';
import { Shield, Building, Key, FileText, Network, Cloud, Radio, Mail, ChevronRight, type LucideIcon } from 'lucide-react';
import { Card, CardBody } from '../../components/shared/Card';
import { useBrand, type BrandConfig } from '../../brand';

interface SettingsLink {
  to: string;
  icon: LucideIcon;
  iconClassName: string;
  title: string;
  description: string;
}

function getSettingsLinks(brand: BrandConfig): SettingsLink[] {
  return [
    {
      to: '/access-control',
      icon: Shield,
      iconClassName: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
      title: 'Access Control',
      description: 'Manage users, roles, permissions, and identity providers.',
    },
    {
      to: '/settings/organization',
      icon: Building,
      iconClassName: 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400',
      title: 'Organization',
      description: "Update your organization's profile and contact details.",
    },
    {
      to: '/settings/keys-token',
      icon: Key,
      iconClassName: 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400',
      title: 'Keys & Tokens',
      description: 'Generate and manage API keys and CLI access tokens.',
    },
    {
      to: '/settings/email',
      icon: Mail,
      iconClassName: 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400',
      title: 'Email (SMTP / SES)',
      description: 'Configure outbound email for password resets — via SMTP or Amazon SES.',
    },
    {
      to: '/settings/connectivity',
      icon: Network,
      iconClassName: 'bg-cyan-100 text-cyan-600 dark:bg-cyan-900/30 dark:text-cyan-400',
      title: 'Connectivity (ZTNA)',
      description: 'Zero-Trust Network Access providers used platform-wide to reach your deployment targets.',
    },
    {
      to: '/settings/cloud-accounts',
      icon: Cloud,
      iconClassName: 'bg-sky-100 text-sky-600 dark:bg-sky-900/30 dark:text-sky-400',
      title: 'Cloud Accounts',
      description: `Connect your AWS, Azure, GCP, or Hetzner accounts so ${brand.name} can provision infrastructure.`,
    },
    {
      to: '/settings/remote-access',
      icon: Radio,
      iconClassName: 'bg-teal-100 text-teal-600 dark:bg-teal-900/30 dark:text-teal-400',
      title: 'Remote Access',
      description: `Link your servers to the ${brand.name} secure network with one command — isolated to your organization.`,
    },
    {
      to: '/settings/logs',
      icon: FileText,
      iconClassName: 'bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400',
      title: 'Logs',
      description: 'Review system logs and configure log forwarding.',
    },
  ];
}

/**
 * Settings landing page. Replaces the previous inline `<div>Settings
 * Dashboard</div>` placeholder with a real hub linking out to every settings
 * sub-page, mirroring the pattern already used by `pages/reports`.
 */
const SettingsPage: React.FC = () => {
  const brand = useBrand();
  const settingsLinks = getSettingsLinks(brand);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Settings</h1>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Manage your organization, access control, and platform configuration.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {settingsLinks.map(({ to, icon: Icon, iconClassName, title, description }) => (
          <Link
            key={to}
            to={to}
            className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900"
          >
            <Card variant="bordered" className="h-full transition-shadow hover:shadow-md">
              <CardBody className="flex items-start gap-4">
                <span className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg ${iconClassName}`}>
                  <Icon size={20} aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="font-semibold text-gray-900 dark:text-white">{title}</h2>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{description}</p>
                </div>
                <ChevronRight size={18} className="mt-1 flex-shrink-0 text-gray-300 dark:text-gray-600" aria-hidden="true" />
              </CardBody>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
};

export default SettingsPage;
