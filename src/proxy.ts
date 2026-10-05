import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Защита страниц товаров от адресов, которые роняют Next 16.3 в 500.
 *
 * Страница товара пререндерится (generateStaticParams) и попадает в dynamicRoutes манифеста.
 * Его матчер повторно раскодирует уже раскодированный путь: на `/product/a%25` получается
 * `decodeURIComponent('a%')` → DecodeError, которую сервер не узнаёт как свою и отвечает 500
 * вместо 404. Slug каталога — только латиница в нижнем регистре, цифры и дефис
 * (docs/DATA-RULES.md §5), поэтому любой другой slug заведомо не существует: отправляем его на
 * заведомо отсутствующий товар, и страница отвечает обычным 404 (dynamicParams = false).
 */
const SLUG = /^[a-z0-9-]+$/;
const MISSING = '/product/not-found';

export function proxy(request: NextRequest) {
  const slug = request.nextUrl.pathname.slice('/product/'.length);
  if (SLUG.test(slug) || request.nextUrl.pathname === MISSING) return NextResponse.next();
  return NextResponse.rewrite(new URL(MISSING, request.url));
}

export const config = {
  matcher: '/product/:path*',
};
