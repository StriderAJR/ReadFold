import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dictionaryIndexSchema, dictionarySchema, grammarShardSchema, kanjiShardSchema, wordShardSchema } from './content';
import { buildQuiz, checkAnswer } from './quiz';
const read = (path: string) => JSON.parse(readFileSync(`.local-tools/content/${path}`, 'utf8'));
const index = dictionaryIndexSchema.parse(read('ja/dictionary/index.json'));
const dictionary = dictionarySchema.parse({
  schemaVersion: 2,
  words: index.sections.words.flatMap((path) => wordShardSchema.parse(read(path)).entries),
  kanji: index.sections.kanji.flatMap((path) => kanjiShardSchema.parse(read(path)).entries),
  grammar: index.sections.grammar.flatMap((path) => grammarShardSchema.parse(read(path)).entries),
});
describe('data-based quizzes', () => {
  it('covers all supported task types deterministically', () => {
    const tasks = buildQuiz(dictionary);
    expect(new Set(tasks.map((item) => item.kind)).size).toBe(5);
    expect(tasks).toEqual(buildQuiz(dictionary));
    expect(new Set(tasks.map((item) => item.id)).size).toBe(tasks.length);
  });
  it('each choice task offers one accepted answer', () => {
    for (const task of buildQuiz(dictionary)) {
      if (task.options.length) {
        expect(task.options.filter((option) => checkAnswer(task, option))).toEqual([task.answer]);
      }
      expect(checkAnswer(task, ` ${task.answer.toUpperCase()} `)).toBe(true);
      expect(checkAnswer(task, 'wrong')).toBe(false);
    }
  });
});
