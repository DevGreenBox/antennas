import { getSearchIndex } from '@/lib/repository';

/**
 * Индекс подсказок поиска в шапке (`suggest()` в SearchCombobox, DESIGN §5.9.36).
 *
 * Отдельный адрес, а не проп из layout: раньше ~55 КБ индекса встраивались в разметку КАЖДОЙ
 * страницы, хотя подсказки нужны только тому, кто начал вводить запрос. Теперь поле грузит индекс
 * при первом фокусе или вводе, один раз за сессию вкладки.
 *
 * `force-static` — ответ собирается при сборке и раздаётся как статический файл (Next 16 без
 * Cache Components: GET-обработчики по умолчанию динамические, кэш включается конфигом сегмента).
 * Данные каталога меняются только вместе со сборкой (`npm run import:catalog` → деплой), поэтому
 * ревалидация не нужна. При переходе на Storefront API Admik здесь появится `revalidate`.
 */
export const dynamic = 'force-static';

export async function GET() {
  return Response.json(await getSearchIndex());
}
