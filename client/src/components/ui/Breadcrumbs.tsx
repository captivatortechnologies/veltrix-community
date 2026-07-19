import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronRight, Home } from 'lucide-react';
import { useApps } from '../../contexts/AppContext';

// Friendly labels for known static route segments. Segments not listed
// here (e.g. ids, or app slugs not yet loaded) fall back to `humanize()`.
const STATIC_LABELS: Record<string, string> = {
  pipeline: 'Pipeline',
  environments: 'Environments',
  drift: 'Drift',
  apps: 'Apps',
  marketplace: 'Marketplace',
  'installed-apps': 'Installed Apps',
  sandboxes: 'Sandboxes',
  reports: 'Reports',
  'security-overview': 'Security Overview',
  compliance: 'Compliance',
  'audit-logs': 'Audit Logs',
  'user-activity': 'User Activity',
  'resource-usage': 'Resource Usage',
  settings: 'Settings',
  organization: 'Organization',
  'keys-token': 'Keys & Tokens',
  billing: 'Billing',
  logs: 'Logs',
  'access-control': 'Access Control',
  profile: 'Profile',
  'tools-integration': 'Tools Integration',
  byol: 'BYOL',
};

function humanize(slug: string): string {
  return slug
    .split('-')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

interface Crumb {
  label: string;
  to: string;
}

/**
 * Route-driven breadcrumb trail for the authenticated app shell.
 *
 * Static segments (pipeline, settings, reports, ...) resolve through
 * `STATIC_LABELS`. Segments under `/apps/:appId/...` resolve through the
 * live `AppContext` so dynamically installed marketplace apps get correct
 * names/labels instead of a raw slug. Anything unrecognized still renders
 * a readable title-cased label rather than disappearing or showing "undefined".
 */
const Breadcrumbs: React.FC = () => {
  const location = useLocation();
  const { enabledApps } = useApps();
  const segments = location.pathname.split('/').filter(Boolean);

  // No breadcrumb on the home page - it's redundant with the page title.
  if (segments.length === 0) return null;

  const crumbs: Crumb[] = [];
  let pathAcc = '';

  segments.forEach((segment, index) => {
    pathAcc += `/${segment}`;
    let label: string;

    if (segments[0] === 'apps' && index === 1) {
      const app = enabledApps.find((candidate) => candidate.appId === segment);
      label = app?.name ?? STATIC_LABELS[segment] ?? humanize(segment);
    } else if (segments[0] === 'apps' && index > 1) {
      const app = enabledApps.find((candidate) => candidate.appId === segments[1]);
      const page = app?.pages?.find((candidate) => candidate.path === `/${segment}`);
      label = page?.label ?? STATIC_LABELS[segment] ?? humanize(segment);
    } else {
      label = STATIC_LABELS[segment] ?? humanize(segment);
    }

    crumbs.push({ label, to: pathAcc });
  });

  return (
    <nav aria-label="Breadcrumb" className="mb-4 flex flex-wrap items-center gap-1 text-sm text-gray-500 dark:text-gray-400">
      <Link
        to="/"
        aria-label="Home"
        className="flex items-center rounded p-0.5 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 dark:hover:text-gray-200"
      >
        <Home size={14} aria-hidden="true" />
      </Link>
      {crumbs.map((crumb, index) => {
        const isLast = index === crumbs.length - 1;
        return (
          <span key={crumb.to} className="flex items-center gap-1">
            <ChevronRight size={14} className="text-gray-300 dark:text-gray-600" aria-hidden="true" />
            {isLast ? (
              <span aria-current="page" className="font-medium text-gray-900 dark:text-gray-100">
                {crumb.label}
              </span>
            ) : (
              <Link
                to={crumb.to}
                className="rounded hover:text-gray-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 dark:hover:text-gray-200"
              >
                {crumb.label}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
};

export default Breadcrumbs;
