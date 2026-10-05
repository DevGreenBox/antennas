/**
 * Демо-вход по коду и объединение корзины/избранного при входе (docs/DESIGN.md §2.12, §3.11).
 * Чистые функции без React и хранилищ — их вызывает `src/lib/store/session.ts` и юнит-тесты.
 *
 * В рабочей версии код отправляет и проверяет Admik; в макете код показывается на экране
 * («Демо: письмо не отправляется. Код для входа: …»), живёт `codeTtlSeconds`, попыток —
 * `maxAttempts`, повторная отправка — не раньше `resendCooldownSeconds`.
 */

import type {
  BuyerType,
  CartData,
  CartItem,
  DemoProfile,
  DemoSession,
  FavoritesData,
  LoginChallenge,
} from '@/types/order';

import { site } from '../config/site.ts';
import { MAX_LINE_QUANTITY } from './demo-pricing.ts';
import { isValidEmail, normalizeEmail } from './format.ts';

// ---------------------------------------------------------------------------
// Код входа.
// ---------------------------------------------------------------------------

/** Шестизначный код через crypto.getRandomValues (есть и в браузере, и в Node). */
export function generateLoginCode(length: number = site.demo.login.codeLength): string {
  const digits = new Uint32Array(length);
  globalThis.crypto.getRandomValues(digits);
  return Array.from(digits, (value) => String(value % 10)).join('');
}

const addSeconds = (iso: string, seconds: number) =>
  new Date(new Date(iso).getTime() + seconds * 1000).toISOString();

/** Новый вызов кода для email (нормализуется). */
export function createLoginChallenge(
  email: string,
  now: string,
  code: string = generateLoginCode(),
): LoginChallenge {
  const { codeTtlSeconds, resendCooldownSeconds, maxAttempts } = site.demo.login;
  return {
    email: normalizeEmail(email),
    code,
    expiresAt: addSeconds(now, codeTtlSeconds),
    attemptsLeft: maxAttempts,
    resendAvailableAt: addSeconds(now, resendCooldownSeconds),
  };
}

/** Секунд до возможности «Отправить код повторно» (0 — можно). */
export function resendSecondsLeft(challenge: LoginChallenge, now: string): number {
  const ms = new Date(challenge.resendAvailableAt).getTime() - new Date(now).getTime();
  return Math.max(0, Math.ceil(ms / 1000));
}

export type RequestCodeError = 'invalid-email' | 'cooldown';

export type RequestCodeResult =
  | { ok: true; challenge: LoginChallenge; reused: boolean }
  | { ok: false; error: RequestCodeError; message: string; secondsLeft?: number };

/**
 * «Получить код» / «Отправить код повторно». Для того же email во время ожидания повтора
 * возвращается действующий вызов (`reused`), новый код не создаётся — иначе обратный отсчёт
 * обходился бы сменой шага.
 */
export function requestCode(
  current: LoginChallenge | null,
  email: string,
  now: string,
  options: { resend?: boolean; code?: string } = {},
): RequestCodeResult {
  const trimmed = email.trim();
  if (trimmed === '') return { ok: false, error: 'invalid-email', message: 'Укажите email' };
  if (!isValidEmail(trimmed)) {
    return {
      ok: false,
      error: 'invalid-email',
      message: 'Проверьте email — например, name@company.ru',
    };
  }
  const normalized = normalizeEmail(trimmed);
  if (current !== null && current.email === normalized) {
    const secondsLeft = resendSecondsLeft(current, now);
    const expired = new Date(current.expiresAt).getTime() <= new Date(now).getTime();
    if (secondsLeft > 0 && !expired) {
      if (options.resend) {
        return {
          ok: false,
          error: 'cooldown',
          message: 'Код уже отправлен. Повторно — после окончания отсчёта.',
          secondsLeft,
        };
      }
      return { ok: true, challenge: current, reused: true };
    }
  }
  return {
    ok: true,
    challenge: createLoginChallenge(normalized, now, options.code),
    reused: false,
  };
}

export type VerifyCodeStatus =
  'ok' | 'no-challenge' | 'empty' | 'too-short' | 'wrong' | 'no-attempts' | 'expired';

export interface VerifyCodeResult {
  status: VerifyCodeStatus;
  /** Текст ошибки у поля (§6.5); пусто для 'ok'. */
  message: string;
  /** Обновлённый вызов: null — удалить (успех); иначе записать (могли уменьшиться попытки). */
  challenge: LoginChallenge | null;
}

/**
 * Проверка кода. Пробелы игнорируются («481 526»). Неполный код попытку не тратит; неверный —
 * тратит; после последней неверной — «Попытки закончились»; истёкший код не принимается.
 */
export function verifyCode(
  challenge: LoginChallenge | null,
  input: string,
  now: string,
): VerifyCodeResult {
  if (challenge === null) {
    return { status: 'no-challenge', message: 'Запросите код для входа.', challenge: null };
  }
  const code = input.replace(/\s+/g, '');
  if (code === '') return { status: 'empty', message: 'Введите код из письма', challenge };
  if (!/^\d+$/.test(code) || code.length !== challenge.code.length) {
    return { status: 'too-short', message: 'Код состоит из 6 цифр', challenge };
  }
  if (new Date(challenge.expiresAt).getTime() <= new Date(now).getTime()) {
    return {
      status: 'expired',
      message: 'Срок действия кода истёк. Запросите новый.',
      challenge,
    };
  }
  if (challenge.attemptsLeft <= 0) {
    return {
      status: 'no-attempts',
      message: 'Попытки закончились. Запросите новый код.',
      challenge,
    };
  }
  if (code !== challenge.code) {
    const attemptsLeft = challenge.attemptsLeft - 1;
    const next = { ...challenge, attemptsLeft };
    if (attemptsLeft <= 0) {
      return {
        status: 'no-attempts',
        message: 'Попытки закончились. Запросите новый код.',
        challenge: next,
      };
    }
    return {
      status: 'wrong',
      message: `Неверный код. Осталось попыток: ${attemptsLeft}`,
      challenge: next,
    };
  }
  return { status: 'ok', message: '', challenge: null };
}

// ---------------------------------------------------------------------------
// Объединение при входе (§3.11).
// ---------------------------------------------------------------------------

export interface CartMerge {
  items: CartItem[];
  /** Сколько позиций пришло из профиля (их не было в гостевой корзине) — для Toast. */
  addedFromProfile: number;
}

const clampQuantity = (quantity: number) =>
  Math.min(MAX_LINE_QUANTITY, Math.max(1, Math.trunc(quantity) || 1));

/**
 * Корзина = объединение гостевой и профильной по productId. Если товар есть в обеих —
 * quantity = max (не сумма: повторный вход не удваивает количество). Порядок: гостевые, затем
 * позиции только из профиля. Ни одна позиция не теряется.
 */
export function mergeCartItems(
  guest: readonly CartItem[],
  profile: readonly CartItem[],
): CartMerge {
  const merged = new Map<string, CartItem>();
  for (const item of guest) {
    const existing = merged.get(item.productId);
    merged.set(item.productId, {
      ...item,
      quantity: clampQuantity(Math.max(existing?.quantity ?? 0, item.quantity)),
    });
  }
  let addedFromProfile = 0;
  for (const item of profile) {
    const existing = merged.get(item.productId);
    if (existing === undefined) {
      merged.set(item.productId, { ...item, quantity: clampQuantity(item.quantity) });
      addedFromProfile += 1;
    } else if (item.quantity > existing.quantity) {
      merged.set(item.productId, { ...existing, quantity: clampQuantity(item.quantity) });
    }
  }
  return { items: [...merged.values()], addedFromProfile };
}

/** Избранное = гостевые, затем профильные, без повторов. */
export function mergeFavoriteIds(guest: readonly string[], profile: readonly string[]): string[] {
  return [...new Set([...guest, ...profile])];
}

/** Промокод — гостевой, если есть, иначе профильный. */
export function mergePromoCode(guest: string | null, profile: string | null): string | null {
  return guest ?? profile;
}

// ---------------------------------------------------------------------------
// Возврат после входа.
// ---------------------------------------------------------------------------

/** Управляющие символы и обратная косая черта: браузер выбрасывает или превращает их в «/». */
const UNSAFE_PATH_CHARS = /[\u0000-\u001f\u007f\\]/;

/**
 * Внутренний путь для `?next=` (§2.12): только адрес этого же сайта, иначе `fallback`.
 *
 * Проверки строки мало: «/\t/evil.test/» начинается с одного «/», но парсер URL выбрасывает
 * табуляцию и переводы строки и получает «//evil.test/» — протокол-относительный адрес чужого
 * сайта; «/\\evil.test» браузер читает так же. Поэтому такие символы запрещены сразу, а путь
 * разбирается `new URL(next, origin)`: принимается тот же origin и путь с одним ведущим «/»
 * (после нормализации тоже — «/.//evil.test» превращается в «//evil.test»). Возвращается
 * pathname + search + hash уже разобранного адреса.
 */
export function safeNextPath(
  next: string | null | undefined,
  fallback = '/account',
  origin: string = globalThis.location?.origin ?? 'http://localhost',
): string {
  if (typeof next !== 'string' || UNSAFE_PATH_CHARS.test(next)) return fallback;
  if (!next.startsWith('/') || next.startsWith('//')) return fallback;
  let url: URL;
  try {
    url = new URL(next, origin);
  } catch {
    return fallback;
  }
  if (url.origin !== new URL(origin).origin) return fallback;
  const path = `${url.pathname}${url.search}${url.hash}`;
  if (!path.startsWith('/') || path.startsWith('//') || UNSAFE_PATH_CHARS.test(path)) {
    return fallback;
  }
  return path;
}

// ---------------------------------------------------------------------------
// Данные из хранилища браузера (корзина, избранное, сессия, вызов кода, профили).
// ---------------------------------------------------------------------------

/*
 * Что прочитано из localStorage, не доверяется: битое значение не должно ронять шапку и
 * страницы (`items.length` у null). Неверная форма — пустое значение по умолчанию; отдельные
 * битые элементы списков отбрасываются, остальные сохраняются.
 */

type RawRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is RawRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const stringOrNull = (value: unknown): string | null => (typeof value === 'string' ? value : null);
const isDateString = (value: unknown): value is string =>
  typeof value === 'string' && !Number.isNaN(Date.parse(value));

/** Позиции корзины: битые отбрасываются, количество прижимается к 1–999, повторы — первая. */
export function sanitizeCartItems(raw: unknown): CartItem[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const items: CartItem[] = [];
  for (const item of raw) {
    if (!isRecord(item)) continue;
    const { productId, quantity, addedAt } = item;
    if (typeof productId !== 'string' || productId === '' || seen.has(productId)) continue;
    if (typeof quantity !== 'number' || !Number.isFinite(quantity)) continue;
    seen.add(productId);
    items.push({
      productId,
      quantity: clampQuantity(quantity),
      addedAt: typeof addedAt === 'string' ? addedAt : '',
    });
  }
  return items;
}

/** id товаров: только непустые строки, без повторов. */
export function sanitizeIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.filter((id): id is string => typeof id === 'string' && id !== ''))];
}

/** Состояние `favorites`. */
export function sanitizeFavoritesData(raw: unknown): FavoritesData {
  return { ids: isRecord(raw) ? sanitizeIds(raw.ids) : [] };
}

/** Состояние `cart`. */
export function sanitizeCartData(raw: unknown): CartData {
  if (!isRecord(raw)) return { items: [], promoCode: null };
  return { items: sanitizeCartItems(raw.items), promoCode: stringOrNull(raw.promoCode) };
}

/** Сессия `demoSession`: email — корректный и нормализованный, иначе гость. */
export function sanitizeSession(raw: unknown): DemoSession | null {
  if (!isRecord(raw) || typeof raw.email !== 'string' || !isValidEmail(raw.email)) return null;
  return {
    email: normalizeEmail(raw.email),
    startedAt: typeof raw.startedAt === 'string' ? raw.startedAt : '',
  };
}

/** Вызов кода `demoLoginChallenge`: без кода из цифр, сроков или попыток — вызова нет. */
export function sanitizeLoginChallenge(raw: unknown): LoginChallenge | null {
  if (!isRecord(raw)) return null;
  const { email, code, expiresAt, attemptsLeft, resendAvailableAt } = raw;
  if (
    typeof email !== 'string' ||
    !isValidEmail(email) ||
    typeof code !== 'string' ||
    !/^\d+$/.test(code) ||
    !isDateString(expiresAt) ||
    !isDateString(resendAvailableAt) ||
    !Number.isInteger(attemptsLeft) ||
    (attemptsLeft as number) < 0
  ) {
    return null;
  }
  return {
    email: normalizeEmail(email),
    code,
    expiresAt,
    attemptsLeft: attemptsLeft as number,
    resendAvailableAt,
  };
}

const BUYER_TYPES: readonly BuyerType[] = ['person', 'company'];

/** Профили `demoProfiles` (ключ — нормализованный email); битые записи отбрасываются. */
export function sanitizeProfiles(raw: unknown): Record<string, DemoProfile> {
  if (!isRecord(raw)) return {};
  const profiles: Record<string, DemoProfile> = {};
  for (const [email, profile] of Object.entries(raw)) {
    if (!isValidEmail(email) || !isRecord(profile)) continue;
    profiles[normalizeEmail(email)] = {
      name: typeof profile.name === 'string' ? profile.name : '',
      phone: stringOrNull(profile.phone),
      buyerType: BUYER_TYPES.find((type) => type === profile.buyerType) ?? 'person',
      companyName: stringOrNull(profile.companyName),
      inn: stringOrNull(profile.inn),
      cart: sanitizeCartItems(profile.cart),
      promoCode: stringOrNull(profile.promoCode),
      favorites: sanitizeIds(profile.favorites),
    };
  }
  return profiles;
}
