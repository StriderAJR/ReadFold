import type { ReactNode } from 'react';
import type { ReaderPreferences } from '../domain/user-state';
import { kanaToRomaji } from './kana';

type Segment = { text: string; reading?: string };
type Atom = { display: ReactNode; japanese: boolean; romaji: string };

const japaneseCharacter = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー々、。・「」『』（）]/u;

function renderRuby(text: string, reading: string): ReactNode {
  const chunks = text.match(/[\p{Script=Han}々]+|[\p{Script=Hiragana}\p{Script=Katakana}ー]+|./gu) ?? [];
  if (!chunks.some((chunk) => /\p{Script=Han}/u.test(chunk))) {
    return text;
  }

  const rendered: ReactNode[] = [];
  let readingOffset = 0;
  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index];
    if (!/\p{Script=Han}/u.test(chunk)) {
      if (/^[\p{Script=Hiragana}\p{Script=Katakana}ー]+$/u.test(chunk)) {
        const kanaOffset = reading.indexOf(chunk, readingOffset);
        if (kanaOffset >= readingOffset) {
          readingOffset = kanaOffset + chunk.length;
        }
      }
      rendered.push(chunk);
      continue;
    }

    let nextKanaOffset = -1;
    for (let next = index + 1; next < chunks.length; next += 1) {
      if (/^[\p{Script=Hiragana}\p{Script=Katakana}ー]+$/u.test(chunks[next])) {
        nextKanaOffset = reading.indexOf(chunks[next], readingOffset);
        if (nextKanaOffset >= readingOffset) {
          break;
        }
        nextKanaOffset = -1;
      }
    }
    const kanjiReading = nextKanaOffset >= readingOffset
      ? reading.slice(readingOffset, nextKanaOffset)
      : reading.slice(readingOffset);
    rendered.push(kanjiReading ? <ruby key={index}>{chunk}<rt>{kanjiReading}</rt></ruby> : chunk);
    readingOffset += kanjiReading.length;
  }

  return <>{rendered}</>;
}

export function GrammarText({ text, segments, preferences }: { text: string; segments?: Segment[]; preferences: ReaderPreferences }): ReactNode {
  if (!segments) {
    return text;
  }
  const atoms: Atom[] = [];
  for (const segment of segments) {
    if (segment.reading) {
      atoms.push({
        display: preferences.furigana && /\p{Script=Han}/u.test(segment.text)
          ? renderRuby(segment.text, segment.reading)
          : segment.text,
        japanese: true,
        romaji: kanaToRomaji(segment.reading),
      });
      continue;
    }
    const chunks = segment.text.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー々、。・「」『』（）]+|[^\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー々、。・「」『』（）]+/gu) ?? [];
    for (const chunk of chunks) {
      const japanese = japaneseCharacter.test(chunk[0]);
      atoms.push({
        display: chunk,
        japanese,
        romaji: japanese && !/\p{Script=Han}/u.test(chunk) ? kanaToRomaji(chunk) : '',
      });
    }
  }

  const result: ReactNode[] = [];
  for (let index = 0; index < atoms.length;) {
    if (!atoms[index].japanese) {
      result.push(atoms[index].display);
      index += 1;
      continue;
    }
    const start = index;
    const romaji: string[] = [];
    while (index < atoms.length && atoms[index].japanese) {
      result.push(atoms[index].display);
      if (atoms[index].romaji && !/^[、。・]+$/u.test(atoms[index].romaji)) {
        romaji.push(atoms[index].romaji);
      }
      index += 1;
    }
    if (preferences.romaji && romaji.length) {
      result.push(` (${romaji.join(' ')})`);
    }
    if (index === start) index += 1;
  }
  return result;
}
