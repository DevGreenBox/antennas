import { cn } from '@/lib/cn';

/**
 * Текст ячейки прайса буквально (DESIGN §2.20, §5.3: `font-mono`). Пробелы, которые глазом не
 * видны, — в начале и в конце ячейки, двойные внутри, неразрывные, табуляции — подсвечиваются
 * точкой «·». Сам символ в разметке остаётся настоящим пробелом: при копировании текст совпадает
 * с прайсом, а точка — псевдоэлемент и в буфер не попадает. Пояснение «· — пробел» выводит
 * страница рядом с таблицей.
 *
 *   <LiteralText text={record.rawText} />   // «Тип10 рупорная (…)·» — хвостовой пробел B13
 *   <LiteralText text="" />                 // пустая ячейка: «—» + «пустая ячейка» для скринридера
 */

/** Пробелы на краях, серии из двух и больше, а также любые неразрывные и табуляции. */
const HIDDEN_WHITESPACE = /(^\s+|\s+$|\s{2,}|[ \t])/;

export function LiteralText({ text, className }: { text: string; className?: string }) {
  if (text === '') {
    return (
      <span className={cn('text-ink-muted', className)}>
        <span aria-hidden>—</span>
        <span className="sr-only">пустая ячейка</span>
      </span>
    );
  }
  const parts = text.split(HIDDEN_WHITESPACE).filter((part) => part !== '');
  return (
    <span className={cn('font-mono whitespace-pre-wrap break-words', className)}>
      {parts.map((part, index) =>
        HIDDEN_WHITESPACE.test(part) && part.trim() === '' ? (
          <WhitespaceMarks key={index} value={part} />
        ) : (
          <span key={index}>{part}</span>
        ),
      )}
    </span>
  );
}

function WhitespaceMarks({ value }: { value: string }) {
  return (
    <>
      {[...value].map((char, index) => (
        <span
          key={index}
          // pre: пробел не схлопывается, не «повисает» за краем строки и не отрывается переносом
          // от предыдущего символа — точка остаётся рядом с текстом.
          className="relative whitespace-pre rounded-xs bg-warning-subtle before:absolute before:inset-0 before:flex before:items-center before:justify-center before:text-warning before:content-['·']"
        >
          {char}
        </span>
      ))}
    </>
  );
}
