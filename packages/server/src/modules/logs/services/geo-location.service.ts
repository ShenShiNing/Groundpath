import { createLogger } from '@core/logger';

const logger = createLogger('geo-location.service');

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

// Private IP ranges
const PRIVATE_IP_PATTERNS = [
  /^127\./, // Loopback
  /^10\./, // Class A private
  /^172\.(1[6-9]|2[0-9]|3[01])\./, // Class B private
  /^192\.168\./, // Class C private
  /^::1$/, // IPv6 loopback
  /^fe80:/, // IPv6 link-local
  /^fc00:/, // IPv6 unique local
  /^fd/, // IPv6 unique local
];

/**
 * Check if an IP address is private/local
 */
function isPrivateIp(ip: string): boolean {
  return PRIVATE_IP_PATTERNS.some((pattern) => pattern.test(ip));
}

/**
 * Get geo-location information for an IP address using ip-api.com
 * - Free tier: 45 requests per minute
 * - No API key required
 * - Returns null fields for private IPs or errors
 */
export async function getGeoLocation(ipAddress: string | null): Promise<GeoLocationInfo> {
  const emptyResult: GeoLocationInfo = {
    country: null,
    countryName: null,
    region: null,
    city: null,
    timezone: null,
    isp: null,
  };

  if (!ipAddress) {
    return emptyResult;
  }

  // Skip private IPs
  if (isPrivateIp(ipAddress)) {
    logger.debug({ ip: ipAddress }, 'Skipping geo-location lookup for private IP');
    return emptyResult;
  }

  try {
    // ip-api.com free endpoint (HTTP only for free tier)
    const response = await fetch(
      `http://ip-api.com/json/${ipAddress}?fields=status,message,country,countryCode,regionName,city,timezone,isp`,
      {
        signal: AbortSignal.timeout(5000), // 5 second timeout
      }
    );

    if (!response.ok) {
      logger.warn(
        { ip: ipAddress, status: response.status },
        'Geo-location API returned non-OK status'
      );
      return emptyResult;
    }

    const data = (await response.json()) as IpApiResponse;

    if (data.status !== 'success') {
      logger.debug({ ip: ipAddress, message: data.message }, 'Geo-location lookup failed');
      return emptyResult;
    }

    return {
      country: data.countryCode ?? null,
      countryName: data.country ?? null,
      region: data.regionName ?? null,
      city: data.city ?? null,
      timezone: data.timezone ?? null,
      isp: data.isp ?? null,
    };
  } catch (error) {
    // Don't let geo-location errors affect the main flow
    logger.debug({ ip: ipAddress, error }, 'Failed to get geo-location');
    return emptyResult;
  }
}

/**
 * Async non-blocking geo-location lookup
 * Useful when you want to fire-and-forget and update later
 */
export function getGeoLocationAsync(ipAddress: string | null): Promise<GeoLocationInfo> {
  return getGeoLocation(ipAddress).catch((error) => {
    logger.debug({ error }, 'Async geo-location lookup failed');
    return {
      country: null,
      countryName: null,
      region: null,
      city: null,
      timezone: null,
      isp: null,
    };
  });
}
