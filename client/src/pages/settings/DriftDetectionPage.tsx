import React from 'react';
import { Activity } from 'lucide-react';
import { Card, CardBody } from '../../components/shared/Card';
import { DriftScheduleControl } from '../../components/shared/Pipeline';

/**
 * Drift Detection settings — the tenant-wide scheduled-check frequency. Per-app
 * overrides live in each app's own settings (and win over this default).
 */
const DriftDetectionPage: React.FC = () => {
  return (
    <div>
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900 dark:text-white">
          <Activity className="h-6 w-6 text-indigo-500" aria-hidden="true" />
          Drift Detection
        </h1>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Veltrix periodically checks your deployed configurations for manual changes made outside the pipeline
          (configuration drift). Set how often that scheduled check runs.
        </p>
      </div>

      <Card variant="bordered" className="max-w-2xl">
        <CardBody className="space-y-4">
          <div>
            <h2 className="font-semibold text-gray-900 dark:text-white">Scheduled check frequency</h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              The default for every app. Individual apps can override this in their own settings — a per-app setting
              always wins over this tenant default. You can still run a check on demand from any configuration at any time.
            </p>
          </div>
          <DriftScheduleControl />
        </CardBody>
      </Card>
    </div>
  );
};

export default DriftDetectionPage;
