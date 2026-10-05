/** «Перейти к содержимому» — первая в body, видна при фокусе (DESIGN §5.9.4). */
export function SkipLink() {
  return (
    <a
      href="#content"
      className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-skip focus:rounded-sm focus:bg-page focus:px-4 focus:py-2 focus:text-small focus:font-medium focus:text-ink focus:shadow-popover"
    >
      Перейти к содержимому
    </a>
  );
}
