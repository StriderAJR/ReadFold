import { useTranslation } from 'react-i18next';
import type { Grammar } from '../domain/content';
import type { ReaderPreferences } from '../domain/user-state';

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
        <p className="translation-line" lang="ja"><b>{t('furigana')}</b> {japanese(true)}</p>
      )}
      {preferences.hiragana && example.hiragana && (
        <p className={`reading-row ${preferences.hiraganaSeparateLine ? 'translation-line' : ''}`} lang="ja">
          <b>{t('hiragana')}</b> {example.hiragana}
        </p>
      )}
      {preferences.romaji && example.romaji && (
        <p className={`reading-row ${preferences.romajiSeparateLine ? 'translation-line' : ''}`}>
          <b>{t('romaji')}</b> {example.romaji}
        </p>
      )}
      {preferences.literal && example.literal && (
        <p className={preferences.literalSeparateLine ? 'translation-line' : ''}>
          <b>{t('literal')}</b> {example.literal}
        </p>
      )}
      {preferences.natural && (
        <p className={preferences.naturalSeparateLine ? 'translation-line' : ''}>
          <b>{t('natural')}</b> {example.natural ?? example.translation}
        </p>
      )}
    </div>
  );
}
