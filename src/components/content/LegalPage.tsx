import Link from 'next/link';

import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Notice } from '@/components/ui/Notice';
import { site } from '@/config/site';
import { cn } from '@/lib/cn';

import { ContentSection, TEXT_MEASURE } from './ContentSection';
import { LEGAL_DOCUMENTS } from './legal-documents';
import type { LegalDocumentId } from './legal-documents';

/**
 * Шаблон юридической страницы (DESIGN §2.19): крошки → h1 → Notice `warning` с
 * `site.legal.draftNote` → оглавление → разделы. Пока `site.legal.ready = false`, страница —
 * структура документа: у разделов без текста пометка «Текст готовится», реквизиты — заглушка.
 * Юридическая корректность не утверждается (antennas.md §11).
 *
 * Раскладка — DESIGN § R: на ≥ lg оглавление — липкая левая колонка ширины колонки подбора
 * каталога (`catalog` / `catalog-wide`), документ — справа строкой ~70 знаков (`TEXT_MEASURE`);
 * разделы разделены тонкими линиями, номер раздела — приглушённый. На < lg — оглавление над
 * документом, как раньше.
 */
export function LegalPage({ documentId }: { documentId: LegalDocumentId }) {
  const doc = LEGAL_DOCUMENTS[documentId];
  const others = Object.values(LEGAL_DOCUMENTS).filter((other) => other.id !== documentId);
  return (
    <article>
      <Breadcrumbs items={[{ label: 'Главная', href: '/' }, { label: doc.title }]} />
      <PageHeader title={doc.title} className="max-w-[48rem]" />

      {site.legal.ready ? null : (
        <Notice tone="warning" title="Документ готовится" className={TEXT_MEASURE}>
          {site.legal.draftNote}
        </Notice>
      )}

      <div className="mt-10 grid gap-x-16 gap-y-6 lg:mt-12 lg:grid-cols-catalog xl:grid-cols-catalog-wide">
        <nav
          aria-labelledby="legal-toc-title"
          className="lg:sticky lg:top-(--sticky-top) lg:self-start"
        >
          <h2 id="legal-toc-title" className="eyebrow">
            Разделы документа
          </h2>
          <ol className="mt-3 border-t border-line-subtle text-small">
            {doc.sections.map((section, index) => (
              <li key={section.id} className="border-b border-line-subtle">
                <a
                  href={`#${section.id}`}
                  className="group/toc flex min-h-11 items-baseline gap-3 py-3 lg:min-h-10 lg:py-2.5 text-ink-secondary transition-colors duration-fast hover:text-ink"
                >
                  <span className="w-5 shrink-0 font-mono text-caption text-ink-muted tabular-nums">
                    {index + 1}.
                  </span>
                  <span className="group-hover/toc:underline">{section.title}</span>
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className={cn('min-w-0', TEXT_MEASURE)}>
          {/* Верхняя линия — только рядом с оглавлением (≥ lg): на < lg над документом уже есть
              нижняя линия оглавления. */}
          <div className="divide-y divide-line-subtle border-b border-line-subtle lg:border-t">
            {doc.sections.map((section, index) => (
              <ContentSection
                key={section.id}
                id={section.id}
                layout="stack"
                className="py-7 lg:py-8"
                title={
                  <>
                    <span className="text-ink-muted tabular-nums">{index + 1}.</span>{' '}
                    {section.title}
                  </>
                }
                status={
                  section.content === null && !site.legal.ready ? (
                    <Badge tone="neutral">Текст готовится</Badge>
                  ) : null
                }
              >
                {section.content ?? <p className="text-ink-muted">Раздел будет заполнен.</p>}
              </ContentSection>
            ))}
          </div>

          <nav aria-labelledby="legal-other-title" className="mt-10 lg:mt-12">
            <h2 id="legal-other-title" className="eyebrow">
              Другие документы
            </h2>
            <ul className="mt-2 flex flex-col text-small lg:gap-1">
              {others.map((other) => (
                <li key={other.id}>
                  {/* < lg — цель нажатия 44 px (DESIGN § R.9). */}
                  <Link
                    href={other.href}
                    className="inline-flex min-h-11 items-center text-ink-secondary transition-colors duration-fast hover:text-ink hover:underline lg:min-h-7"
                  >
                    {other.title}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </div>
    </article>
  );
}
