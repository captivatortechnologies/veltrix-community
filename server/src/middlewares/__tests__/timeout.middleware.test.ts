// ========================================================================
// Tests: request timeout middleware (middlewares/timeout.middleware.ts)
//
// Focus: the single-response guard. The middleware arms a setTimeout that
// answers with 408 if a handler runs long. Previously, when a slow handler
// finished JUST AFTER the timer sent its 408, it called reply.send() a second
// time and Fastify threw ERR_HTTP_HEADERS_SENT as an unhandled rejection. The
// fix makes reply.send idempotent per-request: whoever responds first wins, any
// later send is a logged no-op.
// ========================================================================

import { createTimeoutMiddleware } from '../timeout.middleware'
import { loggerService } from '../../module/logger/logger.service'

jest.mock('../../module/logger/logger.service', () => ({
  loggerService: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}))

const warn = loggerService.warn as jest.Mock

function makeReq(url = '/api/things') {
  return { url, method: 'GET', headers: {} } as any
}

function makeReply() {
  const handlers: Record<string, Array<() => void>> = {}
  const reply: any = {
    sent: false,
    statusCode: 200,
    status: jest.fn(function (c: number) {
      reply.statusCode = c
      return reply
    }),
    // The original ("raw") send. The middleware binds this before replacing
    // reply.send with its guarded wrapper, so calls through the wrapper still
    // land here exactly once per response.
    send: jest.fn(function () {
      return reply
    }),
    raw: {
      on: jest.fn((ev: string, cb: () => void) => {
        ;(handlers[ev] ||= []).push(cb)
      }),
      emit: (ev: string) => (handlers[ev] || []).forEach((cb) => cb()),
    },
  }
  return reply
}

describe('createTimeoutMiddleware — single-response guard', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => {
    jest.clearAllTimers()
    jest.useRealTimers()
    jest.clearAllMocks()
  })

  it('makes reply.send idempotent: a second send is a no-op and is logged', async () => {
    const mw = createTimeoutMiddleware()
    const reply = makeReply()
    const rawSendSpy = reply.send
    await mw(makeReq(), reply)

    reply.send({ ok: true })
    reply.send({ ok: 'again' })

    expect(rawSendSpy).toHaveBeenCalledTimes(1)
    expect(rawSendSpy).toHaveBeenCalledWith({ ok: true })
    expect(warn).toHaveBeenCalledTimes(1) // the suppressed duplicate
  })

  it('on timeout sends 408, then suppresses the late handler send without throwing', async () => {
    const mw = createTimeoutMiddleware({ default: 1000 })
    const reply = makeReply()
    const rawSendSpy = reply.send
    await mw(makeReq(), reply)

    // handler is slow -> the timer fires and answers 408
    jest.advanceTimersByTime(1001)
    expect(reply.status).toHaveBeenCalledWith(408)
    expect(rawSendSpy).toHaveBeenCalledTimes(1)

    // the slow handler now finishes and tries to respond -> must be a no-op
    expect(() => reply.send({ data: 'late' })).not.toThrow()
    expect(rawSendSpy).toHaveBeenCalledTimes(1)
    // the expected post-timeout send is NOT warned about (flagged internally)
    expect(warn).not.toHaveBeenCalled()
  })

  it('when the handler responds first, the timer does not send a 408', async () => {
    const mw = createTimeoutMiddleware({ default: 1000 })
    const reply = makeReply()
    const rawSendSpy = reply.send
    await mw(makeReq(), reply)

    reply.send({ ok: true })
    reply.raw.emit('finish') // production clears the timer on response finish
    jest.advanceTimersByTime(5000)

    expect(reply.status).not.toHaveBeenCalledWith(408)
    expect(rawSendSpy).toHaveBeenCalledTimes(1)
  })
})
