import Link from 'next/link';

import { LogoMark } from '@/components/brand/LogoMark';
import { site, siteTitle } from '@/config/site';
import { getCategoryTree } from '@/lib/repository';

/**
 * Подвал (DESIGN §5.9.2): знак и дескриптор, демо-пометка, Telegram; колонки «Каталог»,
 * «Покупателям», «Документы» (+ «Служебное» при `site.demo.showServiceLinks`). Без «©» и
 * юрлица — не подтверждены. Нижняя полоса: пометка о валюте и о реквизитах.
 */
export async function Footer() {
  const tree = await getCategoryTree();
  const catalogLinks = tree.map((node) => ({ href: node.href, label: node.name }));
  return (
    // Отступ над подвалом даёт нижний padding main (pb-16 / lg:pb-24): mt-16/24 из §5.9.2 вместе
    // с ним давал бы двойной разрыв 128–192 px.
    <footer data-print="hidden" className="border-t border-line bg-surface-subtle">
      <div className="page-container grid gap-8 py-10 sm:grid-cols-2 lg:grid-cols-footer lg:py-12">
        <div className="flex flex-col items-start gap-3">
          <Link
            href="/"
            aria-label={`${siteTitle()} — на главную`}
            className="flex items-center gap-2.5 rounded-sm"
          >
            <LogoMark size={28} />
            <span className="text-small font-medium text-ink">
              {site.brandName ?? site.descriptor}
            </span>
          </Link>
          {site.demo.enabled ? (
            <p className="text-caption text-ink-muted">Демонстрационная версия витрины.</p>
          ) : null}
          <a
            href={site.contacts.telegram.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-link text-small"
          >
            Telegram {site.contacts.telegram.handle}
            <span className="sr-only"> (откроется в новой вкладке)</span>
          </a>
        </div>
        <FooterColumn id="footer-catalog" title="Каталог" links={catalogLinks} />
        <FooterColumn id="footer-customer" title="Покупателям" links={site.nav.customer} />
        <div className="flex flex-col gap-6">
          <FooterColumn id="footer-legal" title="Документы" links={site.nav.legal} />
          {/* Служебные ссылки — только по флагу site.demo.showServiceLinks (макет: включён,
              DESIGN §2.20). Перед публичным запуском выключить. */}
          {site.demo.showServiceLinks ? (
            <FooterColumn id="footer-internal" title="Служебное" links={site.nav.internal} />
          ) : null}
        </div>
      </div>
      <div className="border-t border-line-subtle">
        <div className="page-container flex flex-col gap-2 py-4 text-caption text-ink-muted sm:flex-row sm:justify-between">
          <p>{site.currency.shortNote}</p>
          <p>{site.legal.requisitesNote}</p>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({
  id,
  title,
  links,
}: {
  id: string;
  title: string;
  links: readonly { href: string; label: string }[];
}) {
  return (
    <nav aria-labelledby={id}>
      <h2 id={id} className="mb-3 text-small font-semibold text-ink">
        {title}
      </h2>
      <ul>
        {links.map((link) => (
          <li key={link.href} className="py-1">
            <Link
              href={link.href}
              className="text-small text-ink-secondary hover:text-ink hover:underline"
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
