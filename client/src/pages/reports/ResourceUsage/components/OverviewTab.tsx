import React from 'react';
import { TenantResourceSummary } from '@/pages/reports/ResourceUsage/types';
import { formatNumber, formatCost } from '@/pages/reports/ResourceUsage/utils';
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
import { Bar, Pie } from 'react-chartjs-2';

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

interface OverviewTabProps {
  /**
   * Filtered tenant summaries
   */
  filteredSummaries: TenantResourceSummary[];
  
  /**
   * Total cost across all tenants
   */
  totalCost: number;
  
  /**
   * Total compute usage
   */
  totalCompute: number;
  
  /**
   * Total storage usage
   */
  totalStorage: number;
  
  /**
   * Total network usage
   */
  totalNetwork: number;
}

/**
 * Resource Usage Overview Tab
 * Displays summary cards, resource usage charts, and tenant usage table
 * Memoized to prevent unnecessary re-renders when parent components update
 */
const OverviewTab: React.FC<OverviewTabProps> = React.memo(({
  filteredSummaries,
  totalCost,
  totalCompute,
  totalStorage,
  totalNetwork
}) => {
  // Prepare data for resource distribution chart
  const resourceDistribution = {
    labels: ['Compute', 'Storage', 'Network'],
    datasets: [
      {
        data: [totalCompute, totalStorage, totalNetwork],
        backgroundColor: [
          'rgba(59, 130, 246, 0.7)',  // Blue for compute
          'rgba(16, 185, 129, 0.7)',  // Green for storage
          'rgba(245, 158, 11, 0.7)',  // Amber for network
        ],
        borderColor: [
          'rgba(59, 130, 246, 1)',
          'rgba(16, 185, 129, 1)',
          'rgba(245, 158, 11, 1)',
        ],
        borderWidth: 1,
      }
    ]
  };

  // Prepare data for tenant cost comparison chart
  const costData = {
    labels: filteredSummaries.map(summary => summary.tenantName),
    datasets: [
      {
        label: 'Resource Cost',
        data: filteredSummaries.map(summary => summary.totalCost),
        backgroundColor: 'rgba(99, 102, 241, 0.7)',
        borderColor: 'rgba(99, 102, 241, 1)',
        borderWidth: 1,
      }
    ]
  };

  // Prepare data for usage percentage chart
  const usagePercentageData = {
    labels: filteredSummaries.map(summary => summary.tenantName),
    datasets: [
      {
        label: 'Usage Percentage',
        data: filteredSummaries.map(summary => summary.usagePercentage),
        backgroundColor: filteredSummaries.map(summary => 
          summary.usagePercentage > 90 ? 'rgba(239, 68, 68, 0.7)' :
          summary.usagePercentage > 75 ? 'rgba(245, 158, 11, 0.7)' :
          'rgba(34, 197, 94, 0.7)'
        ),
        borderColor: filteredSummaries.map(summary => 
          summary.usagePercentage > 90 ? 'rgba(239, 68, 68, 1)' :
          summary.usagePercentage > 75 ? 'rgba(245, 158, 11, 1)' :
          'rgba(34, 197, 94, 1)'
        ),
        borderWidth: 1,
      }
    ]
  };

  return (
    <div>
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-5">
          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Total Cost</h3>
          <p className="text-2xl font-bold mt-1">{formatCost(totalCost)}</p>
          <p className="text-sm mt-1 text-gray-500 dark:text-gray-400">
            For current billing period
          </p>
        </div>
        
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-5">
          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Compute Usage</h3>
          <p className="text-2xl font-bold mt-1">{totalCompute.toFixed(2)} cores</p>
          <p className="text-sm mt-1 text-gray-500 dark:text-gray-400">
            Avg. across all instances
          </p>
        </div>
        
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-5">
          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Storage Usage</h3>
          <p className="text-2xl font-bold mt-1">{formatNumber(totalStorage)} GB</p>
          <p className="text-sm mt-1 text-gray-500 dark:text-gray-400">
            Across all storage types
          </p>
        </div>
        
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-5">
          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Network Usage</h3>
          <p className="text-2xl font-bold mt-1">{formatNumber(totalNetwork)} GB</p>
          <p className="text-sm mt-1 text-gray-500 dark:text-gray-400">
            Inbound and outbound traffic
          </p>
        </div>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Resource Distribution Chart */}
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-5">
          <h3 className="text-lg font-medium mb-4 text-gray-700 dark:text-gray-300">Resource Distribution</h3>
          <div style={{ height: '220px' }}>
            <Pie
              data={resourceDistribution}
              options={{
                responsive: true,
                maintainAspectRatio: false,
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
                        const label = context.label || '';
                        const value = context.raw as number;
                        return `${label}: ${value.toFixed(2)} ${context.label === 'Compute' ? 'cores' : 'GB'}`;
                      }
                    }
                  }
                }
              }}
            />
          </div>
        </div>

        {/* Tenant Cost Comparison Chart */}
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-5">
          <h3 className="text-lg font-medium mb-4 text-gray-700 dark:text-gray-300">Tenant Cost Comparison</h3>
          <div style={{ height: '220px' }}>
            <Bar
              data={costData}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: {
                    display: false
                  },
                  tooltip: {
                    callbacks: {
                      label: function(context) {
                        return `Cost: ${formatCost(context.raw as number)}`;
                      }
                    }
                  }
                },
                scales: {
                  y: {
                    beginAtZero: true,
                    ticks: {
                      callback: function(value) {
                        return '$' + value;
                      },
                      color: '#6B7280'
                    },
                    grid: {
                      color: 'rgba(107, 114, 128, 0.1)'
                    }
                  },
                  x: {
                    ticks: {
                      color: '#6B7280'
                    },
                    grid: {
                      display: false
                    }
                  }
                }
              }}
            />
          </div>
        </div>

        {/* Usage Percentage Chart */}
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-5">
          <h3 className="text-lg font-medium mb-4 text-gray-700 dark:text-gray-300">Resource Usage Percentage</h3>
          <div style={{ height: '220px' }}>
            <Bar
              data={usagePercentageData}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: {
                    display: false
                  },
                  tooltip: {
                    callbacks: {
                      label: function(context) {
                        return `Usage: ${context.raw}%`;
                      }
                    }
                  }
                },
                scales: {
                  y: {
                    beginAtZero: true,
                    max: 100,
                    ticks: {
                      callback: function(value) {
                        return value + '%';
                      },
                      color: '#6B7280'
                    },
                    grid: {
                      color: 'rgba(107, 114, 128, 0.1)'
                    }
                  },
                  x: {
                    ticks: {
                      color: '#6B7280'
                    },
                    grid: {
                      display: false
                    }
                  }
                }
              }}
            />
          </div>
        </div>
      </div>
      
      {/* Tenant Usage Table */}
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-medium">Resource Usage by Tenant</h3>
        </div>
        
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Tenant
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Resources
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Compute
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Storage
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Network
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Usage %
                </th>
                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Cost
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {filteredSummaries.map((summary) => (
                <tr key={summary.tenantId} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                    {summary.tenantName}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    {summary.resourceCount}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    {summary.computeUsage.toFixed(2)} cores
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    {formatNumber(summary.storageUsage)} GB
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    {formatNumber(summary.networkUsage)} GB
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5 mb-1">
                      <div 
                        className={`h-2.5 rounded-full ${
                          summary.usagePercentage > 90 ? 'bg-red-500' :
                          summary.usagePercentage > 75 ? 'bg-yellow-500' :
                          'bg-green-500'
                        }`} 
                        style={{ width: `${summary.usagePercentage}%` }}
                      ></div>
                    </div>
                    <div className="text-xs text-right text-gray-500 dark:text-gray-400">
                      {summary.usagePercentage}%
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium text-gray-900 dark:text-white">
                    {formatCost(summary.totalCost)}
                  </td>
                </tr>
              ))}
              
              {/* Total row */}
              {filteredSummaries.length > 1 && (
                <tr className="bg-gray-50 dark:bg-gray-700">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900 dark:text-white">
                    Total
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                    {filteredSummaries.reduce((sum, s) => sum + s.resourceCount, 0)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                    {totalCompute.toFixed(2)} cores
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                    {formatNumber(totalStorage)} GB
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                    {formatNumber(totalNetwork)} GB
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                    -
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-bold text-gray-900 dark:text-white">
                    {formatCost(totalCost)}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
});

OverviewTab.displayName = 'OverviewTab';

export default OverviewTab;
