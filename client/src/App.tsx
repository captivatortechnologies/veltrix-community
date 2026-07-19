import './App.css'
import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Navbar from './components/ui/Navbar'
import Sidebar from './components/ui/Sidebar'
import Breadcrumbs from './components/ui/Breadcrumbs'
import OfflineIndicator from './components/OfflineIndicator'
import { ThemeProvider } from './contexts/ThemeContext'
import ErrorBoundary from './components/ErrorBoundary'
import { QueryProvider } from './lib/queryClient'
import { ToastProvider } from './components/shared/Toast'
import { ConfirmationDialogProvider } from './components/shared/ConfirmationDialog'
import { isAuthenticated } from './services/authService'
import { AppProvider } from './contexts/AppContext'
import { FeatureFlagProvider } from './contexts/FeatureFlagContext'
import { RealtimeProvider } from './contexts/RealtimeContext'

// Loading component
const LoadingFallback = () => (
  <div className="flex items-center justify-center h-screen">
    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
  </div>
);

// Lazy load pages for code splitting
// Auth pages (loaded immediately as they're entry points)
import LoginPage from './pages/access/LoginPage'
import SignupPage from './pages/access/SignupPage'
import ForgotPasswordPage from './pages/access/ForgotPasswordPage'
import ResetPasswordPage from './pages/access/ResetPasswordPage'
import OAuthCallbackPage from './pages/access/OAuthCallbackPage'

// Core pages (lazy loaded)
const HomePage = lazy(() => import('./pages/HomePage'));

// Settings pages
const SettingsPage = lazy(() => import('./pages/settings'));
const OrganizationPage = lazy(() => import('./pages/settings/OrganizationPage'));
const EmailSettingsPage = lazy(() => import('./pages/settings/EmailSettingsPage'));
const KeysTokenPage = lazy(() => import('./pages/settings/KeysTokenPage'));
const LogsPage = lazy(() => import('./pages/settings/LogsPage'));
const ConnectivityPage = lazy(() => import('./pages/settings/ConnectivityPage'));
const CloudAccountsPage = lazy(() => import('./pages/settings/CloudAccountsPage'));
const RemoteAccessPage = lazy(() => import('./pages/settings/RemoteAccessPage'));

// Access Control pages
const AccessControlPage = lazy(() => import('./pages/access/AccessControlPage'));

// Profile pages
const ProfilePage = lazy(() => import('./pages/profile/ProfilePage'));
const ProfileSettingsPage = lazy(() => import('./pages/profile/ProfileSettingsPage'));

// App Management pages
const AppManagementPage = lazy(() => import('./pages/apps/AppManagementPage'));
const InstalledAppsPage = lazy(() => import('./pages/apps/InstalledAppsPage'));
const AppDetailPage = lazy(() => import('./pages/apps/AppDetailPage'));
// Generic host that loads ANY enabled app's client bundle + pages dynamically
const AppPageHost = lazy(() => import('./pages/apps/AppPageHost'));
// Generic, manifest-driven Configuration Canvas authoring surface for ANY app
const AppConfigTypePage = lazy(() => import('./pages/apps/AppConfigTypePage'));
// Generic, manifest-driven Pipeline surface: every configuration across every
// configuration type for ANY app, in one place.
const AppPipelinePage = lazy(() => import('./pages/apps/AppPipelinePage'));

// Sandbox pages (developer sandboxes for the Veltrix CLI dev loop)
const SandboxesPage = lazy(() => import('./pages/sandboxes/SandboxesPage'));
const SandboxDetailPage = lazy(() => import('./pages/sandboxes/SandboxDetailPage'));

// Pipeline pages
const PipelineDashboard = lazy(() => import('./pages/pipeline/PipelineDashboard'));
const EnvironmentMatrix = lazy(() => import('./pages/pipeline/EnvironmentMatrix'));
const DriftOverview = lazy(() => import('./pages/pipeline/DriftOverview'));

// Environments management (Tag + ownership + deployment policy)
const EnvironmentsPage = lazy(() => import('./pages/environments/EnvironmentsPage'));

// Reports pages
const ReportsPage = lazy(() => import('./pages/reports'));
const SecurityOverviewPage = lazy(() => import('./pages/reports/SecurityOverview/index'));
const CompliancePage = lazy(() => import('./pages/reports/Compliance/index'));
const AuditLogsPage = lazy(() => import('./pages/reports/AuditLogs/index'));
const UserActivityPage = lazy(() => import('./pages/reports/UserActivity/index'));
const ResourceUsagePage = lazy(() => import('./pages/reports/ResourceUsage/index'));

// Layout component for authenticated pages with sidebar
const AuthenticatedLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <div className="flex h-screen bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Navbar />
        <main className="flex-1 overflow-y-auto px-2 py-6">
          <div className="w-full">
            <Breadcrumbs />
            <Suspense fallback={<LoadingFallback />}>
              {children}
            </Suspense>
          </div>
        </main>
      </div>
    </div>
  );
};

function App() {
  return (
    <ErrorBoundary>
      <QueryProvider>
        <ToastProvider>
          <ConfirmationDialogProvider>
            <ThemeProvider>
              <BrowserRouter>
              <FeatureFlagProvider>
              <AppProvider>
              <RealtimeProvider>
            <div className="min-h-screen bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
            <OfflineIndicator />
          {/* Unauthenticated routes */}
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<SignupPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/oauth/callback" element={<OAuthCallbackPage />} />

            {/* Authenticated routes with sidebar layout */}
            <Route path="/" element={
              isAuthenticated() ? (
                <AuthenticatedLayout>
                  <HomePage />
                </AuthenticatedLayout>
              ) : (
                <Navigate to="/login" />
              )
            } />

            {/* Reports routes with nested child routes */}
            <Route path="/reports" element={
              isAuthenticated() ? (
                <AuthenticatedLayout>
                  <ReportsPage />
                </AuthenticatedLayout>
              ) : (
                <Navigate to="/login" />
              )
            } />

            <Route path="/reports/security-overview" element={
              isAuthenticated() ? (
                <AuthenticatedLayout>
                  <SecurityOverviewPage />
                </AuthenticatedLayout>
              ) : (
                <Navigate to="/login" />
              )
            } />

            <Route path="/reports/compliance" element={
              isAuthenticated() ? (
                <AuthenticatedLayout>
                  <CompliancePage />
                </AuthenticatedLayout>
              ) : (
                <Navigate to="/login" />
              )
            } />

            <Route path="/reports/audit-logs" element={
              isAuthenticated() ? (
                <AuthenticatedLayout>
                  <AuditLogsPage />
                </AuthenticatedLayout>
              ) : (
                <Navigate to="/login" />
              )
            } />

            <Route path="/reports/user-activity" element={
              isAuthenticated() ? (
                <AuthenticatedLayout>
                  <UserActivityPage />
                </AuthenticatedLayout>
              ) : (
                <Navigate to="/login" />
              )
            } />

            <Route path="/reports/resource-usage" element={
              isAuthenticated() ? (
                <AuthenticatedLayout>
                  <ResourceUsagePage />
                </AuthenticatedLayout>
              ) : (
                <Navigate to="/login" />
              )
            } />

            <Route path="/settings" element={
              isAuthenticated() ? (
                <AuthenticatedLayout>
                  <SettingsPage />
                </AuthenticatedLayout>
              ) : (
                <Navigate to="/login" />
              )
            } />

            <Route path="/settings/connectivity" element={
              isAuthenticated() ? (
                <AuthenticatedLayout>
                  <ConnectivityPage />
                </AuthenticatedLayout>
              ) : (
                <Navigate to="/login" />
              )
            } />

            <Route path="/settings/cloud-accounts" element={
              isAuthenticated() ? (
                <AuthenticatedLayout>
                  <CloudAccountsPage />
                </AuthenticatedLayout>
              ) : (
                <Navigate to="/login" />
              )
            } />

            <Route path="/settings/remote-access" element={
              isAuthenticated() ? (
                <AuthenticatedLayout>
                  <RemoteAccessPage />
                </AuthenticatedLayout>
              ) : (
                <Navigate to="/login" />
              )
            } />

            {/* /settings/users and /settings/roles are superseded by the Access Control
                tabs (see /access-control) - kept as redirects in case of stale bookmarks/links. */}
            <Route path="/settings/users" element={<Navigate to="/access-control" replace />} />
            <Route path="/settings/roles" element={<Navigate to="/access-control" replace />} />

            <Route path="/settings/organization" element={
              isAuthenticated() ? (
                <AuthenticatedLayout>
                  <OrganizationPage />
                </AuthenticatedLayout>
              ) : (
                <Navigate to="/login" />
              )
            } />

            <Route path="/settings/email" element={
              isAuthenticated() ? (
                <AuthenticatedLayout>
                  <EmailSettingsPage />
                </AuthenticatedLayout>
              ) : (
                <Navigate to="/login" />
              )
            } />

            <Route path="/settings/keys-token" element={
              isAuthenticated() ? (
                <AuthenticatedLayout>
                  <KeysTokenPage />
                </AuthenticatedLayout>
              ) : (
                <Navigate to="/login" />
              )
            } />

            <Route path="/settings/logs" element={
              isAuthenticated() ? (
                <AuthenticatedLayout>
                  <LogsPage />
                </AuthenticatedLayout>
              ) : (
                <Navigate to="/login" />
              )
            } />

            {/* HomePage links to /logs ("View all activity") - alias to the real page
                so that link works without HomePage needing to know the settings nesting. */}
            <Route path="/logs" element={<Navigate to="/settings/logs" replace />} />

            <Route path="/access-control" element={
              isAuthenticated() ? (
                <AuthenticatedLayout>
                  <AccessControlPage />
                </AuthenticatedLayout>
              ) : (
                <Navigate to="/login" />
              )
            } />

            {/* Marketplace catalog (full list of installable apps/tools). */}
            <Route path="/marketplace" element={
              isAuthenticated() ? (
                <AuthenticatedLayout>
                  <AppManagementPage />
                </AuthenticatedLayout>
              ) : (
                <Navigate to="/login" />
              )
            } />

            {/* "Apps" destination (sidebar) - the roster of apps installed for
                this organization, distinct from the Marketplace catalog at
                /marketplace. Bare /apps only - /apps/:appId (below) is a
                specific installed app's own pages. */}
            <Route path="/apps" element={
              isAuthenticated() ? (
                <AuthenticatedLayout>
                  <InstalledAppsPage />
                </AuthenticatedLayout>
              ) : (
                <Navigate to="/login" />
              )
            } />

            {/* Legacy path - redirect stale /installed-apps bookmarks to /apps. */}
            <Route path="/installed-apps" element={<Navigate to="/apps" replace />} />

            {/* Bare /apps/:appId is the manifest-driven overview for any installed app.
                Its sub-pages (/apps/:appId/<page.path>) are handled by the generic
                AppPageHost route below, which mounts the app's own client bundle. */}
            <Route path="/apps/:appId" element={
              isAuthenticated() ? (
                <AuthenticatedLayout>
                  <AppDetailPage />
                </AuthenticatedLayout>
              ) : (
                <Navigate to="/login" />
              )
            } />

            {/* Generic Configuration Canvas authoring surface for ANY app's
                configuration type. Placed BEFORE the /apps/:appId/* AppPageHost
                route so it matches first; both live in the same auth-protected
                layout. Nothing app-specific — it reads the app's canvas.yaml. */}
            <Route path="/apps/:appId/config/:configTypeId" element={
              isAuthenticated() ? (
                <AuthenticatedLayout>
                  <AppConfigTypePage />
                </AuthenticatedLayout>
              ) : (
                <Navigate to="/login" />
              )
            } />

            {/* Generic Pipeline surface for ANY app: every configuration across every
                configuration type, in one place, with all pipeline actions wired.
                Placed alongside the config-type route, BEFORE the /apps/:appId/*
                AppPageHost wildcard route so it matches first. Nothing app-specific —
                it reads app.configurationTypes and configurationCanvasApi.getAll. */}
            <Route path="/apps/:appId/pipeline" element={
              isAuthenticated() ? (
                <AuthenticatedLayout>
                  <AppPipelinePage />
                </AuthenticatedLayout>
              ) : (
                <Navigate to="/login" />
              )
            } />

            {/* Generic app page host: any enabled marketplace app's sub-pages are
                served from its client bundle (/api/apps/:appId/client.mjs) and matched
                against its manifest-declared pages. The static splunk-enterprise route
                above outranks this parametric one, so the legacy page is unaffected,
                and bare /apps/:appId still resolves to the AppDetailPage overview. */}
            <Route path="/apps/:appId/*" element={
              isAuthenticated() ? (
                <AuthenticatedLayout>
                  <AppPageHost />
                </AuthenticatedLayout>
              ) : (
                <Navigate to="/login" />
              )
            } />

            <Route path="/sandboxes" element={
              isAuthenticated() ? (
                <AuthenticatedLayout>
                  <SandboxesPage />
                </AuthenticatedLayout>
              ) : (
                <Navigate to="/login" />
              )
            } />

            <Route path="/sandboxes/:id" element={
              isAuthenticated() ? (
                <AuthenticatedLayout>
                  <SandboxDetailPage />
                </AuthenticatedLayout>
              ) : (
                <Navigate to="/login" />
              )
            } />

            <Route path="/environments" element={
              isAuthenticated() ? (
                <AuthenticatedLayout>
                  <EnvironmentsPage />
                </AuthenticatedLayout>
              ) : (
                <Navigate to="/login" />
              )
            } />

            <Route path="/pipeline" element={
              isAuthenticated() ? (
                <AuthenticatedLayout>
                  <PipelineDashboard />
                </AuthenticatedLayout>
              ) : (
                <Navigate to="/login" />
              )
            } />

            <Route path="/pipeline/environments" element={
              isAuthenticated() ? (
                <AuthenticatedLayout>
                  <EnvironmentMatrix />
                </AuthenticatedLayout>
              ) : (
                <Navigate to="/login" />
              )
            } />

            <Route path="/pipeline/drift" element={
              isAuthenticated() ? (
                <AuthenticatedLayout>
                  <DriftOverview />
                </AuthenticatedLayout>
              ) : (
                <Navigate to="/login" />
              )
            } />

            <Route path="/profile" element={
              isAuthenticated() ? (
                <AuthenticatedLayout>
                  <ProfilePage />
                </AuthenticatedLayout>
              ) : (
                <Navigate to="/login" />
              )
            } />

            <Route path="/profile/settings" element={
              isAuthenticated() ? (
                <AuthenticatedLayout>
                  <ProfileSettingsPage />
                </AuthenticatedLayout>
              ) : (
                <Navigate to="/login" />
              )
            } />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </div>
              </RealtimeProvider>
              </AppProvider>
              </FeatureFlagProvider>
            </BrowserRouter>
          </ThemeProvider>
          </ConfirmationDialogProvider>
        </ToastProvider>
      </QueryProvider>
    </ErrorBoundary>
  )
}

export default App
