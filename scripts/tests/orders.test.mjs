/**
 * Демо-заказы и расчёты (docs/DESIGN.md §3): статусы и переходы, версии согласования и ссылки
 * оплаты, демо-провайдер, доступ по email, предварительный итог с позициями «по запросу»,
 * промокод, идемпотентность заявки, объединение корзины и избранного при входе, код входа.
 *
 * Модули подключаются напрямую как .ts (type stripping Node 22.18+); товары — реальные
 * src/data/products.generated.json, время и id задаются явно.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const load = (rel) => import(pathToFileURL(path.join(ROOT, rel)).href);

const products = JSON.parse(
  readFileSync(path.join(ROOT, 'src/data/products.generated.json'), 'utf8'),
);
const orders = await load('src/lib/demo-orders.ts');
const pricing = await load('src/lib/demo-pricing.ts');
const status = await load('src/lib/order-status.ts');
const session = await load('src/lib/demo-session.ts');
const format = await load('src/lib/format.ts');

const byId = new Map(products.map((p) => [p.id, p]));
const product = (id) => {
  const found = byId.get(id);
  assert.ok(found, `нет товара ${id}`);
  return found;
};

/** Фиксированный товар с ценой и позиция «по запросу» из реального прайса. */
const FIXED = product('antenna-tip1');
const REQUEST = products.find((p) => p.priceType === 'request');
assert.ok(FIXED.priceType === 'fixed' && FIXED.price > 0, 'Тип1 — с ценой');
assert.ok(REQUEST, 'в прайсе есть позиция «по запросу»');

const EMAIL = 'buyer@example.ru';
const OTHER = 'someone@example.ru';

/** Детерминированный контекст: время идёт по минуте на операцию, id — по счётчику. */
function makeCtx() {
  let tick = 0;
  let id = 0;
  return () => {
    tick += 1;
    return {
      now: new Date(Date.UTC(2026, 9, 5, 10, tick)).toISOString(),
      newId: () => `id-${(id += 1)}`,
    };
  };
}

function submit(data, ctx, overrides = {}) {
  return orders.createOrder(
    data,
    {
      idempotencyKey: 'key-1',
      buyer: { type: 'person', name: 'Иван', email: ' Buyer@Example.ru ' },
      lines: [{ productId: FIXED.id, product: FIXED, quantity: 2 }],
      promoCode: null,
      ...overrides,
    },
    ctx(),
  );
}

const draftFor = (order, patch = {}) => ({
  ...orders.initialQuoteDraft(order),
  delivery: 50000,
  ...patch,
});

/** Заказ в статусе «Ожидает оплаты» с версией 1. */
function awaitingPayment() {
  const ctx = makeCtx();
  let data = orders.emptyOrdersData();
  const created = submit(data, ctx);
  assert.ok(created.ok);
  data = created.data;
  const ref = { number: created.order.number, email: EMAIL };
  const negotiation = orders.startNegotiation(data, ref, ctx());
  assert.ok(negotiation.ok);
  const issued = orders.issueQuote(negotiation.data, ref, draftFor(negotiation.order), ctx());
  assert.ok(issued.ok, issued.message);
  return { ctx, ref, data: issued.data, order: issued.order };
}

describe('статусы и переходы (§3.1–3.2)', () => {
  test('таблица переходов', () => {
    assert.equal(status.canTransition('received', 'negotiation'), true);
    assert.equal(status.canTransition('received', 'cancelled'), true);
    assert.equal(status.canTransition('negotiation', 'awaiting-payment'), true);
    assert.equal(status.canTransition('awaiting-payment', 'paid'), true);
    assert.equal(status.canTransition('awaiting-payment', 'negotiation'), true);
    assert.equal(status.canTransition('paid', 'processing'), true);
    assert.equal(status.canTransition('processing', 'shipped'), true);
    assert.equal(status.canTransition('shipped', 'completed'), true);
    // Запрещённые: пропуск согласования, отмена оплаченного, возврат из закрытых.
    assert.equal(status.canTransition('received', 'awaiting-payment'), false);
    assert.equal(status.canTransition('received', 'paid'), false);
    assert.equal(status.canTransition('paid', 'cancelled'), false);
    assert.equal(status.canTransition('completed', 'received'), false);
    assert.equal(status.canTransition('cancelled', 'negotiation'), false);
    for (const s of status.ORDER_STATUSES) {
      assert.ok(status.ORDER_STATUS_LABELS[s], `подпись ${s}`);
      assert.ok(status.ORDER_STATUS_TONES[s], `тон ${s}`);
    }
  });

  test('запрещённое действие не меняет данные', () => {
    const ctx = makeCtx();
    const created = submit(orders.emptyOrdersData(), ctx);
    const ref = { number: created.order.number, email: EMAIL };
    const skip = orders.advanceOrder(created.data, ref, 'processing', ctx());
    assert.equal(skip.ok, false);
    assert.equal(skip.error, 'invalid-transition');
    const issueEarly = orders.issueQuote(created.data, ref, draftFor(created.order), ctx());
    assert.equal(issueEarly.ok, false);
    assert.equal(issueEarly.error, 'invalid-transition');
    assert.equal(orders.findOrder(created.data, ref.number, EMAIL).status, 'received');
  });

  test('счастливый путь до «Завершён» и таймлайн', () => {
    const { ctx, ref, data, order } = awaitingPayment();
    const started = orders.startPayment(data, ref, order.activeVersion, ctx());
    assert.ok(started.ok);
    const paid = orders.confirmPayment(started.data, ref, started.attempt.id, ctx());
    assert.equal(paid.code, 'confirmed');
    let state = paid.data;
    for (const to of ['processing', 'shipped', 'completed']) {
      const step = orders.advanceOrder(state, ref, to, ctx());
      assert.ok(step.ok, `→ ${to}`);
      state = step.data;
    }
    const done = orders.findOrder(state, ref.number, EMAIL);
    assert.equal(done.status, 'completed');
    assert.ok(orders.statusTimeline(done).every((step) => step.state === 'done'));
    // Уведомления: создана, к оплате, оплачен, обработка, отправлен, выполнен (без «на согласовании»).
    assert.equal(orders.notificationsForEmail(state, EMAIL).length, 6);
  });

  test('отмена требует причину и аннулирует действующую версию', () => {
    const { ctx, ref, data, order } = awaitingPayment();
    const started = orders.startPayment(data, ref, order.activeVersion, ctx());
    const noReason = orders.cancelOrder(started.data, ref, '  ', ctx());
    assert.equal(noReason.ok, false);
    assert.equal(noReason.error, 'reason-required');
    const cancelled = orders.cancelOrder(started.data, ref, 'По просьбе покупателя', ctx());
    assert.ok(cancelled.ok);
    assert.equal(cancelled.order.status, 'cancelled');
    assert.equal(cancelled.order.quotes[0].status, 'annulled');
    assert.equal(cancelled.order.quotes[0].annulReason, 'Заказ отменён');
    assert.equal(cancelled.order.payments[0].status, 'failed');
    assert.equal(cancelled.order.activeVersion, null);
    const timeline = orders.statusTimeline(cancelled.order);
    assert.equal(timeline.at(-1).state, 'cancelled');
    assert.ok(!timeline.some((step) => step.state === 'upcoming'));
  });
});

describe('версии согласования и ссылки оплаты (§3.6)', () => {
  test('изменение суммы аннулирует прежнюю версию и её ссылку', () => {
    const { ctx, ref, data, order } = awaitingPayment();
    assert.equal(order.status, 'awaiting-payment');
    assert.equal(order.activeVersion, 1);
    const pending = orders.startPayment(data, ref, 1, ctx());
    assert.ok(pending.ok);

    const reopened = orders.reopenQuote(pending.data, ref, ctx());
    assert.ok(reopened.ok);
    const v1 = reopened.order.quotes[0];
    assert.equal(reopened.order.status, 'negotiation');
    assert.equal(reopened.order.activeVersion, null);
    assert.equal(v1.status, 'annulled');
    assert.equal(v1.annulReason, 'Сумма изменена');
    assert.equal(reopened.order.payments[0].status, 'failed');
    assert.equal(reopened.order.payments[0].failureReason, 'Ссылка аннулирована');
    assert.equal(orders.paymentPageState(reopened.order, 1).code, 'B');

    // Форма предзаполняется значениями аннулированной версии; новая версия — 2.
    const draft = orders.initialQuoteDraft(reopened.order);
    assert.equal(draft.delivery, v1.delivery);
    const v2 = orders.issueQuote(reopened.data, ref, { ...draft, delivery: 70000 }, ctx());
    assert.ok(v2.ok);
    assert.equal(v2.order.activeVersion, 2);
    assert.equal(v2.order.quotes[1].total, v1.total + 20000);
    assert.equal(orders.paymentPageState(v2.order, 1).code, 'B');
    assert.equal(orders.paymentPageState(v2.order, 2).code, 'D');
    assert.equal(orders.paymentPageState(v2.order, 7).code, 'E');
    assert.equal(orders.paymentHref(ref.number, 2), `/account/orders/${ref.number}/pay?v=2`);

    // Старая ссылка не создаёт попытку.
    const stale = orders.startPayment(v2.data, ref, 1, ctx());
    assert.equal(stale.ok, false);
    assert.equal(stale.error, 'stale-link');
  });

  test('«Выставить к оплате» проверяет форму', () => {
    const ctx = makeCtx();
    const created = submit(orders.emptyOrdersData(), ctx, {
      lines: [
        { productId: FIXED.id, product: FIXED, quantity: 1 },
        { productId: REQUEST.id, product: REQUEST, quantity: 1 },
      ],
    });
    const ref = { number: created.order.number, email: EMAIL };
    const negotiation = orders.startNegotiation(created.data, ref, ctx());
    const draft = orders.initialQuoteDraft(negotiation.order);
    // У «по запросу» цены в снимке нет — форма пустая, доставка не указана.
    assert.equal(draft.lines[1].unitPrice, null);
    const failed = orders.issueQuote(negotiation.data, ref, draft, ctx());
    assert.equal(failed.ok, false);
    assert.equal(failed.error, 'invalid-quote');
    const codes = failed.quoteErrors.map((e) => e.code).sort();
    assert.deepEqual(codes, ['delivery-missing', 'price-missing']);

    const tooMuch = pricing.validateQuoteDraft({
      ...draft,
      lines: draft.lines.map((l) => ({ ...l, unitPrice: 100 })),
      discount: 1000,
      delivery: 0,
    });
    assert.equal(tooMuch.ok, false);
    assert.equal(tooMuch.errors[0].code, 'discount-too-large');

    const allExcluded = pricing.validateQuoteDraft({
      ...draft,
      lines: draft.lines.map((l) => ({ ...l, excluded: true })),
      delivery: 0,
    });
    assert.equal(allExcluded.errors[0].code, 'no-lines');

    // Исключённая позиция попадает в removedLineIds, добавленная менеджером — в строки.
    const withManager = orders.issueQuote(
      negotiation.data,
      ref,
      {
        ...draft,
        delivery: 0,
        lines: [
          { ...draft.lines[0] },
          { ...draft.lines[1], excluded: true },
          {
            lineId: orders.nextManagerLineId(draft.lines),
            productId: FIXED.id,
            code: FIXED.code,
            name: FIXED.name,
            quantity: 1,
            unitPrice: 500000,
            origin: 'added-by-manager',
            excluded: false,
          },
        ],
      },
      ctx(),
    );
    assert.ok(withManager.ok, withManager.message);
    const quote = withManager.order.quotes[0];
    assert.deepEqual(quote.removedLineIds, ['l2']);
    assert.equal(quote.lines[1].lineId, 'm1');
    assert.equal(quote.itemsTotal, FIXED.price + 500000);
    assert.equal(quote.total, quote.itemsTotal);
  });
});

describe('демо-провайдер оплаты (§3.7)', () => {
  test('повторное «Оплатить» не создаёт вторую попытку', () => {
    const { ctx, ref, data } = awaitingPayment();
    const first = orders.startPayment(data, ref, 1, ctx());
    const second = orders.startPayment(first.data, ref, 1, ctx());
    assert.equal(first.created, true);
    assert.equal(second.created, false);
    assert.equal(second.attempt.id, first.attempt.id);
    assert.equal(second.order.payments.length, 1);
    assert.equal(first.attempt.amount, first.order.quotes[0].total);
  });

  test('повторное подтверждение не создаёт вторую оплату', () => {
    const { ctx, ref, data } = awaitingPayment();
    const started = orders.startPayment(data, ref, 1, ctx());
    const paid = orders.confirmPayment(started.data, ref, started.attempt.id, ctx());
    assert.equal(paid.code, 'confirmed');
    assert.equal(paid.order.status, 'paid');
    assert.equal(paid.order.quotes[0].status, 'paid');
    assert.ok(paid.order.quotes[0].paidAt);

    const again = orders.confirmPayment(paid.data, ref, started.attempt.id, ctx());
    assert.equal(again.code, 'already-paid');
    assert.equal(again.data, paid.data, 'данные не изменились');
    const confirmed = again.order.payments.filter((p) => p.status === 'confirmed');
    assert.equal(confirmed.length, 1);
    assert.equal(
      again.order.events.filter((e) => e.type === 'payment-confirmed').length,
      1,
      'одно событие оплаты',
    );
    // После оплаты новая попытка не создаётся, а страница оплаты — в состоянии C.
    assert.equal(orders.startPayment(paid.data, ref, 1, ctx()).ok, false);
    assert.equal(orders.paymentPageState(paid.order, 1).code, 'C');
  });

  test('подтверждение по аннулированной ссылке отклоняется', () => {
    const { ctx, ref, data } = awaitingPayment();
    const started = orders.startPayment(data, ref, 1, ctx());
    const reopened = orders.reopenQuote(started.data, ref, ctx());
    // Обычный путь: аннулирование уже провалило ожидающую попытку.
    const late = orders.confirmPayment(reopened.data, ref, started.attempt.id, ctx());
    assert.equal(late.code, 'not-pending');
    assert.equal(late.order.status, 'negotiation');

    // Устаревшие данные (например, из другой вкладки): попытка ещё pending, версия аннулирована.
    const tampered = {
      ...reopened.data,
      orders: reopened.data.orders.map((o) => ({
        ...o,
        payments: o.payments.map((p) => ({ ...p, status: 'pending', failureReason: null })),
      })),
    };
    const stale = orders.confirmPayment(tampered, ref, started.attempt.id, ctx());
    assert.equal(stale.code, 'stale-link');
    assert.match(stale.message, /версия 1 аннулирована/);
    assert.equal(stale.order.status, 'negotiation');
    assert.equal(stale.order.payments[0].status, 'failed');
    assert.equal(stale.order.payments[0].failureReason, 'Ссылка аннулирована');
  });

  test('сумма попытки не совпадает с версией — отказ', () => {
    const { ctx, ref, data } = awaitingPayment();
    const started = orders.startPayment(data, ref, 1, ctx());
    const tampered = {
      ...started.data,
      orders: started.data.orders.map((o) => ({
        ...o,
        payments: o.payments.map((p) => ({ ...p, amount: p.amount - 1 })),
      })),
    };
    const result = orders.confirmPayment(tampered, ref, started.attempt.id, ctx());
    assert.equal(result.code, 'amount-mismatch');
    assert.equal(result.order.status, 'awaiting-payment');
  });

  test('«Провайдер отказал» статус не меняет, можно платить снова', () => {
    const { ctx, ref, data } = awaitingPayment();
    const started = orders.startPayment(data, ref, 1, ctx());
    const declined = orders.declinePayment(started.data, ref, started.attempt.id, ctx());
    assert.ok(declined.ok);
    assert.equal(declined.order.status, 'awaiting-payment');
    assert.equal(declined.order.payments[0].failureReason, 'Провайдер отказал');
    const retry = orders.startPayment(declined.data, ref, 1, ctx());
    assert.equal(retry.created, true);
    assert.notEqual(retry.attempt.id, started.attempt.id);
  });
});

describe('доступ по email (§2.14, §3.11)', () => {
  test('чужой email не получает заказ', () => {
    const ctx = makeCtx();
    const created = submit(orders.emptyOrdersData(), ctx);
    const { number } = created.order;
    assert.equal(created.order.buyer.email, EMAIL, 'email нормализован');
    assert.ok(orders.findOrder(created.data, number, 'BUYER@example.ru'));
    assert.equal(orders.findOrder(created.data, number, OTHER), null);
    assert.equal(orders.findOrder(created.data, number, null), null);
    assert.deepEqual(orders.ordersForEmail(created.data, OTHER), []);
    assert.deepEqual(orders.notificationsForEmail(created.data, OTHER), []);
    // Действия от чужого email — тот же ответ, что и для несуществующего номера.
    const foreign = orders.startNegotiation(created.data, { number, email: OTHER }, ctx());
    assert.equal(foreign.ok, false);
    assert.equal(foreign.error, 'not-found');
    const missing = orders.startNegotiation(
      created.data,
      { number: 'DEMO-9999', email: EMAIL },
      ctx(),
    );
    assert.equal(missing.message, foreign.message);
  });

  test('уведомления отмечаются прочитанными только у своего email', () => {
    const ctx = makeCtx();
    const created = submit(orders.emptyOrdersData(), ctx);
    assert.equal(orders.unreadCount(created.data, EMAIL), 1);
    const foreign = orders.markNotificationsRead(created.data, OTHER);
    assert.equal(foreign, created.data);
    const read = orders.markNotificationsRead(created.data, EMAIL, {
      orderNumber: created.order.number,
    });
    assert.equal(orders.unreadCount(read, EMAIL), 0);
  });
});

describe('предварительный расчёт и промокод (§3.4, §3.5)', () => {
  test('позиции «по запросу» не дают ложного итога', () => {
    const totals = pricing.preliminaryTotals([
      { priceType: 'fixed', unitPrice: 1_300_000, quantity: 2 },
      { priceType: 'request', unitPrice: null, quantity: 3 },
    ]);
    assert.equal(totals.knownItemsTotal, 2_600_000);
    assert.equal(totals.knownQuantity, 2);
    assert.equal(totals.requestLinesCount, 1);
    assert.equal(totals.requestQuantity, 3);
    assert.equal(totals.hasRequestItems, true);
    assert.equal(totals.total, null, 'полного итога нет');
    assert.equal(pricing.lineTotal({ priceType: 'request', unitPrice: null, quantity: 3 }), null);

    const ctx = makeCtx();
    const created = submit(orders.emptyOrdersData(), ctx, {
      lines: [
        { productId: FIXED.id, product: FIXED, quantity: 1 },
        { productId: REQUEST.id, product: REQUEST, quantity: 1 },
      ],
    });
    assert.ok(created.ok);
    assert.equal(created.order.preliminary.total, null);
    assert.equal(created.order.preliminary.requestItemsCount, 1);
    assert.equal(created.order.preliminary.knownItemsTotal, FIXED.price);
    assert.equal(created.order.items[1].unitPrice, null);
    assert.deepEqual(orders.orderAmount(created.order), {
      kind: 'pending',
      knownItemsTotal: FIXED.price,
    });
  });

  test('без «по запросу» — предварительный итог со скидкой', () => {
    const totals = pricing.preliminaryTotals(
      [{ priceType: 'fixed', unitPrice: 1_300_000, quantity: 2 }],
      'demo10',
    );
    assert.equal(totals.discount, 260_000);
    assert.equal(totals.total, 2_340_000);
  });

  test('промокод не считается от позиций «по запросу»', () => {
    const lines = [
      { priceType: 'fixed', unitPrice: 333_333, quantity: 1 },
      { priceType: 'request', unitPrice: null, quantity: 10 },
    ];
    const totals = pricing.preliminaryTotals(lines, ' demo10 ');
    assert.deepEqual(totals.promo, { code: 'DEMO10', percent: 10 });
    assert.equal(totals.discount, 33_333, 'Math.round(333 333 × 10 / 100), только строки с ценой');

    const onlyRequest = pricing.preliminaryTotals([lines[1]], 'DEMO10');
    assert.equal(onlyRequest.discount, 0);
    assert.equal(onlyRequest.onlyRequestItems, true);
    assert.deepEqual(onlyRequest.promo, { code: 'DEMO10', percent: 10 });

    // Скидка в форме согласования предлагается только от строк, что были с ценой в заявке.
    const ctx = makeCtx();
    const created = submit(orders.emptyOrdersData(), ctx, {
      lines: [
        { productId: FIXED.id, product: FIXED, quantity: 1 },
        { productId: REQUEST.id, product: REQUEST, quantity: 1 },
      ],
      promoCode: 'DEMO10',
    });
    const draft = orders.initialQuoteDraft(created.order);
    assert.equal(draft.discount, Math.round((FIXED.price * 10) / 100));
    assert.equal(draft.discountNote, 'Промокод DEMO10');
    const priced = draft.lines.map((l) => ({ ...l, unitPrice: l.unitPrice ?? 9_999_900 }));
    assert.equal(
      pricing.suggestPromoDiscount(priced, created.order),
      Math.round((FIXED.price * 10) / 100),
    );
  });

  test('проверка ввода промокода', () => {
    assert.equal(pricing.checkPromoCode('  ', null).status, 'empty');
    assert.equal(pricing.checkPromoCode('NOPE', null).status, 'not-found');
    assert.equal(pricing.checkPromoCode('demo10', null).status, 'applied');
    assert.equal(pricing.checkPromoCode('demo10', 'DEMO10').status, 'already-applied');
    assert.equal(pricing.checkPromoCode('demo10', 'OLD').status, 'replaced');
  });

  test('рубли в форме ↔ копейки', () => {
    assert.equal(pricing.parseMoneyField(''), null, 'пусто');
    assert.equal(pricing.parseMoneyField('  '), null, 'пусто');
    assert.ok(Number.isNaN(pricing.parseMoneyField('1 000 руб')), 'не число — не 0');
    assert.ok(Number.isNaN(pricing.parseMoneyField('12,345')));
    assert.equal(pricing.parseMoneyField('1 300'), 130_000);
    assert.equal(pricing.parseRublesInput('13 000,5'), 1_300_050);
    assert.equal(pricing.parseRublesInput('0'), 0);
    assert.equal(pricing.parseRublesInput('12,345'), null);
    assert.equal(pricing.parseRublesInput('abc'), null);
    assert.equal(pricing.formatRublesInput(1_300_050), '13000,50');
    assert.equal(pricing.formatRublesInput(1_300_000), '13000');
  });
});

describe('заявка (§2.10, §3.3)', () => {
  test('двойная отправка не создаёт два заказа', () => {
    const ctx = makeCtx();
    const first = submit(orders.emptyOrdersData(), ctx);
    const second = submit(first.data, ctx);
    assert.equal(first.created, true);
    assert.equal(second.created, false);
    assert.equal(second.order.number, first.order.number);
    assert.equal(second.data.orders.length, 1);
    assert.equal(second.data.seq, 1);
    assert.equal(second.data.notifications.length, 1);
    const another = submit(second.data, ctx, { idempotencyKey: 'key-2' });
    assert.equal(another.order.number, 'DEMO-0002');
  });

  test('снимок позиции и валидация', () => {
    const ctx = makeCtx();
    const created = submit(orders.emptyOrdersData(), ctx, {
      buyer: {
        type: 'person',
        name: ' Иван ',
        email: EMAIL,
        phone: '+7 (999) 123-45-67',
        companyName: 'ООО Ромашка',
        inn: '7700000000',
      },
    });
    const [item] = created.order.items;
    assert.equal(created.order.number, 'DEMO-0001');
    assert.equal(item.lineId, 'l1');
    assert.equal(item.code, FIXED.code);
    assert.equal(item.name, FIXED.name);
    assert.equal(item.unitPrice, FIXED.price);
    assert.deepEqual(item.spec, [
      { text: '700–1100\u00a0МГц', status: 'confirmed' },
      { text: '12\u00a0дБи', status: 'confirmed' },
      { text: 'N-female', status: 'confirmed' },
    ]);
    assert.equal(item.specSummary, undefined, 'новые снимки строку без статусов не пишут');
    assert.equal(created.order.buyer.name, 'Иван');
    assert.equal(created.order.buyer.phone, '+79991234567');
    assert.equal(created.order.buyer.companyName, null, 'частное лицо — без реквизитов');
    assert.deepEqual(created.order.events[0].notify, { buyerEmail: true, managerTelegram: true });
    assert.match(
      orders.managerMessage(created.order, created.order.events[0]),
      /Новая заявка DEMO-0001: Иван/,
    );

    const empty = submit(orders.emptyOrdersData(), ctx, { lines: [] });
    assert.equal(empty.error, 'empty-cart');
    const unavailable = submit(orders.emptyOrdersData(), ctx, {
      lines: [{ productId: 'gone', product: null, quantity: 1 }],
    });
    assert.equal(unavailable.error, 'unavailable-items');
    const tooMany = submit(orders.emptyOrdersData(), ctx, {
      lines: [{ productId: FIXED.id, product: FIXED, quantity: 1000 }],
    });
    assert.equal(tooMany.error, 'invalid-quantity');
  });
});

describe('вход и объединение (§2.12, §3.11)', () => {
  test('слияние корзин без потери позиций, количество — максимум', () => {
    const at = '2026-10-05T10:00:00.000Z';
    const guest = [
      { productId: 'a', quantity: 2, addedAt: at },
      { productId: 'b', quantity: 1, addedAt: at },
    ];
    const profile = [
      { productId: 'b', quantity: 5, addedAt: at },
      { productId: 'c', quantity: 1, addedAt: at },
    ];
    const merged = session.mergeCartItems(guest, profile);
    assert.deepEqual(
      merged.items.map((i) => [i.productId, i.quantity]),
      [
        ['a', 2],
        ['b', 5],
        ['c', 1],
      ],
    );
    assert.equal(merged.addedFromProfile, 1);
    // Повторный вход не удваивает количество.
    const again = session.mergeCartItems(merged.items, merged.items);
    assert.deepEqual(again.items, merged.items);
    assert.equal(again.addedFromProfile, 0);

    assert.deepEqual(session.mergeFavoriteIds(['x', 'y'], ['y', 'z']), ['x', 'y', 'z']);
    assert.equal(session.mergePromoCode(null, 'DEMO10'), 'DEMO10');
    assert.equal(session.mergePromoCode('A', 'B'), 'A');
  });

  test('код входа: неполный не тратит попытку, неверный тратит, истёкший не принимается', () => {
    const now = '2026-10-05T10:00:00.000Z';
    const requested = session.requestCode(null, ' Buyer@Example.ru', now, { code: '481526' });
    assert.ok(requested.ok);
    const challenge = requested.challenge;
    assert.equal(challenge.email, EMAIL);
    assert.equal(session.verifyCode(challenge, '48', now).status, 'too-short');
    assert.equal(session.verifyCode(challenge, '', now).status, 'empty');
    const wrong = session.verifyCode(challenge, '000000', now);
    assert.equal(wrong.status, 'wrong');
    assert.equal(wrong.challenge.attemptsLeft, challenge.attemptsLeft - 1);
    assert.equal(session.verifyCode(challenge, '481 526', now).status, 'ok');
    const later = new Date(Date.parse(challenge.expiresAt) + 1000).toISOString();
    assert.equal(session.verifyCode(challenge, '481526', later).status, 'expired');

    let state = challenge;
    let result;
    for (let i = 0; i < challenge.attemptsLeft; i += 1) {
      result = session.verifyCode(state, '111111', now);
      state = result.challenge;
    }
    assert.equal(result.status, 'no-attempts');
    assert.equal(session.verifyCode(state, '481526', now).status, 'no-attempts');

    // Повтор во время отсчёта не создаёт новый код.
    const reused = session.requestCode(challenge, EMAIL, now);
    assert.equal(reused.reused, true);
    assert.equal(session.requestCode(challenge, EMAIL, now, { resend: true }).error, 'cooldown');
    assert.equal(session.requestCode(null, 'not-an-email', now).error, 'invalid-email');
    assert.match(session.generateLoginCode(), /^\d{6}$/);
  });

  test('next — только внутренний путь', () => {
    const origin = 'https://shop.example';
    const next = (value) => session.safeNextPath(value, '/account', origin);
    assert.equal(next('/account/orders/DEMO-0001'), '/account/orders/DEMO-0001');
    assert.equal(
      next('/account/orders/DEMO-0001/pay?v=2#top'),
      '/account/orders/DEMO-0001/pay?v=2#top',
    );
    assert.equal(next('/account/../cart'), '/cart', 'путь нормализуется');
    assert.equal(session.safeNextPath(null), '/account');
    // URLSearchParams.get уже раскодировал %09/%0A/%0D/%5C — сюда приходят сами символы.
    const evil = [
      '//evil.example',
      'https://evil.example',
      'javascript:alert(1)',
      'evil.example',
      ' /account',
      '/\t/evil.test/',
      '/\n/evil.test/',
      '/\r/evil.test/',
      '/\t\t/evil.test',
      '\t//evil.test',
      '/\\evil.test',
      '\\\\evil.test',
      '/\\/evil.test',
      '/.//evil.test',
      '/%2e//evil.test',
      '/\u0000/evil.test',
      '/\u007f/evil.test',
      '',
    ];
    for (const value of evil) {
      assert.equal(next(value), '/account', JSON.stringify(value));
    }
    // Что бы ни вернулось — это путь этого сайта: тот же origin после разбора браузером.
    for (const value of [...evil, '/account', '/a/b?c=d']) {
      const result = next(value);
      assert.ok(result.startsWith('/') && !result.startsWith('//'), JSON.stringify(value));
      assert.equal(new URL(result, origin).origin, origin, JSON.stringify(value));
    }
  });
});

describe('форматирование (§4.9)', () => {
  test('склонения и мелочи', () => {
    assert.equal(format.countLabel(1, format.PRODUCT_FORMS), '1 товар');
    assert.equal(format.countLabel(2, format.PRODUCT_FORMS), '2 товара');
    assert.equal(format.countLabel(5, format.PRODUCT_FORMS), '5 товаров');
    assert.equal(format.countLabel(21, format.POSITION_FORMS), '21 позиция');
    assert.equal(format.countLabel(118, format.PRODUCT_FORMS), '118 товаров');
    assert.equal(format.formatCellAddress('1!B4'), 'лист 1, B4');
    assert.equal(format.formatLoginCode('481526'), '481 526');
    assert.equal(format.formatCountdown(42), '0:42');
    assert.equal(format.formatBadgeCount(120), '99+');
    assert.equal(format.isValidPhone('+7 999 123-45-67'), true);
    assert.equal(format.isValidPhone('12345'), false);
    assert.equal(format.isValidInn('7700000000'), true);
    assert.equal(format.isValidInn('77000'), false);
    assert.equal(format.capitalize('логопериодическая'), 'Логопериодическая');
  });
});

describe('снимок позиции со статусами значений (§4.7, §4.10)', () => {
  const TIP7 = product('antenna-tip7');
  const TIP8 = product('antenna-tip8');
  const LNA = product('lna-6000-8000-10db');
  const CABLE = product('cable-15cm-sma-m-straight-sma-m-straight-rg316-rg142');

  test('inferred и needs-review сохраняются в заявке', () => {
    const ctx = makeCtx();
    const created = submit(orders.emptyOrdersData(), ctx, {
      lines: [TIP7, TIP8, LNA, CABLE].map((p) => ({ productId: p.id, product: p, quantity: 1 })),
    });
    assert.ok(created.ok);
    const statusOf = (item, text) => item.spec.find((point) => point.text === text)?.status;
    const [tip7, tip8, lna, cable] = created.order.items;
    assert.equal(statusOf(tip7, '3100–4500 МГц'), 'inferred');
    assert.equal(statusOf(tip8, 'N/sma-мама'), 'needs-review');
    assert.equal(statusOf(lna, '6000–8000 ГГц'), 'needs-review', '«ГГц» не исправляется');
    assert.equal(statusOf(cable, 'RG-316 / RG-142'), 'needs-review');
    // Снимок переживает JSON (localStorage) без потери статусов.
    const stored = orders.sanitizeOrdersData(JSON.parse(JSON.stringify(created.data)));
    assert.deepEqual(stored.orders[0].items, created.order.items);
  });

  test('старый заказ со строкой specSummary показывается со статусами из каталога', () => {
    const legacy = {
      spec: [],
      specSummary: '3100–4500 МГц · 22 дБи · N-female',
    };
    const points = orders.orderItemSpec(legacy, TIP7);
    assert.deepEqual(
      points.map((p) => [p.text, p.status]),
      [
        ['3100–4500 МГц', 'inferred'],
        ['22 дБи', 'confirmed'],
        ['N-female', 'confirmed'],
      ],
    );
    // Товара больше нет в каталоге — строка как была сохранена, без выдуманных статусов.
    assert.deepEqual(
      orders.orderItemSpec(legacy, null).map((p) => p.text),
      ['3100–4500 МГц', '22 дБи', 'N-female'],
    );
    // Старая запись из localStorage (без `spec`) читается и сохраняет строку.
    const ctx = makeCtx();
    const created = submit(orders.emptyOrdersData(), ctx);
    const raw = JSON.parse(JSON.stringify(created.data));
    delete raw.orders[0].items[0].spec;
    raw.orders[0].items[0].specSummary = '700–1100 МГц · 12 дБи · N-female';
    const [item] = orders.sanitizeOrdersData(raw).orders[0].items;
    assert.deepEqual(item.spec, []);
    assert.equal(orders.orderItemSpec(item, FIXED).length, 3);
  });
});

describe('битые данные в хранилище браузера (§9)', () => {
  test('заказы: неверная форма — пусто, битые элементы отбрасываются', () => {
    const empty = { seq: 0, orders: [], notifications: [] };
    for (const raw of [null, 'abc', 42, [], { orders: null }, { orders: 'x' }]) {
      assert.deepEqual(orders.sanitizeOrdersData(raw), empty, JSON.stringify(raw));
    }
    const ctx = makeCtx();
    const first = submit(orders.emptyOrdersData(), ctx);
    const second = submit(first.data, ctx, { idempotencyKey: 'key-2' });
    const raw = JSON.parse(JSON.stringify(second.data));
    raw.seq = 0;
    raw.orders.push({ number: 'DEMO-0009' }, null, 'x', { ...raw.orders[0] });
    raw.orders[1].items.push({ name: 'без полей' });
    raw.orders[1].events.push({ id: 1 });
    raw.orders[1].activeVersion = 7;
    raw.notifications.push({ title: 'без полей' });
    const clean = orders.sanitizeOrdersData(raw);
    assert.deepEqual(
      clean.orders.map((o) => o.number),
      ['DEMO-0001', 'DEMO-0002'],
      'заказ без полей и повтор номера отброшены',
    );
    assert.equal(clean.orders[1].items.length, 1, 'битая позиция отброшена');
    assert.equal(clean.orders[1].events.length, 1, 'битое событие отброшено');
    assert.equal(clean.orders[1].activeVersion, null, 'ссылка на несуществующую версию');
    assert.equal(clean.notifications.length, 2);
    assert.equal(clean.seq, 2, 'новая заявка не получит номер существующего заказа');
    // Чистые данные проходят без изменений.
    assert.deepEqual(
      orders.sanitizeOrdersData(JSON.parse(JSON.stringify(second.data))),
      second.data,
    );
  });

  test('корзина, избранное, сессия, вызов кода, профили', () => {
    assert.deepEqual(session.sanitizeCartData({ items: null }), { items: [], promoCode: null });
    assert.deepEqual(session.sanitizeCartData('x'), { items: [], promoCode: null });
    assert.deepEqual(
      session.sanitizeCartData({
        items: [
          { productId: 'a', quantity: 2, addedAt: 't' },
          { productId: 'a', quantity: 5, addedAt: 't' },
          { productId: 'b', quantity: 5000 },
          { productId: '', quantity: 1 },
          { productId: 'c', quantity: 'много' },
          null,
        ],
        promoCode: 5,
      }),
      {
        items: [
          { productId: 'a', quantity: 2, addedAt: 't' },
          { productId: 'b', quantity: 999, addedAt: '' },
        ],
        promoCode: null,
      },
    );
    assert.deepEqual(session.sanitizeFavoritesData({ ids: 'abc' }), { ids: [] });
    assert.deepEqual(session.sanitizeFavoritesData({ ids: ['a', 1, 'a', '', 'b'] }), {
      ids: ['a', 'b'],
    });
    assert.equal(session.sanitizeSession({ email: 123 }), null);
    assert.equal(session.sanitizeSession('buyer@example.ru'), null);
    assert.deepEqual(session.sanitizeSession({ email: ' Buyer@Example.ru', startedAt: 's' }), {
      email: EMAIL,
      startedAt: 's',
    });
    const now = '2026-10-05T10:00:00.000Z';
    const challenge = session.createLoginChallenge(EMAIL, now, '481526');
    assert.deepEqual(session.sanitizeLoginChallenge(challenge), challenge);
    assert.equal(session.sanitizeLoginChallenge({ ...challenge, code: null }), null);
    assert.equal(session.sanitizeLoginChallenge({ ...challenge, attemptsLeft: -1 }), null);
    assert.equal(session.sanitizeLoginChallenge({ ...challenge, expiresAt: 'вчера' }), null);
    assert.deepEqual(session.sanitizeProfiles(null), {});
    const profiles = session.sanitizeProfiles({
      [EMAIL]: { name: 'Иван', cart: null, favorites: 'x', buyerType: 'alien' },
      'not-an-email': { name: 'x' },
      [OTHER]: null,
    });
    assert.deepEqual(Object.keys(profiles), [EMAIL]);
    assert.deepEqual(profiles[EMAIL], {
      name: 'Иван',
      phone: null,
      buyerType: 'person',
      companyName: null,
      inn: null,
      cart: [],
      promoCode: null,
      favorites: [],
    });
  });
});

describe('форма согласования: скидка и доставка числом (§3.9, §6.5)', () => {
  test('нераспознанная скидка — ошибка, а не тихий 0', () => {
    const ctx = makeCtx();
    const created = submit(orders.emptyOrdersData(), ctx);
    const ref = { number: created.order.number, email: EMAIL };
    const negotiation = orders.startNegotiation(created.data, ref, ctx());
    const draft = draftFor(negotiation.order);
    const discount = pricing.parseMoneyField('1 000 руб');
    const check = pricing.validateQuoteDraft({ ...draft, discount });
    assert.equal(check.ok, false);
    assert.deepEqual(
      check.errors.map((e) => [e.code, e.message]),
      [['discount-invalid', 'Введите сумму числом, например 1300']],
    );
    assert.equal(check.totals.total, check.totals.itemsTotal + 50000, 'итог не считает NaN');
    // Пустая скидка — это 0, ошибки нет.
    assert.ok(pricing.validateQuoteDraft({ ...draft, discount: pricing.parseMoneyField('') }).ok);
    const negative = pricing.validateQuoteDraft({ ...draft, discount: -100 });
    assert.equal(negative.errors[0].code, 'discount-negative');
    const delivery = pricing.validateQuoteDraft({ ...draft, delivery: Number.NaN });
    assert.equal(delivery.errors[0].code, 'delivery-invalid');
    const price = pricing.validateQuoteDraft({
      ...draft,
      lines: draft.lines.map((l) => ({ ...l, unitPrice: Number.NaN })),
    });
    assert.equal(price.errors[0].code, 'price-invalid');
  });
});

describe('показ данных покупателя', () => {
  test('телефон группами', () => {
    assert.equal(orders.formatPhone('+79001234567'), '+7 900 123-45-67');
    assert.equal(orders.formatPhone('79001234567'), '+7 900 123-45-67');
    assert.equal(orders.formatPhone('89001234567'), '8 900 123-45-67');
    assert.equal(orders.formatPhone('+442071234567'), '+442071234567', 'чужой формат — как есть');
    assert.equal(orders.formatPhone('12345'), '12345');
  });
});
