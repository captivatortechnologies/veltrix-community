import { deviceFromUserAgent } from '../audit-event';

describe('deviceFromUserAgent', () => {
  it('returns a fallback for missing/empty user agents', () => {
    expect(deviceFromUserAgent(undefined)).toBe('Unknown device');
    expect(deviceFromUserAgent(null)).toBe('Unknown device');
    expect(deviceFromUserAgent('')).toBe('Unknown device');
  });

  it('detects Chrome on Windows', () => {
    const ua =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
    expect(deviceFromUserAgent(ua)).toBe('Chrome on Windows');
  });

  it('detects Edge before Chrome (Edge UAs also contain "Chrome")', () => {
    const ua =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36 Edg/120.0';
    expect(deviceFromUserAgent(ua)).toBe('Edge on Windows');
  });

  it('detects Safari on macOS', () => {
    const ua =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
    expect(deviceFromUserAgent(ua)).toBe('Safari on macOS');
  });

  it('detects Firefox on Linux', () => {
    const ua = 'Mozilla/5.0 (X11; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0';
    expect(deviceFromUserAgent(ua)).toBe('Firefox on Linux');
  });

  it('detects mobile platforms', () => {
    const android =
      'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36';
    expect(deviceFromUserAgent(android)).toBe('Chrome on Android');

    const iphone =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
    expect(deviceFromUserAgent(iphone)).toBe('Safari on iOS');
  });

  it('falls back gracefully for unrecognized agents', () => {
    expect(deviceFromUserAgent('SomeCustomBot/1.0')).toBe('Browser on Unknown OS');
  });
});
