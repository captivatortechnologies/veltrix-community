export interface SplunkIndex {
  id: string;
  name: string;
  path: string;
  maxDataSizeMB: number;
  frozenTimeDays: number;
  environment: string[];
  isHot: boolean;
}

export interface SplunkRole {
  id: string;
  name: string;
  capabilities: string[];
  indexes: string[];
  environments: string[];
  inheritRoles?: string[];
  groupMap?: string;
  deployState?: string;
  users?: string[];
  mappedTo?: string;
}

export interface MessageBulletin {
  id: string;
  title: string;
  message: string;
  severity: 'info' | 'warning' | 'critical';
  active: boolean;
  createdAt: string;
}

// Sample data for bulletins
export const dummyBulletins: MessageBulletin[] = [
  {
    id: 'bulletin-1',
    title: 'System Maintenance',
    message: 'The system will be undergoing maintenance on Saturday from 2AM to 4AM EST. Please save your work before this time.',
    severity: 'info',
    active: true,
    createdAt: '2025-03-25T15:30:00Z'
  },
  {
    id: 'bulletin-2',
    title: 'API Deprecation Notice',
    message: 'The legacy API endpoints under /api/v1/* will be deprecated on April 15th. Please migrate to the new /api/v2/* endpoints before this date.',
    severity: 'warning',
    active: true,
    createdAt: '2025-03-20T10:15:00Z'
  },
  {
    id: 'bulletin-3',
    title: 'Critical Security Update',
    message: 'A critical security vulnerability has been identified and patched. All users are advised to update their clients immediately.',
    severity: 'critical',
    active: true,
    createdAt: '2025-03-28T08:45:00Z'
  },
  {
    id: 'bulletin-4',
    title: 'New Feature Release',
    message: 'We\'ve added new dashboard visualization options. Check the documentation for details on how to use these new features.',
    severity: 'info',
    active: true,
    createdAt: '2025-03-15T14:20:00Z'
  },
  {
    id: 'bulletin-5',
    title: 'Data Processing Delay',
    message: 'Due to high system load, there may be delays in data processing. We\'re working to resolve this issue.',
    severity: 'warning',
    active: false,
    createdAt: '2025-03-10T11:05:00Z'
  }
];
