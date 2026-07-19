import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { BarChart2, Puzzle, ShieldCheck, KeyRound, AlertCircle } from 'lucide-react'
import { PipelineSummaryCards, pipelineApi, type PipelineSummary } from '../components/shared/Pipeline'
import AppsIntegrationsCard from './HomePageDashboards/AppsIntegrationsCard'
import SandboxesCard from './HomePageDashboards/SandboxesCard'
import RecentActivity from './HomePageDashboards/RecentActivity'
import { useBrand } from '../brand'

interface QuickLinkProps {
  to: string
  icon: React.ReactNode
  title: string
  description: string
  color: string
}

const QuickLink: React.FC<QuickLinkProps> = ({ to, icon, title, description, color }) => {
  return (
    <Link
      to={to}
      className={`block p-6 rounded-lg shadow-md hover:shadow-lg transition-shadow bg-surface-raised border-l-4 ${color}`}
    >
      <div className="flex items-start">
        <div className="mr-4" aria-hidden="true">
          {icon}
        </div>
        <div>
          <h3 className="text-lg font-semibold mb-2 text-content-primary">{title}</h3>
          <p className="text-content-secondary">{description}</p>
        </div>
      </div>
    </Link>
  )
}

const EMPTY_SUMMARY: PipelineSummary = {
  pendingValidations: 0,
  pendingApprovals: 0,
  activeDeployments: 0,
  failedDeployments: 0,
  unresolvedDrifts: 0,
}

const HomePage: React.FC = () => {
  const brand = useBrand()
  const [summary, setSummary] = useState<PipelineSummary>(EMPTY_SUMMARY)
  const [summaryLoading, setSummaryLoading] = useState(true)
  const [summaryError, setSummaryError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setSummaryLoading(true)
    setSummaryError(null)
    pipelineApi
      .getSummary()
      .then((data) => {
        if (!cancelled) setSummary(data)
      })
      .catch((err) => {
        if (!cancelled)
          setSummaryError(err instanceof Error ? err.message : 'Failed to load pipeline summary')
      })
      .finally(() => {
        if (!cancelled) setSummaryLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold mb-2 text-content-primary">Welcome to {brand.name}</h1>
        <p className="text-content-secondary mb-6">
          Your centralized security configuration, automation, and orchestration platform
        </p>

        {/* Pipeline health — real counts from GET /api/pipeline/summary */}
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-content-primary flex items-center gap-2">
            <ShieldCheck size={20} className="text-primary" aria-hidden="true" />
            Pipeline Health
          </h2>
          <Link to="/pipeline" className="text-sm font-medium text-primary hover:text-primary-hover">
            View pipeline
          </Link>
        </div>
        {summaryError ? (
          <div className="bg-danger-subtle border border-danger/30 rounded-lg px-4 py-3 flex items-center gap-2 text-danger-subtle-foreground mb-8">
            <AlertCircle className="h-5 w-5 flex-shrink-0" aria-hidden="true" />
            <span className="text-sm">{summaryError}</span>
          </div>
        ) : (
          <div className="mb-8">
            <PipelineSummaryCards summary={summary} loading={summaryLoading} />
          </div>
        )}

        {/* Apps + Sandboxes — real counts from GET /api/apps and GET /api/sandboxes */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <AppsIntegrationsCard />
          <SandboxesCard />
        </div>
      </div>

      {/* Quick Links — every destination below is a real, routable page */}
      <div>
        <h2 className="text-xl font-semibold mb-4 text-content-primary">Quick Links</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <QuickLink
            to="/apps"
            icon={<Puzzle size={24} className="text-primary" />}
            title="Apps & Integrations"
            description="Configure and manage your security tool integrations"
            color="border-primary"
          />
          <QuickLink
            to="/reports"
            icon={<BarChart2 size={24} className="text-success" />}
            title="Compliance & Reports"
            description="View compliance status and generate reports"
            color="border-success"
          />
          <QuickLink
            to="/pipeline"
            icon={<ShieldCheck size={24} className="text-info" />}
            title="Security-as-Code Pipeline"
            description="Validate, approve, and deploy configuration changes"
            color="border-info"
          />
          <QuickLink
            to="/access-control"
            icon={<KeyRound size={24} className="text-warning" />}
            title="Access Control"
            description="Manage users, roles and permissions"
            color="border-warning"
          />
        </div>
      </div>

      <RecentActivity />
    </div>
  )
}

export default HomePage
