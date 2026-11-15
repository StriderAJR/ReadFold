import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, Route, Routes, useLocation } from 'react-router-dom';
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
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { useSyncInfo, useUserData } from '../application/hooks';
import { local, services, synchronize, useLocalFailure, useSession } from '../application/runtime';
import { ReaderPage } from './ReaderPage';
import { BookPage, HomePage, LibraryPage } from './CatalogPages';
import { DictionaryPage, EntityPage } from './DictionaryPages';
import { ComponentPage, ComponentsPage } from './ComponentPages';
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
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [windowWidth, setWindowWidth] = useState(() => window.innerWidth);
  const [isMobile, setIsMobile] = useState(() => window.matchMedia('(max-width: 760px)').matches);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 760px)');
    const update = () => setIsMobile(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  const toggleSidebar = () => {
    if (isMobile) {
      setOpen(false);
    } else {
      setCollapsed(!collapsed);
    }
  };
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
  useEffect(() => {
    const update = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  const isReader = location.pathname.startsWith('/read/');
  const padding = windowWidth <= 760 ? 18 : Math.min(70, Math.max(24, windowWidth * 0.05));
  const expandedSidebarWidth = windowWidth <= 1100 ? 218 : 246;
  const autoCollapsed = isReader && windowWidth > 760 && windowWidth - expandedSidebarWidth - 2 * padding < user.preferences.width;
  const sidebarWidth = windowWidth <= 760 ? 0 : (collapsed || autoCollapsed ? 78 : expandedSidebarWidth);
  const availableReaderWidth = Math.min(1180, windowWidth - sidebarWidth) - 2 * padding + (windowWidth <= 760 ? 10 : 0);
  const readerAreaNarrow = isReader && availableReaderWidth < user.preferences.width;
  const syncInfo = useSyncInfo();
  const localFailure = useLocalFailure((state) => state.failed);
  const syncStatusLabel = t(
    ({
      loading: 'loading',
      guest: 'syncGuest',
      offline: 'syncOffline',
      pending: 'syncPending',
      synced: 'syncSynced',
      paused: 'syncDisabled',
      syncError: 'syncFailedShort',
    } as const)[syncInfo.status] ?? 'loading',
  );
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
    <div className={`app-shell ${readerAreaNarrow ? 'reader-area-narrow' : ''}`}>
      <aside id="primary-sidebar" className={`sidebar ${collapsed || autoCollapsed ? 'sidebar-collapsed' : ''} ${open ? 'sidebar-open' : ''}`}>
        <div className="sidebar-header">
          <Link className="brand" to="/" onClick={() => setOpen(false)}>
            <img src={`${import.meta.env.BASE_URL}brand/icon.jpg`} alt="" />
            <span>
              ReadFold<small>{t('tagline')}</small>
            </span>
          </Link>
          <Button variant="ghost" size="icon" className="sidebar-menu" aria-label={open ? t('closeNavigation') : collapsed ? t('expandSidebar') : t('collapseSidebar')} title={open ? t('closeNavigation') : collapsed ? t('expandSidebar') : t('collapseSidebar')} aria-controls="primary-sidebar" onClick={toggleSidebar}>
            <Menu />
          </Button>
        </div>
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
          {syncInfo.status === 'syncError' ? (
            <Link to="/settings/diagnostics" className="sync-status-link">
              {syncStatusLabel}
            </Link>
          ) : (
            <span>{syncStatusLabel}{syncInfo.pending > 0 ? ` · ${syncInfo.pending}` : ''}</span>
          )}
          <Button variant="ghost" size="icon" className="sidebar-theme" aria-label={t('theme')} title={t('theme')} onClick={() => void user.save({ kind: 'preferences', id: 'reader', payload: { theme: user.preferences.theme === 'dark' ? 'light' : 'dark' } })}>
            {user.preferences.theme === 'dark' ? <Sun /> : <Moon />}
          </Button>
        </div>
      </aside>
      {open && <button aria-label={t('back')} className="sidebar-scrim" onClick={() => setOpen(false)} />}
      <div className="main-column">
        {isMobile && !open && (
          <Button variant="ghost" size="icon" className="mobile-menu" aria-label={t('openNavigation')} aria-controls="primary-sidebar" aria-expanded={open} onClick={() => setOpen(true)}>
            <Menu />
          </Button>
        )}
        {(localFailure || user.saveError || user.isError || syncInfo.status === 'syncError') && (
          <div className="global-alert" role="status">
            {localFailure || user.saveError || user.isError ? (
              <>
                {t('localSaveError')}{' '}
                <button onClick={async () => download('readfold-backup.json', await local.exportData(user.owner))}>
                  {t('export')}
                </button>
              </>
            ) : (
              <>
                <Link className="global-alert-link" to="/settings/diagnostics">{t('syncFailedShort')}</Link>{' '}
                <button onClick={async () => download('readfold-backup.json', await local.exportData(user.owner))}>
                  {t('export')}
                </button>
              </>
            )}
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
          <Route path="/components" element={<ComponentsPage />} />
          <Route path="/components/:id" element={<ComponentPage />} />
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
