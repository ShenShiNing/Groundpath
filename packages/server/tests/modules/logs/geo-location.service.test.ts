import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getGeoLocation } from '@modules/logs/services/geo-location.service';

describe('geo-location.service', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('normalizes ipv4-mapped addresses and prefers the https provider', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        country: 'United States',
        country_code: 'US',
        region: 'California',
        city: 'Mountain View',
        timezone: { id: 'America/Los_Angeles' },
        connection: { isp: 'Google LLC' },
      }),
    });

    const result = await getGeoLocation('::ffff:8.8.8.8');

    expect(fetchMock).toHaveBeenCalledWith('https://ipwho.is/8.8.8.8', expect.any(Object));
    expect(result).toEqual({
      country: 'US',
      countryName: 'United States',
      region: 'California',
      city: 'Mountain View',
      timezone: 'America/Los_Angeles',
      isp: 'Google LLC',
    });
  });

  it('falls back to ip-api when the primary provider does not return a usable result', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'success',
          country: 'United States',
          countryCode: 'US',
          regionName: 'Virginia',
          city: 'Ashburn',
          timezone: 'America/New_York',
          isp: 'Cloudflare',
        }),
      });

    const result = await getGeoLocation('1.1.1.1');

    expect(fetchMock).toHaveBeenNthCalledWith(1, 'https://ipwho.is/1.1.1.1', expect.any(Object));
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://ip-api.com/json/1.1.1.1?fields=status,message,country,countryCode,regionName,city,timezone,isp',
      expect.any(Object)
    );
    expect(result).toEqual({
      country: 'US',
      countryName: 'United States',
      region: 'Virginia',
      city: 'Ashburn',
      timezone: 'America/New_York',
      isp: 'Cloudflare',
    });
  });

  it('skips private proxy addresses before performing any remote lookup', async () => {
    const result = await getGeoLocation('::ffff:10.0.0.5');

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toEqual({
      country: null,
      countryName: null,
      region: null,
      city: null,
      timezone: null,
      isp: null,
    });
  });
});
