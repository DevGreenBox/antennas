import { site } from '@/config/site';
import { PRICE_ON_REQUEST_LABEL, formatPrice, getSpecLine } from '@/lib/catalog';
import type { SpecLineItem } from '@/lib/catalog';
import { capitalize } from '@/lib/format';
import { absoluteUrl } from '@/lib/seo';
import type { Product } from '@/types/catalog';

/**
 * SEO страницы товара (DESIGN §2.6 «SEO», §8).
 */

export const productPath = (product: Pick<Product, 'slug'>) => `/product/${product.slug}` as const;

/**
 * Пункт строки параметров для описания (§4.10): в сниппете нет «*» и бейджа, поэтому статус
 * передаётся словами или пункт опускается.
 * - confirmed — как есть;
 * - inferred — с пометкой «(единица уточняется)»: единица принята по контексту, фактом её
 *   подавать нельзя;
 * - needs-review — опускается: значение спорное («6000–8000 ГГц», «N/sma-мама»).
 */
function describedSpec(item: SpecLineItem): string | null {
  if (item.status === 'confirmed') return item.text;
  if (item.status === 'inferred') return `${item.text} (единица уточняется)`;
  return null;
}

/** Пробелы (в т. ч. неразрывные из форматтеров) — к одному обычному, для сравнения текста. */
const squash = (text: string) => text.replace(/\s+/g, ' ').trim();

/**
 * «{Название}. {Ключевые характеристики через «, »}. {Цена 13 000 ₽ | Цена по запросу}. Код в
 * каталоге {code}.» Характеристики — те же пункты, что в карточке (`getSpecLine`), с учётом
 * статуса значения (`describedSpec`); пункт, который уже есть в названии буквально («МШУ
 * 50–1000 МГц, 20 дБ» → «20 дБ»), не повторяется.
 */
export function productDescription(product: Product): string {
  const name = squash(product.name);
  const specs = getSpecLine(product)
    .filter((item) => !name.includes(squash(item.text)))
    .map(describedSpec)
    .filter((text): text is string => text !== null)
    .join(', ');
  const price =
    product.priceType === 'fixed' && product.price !== null
      ? `Цена ${formatPrice(product.price)}`
      : PRICE_ON_REQUEST_LABEL;
  return [
    product.name,
    specs === '' ? null : capitalize(specs),
    price,
    `Код в каталоге ${product.code}`,
  ]
    .filter((part): part is string => part !== null)
    .map((part) => (part.endsWith('.') ? part : `${part}.`))
    .join(' ');
}

/**
 * JSON-LD Product. Сознательно без `brand`, `mpn`, `image`, `aggregateRating`, `review` — этих
 * данных нет, а выдумывать их нельзя (CLAUDE.md). `offers` — только у цены из прайса и только
 * когда валюта подтверждена: пока RUB — предположение (`site.currency.assumed`), объявлять цену в
 * рублях фактом нельзя. `availability` не выводится никогда — наличие неизвестно. «По запросу» —
 * без `offers`, никогда `price: 0`.
 */
export function productJsonLd(product: Product, categoryName: string | null) {
  const url = absoluteUrl(productPath(product));
  const offers =
    product.priceType === 'fixed' && product.price !== null && !site.currency.assumed
      ? {
          offers: {
            '@type': 'Offer',
            price: (product.price / 100).toFixed(2),
            priceCurrency: product.currency,
            url,
          },
        }
      : {};
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    sku: product.code,
    ...(categoryName ? { category: categoryName } : {}),
    url,
    ...offers,
  };
}
