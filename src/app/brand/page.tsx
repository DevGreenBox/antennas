import type { Metadata } from 'next';
import Image from 'next/image';
import type { ReactNode } from 'react';

import { LogoMark } from '@/components/brand/LogoMark';
import { LOGO_MARK_COLOR, LOGO_MARK_MONO_COLOR } from '@/components/brand/logo-geometry.generated';
import { PageHeader } from '@/components/layout/PageHeader';
import { BrandFigure } from '@/components/service/BrandFigure';
import { SERVICE_TABLE, ServiceSection } from '@/components/service/ServiceSection';
import {
  LOGO_COLOR_MEASUREMENT,
  LOGO_PARAM_ROWS,
  LOGO_SCALE_NOTE,
} from '@/components/service/logo-measurements';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/cn';
import { pageMetadata } from '@/lib/seo';

/**
 * Служебная страница «Логотип: построение» (DESIGN §2.21): знак в размерах и тонах, «до/после»,
 * схема построения с таблицей «измерено → принято», малые размеры и фавиконка, цвет и как он
 * измерен, файлы для скачивания. noindex, вне sitemap и шапки — ссылка в подвале «Служебное».
 * Числа — из docs/logo-measurements.json и параметров генератора (см. logo-measurements.ts).
 * Вид — DESIGN § R: разделы с линией сверху (`ServiceSection`), образцы знака — в одной белой
 * панели с внутренними разделителями вместо отдельных карточек, таблица — тонкие линии строк.
 */

export const metadata: Metadata = pageMetadata({
  title: 'Логотип: построение',
  description:
    'Служебная страница: перестроенный знак от одного центра, сравнение с исходником, схема ' +
    'построения, параметры и цвет.',
  path: '/brand',
  robots: 'noindex',
});

/** Размеры полного знака в ряду (DESIGN §2.21 п.1); меньше 20 px — упрощённый вариант. */
const MARK_SIZES = [24, 32, 48, 64, 128] as const;

const FILES: readonly { href: `/brand/${string}`; label: string; note: string }[] = [
  { href: '/brand/logo-mark.svg', label: 'logo-mark.svg', note: 'основной знак, прозрачный фон' },
  {
    href: '/brand/logo-mark-mono-dark.svg',
    label: 'logo-mark-mono-dark.svg',
    note: `однотонный ${LOGO_MARK_MONO_COLOR} — печать, однотонные поверхности`,
  },
  {
    href: '/brand/logo-mark-small.svg',
    label: 'logo-mark-small.svg',
    note: 'упрощённый вариант для размеров меньше 20 px',
  },
  { href: '/brand/logo-mark-1024.png', label: 'logo-mark-1024.png', note: 'PNG 1024 × 1024' },
  { href: '/brand/logo-mark-512.png', label: 'logo-mark-512.png', note: 'PNG 512 × 512' },
  { href: '/brand/logo-mark-256.png', label: 'logo-mark-256.png', note: 'PNG 256 × 256' },
  { href: '/brand/logo-mark-64.png', label: 'logo-mark-64.png', note: 'PNG 64 × 64' },
  { href: '/brand/logo-mark-32.png', label: 'logo-mark-32.png', note: 'PNG 32 × 32' },
  {
    href: '/brand/logo-mark-16.png',
    label: 'logo-mark-16.png',
    note: 'PNG 16 × 16, упрощённый вариант',
  },
  { href: '/brand/construction.svg', label: 'construction.svg', note: 'схема построения' },
  { href: '/brand/before-after.png', label: 'before-after.png', note: 'сравнение «до / после»' },
  { href: '/brand/favicon-sizes.png', label: 'favicon-sizes.png', note: 'малые размеры' },
];

export default function BrandPage() {
  return (
    <>
      <PageHeader
        title="Логотип: построение"
        titleAddon={<Badge tone="neutral">Служебная страница</Badge>}
        description="Знак перестроен математически: круг и все шесть дуг строятся от одного центра, торцы дуг — радиальные. Узнаваемость сохранена: тот же круг и три группы по две дуги."
      />

      <Section id="sizes" title="Знак в размерах">
        {/* Одна белая панель: ряд размеров, под ним через линию — два тона. */}
        <div className="overflow-hidden rounded-md border border-line bg-surface">
          <div className="flex flex-wrap items-end gap-x-6 gap-y-6 p-5 sm:gap-x-10 lg:p-8">
            <MarkSample caption="16 px, упрощённый">
              <Image
                src="/brand/logo-mark-small.svg"
                width={17}
                height={16}
                alt="Упрощённый знак, 16 px"
                unoptimized
              />
            </MarkSample>
            {MARK_SIZES.map((size) => (
              <MarkSample key={size} caption={`${size} px`}>
                <LogoMark size={size} title={`Знак, ${size} px`} />
              </MarkSample>
            ))}
          </div>
          <div className="grid divide-y divide-line border-t border-line sm:grid-cols-2 sm:divide-x sm:divide-y-0">
            <ToneSample
              caption={`brand — ${LOGO_MARK_COLOR}, основной`}
              mark={<LogoMark size={64} tone="brand" title="Знак в фирменном цвете" />}
            />
            <ToneSample
              caption={`mono — ${LOGO_MARK_MONO_COLOR}, печать и однотонные поверхности`}
              mark={<LogoMark size={64} tone="mono" title="Однотонный знак" />}
            />
          </div>
        </div>
      </Section>

      <Section
        id="before-after"
        title="До и после"
        description="Слева — исходник (растр из PDF), в центре — новый знак, справа — наложение нового контура на исходник. Красные кресты — центры кромок дуг исходника: они не совпадали с центром круга."
      >
        <BrandFigure
          src="/brand/before-after.png"
          width={2320}
          height={950}
          alt="Исходный знак и перестроенный: дуги на общем центре"
          sizes="(min-width: 1344px) 1280px, 100vw"
          priority
        />
      </Section>

      <Section
        id="construction"
        title="Схема построения"
        description={`Модуль u — 1 единица viewBox, 1/8 толщины дуги; тогда все радиусы целые. В исходнике 1 u = ${LOGO_SCALE_NOTE.pxPerU} px растра 4600 × 4600 (масштаб подобран по пяти радиусам методом наименьших квадратов).`}
      >
        <div className="grid gap-8 lg:grid-cols-golden xl:gap-12">
          <BrandFigure
            src="/brand/construction.svg"
            width={1500}
            height={1500}
            alt="Схема построения знака: центр C, радиусы колец, оси групп 0°, 120°, 240°, размах 72°"
            sizes="(min-width: 1024px) 40vw, 100vw"
            className="lg:self-start"
          />
          <ParamsTable />
        </div>
      </Section>

      <Section
        id="small-sizes"
        title="Малые размеры и фавиконка"
        description="При 16 px промежутки полного знака — 1,3–1,7 px: нижние группы сливаются в пятно. Для размеров меньше 20 px сделан упрощённый вариант: тот же центр, тот же круг и внутреннее кольцо, внешнее кольцо опущено. Им нарисован кадр 16 px в favicon.ico; icon.svg переключается на него сам, когда браузер рисует иконку меньше 20 px."
      >
        <div className="grid gap-8 lg:grid-cols-golden-reverse xl:gap-12">
          <BrandFigure
            src="/brand/favicon-sizes.png"
            width={1180}
            height={764}
            alt="Полный и упрощённый знак в размерах 16–48 px на светлом, сером и тёмном фоне вкладки"
            sizes="(min-width: 1024px) 60vw, 100vw"
          />
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 divide-x divide-line overflow-hidden rounded-md border border-line bg-surface">
              <figure className="flex flex-col items-center gap-3 p-5">
                <LogoMark size={64} title="Полный знак" />
                <figcaption className="text-center text-caption text-ink-muted">
                  Полный — от 20 px
                </figcaption>
              </figure>
              <figure className="flex flex-col items-center gap-3 p-5">
                <Image
                  src="/brand/logo-mark-small.svg"
                  width={67}
                  height={64}
                  alt="Упрощённый знак"
                  unoptimized
                />
                <figcaption className="text-center text-caption text-ink-muted">
                  Упрощённый — меньше 20 px
                </figcaption>
              </figure>
            </div>
            <p className="text-small text-ink-secondary">
              Упрощённый вариант строит тот же генератор, ручных правок нет. Проверка геометрии (
              <code className="font-mono text-ink">npm run logo:verify</code>) сверяет его круг и
              секторы с полным знаком.
            </p>
          </div>
        </div>
      </Section>

      <Section id="color" title="Цвет">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
          <div aria-hidden className="size-24 shrink-0 rounded-md bg-brand" />
          <div className="max-w-text text-small text-ink-secondary">
            <p className="text-body text-ink">
              <span className="font-mono font-medium">{LOGO_COLOR_MEASUREMENT.hex}</span> — измерен
              по растру исходника ({LOGO_COLOR_MEASUREMENT.sharePct} % непрозрачных пикселей).
            </p>
            <p className="mt-2">
              Контраст на белом 2,24:1 — только заливки, не текст. Текст в тоне бренда — тёмный
              оттенок того же цвета (токен <code className="font-mono text-ink">brand-text</code>
              ).
            </p>
            <h3 className="eyebrow mt-6">Как измерен</h3>
            <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-5">
              <li>
                Растр {LOGO_COLOR_MEASUREMENT.raster} извлечён из PDF без перерисовки; гистограмма
                RGB по пикселям с альфой 255.
              </li>
              <li>
                {LOGO_COLOR_MEASUREMENT.pixels} из {LOGO_COLOR_MEASUREMENT.opaquePixels} пикселей
                имеют ровно этот цвет. Следующие по частоте —{' '}
                {LOGO_COLOR_MEASUREMENT.runnersUp
                  .map((entry) => `${entry.hex} (${entry.sharePct} %)`)
                  .join(' и ')}
                : шум сжатия и сглаживания.
              </li>
              <li>Полупрозрачные краевые пиксели исключены: в PDF они смешаны с белым фоном.</li>
              <li>
                В PDF нет цветового профиля, поэтому HEX — значения RGB из файла; браузер трактует
                их как sRGB. Если найдётся брендбук или исходный PSD, цвет стоит сверить с ним.
              </li>
            </ul>
          </div>
        </div>
      </Section>

      <Section id="files" title="Файлы">
        <ul className="grid gap-x-8 border-t border-line-subtle sm:grid-cols-2 lg:grid-cols-3">
          {FILES.map((file) => (
            <li key={file.href} className="border-b border-line-subtle py-3">
              <a href={file.href} download className="text-link font-mono text-small text-ink">
                {file.label}
              </a>
              <p className="mt-0.5 text-caption text-ink-muted">{file.note}</p>
            </li>
          ))}
        </ul>
        <p className="mt-6 max-w-text text-small text-ink-secondary">
          Полное описание — <code className="font-mono text-ink">docs/LOGO.md</code> в репозитории
          (в публичной части сайта не отдаётся). Параметры знака заданы в{' '}
          <code className="font-mono text-ink">scripts/build-logo.mjs</code>; все файлы выше
          генерирует <code className="font-mono text-ink">npm run logo</code>.
        </p>
      </Section>
    </>
  );
}

/** Раздел страницы — общий `ServiceSection` служебных страниц (линия сверху, h2, описание). */
const Section = ServiceSection;

function MarkSample({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <figure className="flex flex-col items-center gap-2">
      {children}
      <figcaption className="text-caption text-ink-muted tabular-nums">{caption}</figcaption>
    </figure>
  );
}

function ToneSample({ caption, mark }: { caption: string; mark: ReactNode }) {
  return (
    <figure className="flex items-center gap-5 p-5 lg:px-8">
      {mark}
      <figcaption className="text-small text-ink-secondary">{caption}</figcaption>
    </figure>
  );
}

function ParamsTable() {
  return (
    <div className={cn('min-w-0 lg:self-start', SERVICE_TABLE.frame)}>
      <table className="w-full text-small">
        <caption className="sr-only">
          Параметры построения знака: измерено по исходнику и принято в новом знаке
        </caption>
        <thead className={SERVICE_TABLE.head}>
          <tr className={SERVICE_TABLE.headRow}>
            <th scope="col" className={SERVICE_TABLE.th}>
              Параметр
            </th>
            <th scope="col" className={SERVICE_TABLE.th}>
              Исходник, измерено
            </th>
            <th scope="col" className={SERVICE_TABLE.th}>
              Принято
            </th>
          </tr>
        </thead>
        <tbody>
          {LOGO_PARAM_ROWS.map((row) => (
            <tr key={row.label} className={SERVICE_TABLE.row}>
              <th scope="row" className="px-3 py-2.5 text-left font-normal text-ink-secondary">
                {row.label}
                {row.symbol ? (
                  <span className="ml-1.5 font-mono text-caption text-ink-muted">{row.symbol}</span>
                ) : null}
              </th>
              <td className="px-3 py-2.5 text-ink tabular-nums">{row.measured}</td>
              <td className="px-3 py-2.5 font-semibold text-ink tabular-nums">{row.chosen}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
