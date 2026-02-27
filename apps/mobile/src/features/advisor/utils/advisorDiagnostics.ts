import { useSyncExternalStore } from 'react';

type JsonObject = Record<string, unknown>;

interface AdvisorDebugEventInput {
  event: string;
  payload: JsonObject;
}

export interface AdvisorDebugEvent {
  timestamp: string;
  seq: number;
  event: string;
  payload: JsonObject;
}

const REDACTED_VALUE = '[redacted]';
const REDACT_KEYS = ['token', 'authorization', 'email', 'apikey', 'api_key'];
const MAX_DEBUG_EVENTS = 50;
const MAX_RESERVED_REQUEST_AGE_MS = 5 * 60_000;
let debugEventSeq = 0;
const debugEventBuffer: AdvisorDebugEvent[] = [];
let debugEventsSnapshot: AdvisorDebugEvent[] = [];
interface AdvisorRequestReservation {
  requestId: string;
  month: string | null;
  language: string | null;
  regenerate: boolean | null;
  createdAtMs: number;
}
const debugListeners = new Set<() => void>();
const reservedAdvisorRequestIds: AdvisorRequestReservation[] = [];

function isRecord(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function shouldRedactKey(key: string): boolean {
  const lowered = key.toLowerCase();
  return REDACT_KEYS.some((redactKey) => lowered.includes(redactKey));
}

function redactValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item));
  }

  if (!isRecord(value)) {
    return value;
  }

  const redacted: JsonObject = {};
  for (const [key, nestedValue] of Object.entries(value)) {
    if (shouldRedactKey(key)) {
      redacted[key] = REDACTED_VALUE;
      continue;
    }

    redacted[key] = redactValue(nestedValue);
  }

  return redacted;
}

function notifyDebugListeners(): void {
  for (const listener of debugListeners) {
    listener();
  }
}

function sanitizePayload(payload: JsonObject): JsonObject {
  const safePayload = redactValue(payload);
  return isRecord(safePayload) ? safePayload : {};
}

function cleanupReservedRequestIds(nowMs = Date.now()): void {
  for (let index = reservedAdvisorRequestIds.length - 1; index >= 0; index -= 1) {
    const item = reservedAdvisorRequestIds[index];
    if (!item || nowMs - item.createdAtMs > MAX_RESERVED_REQUEST_AGE_MS) {
      reservedAdvisorRequestIds.splice(index, 1);
    }
  }
}

export function createAdvisorRequestId(): string {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function reserveAdvisorRequestId(input: {
  requestId: string;
  month?: string | null;
  language?: string | null;
  regenerate?: boolean | null;
}): void {
  const requestId = input.requestId.trim();
  if (requestId.length === 0) {
    return;
  }

  cleanupReservedRequestIds();
  reservedAdvisorRequestIds.push({
    requestId,
    month: input.month ?? null,
    language: input.language ?? null,
    regenerate: input.regenerate ?? null,
    createdAtMs: Date.now(),
  });
}

export function consumeReservedAdvisorRequestId(input: {
  month?: string | null;
  language?: string | null;
  regenerate?: boolean | null;
}): string | null {
  cleanupReservedRequestIds();

  const month = input.month ?? null;
  const language = input.language ?? null;
  const regenerate = input.regenerate ?? null;
  const matchedIndex = reservedAdvisorRequestIds.findIndex((entry) => (
    entry.month === month
    && entry.language === language
    && entry.regenerate === regenerate
  ));

  if (matchedIndex === -1) {
    return null;
  }

  const matched = reservedAdvisorRequestIds.splice(matchedIndex, 1)[0];
  return matched?.requestId ?? null;
}

export function pushAdvisorEvent(input: AdvisorDebugEventInput): void {
  const nextEvent: AdvisorDebugEvent = {
    timestamp: new Date().toISOString(),
    seq: (debugEventSeq += 1),
    event: input.event,
    payload: sanitizePayload(input.payload),
  };

  if (debugEventBuffer.length >= MAX_DEBUG_EVENTS) {
    debugEventBuffer.shift();
  }
  debugEventBuffer.push(nextEvent);
  debugEventsSnapshot = debugEventBuffer.slice();
  notifyDebugListeners();
}

export function logAdvisorReq(event: string, payload: JsonObject): void {
  const safePayload = sanitizePayload(payload);
  pushAdvisorEvent({ event, payload: safePayload });
  console.log('[advisor][diag]', event, JSON.stringify(safePayload));
}

function subscribeDebugEvents(listener: () => void): () => void {
  debugListeners.add(listener);
  return () => {
    debugListeners.delete(listener);
  };
}

function getDebugEventsSnapshot(): AdvisorDebugEvent[] {
  return debugEventsSnapshot;
}

export function useAdvisorDebugEvents(): AdvisorDebugEvent[] {
  return useSyncExternalStore(
    subscribeDebugEvents,
    getDebugEventsSnapshot,
    () => debugEventsSnapshot,
  );
}

export function clearAdvisorDebugEvents(): void {
  debugEventBuffer.splice(0, debugEventBuffer.length);
  debugEventsSnapshot = [];
  notifyDebugListeners();
}
