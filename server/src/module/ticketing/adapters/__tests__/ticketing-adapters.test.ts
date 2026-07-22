// Unit tests for the ticketing provider abstraction. Network-free: they exercise
// the registry, auth-header construction, URL normalization, config validation,
// and provider metadata — the pure logic. Live API calls (createTicket/getTicket/
// search) are covered by integration tests behind a fixture/mock server (see
// _ai_tasks/ticketing-integration/plan.md, task 8).

import { getTicketProvider, TICKETING_PROVIDERS } from '../index'
import { authorizationHeader, normalizeInstanceUrl, TicketAuth } from '../types'
import { ServiceNowAdapter } from '../servicenow.adapter'
import { ZendeskAdapter } from '../zendesk.adapter'

describe('ticketing adapter registry', () => {
  it('returns the ServiceNow adapter', () => {
    expect(getTicketProvider('servicenow')).toBeInstanceOf(ServiceNowAdapter)
  })

  it('returns the Zendesk adapter', () => {
    expect(getTicketProvider('zendesk')).toBeInstanceOf(ZendeskAdapter)
  })

  it('throws on an unknown provider', () => {
    expect(() => getTicketProvider('jira')).toThrow(/Unknown ticketing provider/)
  })

  it('registers every declared provider', () => {
    for (const id of TICKETING_PROVIDERS) {
      expect(getTicketProvider(id).provider).toBe(id)
    }
  })
})

describe('authorizationHeader', () => {
  it('builds Basic auth for user/password', () => {
    const auth: TicketAuth = { kind: 'basic', username: 'svc', password: 'pw' }
    expect(authorizationHeader(auth)).toBe(`Basic ${Buffer.from('svc:pw').toString('base64')}`)
  })

  it('builds Zendesk email/token Basic auth', () => {
    const auth: TicketAuth = { kind: 'apiToken', email: 'a@b.com', apiToken: 'tok' }
    expect(authorizationHeader(auth)).toBe(`Basic ${Buffer.from('a@b.com/token:tok').toString('base64')}`)
  })

  it('builds Bearer auth for OAuth2', () => {
    expect(authorizationHeader({ kind: 'bearer', token: 'xyz' })).toBe('Bearer xyz')
  })
})

describe('normalizeInstanceUrl', () => {
  it('trims trailing slashes and whitespace', () => {
    expect(normalizeInstanceUrl('  https://acme.service-now.com/// ')).toBe('https://acme.service-now.com')
  })
})

describe('ServiceNowAdapter', () => {
  const adapter = new ServiceNowAdapter()

  it('supports change/incident/problem/task', () => {
    expect(adapter.supportedTicketTypes()).toEqual(['change', 'incident', 'problem', 'task'])
  })

  it('marks password + oauth tokens sensitive', () => {
    expect(adapter.getSensitiveFields()).toEqual(expect.arrayContaining(['password', 'accessToken']))
  })

  it('accepts a known defaultTable and rejects an unknown one', () => {
    expect(adapter.validateConfig({ defaultTable: 'incident' }).valid).toBe(true)
    const bad = adapter.validateConfig({ defaultTable: 'not_a_table' })
    expect(bad.valid).toBe(false)
    expect(bad.errors[0]).toMatch(/not a known table/)
  })

  describe('getTicket', () => {
    const ctx = {
      instanceUrl: 'https://acme.service-now.com',
      auth: { kind: 'basic', username: 'svc', password: 'pw' } as TicketAuth,
      config: {}, // no defaultTable -> would default to change_request
    }

    const jsonResponse = (body: unknown, status = 200): Response =>
      ({ ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response)

    afterEach(() => {
      jest.restoreAllMocks()
    })

    it('looks a human number up by `number=` in the prefix-implied table (INC -> incident)', async () => {
      const fetchMock = jest
        .spyOn(global, 'fetch')
        .mockResolvedValue(
          jsonResponse({ result: [{ sys_id: 'abc123', number: 'INC0010001', short_description: 'Veltrix', state: '1' }] }),
        )

      const ticket = await adapter.getTicket(ctx, 'INC0010001')

      expect(ticket).not.toBeNull()
      expect(ticket?.externalId).toBe('abc123')
      expect(ticket?.externalKey).toBe('INC0010001')
      // First (and only needed) call: the incident table, queried by number — NOT
      // the /{table}/{sys_id} GET that a raw number can never satisfy.
      const firstUrl = String(fetchMock.mock.calls[0][0])
      expect(firstUrl).toContain('/api/now/table/incident?')
      expect(decodeURIComponent(firstUrl)).toContain('number=INC0010001')
    })

    it('looks a sys_id up directly via /{table}/{sys_id}', async () => {
      const sysId = 'a'.repeat(32)
      const fetchMock = jest
        .spyOn(global, 'fetch')
        .mockResolvedValue(jsonResponse({ result: { sys_id: sysId, number: 'CHG0030001' } }))

      const ticket = await adapter.getTicket(ctx, sysId)

      expect(ticket?.externalId).toBe(sysId)
      expect(String(fetchMock.mock.calls[0][0])).toContain(`/change_request/${sysId}`)
    })

    it('falls back across tables and returns null when nothing matches', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValue(jsonResponse({ result: [] }))
      const ticket = await adapter.getTicket(ctx, 'INC9999999')
      expect(ticket).toBeNull()
    })
  })

  describe('addComment / updateStatus targeting', () => {
    const ctx = {
      instanceUrl: 'https://acme.service-now.com',
      auth: { kind: 'basic', username: 'svc', password: 'pw' } as TicketAuth,
      config: {}, // default table is change_request
    }
    const ok = (): Response => ({ ok: true, status: 200, json: async () => ({}) } as unknown as Response)

    afterEach(() => jest.restoreAllMocks())

    it('PATCHes the incident table when the ticket type is incident, not the default', async () => {
      const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(ok())
      await adapter.addComment(ctx, 'sysid123', 'note', 'incident')
      const url = String(fetchMock.mock.calls[0][0])
      expect(url).toContain('/api/now/table/incident/sysid123')
      expect(url).not.toContain('change_request')
    })

    it('updateStatus forwards the ticket type so an incident outcome lands on the incident', async () => {
      const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(ok())
      await adapter.updateStatus(ctx, 'sysid123', { outcome: 'deploy_succeeded' }, 'incident')
      expect(String(fetchMock.mock.calls[0][0])).toContain('/api/now/table/incident/sysid123')
    })

    it('falls back to the default table when no ticket type is stored (legacy links)', async () => {
      const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(ok())
      await adapter.addComment(ctx, 'sysid123', 'note')
      expect(String(fetchMock.mock.calls[0][0])).toContain('/api/now/table/change_request/sysid123')
    })

    it('updateStatus only work-notes — a successful deploy never changes state', async () => {
      const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(ok())
      await adapter.updateStatus(ctx, 'sysid123', { outcome: 'deploy_succeeded' }, 'incident')
      const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body))
      expect(body.work_notes).toBeTruthy()
      expect(body.state).toBeUndefined() // no state transition on deploy
    })

    it('closeTicket sets the closed state + close fields on the ticket table', async () => {
      const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(ok())
      const res = await adapter.closeTicket(ctx, 'sysid123', 'incident')
      expect(String(fetchMock.mock.calls[0][0])).toContain('/api/now/table/incident/sysid123')
      const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body))
      expect(body.state).toBe('7') // Closed
      expect(body.close_code).toBe('Solved (Permanently)')
      expect(body.close_notes).toBeTruthy()
      expect(res.status).toBe('Closed')
    })
  })
})

describe('ZendeskAdapter status transitions', () => {
  const adapter = new ZendeskAdapter()
  const ctx = {
    instanceUrl: 'https://acme.zendesk.com',
    auth: { kind: 'apiToken', email: 'a@b.c', apiToken: 't' } as TicketAuth,
    config: {},
  }
  const ok = (): Response => ({ ok: true, status: 200, json: async () => ({}) } as unknown as Response)
  afterEach(() => jest.restoreAllMocks())

  it('updateStatus records a private note but does NOT solve on deploy success', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(ok())
    await adapter.updateStatus(ctx, '42', { outcome: 'deploy_succeeded' })
    const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body))
    expect(body.ticket.status).toBeUndefined() // deploy no longer auto-closes
    expect(body.ticket.comment).toBeTruthy()
  })

  it('closeTicket solves the ticket on explicit close', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(ok())
    const res = await adapter.closeTicket(ctx, '42')
    const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body))
    expect(body.ticket.status).toBe('solved')
    expect(res.status).toBe('solved')
  })
})

describe('ZendeskAdapter', () => {
  const adapter = new ZendeskAdapter()

  it('marks apiToken sensitive', () => {
    expect(adapter.getSensitiveFields()).toEqual(expect.arrayContaining(['apiToken']))
  })

  it('validates the optional email type', () => {
    expect(adapter.validateConfig({ email: 'ops@acme.com' }).valid).toBe(true)
    expect(adapter.validateConfig({ email: 123 as unknown as string }).valid).toBe(false)
  })
})
