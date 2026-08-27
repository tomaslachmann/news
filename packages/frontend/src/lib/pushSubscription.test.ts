import { describe, it, expect } from 'vitest'
import { urlBase64ToUint8Array } from './pushSubscription'

describe('urlBase64ToUint8Array', () => {
  it('decodes a base64url string with no padding needed (length % 4 === 0)', () => {
    // 'AAAA' -> base64 decodes to three zero bytes.
    expect(urlBase64ToUint8Array('AAAA')).toEqual(new Uint8Array([0, 0, 0]))
  })

  it('decodes a base64url string that needs padding restored', () => {
    // 'AA' (length 2, needs '==' padding) -> base64 decodes to one zero byte.
    expect(urlBase64ToUint8Array('AA')).toEqual(new Uint8Array([0]))
  })

  it('maps the URL-safe "-"/"_" characters back to standard base64 "+"/"/" before decoding', () => {
    // '-_' is URL-safe for '+/' -- Buffer gives us the ground truth for what that should decode to.
    const expected = new Uint8Array(Buffer.from('+/8=', 'base64'))
    expect(urlBase64ToUint8Array('-_8')).toEqual(expected)
  })

  it('round-trips a real-length VAPID-style public key without throwing', () => {
    const fakeVapidKey =
      'BCR6iorUOJPlL7LmeCuI0ZCRcNBvGFwXR4e0w-BBJ1gizFQEZjPigG4RVmxeWMHetp1aPieKZyP0HablK0X0XU4'
    const result = urlBase64ToUint8Array(fakeVapidKey)
    expect(result).toBeInstanceOf(Uint8Array)
    expect(result.length).toBe(65)
  })
})
