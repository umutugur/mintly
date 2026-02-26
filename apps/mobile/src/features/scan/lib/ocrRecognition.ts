export interface OcrRecognitionInput {
  frameText?: string | null;
  photoUri?: string;
  blocks?: unknown;
}

export interface OcrRecognitionResult {
  rawText: string;
  mode: 'vision' | 'fallback';
}

export interface OcrTextResult {
  text: string;
  blocks?: unknown;
}

export function normalizeOcrText(value: string | null | undefined): string {
  return value
    ?.replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join('\n')
    .trim() ?? '';
}

export function hasMeaningfulOcrText(value: string | null | undefined): boolean {
  return normalizeOcrText(value).length > 0;
}

export async function recognizeTextFromFrameOrPhoto(
  input: OcrRecognitionInput,
): Promise<OcrTextResult> {
  const normalized = normalizeOcrText(input.frameText);
  if (normalized.length > 0) {
    return {
      text: normalized,
      blocks: input.blocks,
    };
  }

  const source = input.photoUri ? 'photo' : 'frame';
  throw new Error(`OCR_EMPTY_TEXT:${source}`);
}

export async function recognizeReceiptText(input: OcrRecognitionInput): Promise<OcrRecognitionResult> {
  const result = await recognizeTextFromFrameOrPhoto(input);
  return {
    rawText: result.text,
    mode: 'vision',
  };
}
