import { describe, it, expect, vi, beforeEach } from 'vitest'

class FakeWebPushError extends Error {
  statusCode: number
  constructor(statusCode: number) {
    super('push failed')
    this.statusCode = statusCode
  }
}

const { mockSetVapidDetails, mockSendNotification } = vi.hoisted(() => ({
  mockSetVapidDetails: vi.fn(),
  mockSendNotification: vi.fn(),
}))

vi.mock('web-push', () => ({
  default: {
    setVapidDetails: mockSetVapidDetails,
    sendNotification: mockSendNotification,
    WebPushError: FakeWebPushError,
  },
}))

const SUBSCRIPTION = { endpoint: 'https://push.example/x', p256dh: 'p256dh-key', auth: 'auth-secret' }
const PAYLOAD = { title: 'Vlákno', body: 'Nový vývoj', url: '/thread/x' }

describe('sendThreadNotification', () => {
  beforeEach(() => {
    vi.resetModules()
    mockSetVapidDetails.mockReset()
    mockSendNotification.mockReset()
    delete process.env.VAPID_PUBLIC_KEY
    delete process.env.VAPID_PRIVATE_KEY
    delete process.env.VAPID_CONTACT_EMAIL
  })

  it('returns ok:false, expired:false without ever calling sendNotification when VAPID is unconfigured', async () => {
    const { sendThreadNotification } = await import('./webPush.js')

    const result = await sendThreadNotification(SUBSCRIPTION, PAYLOAD)

    expect(result).toEqual({ ok: false, expired: false })
    expect(mockSendNotification).not.toHaveBeenCalled()
  })

  it('configures VAPID once and sends the JSON-stringified payload when configured', async () => {
    process.env.VAPID_PUBLIC_KEY = 'pub'
    process.env.VAPID_PRIVATE_KEY = 'priv'
    process.env.VAPID_CONTACT_EMAIL = 'mailto:admin@example.com'
    mockSendNotification.mockResolvedValue({ statusCode: 201, body: '', headers: {} })
    const { sendThreadNotification } = await import('./webPush.js')

    const result = await sendThreadNotification(SUBSCRIPTION, PAYLOAD)

    expect(mockSetVapidDetails).toHaveBeenCalledWith('mailto:admin@example.com', 'pub', 'priv')
    expect(mockSendNotification).toHaveBeenCalledWith(
      { endpoint: SUBSCRIPTION.endpoint, keys: { p256dh: SUBSCRIPTION.p256dh, auth: SUBSCRIPTION.auth } },
      JSON.stringify(PAYLOAD)
    )
    expect(result).toEqual({ ok: true })
  })

  it('reports expired:true for a 404/410 WebPushError -- a confirmed-dead subscription', async () => {
    process.env.VAPID_PUBLIC_KEY = 'pub'
    process.env.VAPID_PRIVATE_KEY = 'priv'
    process.env.VAPID_CONTACT_EMAIL = 'mailto:admin@example.com'
    mockSendNotification.mockRejectedValue(new FakeWebPushError(410))
    const { sendThreadNotification } = await import('./webPush.js')

    const result = await sendThreadNotification(SUBSCRIPTION, PAYLOAD)

    expect(result).toEqual({ ok: false, expired: true })
  })

  it('reports expired:false for any other failure -- a transient blip, not a dead subscription', async () => {
    process.env.VAPID_PUBLIC_KEY = 'pub'
    process.env.VAPID_PRIVATE_KEY = 'priv'
    process.env.VAPID_CONTACT_EMAIL = 'mailto:admin@example.com'
    mockSendNotification.mockRejectedValue(new FakeWebPushError(500))
    const { sendThreadNotification } = await import('./webPush.js')

    const result = await sendThreadNotification(SUBSCRIPTION, PAYLOAD)

    expect(result).toEqual({ ok: false, expired: false })
  })
})
