import React from 'react';
import { MetricCardProps } from '../types';

/**
 * Metric Card Component
 * Displays a single metric with optional change indicator and icon
 * Memoized to prevent unnecessary re-renders
 */
const MetricCard: React.FC<MetricCardProps> = React.memo(({ 
  title, 
  value, 
  change, 
  icon, 
  className = '' 
}) => {
  return (
    <div className={`bg-white dark:bg-gray-800 rounded-lg shadow p-5 ${className}`}>
      <div className="flex justify-between items-start">
        <div>
          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">{title}</h3>
          <p className="text-2xl font-bold mt-1">{value}</p>
          {change !== undefined && (
            <p className={`text-sm mt-1 ${change >= 0 ? 'text-green-500' : 'text-red-500'}`}>
              {change >= 0 ? '+' : ''}{change}% from previous period
            </p>
          )}
        </div>
        {icon && <div className="text-blue-500 text-2xl">{icon}</div>}
      </div>
    </div>
  );
});

MetricCard.displayName = 'MetricCard';

export default MetricCard;
