/**
 * Метаданные страниц по docs/DESIGN.md §8.
 *
 * Зачем помощник: Next сливает metadata сегментов ПОВЕРХНОСТНО — если страница задаёт `robots`
 * или `openGraph`, корневые значения целиком заменяются. Поэтому страница не пишет их руками,
 * а вызывает `pageMetadata()` / `robotsFor()`: пока `site.seo.allowIndexing = false`, любой вид
 * индексации превращается в `noindex, nofollow`, а Open Graph не теряет картинку и локаль.
 *
 * Пример (страница категории):
 *   export async function generateMetadata({ searchParams }) {
 *     const hasParams = Object.keys(await searchParams).length > 0;
 *     return pageMetadata({ title: category.name, description, path: category.href,
 *       robots: hasParams ? 'noindex-follow' : 'index' });
 *   }
 */

import 'server-only';

import type { Metadata } from 'next';

import { isNoindexPath, site, siteTitle } from '@/config/site';
import { resolveSiteUrl } from '@/config/site-url';

/**
 * Базовый адрес сайта без «/» в конце: `NEXT_PUBLIC_SITE_URL` → production-домен Vercel → адрес
 * деплоя Vercel → `http://localhost:3000` (правила — `src/config/site-url.ts`, переменные —
 * `.env.example`). Модуль серверный (`server-only`): системные переменные Vercel в браузер не
 * передаются. Каждая переменная читается по полному имени — так Next подставляет
 * `NEXT_PUBLIC_*` при сборке.
 */
export const SITE_URL = resolveSiteUrl({
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  VERCEL_PROJECT_PRODUCTION_URL: process.env.VERCEL_PROJECT_PRODUCTION_URL,
  VERCEL_URL: process.env.VERCEL_URL,
});

/** Картинка Open Graph — знак логотипа (DESIGN §8). */
export const OG_IMAGE = '/brand/logo-mark-512.png';

export type RobotsKind = 'index' | 'noindex' | 'noindex-follow';

/** Значение `metadata.robots` с учётом глобального запрета индексации макета. */
export function robotsFor(kind: RobotsKind): NonNullable<Metadata['robots']> {
  if (!site.seo.allowIndexing) return { index: false, follow: false };
  switch (kind) {
    case 'index':
      return { index: true, follow: true };
    case 'noindex-follow':
      return { index: false, follow: true };
    default:
      return { index: false, follow: false };
  }
}

/** Абсолютный адрес для JSON-LD, sitemap и robots: `SITE_URL` + путь. */
export function absoluteUrl(path: string): string {
  return new URL(path.replace(/^\/+/, ''), `${SITE_URL}/`).toString();
}

export interface PageMetadataInput {
  /** Заголовок страницы; к нему шаблон корня допишет « — {siteTitle()}». */
  title?: string;
  /** Заголовок без шаблона (главная). */
  absoluteTitle?: string;
  description?: string;
  /** Канонический путь без query: `/catalog/antennas`. */
  path: `/${string}`;
  /** По умолчанию: noindex для путей из `isNoindexPath()`, иначе index. */
  robots?: RobotsKind;
}

/** Полный набор metadata страницы: title, description, canonical, robots, Open Graph. */
export function pageMetadata(input: PageMetadataInput): Metadata {
  const fullTitle =
    input.absoluteTitle ?? (input.title ? `${input.title} — ${siteTitle()}` : siteTitle());
  const description = input.description ?? site.description;
  const robots = input.robots ?? (isNoindexPath(input.path) ? 'noindex' : 'index');
  return {
    title: input.absoluteTitle ? { absolute: input.absoluteTitle } : input.title,
    description,
    alternates: { canonical: input.path },
    robots: robotsFor(robots),
    openGraph: {
      type: 'website',
      locale: site.ogLocale,
      siteName: siteTitle(),
      url: input.path,
      title: fullTitle,
      description,
      images: [{ url: OG_IMAGE, width: 512, height: 512, alt: siteTitle() }],
    },
  };
}

export interface BreadcrumbJsonLdItem {
  name: string;
  /** Внутренний путь; у последнего пункта необязателен. */
  href?: string;
}

/** JSON-LD BreadcrumbList (выводится всегда полностью, §5.9.15). */
export function breadcrumbListJsonLd(items: readonly BreadcrumbJsonLdItem[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      ...(item.href ? { item: absoluteUrl(item.href) } : {}),
    })),
  };
}
