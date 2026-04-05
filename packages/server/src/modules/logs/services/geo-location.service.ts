import { createLogger } from '@core/logger';
import { isPrivateIpAddress, normalizeIpAddress } from '@core/utils';
import {
  describeTextForLog,
  fingerprintIpAddress,
  summarizeErrorForLog,
} from '@core/logger/redaction';

const logger = createLogger('geo-location.service');

const GEO_LOOKUP_TIMEOUT_MS = 5000;
const EMPTY_GEO_LOCATION: GeoLocationInfo = {
  country: null,
  countryName: null,
  region: null,
  city: null,
  timezone: null,
  isp: null,
};

export interface GeoLocationInfo {
  country: string | null;
  countryName: string | null;
  region: string | null;
  city: string | null;
  timezone: string | null;
  isp: string | null;
}

interface IpApiResponse {
  status: 'success' | 'fail';
  country?: string;
  countryCode?: string;
  regionName?: string;
  city?: string;
  timezone?: string;
  isp?: string;
  message?: string;
}

interface IpWhoIsResponse {
  success?: boolean;
  country?: string;
  country_code?: string;
  region?: string;
  city?: string;
  timezone?: string | { id?: string };
  connection?: { isp?: string };
}

function hasResolvedLocation(info: GeoLocationInfo): boolean {
  return Boolean(info.country || info.countryName || info.region || info.city);
}

function mapIpWhoIsResponse(data: IpWhoIsResponse): GeoLocationInfo | null {
  if (data.success === false) {
    return null;
  }

  return {
    country: data.country_code ?? null,
    countryName: data.country ?? null,
    region: data.region ?? null,
    city: data.city ?? null,
    timezone: typeof data.timezone === 'string' ? data.timezone : (data.timezone?.id ?? null),
    isp: data.connection?.isp ?? null,
  };
}

function mapIpApiResponse(data: IpApiResponse): GeoLocationInfo | null {
  if (data.status !== 'success') {
    return null;
  }

  return {
    country: data.countryCode ?? null,
    countryName: data.country ?? null,
    region: data.regionName ?? null,
    city: data.city ?? null,
    timezone: data.timezone ?? null,
    isp: data.isp ?? null,
  };
}

async function fetchProviderGeoLocation(
  provider: 'ipwho.is' | 'ip-api',
  url: string,
  ipAddress: string
): Promise<GeoLocationInfo | null> {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(GEO_LOOKUP_TIMEOUT_MS),
    });

    if (!response.ok) {
      logger.warn(
        { ipFingerprint: fingerprintIpAddress(ipAddress), provider, status: response.status },
        'Geo-location API returned non-OK status'
      );
      return null;
    }

    const data = (await response.json()) as IpWhoIsResponse | IpApiResponse;
    const mapped =
      provider === 'ipwho.is'
        ? mapIpWhoIsResponse(data as IpWhoIsResponse)
        : mapIpApiResponse(data as IpApiResponse);

    if (!mapped || !hasResolvedLocation(mapped)) {
      logger.debug(
        {
          ipFingerprint: fingerprintIpAddress(ipAddress),
          provider,
          responseSummary: describeTextForLog(JSON.stringify(data)),
        },
        'Geo-location lookup returned no result'
      );
      return null;
    }

    return mapped;
  } catch (error) {
    logger.debug(
      {
        ipFingerprint: fingerprintIpAddress(ipAddress),
        provider,
        error: summarizeErrorForLog(error),
      },
      'Geo-location provider failed'
    );
    return null;
  }
}

/**
 * Get geo-location information for an IP address using ip-api.com
 * - Free tier: 45 requests per minute
 * - No API key required
 * - Returns null fields for private IPs or errors
 */
export async function getGeoLocation(ipAddress: string | null): Promise<GeoLocationInfo> {
  const normalizedIp = normalizeIpAddress(ipAddress);

  if (!normalizedIp) {
    return EMPTY_GEO_LOCATION;
  }

  // Skip private IPs
  if (isPrivateIpAddress(normalizedIp)) {
    logger.debug(
      { ipFingerprint: fingerprintIpAddress(normalizedIp) },
      'Skipping geo-location lookup for private IP'
    );
    return EMPTY_GEO_LOCATION;
  }

  const ipWhoIsResult = await fetchProviderGeoLocation(
    'ipwho.is',
    `https://ipwho.is/${normalizedIp}`,
    normalizedIp
  );
  if (ipWhoIsResult) {
    return ipWhoIsResult;
  }

  const ipApiResult = await fetchProviderGeoLocation(
    'ip-api',
    `http://ip-api.com/json/${normalizedIp}?fields=status,message,country,countryCode,regionName,city,timezone,isp`,
    normalizedIp
  );
  if (ipApiResult) {
    return ipApiResult;
  }

  return EMPTY_GEO_LOCATION;
}

/**
 * Async non-blocking geo-location lookup
 * Useful when you want to fire-and-forget and update later
 */
export function getGeoLocationAsync(ipAddress: string | null): Promise<GeoLocationInfo> {
  return getGeoLocation(ipAddress).catch((error) => {
    logger.debug({ error }, 'Async geo-location lookup failed');
    return EMPTY_GEO_LOCATION;
  });
}
