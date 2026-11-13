import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, Route, Routes } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ChartNoAxesColumn,
  CircleHelp,
  Home,
  Languages,
  Library,
  ListChecks,
  Menu,
  Moon,
  Settings,
  Sparkles,
  Sun,
  UserRound,
  X,
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { useSyncInfo, useUserData } from '../application/hooks';
import { local, services, synchronize, useLocalFailure, useSession } from '../application/runtime';
import { ReaderPage } from './ReaderPage';
import { BookPage, HomePage, LibraryPage } from './CatalogPages';
import { DictionaryPage, EntityPage } from './DictionaryPages';
import { ReviewsPage, StatisticsPage } from './PracticePages';
import { AccountPage, DiagnosticsPage, SettingsPage } from './AccountPages';
import { ErrorState, download } from './Common';
const nav = [
  ['/', 'home', Home],
  ['/library', 'library', Library],
  ['/words', 'words', Languages],
  ['/kanji', 'kanji', Sparkles],
  ['/grammar', 'grammar', CircleHelp],
  ['/reviews', 'reviews', ListChecks],
  ['/statistics', 'statistics', ChartNoAxesColumn],
  ['/settings', 'settings', Settings],
  ['/account', 'account', UserRound],
] as const;

function Layout({ children }: { children: ReactNode }) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) {
      return;
    }
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [open]);
  const user = useUserData();
  const syncInfo = useSyncInfo();
  const localFailure = useLocalFailure((state) => state.failed);
  const identity = useSession((state) => state.identity);
  useEffect(() => {
    void i18n.changeLanguage(user.preferences.language);
    document.documentElement.lang = user.preferences.language;
  }, [user.preferences.language, i18n]);
  useEffect(() => {
    const applyTheme = () => {
      document.documentElement.dataset.theme =
        user.preferences.theme === 'system'
          ? window.matchMedia('(prefers-color-scheme: dark)').matches
            ? 'dark'
            : 'light'
          : user.preferences.theme;
    };
    applyTheme();
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    media.addEventListener('change', applyTheme);
    return () => media.removeEventListener('change', applyTheme);
  }, [user.preferences.theme]);
  return (
    <div className="app-shell">
      <aside id="primary-sidebar" className={`sidebar ${open ? 'sidebar-open' : ''}`}>
        <Link className="brand" to="/" onClick={() => setOpen(false)}>
          <img src={`${import.meta.env.BASE_URL}brand/icon.jpg`} alt="" />
          <span>
            ReadFold<small>{t('tagline')}</small>
          </span>
        </Link>
        <nav aria-label={t('appTitle')}>
          {nav.map(([href, key, Icon]) => (
            <NavLink
              key={href}
              to={href}
              end={href === '/'}
              onClick={() => setOpen(false)}
              className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
            >
              <Icon size={18} />
              <span>{t(key)}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <span
            className={`sync-dot ${syncInfo.status === 'syncError' ? 'sync-dot-error' : syncInfo.status === 'pending' ? 'sync-dot-pending' : ''}`}
          />
          <span>
            {t(
              (
                {
                  loading: 'loading',
                  guest: 'syncGuest',
                  offline: 'syncOffline',
                  pending: 'syncPending',
                  synced: 'syncSynced',
                  paused: 'syncDisabled',
                  syncError: 'syncFailedShort',
                } as const
              )[syncInfo.status] ?? 'loading',
            )}
            {syncInfo.pending > 0 ? ` · ${syncInfo.pending}` : ''}
          </span>
        </div>
      </aside>
      {open && <button aria-label={t('back')} className="sidebar-scrim" onClick={() => setOpen(false)} />}
      <div className="main-column">
        <header className="topbar">
          <Button
            variant="ghost"
            size="icon"
            className="mobile-menu"
            aria-label={t('library')}
            aria-controls="primary-sidebar"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            {open ? <X /> : <Menu />}
          </Button>
          <Link to="/" className="mobile-brand">
            ReadFold
          </Link>
          <div className="topbar-spacer" />
          <Link className="topbar-link" to="/account">
            <span className="avatar">
              <UserRound size={17} />
            </span>
            <span>{identity ? t('account') : t('guest')}</span>
          </Link>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t('theme')}
            onClick={() =>
              void user.save({
                kind: 'preferences',
                id: 'reader',
                payload: { theme: user.preferences.theme === 'dark' ? 'light' : 'dark' },
              })
            }
          >
            {user.preferences.theme === 'dark' ? <Sun /> : <Moon />}
          </Button>
        </header>
        {(localFailure || user.saveError || user.isError || syncInfo.status === 'syncError') && (
          <div className="global-alert" role="status">
            {localFailure || user.saveError || user.isError ? t('localSaveError') : t('syncFailedShort')}{' '}
            <button onClick={async () => download('readfold-backup.json', await local.exportData(user.owner))}>
              {t('export')}
            </button>
          </div>
        )}
        <main id="main-content">{children}</main>
        <footer>
          <span>{t('appTitle')}</span>
          <a href={`${import.meta.env.BASE_URL}privacy.html`}>{t('privacy')}</a>
          <a href={`${import.meta.env.BASE_URL}terms.html`}>{t('terms')}</a>
        </footer>
      </div>
    </div>
  );
}
function AppEffects() {
  const identity = useSession((state) => state.identity);
  const setSession = useSession((state) => state.setSession);
  const preferences = useUserData().preferences;
  useEffect(() => {
    let mounted = true;
    let authEventSeen = false;
    if (!services) {
      setSession(null);
      return () => {
        mounted = false;
      };
    }
    const unsubscribe = services.auth.subscribe(
      (nextIdentity) => {
        authEventSeen = true;
        setSession(nextIdentity);
      },
      () => {
        if (mounted) {
          setSession(useSession.getState().identity, true);
        }
      },
    );
    void services.auth
      .restore()
      .then((restoredIdentity) => {
        if (mounted && !authEventSeen) {
          setSession(restoredIdentity);
        }
      })
      .catch(() => {
        if (mounted) {
          setSession(useSession.getState().identity, true);
        }
      });
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [setSession]);
  useEffect(() => {
    if (!identity || !preferences.syncEnabled) {
      return;
    }
    const tick = () => {
      if (navigator.onLine && document.visibilityState === 'visible') {
        void synchronize().catch(() => undefined);
      }
    };
    tick();
    const interval = window.setInterval(tick, 15000);
    window.addEventListener('focus', tick);
    window.addEventListener('online', tick);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', tick);
      window.removeEventListener('online', tick);
    };
  }, [identity, preferences.syncEnabled]);
  return null;
}
function MissingPage() {
  const { t } = useTranslation();
  return <ErrorState message={t('noResults')} />;
}
export function App() {
  return (
    <>
      <AppEffects />
      <Layout>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/library" element={<LibraryPage />} />
          <Route path="/book/:bookId" element={<BookPage />} />
          <Route path="/read/:bookId/:chapterId" element={<ReaderPage />} />
          <Route path="/words" element={<DictionaryPage kind="words" />} />
          <Route path="/kanji" element={<DictionaryPage kind="kanji" />} />
          <Route path="/grammar" element={<DictionaryPage kind="grammar" />} />
          <Route path="/words/:id" element={<EntityPage kind="words" />} />
          <Route path="/kanji/:id" element={<EntityPage kind="kanji" />} />
          <Route path="/grammar/:id" element={<EntityPage kind="grammar" />} />
          <Route path="/reviews" element={<ReviewsPage />} />
          <Route path="/statistics" element={<StatisticsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/settings/diagnostics" element={<DiagnosticsPage />} />
          <Route path="/account" element={<AccountPage />} />
          <Route path="*" element={<MissingPage />} />
        </Routes>
      </Layout>
    </>
  );
}
