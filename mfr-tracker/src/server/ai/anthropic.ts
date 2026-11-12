import Anthropic from '@anthropic-ai/sdk';
import schemaFile from '../../../contracts/extraction.schema.json';
import { ExtractionResultSchema, type ExtractionResult } from '@/domain/extraction';
import { USER_TEXT } from './prompt';
import { ExtractionError, type AiExtractor } from './types';

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

/**
 * The contract schema uses `"type": ["string", "null"]` and a `$comment`. The structured-output API documents
 * `anyOf` and rejects unknown keywords, so type arrays become `anyOf` and `$comment` is dropped.
 * Field names, types and meanings are unchanged.
 */
export function toStructuredSchema(node: Json): Json {
  if (Array.isArray(node)) return node.map(toStructuredSchema);
  if (node === null || typeof node !== 'object') return node;
  const out: { [k: string]: Json } = {};
  for (const [k, v] of Object.entries(node)) {
    if (k === '$comment') continue;
    out[k] = toStructuredSchema(v);
  }
  if (Array.isArray(out.type)) {
    const types = out.type as string[];
    const { type: _type, description, ...rest } = out;
    void _type;
    return { ...(description !== undefined ? { description } : {}), anyOf: types.map((t) => ({ type: t, ...rest })) };
  }
  return out;
}

const SCHEMA = toStructuredSchema(schemaFile as unknown as Json) as { [k: string]: Json };

function stripFences(text: string): string {
  const t = text.trim();
  const m = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(t);
  return m ? m[1] : t;
}

function parseResult(text: string): ExtractionResult {
  let raw: unknown;
  try {
    raw = JSON.parse(stripFences(text));
  } catch {
    throw new ExtractionError('The model reply was not valid JSON.');
  }
  const parsed = ExtractionResultSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ExtractionError(`The model reply did not match the expected shape: ${parsed.error.issues[0]?.message ?? 'invalid'}.`);
  }
  return parsed.data;
}

const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64');

export function createAnthropicExtractor(apiKey: string, model: string): AiExtractor {
  const client = new Anthropic({ apiKey, timeout: 55_000, maxRetries: 1 });

  async function call(system: string, images: Uint8Array[], userText: string, structured: boolean): Promise<string> {
    const content: Anthropic.ContentBlockParam[] = [
      ...images.map(
        (img): Anthropic.ContentBlockParam => ({
          type: 'image',
          source: { type: 'base64', media_type: 'image/jpeg', data: b64(img) },
        }),
      ),
      { type: 'text', text: userText },
    ];
    const res = await client.messages.create({
      model,
      max_tokens: 4000,
      system,
      messages: [{ role: 'user', content }],
      ...(structured ? { output_config: { format: { type: 'json_schema' as const, schema: SCHEMA } } } : {}),
    });
    if (res.stop_reason === 'max_tokens') throw new ExtractionError('The model reply was cut off.');
    const block = res.content.find((b): b is Anthropic.TextBlock => b.type === 'text');
    if (!block) throw new ExtractionError('The model returned no text.');
    return block.text;
  }

  return {
    enabled: true,
    modelId: model,
    async extract({ system, full, detail }) {
      const images = detail ? [full, detail] : [full];
      try {
        return parseResult(await call(system, images, USER_TEXT, true));
      } catch (first) {
        // Retry once without structured output: JSON only, matching the schema, in the user text.
        const schemaRejected = first instanceof Anthropic.BadRequestError;
        if (!schemaRejected && !(first instanceof ExtractionError)) throw first;
        try {
          const text = `${USER_TEXT}\n\nReply with JSON only, matching this schema. No prose, no code fences.\n${JSON.stringify(SCHEMA)}`;
          return parseResult(await call(system, images, text, false));
        } catch (second) {
          if (second instanceof ExtractionError) throw second;
          const msg = second instanceof Error ? second.message : 'unknown error';
          throw new ExtractionError(`The AI request failed: ${msg.slice(0, 200)}`);
        }
      }
    },
  };
}
