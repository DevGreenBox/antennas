import { formatCellAddress } from '@/lib/format';
import type { ProductNote } from '@/types/catalog';

/**
 * «Пометки из прайса» (DESIGN §2.6 п.11): буквальные пометки строк («на управу», «под рупор !»)
 * и групповые примечания с неподтверждённой областью действия. Смысл пометок не толкуется —
 * текст приводится как в прайсе, с адресом ячейки, и прямо сказано, что он уточняется.
 * Нет пометок — блок не рендерится.
 */
function noteText(note: ProductNote) {
  const cell = formatCellAddress(note.cell);
  const quoted = <>„{note.text}“</>;
  if (note.kind === 'row-note') {
    return (
      <>
        {quoted} — {cell}. Смысл пометки уточняется.
      </>
    );
  }
  if (!note.scopeConfirmed) {
    return (
      <>
        Примечание к группе: {quoted} ({cell}). К каким позициям оно относится, не подтверждено,
        поэтому в характеристики не перенесено.
      </>
    );
  }
  // Подтверждённое групповое примечание импорт переносит в характеристики (с происхождением);
  // в пометках оно может оказаться только из ручного слоя — показываем без оговорки.
  return (
    <>
      Примечание к группе: {quoted} ({cell}).
    </>
  );
}

export function ProductNotes({
  notes,
  className,
}: {
  notes: readonly ProductNote[];
  className?: string;
}) {
  if (notes.length === 0) return null;
  return (
    <section
      aria-labelledby="product-notes-title"
      className={className}
      data-testid="product-notes"
    >
      <h3 id="product-notes-title" className="eyebrow mb-3">
        Пометки из прайса
      </h3>
      <ul className="flex max-w-text flex-col gap-2 text-small text-ink">
        {notes.map((note) => (
          <li key={`${note.kind}-${note.cell}-${note.text}`}>{noteText(note)}</li>
        ))}
      </ul>
    </section>
  );
}
