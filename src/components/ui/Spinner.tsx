import { cn } from '@/lib/cn';

import { Icon } from './Icon';
import type { IconSize } from './Icon';

/** Индикатор загрузки (`loader-circle` + `animate-spin`); подпись — sr-only. */
export function Spinner({
  size = 20,
  label = 'Загрузка…',
  className,
}: {
  size?: IconSize;
  label?: string;
  className?: string;
}) {
  return (
    <span role="status" className={cn('inline-flex text-ink-muted', className)}>
      <Icon name="loader-circle" size={size} className="animate-spin" />
      <span className="sr-only">{label}</span>
    </span>
  );
}
