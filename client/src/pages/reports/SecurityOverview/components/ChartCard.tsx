import React from 'react';
import { ChartCardProps } from '../types';

/**
 * Chart Card Component
 * A container for chart elements with a title and optional description
 * Memoized to prevent unnecessary re-renders
 */
const ChartCard: React.FC<ChartCardProps> = React.memo(({ 
  title, 
  description, 
  children, 
  className = '' 
}) => {
  return (
    <div className={`bg-white dark:bg-gray-800 rounded-lg shadow p-5 ${className}`}>
      <h3 className="text-lg font-medium mb-2">{title}</h3>
      {description && <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{description}</p>}
      {children}
    </div>
  );
});

ChartCard.displayName = 'ChartCard';

export default ChartCard;
