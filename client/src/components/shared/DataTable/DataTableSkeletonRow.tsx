import React from 'react';
import { Skeleton } from '../Skeleton';

export interface DataTableSkeletonRowProps {
  columnCount: number;
}

/** A single loading-placeholder `<tr>`, rendered `pagination.pageSize` (or 5) times. */
export const DataTableSkeletonRow: React.FC<DataTableSkeletonRowProps> = ({ columnCount }) => (
  <tr>
    {Array.from({ length: Math.max(columnCount, 1) }).map((_, index) => (
      <td key={index} className="px-4 py-3">
        <Skeleton variant="text" width="80%" />
      </td>
    ))}
  </tr>
);

DataTableSkeletonRow.displayName = 'DataTableSkeletonRow';

export default DataTableSkeletonRow;
