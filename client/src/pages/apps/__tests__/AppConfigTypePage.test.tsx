/**
 * Tests: AppConfigTypePage — the generic, manifest-driven Configuration Canvas
 * authoring surface. Exercises the list, the template-seeded form, save->create,
 * validate->errors, and the not-enabled panel. The real ConfigurationCanvas is
 * rendered; only configurationCanvasApi, the template fetchers, and the pipeline
 * resource helpers are mocked.
 */

import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'

import AppConfigTypePage from '../AppConfigTypePage'
import { useApps } from '../../../contexts/AppContext'
import { appService } from '../../../services/appService'
import { configurationCanvasApi } from '@/components/shared/ConfigurationCanvas'
import * as canvasTemplate from '../canvasTemplate'
import * as resources from '../appConfigResources'
import { ToastProvider } from '../../../components/shared/Toast'
import { ConfirmationDialogProvider } from '../../../components/shared/ConfirmationDialog'
import type { EnabledApp } from '../../../services/appService'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../../../contexts/AppContext', () => ({ useApps: vi.fn() }))
vi.mock('../../../services/appService', () => ({ appService: { getAppDetail: vi.fn() } }))

// Keep the real (pure) canvasTemplateToSections; mock only the network fetchers.
vi.mock('../canvasTemplate', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../canvasTemplate')>()
  return { ...actual, fetchCanvasTemplate: vi.fn(), fetchCanvasDefaults: vi.fn() }
})

vi.mock('../appConfigResources', () => ({
  validateCanvas: vi.fn(),
  deployCanvas: vi.fn(),
  pollDeployment: vi.fn(),
  fetchComponents: vi.fn(),
  fetchTags: vi.fn(),
  fetchUsers: vi.fn(),
}))

// Keep the real ConfigurationCanvas component; mock only the CRUD api.
vi.mock('@/components/shared/ConfigurationCanvas', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/shared/ConfigurationCanvas')>()
  return {
    ...actual,
    configurationCanvasApi: {
      ...actual.configurationCanvasApi,
      getAll: vi.fn(),
      getById: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      duplicate: vi.fn(),
      submitForApproval: vi.fn(),
    },
  }
})

const mockUseApps = useApps as unknown as Mock
const mockGetAppDetail = appService.getAppDetail as unknown as Mock
const api = configurationCanvasApi as unknown as {
  getAll: Mock
  getById: Mock
  create: Mock
  update: Mock
  delete: Mock
  duplicate: Mock
  submitForApproval: Mock
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
  configurationTypes: [{ id: 'host-groups', name: 'Host Groups' }],
}

const template: canvasTemplate.CanvasTemplate = {
  sections: [
    {
      name: 'Group',
      fields: [
        { key: 'name', label: 'Group Name', fieldType: 'text', required: true, defaultValue: 'default-group' },
        {
          key: 'platform',
          label: 'Platform',
          fieldType: 'select',
          defaultValue: 'windows',
          options: [
            { label: 'Windows', value: 'windows' },
            { label: 'Linux', value: 'linux' },
          ],
        },
      ],
    },
  ],
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

function renderPage(url = '/apps/edr/config/host-groups') {
  return render(
    <ToastProvider>
      <ConfirmationDialogProvider>
        <MemoryRouter initialEntries={[url]}>
          <Routes>
            <Route path="/apps/:appId/config/:configTypeId" element={<AppConfigTypePage />} />
            <Route path="/apps" element={<div>apps management</div>} />
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
  api.getById.mockResolvedValue({ name: 'X', sections: [], tags: [] })
  api.create.mockResolvedValue({ id: 'new-config' })
  api.update.mockResolvedValue({ id: 'c1' })
  api.duplicate.mockResolvedValue({ id: 'c2' })
  api.delete.mockResolvedValue(undefined)
  api.submitForApproval.mockResolvedValue({})
  mockGetAppDetail.mockResolvedValue({
    configurationTypes: [{ id: 'host-groups', name: 'Host Groups', componentTypes: ['edr-tenant'] }],
  })
  ;(resources.fetchComponents as Mock).mockResolvedValue([])
  ;(resources.fetchTags as Mock).mockResolvedValue([])
  ;(resources.fetchUsers as Mock).mockResolvedValue([])
  ;(resources.validateCanvas as Mock).mockResolvedValue({ valid: true, errors: [], warnings: [] })
  ;(canvasTemplate.fetchCanvasTemplate as Mock).mockResolvedValue(template)
  ;(canvasTemplate.fetchCanvasDefaults as Mock).mockResolvedValue({})
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AppConfigTypePage', () => {
  it('renders the configuration list keyed by appId + configTypeId', async () => {
    api.getAll.mockResolvedValue([
      {
        id: 'c1',
        name: 'Windows Servers',
        toolType: 'edr',
        entityType: 'host-groups',
        status: 'DRAFT',
        version: 3,
        sectionsCount: 1,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-02T00:00:00Z',
        tags: [],
      },
    ])

    renderPage()

    expect(await screen.findByText('Windows Servers')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Host Groups' })).toBeInTheDocument()
    expect(screen.getByText('v3')).toBeInTheDocument()
    expect(api.getAll).toHaveBeenCalledWith({ toolType: 'edr', entityType: 'host-groups' })
  })

  it('shows an empty state when there are no configurations', async () => {
    api.getAll.mockResolvedValue([])
    renderPage()
    expect(
      await screen.findByText('No Host Groups configurations yet — create one.'),
    ).toBeInTheDocument()
  })

  it('renders a fillable form seeded from the canvas template', async () => {
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: /New configuration/i }))

    // Required field: label present with the required asterisk marker.
    const label = await screen.findByText('Group Name')
    expect(label.textContent).toContain('*')

    // Select field renders its template options.
    expect(screen.getByRole('option', { name: 'Windows' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Linux' })).toBeInTheDocument()

    expect(canvasTemplate.fetchCanvasTemplate).toHaveBeenCalledWith('edr', 'host-groups')
  })

  it('calls create on save with the app + config type as tool/entity type', async () => {
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: /New configuration/i }))
    await screen.findByText('Group Name') // form ready (seeded values satisfy validation)

    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(api.create).toHaveBeenCalled())
    const [meta, sections] = api.create.mock.calls[0]
    expect(meta).toMatchObject({ toolType: 'edr', entityType: 'host-groups' })
    expect(Array.isArray(sections)).toBe(true)
    expect(sections.length).toBeGreaterThan(0)
  })

  it('validates a configuration and shows field-level errors', async () => {
    api.getAll.mockResolvedValue([
      {
        id: 'c1',
        name: 'Grp',
        toolType: 'edr',
        entityType: 'host-groups',
        status: 'DRAFT',
        version: 1,
        sectionsCount: 1,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
        tags: [],
      },
    ])
    ;(resources.validateCanvas as Mock).mockResolvedValue({
      valid: false,
      errors: [{ field: 'name', message: 'Name is required' }],
      warnings: [],
    })

    renderPage()
    await screen.findByText('Grp')

    await userEvent.click(screen.getByTitle('Validate'))

    expect(await screen.findByText('Name is required')).toBeInTheDocument()
    expect(resources.validateCanvas).toHaveBeenCalledWith('c1')
  })

  it('shows a friendly panel when the app is not enabled', async () => {
    setApps([])
    renderPage('/apps/ghost/config/host-groups')

    expect(await screen.findByText('App not available')).toBeInTheDocument()
    // Pre-existing stale assertion fixed in passing: "Manage apps" links to
    // the Marketplace catalog (matches the component's actual
    // `to="/marketplace"` and every other "browse the marketplace" CTA in
    // the app). Unrelated to RBAC/permissions.
    expect(screen.getByRole('link', { name: 'Manage apps' })).toHaveAttribute('href', '/marketplace')
    // Gated resources must not be fetched when the app is unavailable.
    expect(api.getAll).not.toHaveBeenCalled()
  })
})
