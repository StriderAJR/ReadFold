import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { ChevronLeft, ChevronRight, Settings, Check, Sparkles } from 'lucide-react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '../components/ui/button';
import { useCatalog, useChapter, useDictionary, useUserData } from '../application/hooks';
import type { Dictionary, Sentence } from '../domain/content';
import type { ReaderPreferences } from '../domain/user-state';

const layers = ['furigana', 'hiragana', 'romaji', 'literal', 'natural', 'words', 'kanji', 'grammar'] as const;
const modes = ['detailed', 'adaptive', 'continuous'] as const;

function SentenceBlock({
  sentence,
  index,
  selected,
  open,
  preferences,
  dictionary,
  learning,
  onOpen,
  onEntity,
}: {
  sentence: Sentence;
  index: number;
  selected: boolean;
  open: boolean;
  preferences: ReaderPreferences;
  dictionary: Dictionary;
  learning: Record<string, string>;
  onOpen: () => void;
  onEntity: (id: string) => void;
}) {
  const { t } = useTranslation();
  const [revealed, setRevealed] = useState(false);
  const allWordsKnown =
    sentence.words.length > 0 &&
    sentence.words.every((word) => learning[word.wordId] === 'known' || learning[word.wordId] === 'mastered');
  const adaptiveHidden = preferences.mode === 'adaptive' && preferences.adaptiveHideKnown && allWordsKnown && !revealed;
  const showAnalysis = open && !adaptiveHidden;
  const showRuby = preferences.furigana && !adaptiveHidden;

  return (
    <article
      data-testid="reader-sentence"
      id={`sentence-${sentence.id}`}
      className={`sentence-block ${selected ? 'sentence-active' : ''} ${preferences.mode === 'continuous' ? 'continuous-sentence' : ''}`}
    >
      <button
        className="sentence-text"
        onClick={onOpen}
        aria-expanded={showAnalysis}
        aria-controls={`analysis-${sentence.id}`}
        aria-label={`${t('sentence')} ${index + 1}: ${sentence.text}`}
      >
        <span className="sentence-num" aria-hidden="true">
          {String(index + 1).padStart(2, '0')}
        </span>
        <span lang="ja">
          {sentence.segments.map((segment, partIndex) => (
            <span key={partIndex}>
              {showRuby && segment.reading ? (
                <ruby>
                  {segment.text}
                  <rt>{segment.reading}</rt>
                </ruby>
              ) : (
                segment.text
              )}
            </span>
          ))}
        </span>
      </button>
      {adaptiveHidden && (
        <button className="reveal-button" onClick={() => setRevealed(true)}>
          {t('reveal')}
        </button>
      )}
      {showAnalysis && (
        <div id={`analysis-${sentence.id}`} className="sentence-analysis analysis-open">
          <div className="translation-row">
            {preferences.hiragana && (
              <p lang="ja">
                <b>{t('hiragana')}</b>
                {sentence.hiragana}
              </p>
            )}
            {preferences.romaji && (
              <p>
                <b>{t('romaji')}</b>
                {sentence.romaji}
              </p>
            )}
            {preferences.literal && (
              <p>
                <b>{t('literal')}</b>
                {sentence.literal}
              </p>
            )}
            {preferences.natural && (
              <p>
                <b>{t('natural')}</b>
                {sentence.natural}
              </p>
            )}
          </div>
          <div className="analysis-expanded">
            {preferences.words && (
              <section>
                <h4>{t('wordsLabel')}</h4>
                <div className="token-list">
                  {sentence.words.map((word, occurrenceIndex) => (
                    <button key={`${word.wordId}-${occurrenceIndex}`} onClick={() => onEntity(word.wordId)}>
                      <b lang="ja">{word.surface}</b>
                      <span>{word.meaning}</span>
                      {word.inflection && <small>{word.inflection}</small>}
                      {word.role && <small>{word.role}</small>}
                    </button>
                  ))}
                </div>
              </section>
            )}
            {preferences.kanji && sentence.kanjiIds.length > 0 && (
              <section>
                <h4>{t('kanjiLabel')}</h4>
                <div className="inline-links">
                  {sentence.kanjiIds.map((id) => {
                    const item = dictionary.kanji.find((entry) => entry.id === id);
                    return (
                      item && (
                        <button key={id} onClick={() => onEntity(id)}>
                          <span lang="ja">{item.character}</span> <span>{item.meanings.join(', ')}</span>
                        </button>
                      )
                    );
                  })}
                </div>
              </section>
            )}
            {preferences.grammar && sentence.grammarIds.length > 0 && (
              <section>
                <h4>{t('grammarLabel')}</h4>
                <div className="grammar-notes">
                  {sentence.grammarIds.map((id) => {
                    const item = dictionary.grammar.find((entry) => entry.id === id);
                    return (
                      item && (
                        <div className="grammar-note" key={id}>
                          <button className="text-link" onClick={() => onEntity(id)}>
                            {item.title}
                          </button>
                          <p>{sentence.grammarRoles?.[id] ?? item.explanation}</p>
                          <details>
                            <summary>{t('reveal')}</summary>
                            <p>{item.explanation}</p>
                            {item.examples.map((example) => (
                              <p key={example.text}>
                                <span lang="ja">{example.text}</span>
                                <br />
                                {example.translation}
                              </p>
                            ))}
                          </details>
                        </div>
                      )
                    );
                  })}
                </div>
              </section>
            )}
          </div>
        </div>
      )}
    </article>
  );
}

export function ReaderPage() {
  const { bookId = '', chapterId = '' } = useParams();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const requestedSentence = params.get('sentence');
  const user = useUserData();
  const catalog = useCatalog();
  const dictionary = useDictionary();
  const book = catalog.data?.find((item) => item.id === bookId);
  const chapterMeta = book?.chapters.find((item) => item.id === chapterId);
  const chapterQuery = useChapter(chapterMeta?.path);
  const chapter = chapterQuery.data;
  const sentences = useMemo(() => chapter?.paragraphs.flatMap((paragraph) => paragraph.sentences) ?? [], [chapter]);
  const readingKey = `${bookId}/${chapterId}`;
  const saved = user.data?.readings[readingKey];
  const [selected, setSelected] = useState('');
  const [opened, setOpened] = useState('');
  const [saveFailed, setSaveFailed] = useState(false);
  const initialized = useRef('');
  const preferences = user.preferences;

  useEffect(() => {
    if (!chapter || !user.data) {
      return;
    }
    const initializationKey = `${user.owner}/${readingKey}/${requestedSentence ?? ''}`;
    if (initialized.current === initializationKey) {
      return;
    }
    initialized.current = initializationKey;
    const preferred = requestedSentence ?? saved?.sentenceId;
    const initial = sentences.find((sentence) => sentence.id === preferred)?.id ?? sentences[0]?.id ?? '';
    setSelected(initial);
    setOpened(requestedSentence ? initial : '');
    requestAnimationFrame(() => document.getElementById(`sentence-${initial}`)?.scrollIntoView({ block: 'center' }));
  }, [chapter, readingKey, requestedSentence, saved?.sentenceId, sentences, user.data, user.owner]);

  const current = Math.max(
    0,
    sentences.findIndex((sentence) => sentence.id === selected),
  );
  async function savePreference(key: keyof ReaderPreferences, value: ReaderPreferences[typeof key]) {
    try {
      await user.save({ kind: 'preferences', id: 'reader', payload: { [key]: value } });
      setSaveFailed(false);
    } catch {
      setSaveFailed(true);
    }
  }
  async function select(sentence: Sentence, position: number, reveal = true) {
    setSelected(sentence.id);
    if (reveal) {
      setOpened((previous) => (previous === sentence.id ? '' : sentence.id));
    }
    try {
      await user.save({
        kind: 'reading',
        id: readingKey,
        payload: { sentenceId: sentence.id, position, bookId, chapterId },
      });
      const references = new Set([
        ...sentence.words.map((word) => word.wordId),
        ...sentence.kanjiIds,
        ...sentence.grammarIds,
      ]);
      for (const id of references) {
        if (!user.data?.learning[id]) {
          await user.save({ kind: 'learning', id, payload: { status: 'encountered', automatic: true } });
        }
      }
      setSaveFailed(false);
    } catch {
      setSaveFailed(true);
    }
  }
  async function move(offset: number) {
    const position = Math.min(sentences.length - 1, Math.max(0, current + offset));
    const sentence = sentences[position];
    if (!sentence) {
      return;
    }
    setOpened('');
    await select(sentence, position, false);
    document.getElementById(`sentence-${sentence.id}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
  function openEntity(id: string) {
    const kind = dictionary.data?.kanji.some((item) => item.id === id)
      ? 'kanji'
      : dictionary.data?.grammar.some((item) => item.id === id)
        ? 'grammar'
        : 'words';
    navigate(`/${kind}/${id}`);
  }

  if (!book || !chapterMeta) {
    return (
      <div className="state-card">{t(catalog.isLoading ? 'loading' : catalog.isError ? 'error' : 'noResults')}</div>
    );
  }
  if (chapterQuery.isLoading || user.isLoading) {
    return <div className="loading-skeleton" aria-label={t('loading')} />;
  }
  if (chapterQuery.isError || !chapter || user.isError) {
    return (
      <div className="state-card" role="alert">
        <p>{t('error')}</p>
        <Button
          variant="outline"
          onClick={() => {
            void chapterQuery.refetch();
            void user.refetch();
          }}
        >
          {t('retry')}
        </Button>
      </div>
    );
  }
  const emptyDictionary: Dictionary = { schemaVersion: 1, words: [], kanji: [], grammar: [] };
  const style = {
    '--reader-size': `${preferences.fontSize}px`,
    '--reader-leading': preferences.lineHeight,
    '--reader-width': `${preferences.width}px`,
  } as CSSProperties;

  return (
    <div className={`reader-view reader-${preferences.mode}`} style={style}>
      <div className="reader-top">
        <Link className="back-link" to={`/book/${bookId}`}>
          <ChevronLeft size={16} />
          {book.title}
        </Link>
        <span className="reader-chapter-label">{chapterMeta.title}</span>
        <Link className="reader-settings" to="/settings">
          <Settings size={17} />
          <span>{t('settings')}</span>
        </Link>
      </div>
      <div className="reader-header">
        <p className="eyebrow">
          {book.title} · {chapterMeta.title}
        </p>
        <h1>{chapter.title}</h1>
        <p>
          {t(preferences.mode)} · {sentences.length} {t('sentence').toLowerCase()}
        </p>
      </div>
      <div className="reader-toolbar">
        <div className="segmented" data-testid="mode-select" aria-label={t('mode')}>
          {modes.map((mode) => (
            <button
              key={mode}
              aria-pressed={preferences.mode === mode}
              className={preferences.mode === mode ? 'active' : ''}
              onClick={() => {
                setOpened('');
                void savePreference('mode', mode);
              }}
            >
              {t(mode)}
            </button>
          ))}
        </div>
        <details className="layer-options">
          <summary>{t('settings')}</summary>
          <div>
            {layers.map((layer) => (
              <label key={layer}>
                <input
                  data-testid={`layer-${layer}`}
                  type="checkbox"
                  checked={preferences[layer]}
                  onChange={(event) => void savePreference(layer, event.target.checked)}
                />
                {t(layer)}
              </label>
            ))}
          </div>
        </details>
      </div>
      {preferences.mode === 'adaptive' && (
        <div className="adaptive-banner">
          <Sparkles size={16} />
          {t('adaptiveInfo')}
        </div>
      )}
      {saveFailed && (
        <p role="alert" className="form-error">
          {t('localSaveError')}
        </p>
      )}
      <div className="reader-content">
        {chapter.paragraphs.map((paragraph) => (
          <div className="reader-paragraph" key={paragraph.id}>
            {paragraph.sentences.map((sentence) => {
              const position = sentences.findIndex((item) => item.id === sentence.id);
              return (
                <SentenceBlock
                  key={sentence.id}
                  sentence={sentence}
                  index={position}
                  selected={selected === sentence.id}
                  open={preferences.mode !== 'continuous' || opened === sentence.id}
                  preferences={preferences}
                  dictionary={dictionary.data ?? emptyDictionary}
                  learning={user.data?.learning ?? {}}
                  onOpen={() => void select(sentence, position)}
                  onEntity={openEntity}
                />
              );
            })}
          </div>
        ))}
      </div>
      <div className="reader-controls">
        <Button
          data-testid="mark-read"
          variant="outline"
          disabled={user.saving}
          onClick={() => {
            const sentence = sentences[current];
            if (sentence) {
              void select(sentence, current, false);
            }
          }}
        >
          <Check size={16} />
          {t('markRead')}
        </Button>
        <Button variant="outline" onClick={() => void move(-1)} disabled={current <= 0 || user.saving}>
          <ChevronLeft size={16} />
          {t('previous')}
        </Button>
        <span>
          {String(current + 1).padStart(2, '0')} <i>/</i> {String(sentences.length).padStart(2, '0')}
        </span>
        <Button onClick={() => void move(1)} disabled={current >= sentences.length - 1 || user.saving}>
          {t('next')}
          <ChevronRight size={16} />
        </Button>
      </div>
    </div>
  );
}
