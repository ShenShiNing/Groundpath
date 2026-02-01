import { UAParser } from 'ua-parser-js';

export interface DeviceDetectionInfo {
  deviceType: string | null;
  browser: string | null;
  browserVersion: string | null;
  os: string | null;
  osVersion: string | null;
}

/**
 * Parse User-Agent string to extract device information
 */
export function detectDevice(userAgent: string | null): DeviceDetectionInfo {
  const emptyResult: DeviceDetectionInfo = {
    deviceType: null,
    browser: null,
    browserVersion: null,
    os: null,
    osVersion: null,
  };

  if (!userAgent) {
    return emptyResult;
  }

  try {
    const parser = new UAParser();
    parser.setUA(userAgent);
    const result = parser.getResult();

    // Determine device type
    let deviceType: string | null = null;
    if (result.device.type) {
      deviceType = result.device.type; // mobile, tablet, etc.
    } else {
      // If no device type detected, it's likely a desktop
      deviceType = 'desktop';
    }

    return {
      deviceType,
      browser: result.browser.name ?? null,
      browserVersion: result.browser.version ?? null,
      os: result.os.name ?? null,
      osVersion: result.os.version ?? null,
    };
  } catch {
    return emptyResult;
  }
}
