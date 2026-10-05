'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';

import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { DemoNotice } from '@/components/ui/Notice';
import { Skeleton, SkeletonGroup, SkeletonRows } from '@/components/ui/Skeleton';
import { StorageNotice } from '@/components/ui/StorageNotice';
import { resetDemoData } from '@/lib/store/orders';
import { logout } from '@/lib/store/session';
import { toast } from '@/lib/store/toast';

import { AccountNav } from './AccountNav';

/**
 * Каркас страниц ЛК со списками (DESIGN §2.13, §2.16): заголовок с email, демо-пометка,
 * AccountNav слева и контент. «Выйти» — в навигации на ≥ lg и в заголовке на < lg; после
 * выхода охрана ЛК уводит на вход.
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
  demoText: ReactNode;
  /** «Сбросить демо-данные» в демо-пометке (страница «Личный кабинет»). */
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
            className="-ml-3 md:-mr-3 md:ml-0 lg:hidden"
            onClick={onLogout}
          >
            Выйти
          </Button>
        }
      />
      <StorageNotice className="mb-6" />
      <DemoNotice className="mb-6 lg:mb-8">
        <p>
          {demoText}
          {withReset ? (
            <>
              {' '}
              <Button variant="link" size="sm" tone="danger" onClick={() => setConfirmReset(true)}>
                Сбросить демо-данные
              </Button>
            </>
          ) : null}
        </p>
      </DemoNotice>
      <div className="grid gap-6 lg:grid-cols-account lg:gap-8">
        <AccountNav onLogout={onLogout} />
        <div className="min-w-0">{children}</div>
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
      <div className="grid gap-6 lg:grid-cols-account lg:gap-8">
        <SkeletonGroup className="hidden flex-col gap-2 lg:flex">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </SkeletonGroup>
        <SkeletonRows rows={3} />
      </div>
    </>
  );
}
