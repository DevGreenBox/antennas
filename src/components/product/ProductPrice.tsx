import { Price } from '@/components/ui/Price';
import type { Product } from '@/types/catalog';

/**
 * Цена на странице товара (DESIGN §2.6 п.6): Price `xl` и честная подпись под ней. Любая сумма до
 * согласования предварительная, «по запросу» — отдельный тип цены, а не 0 ₽.
 */
export function ProductPrice({
  product,
  className,
}: {
  product: Pick<Product, 'priceType' | 'price'>;
  className?: string;
}) {
  const fixed = product.priceType === 'fixed' && product.price !== null;
  return (
    <div className={className} data-testid="product-price">
      <Price amount={fixed ? product.price : null} size="xl" />
      <p className="mt-1 text-small text-ink-secondary">
        {fixed
          ? 'Цена из прайса. Окончательную стоимость подтвердит менеджер при согласовании.'
          : 'Стоимость уточнит менеджер после заявки.'}
      </p>
    </div>
  );
}
