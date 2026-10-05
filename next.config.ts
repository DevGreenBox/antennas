import type { NextConfig } from 'next';

/**
 * Заголовки безопасности заданы здесь, а не в конфиге хостинга: одинаково
 * работают на `next start` и на Vercel.
 *
 * Content-Security-Policy — только `frame-ancestors 'self'` (то же, что X-Frame-Options, для
 * браузеров, которые смотрят на CSP). Полная CSP (script-src и др.) в объём макета не входит:
 * inline-скрипты Next требуют nonce, а значит динамического рендера каждой страницы
 * (node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md).
 */
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Content-Security-Policy', value: "frame-ancestors 'self'" },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Без заголовка X-Powered-By: Next.js — версия фреймворка наружу не нужна.
  poweredByHeader: false,
  // Dev-сервер Next 16 отдаёт HMR и dev-ресурсы только «своему» origin. Агенты и e2e ходят на
  // 127.0.0.1 — без этой строки страницы там не гидратируются и кнопки не работают.
  allowedDevOrigins: ['127.0.0.1'],
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
