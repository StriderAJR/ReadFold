import { useTranslation } from 'react-i18next';
import type { Grammar } from '../domain/content';
import type { ReaderPreferences } from '../domain/user-state';
import { kanaToRomaji } from './kana';
import { LayerHint } from './LayerHint';

type Example = Grammar['examples'][number];

export function GrammarExample({ example, preferences }: { example: Example; preferences: ReaderPreferences }) {
  const { t } = useTranslation();
  const showInlineRuby = preferences.furigana && !preferences.furiganaSeparateLine;
  const japanese = (ruby: boolean) => example.segments?.map((segment, index) => ruby && segment.reading ? (
    <ruby key={index}>{segment.text}<rt>{segment.reading}</rt></ruby>
  ) : <span key={index}>{segment.text}</span>) ?? example.text;

  return (
    <div className="grammar-example">
      <p lang="ja">{japanese(showInlineRuby)}</p>
      {preferences.furigana && preferences.furiganaSeparateLine && (
        <p className="translation-line" lang="ja"><LayerHint label="furigana" /> {japanese(true)}</p>
      )}
      {preferences.hiragana && example.hiragana && (
        <p className={`reading-row ${preferences.hiraganaSeparateLine ? 'translation-line' : ''}`} lang="ja">
          <LayerHint label="hiragana" /> {example.hiragana}
        </p>
      )}
      {preferences.romaji && example.romaji && (
        <p className={`reading-row ${preferences.romajiSeparateLine ? 'translation-line' : ''}`}>
          <LayerHint label="romaji" /> {example.romaji}
        </p>
      )}
      {preferences.romaji && !example.romaji && (example.hiragana || example.segments?.some((segment) => segment.reading)) && (
        <p className={`reading-row ${preferences.romajiSeparateLine ? 'translation-line' : ''}`}>
          <LayerHint label="romaji" /> {kanaToRomaji(example.hiragana ?? example.segments?.map((segment) => segment.reading ?? segment.text).join('') ?? '')}
        </p>
      )}
      {preferences.literal && example.literal && (
        <p className={preferences.literalSeparateLine ? 'translation-line' : ''}>
          <LayerHint label="literal" /> {example.literal}
        </p>
      )}
      {preferences.natural && (
        <p className={preferences.naturalSeparateLine ? 'translation-line' : ''}>
          <LayerHint label="natural" /> {example.natural ?? example.translation}
        </p>
      )}
    </div>
  );
}
