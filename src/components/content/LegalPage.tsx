import Link from 'next/link';

import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Notice } from '@/components/ui/Notice';
import { site } from '@/config/site';

import { ContentSection } from './ContentSection';
import { LEGAL_DOCUMENTS } from './legal-documents';
import type { LegalDocumentId } from './legal-documents';

/**
 * Шаблон юридической страницы (DESIGN §2.19): крошки → h1 → Notice `warning` с
 * `site.legal.draftNote` → оглавление → разделы. Пока `site.legal.ready = false`, страница —
 * структура документа: у разделов без текста пометка «Текст готовится», реквизиты — заглушка.
 * Юридическая корректность не утверждается (antennas.md §11). Ширина — `max-w-text`.
 */
export function LegalPage({ documentId }: { documentId: LegalDocumentId }) {
  const doc = LEGAL_DOCUMENTS[documentId];
  const others = Object.values(LEGAL_DOCUMENTS).filter((other) => other.id !== documentId);
  return (
    <article className="max-w-text">
      <Breadcrumbs items={[{ label: 'Главная', href: '/' }, { label: doc.title }]} />
      <PageHeader title={doc.title} />

      {site.legal.ready ? null : (
        <Notice tone="warning" title="Документ готовится">
          {site.legal.draftNote}
        </Notice>
      )}

      <nav aria-labelledby="legal-toc-title" className="mt-8">
        <h2 id="legal-toc-title" className="text-small font-semibold text-ink">
          Разделы документа
        </h2>
        <ol className="mt-3 flex flex-col gap-1.5 text-body">
          {doc.sections.map((section, index) => (
            <li key={section.id} className="flex gap-2">
              <span className="w-5 shrink-0 text-ink-muted tabular-nums">{index + 1}.</span>
              <a href={`#${section.id}`} className="text-link text-ink">
                {section.title}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      {doc.sections.map((section, index) => (
        <ContentSection
          key={section.id}
          id={section.id}
          spacing="compact"
          title={`${index + 1}. ${section.title}`}
          status={
            section.content === null && !site.legal.ready ? (
              <Badge tone="neutral">Текст готовится</Badge>
            ) : null
          }
        >
          {section.content ?? <p className="text-ink-muted">Раздел будет заполнен.</p>}
        </ContentSection>
      ))}

      <nav aria-labelledby="legal-other-title" className="mt-12 border-t border-line pt-6 lg:mt-16">
        <h2 id="legal-other-title" className="text-small font-semibold text-ink">
          Другие документы
        </h2>
        <ul className="mt-3 flex flex-col gap-1.5 text-small">
          {others.map((other) => (
            <li key={other.id}>
              <Link href={other.href} className="text-ink-secondary hover:text-ink hover:underline">
                {other.title}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </article>
  );
}
