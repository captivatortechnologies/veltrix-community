/**
 * Tests: AppPipelinePage — the generic, manifest-driven Pipeline surface that
 * shows the CI/CD pipeline for every configuration across EVERY configuration
 * type of an app, in one place. Exercises cross-type rendering, the status
 * badge, the expandable stage timeline, search/filter narrowing, and the
 * primary row actions (validate, edit-navigate, duplicate, delete, submit for
 * approval, deploy, reviews). Only configurationCanvasApi, appService, and the
 * pipeline resource helpers are mocked — everything else (FilterBar,
 * SortSelect, Pagination, PipelineStatusBadge, PipelineTimeline,
 * ApprovalSubmissionDialog) is the real component.
 */

import React from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'

import AppPipelinePage from '../AppPipelinePage'
import { useApps } from '../../../contexts/AppContext'
import { appService } from '../../../services/appService'
import { configurationCanvasApi } from '@/components/shared/ConfigurationCanvas'
import * as resources from '../appConfigResources'
import { ToastProvider } from '../../../components/shared/Toast'
import { ConfirmationDialogProvider } from '../../../components/shared/ConfirmationDialog'
import type { EnabledApp } from '../../../services/appService'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../../../contexts/AppContext', () => ({ useApps: vi.fn() }))
vi.mock('../../../services/appService', () => ({ appService: { getAppDetail: vi.fn() } }))

vi.mock('../appConfigResources', () => ({
  validateCanvas: vi.fn(),
  deployCanvas: vi.fn(),
  pollDeployment: vi.fn(),
  fetchComponents: vi.fn(),
  fetchTags: vi.fn(),
  fetchUsers: vi.fn(),
}))

// Keep the real ConfigurationCanvas module (ApprovalSubmissionDialog, types);
// mock only the network-backed CRUD/pipeline-review api.
vi.mock('@/components/shared/ConfigurationCanvas', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/shared/ConfigurationCanvas')>()
  return {
    ...actual,
    configurationCanvasApi: {
      ...actual.configurationCanvasApi,
      getAll: vi.fn(),
      duplicate: vi.fn(),
      delete: vi.fn(),
      submitForApproval: vi.fn(),
      getApprovals: vi.fn(),
      getHistory: vi.fn(),
      getComments: vi.fn(),
    },
  }
})

// The Reviews drawer renders a real VersionControlPanel, which independently
// fetches its own history via a separate (unmocked) api module — stub the
// panel itself so opening the drawer never reaches the network, mirroring
// ReviewsDrawer's own test (reviews/__tests__/ReviewsDrawer.test.tsx).
vi.mock('@/components/shared/VersionControl', () => ({
  VersionControlPanel: () => <div data-testid="vcp">version-control-panel</div>,
}))

const mockUseApps = useApps as unknown as Mock
const mockGetAppDetail = appService.getAppDetail as unknown as Mock
const api = configurationCanvasApi as unknown as {
  getAll: Mock
  duplicate: Mock
  delete: Mock
  submitForApproval: Mock
  getApprovals: Mock
  getHistory: Mock
  getComments: Mock
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const testApp: EnabledApp = {
  appId: 'edr',
  name: 'EDR',
  version: '1.0.0',
  category: 'EDR',
  pages: [],
  configurationTypes: [
    { id: 'host-groups', name: 'Host Groups' },
    { id: 'prevention-policies', name: 'Prevention Policies' },
  ],
}

const draftHostGroup = {
  id: 'c1',
  name: 'Windows Servers',
  description: 'All Windows hosts',
  toolType: 'edr',
  entityType: 'host-groups',
  status: 'DRAFT' as const,
  version: 3,
  sectionsCount: 1,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-02T00:00:00Z',
  tags: [],
}

const approvedPolicy = {
  id: 'c2',
  name: 'Strict Policy',
  toolType: 'edr',
  entityType: 'prevention-policies',
  status: 'APPROVED' as const,
  version: 1,
  sectionsCount: 1,
  createdAt: '2026-01-03T00:00:00Z',
  updatedAt: '2026-01-05T00:00:00Z',
  tags: [{ id: 'tag-1', canvasId: 'c2', tagId: 'env-1', tag: { id: 'env-1', name: 'Production' } }],
}

function setApps(apps: EnabledApp[], loading = false) {
  mockUseApps.mockReturnValue({
    enabledApps: apps,
    loading,
    error: null,
    refreshApps: async () => {},
    getSidebarPages: () => [],
  })
}

function renderPage(url = '/apps/edr/pipeline') {
  return render(
    <ToastProvider>
      <ConfirmationDialogProvider>
        <MemoryRouter initialEntries={[url]}>
          <Routes>
            <Route path="/apps/:appId/pipeline" element={<AppPipelinePage />} />
            <Route path="/apps/:appId/config/:configTypeId" element={<div>config type page</div>} />
            <Route path="/marketplace" element={<div>marketplace</div>} />
          </Routes>
        </MemoryRouter>
      </ConfirmationDialogProvider>
    </ToastProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  setApps([testApp])
  api.getAll.mockResolvedValue([])
  api.duplicate.mockResolvedValue({ id: 'c-copy' })
  api.delete.mockResolvedValue(undefined)
  api.submitForApproval.mockResolvedValue({})
  api.getApprovals.mockResolvedValue({
    canvasId: 'c2',
    canvasStatus: 'APPROVED',
    approvals: [],
    summary: { total: 2, approved: 2, pending: 0, rejected: 0 },
  })
  api.getHistory.mockResolvedValue([])
  api.getComments.mockResolvedValue([])
  mockGetAppDetail.mockResolvedValue({
    configurationTypes: [
      { id: 'host-groups', name: 'Host Groups', componentTypes: ['edr-tenant'] },
      { id: 'prevention-policies', name: 'Prevention Policies', componentTypes: ['edr-tenant'] },
    ],
  })
  ;(resources.fetchComponents as Mock).mockResolvedValue([
    { id: 'comp-1', name: 'Prod EDR', type: 'edr-tenant', status: 'ACTIVE' },
  ])
  ;(resources.fetchTags as Mock).mockResolvedValue([{ id: 'env-1', name: 'Production' }])
  ;(resources.fetchUsers as Mock).mockResolvedValue([])
  ;(resources.validateCanvas as Mock).mockResolvedValue({ valid: true, errors: [], warnings: [] })
  ;(resources.deployCanvas as Mock).mockResolvedValue({ deploymentId: 'd1' })
  ;(resources.pollDeployment as Mock).mockResolvedValue({ id: 'd1', status: 'DEPLOYED' })
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AppPipelinePage', () => {
  it('loads every configuration for the app (no entityType filter) and renders rows across multiple configuration types', async () => {
    api.getAll.mockResolvedValue([draftHostGroup, approvedPolicy])

    renderPage()

    expect(await screen.findByText('Windows Servers')).toBeInTheDocument()
    expect(screen.getByText('Strict Policy')).toBeInTheDocument()
    // Each row is labelled with its OWN configuration type's display name.
    // Scoped to the table: the app shell's own nav also has a tab per
    // configuration type, with the same label text.
    const table = screen.getByRole('table')
    expect(within(table).getByText('Host Groups')).toBeInTheDocument()
    expect(within(table).getByText('Prevention Policies')).toBeInTheDocument()
    expect(api.getAll).toHaveBeenCalledWith({ toolType: 'edr' })
  })

  it('shows an empty state with links into each configuration type when the app has no configurations', async () => {
    api.getAll.mockResolvedValue([])
    renderPage()
    expect(await screen.findByText('No configurations yet')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'New Host Groups' })).toHaveAttribute(
      'href',
      '/apps/edr/config/host-groups',
    )
  })

  it('shows the pipeline status badge and approval summary for each row', async () => {
    api.getAll.mockResolvedValue([draftHostGroup, approvedPolicy])
    renderPage()

    await screen.findByText('Windows Servers')
    expect(screen.getByText('Draft')).toBeInTheDocument()
    expect(screen.getByText('Approved')).toBeInTheDocument()
    expect(await screen.findByText('Approved 2/2')).toBeInTheDocument()
  })

  it('expands a row to reveal its pipeline stage timeline', async () => {
    api.getAll.mockResolvedValue([draftHostGroup])
    renderPage()

    const row = (await screen.findByText('Windows Servers')).closest('tr') as HTMLElement
    expect(screen.queryByText('Pipeline stages')).not.toBeInTheDocument()

    await userEvent.click(within(row).getByRole('button', { name: /Show pipeline stages/i }))

    expect(screen.getByText('Pipeline stages')).toBeInTheDocument()
  })

  it('narrows the list by search text', async () => {
    api.getAll.mockResolvedValue([draftHostGroup, approvedPolicy])
    renderPage()
    await screen.findByText('Windows Servers')

    await userEvent.type(screen.getByPlaceholderText('Search configurations…'), 'Strict')

    expect(screen.getByText('Strict Policy')).toBeInTheDocument()
    expect(screen.queryByText('Windows Servers')).not.toBeInTheDocument()
  })

  it('narrows the list by configuration type filter', async () => {
    api.getAll.mockResolvedValue([draftHostGroup, approvedPolicy])
    renderPage()
    await screen.findByText('Windows Servers')

    await userEvent.click(screen.getByRole('combobox', { name: 'Configuration type' }))
    await userEvent.click(screen.getByRole('option', { name: 'Host Groups' }))

    expect(screen.getByText('Windows Servers')).toBeInTheDocument()
    expect(screen.queryByText('Strict Policy')).not.toBeInTheDocument()
  })

  it('validates a configuration and shows the results panel', async () => {
    api.getAll.mockResolvedValue([draftHostGroup])
    ;(resources.validateCanvas as Mock).mockResolvedValue({
      valid: false,
      errors: [{ field: 'name', message: 'Name is required' }],
      warnings: [],
    })
    renderPage()
    await screen.findByText('Windows Servers')

    await userEvent.click(screen.getByTitle('Validate'))

    expect(await screen.findByText('Name is required')).toBeInTheDocument()
    expect(resources.validateCanvas).toHaveBeenCalledWith('c1')
  })

  it('edit navigates to the owning configuration type page (the canvas editor lives there)', async () => {
    api.getAll.mockResolvedValue([draftHostGroup])
    renderPage()
    await screen.findByText('Windows Servers')

    await userEvent.click(screen.getByTitle('Edit'))

    expect(await screen.findByText('config type page')).toBeInTheDocument()
  })

  it('duplicates a configuration', async () => {
    api.getAll.mockResolvedValue([draftHostGroup])
    renderPage()
    await screen.findByText('Windows Servers')

    await userEvent.click(screen.getByTitle('Duplicate'))

    await waitFor(() =>
      expect(api.duplicate).toHaveBeenCalledWith('c1', 'Windows Servers (Copy)'),
    )
  })

  it('deletes a DRAFT configuration after confirmation, and disables delete for non-drafts', async () => {
    api.getAll.mockResolvedValue([draftHostGroup, approvedPolicy])
    renderPage()
    await screen.findByText('Windows Servers')

    const draftRow = screen.getByText('Windows Servers').closest('tr') as HTMLElement
    const approvedRow = screen.getByText('Strict Policy').closest('tr') as HTMLElement
    expect(within(approvedRow).getByTitle('Only drafts can be deleted')).toBeDisabled()

    await userEvent.click(within(draftRow).getByTitle('Delete'))
    const dialog = await screen.findByRole('alertdialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(api.delete).toHaveBeenCalledWith('c1'))
  })

  it('opens the approval submission dialog for a DRAFT configuration only', async () => {
    api.getAll.mockResolvedValue([draftHostGroup, approvedPolicy])
    renderPage()
    await screen.findByText('Windows Servers')

    const draftRow = screen.getByText('Windows Servers').closest('tr') as HTMLElement
    const approvedRow = screen.getByText('Strict Policy').closest('tr') as HTMLElement
    expect(within(approvedRow).queryByTitle('Submit for approval')).not.toBeInTheDocument()

    await userEvent.click(within(draftRow).getByTitle('Submit for approval'))

    expect(await screen.findByRole('heading', { name: 'Submit for Approval' })).toBeInTheDocument()
  })

  it('blocks deploy on a DRAFT row and deploys an APPROVED row once prerequisites are met', async () => {
    api.getAll.mockResolvedValue([draftHostGroup, approvedPolicy])
    renderPage()
    await screen.findByText('Windows Servers')

    const draftRow = screen.getByText('Windows Servers').closest('tr') as HTMLElement
    expect(within(draftRow).getByTitle(/Approve this configuration to deploy/)).toBeDisabled()

    const approvedRow = screen.getByText('Strict Policy').closest('tr') as HTMLElement
    await waitFor(() => expect(within(approvedRow).getByTitle(/^Deploy/)).not.toBeDisabled())

    await userEvent.click(within(approvedRow).getByTitle(/^Deploy/))

    await waitFor(() => expect(resources.deployCanvas).toHaveBeenCalledWith('c2', 'env-1'))
    expect(resources.pollDeployment).toHaveBeenCalledWith('d1')
  })

  it('opens the reviews drawer for a configuration', async () => {
    api.getAll.mockResolvedValue([approvedPolicy])
    renderPage()
    await screen.findByText('Strict Policy')

    await userEvent.click(screen.getByTitle('Reviews & comments'))

    expect(await screen.findByRole('dialog', { name: /Reviews for Strict Policy/ })).toBeInTheDocument()
  })

  it('shows a friendly panel when the app is not enabled', async () => {
    setApps([])
    renderPage('/apps/ghost/pipeline')

    expect(await screen.findByText('App not available')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Manage apps' })).toHaveAttribute('href', '/marketplace')
    expect(api.getAll).not.toHaveBeenCalled()
  })
})
