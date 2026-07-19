import React from 'react';
import { UserStats } from '@/pages/reports/UserActivity/types';
import { formatDate, formatDuration } from '@/pages/reports/UserActivity/utils';
import { 
  Chart as ChartJS, 
  ArcElement, 
  Tooltip, 
  Legend, 
  CategoryScale, 
  LinearScale, 
  BarElement, 
  Title,
  PointElement,
  LineElement
} from 'chart.js';
import { Bar, Doughnut } from 'react-chartjs-2';

// Register Chart.js components
ChartJS.register(
  ArcElement, 
  CategoryScale, 
  LinearScale, 
  BarElement, 
  PointElement,
  LineElement,
  Title, 
  Tooltip, 
  Legend
);

interface UserOverviewTabProps {
  userStats: UserStats[];
  userFilter: string;
}

/**
 * User Overview Tab - displays a table of user statistics and activity charts
 * Memoized to prevent unnecessary re-renders when parent components update
 */
const UserOverviewTab: React.FC<UserOverviewTabProps> = React.memo(({ userStats, userFilter }) => {
  // Filter stats based on userFilter if necessary
  const filteredStats = userFilter 
    ? userStats.filter(user => user.userId === userFilter)
    : userStats;

  // Extract data for active vs inactive users chart
  const activeUsers = filteredStats.filter(user => user.activeToday).length;
  const inactiveUsers = filteredStats.length - activeUsers;

  // Extract data for role distribution chart
  const roleDistribution = filteredStats.reduce((acc, user) => {
    acc[user.role] = (acc[user.role] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Extract data for activity by action type
  const actionsByType = filteredStats.reduce((acc, user) => {
    if (user.mostFrequentAction && !acc[user.mostFrequentAction]) {
      acc[user.mostFrequentAction] = 0;
    }
    if (user.mostFrequentAction) {
      acc[user.mostFrequentAction] += 1;
    }
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="p-6">
      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Active vs Inactive Users Chart */}
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-5">
          <h3 className="text-lg font-medium mb-4 text-gray-700 dark:text-gray-300">User Activity Status</h3>
          <div style={{ height: '220px' }}>
            <Doughnut
              data={{
                labels: ['Active Today', 'Inactive'],
                datasets: [{
                  data: [activeUsers, inactiveUsers],
                  backgroundColor: [
                    'rgba(34, 197, 94, 0.7)',   // Green for active
                    'rgba(107, 114, 128, 0.7)',  // Gray for inactive
                  ],
                  borderColor: [
                    'rgba(34, 197, 94, 1)',
                    'rgba(107, 114, 128, 1)',
                  ],
                  borderWidth: 1,
                }]
              }}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                cutout: '70%',
                plugins: {
                  legend: {
                    position: 'bottom',
                    labels: {
                      boxWidth: 12,
                      padding: 15,
                      color: '#6B7280'
                    }
                  },
                  tooltip: {
                    callbacks: {
                      label: function(context) {
                        const value = context.raw as number;
                        const total = activeUsers + inactiveUsers;
                        const percentage = Math.round((value / total) * 100);
                        return `${context.label}: ${value} (${percentage}%)`;
                      }
                    }
                  }
                }
              }}
            />
          </div>
        </div>

        {/* Role Distribution Chart */}
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-5">
          <h3 className="text-lg font-medium mb-4 text-gray-700 dark:text-gray-300">User Role Distribution</h3>
          <div style={{ height: '220px' }}>
            <Doughnut
              data={{
                labels: Object.keys(roleDistribution),
                datasets: [{
                  data: Object.values(roleDistribution),
                  backgroundColor: [
                    'rgba(59, 130, 246, 0.7)',  // Blue
                    'rgba(124, 58, 237, 0.7)',  // Purple
                    'rgba(245, 158, 11, 0.7)',  // Amber
                    'rgba(16, 185, 129, 0.7)',  // Emerald
                    'rgba(239, 68, 68, 0.7)',   // Red
                  ],
                  borderColor: [
                    'rgba(59, 130, 246, 1)',
                    'rgba(124, 58, 237, 1)',
                    'rgba(245, 158, 11, 1)',
                    'rgba(16, 185, 129, 1)',
                    'rgba(239, 68, 68, 1)',
                  ],
                  borderWidth: 1,
                }]
              }}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: {
                    position: 'right',
                    labels: {
                      boxWidth: 12,
                      color: '#6B7280'
                    }
                  }
                }
              }}
            />
          </div>
        </div>

        {/* Most Frequent Actions Chart */}
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-5">
          <h3 className="text-lg font-medium mb-4 text-gray-700 dark:text-gray-300">Most Frequent Actions</h3>
          <div style={{ height: '220px' }}>
            <Bar
              data={{
                labels: Object.keys(actionsByType),
                datasets: [{
                  label: 'Users',
                  data: Object.values(actionsByType),
                  backgroundColor: 'rgba(59, 130, 246, 0.7)',
                  borderColor: 'rgba(59, 130, 246, 1)',
                  borderWidth: 1,
                }]
              }}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                indexAxis: 'y',
                plugins: {
                  legend: {
                    display: false
                  },
                },
                scales: {
                  x: {
                    beginAtZero: true,
                    grid: {
                      color: 'rgba(107, 114, 128, 0.1)'
                    },
                    ticks: {
                      color: '#6B7280'
                    }
                  },
                  y: {
                    grid: {
                      display: false
                    },
                    ticks: {
                      color: '#6B7280'
                    }
                  }
                }
              }}
            />
          </div>
        </div>
      </div>

      {/* User Statistics Table */}
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-medium">User Statistics</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  User
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Role
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Last Active
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Sessions
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Avg. Duration
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Actions
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {filteredStats.map((user) => (
                <tr key={user.userId} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900 dark:text-white">{user.username}</div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">{user.userId}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    {user.role}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    {formatDate(user.lastActive)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    {user.totalSessions}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    {formatDuration(user.averageSessionDuration)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-500 dark:text-gray-400">{user.totalActions} total</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      Most frequent: <span className="font-medium">{user.mostFrequentAction}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                      user.activeToday
                        ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                        : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                    }`}>
                      {user.activeToday ? 'Active Today' : 'Inactive'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
});

UserOverviewTab.displayName = 'UserOverviewTab';

export default UserOverviewTab;
