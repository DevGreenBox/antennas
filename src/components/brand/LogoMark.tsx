import { useId } from 'react';

import {
  LOGO_MARK_COLOR,
  LOGO_MARK_HEIGHT,
  LOGO_MARK_MONO_COLOR,
  LOGO_MARK_PATH,
  LOGO_MARK_VIEWBOX,
  LOGO_MARK_WIDTH,
} from './logo-geometry.generated';

type LogoMarkProps = {
  /**
   * Высота знака: число — px, строка — CSS-длина ('2rem', '1em'). Ширина следует из пропорций.
   * Размер пишется атрибутами SVG, поэтому классы (h-8 и т. п.) его переопределяют.
   */
  size?: number | string;
  className?: string;
  /** Доступное имя. Без него знак считается декоративным и скрыт от скринридеров. */
  title?: string;
  /** brand — фирменный оранжевый; mono — тёмный однотонный (печать, однотонный фон). */
  tone?: 'brand' | 'mono';
};

const FILL = { brand: LOGO_MARK_COLOR, mono: LOGO_MARK_MONO_COLOR } as const;
const RATIO = LOGO_MARK_WIDTH / LOGO_MARK_HEIGHT;

/**
 * Фирменный знак: круг и три группы дуг от одного центра (геометрия — scripts/build-logo.mjs,
 * разбор — docs/LOGO.md). Серверный компонент: без состояния и обработчиков.
 * Для размеров меньше 20 px есть упрощённый вариант (public/brand/logo-mark-small.svg) —
 * в интерфейсе знак так мелко не используется, поэтому здесь его нет.
 */
export function LogoMark({ size = '1em', className, title, tone = 'brand' }: LogoMarkProps) {
  // id нужен для aria-labelledby; useId стабилен между сервером и клиентом и уникален на странице
  const titleId = useId();
  const width = typeof size === 'number' ? Math.round(size * RATIO * 100) / 100 : undefined;
  const a11y = title
    ? { role: 'img' as const, 'aria-labelledby': titleId }
    : { 'aria-hidden': true as const };

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={LOGO_MARK_VIEWBOX}
      width={width}
      height={size}
      // при строковой высоте ширину считает браузер; aspect-ratio страхует, если width — auto
      style={{ aspectRatio: `${LOGO_MARK_WIDTH} / ${LOGO_MARK_HEIGHT}` }}
      className={className}
      {...a11y}
    >
      {title ? <title id={titleId}>{title}</title> : null}
      <path fill={FILL[tone]} d={LOGO_MARK_PATH} />
    </svg>
  );
}
