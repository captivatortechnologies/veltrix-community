import React, { useState, useRef } from 'react';
import ReportPage from '@/components/reports/ReportPage';
import { ReportStatus } from '@/components/reports/ReportStatus';
import { useComplianceReport } from '@/services/reportsService';
import { formatDate, getStatusColorClass, getScoreColorClass, filterControls, prepareFrameworksExportData, prepareControlsExportData } from './utils';
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
  LineElement,
  RadialLinearScale
} from 'chart.js';
import { Doughnut, Bar, Radar } from 'react-chartjs-2';

// Register Chart.js components
ChartJS.register(
  ArcElement,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  RadialLinearScale,
  Title,
  Tooltip,
  Legend
);

/**
 * Compliance Dashboard Page
 * Displays compliance frameworks and their controls
 */
const CompliancePage: React.FC = () => {
  const query = useComplianceReport();
  const [selectedFramework, setSelectedFramework] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [compliance, setCompliance] = useState<'all' | 'compliant' | 'non-compliant'>('all');

  // Reference to content for export
  const contentRef = useRef<HTMLDivElement>(null);

  // Real data from the API. Fall back to empty arrays while loading/erroring so
  // filtering/derivations below can run unconditionally on every render (stable
  // hook order) — ReportStatus takes over rendering the loading/error UI instead.
  const { frameworks: frameworksData, controls: controlsDataList } = query.data ?? { frameworks: [], controls: [] };

  // Filter controls based on selected framework and search term
  const filteredControls = filterControls(
    controlsDataList,
    selectedFramework,
    searchTerm,
    compliance
  );

  // Prepare export data based on what's currently visible
  const getExportData = (): Record<string, unknown>[] => {
    if (selectedFramework) {
      return prepareControlsExportData(filteredControls, frameworksData);
    } else {
      return prepareFrameworksExportData(frameworksData);
    }
  };

  // Prepare data for compliance status chart
  const complianceStatusData = {
    labels: ['Compliant', 'Partially Compliant', 'Non-Compliant', 'Not Applicable'],
    datasets: [
      {
        data: [
          frameworksData.filter(f => f.status === 'Compliant').length,
          frameworksData.filter(f => f.status === 'Partially Compliant').length,
          frameworksData.filter(f => f.status === 'Non-Compliant').length,
          frameworksData.filter(f => f.status === 'Not Applicable').length
        ],
        backgroundColor: [
          'rgba(34, 197, 94, 0.7)',  // Green for compliant
          'rgba(234, 179, 8, 0.7)',  // Yellow for partially compliant
          'rgba(239, 68, 68, 0.7)',  // Red for non-compliant
          'rgba(107, 114, 128, 0.7)' // Gray for not applicable
        ],
        borderColor: [
          'rgba(34, 197, 94, 1)',
          'rgba(234, 179, 8, 1)',
          'rgba(239, 68, 68, 1)',
          'rgba(107, 114, 128, 1)'
        ],
        borderWidth: 1
      }
    ]
  };

  // Data for framework compliance radar chart
  const radarData = {
    labels: frameworksData.map(framework => framework.name),
    datasets: [
      {
        label: 'Compliance Score',
        data: frameworksData.map(framework => framework.score),
        backgroundColor: 'rgba(59, 130, 246, 0.2)',
        borderColor: 'rgba(59, 130, 246, 1)',
        borderWidth: 2,
        pointBackgroundColor: 'rgba(59, 130, 246, 1)',
        pointBorderColor: '#fff',
        pointHoverBackgroundColor: '#fff',
        pointHoverBorderColor: 'rgba(59, 130, 246, 1)'
      }
    ]
  };

  // Data for controls by framework chart
  const frameworkControlsData = {
    labels: frameworksData.map(framework => framework.name),
    datasets: [
      {
        label: 'Compliant Controls',
        data: frameworksData.map(framework => framework.controls.compliant),
        backgroundColor: 'rgba(34, 197, 94, 0.7)',
        borderColor: 'rgba(34, 197, 94, 1)',
        borderWidth: 1
      },
      {
        label: 'Non-Compliant Controls',
        data: frameworksData.map(framework => framework.controls.nonCompliant),
        backgroundColor: 'rgba(239, 68, 68, 0.7)',
        borderColor: 'rgba(239, 68, 68, 1)',
        borderWidth: 1
      },
      {
        label: 'Not Applicable',
        data: frameworksData.map(framework => framework.controls.notApplicable),
        backgroundColor: 'rgba(107, 114, 128, 0.7)',
        borderColor: 'rgba(107, 114, 128, 1)',
        borderWidth: 1
      }
    ]
  };

  return (
    <ReportPage
      title="Compliance Dashboard"
      exportData={getExportData()}
      contentSelector="#compliance-content"
      actions={
        <div className="flex space-x-2">
          <select
            value={compliance}
            onChange={(e) => setCompliance(e.target.value as 'all' | 'compliant' | 'non-compliant')}
            className="px-3 py-1 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 rounded-md text-sm text-gray-700 dark:text-gray-200"
          >
            <option value="all">All Controls</option>
            <option value="compliant">Compliant</option>
            <option value="non-compliant">Non-Compliant</option>
          </select>
          <input
            type="text"
            placeholder="Search controls..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="px-3 py-1 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 rounded-md text-sm text-gray-700 dark:text-gray-200"
          />
        </div>
      }
    >
      <ReportStatus
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={query.refetch}
      >
        <div id="compliance-content" ref={contentRef}>
          {/* Compliance Charts Section */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
            {/* Framework Compliance Radar Chart */}
            <div className="col-span-2 bg-white dark:bg-gray-800 rounded-lg shadow p-5">
              <h3 className="text-lg font-medium mb-4 text-gray-700 dark:text-gray-300">Compliance Framework Scores</h3>
              <div style={{ height: '300px' }}>
                <Radar
                  data={radarData}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                      r: {
                        min: 0,
                        max: 100,
                        ticks: {
                          stepSize: 20,
                          backdropColor: 'transparent'
                        },
                        grid: {
                          color: 'rgba(107, 114, 128, 0.2)'
                        },
                        angleLines: {
                          color: 'rgba(107, 114, 128, 0.2)'
                        },
                        pointLabels: {
                          color: '#6B7280'
                        }
                      }
                    },
                    plugins: {
                      legend: {
                        display: false
                      },
                      tooltip: {
                        callbacks: {
                          label: function(context) {
                            return `Score: ${context.raw}%`;
                          }
                        }
                      }
                    }
                  }}
                />
              </div>
            </div>

            {/* Overall Compliance Status */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-5">
              <h3 className="text-lg font-medium mb-4 text-gray-700 dark:text-gray-300">Compliance Status Distribution</h3>
              <div style={{ height: '300px' }}>
                <Doughnut
                  data={complianceStatusData}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    cutout: '65%',
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
                            const total = complianceStatusData.datasets[0].data.reduce((a, b) => (a as number) + (b as number), 0);
                            const percentage = Math.round((value / (total as number)) * 100);
                            return `${context.label}: ${value} (${percentage}%)`;
                          }
                        }
                      }
                    }
                  }}
                />
              </div>
            </div>
          </div>

          {/* Controls by Framework Chart */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-5 mb-8">
            <h3 className="text-lg font-medium mb-4 text-gray-700 dark:text-gray-300">Controls by Framework</h3>
            <div style={{ height: '300px' }}>
              <Bar
                data={frameworkControlsData}
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
                      intersect: false
                    }
                  },
                  scales: {
                    x: {
                      grid: {
                        display: false
                      },
                      ticks: {
                        color: '#6B7280'
                      }
                    },
                    y: {
                      stacked: false,
                      grid: {
                        color: 'rgba(107, 114, 128, 0.1)'
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

          {/* Compliance Frameworks Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
            {frameworksData.map((framework) => (
              <div
                key={framework.id}
                className={`bg-white dark:bg-gray-800 rounded-lg shadow p-5 cursor-pointer transition-all duration-200 ${
                  selectedFramework === framework.id
                    ? 'ring-2 ring-blue-500 dark:ring-blue-400'
                    : 'hover:shadow-md'
                }`}
                onClick={() => setSelectedFramework(selectedFramework === framework.id ? null : framework.id)}
              >
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h3 className="font-semibold text-lg">{framework.name}</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{framework.description}</p>
                  </div>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColorClass(framework.status)}`}>
                    {framework.status}
                  </span>
                </div>

                <div className="mt-1 mb-3">
                  <div className="flex justify-between mb-1">
                    <span className="text-sm font-medium">Compliance Score</span>
                    <span className="text-sm font-medium">{framework.score}%</span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full ${getScoreColorClass(framework.score)}`}
                      style={{ width: `${framework.score}%` }}
                    ></div>
                  </div>
                </div>

                <div className="flex justify-between text-sm mb-2">
                  <div>
                    <div className="text-gray-500 dark:text-gray-400">Total Controls</div>
                    <div className="font-semibold">{framework.controls.total}</div>
                  </div>
                  <div>
                    <div className="text-green-500">Compliant</div>
                    <div className="font-semibold">{framework.controls.compliant}</div>
                  </div>
                  <div>
                    <div className="text-red-500">Non-Compliant</div>
                    <div className="font-semibold">{framework.controls.nonCompliant}</div>
                  </div>
                </div>

                <div className="text-sm text-gray-500 dark:text-gray-400 mt-3">
                  Last assessed: {formatDate(framework.lastAssessment)}
                </div>
              </div>
            ))}
          </div>

          {/* Controls Table */}
          <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
            <h3 className="text-lg font-medium mb-4">
              {selectedFramework
                ? `${frameworksData.find(f => f.id === selectedFramework)?.name} Controls`
                : 'All Controls'}
            </h3>

            {filteredControls.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead className="bg-gray-50 dark:bg-gray-700">
                    <tr>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Control ID
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Title
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Status
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Last Tested
                      </th>
                      <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    {filteredControls.map((control) => (
                      <tr key={control.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                          {control.controlId}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                          <div className="font-medium text-gray-900 dark:text-white">{control.title}</div>
                          <div className="text-sm text-gray-500 dark:text-gray-400 truncate max-w-md">
                            {control.description}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColorClass(control.status)}`}>
                            {control.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                          {formatDate(control.lastTested)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <a href="#" className="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300">View Details</a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                No controls found matching your filters. Try adjusting your search criteria.
              </div>
            )}
          </div>
        </div>
      </ReportStatus>
    </ReportPage>
  );
};

export default CompliancePage;
