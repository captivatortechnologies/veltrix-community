import React, { ReactNode } from 'react';
import ExportDropdown from './ExportDropdown';

/**
 * Report page props
 */
interface ReportPageProps {
  /**
   * Title of the report
   */
  title: string;
  
  /**
   * Children to render in the report
   */
  children: ReactNode;
  
  /**
   * Data to export (for CSV and Excel)
   */
  exportData: Record<string, unknown>[];
  
  /**
   * CSS selector for the content to export (for PDF and PNG)
   */
  contentSelector: string;
  
  /**
   * Actions to display next to the export dropdown (optional)
   */
  actions?: ReactNode;
}

/**
 * Report Page component
 * Provides a consistent layout for all report pages
 * with title, export functionality, and content area
 */
const ReportPage: React.FC<ReportPageProps> = ({
  title,
  children,
  exportData,
  contentSelector,
  actions
}) => {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-semibold">{title}</h2>
        
        <div className="flex items-center space-x-4">
          {actions && (
            <div className="flex items-center">
              {actions}
            </div>
          )}
          
          <div className="relative">
            <div className="flex items-center">
              <span className="text-sm text-gray-600 dark:text-gray-300 mr-2">Export:</span>
              <ExportDropdown 
                title={title}
                data={exportData}
                contentSelector={contentSelector}
              />
            </div>
          </div>
        </div>
      </div>
      
      {children}
    </div>
  );
};

export default ReportPage;
