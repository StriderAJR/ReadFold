import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { componentDictionarySchema, validateComponentReferences } from './components';
import { kanjiSchema } from './content';

const part = { id: 'ja:component:roof', form: 'крыша', name: 'крыша', mnemonic: 'Две скатные линии укрывают дом.', components: [] };

describe('visual component dictionary', () => {
  it('stores reusable images separately from kanji and their readings', () => {
    expect(componentDictionarySchema.parse([part])).toEqual([part]);
    expect(kanjiSchema.safeParse(part).success).toBe(false);
    expect(componentDictionarySchema.safeParse([{ ...part, on: ['オン'] }]).success).toBe(false);
  });

  it('rejects duplicate identities, dangling references, unreadable forms and cycles', () => {
    expect(componentDictionarySchema.safeParse([part, part]).success).toBe(false);
    expect(componentDictionarySchema.safeParse([part, { ...part, id: 'ja:component:other' }]).success).toBe(false);
    expect(componentDictionarySchema.safeParse([{ ...part, components: ['missing'] }]).success).toBe(false);
    expect(componentDictionarySchema.safeParse([{ ...part, form: '\uE000' }]).success).toBe(false);
    const child = { ...part, id: 'ja:component:house', form: 'дом', components: ['крыша'] };
    expect(componentDictionarySchema.safeParse([{ ...part, components: ['дом'] }, child]).success).toBe(false);
    expect(componentDictionarySchema.safeParse([part, child]).success).toBe(true);
  });

  it('resolves all shipped kanji parts through the separate dictionary', () => {
    const parts = componentDictionarySchema.parse(JSON.parse(readFileSync('content/ja/dictionary/components.json', 'utf8')));
    const kanji = kanjiSchema.parse(JSON.parse(readFileSync('content/ja/dictionary/kanji/想.json', 'utf8')));
    expect(() => validateComponentReferences([kanji], parts)).not.toThrow();
    expect(() => validateComponentReferences([{ ...kanji, components: ['нет такой части'] }], parts)).toThrow('Unknown component');
  });
});
