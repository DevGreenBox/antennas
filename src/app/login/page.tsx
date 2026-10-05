import { Suspense } from 'react';

import { LoginSkeleton, LoginView } from '@/components/auth/LoginView';
import { pageMetadata } from '@/lib/seo';

/**
 * Вход и восстановление доступа по коду на email (DESIGN §2.12). Параметры `?email=&next=`
 * читает клиентский компонент внутри Suspense. noindex.
 */
export const metadata = pageMetadata({
  title: 'Вход в личный кабинет',
  description: 'Вход и восстановление доступа по одноразовому коду на email — без пароля.',
  path: '/login',
});

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginSkeleton />}>
      <LoginView />
    </Suspense>
  );
}
