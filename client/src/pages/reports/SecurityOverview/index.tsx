import React, { useState, useRef } from 'react';
import ReportPage from '@/components/reports/ReportPage';
import { ReportStatus } from '@/components/reports/ReportStatus';
import { useSecurityOverviewReport } from '@/services/reportsService';
import MetricCard from './components/MetricCard';
import ChartCard from './components/ChartCard';
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
import { Bar, Doughnut, Line } from 'react-chartjs-2';
import {
  getStatusColorClass,
  formatFieldName,
  prepareSecurityOverviewExport
} from './utils';

// Register ChartJS components
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

/**
 * Security Overview Page
 * Provides a comprehensive view of the system's security status
 */
const SecurityOverviewPage: React.FC = () => {
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d'>('30d');

  // Reference to content for export
  const contentRef = useRef<HTMLDivElement>(null);

  const query = useSecurityOverviewReport();
  const data = query.data;

  // Prepare export data
  const getExportData = (): Record<string, unknown>[] => {
    if (!data) return [];
    return prepareSecurityOverviewExport(
      data.scores,
      data.violationsByService,
      data.complianceStatus
    );
  };

  return (
    <ReportPage
      title="Security Overview"
      exportData={getExportData()}
      contentSelector="#security-overview-content"
      actions={
        <div className="flex items-center space-x-2">
          <label className="text-sm text-gray-600 dark:text-gray-300">Time Range:</label>
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value as '7d' | '30d' | '90d')}
            className="bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 rounded-md px-3 py-1 text-sm"
          >
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
            <option value="90d">Last 90 Days</option>
          </select>
        </div>
      }
    >
      <ReportStatus
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={query.refetch}
      >
        {data && (
          <div id="security-overview-content" ref={contentRef}>
          {/* Metrics Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
            <MetricCard
              title="Security Score"
              value={`${data.scores.overall}/100`}
            />
            <MetricCard
              title="Active Alerts"
              value={data.metrics.activeAlerts}
            />
            <MetricCard
              title="Compliance Status"
              value={`${data.metrics.compliantFrameworks}/${data.metrics.totalFrameworks}`}
            />
            <MetricCard
              title="Critical Vulnerabilities"
              value={data.metrics.criticalVulnerabilities}
            />
          </div>
  
          {/* Chart Section */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <ChartCard title="Security Score Breakdown" description="Detailed component scores">
              <div style={{ height: '250px' }}>
                <Doughnut
                  data={{
                    labels: Object.entries(data.scores)
                      .filter(([key]) => key !== 'overall')
                      .map(([key]) => formatFieldName(key)),
                    datasets: [{
                      data: Object.entries(data.scores)
                        .filter(([key]) => key !== 'overall')
                        .map(([, value]) => value),
                      backgroundColor: [
                        'rgba(34, 197, 94, 0.7)',   // green
                        'rgba(59, 130, 246, 0.7)',  // blue
                        'rgba(245, 158, 11, 0.7)',  // amber
                        'rgba(239, 68, 68, 0.7)',   // red
                        'rgba(124, 58, 237, 0.7)',  // purple
                      ],
                      borderColor: [
                        'rgba(34, 197, 94, 1)',
                        'rgba(59, 130, 246, 1)',
                        'rgba(245, 158, 11, 1)',
                        'rgba(239, 68, 68, 1)',
                        'rgba(124, 58, 237, 1)',
                      ],
                      borderWidth: 1,
                    }]
                  }}
                  options={{
                    responsive: true,
                    plugins: {
                      legend: {
                        position: 'right',
                        labels: {
                          boxWidth: 12,
                          padding: 15,
                          color: '#6B7280'
                        }
                      },
                      tooltip: {
                        callbacks: {
                          label: function(context) {
                            return `${context.label}: ${context.raw}/100`;
                          }
                        }
                      }
                    },
                    maintainAspectRatio: false,
                  }}
                />
              </div>
            </ChartCard>
            
            <ChartCard title="Policy Violations by Service" description="Top services with security violations">
              <div style={{ height: '250px' }}>
                <Bar
                  data={{
                    labels: data.violationsByService.map(item => item.service),
                    datasets: [{
                      label: 'Violations',
                      data: data.violationsByService.map(item => item.count),
                      backgroundColor: 'rgba(59, 130, 246, 0.7)',
                      borderColor: 'rgba(59, 130, 246, 1)',
                      borderWidth: 1,
                    }]
                  }}
                  options={{
                    responsive: true,
                    indexAxis: 'y',
                    plugins: {
                      legend: {
                        display: false
                      },
                      tooltip: {
                        callbacks: {
                          label: function(context) {
                            return `Violations: ${context.raw}`;
                          }
                        }
                      }
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
                    },
                    maintainAspectRatio: false,
                  }}
                />
              </div>
            </ChartCard>
          </div>
          
          {/* Compliance Status Table */}
          <ChartCard title="Compliance Framework Status" className="mb-6">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead>
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Framework</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Last Checked</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {data.complianceStatus.map((item) => (
                    <tr key={item.framework}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">{item.framework}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColorClass(item.status)}`}>
                          {item.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{item.lastChecked}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <a href="#" className="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300">View Report</a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ChartCard>
          
          {/* Vulnerability Trend Line Chart */}
          <ChartCard title="Vulnerability Trend" description="6-month trend of vulnerabilities by severity level">
            <div style={{ height: '250px' }}>
              <Line
                data={{
                  labels: data.vulnerabilityTrend.map(item => item.month),
                  datasets: [
                    {
                      label: 'Critical',
                      data: data.vulnerabilityTrend.map(item => item.critical),
                      borderColor: 'rgba(239, 68, 68, 1)',
                      backgroundColor: 'rgba(239, 68, 68, 0.5)',
                      tension: 0.3,
                    },
                    {
                      label: 'High',
                      data: data.vulnerabilityTrend.map(item => item.high),
                      borderColor: 'rgba(245, 158, 11, 1)',
                      backgroundColor: 'rgba(245, 158, 11, 0.5)',
                      tension: 0.3,
                    },
                    {
                      label: 'Medium',
                      data: data.vulnerabilityTrend.map(item => item.medium),
                      borderColor: 'rgba(234, 179, 8, 1)',
                      backgroundColor: 'rgba(234, 179, 8, 0.5)',
                      tension: 0.3,
                    },
                    {
                      label: 'Low',
                      data: data.vulnerabilityTrend.map(item => item.low),
                      borderColor: 'rgba(59, 130, 246, 1)',
                      backgroundColor: 'rgba(59, 130, 246, 0.5)',
                      tension: 0.3,
                    }
                  ]
                }}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                    legend: {
                      position: 'top',
                      labels: {
                        boxWidth: 12,
                        color: '#6B7280'
                      }
                    },
                    tooltip: {
                      mode: 'index',
                      intersect: false,
                    }
                  },
                  scales: {
                    y: {
                      type: 'linear',
                      beginAtZero: true,
                      stacked: false,
                      ticks: {
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
                  },
                  interaction: {
                    mode: 'nearest',
                    axis: 'x',
                    intersect: false
                  }
                }}
              />
            </div>
          </ChartCard>
          </div>
        )}
      </ReportStatus>
    </ReportPage>
  );
};

export default SecurityOverviewPage;
