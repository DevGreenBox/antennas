import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

import { DemoBanner } from '@/components/layout/DemoBanner';
import { Footer } from '@/components/layout/Footer';
import { Header } from '@/components/layout/Header';
import { SkipLink } from '@/components/layout/SkipLink';
import { StoreRuntime } from '@/components/layout/StoreRuntime';
import { ToastRegion } from '@/components/ui/Toast';
import { site, siteTitle } from '@/config/site';
import { OG_IMAGE, SITE_URL, robotsFor } from '@/lib/seo';

import { plexMono, plexSans } from './fonts';
import './globals.css';

/**
 * Общий каркас (DESIGN §2.1): SkipLink → DemoBanner → Header → main#content → Footer → Toast.
 * Индекс подсказок поиска в разметку не встраивается — поле шапки грузит его с
 * `/api/search-index` (SearchCombobox).
 * Метаданные по умолчанию (§8): шаблон title, описание, Open Graph; пока
 * `site.seo.allowIndexing = false`, весь макет закрыт от индексации (страницы задают свои
 * метаданные через `pageMetadata()` из `@/lib/seo`, который этот запрет сохраняет).
 */
export const metadata: Metadata = {
  // NEXT_PUBLIC_SITE_URL → домены Vercel → localhost (src/config/site-url.ts, .env.example).
  metadataBase: new URL(SITE_URL),
  title: { default: siteTitle(), template: `%s — ${siteTitle()}` },
  description: site.description,
  robots: robotsFor('index'),
  openGraph: {
    type: 'website',
    locale: site.ogLocale,
    siteName: siteTitle(),
    title: siteTitle(),
    description: site.description,
    images: [{ url: OG_IMAGE, width: 512, height: 512, alt: siteTitle() }],
  },
  formatDetection: { telephone: false, email: false, address: false },
};

export const viewport: Viewport = {
  colorScheme: 'light',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang={site.lang} className={`${plexSans.variable} ${plexMono.variable}`}>
      <body className="flex min-h-dvh flex-col">
        <SkipLink />
        <DemoBanner />
        <Header />
        <main
          id="content"
          tabIndex={-1}
          className="page-container flex-1 pt-6 pb-16 outline-none lg:pt-8 lg:pb-24"
        >
          {children}
        </main>
        <Footer />
        <ToastRegion />
        <StoreRuntime />
      </body>
    </html>
  );
}
