'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';

import { PageHeader } from '@/components/layout/PageHeader';
import { DemoBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { Skeleton, SkeletonGroup, SkeletonRows } from '@/components/ui/Skeleton';
import { StorageNotice } from '@/components/ui/StorageNotice';
import { resetDemoData } from '@/lib/store/orders';
import { logout } from '@/lib/store/session';
import { toast } from '@/lib/store/toast';

import { AccountNav } from './AccountNav';

/**
 * Каркас страниц ЛК со списками (DESIGN §2.13, §2.16): заголовок с email, AccountNav слева и
 * контент. «Выйти» — в навигации на ≥ lg и в заголовке на < lg; после выхода охрана ЛК уводит на
 * вход.
 *
 * Демо-пометка (DESIGN § R.5) — не плашка над контентом (общее «это демо» уже сказано в демо-
 * полосе), а одна строка под контентом: метка «Демо», где хранятся данные, и демо-действие
 * «Сбросить демо-данные». Без `demoText` строки нет (уведомления помечены «демо» каждое).
 */
export function AccountShell({
  title,
  email,
  demoText,
  withReset = false,
  children,
}: {
  title: string;
  email: string;
  /** Текст демо-строки под контентом. */
  demoText?: ReactNode;
  /** «Сбросить демо-данные» в демо-строке (страница «Личный кабинет»). */
  withReset?: boolean;
  children: ReactNode;
}) {
  const [confirmReset, setConfirmReset] = useState(false);
  const onLogout = () => {
    logout();
    toast({ message: 'Вы вышли из кабинета' });
  };

  return (
    <>
      <PageHeader
        title={title}
        meta={email}
        actions={
          // Ghost-кнопка по краю контента: слева на < md (под заголовком), справа на md+.
          <Button
            variant="ghost"
            size="sm"
            icon="log-out"
            className="-ml-3 max-lg:h-11 md:-mr-3 md:ml-0 lg:hidden"
            onClick={onLogout}
          >
            Выйти
          </Button>
        }
      />
      <StorageNotice className="mb-6" />
      <div className="grid gap-6 lg:grid-cols-account lg:gap-12">
        <AccountNav onLogout={onLogout} />
        <div className="min-w-0">
          {children}
          {demoText ? (
            <div
              data-print="hidden"
              className="mt-12 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line-subtle pt-4 text-small text-ink-secondary lg:mt-16"
            >
              <p className="flex items-start gap-2">
                <DemoBadge className="shrink-0" />
                <span className="pt-0.5">{demoText}</span>
              </p>
              {withReset ? (
                <Button
                  variant="link"
                  size="sm"
                  tone="danger"
                  className="min-h-11 lg:min-h-0"
                  onClick={() => setConfirmReset(true)}
                >
                  Сбросить демо-данные
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
      {withReset ? (
        <ConfirmDialog
          open={confirmReset}
          onClose={() => setConfirmReset(false)}
          title="Сбросить демо-данные?"
          confirmLabel="Сбросить"
          onConfirm={() => {
            resetDemoData();
            setConfirmReset(false);
          }}
        >
          Удалятся все демо-заказы, уведомления и профиль в этом браузере. Корзина и избранное
          останутся.
        </ConfirmDialog>
      ) : null}
    </>
  );
}

export function AccountSkeleton({ title }: { title: string }) {
  return (
    <>
      <PageHeader title={title} />
      <div className="grid gap-6 lg:grid-cols-account lg:gap-12">
        <SkeletonGroup className="hidden flex-col gap-2 lg:flex">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </SkeletonGroup>
        <SkeletonRows rows={3} />
      </div>
    </>
  );
}
