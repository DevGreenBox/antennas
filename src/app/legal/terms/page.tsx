import type { Metadata } from 'next';

import { LegalPage } from '@/components/content/LegalPage';
import { LEGAL_DOCUMENTS } from '@/components/content/legal-documents';
import { pageMetadata } from '@/lib/seo';

/**
 * Пользовательское соглашение — структура документа (DESIGN §2.19). noindex, пока `site.legal.ready = false`:
 * `pageMetadata` берёт это из `isNoindexPath()`.
 */

const doc = LEGAL_DOCUMENTS.terms;

export const metadata: Metadata = pageMetadata({
  title: doc.title,
  description: doc.description,
  path: doc.href,
});

export default function Page() {
  return <LegalPage documentId="terms" />;
}
