import React from 'react'
import { Link, useLocation } from 'react-router-dom'
import { LayoutDashboard, Grid3X3, AlertTriangle } from 'lucide-react'

const navItems = [
  { to: '/pipeline', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/pipeline/environments', label: 'Environments', icon: Grid3X3 },
  { to: '/pipeline/drift', label: 'Drift', icon: AlertTriangle },
]

const PipelineNav: React.FC = () => {
  const location = useLocation()

  return (
    <div className="flex items-center gap-1 border-b border-gray-200 dark:border-gray-700 mb-6">
      {navItems.map((item) => {
        const isActive = location.pathname === item.to
        const Icon = item.icon
        return (
          <Link
            key={item.to}
            to={item.to}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              isActive
                ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
            }`}
          >
            <Icon className="w-4 h-4" />
            {item.label}
          </Link>
        )
      })}
    </div>
  )
}

export default PipelineNav
