import type { CSSProperties } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { useDictionaryEntity, useDictionarySection, useKanjiPartTree, useUserData } from '../application/hooks';
import type { Kanji } from '../domain/content';
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
  const dictionary = useKanjiPartTree(forms);
  if (dictionary.isLoading) {
    return <p role="status">{t('loading')}</p>;
  }
  return (
    <>
      {dictionary.isError && <ErrorState message={t('error')} retry={() => void dictionary.refetch()} />}
      <div className="kanji-component-list">
        {forms.map((form) => {
          const entry = dictionary.data?.find((part) => part.character === form);
          return entry ? (
            <div className="kanji-component" key={form}>
              <ComponentForm form={form} />
              <Link to={`/${entry.isMnemonicPartOnly ? 'components' : 'kanji'}/${encodeURIComponent(entry.id)}`}>
                {entry.meanings[0]}
              </Link>
            </div>
          ) : (
            <div className="kanji-component" key={form}>
              <ComponentForm form={form} />
              <span>{fallback?.[form] ?? (dictionary.isError ? t('componentUnavailable') : form)}</span>
            </div>
          );
        })}
      </div>
    </>
  );
}

export function ComponentsPage() {
  const { t } = useTranslation();
  const dictionary = useDictionarySection('kanji');
  const [search, setSearch] = useSearchParams();
  const query = search.get('q') ?? '';
  const kanji = (dictionary.data ?? []).filter((entry): entry is Kanji => 'character' in entry);
  const referenced = new Set(kanji.flatMap((entry) => entry.components));
  const matched = kanji.filter((entry) =>
    (entry.isMnemonicPartOnly || referenced.has(entry.character)) &&
    [entry.character, ...entry.meanings, entry.mnemonic ?? ''].join(' ').toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
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
              <span className="dict-main component-list-form"><ComponentForm form={entry.character} /></span>
              <span className="dict-meaning">{entry.meanings[0]}</span>
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
  const legacyCodepoint = /^ja:component:u([0-9a-f]+)$/u.exec(id)?.[1];
  const legacyCharacter = legacyCodepoint ? String.fromCodePoint(Number.parseInt(legacyCodepoint, 16)) : null;
  const canonicalId = legacyCharacter ? `ja:kanji:${legacyCharacter}` : id;
  const dictionary = useDictionaryEntity(canonicalId, canonicalId.startsWith('ja:kanji:'));
  const { preferences } = useUserData();
  const entry = dictionary.data && 'character' in dictionary.data ? dictionary.data : null;
  if (!entry) {
    return <ErrorState message={t(dictionary.isLoading ? 'loading' : dictionary.isError ? 'error' : 'noResults')}
      retry={dictionary.isError ? () => void dictionary.refetch() : undefined} />;
  }
  return (
    <>
      <Link className="back-link" to="/components"><ChevronLeft size={16} />{t('components')}</Link>
      <PageTitle title={entry.meanings[0]} />
      <Card className="entity-card visual-component-card"
        style={{ '--entity-size': `${preferences.kanjiFontSize}px` } as CSSProperties}>
        <div className="component-card-form"><ComponentForm form={entry.character} /></div>
        <p className="muted">{t('mnemonicNotice')}</p>
        <section aria-label={t('mnemonic')}>
          <h3>{t('mnemonic')}</h3>
          <p className="kanji-mnemonic-phrase">{entry.mnemonic ?? entry.meanings[0]}</p>
        </section>
        {entry.components.length > 0 && (
          <section className="kanji-components">
            <h3>{t('mnemonicComponents')}</h3>
            <ComponentLinks forms={entry.components} fallback={entry.componentMeanings} />
          </section>
        )}
      </Card>
    </>
  );
}
