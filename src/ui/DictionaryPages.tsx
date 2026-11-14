import { useState, type CSSProperties, type ReactNode } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { useAppData, PageTitle, ErrorState } from './Common';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { useCatalog, useChapter, useDictionaryEntities, useDictionaryEntity, useDictionarySection, useOccurrences } from '../application/hooks';
import type { LearningStatus } from '../domain/user-state';
import { canonicalEntityId } from '../domain/entity-id-migration';
import { GrammarExample } from './GrammarExample';
import { KanjiReadings } from './KanjiReadings';
import { GrammarText } from './GrammarText';

function parseReturnContext(value: string | null): { bookId: string; chapterId: string; sentenceId: string } | null {
  const match = value?.match(/^\/read\/([a-z0-9.-]+)\/([a-z0-9.-]+)\?sentence=([a-z0-9.-]+)$/);
  return match ? { bookId: match[1], chapterId: match[2], sentenceId: match[3] } : null;
}

function InBookGrammarExample({
  grammarId,
  context,
  genericExamples,
  preferences,
}: {
  grammarId: string;
  context: { bookId: string; chapterId: string; sentenceId: string };
  genericExamples: import('../domain/content').Grammar['examples'];
  preferences: import('../domain/user-state').ReaderPreferences;
}) {
  const { t } = useTranslation();
  const catalog = useCatalog();
  const book = catalog.data?.find((entry) => entry.id === context.bookId);
  const metadata = book?.chapters.find((entry) => entry.id === context.chapterId);
  const chapter = useChapter(metadata?.path);
  const sentence = chapter.data?.paragraphs.flatMap((paragraph) => paragraph.sentences)
    .find((entry) => entry.id === context.sentenceId);
  const roles = sentence?.grammarOccurrences.filter((occurrence) => occurrence.grammarId === grammarId) ?? [];
  if (!sentence || !roles.length) {
    return null;
  }
  const example: import('../domain/content').Grammar['examples'][number] = {
    text: sentence.text,
    translation: sentence.natural,
    hiragana: sentence.hiragana,
    romaji: sentence.romaji,
    literal: sentence.literal,
    natural: sentence.natural,
    segments: sentence.segments,
  };
  return (
    <section className="grammar-examples in-book-grammar-example">
      <h3>{t('bookExample')}</h3>
      {!genericExamples.some((candidate) => candidate.text === sentence.text) && (
        <GrammarExample example={example} preferences={preferences} />
      )}
      {roles.map((occurrence, index) => (
        <p key={`${occurrence.grammarId}-${index}`}><small>{t('contextRole')}:</small> <GrammarText text={occurrence.role} segments={occurrence.roleSegments} preferences={preferences} /></p>
      ))}
    </section>
  );
}

export function DictionaryPage({ kind }: { kind: 'words' | 'kanji' | 'grammar' }) {
  const { t } = useTranslation();
  const { user, catalog } = useAppData({ loadDictionary: false });
  const dictionary = useDictionarySection(kind);
  const [search, setSearch] = useSearchParams();
  const [query, setQuery] = useState(search.get('q') ?? '');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sort, setSort] = useState('alphabetical');
  const items = dictionary.data;
  const matched = (items ?? [])
    .filter((item) => {
      const status = user.data?.learning[item.id];
      const queryMatch = JSON.stringify(item).toLocaleLowerCase().includes(query.toLocaleLowerCase());
      const statusMatch = statusFilter === 'all' || (statusFilter === 'unseen' ? !status : status === statusFilter);
      return queryMatch && statusMatch;
    })
    .sort((left, right) => {
      if (sort === 'alphabetical') {
        const getLabel = (item: NonNullable<typeof items>[number]) =>
          'surface' in item ? item.surface : 'character' in item ? item.character : item.title;
        return getLabel(left).localeCompare(getLabel(right));
      }
      return left.id.localeCompare(right.id);
    });

  return (
    <>
      <PageTitle title={t(kind)}>
        <span className="count-pill">{matched.length}</span>
      </PageTitle>
      <div className="dictionary-filters">
        <label className="search-box dictionary-search">
          <Search size={18} />
          <input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setSearch(event.target.value ? { q: event.target.value } : {});
            }}
            placeholder={t('search')}
          />
        </label>
        <label className="filter-select">
          <span>{t('status')}</span>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            {['all', 'unseen', 'encountered', 'learning', 'known', 'mastered'].map((value) => (
              <option key={value} value={value}>
                {t(value)}
              </option>
            ))}
          </select>
        </label>
        <label className="filter-select">
          <span>{t('sort')}</span>
          <select value={sort} onChange={(event) => setSort(event.target.value)}>
            <option value="alphabetical">{t('alphabetical')}</option>
            <option value="id">{t('sortById')}</option>
          </select>
        </label>
      </div>
      {dictionary.isLoading ? (
        <p>{t('loading')}</p>
      ) : dictionary.isError ? (
        <ErrorState message={t('error')} retry={() => void dictionary.refetch()} />
      ) : (
        <div className="dictionary-list">
          {matched.map((item) => {
            const id = item.id;
            const status = user.data?.learning[id];
            const detail: ReactNode =
              kind === 'words' && 'dictionaryForm' in item
                ? `${item.dictionaryForm} · ${item.reading}${user.preferences.romaji ? ` · ${item.romaji}` : ''}`
                : kind === 'kanji' && 'on' in item
                  ? <KanjiReadings on={item.on} kun={item.kun} romaji={user.preferences.romaji} />
                  : '';
            const label =
              kind === 'words' && 'surface' in item
                ? item.surface
                : kind === 'kanji' && 'character' in item
                  ? item.character
                  : 'title' in item
                    ? item.title
                    : '';
            const meaning =
              kind === 'grammar' && 'explanation' in item
                ? <GrammarText text={item.explanation} segments={'explanationSegments' in item ? item.explanationSegments : undefined} preferences={user.preferences} />
                : 'meanings' in item
                  ? item.meanings.join('、')
                  : '';
            return (
              <Link className="dictionary-row" key={id} to={`/${kind}/${encodeURIComponent(id)}`}>
                <span className="dict-main">
                  <b className={kind === 'kanji' ? 'kanji-large' : ''}>{label}</b>
                  <small>{detail}</small>
                </span>
                <span className="dict-meaning">{meaning}</span>
                {status && <span className={`status-chip ${status}`}>{t(status)}</span>}
                <ChevronRight size={16} />
              </Link>
            );
          })}
          {!matched.length && <Card className="state-card">{t('noResults')}</Card>}
        </div>
      )}
      <span className="visually-hidden">{catalog.data?.length}</span>
    </>
  );
}
export function EntityPage({ kind }: { kind: 'words' | 'kanji' | 'grammar' }) {
  const { id = '' } = useParams();
  const [searchParams] = useSearchParams();
  const requestedReturn = searchParams.get('returnTo');
  const returnContext = parseReturnContext(requestedReturn);
  const returnTo = returnContext ? requestedReturn : null;
  const { t } = useTranslation();
  const { user } = useAppData({ loadDictionary: false });
  const dictionary = useDictionaryEntity(id);
  const item = dictionary.data;
  const linkedIds = item && 'wordIds' in item ? item.wordIds : item && 'relatedIds' in item ? item.relatedIds : [];
  const linkedCards = useDictionaryEntities(linkedIds, Boolean(item));
  const occurrences = useOccurrences(kind, id, Boolean(item));
  const detail = occurrences.data?.occurrences ?? [];
  const [limit, setLimit] = useState(25);
  const manualStatuses =
    user.data?.operations.filter(
      (operation) => operation.entityKind === 'learning' && canonicalEntityId(operation.entityId) === id && !operation.payload.automatic,
    ) ?? [];
  const previousStatus = (manualStatuses.at(-2)?.payload.status ?? 'encountered') as LearningStatus;
  if (!item) {
    return <ErrorState
      message={dictionary.isLoading ? t('loading') : dictionary.isError ? t('error') : t('noResults')}
      retry={dictionary.isError ? () => void dictionary.refetch() : undefined}
    />;
  }
  let title = '';
  let sub = '';
  let kanjiReadings: ReactNode = null;
  let meaning = '';
  let examples: import('../domain/content').Grammar['examples'] = [];
  let related: { id: string; label: string; kind: 'words' | 'kanji' | 'grammar' }[] = [];
  if (kind === 'words' && 'surface' in item) {
    title = item.surface;
    sub = `${item.dictionaryForm} · ${item.reading}${user.preferences.romaji ? ` · ${item.romaji}` : ''} · ${item.partOfSpeech}`;
    meaning = item.meanings.join('、');
  } else if (kind === 'kanji' && 'character' in item) {
    title = item.character;
    kanjiReadings = <KanjiReadings on={item.on} kun={item.kun} romaji={user.preferences.romaji} />;
    meaning = item.meanings.join('、');
    related = item.wordIds.flatMap((wordId) => {
      const word = linkedCards.data?.words.find((entry) => entry.id === wordId);
      return word ? [{ id: word.id, label: word.surface, kind: 'words' as const }] : [];
    });
  } else if (kind === 'grammar' && 'title' in item) {
    title = item.title;
    sub = t('grammarLabel');
    meaning = item.explanation;
    examples = item.examples;
    related = item.relatedIds.flatMap((relatedId) => {
      const grammar = linkedCards.data?.grammar.find((entry) => entry.id === relatedId);
      return grammar ? [{ id: grammar.id, label: grammar.title, kind: 'grammar' as const }] : [];
    });
  }
  return (
    <>
      <Link className="back-link" to={returnTo ?? `/${kind}`}>
        <ChevronLeft size={16} />
        {returnTo ? t('backToReading') : t(kind)}
      </Link>
      <PageTitle title={title}>
        <span className={`status-chip ${user.data?.learning[id] ?? 'unseen'}`}>
          {user.data?.learning[id] ? t(user.data.learning[id]) : t('unseen')}
        </span>
      </PageTitle>
      <Card className="entity-card" style={{
        '--grammar-size': `${user.preferences.grammarFontSize}px`,
        '--reading-size': `${user.preferences.readingFontSize}px`,
        '--translation-size': `${user.preferences.translationFontSize}px`,
        '--entity-size': `${kind === 'words' ? user.preferences.wordsFontSize : kind === 'kanji' ? user.preferences.kanjiFontSize : user.preferences.grammarFontSize}px`,
      } as CSSProperties}>
        {kind === 'kanji' ? (
          <div className="kanji-overview">
            <section className="kanji-overview-block">
              <h3>{t('kanjiLabel')}</h3>
              <div className="entity-reading">{kanjiReadings}</div>
            </section>
            <section className="kanji-overview-block kanji-meaning-block">
              <h3>{t('meaning')}</h3>
              <p>{meaning}</p>
            </section>
          </div>
        ) : (
          <>
            <p className="entity-reading">{sub}</p>
            <p>{kind === 'grammar' ? <GrammarText text={meaning} segments={'explanationSegments' in item ? item.explanationSegments : undefined} preferences={user.preferences} /> : meaning}</p>
          </>
        )}
        {examples.length > 0 && (
          <div className="grammar-examples">
            {examples.map((ex, i) => (
              <GrammarExample key={i} example={ex} preferences={user.preferences} />
            ))}
          </div>
        )}
        {kind === 'grammar' && returnContext && (
          <InBookGrammarExample
            grammarId={id}
            context={returnContext}
            genericExamples={examples}
            preferences={user.preferences}
          />
        )}
        {kind === 'kanji' && 'character' in item && (
          <section className="kanji-mnemonic" aria-label={t('mnemonic')}>
            <h3>{t('mnemonic')}</h3>
            <p className="muted">{t('mnemonicNotice')}</p>
            {item.components.length > 0 && (
              <div className="kanji-components">
                <h4>{t('mnemonicComponents')}</h4>
                <div className="kanji-component-list">
                  {item.components.map((component) => (
                    <div className="kanji-component" key={component}>
                      <b lang="ja">{component}</b>
                      <span>{item.componentMeanings?.[component] ?? component}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {item.mnemonic && <p className="kanji-mnemonic-phrase">{item.mnemonic}</p>}
          </section>
        )}
        {related.length > 0 && (
          <section className="kanji-related">
            <h3>{t('related')}</h3>
            <div className="inline-links">
              {related.map((entry) => (
                <Link key={entry.id} to={`/${entry.kind}/${encodeURIComponent(entry.id)}${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ''}`}>
                  {entry.label}
                </Link>
              ))}
            </div>
          </section>
        )}
        <div className="entity-actions">
          {(['learning', 'known'] as const).map((status) => (
            <Button
              key={status}
              variant={user.data?.learning[id] === status ? 'default' : 'outline'}
              onClick={() => void user.save({ kind: 'learning', id, payload: { status } })}
            >
              {t(status === 'learning' ? 'markLearning' : 'markKnown')}
            </Button>
          ))}
          {user.data?.learning[id] && (
            <Button
              variant="ghost"
              onClick={() => void user.save({ kind: 'learning', id, payload: { status: previousStatus } })}
            >
              {t('undoStatus')}
            </Button>
          )}
        </div>
      </Card>
      <section className="section-block">
        <div className="section-heading">
          <h2>{t('occurrences')}</h2>
          <span>{detail.length}</span>
        </div>
        {detail.length ? (
          detail.slice(0, limit).map(({ book, chapter, sentence }) => (
            <Link
              className="occurrence-row"
              key={`${chapter.id}-${sentence.id}`}
              to={`/read/${book.id}/${chapter.id}?sentence=${sentence.id}`}
            >
              <b>{sentence.text}</b>
              <small>
                {book.title} · {chapter.title}
              </small>
            </Link>
          ))
        ) : (
          <p className="muted">
            {t(occurrences.isLoading ? 'loading' : occurrences.isError ? 'error' : 'noOccurrences')}
          </p>
        )}
        {occurrences.data?.partial && <p className="muted">{t('partialOccurrences')}</p>}
        {detail.length > limit && (
          <Button variant="outline" onClick={() => setLimit((value) => value + 25)}>
            {t('more')}
          </Button>
        )}
      </section>
    </>
  );
}
