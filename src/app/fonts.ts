import { IBM_Plex_Mono, IBM_Plex_Sans } from 'next/font/google';

/**
 * Шрифты (DESIGN §5.3): IBM Plex Sans — интерфейс и текст (полноценная кириллица, табличные
 * цифры по умолчанию), IBM Plex Mono — коды, номера заказов, ячейки и исходный текст прайса.
 * Переменные подхватывает `@theme inline` в globals.css (--font-sans / --font-mono).
 */
export const plexSans = IBM_Plex_Sans({
  subsets: ['latin', 'cyrillic'],
  display: 'swap',
  variable: '--font-plex-sans',
}); // вариативный: weight не указывается

export const plexMono = IBM_Plex_Mono({
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '500'],
  display: 'swap',
  variable: '--font-plex-mono',
  preload: false, // моно — вторичный шрифт: коды и исходный текст прайса
});
