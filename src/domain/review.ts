import type { Word } from './content';

export type ReviewRating = 'again' | 'hard' | 'good' | 'easy';
export interface ReviewState {
  repetitions: number;
  intervalDays: number;
  dueAt: number;
}
export interface ReviewTask {
  id: string;
  wordId: string;
  prompt: string;
  answer: string;
  options: string[];
}

const day = 86_400_000;

export function scheduleReview(previous: ReviewState | undefined, rating: ReviewRating, now: number): ReviewState {
  if (
    !Number.isFinite(now) ||
    (previous &&
      (!Number.isFinite(previous.intervalDays) ||
        previous.intervalDays < 0 ||
        !Number.isInteger(previous.repetitions) ||
        previous.repetitions < 0))
  ) {
    throw new Error('Invalid review scheduling input');
  }
  const repetitions = rating === 'again' ? 0 : (previous?.repetitions ?? 0) + 1;
  const current = previous?.intervalDays ?? 0;
  const intervalDays = Math.min(
    3650,
    rating === 'again'
      ? 0
      : rating === 'hard'
        ? Math.max(1, Math.round(current * 1.2))
        : rating === 'easy'
          ? Math.max(4, Math.round(current * 3))
          : Math.max(1, Math.round(current * 2.5)),
  );
  return { repetitions, intervalDays, dueAt: now + (rating === 'again' ? 600_000 : intervalDays * day) };
}

/** Skip prompts with competing meanings; distractors never include accepted synonyms. */
export function createReviewTasks(words: readonly Word[]): ReviewTask[] {
  const sorted = [...words].sort((left, right) => left.id.localeCompare(right.id, 'en'));
  return sorted.flatMap((word) => {
    if (sorted.some((other) => other.id !== word.id && other.surface === word.surface)) {
      return [];
    }
    const answer = word.meanings[0];
    if (!answer) {
      return [];
    }
    const distractors = [
      ...new Set(
        sorted
          .filter((other) => other.id !== word.id)
          .flatMap((other) => other.meanings)
          .filter((meaning) => !word.meanings.includes(meaning)),
      ),
    ].slice(0, 3);
    if (distractors.length < 1) {
      return [];
    }
    const options = [answer, ...distractors];
    const offset = [...word.id].reduce((sum, character) => sum + character.charCodeAt(0), 0) % options.length;
    return [
      {
        id: `meaning.${word.id}`,
        wordId: word.id,
        prompt: word.surface,
        answer,
        options: [...options.slice(offset), ...options.slice(0, offset)],
      },
    ];
  });
}
