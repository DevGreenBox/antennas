import type { MetadataRoute } from 'next';

import { site } from '@/config/site';
import { absoluteUrl } from '@/lib/seo';

/**
 * robots.txt (DESIGN §8). Пока `site.seo.allowIndexing = false` (макет на Vercel) — `Disallow: /`
 * для всех и без ссылки на sitemap. После снятия запрета — закрыты только служебные и личные
 * разделы (`site.seo.noindexPrefixes`, юридические до готовности текстов).
 */
export default function robots(): MetadataRoute.Robots {
  if (!site.seo.allowIndexing) {
    return { rules: { userAgent: '*', disallow: '/' } };
  }
  const disallow = [...site.seo.noindexPrefixes, ...(site.legal.ready ? [] : ['/legal'])];
  return {
    rules: { userAgent: '*', allow: '/', disallow },
    sitemap: absoluteUrl('/sitemap.xml'),
  };
}
