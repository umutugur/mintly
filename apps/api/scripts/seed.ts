import { Types } from 'mongoose';
import { z } from 'zod';

import { hashPassword } from '../src/auth/passwords.js';
import { connectMongo, disconnectMongo } from '../src/db/mongo.js';
import {
  createNormalTransaction,
  createTransferPair,
  resolveActiveAccount,
  resolveActiveCategory,
  validateTransactionType,
} from '../src/lib/ledger.js';
import { AccountModel, type AccountDocument } from '../src/models/Account.js';
import { BudgetModel } from '../src/models/Budget.js';
import { CategoryModel, type CategoryDocument } from '../src/models/Category.js';
import { RefreshTokenModel } from '../src/models/RefreshToken.js';
import { RecurringRunLogModel } from '../src/models/RecurringRunLog.js';
import { RecurringRuleModel, type RecurringRuleDocument } from '../src/models/RecurringRule.js';
import { TransactionModel } from '../src/models/Transaction.js';
import { UpcomingPaymentModel } from '../src/models/UpcomingPayment.js';
import { UserModel } from '../src/models/User.js';

if ((process.env.NODE_ENV ?? 'development') !== 'production') {
  await import('dotenv/config');
}

const DEFAULT_DEMO_EMAIL = 'demo@finsight.dev';
const DEFAULT_DEMO_PASSWORD = 'Password123';
const DEFAULT_DEMO_NAME = 'Demo User';
const BASE_CURRENCY = 'TRY';

const envSchema = z.object({
  MONGODB_URI: z
    .string()
    .trim()
    .min(1, 'MONGODB_URI is required')
    .regex(/^mongodb(\+srv)?:\/\//, 'MONGODB_URI must be a valid MongoDB URI'),
  SEED_REFERENCE_DATE: z.string().trim().min(1).optional(),
  SEED_DEMO_EMAIL: z.string().trim().email('SEED_DEMO_EMAIL must be a valid email').optional(),
  SEED_DEMO_PASSWORD: z.string().min(8, 'SEED_DEMO_PASSWORD must be at least 8 characters').optional(),
  SEED_DEMO_NAME: z.string().trim().min(1, 'SEED_DEMO_NAME cannot be empty').max(120).optional(),
});

type CategoryName =
  | 'Food'
  | 'Transport'
  | 'Rent'
  | 'Bills'
  | 'Shopping'
  | 'Health'
  | 'Entertainment'
  | 'Salary'
  | 'Freelance'
  | 'Gift';

type ExpenseCategoryName =
  | 'Food'
  | 'Transport'
  | 'Rent'
  | 'Bills'
  | 'Shopping'
  | 'Health'
  | 'Entertainment';

type IncomeCategoryName = 'Salary' | 'Freelance' | 'Gift';

type AccountName = 'Cash' | 'Bank' | 'Card' | 'Savings';

interface MonthRef {
  year: number;
  monthIndex: number;
  monthKey: string;
  start: Date;
  endExclusive: Date;
}

interface RecurringRunResult {
  processedRules: number;
  processedRuns: number;
  generatedTransactions: number;
}

interface WeightedEntry<T> {
  value: T;
  weight: number;
}

interface RandomDateOptions {
  startDay?: number;
  endDay?: number;
  preferWeekday?: boolean;
  hourMin?: number;
  hourMax?: number;
}

interface SeedConfig {
  demoEmail: string;
  demoPassword: string;
  demoName: string;
  referenceDate: Date;
}

function createPrng(seed: number): () => number {
  let current = seed >>> 0;
  return () => {
    current = (current * 1664525 + 1013904223) >>> 0;
    return current / 4294967296;
  };
}

function pickOne<T>(rand: () => number, items: readonly T[]): T {
  const index = Math.floor(rand() * items.length);
  return items[Math.min(index, items.length - 1)] as T;
}

function weightedPick<T>(rand: () => number, entries: readonly WeightedEntry<T>[]): T {
  const total = entries.reduce((acc, entry) => acc + entry.weight, 0);
  let cursor = rand() * total;

  for (const entry of entries) {
    cursor -= entry.weight;
    if (cursor <= 0) {
      return entry.value;
    }
  }

  return entries[entries.length - 1]!.value;
}

function toMonthKey(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function daysInUtcMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

function shiftToWeekday(year: number, monthIndex: number, day: number): number {
  const maxDay = daysInUtcMonth(year, monthIndex);
  let candidate = Math.min(Math.max(day, 1), maxDay);
  let date = new Date(Date.UTC(year, monthIndex, candidate, 12, 0, 0, 0));

  if (date.getUTCDay() === 6) {
    candidate = candidate + 2 <= maxDay ? candidate + 2 : candidate - 1;
    date = new Date(Date.UTC(year, monthIndex, candidate, 12, 0, 0, 0));
  } else if (date.getUTCDay() === 0) {
    candidate = candidate + 1 <= maxDay ? candidate + 1 : candidate - 2;
    date = new Date(Date.UTC(year, monthIndex, candidate, 12, 0, 0, 0));
  }

  if (date.getUTCDay() === 6 || date.getUTCDay() === 0) {
    candidate = Math.min(Math.max(candidate - 1, 1), maxDay);
  }

  return candidate;
}

function randomOccurredAt(
  rand: () => number,
  month: MonthRef,
  options: RandomDateOptions = {},
): Date {
  const maxDay = daysInUtcMonth(month.year, month.monthIndex);
  const startDay = Math.min(Math.max(options.startDay ?? 1, 1), maxDay);
  const endDay = Math.min(Math.max(options.endDay ?? maxDay, startDay), maxDay);
  let day = startDay + Math.floor(rand() * (endDay - startDay + 1));

  if (options.preferWeekday ?? true) {
    const weekendBias = 0.8;
    const probe = new Date(Date.UTC(month.year, month.monthIndex, day, 12, 0, 0, 0));
    if ((probe.getUTCDay() === 6 || probe.getUTCDay() === 0) && rand() < weekendBias) {
      day = shiftToWeekday(month.year, month.monthIndex, day);
    }
  }

  const hourMin = options.hourMin ?? 8;
  const hourMax = options.hourMax ?? 22;
  const hour = hourMin + Math.floor(rand() * (hourMax - hourMin + 1));
  const minute = Math.floor(rand() * 60);

  return new Date(Date.UTC(month.year, month.monthIndex, day, hour, minute, 0, 0));
}

function monthRefFromOffset(now: Date, offset: number): MonthRef {
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1, 0, 0, 0, 0),
  );
  const endExclusive = new Date(
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1, 0, 0, 0, 0),
  );

  return {
    year: start.getUTCFullYear(),
    monthIndex: start.getUTCMonth(),
    monthKey: toMonthKey(start),
    start,
    endExclusive,
  };
}

function getLastSixMonths(now: Date): MonthRef[] {
  const months: MonthRef[] = [];
  for (let offset = 5; offset >= 0; offset -= 1) {
    months.push(monthRefFromOffset(now, offset));
  }
  return months;
}

function roundToNearestTen(amount: number): number {
  return Math.max(10, Math.round(amount / 10) * 10);
}

function randomAmount(rand: () => number, min: number, max: number): number {
  const value = min + rand() * (max - min);
  return roundToNearestTen(value);
}

function chooseAccountForExpense(rand: () => number, category: ExpenseCategoryName): AccountName {
  if (category === 'Rent') {
    return 'Bank';
  }
  if (category === 'Bills') {
    return weightedPick(rand, [
      { value: 'Bank' as const, weight: 0.75 },
      { value: 'Card' as const, weight: 0.25 },
    ]);
  }
  if (category === 'Food') {
    return weightedPick(rand, [
      { value: 'Card' as const, weight: 0.55 },
      { value: 'Cash' as const, weight: 0.3 },
      { value: 'Bank' as const, weight: 0.15 },
    ]);
  }
  if (category === 'Transport') {
    return weightedPick(rand, [
      { value: 'Cash' as const, weight: 0.5 },
      { value: 'Card' as const, weight: 0.4 },
      { value: 'Bank' as const, weight: 0.1 },
    ]);
  }
  if (category === 'Shopping') {
    return weightedPick(rand, [
      { value: 'Card' as const, weight: 0.7 },
      { value: 'Bank' as const, weight: 0.3 },
    ]);
  }
  if (category === 'Health') {
    return weightedPick(rand, [
      { value: 'Card' as const, weight: 0.5 },
      { value: 'Bank' as const, weight: 0.5 },
    ]);
  }

  return weightedPick(rand, [
    { value: 'Card' as const, weight: 0.55 },
    { value: 'Cash' as const, weight: 0.35 },
    { value: 'Bank' as const, weight: 0.1 },
  ]);
}

function chooseAccountForIncome(rand: () => number, category: IncomeCategoryName): AccountName {
  if (category === 'Gift') {
    return weightedPick(rand, [
      { value: 'Bank' as const, weight: 0.6 },
      { value: 'Cash' as const, weight: 0.4 },
    ]);
  }

  return weightedPick(rand, [
    { value: 'Bank' as const, weight: 0.85 },
    { value: 'Savings' as const, weight: 0.15 },
  ]);
}

function resolveSeedConfig(env: z.infer<typeof envSchema>): SeedConfig {
  const referenceDate = env.SEED_REFERENCE_DATE ? new Date(env.SEED_REFERENCE_DATE) : new Date();

  if (Number.isNaN(referenceDate.getTime())) {
    throw new Error('SEED_REFERENCE_DATE must be a valid ISO date');
  }

  return {
    demoEmail: env.SEED_DEMO_EMAIL ?? DEFAULT_DEMO_EMAIL,
    demoPassword: env.SEED_DEMO_PASSWORD ?? DEFAULT_DEMO_PASSWORD,
    demoName: env.SEED_DEMO_NAME ?? DEFAULT_DEMO_NAME,
    referenceDate,
  };
}

const expenseDescriptions: Record<ExpenseCategoryName, readonly string[]> = {
  Food: ['Öğle yemeği', 'Akşam yemeği', 'Market alışverişi', 'Kahve molası', 'Manav alışverişi'],
  Transport: ['Otobüs kart dolumu', 'Taksi ücreti', 'Metro geçişi', 'Yakıt alımı'],
  Rent: ['Aylık kira'],
  Bills: ['Elektrik faturası', 'Su faturası', 'İnternet faturası', 'Doğalgaz faturası'],
  Shopping: ['Online alışveriş', 'Giyim harcaması', 'Ev ihtiyacı', 'Kozmetik alışverişi'],
  Health: ['Eczane alışverişi', 'Doktor kontrolü', 'Laboratuvar ücreti'],
  Entertainment: ['Sinema bileti', 'Kafe buluşması', 'Konser bileti', 'Hafta sonu etkinliği'],
};

const incomeDescriptions: Record<IncomeCategoryName, readonly string[]> = {
  Salary: ['Maaş ödemesi'],
  Freelance: ['Freelance proje ödemesi', 'Danışmanlık geliri', 'Ek iş geliri'],
  Gift: ['Aile desteği', 'Doğum günü hediyesi', 'Nakit hediye'],
};

function scheduleAtDay(year: number, monthIndex: number, day: number, anchor: Date): Date {
  return new Date(
    Date.UTC(
      year,
      monthIndex,
      day,
      anchor.getUTCHours(),
      anchor.getUTCMinutes(),
      anchor.getUTCSeconds(),
      anchor.getUTCMilliseconds(),
    ),
  );
}

function ensureScheduleFields(
  cadence: 'weekly' | 'monthly',
  dayOfWeek: number | null | undefined,
  dayOfMonth: number | null | undefined,
): void {
  if (cadence === 'weekly' && (dayOfWeek === null || dayOfWeek === undefined)) {
    throw new Error('dayOfWeek is required for weekly recurring rules');
  }

  if (cadence === 'monthly' && (dayOfMonth === null || dayOfMonth === undefined)) {
    throw new Error('dayOfMonth is required for monthly recurring rules');
  }
}

function advanceNextRun(
  current: Date,
  cadence: 'weekly' | 'monthly',
  dayOfWeek: number | null,
  dayOfMonth: number | null,
): Date {
  ensureScheduleFields(cadence, dayOfWeek, dayOfMonth);

  if (cadence === 'weekly') {
    const next = new Date(current);
    next.setUTCDate(next.getUTCDate() + 7);
    return next;
  }

  return scheduleAtDay(
    current.getUTCFullYear(),
    current.getUTCMonth() + 1,
    dayOfMonth as number,
    current,
  );
}

function currentOrPreviousMonthSlot(now: Date, preferredDay: number, hour: number): Date {
  const day = Math.min(Math.max(preferredDay, 1), 28);
  let slot = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), day, hour, 0, 0, 0),
  );

  if (slot.getTime() > now.getTime()) {
    slot = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, day, hour, 0, 0, 0),
    );
  }

  return slot;
}

function previousOrCurrentWeekdaySlot(now: Date, dayOfWeek: number, hour: number): Date {
  const slot = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      hour,
      0,
      0,
      0,
    ),
  );
  const diff = (slot.getUTCDay() - dayOfWeek + 7) % 7;
  slot.setUTCDate(slot.getUTCDate() - diff);

  if (slot.getTime() > now.getTime()) {
    slot.setUTCDate(slot.getUTCDate() - 7);
  }

  return slot;
}

async function resetDemoUserData(email: string): Promise<void> {
  const existingUser = await UserModel.findOne({ email }).select('_id');
  if (!existingUser) {
    return;
  }

  const userId = existingUser._id;

  await Promise.all([
    RefreshTokenModel.deleteMany({ userId }),
    RecurringRunLogModel.deleteMany({ userId }),
    RecurringRuleModel.deleteMany({ userId }),
    BudgetModel.deleteMany({ userId }),
    TransactionModel.deleteMany({ userId }),
    UpcomingPaymentModel.deleteMany({ userId }),
    AccountModel.deleteMany({ userId }),
    CategoryModel.deleteMany({ userId }),
  ]);

  await UserModel.deleteOne({ _id: userId });
}

async function ensureGlobalCategories(): Promise<void> {
  const globalSeeds = [
    { name: 'General Expense', type: 'expense' as const, color: '#64748B', icon: 'receipt' },
    { name: 'General Income', type: 'income' as const, color: '#10B981', icon: 'wallet' },
  ];

  for (const seed of globalSeeds) {
    await CategoryModel.updateOne(
      { userId: null, name: seed.name, type: seed.type },
      {
        $set: {
          color: seed.color,
          icon: seed.icon,
          isSystem: true,
          deletedAt: null,
        },
        $setOnInsert: {
          userId: null,
          name: seed.name,
          type: seed.type,
        },
      },
      { upsert: true },
    );
  }
}

async function createDemoUser(config: SeedConfig): Promise<{ id: Types.ObjectId }> {
  const passwordHash = await hashPassword(config.demoPassword);
  const user = await UserModel.create({
    email: config.demoEmail,
    name: config.demoName,
    // Keep firebaseUid omitted for local/demo credentials flow.
    baseCurrency: BASE_CURRENCY,
    passwordHash,
  });

  return { id: user._id };
}

async function createAccounts(
  userId: Types.ObjectId,
): Promise<Record<AccountName, AccountDocument>> {
  const created = await AccountModel.insertMany([
    { userId, name: 'Cash', type: 'cash', currency: BASE_CURRENCY, deletedAt: null },
    { userId, name: 'Bank', type: 'bank', currency: BASE_CURRENCY, deletedAt: null },
    { userId, name: 'Card', type: 'credit', currency: BASE_CURRENCY, deletedAt: null },
    { userId, name: 'Savings', type: 'bank', currency: BASE_CURRENCY, deletedAt: null },
  ]);

  const map = new Map(created.map((account) => [account.name as AccountName, account]));
  return {
    Cash: map.get('Cash')!,
    Bank: map.get('Bank')!,
    Card: map.get('Card')!,
    Savings: map.get('Savings')!,
  };
}

async function createUserCategories(
  userId: Types.ObjectId,
): Promise<Record<CategoryName, CategoryDocument>> {
  const created = await CategoryModel.insertMany([
    { userId, name: 'Food', type: 'expense', color: '#F97316', icon: 'utensils', isSystem: false },
    { userId, name: 'Transport', type: 'expense', color: '#0EA5E9', icon: 'bus', isSystem: false },
    { userId, name: 'Rent', type: 'expense', color: '#8B5CF6', icon: 'home', isSystem: false },
    { userId, name: 'Bills', type: 'expense', color: '#EF4444', icon: 'receipt', isSystem: false },
    { userId, name: 'Shopping', type: 'expense', color: '#EC4899', icon: 'cart', isSystem: false },
    { userId, name: 'Health', type: 'expense', color: '#14B8A6', icon: 'heart', isSystem: false },
    {
      userId,
      name: 'Entertainment',
      type: 'expense',
      color: '#F59E0B',
      icon: 'ticket',
      isSystem: false,
    },
    { userId, name: 'Salary', type: 'income', color: '#22C55E', icon: 'wallet', isSystem: false },
    { userId, name: 'Freelance', type: 'income', color: '#16A34A', icon: 'briefcase', isSystem: false },
    { userId, name: 'Gift', type: 'income', color: '#4ADE80', icon: 'gift', isSystem: false },
  ]);

  const map = new Map(created.map((category) => [category.name as CategoryName, category]));
  return {
    Food: map.get('Food')!,
    Transport: map.get('Transport')!,
    Rent: map.get('Rent')!,
    Bills: map.get('Bills')!,
    Shopping: map.get('Shopping')!,
    Health: map.get('Health')!,
    Entertainment: map.get('Entertainment')!,
    Salary: map.get('Salary')!,
    Freelance: map.get('Freelance')!,
    Gift: map.get('Gift')!,
  };
}

async function createGeneratedTransactions(
  userId: Types.ObjectId,
  months: readonly MonthRef[],
  accounts: Record<AccountName, AccountDocument>,
  categories: Record<CategoryName, CategoryDocument>,
  rand: () => number,
): Promise<void> {
  async function addExpense(
    month: MonthRef,
    categoryName: ExpenseCategoryName,
    amount: number,
    options: RandomDateOptions = {},
    forcedDescription?: string,
    forcedAccount?: AccountName,
  ): Promise<void> {
    const accountName = forcedAccount ?? chooseAccountForExpense(rand, categoryName);
    const account = accounts[accountName];
    const category = categories[categoryName];

    await createNormalTransaction({
      userId,
      accountId: account._id,
      categoryId: category._id,
      type: 'expense',
      amount,
      currency: account.currency,
      description: forcedDescription ?? pickOne(rand, expenseDescriptions[categoryName]),
      occurredAt: randomOccurredAt(rand, month, options),
    });
  }

  async function addIncome(
    month: MonthRef,
    categoryName: IncomeCategoryName,
    amount: number,
    options: RandomDateOptions = {},
    forcedDescription?: string,
    forcedAccount?: AccountName,
  ): Promise<void> {
    const accountName = forcedAccount ?? chooseAccountForIncome(rand, categoryName);
    const account = accounts[accountName];
    const category = categories[categoryName];

    await createNormalTransaction({
      userId,
      accountId: account._id,
      categoryId: category._id,
      type: 'income',
      amount,
      currency: account.currency,
      description: forcedDescription ?? pickOne(rand, incomeDescriptions[categoryName]),
      occurredAt: randomOccurredAt(rand, month, options),
    });
  }

  for (const month of months) {
    await addIncome(
      month,
      'Salary',
      randomAmount(rand, 42000, 52000),
      { startDay: 1, endDay: 4, preferWeekday: true, hourMin: 9, hourMax: 12 },
      'Maaş ödemesi',
      'Bank',
    );

    if (rand() < 0.65) {
      await addIncome(
        month,
        'Freelance',
        randomAmount(rand, 3500, 16000),
        { startDay: 10, endDay: 26, preferWeekday: true, hourMin: 10, hourMax: 18 },
      );
    }

    if (rand() < 0.35) {
      await addIncome(
        month,
        'Gift',
        randomAmount(rand, 500, 5000),
        { startDay: 1, endDay: 28, preferWeekday: false, hourMin: 11, hourMax: 20 },
      );
    }

    await addExpense(
      month,
      'Rent',
      randomAmount(rand, 14000, 19000),
      { startDay: 1, endDay: 6, preferWeekday: true, hourMin: 9, hourMax: 12 },
      'Aylık kira',
      'Bank',
    );

    await addExpense(
      month,
      'Bills',
      randomAmount(rand, 500, 1700),
      { startDay: 4, endDay: 10, preferWeekday: true, hourMin: 9, hourMax: 19 },
      'Elektrik faturası',
      'Bank',
    );
    await addExpense(
      month,
      'Bills',
      randomAmount(rand, 250, 900),
      { startDay: 9, endDay: 16, preferWeekday: true, hourMin: 9, hourMax: 19 },
      'Su faturası',
      'Bank',
    );
    await addExpense(
      month,
      'Bills',
      randomAmount(rand, 300, 850),
      { startDay: 18, endDay: 26, preferWeekday: true, hourMin: 9, hourMax: 19 },
      'İnternet faturası',
      weightedPick(rand, [
        { value: 'Bank' as const, weight: 0.85 },
        { value: 'Card' as const, weight: 0.15 },
      ]),
    );

    const foodCount = 10 + Math.floor(rand() * 4);
    const transportCount = 7 + Math.floor(rand() * 3);
    const shoppingCount = 2 + Math.floor(rand() * 2);
    const healthCount = 1 + (rand() < 0.35 ? 1 : 0);
    const entertainmentCount = 1 + Math.floor(rand() * 2);

    for (let i = 0; i < foodCount; i += 1) {
      await addExpense(month, 'Food', randomAmount(rand, 70, 500), {
        startDay: 1,
        endDay: 28,
        preferWeekday: true,
      });
    }

    for (let i = 0; i < transportCount; i += 1) {
      await addExpense(month, 'Transport', randomAmount(rand, 35, 260), {
        startDay: 1,
        endDay: 28,
        preferWeekday: true,
      });
    }

    for (let i = 0; i < shoppingCount; i += 1) {
      await addExpense(month, 'Shopping', randomAmount(rand, 250, 3500), {
        startDay: 2,
        endDay: 28,
        preferWeekday: false,
      });
    }

    for (let i = 0; i < healthCount; i += 1) {
      await addExpense(month, 'Health', randomAmount(rand, 150, 1800), {
        startDay: 1,
        endDay: 28,
        preferWeekday: true,
      });
    }

    for (let i = 0; i < entertainmentCount; i += 1) {
      await addExpense(month, 'Entertainment', randomAmount(rand, 120, 1400), {
        startDay: 1,
        endDay: 28,
        preferWeekday: false,
      });
    }
  }
}

async function createTransfers(
  userId: Types.ObjectId,
  months: readonly MonthRef[],
  accounts: Record<AccountName, AccountDocument>,
  rand: () => number,
): Promise<void> {
  const transferPlan = [
    { from: 'Bank', to: 'Savings', base: 3500, description: 'Birikime aktarım' },
    { from: 'Bank', to: 'Cash', base: 1200, description: 'Nakit çekim' },
    { from: 'Bank', to: 'Card', base: 2200, description: 'Kart ödeme' },
    { from: 'Cash', to: 'Bank', base: 800, description: 'Nakit yatırma' },
    { from: 'Bank', to: 'Savings', base: 4200, description: 'Birikime aktarım' },
    { from: 'Bank', to: 'Cash', base: 1500, description: 'Nakit ihtiyacı' },
    { from: 'Savings', to: 'Bank', base: 2500, description: 'Tasarruftan dönüş' },
    { from: 'Bank', to: 'Savings', base: 3000, description: 'Aylık birikim' },
  ] as const satisfies readonly {
    from: AccountName;
    to: AccountName;
    base: number;
    description: string;
  }[];

  for (let i = 0; i < transferPlan.length; i += 1) {
    const plan = transferPlan[i]!;
    const month = months[i % months.length]!;

    const amount = randomAmount(rand, plan.base * 0.8, plan.base * 1.2);
    const occurredAt = randomOccurredAt(rand, month, {
      startDay: 3,
      endDay: 27,
      preferWeekday: true,
      hourMin: 9,
      hourMax: 18,
    });

    await createTransferPair({
      userId,
      fromAccountId: accounts[plan.from]._id,
      toAccountId: accounts[plan.to]._id,
      amount,
      occurredAt,
      description: plan.description,
    });
  }
}

async function ensureCurrentMonthBudgetSpend(
  userId: Types.ObjectId,
  currentMonth: MonthRef,
  accounts: Record<AccountName, AccountDocument>,
  categories: Record<CategoryName, CategoryDocument>,
): Promise<void> {
  const budgetCategories: readonly ExpenseCategoryName[] = ['Food', 'Transport', 'Shopping'];

  const fallbackAmounts: Record<ExpenseCategoryName, number> = {
    Food: 180,
    Transport: 90,
    Shopping: 650,
    Rent: 0,
    Bills: 0,
    Health: 0,
    Entertainment: 0,
  };

  for (const categoryName of budgetCategories) {
    const categoryId = categories[categoryName]._id;
    const existing = await TransactionModel.exists({
      userId,
      categoryId,
      type: 'expense',
      kind: 'normal',
      deletedAt: null,
      occurredAt: {
        $gte: currentMonth.start,
        $lt: currentMonth.endExclusive,
      },
    });

    if (existing) {
      continue;
    }

    const accountName = chooseAccountForExpense(() => 0.5, categoryName);
    const account = accounts[accountName];

    await createNormalTransaction({
      userId,
      accountId: account._id,
      categoryId,
      type: 'expense',
      amount: fallbackAmounts[categoryName],
      currency: account.currency,
      description: pickOne(() => 0.5, expenseDescriptions[categoryName]),
      occurredAt: new Date(
        Date.UTC(
          currentMonth.year,
          currentMonth.monthIndex,
          shiftToWeekday(currentMonth.year, currentMonth.monthIndex, 10),
          12,
          0,
          0,
          0,
        ),
      ),
    });
  }
}

async function createCurrentMonthBudgets(
  userId: Types.ObjectId,
  currentMonth: MonthRef,
  categories: Record<CategoryName, CategoryDocument>,
): Promise<void> {
  const budgetCategoryNames = ['Food', 'Transport', 'Shopping'] as const;
  const budgetCategoryIds = budgetCategoryNames.map((name) => categories[name]._id);
  const spentRows = await TransactionModel.aggregate<{ _id: Types.ObjectId; spentAmount: number }>([
    {
      $match: {
        userId,
        deletedAt: null,
        kind: 'normal',
        type: 'expense',
        categoryId: { $in: budgetCategoryIds },
        occurredAt: {
          $gte: currentMonth.start,
          $lt: currentMonth.endExclusive,
        },
      },
    },
    {
      $group: {
        _id: '$categoryId',
        spentAmount: { $sum: '$amount' },
      },
    },
  ]);

  const spentByCategoryId = new Map(
    spentRows.map((row) => [row._id.toString(), row.spentAmount]),
  );

  const baseLimits: Record<(typeof budgetCategoryNames)[number], number> = {
    Food: 9000,
    Transport: 3200,
    Shopping: 7000,
  };

  const budgetDocs = budgetCategoryNames.map((name) => {
    const category = categories[name];
    const spentAmount = spentByCategoryId.get(category._id.toString()) ?? 0;
    const limitAmount = Math.ceil(Math.max(spentAmount * 1.35, baseLimits[name]) / 50) * 50;

    return {
      userId,
      categoryId: category._id,
      month: currentMonth.monthKey,
      limitAmount,
      deletedAt: null,
    };
  });

  await BudgetModel.insertMany(budgetDocs);
}

function daysFromReference(now: Date, offsetDays: number, hour = 12): Date {
  const dueDate = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hour, 0, 0, 0),
  );
  dueDate.setUTCDate(dueDate.getUTCDate() + offsetDays);
  return dueDate;
}

async function createUpcomingPayments(userId: Types.ObjectId, now: Date): Promise<void> {
  await UpcomingPaymentModel.insertMany([
    {
      userId,
      title: 'Elektrik faturası',
      type: 'bill',
      amount: 1240,
      currency: BASE_CURRENCY,
      dueDate: daysFromReference(now, 2, 11),
      status: 'upcoming',
      source: 'manual',
      linkedTransactionId: null,
      recurringTemplateId: null,
      meta: null,
    },
    {
      userId,
      title: 'Spotify Family',
      type: 'subscription',
      amount: 110,
      currency: BASE_CURRENCY,
      dueDate: daysFromReference(now, 5, 9),
      status: 'upcoming',
      source: 'template',
      linkedTransactionId: null,
      recurringTemplateId: null,
      meta: {
        vendor: 'Spotify',
        invoiceNo: null,
        rawText: null,
        detectedCurrency: BASE_CURRENCY,
      },
    },
    {
      userId,
      title: 'Turk Telekom internet faturası',
      type: 'bill',
      amount: 690,
      currency: BASE_CURRENCY,
      dueDate: daysFromReference(now, 10, 14),
      status: 'upcoming',
      source: 'ocr',
      linkedTransactionId: null,
      recurringTemplateId: null,
      meta: {
        vendor: 'Turk Telekom',
        invoiceNo: 'TT-202603',
        rawText: 'Turk Telekom internet faturasi son odeme tarihi 11 Mart 2026.',
        detectedCurrency: BASE_CURRENCY,
      },
    },
    {
      userId,
      title: 'Site aidati',
      type: 'other',
      amount: 950,
      currency: BASE_CURRENCY,
      dueDate: daysFromReference(now, 17, 10),
      status: 'upcoming',
      source: 'manual',
      linkedTransactionId: null,
      recurringTemplateId: null,
      meta: null,
    },
    {
      userId,
      title: 'Kredi karti ekstresi',
      type: 'debt',
      amount: 8450,
      currency: BASE_CURRENCY,
      dueDate: daysFromReference(now, 28, 16),
      status: 'upcoming',
      source: 'ocr',
      linkedTransactionId: null,
      recurringTemplateId: null,
      meta: {
        vendor: 'Yapi Kredi',
        invoiceNo: 'CC-202603',
        rawText: 'Asgari odeme 28 Mart 2026.',
        detectedCurrency: BASE_CURRENCY,
      },
    },
    {
      userId,
      title: 'Su faturasi',
      type: 'bill',
      amount: 420,
      currency: BASE_CURRENCY,
      dueDate: daysFromReference(now, 35, 11),
      status: 'upcoming',
      source: 'manual',
      linkedTransactionId: null,
      recurringTemplateId: null,
      meta: null,
    },
    {
      userId,
      title: 'Netflix',
      type: 'subscription',
      amount: 230,
      currency: BASE_CURRENCY,
      dueDate: daysFromReference(now, 41, 9),
      status: 'upcoming',
      source: 'template',
      linkedTransactionId: null,
      recurringTemplateId: null,
      meta: {
        vendor: 'Netflix',
        invoiceNo: null,
        rawText: null,
        detectedCurrency: BASE_CURRENCY,
      },
    },
  ]);
}

function buildRecurringRules(
  userId: Types.ObjectId,
  now: Date,
  months: readonly MonthRef[],
  accounts: Record<AccountName, AccountDocument>,
  categories: Record<CategoryName, CategoryDocument>,
): Parameters<typeof RecurringRuleModel.insertMany>[0] {
  const rentSlot = currentOrPreviousMonthSlot(now, 3, 10);
  const transportSlot = previousOrCurrentWeekdaySlot(now, 1, 8);
  const transferSlot = currentOrPreviousMonthSlot(now, 8, 9);
  const seedStart = months[0]!.start;

  return [
    {
      userId,
      kind: 'normal',
      accountId: accounts.Bank._id,
      categoryId: categories.Rent._id,
      type: 'expense',
      fromAccountId: null,
      toAccountId: null,
      amount: 16500,
      description: 'Aylık kira (otomatik)',
      cadence: 'monthly',
      dayOfWeek: null,
      dayOfMonth: rentSlot.getUTCDate(),
      startAt: seedStart,
      endAt: null,
      nextRunAt: rentSlot,
      lastRunAt: null,
      isPaused: false,
      deletedAt: null,
    },
    {
      userId,
      kind: 'normal',
      accountId: accounts.Card._id,
      categoryId: categories.Transport._id,
      type: 'expense',
      fromAccountId: null,
      toAccountId: null,
      amount: 190,
      description: 'Haftalık ulaşım (otomatik)',
      cadence: 'weekly',
      dayOfWeek: 1,
      dayOfMonth: null,
      startAt: seedStart,
      endAt: null,
      nextRunAt: transportSlot,
      lastRunAt: null,
      isPaused: false,
      deletedAt: null,
    },
    {
      userId,
      kind: 'transfer',
      accountId: null,
      categoryId: null,
      type: null,
      fromAccountId: accounts.Bank._id,
      toAccountId: accounts.Savings._id,
      amount: 3000,
      description: 'Aylık birikim transferi (otomatik)',
      cadence: 'monthly',
      dayOfWeek: null,
      dayOfMonth: transferSlot.getUTCDate(),
      startAt: seedStart,
      endAt: null,
      nextRunAt: transferSlot,
      lastRunAt: null,
      isPaused: false,
      deletedAt: null,
    },
  ];
}

async function executeSingleRecurringRun(
  rule: RecurringRuleDocument,
): Promise<Types.ObjectId[]> {
  const scheduledAt = new Date(rule.nextRunAt);

  if (rule.kind === 'normal') {
    if (!rule.accountId || !rule.categoryId || !rule.type) {
      throw new Error(`Recurring rule ${rule.id} is missing account/category/type`);
    }

    const [account, category] = await Promise.all([
      resolveActiveAccount(rule.userId, rule.accountId),
      resolveActiveCategory(rule.userId, rule.categoryId),
    ]);
    validateTransactionType(category.type, rule.type);

    const transaction = await createNormalTransaction({
      userId: rule.userId,
      accountId: account._id,
      categoryId: category._id,
      type: rule.type,
      amount: rule.amount,
      currency: account.currency,
      description: rule.description ?? null,
      occurredAt: scheduledAt,
    });

    return [transaction._id];
  }

  if (!rule.fromAccountId || !rule.toAccountId) {
    throw new Error(`Recurring transfer rule ${rule.id} is missing from/to account`);
  }

  const transfer = await createTransferPair({
    userId: rule.userId,
    fromAccountId: rule.fromAccountId,
    toAccountId: rule.toAccountId,
    amount: rule.amount,
    occurredAt: scheduledAt,
    description: rule.description ?? null,
  });

  return [transfer.fromTransaction._id, transfer.toTransaction._id];
}

async function runDueRecurringOnce(
  userId: Types.ObjectId,
  now: Date,
): Promise<RecurringRunResult> {
  const dueRules = await RecurringRuleModel.find({
    userId,
    deletedAt: null,
    isPaused: false,
    nextRunAt: { $lte: now },
  }).sort({ nextRunAt: 1, _id: 1 });

  let processedRules = 0;
  let processedRuns = 0;
  let generatedTransactions = 0;

  for (const rule of dueRules) {
    processedRules += 1;
    const scheduledAt = new Date(rule.nextRunAt);

    if (rule.endAt && scheduledAt.getTime() > rule.endAt.getTime()) {
      rule.isPaused = true;
      await rule.save();
      continue;
    }

    const existingRun = await RecurringRunLogModel.findOne({
      ruleId: rule._id,
      scheduledAt,
    });

    if (existingRun) {
      continue;
    }

    const generatedIds = await executeSingleRecurringRun(rule);

    await RecurringRunLogModel.create({
      ruleId: rule._id,
      userId: rule.userId,
      scheduledAt,
      generatedTransactionIds: generatedIds,
    });

    processedRuns += 1;
    generatedTransactions += generatedIds.length;

    rule.lastRunAt = scheduledAt;
    rule.nextRunAt = advanceNextRun(
      scheduledAt,
      rule.cadence,
      rule.dayOfWeek ?? null,
      rule.dayOfMonth ?? null,
    );

    if (rule.endAt && rule.nextRunAt.getTime() > rule.endAt.getTime()) {
      rule.isPaused = true;
    }

    await rule.save();
  }

  return {
    processedRules,
    processedRuns,
    generatedTransactions,
  };
}

async function run(): Promise<void> {
  const env = envSchema.parse(process.env);
  const config = resolveSeedConfig(env);
  await connectMongo(env.MONGODB_URI);

  const now = config.referenceDate;
  const months = getLastSixMonths(now);
  const rand = createPrng(20260217);

  await resetDemoUserData(config.demoEmail);
  await ensureGlobalCategories();

  const user = await createDemoUser(config);
  const accounts = await createAccounts(user.id);
  const categories = await createUserCategories(user.id);

  await createGeneratedTransactions(user.id, months, accounts, categories, rand);
  await createTransfers(user.id, months, accounts, rand);

  const recurringSeedDocs = buildRecurringRules(user.id, now, months, accounts, categories);
  await RecurringRuleModel.insertMany(recurringSeedDocs);
  const recurringRun = await runDueRecurringOnce(user.id, now);

  const currentMonth = months[months.length - 1]!;
  await ensureCurrentMonthBudgetSpend(user.id, currentMonth, accounts, categories);
  await createCurrentMonthBudgets(user.id, currentMonth, categories);
  await createUpcomingPayments(user.id, now);

  const [accountsCount, categoriesCount, transactionsCount, budgetsCount, recurringCount, upcomingCount] =
    await Promise.all([
      AccountModel.countDocuments({ userId: user.id, deletedAt: null }),
      CategoryModel.countDocuments({ userId: user.id, deletedAt: null }),
      TransactionModel.countDocuments({ userId: user.id, deletedAt: null }),
      BudgetModel.countDocuments({ userId: user.id, deletedAt: null }),
      RecurringRuleModel.countDocuments({ userId: user.id, deletedAt: null }),
      UpcomingPaymentModel.countDocuments({ userId: user.id, status: 'upcoming' }),
    ]);

  const transferGroupIds = await TransactionModel.distinct('transferGroupId', {
    userId: user.id,
    kind: 'transfer',
    deletedAt: null,
    transferGroupId: { $ne: null },
  });

  console.log('Seed complete.');
  console.log(`Demo login: ${config.demoEmail} / ${config.demoPassword}`);
  console.log(`reference date: ${now.toISOString()}`);
  console.log(`accounts: ${accountsCount}`);
  console.log(`categories: ${categoriesCount}`);
  console.log(`transactions: ${transactionsCount}`);
  console.log(`budgets: ${budgetsCount}`);
  console.log(`transfers: ${transferGroupIds.length}`);
  console.log(`recurring rules: ${recurringCount}`);
  console.log(`upcoming payments: ${upcomingCount}`);
  console.log(
    `recurring run: processedRules=${recurringRun.processedRules}, processedRuns=${recurringRun.processedRuns}, generatedTransactions=${recurringRun.generatedTransactions}`,
  );
}

run()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectMongo();
  });
