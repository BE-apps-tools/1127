import type { ExtractionResult } from '@/domain/extraction';

export interface AiExtractor {
  readonly enabled: boolean;
  /** 'off', 'mock', or the Anthropic model id. */
  readonly modelId: string;
  extract(input: { system: string; full: Uint8Array; detail: Uint8Array | null }): Promise<ExtractionResult>;
}

export class ExtractionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExtractionError';
  }
}
