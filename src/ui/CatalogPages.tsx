import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, ListChecks, Search, Sparkles, X } from 'lucide-react';
import { useAppData, PageTitle, ErrorState, BookCard, BookArt } from './Common';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
export function HomePage() {
  const { t } = useTranslation();
  const { user, catalog, dictionary } = useAppData();
  const books = catalog.data ?? [];
  const reading = Object.entries(user.data?.readings ?? {}).sort(([, a], [, b]) =>
    b.updatedAt.localeCompare(a.updatedAt),
  );
  const [readingKey, last] = reading[0] ?? [];
  const [resumeBook, resumeChapter] = readingKey?.split('/') ?? [];
  const book = books.find((item) => item.id === resumeBook);
  const chapter = book?.chapters.find((item) => item.id === resumeChapter);
  return (
    <div className="home-page">
      <section className="hero">
        <div className="hero-content">
          <span className="hero-kicker">
            <Sparkles size={15} /> {t('readerKicker')}
          </span>
          <h1>{t('tagline')}</h1>
          <p>
            {t('appTitle')}
            <br />
            <small>{t('slogan')}</small>
          </p>
          <Button asChild>
            <Link
              to={book && last && chapter ? `/read/${book.id}/${chapter.id}?sentence=${last.sentenceId}` : '/library'}
            >
              {book ? t('continue') : t('explore')} <ChevronRight size={17} />
            </Link>
          </Button>
          <div className="hero-stats">
            <span>
              <b>{books.length.toString().padStart(2, '0')}</b>
              {t('library')}
            </span>
            <span>
              <b>{dictionary.data?.words.length ?? '—'}</b>
              {t('words')}
            </span>
            <span>
              <b>{Object.values(user.data?.learning ?? {}).filter((x) => x === 'mastered').length}</b>
              {t('masteredCount')}
            </span>
          </div>
        </div>
        <div className="hero-art">
          <div className="sun-disc" />
          <div className="art-book">
            <img src={`${import.meta.env.BASE_URL}brand/icon.jpg`} alt="" />
          </div>
          <span className="art-kanji">読</span>
          <span className="art-note">{t('readSlowly')}</span>
        </div>
      </section>
      <section className="section-block">
        <div className="section-heading">
          <div>
            <p className="eyebrow">{t('choose')}</p>
            <h2>{t('continue')}</h2>
          </div>
          <Link className="text-link" to="/library">
            {t('explore')} <ChevronRight size={16} />
          </Link>
        </div>
        {catalog.isLoading ? (
          <p className="muted">{t('loading')}</p>
        ) : catalog.isError ? (
          <ErrorState message={t('error')} retry={() => void catalog.refetch()} />
        ) : (
          <div className="book-grid">
            {books.slice(0, 3).map((b) => (
              <BookCard
                key={b.id}
                book={b}
                favorite={user.data?.favorites.includes(b.id) ?? false}
                onFavorite={() =>
                  void user.save({
                    kind: 'favorite',
                    id: b.id,
                    payload: { active: !user.data?.favorites.includes(b.id) },
                  })
                }
                progress={Math.round(
                  (100 *
                    b.chapters.reduce(
                      (sum, chapter) => sum + (user.data?.readings[`${b.id}/${chapter.id}`]?.sentenceIds.length ?? 0),
                      0,
                    )) /
                    b.chapters.reduce((sum, chapter) => sum + chapter.sentenceCount, 0),
                )}
              />
            ))}
          </div>
        )}
      </section>
      <section className="home-bottom">
        <Card className="review-promo">
          <span className="promo-icon">
            <ListChecks />
          </span>
          <div>
            <p className="eyebrow">{t('dailyPractice')}</p>
            <h3>{t('reviews')}</h3>
            <p className="muted">{t('noReviews')}</p>
          </div>
          <Button asChild variant="outline">
            <Link to="/reviews">
              {t('reviewStart')} <ChevronRight size={16} />
            </Link>
          </Button>
        </Card>
        <Card className="quote-card">
          <p className="eyebrow">{t('wordOfDay')}</p>
          <div className="quote-kanji">毎日</div>
          <p>
            {t('quoteJapanese')}
            <br />
            <span>{t('quoteTranslation')}</span>
          </p>
        </Card>
      </section>
    </div>
  );
}
export function LibraryPage() {
  const { t } = useTranslation();
  const { catalog, user, dictionary } = useAppData();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [difficulty, setDifficulty] = useState('all');
  const recent = Object.keys(user.data?.readings ?? {}).map((id) => id.split('/')[0]);
  const books = (catalog.data ?? []).filter((b) => {
    const q = query.toLowerCase();
    const match =
      `${b.title} ${b.author} ${b.description} ${b.tags.join(' ')}`.toLowerCase().includes(q) ||
      (dictionary.data?.words.some((w) => `${w.surface} ${w.meanings.join(' ')}`.toLowerCase().includes(q)) ?? false) ||
      (dictionary.data?.kanji.some((k) => `${k.character} ${k.meanings.join(' ')}`.toLowerCase().includes(q)) ??
        false) ||
      (dictionary.data?.grammar.some((g) => `${g.title} ${g.explanation}`.toLowerCase().includes(q)) ?? false);
    return (
      match &&
      (difficulty === 'all' || b.difficulty === difficulty) &&
      (filter === 'all' ||
        (filter === 'favorites' && user.data?.favorites.includes(b.id)) ||
        (filter === 'recent' && recent.includes(b.id)))
    );
  });
  const difficulties = [...new Set((catalog.data ?? []).map((book) => book.difficulty))];
  return (
    <>
      <PageTitle title={t('library')}>
        <span className="count-pill">{catalog.data?.length ?? 0}</span>
      </PageTitle>
      <div className="search-row">
        <label className="search-box">
          <Search size={18} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('searchContent')} />
          {query && (
            <button onClick={() => setQuery('')} aria-label={t('clearSearch')}>
              <X size={16} />
            </button>
          )}
        </label>
        <label className="filter-select">
          <span>{t('difficulty')}</span>
          <select aria-label={t('difficulty')} value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
            <option value="all">{t('all')}</option>
            {difficulties.map((level) => (
              <option key={level}>{level}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="filter-tabs">
        {['all', 'favorites', 'recent'].map((x) => (
          <button key={x} className={filter === x ? 'selected' : ''} onClick={() => setFilter(x)}>
            {t(x)}
          </button>
        ))}
      </div>
      {catalog.isLoading ? (
        <p>{t('loading')}</p>
      ) : catalog.isError ? (
        <ErrorState message={t('error')} retry={() => void catalog.refetch()} />
      ) : books.length ? (
        <div className="book-grid">
          {books.map((b) => (
            <BookCard
              key={b.id}
              book={b}
              favorite={user.data?.favorites.includes(b.id) ?? false}
              onFavorite={() =>
                void user.save({
                  kind: 'favorite',
                  id: b.id,
                  payload: { active: !user.data?.favorites.includes(b.id) },
                })
              }
            />
          ))}
        </div>
      ) : (
        <Card className="state-card">{catalog.data?.length ? t('noResults') : t('noBooks')}</Card>
      )}
    </>
  );
}
export function BookPage() {
  const { bookId = '' } = useParams();
  const { t } = useTranslation();
  const { catalog, user } = useAppData();
  const book = catalog.data?.find((b) => b.id === bookId);
  if (!book) {
    return <ErrorState message={catalog.isLoading ? t('loading') : t('noResults')} />;
  }
  const reading = book.chapters.map((c) => user.data?.readings[`${book.id}/${c.id}`]);
  return (
    <>
      <Link className="back-link" to="/library">
        <ChevronLeft size={16} />
        {t('library')}
      </Link>
      <div className="book-detail">
        <div className="detail-cover">
          <BookArt cover={book.cover} />
        </div>
        <div className="detail-content">
          <p className="eyebrow">
            {book.originalLanguage} · {book.difficulty}
          </p>
          <h1>{book.title}</h1>
          <p className="detail-author">{book.author}</p>
          <p>{book.description}</p>
          <div className="tag-list">
            {book.tags.map((tag) => (
              <span key={tag}>{tag}</span>
            ))}
          </div>
          <small>
            {book.license} · {book.source}
          </small>
        </div>
      </div>
      <section className="chapter-section">
        <div className="section-heading">
          <h2>{t('chapters')}</h2>
          <span>{book.chapters.length}</span>
        </div>
        {book.chapters.map((chapter, index) => (
          <Link
            key={chapter.id}
            className="chapter-row"
            to={`/read/${book.id}/${chapter.id}${reading[index]?.sentenceId ? `?sentence=${reading[index]?.sentenceId}` : ''}`}
          >
            <span className="chapter-number">{String(index + 1).padStart(2, '0')}</span>
            <span className="chapter-name">
              <b>{chapter.title}</b>
              <small>
                {chapter.sentenceCount} · {reading[index] ? t('resume') : t('read')}
              </small>
            </span>
            <div className="chapter-progress">
              <span
                style={{
                  width: `${Math.min(100, (((reading[index]?.maxPosition ?? -1) + 1) / chapter.sentenceCount) * 100)}%`,
                }}
              />
            </div>
            <ChevronRight size={18} />
          </Link>
        ))}
      </section>
    </>
  );
}
