import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Bookmark } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { useCatalog, useDictionary, useUserData } from '../application/hooks';
import type { BookMetadata } from '../domain/content';
export function download(name: string, value: unknown) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' });
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(href);
}
export function useAppData() {
  const query = useUserData();
  const catalog = useCatalog();
  const dictionary = useDictionary();
  const user = {
    ...query,
    save: async (input: Parameters<typeof query.save>[0]) => {
      try {
        await query.save(input);
        return true;
      } catch {
        return false;
      }
    },
  };
  return { user, catalog, dictionary };
}
export function PageTitle({ title, children }: { title: string; children?: ReactNode }) {
  const { t } = useTranslation();
  return (
    <div className="page-title">
      <div>
        <p className="eyebrow">
          {t('brand')} · {t('languageJapanese').toUpperCase()}
        </p>
        <h1>{title}</h1>
      </div>
      {children}
    </div>
  );
}
export function ErrorState({ retry, message }: { retry?: () => void; message: string }) {
  return (
    <Card className="state-card">
      <p>{message}</p>
      {retry && (
        <Button variant="outline" onClick={retry}>
          {'↻'}
        </Button>
      )}
    </Card>
  );
}
export function BookArt({ cover }: { cover: string }) {
  return /^(?:covers|books)\/[\w/.-]+\.(?:png|jpe?g|svg|webp)$/i.test(cover) ? (
    <img src={`${import.meta.env.BASE_URL}${cover}`} alt="" loading="lazy" />
  ) : (
    <span className="cover-monogram" aria-hidden="true">
      {cover}
    </span>
  );
}
export function BookCard({
  book,
  favorite,
  onFavorite,
  progress,
}: {
  book: BookMetadata;
  favorite: boolean;
  onFavorite: () => void;
  progress?: number;
}) {
  const { t } = useTranslation();
  return (
    <Card data-testid="book-card" className="book-card">
      <Link to={`/book/${book.id}`} className="book-cover" aria-label={book.title}>
        <BookArt cover={book.cover} />
        <span className="cover-badge">{book.difficulty}</span>
      </Link>
      <div className="book-info">
        <div className="book-heading">
          <Link to={`/book/${book.id}`}>
            <h3>{book.title}</h3>
          </Link>
          <button
            className={`icon-action ${favorite ? 'selected' : ''}`}
            onClick={onFavorite}
            aria-label={favorite ? t('unfavorite') : t('favorite')}
          >
            <Bookmark size={17} fill={favorite ? 'currentColor' : 'none'} />
          </button>
        </div>
        {book.translatedTitle && <p className="muted">{book.translatedTitle}</p>}
        <p className="muted">{book.author}</p>
        <p className="book-description">{book.description}</p>
        <div className="book-meta">
          <span>
            {book.chapters.length} {t('chapters').toLowerCase()}
          </span>
          <span>{book.originalLanguage}</span>
        </div>
        {progress !== undefined && (
          <div className="progress-line">
            <span style={{ width: `${progress}%` }} />
          </div>
        )}
      </div>
    </Card>
  );
}
