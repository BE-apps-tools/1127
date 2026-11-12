import { describe, it, expect } from 'vitest';
import schemaFile from '../../contracts/extraction.schema.json';
import { toStructuredSchema } from '@/server/ai/anthropic';

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

function walk(n: Json, visit: (o: { [k: string]: Json }) => void) {
  if (Array.isArray(n)) n.forEach((x) => walk(x, visit));
  else if (n && typeof n === 'object') {
    visit(n);
    Object.values(n).forEach((x) => walk(x, visit));
  }
}

describe('toStructuredSchema', () => {
  const out = toStructuredSchema(schemaFile as unknown as Json);

  it('removes $comment and type arrays but keeps every property name', () => {
    let comments = 0;
    let typeArrays = 0;
    walk(out, (o) => {
      if ('$comment' in o) comments++;
      if (Array.isArray(o.type)) typeArrays++;
    });
    expect(comments).toBe(0);
    expect(typeArrays).toBe(0);
    const form = (out as { properties: { form: { properties: Record<string, Json> } } }).properties.form.properties;
    expect(Object.keys(form)).toEqual(Object.keys((schemaFile as { properties: { form: { properties: object } } }).properties.form.properties));
  });

  it('turns a nullable string into anyOf string|null and keeps the description', () => {
    const crew = (out as { properties: { form: { properties: { crew_code: Json } } } }).properties.form.properties.crew_code as { [k: string]: Json };
    expect(crew.anyOf).toEqual([{ type: 'string' }, { type: 'null' }]);
    expect(typeof crew.description).toBe('string');
  });
});
