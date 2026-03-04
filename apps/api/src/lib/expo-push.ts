const EXPO_PUSH_ENDPOINT = 'https://exp.host/--/api/v2/push/send';
const EXPO_RECEIPT_ENDPOINT = 'https://exp.host/--/api/v2/push/getReceipts';
const EXPO_PUSH_CHUNK_SIZE = 100;
const EXPO_RECEIPT_CHUNK_SIZE = 300;

interface ExpoPushTicketEntry {
  status?: string;
  id?: string;
  message?: string;
  details?: Record<string, unknown> | null;
}

interface ExpoPushReceiptEntry {
  status?: string;
  message?: string;
  details?: Record<string, unknown> | null;
}

export interface ExpoPushTokenRecord {
  token?: string | null;
  updatedAt?: Date | string | null;
  lastUsedAt?: Date | string | null;
}

export interface ExpoPushMessageInput {
  token: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export interface ExpoPushTicketResult {
  token: string;
  status: 'ok' | 'error';
  ticketId: string | null;
  error: string | null;
}

export interface ExpoPushReceiptResult {
  ticketId: string;
  status: 'ok' | 'error' | 'pending';
  error: string | null;
}

export interface ExpoPushSendResult {
  acceptedCount: number;
  tickets: ExpoPushTicketResult[];
  receipts: ExpoPushReceiptResult[];
}

function chunkArray<T>(values: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];

  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size) as T[]);
  }

  return chunks;
}

function extractExpoError(
  entry: Pick<ExpoPushTicketEntry, 'message' | 'details'> | Pick<ExpoPushReceiptEntry, 'message' | 'details'> | null,
): string | null {
  if (!entry) {
    return null;
  }

  const detailsError = entry.details?.error;
  if (typeof detailsError === 'string' && detailsError.trim().length > 0) {
    return detailsError.trim();
  }

  if (typeof entry.message === 'string' && entry.message.trim().length > 0) {
    return entry.message.trim();
  }

  return null;
}

function parseJsonSafely(value: string): unknown {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function normalizeTicketEntries(
  payload: unknown,
  expectedCount: number,
): Array<ExpoPushTicketEntry | null> {
  if (!payload || typeof payload !== 'object' || !('data' in payload)) {
    return Array.from({ length: expectedCount }, () => null);
  }

  const data = (payload as { data?: unknown }).data;
  if (Array.isArray(data)) {
    return Array.from({ length: expectedCount }, (_, index) => {
      const entry = data[index];
      return entry && typeof entry === 'object' ? (entry as ExpoPushTicketEntry) : null;
    });
  }

  if (expectedCount === 1 && data && typeof data === 'object') {
    return [data as ExpoPushTicketEntry];
  }

  return Array.from({ length: expectedCount }, () => null);
}

function readTimestamp(value: Date | string | null | undefined): number {
  if (!value) {
    return 0;
  }

  if (value instanceof Date) {
    return value.getTime();
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

export function isExpoPushToken(value: string): boolean {
  return /^(Exponent|Expo)PushToken\[[^\]]+\]$/.test(value.trim());
}

export function pickLatestExpoPushToken(
  tokens: ExpoPushTokenRecord[] | null | undefined,
): string | null {
  const values = Array.isArray(tokens) ? tokens : [];
  let bestToken: string | null = null;
  let bestUpdatedAt = 0;

  for (const tokenEntry of values) {
    const rawToken = typeof tokenEntry.token === 'string' ? tokenEntry.token.trim() : '';
    if (!rawToken || !isExpoPushToken(rawToken)) {
      continue;
    }

    const nextUpdatedAt = Math.max(
      readTimestamp(tokenEntry.lastUsedAt ?? null),
      readTimestamp(tokenEntry.updatedAt ?? null),
    );

    if (!bestToken || nextUpdatedAt >= bestUpdatedAt) {
      bestToken = rawToken;
      bestUpdatedAt = nextUpdatedAt;
    }
  }

  return bestToken;
}

async function fetchExpoReceipts(ticketIds: string[]): Promise<ExpoPushReceiptResult[]> {
  if (ticketIds.length === 0) {
    return [];
  }

  const receipts: ExpoPushReceiptResult[] = [];

  for (const ticketChunk of chunkArray(ticketIds, EXPO_RECEIPT_CHUNK_SIZE)) {
    try {
      const response = await fetch(EXPO_RECEIPT_ENDPOINT, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Accept-Encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ids: ticketChunk,
        }),
      });
      const rawBody = await response.text();
      const parsed = parseJsonSafely(rawBody);

      console.log('PUSH RECEIPT', {
        status: response.status,
        ok: response.ok,
        response: parsed,
      });

      if (!response.ok) {
        for (const ticketId of ticketChunk) {
          const receiptResult: ExpoPushReceiptResult = {
            ticketId,
            status: 'pending',
            error: `HTTP_${response.status}`,
          };
          console.log('PUSH RECEIPT STATUS', receiptResult);
          receipts.push(receiptResult);
        }
        continue;
      }

      const data =
        parsed && typeof parsed === 'object' && 'data' in parsed && (parsed as { data?: unknown }).data
          ? ((parsed as { data: Record<string, unknown> }).data ?? {})
          : {};

      for (const ticketId of ticketChunk) {
        const entry =
          data && typeof data === 'object' && ticketId in data
            ? (data[ticketId] as ExpoPushReceiptEntry)
            : null;

        const receiptResult: ExpoPushReceiptResult =
          entry?.status === 'ok'
            ? {
                ticketId,
                status: 'ok',
                error: null,
              }
            : entry?.status === 'error'
              ? {
                  ticketId,
                  status: 'error',
                  error: extractExpoError(entry) ?? 'receipt_error',
                }
              : {
                  ticketId,
                  status: 'pending',
                  error: null,
                };

        console.log('PUSH RECEIPT STATUS', receiptResult);
        receipts.push(receiptResult);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'unknown_error';

      for (const ticketId of ticketChunk) {
        const receiptResult: ExpoPushReceiptResult = {
          ticketId,
          status: 'pending',
          error: errorMessage,
        };
        console.log('PUSH RECEIPT STATUS', receiptResult);
        receipts.push(receiptResult);
      }
    }
  }

  return receipts;
}

export async function sendExpoPushNotifications(
  messages: ExpoPushMessageInput[],
): Promise<ExpoPushSendResult> {
  if (messages.length === 0) {
    return {
      acceptedCount: 0,
      tickets: [],
      receipts: [],
    };
  }

  const tickets: ExpoPushTicketResult[] = [];
  const ticketIds: string[] = [];

  for (const messageChunk of chunkArray(messages, EXPO_PUSH_CHUNK_SIZE)) {
    try {
      const response = await fetch(EXPO_PUSH_ENDPOINT, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Accept-Encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(
          messageChunk.map((message) => ({
            to: message.token,
            title: message.title,
            body: message.body,
            sound: 'default',
            priority: 'high',
            channelId: 'default',
            data: message.data ?? undefined,
          })),
        ),
      });
      const rawBody = await response.text();
      const parsed = parseJsonSafely(rawBody);

      console.log('PUSH SEND RESPONSE', {
        status: response.status,
        ok: response.ok,
        response: parsed,
      });

      if (!response.ok) {
        for (const message of messageChunk) {
          const ticketResult: ExpoPushTicketResult = {
            token: message.token,
            status: 'error',
            ticketId: null,
            error: `HTTP_${response.status}`,
          };
          console.log('PUSH TICKET STATUS', ticketResult);
          tickets.push(ticketResult);
        }
        continue;
      }

      const normalizedEntries = normalizeTicketEntries(parsed, messageChunk.length);

      for (const [index, message] of messageChunk.entries()) {
        const entry = normalizedEntries[index];
        const ticketResult: ExpoPushTicketResult =
          entry?.status === 'ok'
            ? {
                token: message.token,
                status: 'ok',
                ticketId: typeof entry.id === 'string' ? entry.id : null,
                error: null,
              }
            : {
                token: message.token,
                status: 'error',
                ticketId: null,
                error: extractExpoError(entry) ?? 'ticket_error',
              };

        if (ticketResult.ticketId) {
          ticketIds.push(ticketResult.ticketId);
        }

        console.log('PUSH TICKET STATUS', ticketResult);
        tickets.push(ticketResult);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'unknown_error';

      for (const message of messageChunk) {
        const ticketResult: ExpoPushTicketResult = {
          token: message.token,
          status: 'error',
          ticketId: null,
          error: errorMessage,
        };
        console.log('PUSH TICKET STATUS', ticketResult);
        tickets.push(ticketResult);
      }
    }
  }

  const receipts = await fetchExpoReceipts(ticketIds);

  return {
    acceptedCount: tickets.reduce((count, ticket) => count + (ticket.status === 'ok' ? 1 : 0), 0),
    tickets,
    receipts,
  };
}
