import { Icon } from '@/components/ui/Icon';
import { site } from '@/config/site';

/**
 * Полоса «Демо» над шапкой (DESIGN § R.5) — единственное общее сообщение о демо-режиме на
 * странице: одна строка 34 px, нейтральный фон, моноширинная метка «Демо». Не закрывается: нет
 * сдвига вёрстки и потери контекста. Не live-регион — статичный текст, но ориентир: `section` с
 * именем «Демонстрационная версия» (иначе текст вне ориентиров, axe `region`).
 *
 * ≥ md — полный текст `site.demo.siteBanner.text`. < md — одна строка: «Демо · {shortText} ·
 * Подробнее»; полный текст раскрывается в `<details>` (работает без JS). Уже 360 px слово
 * «Подробнее» остаётся только для скринридера — видна стрелка, строка не переносится.
 */
export function DemoBanner() {
  if (!site.demo.enabled || !site.demo.siteBanner.enabled) return null;
  const { text, shortText } = site.demo.siteBanner;
  return (
    <section
      aria-label="Демонстрационная версия"
      data-print="hidden"
      className="border-b border-line bg-surface-muted"
    >
      <div className="page-container flex items-start gap-3 py-2 text-caption text-ink-secondary md:text-small md:leading-[1.125rem]">
        <span className="eyebrow shrink-0 rounded-xs border border-dashed border-demo-line px-1.5 leading-4 text-ink">
          Демо
        </span>
        <p className="hidden md:block">{text}</p>
        <details className="group min-w-0 md:hidden">
          <summary className="flex cursor-pointer list-none items-center gap-2 rounded-sm [&::-webkit-details-marker]:hidden">
            <span className="whitespace-nowrap">{shortText}</span>
            <span className="inline-flex items-center gap-0.5 font-medium whitespace-nowrap text-ink">
              <span className="underline underline-offset-2 max-[359px]:sr-only">Подробнее</span>
              <Icon
                name="chevron-down"
                size={16}
                className="transition-transform duration-fast group-open:rotate-180"
              />
            </span>
          </summary>
          <p className="mt-1 pb-0.5">{text}</p>
        </details>
      </div>
    </section>
  );
}
