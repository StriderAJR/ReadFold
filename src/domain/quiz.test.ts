import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dictionarySchema } from './content';
import { buildQuiz, checkAnswer } from './quiz';
const dictionary = dictionarySchema.parse(JSON.parse(readFileSync('public/books/dictionary.json', 'utf8')));
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
