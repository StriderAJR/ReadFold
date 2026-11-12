import type { Dictionary } from './content';

export type QuizKind = 'meaning' | 'reading' | 'translation' | 'kanji' | 'grammar';
export interface QuizTask {
  id: string;
  entityId: string;
  kind: QuizKind;
  prompt: string;
  answer: string;
  accepted: string[];
  options: string[];
}
export const normalizeAnswer = (answer: string) => answer.normalize('NFKC').trim().toLocaleLowerCase('ru');
export function checkAnswer(task: QuizTask, answer: string): boolean {
  return task.accepted.some((accepted) => normalizeAnswer(accepted) === normalizeAnswer(answer));
}
export function buildQuiz(dictionary: Dictionary): QuizTask[] {
  const tasks: QuizTask[] = [];
  const choice = (entityId: string, kind: QuizKind, prompt: string, accepted: string[], pool: string[]) => {
    const excluded = new Set(accepted.map(normalizeAnswer));
    const distractors = [...new Set(pool)].filter((option) => !excluded.has(normalizeAnswer(option))).slice(0, 3);
    if (!distractors.length) { return; }
    const options = [accepted[0], ...distractors];
    const offset = [...entityId].reduce((sum, character) => sum + character.charCodeAt(0), 0) % options.length;
    tasks.push({ id: `${kind}.${entityId}`, entityId, kind, prompt, answer: accepted[0], accepted,
      options: [...options.slice(offset), ...options.slice(0, offset)] });
  };
  for (const word of dictionary.words) {
    if (dictionary.words.some((other) => other.id !== word.id && other.surface === word.surface)) { continue; }
    if (word.partOfSpeech.includes('частица')) { continue; }
    choice(word.id, 'meaning', word.surface, word.meanings, dictionary.words.flatMap((item) => item.meanings));
    choice(word.id, 'reading', word.surface, [word.reading], dictionary.words.map((item) => item.reading));
    tasks.push({ id: `translation.${word.id}`, entityId: word.id, kind: 'translation', prompt: word.surface,
      answer: word.meanings[0], accepted: word.meanings, options: [] });
  }
  for (const kanji of dictionary.kanji) {
    choice(kanji.id, 'kanji', kanji.character, kanji.meanings, dictionary.kanji.flatMap((item) => item.meanings));
  }
  for (const grammar of dictionary.grammar) {
    if (dictionary.grammar.some((other) => other.id !== grammar.id && other.explanation === grammar.explanation)) { continue; }
    choice(grammar.id, 'grammar', grammar.explanation, [grammar.title], dictionary.grammar.map((item) => item.title));
  }
  return tasks;
}
