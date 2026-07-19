import React from 'react';
import { Outlet } from 'react-router-dom';
import { Link, useLocation } from 'react-router-dom';

const ReportsPage: React.FC = () => {
  const location = useLocation();
  
  // Define report categories and their respective routes
  const reportCategories = [
    { name: 'Security Overview', path: '/reports/security-overview' },
    { name: 'Compliance', path: '/reports/compliance' },
    { name: 'Audit Logs', path: '/reports/audit-logs' },
    { name: 'User Activity', path: '/reports/user-activity' },
    { name: 'Resource Usage', path: '/reports/resource-usage' }
  ];

  return (
    <div className="container mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold mb-6">Reports &amp; Analytics</h1>
      
      {/* Report navigation tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700 mb-6">
        <nav className="flex -mb-px overflow-x-auto">
          {reportCategories.map((category) => (
            <Link
              key={category.path}
              to={category.path}
              className={`whitespace-nowrap py-3 px-4 border-b-2 font-medium text-sm ${
                location.pathname === category.path
                  ? 'border-blue-500 text-blue-600 dark:border-blue-400 dark:text-blue-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
              }`}
            >
              {category.name}
            </Link>
          ))}
        </nav>
      </div>
      
      {/* This will render the child route component */}
      <Outlet />
      
      {/* If no child route is selected, show default content */}
      {location.pathname === '/reports' && (
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Reports Dashboard</h2>
          <p className="text-gray-600 dark:text-gray-300 mb-4">
            Select a report category from the tabs above to view detailed analytics and insights.
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-8">
            {reportCategories.map((category) => (
              <Link
                to={category.path}
                key={category.path}
                className="bg-gray-50 dark:bg-gray-700 p-6 rounded-lg shadow-sm hover:shadow-md transition-shadow duration-200"
              >
                <h3 className="text-lg font-medium mb-2">{category.name}</h3>
                <p className="text-gray-500 dark:text-gray-400 text-sm">
                  View {category.name.toLowerCase()} reports and analytics
                </p>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ReportsPage;
