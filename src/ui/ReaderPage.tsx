import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { ChevronLeft, ChevronRight, Settings, Check, Sparkles } from 'lucide-react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '../components/ui/button';
import { useCatalog, useChapter, useDictionary, useUserData } from '../application/hooks';
import type { Dictionary, Sentence } from '../domain/content';
import type { LearningStatus, ReaderPreferences } from '../domain/user-state';
import { GrammarExample } from './GrammarExample';
import { KanjiReadings } from './KanjiReadings';
import { LayerHint } from './LayerHint';

const layers = ['furigana', 'romaji', 'literal', 'natural', 'words', 'kanji', 'grammar'] as const;
const modes = ['detailed', 'adaptive', 'continuous'] as const;
const genericWordRole = 'Лексическое значение в контексте предложения';

function KanjiComponentNode({
  character,
  meaning,
  kanji,
  ancestors,
  depth,
}: {
  character: string;
  meaning?: string;
  kanji: Dictionary['kanji'];
  ancestors: string[];
  depth: number;
}) {
  const entry = kanji.find((candidate) => candidate.character === character);
  const children = depth < 8
    ? (entry?.components ?? []).filter((component) => component !== character && !ancestors.includes(component))
    : [];

  const contents = (
    <>
      <b lang="ja">{character}</b>
      {meaning && <span>{meaning}</span>}
    </>
  );
  return (
    <li>
      {children.length > 0 ? (
        <details className="kanji-component-branch">
          <summary className="kanji-tree-node">{contents}</summary>
          {entry?.mnemonic && (
            <small className="kanji-branch-mnemonic">
              <span>{entry.mnemonic}</span>
            </small>
          )}
          <ul>
            {children.map((component) => (
              <KanjiComponentNode
                key={`${character}-${component}`}
                character={component}
                meaning={entry?.componentMeanings?.[component] ?? kanji.find((candidate) => candidate.character === component)?.meanings[0]}
                kanji={kanji}
                ancestors={[...ancestors, character]}
                depth={depth + 1}
              />
            ))}
          </ul>
        </details>
      ) : (
        <span className="kanji-tree-node">{contents}</span>
      )}
    </li>
  );
}

function KanjiMemory({ item, kanji }: { item: Dictionary['kanji'][number]; kanji: Dictionary['kanji'] }) {
  const components = item.components.filter((component) => component !== item.character);
  return (
    <>
      {components.length > 0 && (
        <small className="kanji-memory-row">
          <LayerHint label="mnemonicComponents" />
          <ul className="kanji-component-tree">
            {components.map((component) => (
              <KanjiComponentNode
                key={component}
                character={component}
                meaning={item.componentMeanings?.[component] ?? kanji.find((candidate) => candidate.character === component)?.meanings[0]}
                kanji={kanji}
                ancestors={[item.character]}
                depth={1}
              />
            ))}
          </ul>
        </small>
      )}
      {item.mnemonic && (
        <small className="kanji-memory-row">
          <span>{item.mnemonic}</span>
        </small>
      )}
    </>
  );
}

function LearningToggle({ label, known, saving, onClick }: { label: string; known: boolean; saving: boolean; onClick: () => void }) {
  const { t } = useTranslation();
  const action = t(known ? 'undoKnown' : 'markKnownCard', { item: label });
  return (
    <button
      className={`learning-toggle ${known ? 'is-known' : ''}`}
      data-testid="learning-toggle"
      type="button"
      aria-label={action}
      aria-pressed={known}
      title={action}
      disabled={saving}
      onClick={onClick}
    >
      <Check size={15} aria-hidden="true" />
    </button>
  );
}

function SentenceBlock({
  sentence,
  index,
  selected,
  open,
  preferences,
  dictionary,
  learning,
  saving,
  onOpen,
  onEntity,
  onToggleKnown,
}: {
  sentence: Sentence;
  index: number;
  selected: boolean;
  open: boolean;
  preferences: ReaderPreferences;
  dictionary: Dictionary;
  learning: Record<string, LearningStatus>;
  saving: boolean;
  onOpen: () => void;
  onEntity: (id: string) => void;
  onToggleKnown: (id: string) => void;
}) {
  const { t } = useTranslation();
  const [showKnown, setShowKnown] = useState(false);
  const adaptiveFilter = preferences.mode === 'adaptive' && preferences.adaptiveHideKnown;
  const isKnown = (id: string) => learning[id] === 'known' || learning[id] === 'mastered';
  const showItem = (id: string) => !adaptiveFilter || showKnown || !isKnown(id);
  const showAnalysis = open;
  const showRuby = preferences.furigana && !preferences.furiganaSeparateLine;
  const visibleKanji = sentence.kanjiIds.length > 0
    ? sentence.kanjiIds.map((id) => ({ id, item: dictionary.kanji.find((entry) => entry.id === id) })).filter((entry) => entry.item)
    : [...new Set(Array.from(sentence.text).filter((character) => /\p{Script=Han}/u.test(character)))].map((character) => ({ id: character, item: undefined }));
  const hiddenKnown = adaptiveFilter && [
    ...(preferences.words ? sentence.wordOccurrences.map((word) => word.wordId) : []),
    ...(preferences.kanji ? sentence.kanjiIds : []),
    ...(preferences.grammar ? sentence.grammarOccurrences.map((occurrence) => occurrence.grammarId) : []),
  ].some(isKnown);
  const visibleWords = sentence.wordOccurrences.filter((word) => showItem(word.wordId));
  const shownKanji = visibleKanji.filter(({ id }) => showItem(id));
  const visibleGrammar = sentence.grammarOccurrences.filter((occurrence) => showItem(occurrence.grammarId));

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
      {showAnalysis && (
        <div id={`analysis-${sentence.id}`} className="sentence-analysis analysis-open">
          {hiddenKnown && (
            <button className="show-known-button" data-testid="show-known" type="button" aria-pressed={showKnown} onClick={() => setShowKnown((value) => !value)}>
              {t(showKnown ? 'hideKnownCards' : 'showKnownCards')}
            </button>
          )}
          <div className={`translation-row ${preferences.translationsSeparateLine ? 'translations-separate' : ''}`}>
            {preferences.furigana && preferences.furiganaSeparateLine && (
              <p className="translation-line" lang="ja">
                <LayerHint label="furigana" />
                {sentence.segments.map((segment, partIndex) => segment.reading ? (
                  <ruby key={partIndex}>{segment.text}<rt>{segment.reading}</rt></ruby>
                ) : <span key={partIndex}>{segment.text}</span>)}
              </p>
            )}
            {preferences.romaji && (
              <p className={`reading-row ${preferences.romajiSeparateLine ? 'translation-line' : ''}`}>
                <LayerHint label="romaji" />
                {sentence.romaji}
              </p>
            )}
            {preferences.literal && (
              <p className={preferences.literalSeparateLine ? 'translation-line' : ''}>
                <LayerHint label="literal" />
                {sentence.literal}
              </p>
            )}
            {preferences.natural && (
              <p className={preferences.naturalSeparateLine ? 'translation-line' : ''}>
                <LayerHint label="natural" />
                {sentence.natural}
              </p>
            )}
          </div>
          <div className="analysis-expanded">
            {preferences.words && visibleWords.length > 0 && (
              <section>
                <h4>{t('wordsLabel')}</h4>
                <div className={`token-list ${preferences.canvasMode ? 'canvas-list' : ''}`}>
                  {visibleWords.map((word, occurrenceIndex) => {
                    const entry = dictionary.words.find((item) => item.id === word.wordId);
                    const reading = word.hiragana;
                    const showWordFurigana = preferences.furigana && reading && /\p{Script=Han}/u.test(word.surface);
                    const wordLabel = showWordFurigana ? <ruby>{word.surface}<rt>{reading}</rt></ruby> : word.surface;
                    return preferences.canvasMode ? (
                      <div className="canvas-card canvas-card-word learning-card" data-entity-id={word.wordId} key={`${word.wordId}-${occurrenceIndex}`}>
                        <LearningToggle label={word.surface} known={isKnown(word.wordId)} saving={saving} onClick={() => onToggleKnown(word.wordId)} />
                        <button className="canvas-card-primary canvas-card-link" lang="ja" onClick={() => onEntity(word.wordId)} aria-label={word.surface}>
                          <b>{wordLabel}</b>
                        </button>
                        <div className="canvas-card-body">
                          <span className="canvas-card-meaning">{word.meaning}</span>
                          {entry && (
                            <div className="word-card-meta">
                              <small>{[entry.dictionaryForm !== word.surface ? entry.dictionaryForm : '', preferences.furigana && !showWordFurigana ? reading : '', preferences.romaji ? word.romaji : ''].filter(Boolean).join(' · ')}</small>
                              <small>{entry.partOfSpeech}</small>
                            </div>
                          )}
                          {(word.inflection || (word.role && word.role !== genericWordRole)) && (
                            <div className="word-card-notes">
                              {word.inflection && <small>{word.inflection}</small>}
                              {word.role && word.role !== genericWordRole && <small>{word.role}</small>}
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="token-word-card learning-card" data-entity-id={word.wordId} key={`${word.wordId}-${occurrenceIndex}`}>
                        <LearningToggle label={word.surface} known={isKnown(word.wordId)} saving={saving} onClick={() => onToggleKnown(word.wordId)} />
                        <button className="token-word-link" lang="ja" onClick={() => onEntity(word.wordId)} aria-label={word.surface}>
                          <b>{wordLabel}</b>
                        </button>
                        <span className="token-word-body">
                          <span>{word.meaning}</span>
                          {entry && (
                            <span className="word-card-meta">
                              <small>{[entry.dictionaryForm !== word.surface ? entry.dictionaryForm : '', preferences.furigana && !showWordFurigana ? reading : '', preferences.romaji ? word.romaji : ''].filter(Boolean).join(' · ')}</small>
                              <small>{entry.partOfSpeech}</small>
                            </span>
                          )}
                          {(word.inflection || (word.role && word.role !== genericWordRole)) && (
                            <span className="word-card-notes">
                              {word.inflection && <small>{word.inflection}</small>}
                              {word.role && word.role !== genericWordRole && <small>{word.role}</small>}
                            </span>
                          )}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}
            {preferences.kanji && shownKanji.length > 0 && (
              <section>
                <h4>{t('kanjiLabel')}</h4>
                <div className={preferences.canvasMode ? 'canvas-list' : 'inline-links kanji-inline-list'}>
                  {shownKanji.map(({ id, item }) => {
                    return (
                      item ? (preferences.canvasMode ? (
                        <div className="canvas-card canvas-card-kanji learning-card" data-entity-id={id} key={id}>
                          <LearningToggle label={item.character} known={isKnown(id)} saving={saving} onClick={() => onToggleKnown(id)} />
                          <button className="canvas-card-primary canvas-card-link" lang="ja" onClick={() => onEntity(id)} aria-label={item.character}>
                            <b>{item.character}</b>
                          </button>
                          <div className="canvas-card-body">
                            <span className="canvas-card-meaning">{item.meanings.join(', ')}</span>
                            <small><KanjiReadings on={item.on} kun={item.kun} romaji={preferences.romaji} /></small>
                            <KanjiMemory item={item} kanji={dictionary.kanji} />
                          </div>
                        </div>
                      ) : (
                        <div className="kanji-inline-card learning-card" data-entity-id={id} key={id}>
                          <LearningToggle label={item.character} known={isKnown(id)} saving={saving} onClick={() => onToggleKnown(id)} />
                          <button className="kanji-inline-link" lang="ja" onClick={() => onEntity(id)} aria-label={item.character}>
                            <b>{item.character}</b>
                          </button>
                          <span className="kanji-inline-body">
                            <span>{item.meanings.join(', ')}</span>
                            <small><KanjiReadings on={item.on} kun={item.kun} romaji={preferences.romaji} /></small>
                            <KanjiMemory item={item} kanji={dictionary.kanji} />
                          </span>
                        </div>
                      )) : preferences.canvasMode ? (
                        <div className="canvas-card canvas-card-kanji" key={id}>
                          <div className="canvas-card-primary" lang="ja"><b>{id}</b></div>
                          <div className="canvas-card-body"><span className="canvas-card-meaning">{t('kanjiDetailsUnavailable')}</span></div>
                        </div>
                      ) : <span className="kanji-character" lang="ja" key={id}>{id}</span>
                    );
                  })}
                </div>
              </section>
            )}
            {preferences.grammar && visibleGrammar.length > 0 && (
              <section>
                <h4>{t('grammarLabel')}</h4>
                <div className="grammar-notes">
                  {visibleGrammar.map(({ grammarId: id, role }, occurrenceIndex) => {
                    const item = dictionary.grammar.find((entry) => entry.id === id);
                    return (
                      item && (
                        <div className="grammar-note learning-card" data-entity-id={id} key={`${id}-${occurrenceIndex}`}>
                          <LearningToggle label={item.title} known={isKnown(id)} saving={saving} onClick={() => onToggleKnown(id)} />
                          <button className="text-link" onClick={() => onEntity(id)}>
                            {item.title}
                          </button>
                          <p>{role}</p>
                          <details>
                            <summary>{t('reveal')}</summary>
                            <p>{item.explanation}</p>
                            {item.examples.map((example) => <GrammarExample key={example.text} example={example} preferences={preferences} />)}
                          </details>
                        </div>
                      )
                    );
                  })}
                </div>
              </section>
            )}
            <section className="repetition-block">
              <h4>{t('repetition')}</h4>
              <p className="repetition-source" lang="ja">
                {sentence.segments.map((segment, partIndex) => (
                  <span key={partIndex}>
                    {showRuby && segment.reading ? (
                      <ruby>{segment.text}<rt>{segment.reading}</rt></ruby>
                    ) : (
                      segment.text
                    )}
                  </span>
                ))}
              </p>
              <div className={`translation-row repetition-lines ${preferences.translationsSeparateLine ? 'translations-separate' : ''}`}>
                {preferences.furigana && preferences.furiganaSeparateLine && (
                  <p className="translation-line" lang="ja">
                    <LayerHint label="furigana" /> {sentence.segments.map((segment, partIndex) => segment.reading ? (
                      <ruby key={partIndex}>{segment.text}<rt>{segment.reading}</rt></ruby>
                    ) : <span key={partIndex}>{segment.text}</span>)}
                  </p>
                )}
                {preferences.romaji && (
                  <p className={`reading-row ${preferences.romajiSeparateLine ? 'translation-line' : ''}`}>
                    <LayerHint label="romaji" /> {sentence.romaji}
                  </p>
                )}
                {preferences.literal && (
                  <p className={preferences.literalSeparateLine ? 'translation-line' : ''}>
                    <LayerHint label="literal" /> {sentence.literal}
                  </p>
                )}
                {preferences.natural && (
                  <p className={preferences.naturalSeparateLine ? 'translation-line' : ''}>
                    <LayerHint label="natural" /> {sentence.natural}
                  </p>
                )}
              </div>
            </section>
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
  const layerOptionsRef = useRef<HTMLDetailsElement>(null);
  const previousLearning = useRef<Record<string, LearningStatus>>({});
  const preferences = user.preferences;

  useEffect(() => {
    function closeLayerOptions(event: PointerEvent) {
      const menu = layerOptionsRef.current;
      if (menu?.open && event.target instanceof Node && !menu.contains(event.target)) {
        menu.open = false;
      }
    }
    document.addEventListener('pointerdown', closeLayerOptions);
    return () => document.removeEventListener('pointerdown', closeLayerOptions);
  }, []);

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
  async function toggleKnown(id: string) {
    const previousKey = `${user.owner}/${id}`;
    const currentStatus = user.data?.learning[id];
    const known = currentStatus === 'known' || currentStatus === 'mastered';
    const nextStatus = known ? previousLearning.current[previousKey] ?? 'learning' : 'known';
    if (!known) {
      previousLearning.current[previousKey] = currentStatus ?? 'encountered';
    }
    try {
      await user.save({ kind: 'learning', id, payload: { status: nextStatus } });
      if (known) {
        delete previousLearning.current[previousKey];
      }
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
        ...sentence.wordOccurrences.map((word) => word.wordId),
        ...sentence.kanjiIds,
        ...sentence.grammarOccurrences.map((occurrence) => occurrence.grammarId),
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
  function openEntity(id: string, sentenceId: string) {
    const kind = dictionary.data?.kanji.some((item) => item.id === id)
      ? 'kanji'
      : dictionary.data?.grammar.some((item) => item.id === id)
        ? 'grammar'
        : 'words';
    const returnTo = `/read/${bookId}/${chapterId}?sentence=${encodeURIComponent(sentenceId)}`;
    navigate(`/${kind}/${encodeURIComponent(id)}?returnTo=${encodeURIComponent(returnTo)}`);
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
  const emptyDictionary: Dictionary = { schemaVersion: 2, words: [], kanji: [], grammar: [] };
  const style = {
    '--reader-size': `${preferences.fontSize}px`,
    '--reading-size': `${preferences.readingFontSize}px`,
    '--translation-size': `${preferences.translationFontSize}px`,
    '--card-size': `${16 * preferences.cardScalePercent / 100}px`,
    '--words-size': `${16 * preferences.cardScalePercent / 100}px`,
    '--kanji-size': `${16 * preferences.cardScalePercent / 100}px`,
    '--grammar-size': `${16 * preferences.cardScalePercent / 100}px`,
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
        <details className="layer-options" ref={layerOptionsRef}>
          <summary>{t('settings')}</summary>
          <div>
            <label className="reader-range-row">
              <span>{t('mainText')} <b>{preferences.fontSize}px</b></span>
              <input type="range" min="16" max="42" value={preferences.fontSize} onChange={(event) => void savePreference('fontSize', Number(event.target.value))} />
            </label>
            {(['readingFontSize', 'translationFontSize'] as const).map((key) => (
              <label className="reader-range-row" key={key}>
                <span>{t(key === 'readingFontSize' ? 'readingLines' : 'translationLines')} <b>{preferences[key]}px</b></span>
                <input type="range" min="10" max="32" value={preferences[key]} onChange={(event) => void savePreference(key, Number(event.target.value))} />
              </label>
            ))}
            <label className="reader-range-row">
              <span>{t('cardText')} <b>{preferences.cardScalePercent}%</b></span>
              <input type="range" min="70" max="150" step="5" value={preferences.cardScalePercent} onChange={(event) => void savePreference('cardScalePercent', Number(event.target.value))} />
            </label>
            <label className="reader-canvas-row">
              <span>{t('canvasMode')}</span>
              <input type="checkbox" checked={preferences.canvasMode} onChange={(event) => void savePreference('canvasMode', event.target.checked)} />
            </label>
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
            <label>
              <input type="checkbox" checked={preferences.translationsSeparateLine} onChange={(event) => void savePreference('translationsSeparateLine', event.target.checked)} />
              {t('translationsSeparateLine')}
            </label>
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
                  open={preferences.canvasMode || preferences.mode !== 'continuous' || opened === sentence.id}
                  preferences={preferences}
                  dictionary={dictionary.data ?? emptyDictionary}
                  learning={user.data?.learning ?? {}}
                  saving={user.saving}
                  onOpen={() => void select(sentence, position)}
                  onEntity={(id) => openEntity(id, sentence.id)}
                  onToggleKnown={(id) => void toggleKnown(id)}
                />
              );
            })}
          </div>
        ))}
      </div>
      <div className="reader-controls">
        <Button
          data-testid="mark-read"
          className="reader-mark-button"
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
        <Button className="reader-previous-button" variant="outline" onClick={() => void move(-1)} disabled={current <= 0 || user.saving}>
          <ChevronLeft size={16} />
          {t('previous')}
        </Button>
        <span className="reader-progress-count">
          {String(current + 1).padStart(2, '0')} <i>/</i> {String(sentences.length).padStart(2, '0')}
        </span>
        <Button className="reader-next-button" onClick={() => void move(1)} disabled={current >= sentences.length - 1 || user.saving}>
          {t('next')}
          <ChevronRight size={16} />
        </Button>
      </div>
    </div>
  );
}
