import { Monitor, Smartphone, Tablet } from 'lucide-react';

interface DeviceIconProps {
  deviceType?: string;
  className?: string;
}

export function DeviceIcon({ deviceType, className = 'size-5' }: DeviceIconProps) {
  const type = deviceType?.toLowerCase();

  if (type === 'mobile') {
    return <Smartphone className={className} />;
  }
  if (type === 'tablet') {
    return <Tablet className={className} />;
  }
  return <Monitor className={className} />;
}
