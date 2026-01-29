import type { DeviceInfo } from '../types/auth';

/**
 * Parse browser name from user agent string
 */
function parseBrowser(ua: string): string | undefined {
  // Order matters: check Edge before Chrome (Edge contains "Chrome")
  if (ua.includes('Edg')) return 'Edge';
  if (ua.includes('Firefox')) return 'Firefox';
  if (ua.includes('Opera') || ua.includes('OPR')) return 'Opera';
  if (ua.includes('Chrome')) return 'Chrome';
  if (ua.includes('Safari')) return 'Safari';
  return undefined;
}

/**
 * Parse operating system from user agent string
 */
function parseOS(ua: string): string | undefined {
  if (ua.includes('Windows')) return 'Windows';
  if (ua.includes('Mac OS') || ua.includes('Macintosh')) return 'macOS';
  if (ua.includes('Android')) return 'Android';
  if (ua.includes('iPhone') || ua.includes('iPad')) return 'iOS';
  if (ua.includes('Linux')) return 'Linux';
  return undefined;
}

/**
 * Parse device type from user agent string
 */
function parseDeviceType(ua: string): string {
  if (/Mobi|Android.*Mobile|iPhone/.test(ua)) return 'Mobile';
  if (/iPad|Android(?!.*Mobile)|Tablet/.test(ua)) return 'Tablet';
  return 'Desktop';
}

/**
 * Parse device info from user agent string.
 * Works on both client and server.
 */
export function parseDeviceInfo(userAgent: string | null): DeviceInfo | null {
  if (!userAgent) return null;

  return {
    userAgent,
    browser: parseBrowser(userAgent),
    os: parseOS(userAgent),
    deviceType: parseDeviceType(userAgent),
  };
}
