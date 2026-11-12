import type { AiExtractor } from './types';

export function createOffExtractor(): AiExtractor {
  return {
    enabled: false,
    modelId: 'off',
    async extract() {
      throw new Error('AI reading is switched off.');
    },
  };
}
