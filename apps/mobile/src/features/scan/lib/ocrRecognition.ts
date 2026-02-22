import MlkitOcr, { type MlkitOcrResult } from 'react-native-mlkit-ocr';

function stableHash(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function buildFallbackOcrText(uri: string): string {
  const hash = stableHash(uri);
  const merchants = ['Migros', 'Carrefour', 'A101', 'Bim', 'Starbucks', 'Shell'];
  const merchant = merchants[hash % merchants.length] ?? 'Market';

  const amount = ((hash % 48000) / 100 + 50).toFixed(2);
  const day = String((hash % 25) + 1).padStart(2, '0');
  const month = String((hash % 12) + 1).padStart(2, '0');
  const year = 2026;

  const includeDueDate = hash % 2 === 0;
  const dueDay = String(((hash + 4) % 27) + 1).padStart(2, '0');

  return includeDueDate
    ? `${merchant}\nTOPLAM ${amount} TL\nTarih ${day}.${month}.${year}\nSon Odeme ${dueDay}.${month}.${year}`
    : `${merchant}\nTOPLAM ${amount} TL\nTarih ${day}.${month}.${year}`;
}

function flattenOcrResult(result: MlkitOcrResult): string {
  const lines: string[] = [];

  for (const block of result) {
    for (const line of block.lines ?? []) {
      const value = line.text?.trim();
      if (value) {
        lines.push(value);
      }
    }
  }

  return lines.join('\n').trim();
}

export interface OcrRecognitionResult {
  rawText: string;
  mode: 'mlkit' | 'fallback';
}

export async function recognizeReceiptText(photoUri: string): Promise<OcrRecognitionResult> {
  try {
    const result = await MlkitOcr.detectFromUri(photoUri);
    const flattened = flattenOcrResult(result);
    if (flattened.length > 0) {
      return {
        rawText: flattened,
        mode: 'mlkit',
      };
    }
  } catch {
    // Fallback keeps scan flow available in Expo Go where native OCR module is unavailable.
  }

  return {
    rawText: buildFallbackOcrText(photoUri),
    mode: 'fallback',
  };
}
