import { describe, expect, it } from 'vitest';
import type { Word } from './content';
import { createReviewTasks, scheduleReview } from './review';

const word = (id: string, surface: string, meanings: string[]): Word => ({
  id, surface, dictionaryForm: surface, reading: surface, romaji: id, partOfSpeech: 'noun', meanings,
});

describe('review scheduling', () => {
  it('schedules a retry in ten minutes and graduated daily intervals', () => {
    const now = Date.UTC(2026, 0, 1);
    expect(scheduleReview(undefined, 'again', now)).toEqual({ repetitions: 0, intervalDays: 0, dueAt: now + 600_000 });
    const first = scheduleReview(undefined, 'good', now);
    expect(first).toEqual({ repetitions: 1, intervalDays: 1, dueAt: now + 86_400_000 });
    expect(scheduleReview(first, 'good', now).intervalDays).toBe(3);
    expect(scheduleReview(first, 'easy', now).intervalDays).toBe(4);
    expect(scheduleReview(first, 'hard', now).intervalDays).toBe(1);
    expect(scheduleReview(first, 'again', now).repetitions).toBe(0);
    expect(() => scheduleReview(undefined, 'good', NaN)).toThrow();
  });

  it('creates deterministic options with one valid answer, excluding accepted synonyms', () => {
    const words = [word('cat', '猫', ['кошка', 'кот']), word('water', '水', ['вода']), word('tree', '木', ['дерево'])];
    const tasks = createReviewTasks(words);
    expect(tasks).toEqual(createReviewTasks([...words].reverse()));
    expect(tasks).toHaveLength(3);
    for (const task of tasks) {
      const accepted = words.find((item) => item.id === task.wordId)!.meanings;
      expect(task.options.filter((option) => accepted.includes(option))).toEqual([task.answer]);
      expect(new Set(task.options).size).toBe(task.options.length);
    }
  });

  it('skips ambiguous surface forms and tasks without distractors', () => {
    expect(createReviewTasks([word('one', '同', ['один']), word('two', '同', ['два'])])).toEqual([]);
    expect(createReviewTasks([word('cat', '猫', ['кошка'])])).toEqual([]);
    expect(createReviewTasks([])).toEqual([]);
  });
});
