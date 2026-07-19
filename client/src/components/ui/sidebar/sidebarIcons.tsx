import React from 'react';
import {
  Database,
  Shield,
  Server,
  Key,
  Settings,
  Users,
  User,
  FileText,
  Folder,
  Globe,
  Activity,
  Clock,
  Terminal,
  Cloud,
  Lock,
  Bell,
  Mail,
  List,
  LayoutDashboard,
  Grid3x3,
  Cpu,
  Network,
  AlertTriangle,
  CheckCircle,
  BarChart2,
  CreditCard,
  Building,
  Puzzle,
  Book,
  Crosshair,
  Home,
  Link,
  RefreshCw,
  Zap,
  Search,
  Download,
  Upload,
  Plug,
  SlidersHorizontal,
  Gauge,
  GitBranch,
  Package,
  Layers,
  Calendar,
  Tag,
  Filter,
  Eye,
  type LucideIcon,
} from 'lucide-react';

/**
 * Maps the lowercase icon identifier strings that installed app manifests
 * declare (see `shared/types/app.ts` -> `AppPageDeclaration.icon`, e.g.
 * "database", "shield", "server") to a concrete Lucide icon component.
 *
 * Extend this map as new marketplace apps ship pages with new icon names.
 * Unknown/missing names gracefully fall back to `AppIconBadge` below so
 * sidebar entries never collapse back into visually identical icons.
 */
const APP_PAGE_ICONS: Record<string, LucideIcon> = {
  database: Database,
  shield: Shield,
  server: Server,
  key: Key,
  settings: Settings,
  users: Users,
  user: User,
  file: FileText,
  'file-text': FileText,
  folder: Folder,
  globe: Globe,
  activity: Activity,
  clock: Clock,
  terminal: Terminal,
  cloud: Cloud,
  lock: Lock,
  bell: Bell,
  mail: Mail,
  list: List,
  'layout-dashboard': LayoutDashboard,
  grid: Grid3x3,
  cpu: Cpu,
  network: Network,
  'alert-triangle': AlertTriangle,
  'check-circle': CheckCircle,
  'bar-chart': BarChart2,
  'credit-card': CreditCard,
  building: Building,
  puzzle: Puzzle,
  book: Book,
  crosshair: Crosshair,
  home: Home,
  link: Link,
  'refresh-cw': RefreshCw,
  refresh: RefreshCw,
  zap: Zap,
  search: Search,
  download: Download,
  upload: Upload,
  plug: Plug,
  sliders: SlidersHorizontal,
  'sliders-horizontal': SlidersHorizontal,
  gauge: Gauge,
  'git-branch': GitBranch,
  package: Package,
  layers: Layers,
  calendar: Calendar,
  tag: Tag,
  filter: Filter,
  eye: Eye,
};

/**
 * Resolve an app-declared icon identifier to a Lucide icon component.
 * Returns `null` when there is no known mapping so callers can fall back
 * to a distinguishable initials badge instead of a generic placeholder.
 */
export function resolveAppPageIcon(iconName?: string): LucideIcon | null {
  if (!iconName) return null;
  return APP_PAGE_ICONS[iconName.trim().toLowerCase()] ?? null;
}

// Deterministic palette for initials badges, keyed by a stable seed (app id)
// so the same app/page always renders the same color across sessions.
const BADGE_COLORS = [
  'bg-sky-500',
  'bg-emerald-500',
  'bg-amber-500',
  'bg-fuchsia-500',
  'bg-rose-500',
  'bg-indigo-500',
  'bg-teal-500',
  'bg-orange-500',
];

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0; // Force 32-bit integer
  }
  return Math.abs(hash);
}

export function getBadgeColor(seed: string): string {
  return BADGE_COLORS[hashString(seed) % BADGE_COLORS.length];
}

interface AppIconBadgeProps {
  /** Text used to derive the displayed initial (e.g. the page or app label). */
  label: string;
  /** Stable identifier used to pick a deterministic color (e.g. appId). */
  seed: string;
  size?: number;
}

/**
 * Fallback sidebar icon for entries whose manifest `icon` doesn't map to a
 * known Lucide icon: a colored, deterministic initial badge. This keeps
 * distinct apps/pages visually distinguishable instead of all rendering the
 * same generic puzzle-piece glyph.
 */
export const AppIconBadge: React.FC<AppIconBadgeProps> = ({ label, seed, size = 20 }) => {
  const initial = label.trim().charAt(0).toUpperCase() || '?';
  return (
    <span
      aria-hidden="true"
      className={`inline-flex flex-shrink-0 items-center justify-center rounded ${getBadgeColor(seed)} font-semibold leading-none text-white`}
      style={{ width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.55)) }}
    >
      {initial}
    </span>
  );
};

interface AppPageIconProps {
  /** Page-level `AppPageDeclaration.icon` (Lucide identifier, e.g. "database"). */
  iconName?: string;
  /** Installed app's own `icon` (typically an emoji), used as the 2nd-tier fallback. */
  appIcon?: string;
  label: string;
  seed: string;
  size?: number;
}

/**
 * Renders the best available icon for a dynamically injected app sidebar
 * page, per the platform's icon fallback chain: the page's own icon first,
 * then the owning app's icon, then a distinguishable initials badge. This is
 * what keeps sidebar entries visually distinct even for apps that only
 * declare an app-level icon.
 */
export const AppPageIcon: React.FC<AppPageIconProps> = ({ iconName, appIcon, label, seed, size = 20 }) => {
  const Icon = resolveAppPageIcon(iconName);
  if (Icon) return <Icon size={size} aria-hidden="true" />;

  if (appIcon) {
    return (
      <span
        aria-hidden="true"
        className="inline-flex flex-shrink-0 items-center justify-center leading-none"
        style={{ width: size, height: size, fontSize: Math.round(size * 0.8) }}
      >
        {appIcon}
      </span>
    );
  }

  return <AppIconBadge label={label} seed={seed} size={size} />;
};
