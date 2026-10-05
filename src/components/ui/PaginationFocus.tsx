'use client';

import { useEffect, useRef } from 'react';

/**
 * После перехода по ссылке пагинации — прокрутка к началу выдачи и фокус на нём (DESIGN §4.1, §7).
 *
 * Только после клика по ссылке в своей навигации «Страницы»: страница меняется и без неё —
 * сортировка или подбор на странице ≥ 2 сбрасывают её на первую, «Назад» в браузере, исправление
 * `?page=99` — и тогда фокус не должен прыгать к заголовку выдачи. На первом рендере тоже ничего
 * не делает. Клик ловится делегированием на ближайшем `<nav>` (сама пагинация может рендериться
 * на сервере); клики с модификаторами (новая вкладка) не считаются.
 */
export function PaginationFocus({ page, targetId }: { page: number; targetId: string }) {
  const marker = useRef<HTMLSpanElement>(null);
  const previous = useRef(page);
  /** Пользователь нажал ссылку пагинации — ждём смены страницы. */
  const requested = useRef(false);

  useEffect(() => {
    const nav = marker.current?.closest('nav');
    if (!nav) return;
    const onClick = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }
      const link = (event.target as Element | null)?.closest('a[href]');
      if (link && nav.contains(link)) requested.current = true;
    };
    nav.addEventListener('click', onClick);
    return () => nav.removeEventListener('click', onClick);
  }, []);

  useEffect(() => {
    if (previous.current === page) return;
    previous.current = page;
    if (!requested.current) return;
    requested.current = false;
    const target = document.getElementById(targetId);
    if (target === null) return;
    target.scrollIntoView({ block: 'start' });
    target.focus({ preventScroll: true });
  }, [page, targetId]);

  return <span ref={marker} hidden />;
}
