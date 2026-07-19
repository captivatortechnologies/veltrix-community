import React from 'react'
import { CheckCircle, XCircle, AlertTriangle } from 'lucide-react'
import type { ValidationResult } from '../api/pipelineApi'

interface ValidationResultsProps {
  result: ValidationResult
  compact?: boolean
}

const ValidationResults: React.FC<ValidationResultsProps> = ({ result, compact = false }) => {
  if (compact) {
    return (
      <div className="flex items-center gap-2">
        {result.valid ? (
          <span className="inline-flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
            <CheckCircle className="w-3.5 h-3.5" /> Valid
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs text-red-600 dark:text-red-400">
            <XCircle className="w-3.5 h-3.5" /> {result.errors.length} error{result.errors.length !== 1 ? 's' : ''}
          </span>
        )}
        {result.warnings.length > 0 && (
          <span className="inline-flex items-center gap-1 text-xs text-yellow-600 dark:text-yellow-400">
            <AlertTriangle className="w-3.5 h-3.5" /> {result.warnings.length}
          </span>
        )}
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
      {/* Header */}
      <div className={`px-4 py-3 flex items-center gap-2 ${
        result.valid
          ? 'bg-green-50 dark:bg-green-900/20'
          : 'bg-red-50 dark:bg-red-900/20'
      }`}>
        {result.valid ? (
          <>
            <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
            <span className="font-medium text-green-700 dark:text-green-300">
              Validation Passed
            </span>
          </>
        ) : (
          <>
            <XCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
            <span className="font-medium text-red-700 dark:text-red-300">
              Validation Failed - {result.errors.length} error{result.errors.length !== 1 ? 's' : ''}
            </span>
          </>
        )}
        {result.warnings.length > 0 && (
          <span className="ml-auto text-xs text-yellow-600 dark:text-yellow-400 flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5" />
            {result.warnings.length} warning{result.warnings.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Errors */}
      {result.errors.length > 0 && (
        <div className="border-t border-gray-200 dark:border-gray-700">
          {result.errors.map((err, i) => (
            <div
              key={i}
              className="px-4 py-2 flex items-start gap-2 border-b border-gray-100 dark:border-gray-700 last:border-b-0"
            >
              <XCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
              <div>
                <span className="text-sm text-gray-900 dark:text-white">{err.message}</span>
                {err.field && (
                  <span className="text-xs text-gray-400 dark:text-gray-500 ml-2 font-mono">
                    {err.field}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Warnings */}
      {result.warnings.length > 0 && (
        <div className="border-t border-gray-200 dark:border-gray-700">
          {result.warnings.map((warn, i) => (
            <div
              key={i}
              className="px-4 py-2 flex items-start gap-2 border-b border-gray-100 dark:border-gray-700 last:border-b-0"
            >
              <AlertTriangle className="w-4 h-4 text-yellow-500 mt-0.5 shrink-0" />
              <div>
                <span className="text-sm text-gray-900 dark:text-white">{warn.message}</span>
                {warn.field && (
                  <span className="text-xs text-gray-400 dark:text-gray-500 ml-2 font-mono">
                    {warn.field}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default ValidationResults
