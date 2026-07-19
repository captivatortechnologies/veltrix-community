import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import Sidebar from '../Sidebar'
import { fetchMyPermissions } from '../../../services/permissionService'
import { usePermissionStore, type PermissionSnapshot } from '../../../stores/permissionStore'

vi.mock('../../../services/permissionService', () => ({
  fetchMyPermissions: vi.fn(),
}))

function renderSidebar(path: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Sidebar />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('Sidebar - Environments nav item', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders an Environments item linking to /environments', () => {
    renderSidebar('/')
    const link = screen.getByRole('link', { name: 'Environments' })
    expect(link).toHaveAttribute('href', '/environments')
  })

  it('marks Environments active when on /environments', () => {
    renderSidebar('/environments')
    expect(screen.getByRole('link', { name: 'Environments' })).toHaveAttribute('aria-current', 'page')
  })

  it('does not mark Environments active on another route', () => {
    renderSidebar('/pipeline')
    expect(screen.getByRole('link', { name: 'Environments' })).not.toHaveAttribute('aria-current')
  })
})

describe('Sidebar - Access Control nav item (Wave C, fail-closed)', () => {
  const allAllSnapshot: PermissionSnapshot = {
    permissions: [{ resource: 'all', action: 'all', appId: null }],
    wildcards: { allAll: true, resources: [] },
    isPlatformAdmin: false,
  };
  const roleReadSnapshot: PermissionSnapshot = {
    permissions: [{ resource: 'role', action: 'read', appId: null }],
    wildcards: { allAll: false, resources: [] },
    isPlatformAdmin: false,
  };
  const noPermissionsSnapshot: PermissionSnapshot = {
    permissions: [],
    wildcards: { allAll: false, resources: [] },
    isPlatformAdmin: false,
  };

  async function openSettingsSubmenu() {
    await userEvent.click(screen.getByRole('button', { name: 'Settings' }))
  }

  beforeEach(() => {
    vi.clearAllMocks()
    usePermissionStore.setState({ snapshot: null })
    localStorage.clear()
    sessionStorage.clear()
    // Expand the sidebar so the Settings item renders as a real submenu
    // toggle (collapsed rail items are plain links, matching jsdom's
    // default narrow-viewport collapse — see useSidebarCollapse.ts).
    localStorage.setItem('sidebar-collapsed', 'false')
  })

  it('FAILS CLOSED: hides Access Control when there is no auth token (no permission source)', async () => {
    renderSidebar('/')
    await openSettingsSubmenu()

    expect(screen.queryByRole('link', { name: 'Access Control' })).not.toBeInTheDocument()
    // Unrelated Settings items are unaffected.
    expect(screen.getByRole('link', { name: 'Organization' })).toBeInTheDocument()
  })

  it('hides Access Control for an authenticated user without role:read', async () => {
    localStorage.setItem('token', 'tok')
    vi.mocked(fetchMyPermissions).mockResolvedValue(noPermissionsSnapshot)

    renderSidebar('/')
    await openSettingsSubmenu()

    expect(screen.queryByRole('link', { name: 'Access Control' })).not.toBeInTheDocument()
  })

  it('shows Access Control once the fetched snapshot grants role:read', async () => {
    localStorage.setItem('token', 'tok')
    vi.mocked(fetchMyPermissions).mockResolvedValue(roleReadSnapshot)

    renderSidebar('/')
    await openSettingsSubmenu()

    const link = await screen.findByRole('link', { name: 'Access Control' })
    expect(link).toHaveAttribute('href', '/access-control')
  })

  it('regression: a tenant Administrator (all:all) sees Access Control exactly as before', async () => {
    localStorage.setItem('token', 'tok')
    vi.mocked(fetchMyPermissions).mockResolvedValue(allAllSnapshot)

    renderSidebar('/')
    await openSettingsSubmenu()

    expect(await screen.findByRole('link', { name: 'Access Control' })).toBeInTheDocument()
  })
})
