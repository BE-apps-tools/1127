import fixture from '../../../tests/fixtures/extraction/B-001.json';
import { ExtractionResultSchema } from '@/domain/extraction';
import type { AiExtractor } from './types';

/** Returns the B-001 worked example for every page. The JSON is imported statically so it ships in the build. */
export function createMockExtractor(): AiExtractor {
  return {
    enabled: true,
    modelId: 'mock',
    async extract() {
      return ExtractionResultSchema.parse(structuredClone(fixture));
    },
  };
}
