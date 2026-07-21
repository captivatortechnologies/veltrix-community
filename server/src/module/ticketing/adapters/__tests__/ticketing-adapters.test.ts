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
