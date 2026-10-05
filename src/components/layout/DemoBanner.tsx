import { DemoBadge } from '@/components/ui/Badge';
import { Icon } from '@/components/ui/Icon';
import { site } from '@/config/site';

/**
 * Полоса «Демо» над шапкой (DESIGN §5.9.3). Не закрывается: нет сдвига вёрстки и потери
 * контекста. Не live-регион — статичный текст, но ориентир: `section` с именем «Демонстрационная
 * версия» (иначе текст вне ориентиров, axe `region`).
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
      className="border-b border-demo-line bg-demo-subtle"
    >
      <div className="page-container flex items-start gap-2 py-2 text-small text-ink">
        <DemoBadge className="shrink-0" />
        <p className="hidden pt-0.5 md:block">{text}</p>
        <details className="group min-w-0 md:hidden">
          <summary className="flex min-h-6 cursor-pointer list-none items-center gap-2 rounded-sm [&::-webkit-details-marker]:hidden">
            <span className="whitespace-nowrap">{shortText}</span>
            <span className="inline-flex items-center gap-0.5 font-medium whitespace-nowrap">
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
