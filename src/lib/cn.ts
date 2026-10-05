/**
 * Склейка классов без внешних зависимостей: ложные значения отбрасываются.
 * Конфликты Tailwind не разрешаются — компоненты сами не передают взаимоисключающие классы,
 * а внешний `className` дописывается последним и может только добавлять.
 */
export function cn(...values: Array<string | false | null | undefined | 0>): string {
  return values.filter(Boolean).join(' ');
}
