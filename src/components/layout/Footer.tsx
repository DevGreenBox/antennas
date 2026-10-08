import Link from 'next/link';

import { LogoMark } from '@/components/brand/LogoMark';
import { ButtonLink } from '@/components/ui/Button';
import { site, siteTitle } from '@/config/site';
import { getCategoryTree } from '@/lib/repository';

/**
 * Подвал (DESIGN § R.5) — функциональный, без декора: знак и дескриптор, Telegram (единственный
 * подтверждённый канал связи); колонки «Каталог», «Покупателям», «Документы». Без «©» и юрлица —
 * не подтверждены. Нижняя строка: пометки о валюте и реквизитах; служебные ссылки — только при
 * `site.demo.showServiceLinks` (перед публичным запуском выключить).
 */
export async function Footer() {
  const tree = await getCategoryTree();
  const catalogLinks = tree.map((node) => ({ href: node.href, label: node.name }));
  return (
    // Отступ над подвалом даёт нижний padding main.
    <footer data-print="hidden" className="border-t border-line bg-surface">
      <div className="page-container grid gap-x-8 gap-y-10 py-12 sm:grid-cols-2 lg:grid-cols-footer lg:py-16">
        <div className="flex flex-col items-start gap-4">
          <Link
            href="/"
            aria-label={`${siteTitle()} — на главную`}
            className="flex items-center gap-2.5 rounded-sm"
          >
            <LogoMark size={28} />
            <span className="text-small font-semibold text-ink">
              {site.brandName ?? site.descriptor}
            </span>
          </Link>
          <p className="max-w-[18rem] text-small text-ink-secondary">
            Вопросы по характеристикам и совместимости — в Telegram.
          </p>
          <ButtonLink
            href={site.contacts.telegram.url}
            external
            variant="secondary"
            size="sm"
            icon="send"
          >
            Telegram {site.contacts.telegram.handle}
          </ButtonLink>
        </div>
        <FooterColumn id="footer-catalog" title="Каталог" links={catalogLinks} />
        <FooterColumn id="footer-customer" title="Покупателям" links={site.nav.customer} />
        <FooterColumn id="footer-legal" title="Документы" links={site.nav.legal} />
      </div>
      <div className="border-t border-line-subtle">
        <div className="page-container flex flex-col gap-x-8 gap-y-3 py-5 text-caption text-ink-muted md:flex-row md:items-center md:justify-between">
          <p className="flex flex-wrap gap-x-4 gap-y-1">
            <span>{site.currency.shortNote}</span>
            <span>{site.legal.requisitesNote}</span>
          </p>
          {/* Служебные ссылки — только по флагу site.demo.showServiceLinks (макет: включён). */}
          {site.demo.showServiceLinks ? (
            <nav aria-label="Служебное" className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className="eyebrow">Служебное</span>
              {site.nav.internal.map((link) => (
                <Link key={link.href} href={link.href} className="hover:text-ink hover:underline">
                  {link.label}
                </Link>
              ))}
            </nav>
          ) : null}
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
      <h2 id={id} className="eyebrow mb-1 lg:mb-3">
        {title}
      </h2>
      {/* < lg — строки 44 px (цели нажатия), с lg — плотный список. */}
      <ul className="flex flex-col lg:gap-2">
        {links.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              className="flex min-h-11 items-center text-small text-ink-secondary transition-colors duration-fast hover:text-ink hover:underline lg:inline lg:min-h-0"
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
