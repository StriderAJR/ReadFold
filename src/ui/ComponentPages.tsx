import type { CSSProperties } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { useComponents, useUserData } from '../application/hooks';
import { Card } from '../components/ui/card';
import { ErrorState, PageTitle } from './Common';

export function ComponentForm({ form }: { form: string }) {
  return (
    <b lang={/\p{Script=Cyrillic}/u.test(form) ? 'ru' : 'ja'}
      className={[...form].length > 1 ? 'kanji-component-label' : undefined}>{form}</b>
  );
}

export function ComponentLinks({ forms, fallback }: { forms: string[]; fallback?: Record<string, string> }) {
  const { t } = useTranslation();
  const dictionary = useComponents();
  if (dictionary.isLoading) {
    return <p role="status">{t('loading')}</p>;
  }
  return (
    <>
      {dictionary.isError && <ErrorState message={t('error')} retry={() => void dictionary.refetch()} />}
      <div className="kanji-component-list">
        {forms.map((form) => {
          const entry = dictionary.data?.find((part) => part.form === form);
          return entry ? (
            <div className="kanji-component" key={form}>
              <ComponentForm form={form} />
              <Link to={`/components/${encodeURIComponent(entry.id)}`}>{entry.name}</Link>
            </div>
          ) : (
            <div className="kanji-component" key={form}>
              <ComponentForm form={form} />
              <span>{dictionary.isError ? fallback?.[form] ?? t('componentUnavailable') : t('componentUnavailable')}</span>
            </div>
          );
        })}
      </div>
    </>
  );
}

export function ComponentsPage() {
  const { t } = useTranslation();
  const dictionary = useComponents();
  const [search, setSearch] = useSearchParams();
  const query = search.get('q') ?? '';
  const matched = (dictionary.data ?? []).filter((entry) =>
    [entry.form, entry.name, entry.mnemonic].join(' ').toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  return (
    <>
      <PageTitle title={t('components')}><span className="count-pill">{matched.length}</span></PageTitle>
      <p className="muted">{t('componentsDescription')}</p>
      <div className="dictionary-filters">
        <label className="search-box dictionary-search">
          <Search size={18} aria-hidden="true" />
          <input value={query} aria-label={t('searchComponents')} placeholder={t('searchComponents')}
            onChange={(event) => setSearch(event.target.value ? { q: event.target.value } : {}, { replace: true })} />
        </label>
      </div>
      {dictionary.isLoading ? <p role="status">{t('loading')}</p> : dictionary.isError ? (
        <ErrorState message={t('error')} retry={() => void dictionary.refetch()} />
      ) : (
        <div className="dictionary-list component-dictionary">
          {matched.map((entry) => (
            <Link className="dictionary-row" key={entry.id} to={`/components/${encodeURIComponent(entry.id)}`}>
              <span className="dict-main component-list-form"><ComponentForm form={entry.form} /></span>
              <span className="dict-meaning">{entry.name}</span>
              <ChevronRight size={16} aria-hidden="true" />
            </Link>
          ))}
          {!matched.length && <Card className="state-card">{t('noResults')}</Card>}
        </div>
      )}
    </>
  );
}

export function ComponentPage() {
  const { id = '' } = useParams();
  const { t } = useTranslation();
  const dictionary = useComponents();
  const { preferences } = useUserData();
  const entry = dictionary.data?.find((part) => part.id === id);
  if (!entry) {
    return <ErrorState message={t(dictionary.isLoading ? 'loading' : dictionary.isError ? 'error' : 'noResults')}
      retry={dictionary.isError ? () => void dictionary.refetch() : undefined} />;
  }
  return (
    <>
      <Link className="back-link" to="/components"><ChevronLeft size={16} />{t('components')}</Link>
      <PageTitle title={entry.name} />
      <Card className="entity-card visual-component-card"
        style={{ '--entity-size': `${preferences.kanjiFontSize}px` } as CSSProperties}>
        <div className="component-card-form"><ComponentForm form={entry.form} /></div>
        <p className="muted">{t('mnemonicNotice')}</p>
        <section aria-label={t('mnemonic')}>
          <h3>{t('mnemonic')}</h3>
          <p className="kanji-mnemonic-phrase">{entry.mnemonic}</p>
        </section>
        {entry.components.length > 0 && (
          <section className="kanji-components">
            <h3>{t('mnemonicComponents')}</h3>
            <ComponentLinks forms={entry.components} />
          </section>
        )}
      </Card>
    </>
  );
}
