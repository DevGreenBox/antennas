/**
 * Структурированные данные (DESIGN §8): `<script type="application/ld+json">`. «<» экранируется —
 * текст из данных не может закрыть тег (рекомендация docs Next.js «JSON-LD»).
 *
 *   <JsonLd data={breadcrumbListJsonLd(items)} />
 */
export function JsonLd({ data }: { data: object | readonly object[] }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }}
    />
  );
}
