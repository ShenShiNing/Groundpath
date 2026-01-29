import type { DeviceInfo } from '@knowledge-agent/shared/types';
import { parseDeviceInfo } from '@knowledge-agent/shared/utils';

/**
 * Get current device info from browser's navigator.
 * Client-only function that uses the shared parseDeviceInfo utility.
 */
export function getDeviceInfo(): DeviceInfo {
  const ua = navigator.userAgent;
  const deviceInfo = parseDeviceInfo(ua);

  // parseDeviceInfo can return null for null input, but we always have userAgent in browser
  return deviceInfo ?? { userAgent: ua, deviceType: 'Desktop' };
}
