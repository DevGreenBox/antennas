'use client';

import { useSyncExternalStore } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { site } from '@/config/site';
import {
  mergeCartItems,
  mergeFavoriteIds,
  mergePromoCode,
  requestCode,
  resendSecondsLeft,
  sanitizeLoginChallenge,
  sanitizeProfiles,
  sanitizeSession,
  verifyCode,
} from '@/lib/demo-session';
import type { RequestCodeResult, VerifyCodeStatus } from '@/lib/demo-session';
import { normalizeEmail } from '@/lib/format';
import type { BuyerType, DemoProfile, DemoSession, LoginChallenge } from '@/types/order';

import { useCart } from './cart';
import { useFavorites } from './favorites';
import { refresh, safePersistOptions, syncAcrossTabs, usePersistHydrated } from './storage';

/**
 * Демо-вход по коду, сессия и профили (DESIGN §2.12, §3.11; ключи `demoSession`,
 * `demoLoginChallenge`, `demoProfiles`). В рабочей версии это вход Admik по коду на email.
 *
 * Страница входа:
 *   const r = requestLoginCode(email);          // шаг 1; r.challenge.code показать в DemoNotice
 *   const challenge = useLoginChallenge();      // шаг 2 (код, срок, попытки, отсчёт повтора)
 *   const v = verifyLoginCode(code);            // v.status === 'ok' → Toast + router.replace(next)
 * Шапка и ЛК:
 *   const email = useSessionEmail();            // null — гость (до гидратации тоже null)
 *   const ready = useSessionHydrated();         // охрана ЛК: до true — Skeleton
 *   logout();
 */

// ---------------------------------------------------------------------------
// Хранилища.
// ---------------------------------------------------------------------------

interface SessionData {
  session: DemoSession | null;
}

/** Поле состояния из persist (там может лежать что угодно — проверяет sanitize*). */
const field = (persisted: unknown, key: string): unknown =>
  typeof persisted === 'object' && persisted !== null
    ? (persisted as Record<string, unknown>)[key]
    : undefined;

export const useSessionStore = create<SessionData>()(
  persist(
    (): SessionData => ({ session: null }),
    safePersistOptions<SessionData, SessionData>({
      name: site.storageKeys.demoSession,
      initial: () => ({ session: null }),
      sanitize: (persisted) => ({ session: sanitizeSession(field(persisted, 'session')) }),
    }),
  ),
);

interface ChallengeData {
  challenge: LoginChallenge | null;
}

export const useLoginChallengeStore = create<ChallengeData>()(
  persist(
    (): ChallengeData => ({ challenge: null }),
    safePersistOptions<ChallengeData, ChallengeData>({
      name: site.storageKeys.demoLoginChallenge,
      initial: () => ({ challenge: null }),
      sanitize: (persisted) => ({
        challenge: sanitizeLoginChallenge(field(persisted, 'challenge')),
      }),
    }),
  ),
);

interface ProfilesData {
  /** Ключ — нормализованный email. */
  profiles: Record<string, DemoProfile>;
}

export const useProfilesStore = create<ProfilesData>()(
  persist(
    (): ProfilesData => ({ profiles: {} }),
    safePersistOptions<ProfilesData, ProfilesData>({
      name: site.storageKeys.demoProfiles,
      initial: () => ({ profiles: {} }),
      sanitize: (persisted) => ({ profiles: sanitizeProfiles(field(persisted, 'profiles')) }),
    }),
  ),
);

syncAcrossTabs(site.storageKeys.demoSession, useSessionStore);
syncAcrossTabs(site.storageKeys.demoLoginChallenge, useLoginChallengeStore);
syncAcrossTabs(site.storageKeys.demoProfiles, useProfilesStore);

// ---------------------------------------------------------------------------
// Хуки.
// ---------------------------------------------------------------------------

export const useSessionHydrated = () => usePersistHydrated(useSessionStore);

/** Email текущей демо-сессии или null. */
export const useSessionEmail = () => useSessionStore((state) => state.session?.email ?? null);

export const useSession = () => useSessionStore((state) => state.session);

export const useLoginChallenge = () => useLoginChallengeStore((state) => state.challenge);

/** Профиль email (данные из последней заявки) или null. */
export const useProfile = (email: string | null) =>
  useProfilesStore((state) => (email === null ? null : (state.profiles[email] ?? null)));

// ---------------------------------------------------------------------------
// Действия.
// ---------------------------------------------------------------------------

const emptyProfile = (): DemoProfile => ({
  name: '',
  phone: null,
  buyerType: 'person',
  companyName: null,
  inn: null,
  cart: [],
  promoCode: null,
  favorites: [],
});

/** Сессия на этот момент (свежая — с учётом других вкладок). */
export function currentSessionEmail(): string | null {
  refresh(useSessionStore);
  return useSessionStore.getState().session?.email ?? null;
}

/** Обновить профиль email (частично); профиля нет — создаётся. */
export function updateProfile(email: string, patch: Partial<DemoProfile>): void {
  refresh(useProfilesStore);
  const key = normalizeEmail(email);
  const profiles = useProfilesStore.getState().profiles;
  useProfilesStore.setState({
    profiles: { ...profiles, [key]: { ...emptyProfile(), ...profiles[key], ...patch } },
  });
}

/** Данные покупателя из заявки — в профиль (ЛК «Профиль», предзаполнение формы). */
export function saveBuyerProfile(
  email: string,
  buyer: {
    name: string;
    phone: string | null;
    buyerType: BuyerType;
    companyName: string | null;
    inn: string | null;
  },
): void {
  updateProfile(email, buyer);
}

/**
 * «Получить код» (`resend: false`) / «Отправить код повторно» (`resend: true`). При успехе вызов
 * сохраняется; код показывается на экране (демо: письмо не отправляется).
 */
export function requestLoginCode(
  email: string,
  options: { resend?: boolean } = {},
): RequestCodeResult {
  refresh(useLoginChallengeStore);
  const result = requestCode(
    useLoginChallengeStore.getState().challenge,
    email,
    new Date().toISOString(),
    options,
  );
  if (result.ok) useLoginChallengeStore.setState({ challenge: result.challenge });
  return result;
}

/** Секунд до «Отправить код повторно» (для отсчёта «0:42»). */
export function loginResendSecondsLeft(challenge: LoginChallenge): number {
  return resendSecondsLeft(challenge, new Date().toISOString());
}

/** «Изменить email» — вернуться к шагу 1. */
export function cancelLoginChallenge(): void {
  useLoginChallengeStore.setState({ challenge: null });
}

export type LoginResult =
  | { status: 'ok'; email: string; addedFromProfile: number }
  | { status: Exclude<VerifyCodeStatus, 'ok'>; message: string };

/**
 * «Войти»: проверка кода (§6.5). Успех — сессия, объединение корзины и избранного с профилем
 * (§3.11, результат и в гостевом хранилище, и в профиле), вызов удаляется. Toast «Вы вошли как
 * {email}» (+ «В корзину добавлено позиций из профиля: {n}») показывает страница.
 */
export function verifyLoginCode(input: string): LoginResult {
  refresh(useLoginChallengeStore);
  const verdict = verifyCode(
    useLoginChallengeStore.getState().challenge,
    input,
    new Date().toISOString(),
  );
  if (verdict.status !== 'ok') {
    if (verdict.challenge !== null)
      useLoginChallengeStore.setState({ challenge: verdict.challenge });
    return { status: verdict.status, message: verdict.message };
  }
  const email = useLoginChallengeStore.getState().challenge!.email;
  useLoginChallengeStore.setState({ challenge: null });

  refresh(useCart);
  refresh(useFavorites);
  refresh(useProfilesStore);
  const profile = useProfilesStore.getState().profiles[email] ?? emptyProfile();
  const cart = useCart.getState();
  const merged = mergeCartItems(cart.items, profile.cart);
  const promoCode = mergePromoCode(cart.promoCode, profile.promoCode);
  const favorites = mergeFavoriteIds(useFavorites.getState().ids, profile.favorites);

  useCart.getState().replace({ items: merged.items, promoCode });
  useFavorites.getState().replace(favorites);
  updateProfile(email, { cart: merged.items, promoCode, favorites });
  useSessionStore.setState({ session: { email, startedAt: new Date().toISOString() } });
  return { status: 'ok', email, addedFromProfile: merged.addedFromProfile };
}

/** «Выйти»: сессия удаляется; корзина и избранное остаются (копия уже в профиле). */
export function logout(): void {
  useSessionStore.setState({ session: null });
  forgetSubmittedOrder();
}

// ---------------------------------------------------------------------------
// Отметка «эту заявку отправили в этой вкладке» (страница «Заявка отправлена», §2.11).
// ---------------------------------------------------------------------------

/*
 * Страница успеха открывается по номеру из адреса, а номера идут подряд: без отметки любой, кто
 * подставит `?order=DEMO-0001` в этом браузере, увидел бы имя, email и телефон покупателя.
 * Подробности показываются сессии с email заказа или вкладке, из которой заявку только что
 * отправили: `submitOrder` пишет номер в sessionStorage (живёт в одной вкладке), отметка
 * действует `SUBMITTED_TTL_MS` и снимается при выходе.
 */
const SUBMITTED_KEY = 'antennas.demo.submitted-order';
const SUBMITTED_TTL_MS = 30 * 60 * 1000;

/** Запомнить номер только что отправленной заявки (вызывает `submitOrder`). */
export function rememberSubmittedOrder(number: string): void {
  try {
    window.sessionStorage.setItem(SUBMITTED_KEY, JSON.stringify({ number, at: Date.now() }));
  } catch {
    // sessionStorage недоступен — подробности увидит только сессия с email заказа.
  }
}

function forgetSubmittedOrder(): void {
  try {
    window.sessionStorage.removeItem(SUBMITTED_KEY);
  } catch {
    // нечего снимать
  }
}

/** Номер заявки, отправленной из этой вкладки не позже `SUBMITTED_TTL_MS` назад, или null. */
function readSubmittedOrder(): string | null {
  try {
    const raw = window.sessionStorage.getItem(SUBMITTED_KEY);
    if (raw === null) return null;
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null) return null;
    const { number, at } = value as { number?: unknown; at?: unknown };
    if (typeof number !== 'string' || typeof at !== 'number') return null;
    return Date.now() - at <= SUBMITTED_TTL_MS ? number : null;
  } catch {
    return null;
  }
}

const noopSubscribe = () => () => {};

/** Номер заявки, отправленной из этой вкладки (на сервере и при гидратации — null). */
export function useSubmittedOrderNumber(): string | null {
  return useSyncExternalStore(noopSubscribe, readSubmittedOrder, () => null);
}

/** Профили всех email удаляются («Сбросить демо-данные», §6.6). */
export function clearProfiles(): void {
  useProfilesStore.setState({ profiles: {} });
}

/**
 * Пока есть сессия, каждое изменение корзины и избранного копируется в профиль (§3.11).
 * Запускается один раз из StoreRuntime; возвращает отписку.
 */
export function startProfileSync(): () => void {
  const sync = () => {
    const email = useSessionStore.getState().session?.email;
    if (!email) return;
    const { items, promoCode } = useCart.getState();
    const { ids } = useFavorites.getState();
    const profile = useProfilesStore.getState().profiles[email];
    if (
      profile !== undefined &&
      profile.cart === items &&
      profile.promoCode === promoCode &&
      profile.favorites === ids
    ) {
      return;
    }
    updateProfile(email, { cart: items, promoCode, favorites: ids });
  };
  const offCart = useCart.subscribe((state, prev) => {
    if (state.items !== prev.items || state.promoCode !== prev.promoCode) sync();
  });
  const offFavorites = useFavorites.subscribe((state, prev) => {
    if (state.ids !== prev.ids) sync();
  });
  return () => {
    offCart();
    offFavorites();
  };
}
