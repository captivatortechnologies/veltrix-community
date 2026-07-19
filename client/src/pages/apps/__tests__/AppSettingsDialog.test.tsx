import React from 'react'
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AppSettingsDialog, { type AppSettingsDialogProps } from '../AppSettingsDialog'
import { appService } from '../../../services/appService'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../../../services/appService')

const { mockToastSuccess, mockToastError } = vi.hoisted(() => ({
  mockToastSuccess: vi.fn(),
  mockToastError: vi.fn(),
}))

vi.mock('../../../components/shared/Toast', () => ({
  useToast: () => ({
    success: mockToastSuccess,
    error: mockToastError,
  }),
}))

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockSettings = [
  {
    key: 'api_url',
    type: 'string',
    label: 'API URL',
    description: 'The base URL for API requests',
    required: true,
    value: 'https://api.example.com',
    options: undefined,
    default: undefined,
  },
  {
    key: 'timeout',
    type: 'number',
    label: 'Timeout (ms)',
    description: 'Request timeout in milliseconds',
    required: false,
    value: 3000,
    options: undefined,
    default: '5000',
  },
  {
    key: 'enable_debug',
    type: 'boolean',
    label: 'Enable Debug Mode',
    description: 'Toggle verbose debug logging',
    required: false,
    value: false,
    options: undefined,
    default: undefined,
  },
  {
    key: 'log_level',
    type: 'select',
    label: 'Log Level',
    description: 'Verbosity of log output',
    required: false,
    value: 'info',
    options: ['debug', 'info', 'warn', 'error'],
    default: undefined,
  },
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const defaultProps: AppSettingsDialogProps = {
  open: true,
  appId: 'splunk-enterprise',
  appName: 'Splunk Enterprise',
  onClose: vi.fn(),
  onSaved: vi.fn(),
}

const renderDialog = (props: Partial<AppSettingsDialogProps> = {}) =>
  render(<AppSettingsDialog {...defaultProps} {...props} />)

const setupSuccessMock = () => {
  ;(appService.getAppSettings as Mock).mockResolvedValue({
    appId: 'splunk-enterprise',
    settings: mockSettings,
  })
  ;(appService.updateAppSettings as Mock).mockResolvedValue(undefined)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AppSettingsDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // -------------------------------------------------------------------------
  // Visibility
  // -------------------------------------------------------------------------

  describe('visibility', () => {
    it('renders nothing when open is false', () => {
      setupSuccessMock()
      const { container } = renderDialog({ open: false })
      expect(container.firstChild).toBeNull()
    })

    it('renders the dialog when open is true', async () => {
      setupSuccessMock()
      renderDialog()
      expect(screen.getByRole('dialog')).toBeTruthy()
    })

    it('shows the app name in the header', async () => {
      setupSuccessMock()
      renderDialog()
      expect(screen.getByText('Splunk Enterprise')).toBeTruthy()
    })

    it('shows "App Settings" as the dialog title', async () => {
      setupSuccessMock()
      renderDialog()
      expect(screen.getByText('App Settings')).toBeTruthy()
    })
  })

  // -------------------------------------------------------------------------
  // Fetching
  // -------------------------------------------------------------------------

  describe('fetching settings on open', () => {
    it('calls getAppSettings with the correct appId on mount', async () => {
      setupSuccessMock()
      renderDialog()
      expect(appService.getAppSettings).toHaveBeenCalledWith('splunk-enterprise')
    })

    it('shows a loading skeleton while fetching', () => {
      // Never resolves during this test
      ;(appService.getAppSettings as Mock).mockReturnValue(new Promise(() => {}))
      renderDialog()
      expect(screen.getByLabelText('Loading settings')).toBeTruthy()
    })

    it('renders form fields after successful fetch', async () => {
      setupSuccessMock()
      renderDialog()
      await waitFor(() => {
        expect(screen.getByLabelText(/API URL/i)).toBeTruthy()
        expect(screen.getByLabelText(/Timeout/i)).toBeTruthy()
        expect(screen.getByLabelText(/Enable Debug Mode/i)).toBeTruthy()
        expect(screen.getByLabelText(/Log Level/i)).toBeTruthy()
      })
    })

    it('shows an error message when the fetch fails', async () => {
      ;(appService.getAppSettings as Mock).mockRejectedValue(new Error('Network error'))
      renderDialog()
      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeTruthy()
        expect(screen.getByText('Network error')).toBeTruthy()
      })
    })

    it('shows empty state message when no settings are returned', async () => {
      ;(appService.getAppSettings as Mock).mockResolvedValue({
        appId: 'splunk-enterprise',
        settings: [],
      })
      renderDialog()
      await waitFor(() => {
        expect(
          screen.getByText('No configurable settings available for this app.'),
        ).toBeTruthy()
      })
    })
  })

  // -------------------------------------------------------------------------
  // Field rendering
  // -------------------------------------------------------------------------

  describe('field rendering', () => {
    it('pre-populates string input with the current value', async () => {
      setupSuccessMock()
      renderDialog()
      await waitFor(() => {
        const input = screen.getByLabelText(/API URL/i) as HTMLInputElement
        expect(input.value).toBe('https://api.example.com')
      })
    })

    it('pre-populates number input with the current value', async () => {
      setupSuccessMock()
      renderDialog()
      await waitFor(() => {
        const input = screen.getByLabelText(/Timeout/i) as HTMLInputElement
        expect(input.value).toBe('3000')
      })
    })

    it('renders a toggle switch for boolean fields', async () => {
      setupSuccessMock()
      renderDialog()
      await waitFor(() => {
        const toggle = screen.getByRole('switch', { name: /Enable Debug Mode/i })
        expect(toggle).toBeTruthy()
        expect(toggle.getAttribute('aria-checked')).toBe('false')
      })
    })

    it('renders a select dropdown for select-type fields', async () => {
      setupSuccessMock()
      renderDialog()
      await waitFor(() => {
        const select = screen.getByLabelText(/Log Level/i) as HTMLSelectElement
        expect(select.tagName).toBe('SELECT')
        expect(select.value).toBe('info')
      })
    })

    it('renders helper/description text for fields that have one', async () => {
      setupSuccessMock()
      renderDialog()
      await waitFor(() => {
        expect(screen.getByText('The base URL for API requests')).toBeTruthy()
      })
    })

    it('marks required fields as required', async () => {
      setupSuccessMock()
      renderDialog()
      await waitFor(() => {
        // String/select fields delegate labels to the shared Input/Select,
        // which express requiredness via the native `required` attribute
        // rather than an asterisk span.
        expect(screen.getByLabelText(/API URL/i)).toBeRequired()
        expect(screen.getByLabelText(/Timeout/i)).not.toBeRequired()
      })
    })

    it('renders all select options including a placeholder', async () => {
      setupSuccessMock()
      renderDialog()
      await waitFor(() => {
        const select = screen.getByLabelText(/Log Level/i)
        const options = within(select as HTMLElement).queryAllByRole('option')
        // placeholder + 4 real options
        expect(options.length).toBe(5)
        expect(options.map((o) => (o as HTMLOptionElement).value)).toContain('debug')
        expect(options.map((o) => (o as HTMLOptionElement).value)).toContain('error')
      })
    })
  })

  // -------------------------------------------------------------------------
  // Interaction
  // -------------------------------------------------------------------------

  describe('field interaction', () => {
    it('updates a text input when the user types', async () => {
      setupSuccessMock()
      const user = userEvent.setup()
      renderDialog()

      await waitFor(() => expect(screen.getByLabelText(/API URL/i)).toBeTruthy())

      const input = screen.getByLabelText(/API URL/i) as HTMLInputElement
      await user.clear(input)
      await user.type(input, 'https://new.api.com')
      expect(input.value).toBe('https://new.api.com')
    })

    it('toggles the boolean switch when clicked', async () => {
      setupSuccessMock()
      const user = userEvent.setup()
      renderDialog()

      await waitFor(() => expect(screen.getByRole('switch')).toBeTruthy())

      const toggle = screen.getByRole('switch')
      expect(toggle.getAttribute('aria-checked')).toBe('false')
      await user.click(toggle)
      expect(toggle.getAttribute('aria-checked')).toBe('true')
    })

    it('updates a select field when a new option is chosen', async () => {
      setupSuccessMock()
      const user = userEvent.setup()
      renderDialog()

      await waitFor(() => expect(screen.getByLabelText(/Log Level/i)).toBeTruthy())

      const select = screen.getByLabelText(/Log Level/i) as HTMLSelectElement
      await user.selectOptions(select, 'error')
      expect(select.value).toBe('error')
    })
  })

  // -------------------------------------------------------------------------
  // Saving
  // -------------------------------------------------------------------------

  describe('saving', () => {
    it('calls updateAppSettings with the correct payload on save', async () => {
      setupSuccessMock()
      const user = userEvent.setup()
      renderDialog()

      await waitFor(() => expect(screen.getByLabelText(/API URL/i)).toBeTruthy())

      await user.click(screen.getByRole('button', { name: /Save Settings/i }))

      await waitFor(() => {
        expect(appService.updateAppSettings).toHaveBeenCalledWith(
          'splunk-enterprise',
          expect.objectContaining({
            api_url: 'https://api.example.com',
            timeout: 3000,
            enable_debug: false,
            log_level: 'info',
          }),
        )
      })
    })

    it('shows a success toast and calls onSaved / onClose after save', async () => {
      setupSuccessMock()
      const onSaved = vi.fn()
      const onClose = vi.fn()
      const user = userEvent.setup()
      renderDialog({ onSaved, onClose })

      await waitFor(() => expect(screen.getByLabelText(/API URL/i)).toBeTruthy())

      await user.click(screen.getByRole('button', { name: /Save Settings/i }))

      await waitFor(() => {
        expect(mockToastSuccess).toHaveBeenCalledWith(
          expect.stringContaining('Splunk Enterprise'),
        )
        expect(onSaved).toHaveBeenCalled()
        expect(onClose).toHaveBeenCalled()
      })
    })

    it('shows an inline save error and a toast on API failure', async () => {
      ;(appService.getAppSettings as Mock).mockResolvedValue({
        appId: 'splunk-enterprise',
        settings: mockSettings,
      })
      ;(appService.updateAppSettings as Mock).mockRejectedValue(
        new Error('Save failed'),
      )
      const user = userEvent.setup()
      renderDialog()

      await waitFor(() => expect(screen.getByLabelText(/API URL/i)).toBeTruthy())

      await user.click(screen.getByRole('button', { name: /Save Settings/i }))

      await waitFor(() => {
        expect(screen.getByText('Save failed')).toBeTruthy()
        expect(mockToastError).toHaveBeenCalledWith('Save failed')
      })
    })

    it('blocks saving when a required field is empty', async () => {
      ;(appService.getAppSettings as Mock).mockResolvedValue({
        appId: 'splunk-enterprise',
        settings: [
          {
            key: 'api_url',
            type: 'string',
            label: 'API URL',
            required: true,
            value: '',
            description: undefined,
            options: undefined,
            default: undefined,
          },
        ],
      })
      const user = userEvent.setup()
      renderDialog()

      await waitFor(() => expect(screen.getByLabelText(/API URL/i)).toBeTruthy())

      await user.click(screen.getByRole('button', { name: /Save Settings/i }))

      await waitFor(() => {
        // getByText(/API URL/) would also match the field label — scope the
        // message assertion to the alert itself.
        expect(screen.getByRole('alert')).toHaveTextContent(
          /required fields: API URL/i,
        )
        expect(appService.updateAppSettings).not.toHaveBeenCalled()
      })
    })

    it('disables the Save button while the fetch is in progress', () => {
      ;(appService.getAppSettings as Mock).mockReturnValue(new Promise(() => {}))
      renderDialog()
      const saveBtn = screen.getByRole('button', { name: /Save Settings/i })
      expect(saveBtn).toBeDisabled()
    })

    it('disables the Save button when there is a fetch error', async () => {
      ;(appService.getAppSettings as Mock).mockRejectedValue(new Error('oops'))
      renderDialog()
      await waitFor(() => expect(screen.getByText('oops')).toBeTruthy())
      const saveBtn = screen.getByRole('button', { name: /Save Settings/i })
      expect(saveBtn).toBeDisabled()
    })
  })

  // -------------------------------------------------------------------------
  // Close behaviour
  // -------------------------------------------------------------------------

  describe('close behaviour', () => {
    it('calls onClose when the X button is clicked', async () => {
      setupSuccessMock()
      const onClose = vi.fn()
      const user = userEvent.setup()
      renderDialog({ onClose })

      await user.click(screen.getByRole('button', { name: /Close dialog/i }))
      expect(onClose).toHaveBeenCalled()
    })

    it('calls onClose when the Cancel button is clicked', async () => {
      setupSuccessMock()
      const onClose = vi.fn()
      const user = userEvent.setup()
      renderDialog({ onClose })

      await user.click(screen.getByRole('button', { name: /Cancel/i }))
      expect(onClose).toHaveBeenCalled()
    })

    it('calls onClose when the Escape key is pressed', async () => {
      setupSuccessMock()
      const onClose = vi.fn()
      const user = userEvent.setup()
      renderDialog({ onClose })

      await user.keyboard('{Escape}')
      expect(onClose).toHaveBeenCalled()
    })

    it('calls onClose when clicking the backdrop', async () => {
      setupSuccessMock()
      const onClose = vi.fn()
      const user = userEvent.setup()
      renderDialog({ onClose })

      // The backdrop is the outermost dialog element
      const backdrop = screen.getByRole('dialog')
      await user.click(backdrop)
      expect(onClose).toHaveBeenCalled()
    })

    it('does not close when a save is in progress', async () => {
      ;(appService.getAppSettings as Mock).mockResolvedValue({
        appId: 'splunk-enterprise',
        settings: mockSettings,
      })
      // updateAppSettings never resolves — simulates in-flight request
      ;(appService.updateAppSettings as Mock).mockReturnValue(new Promise(() => {}))

      const onClose = vi.fn()
      const user = userEvent.setup()
      renderDialog({ onClose })

      await waitFor(() => expect(screen.getByLabelText(/API URL/i)).toBeTruthy())

      // Trigger save (non-blocking click)
      await user.click(screen.getByRole('button', { name: /Save Settings/i }))

      // Now try to close via X
      const closeBtn = screen.getByRole('button', { name: /Close dialog/i })
      // Button should be disabled while saving
      expect(closeBtn).toBeDisabled()
    })
  })

  // -------------------------------------------------------------------------
  // Re-fetch when appId changes while open
  // -------------------------------------------------------------------------

  describe('reset on appId change', () => {
    it('re-fetches settings when appId changes while dialog remains open', async () => {
      setupSuccessMock()
      const { rerender } = renderDialog({ appId: 'app-one' })

      await waitFor(() => {
        expect(appService.getAppSettings).toHaveBeenCalledWith('app-one')
      })

      rerender(
        <AppSettingsDialog
          {...defaultProps}
          appId="app-two"
          open
        />,
      )

      await waitFor(() => {
        expect(appService.getAppSettings).toHaveBeenCalledWith('app-two')
      })
    })
  })
})
