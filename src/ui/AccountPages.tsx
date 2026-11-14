import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { FileDown, Mail, ShieldCheck, UserRound } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { useAppData, PageTitle, download } from './Common';
import { local, services, synchronize, syncEngine, useSession } from '../application/runtime';
import type { ReaderPreferences } from '../domain/user-state';
import type { Diagnostic, SyncDiagnosticEvent } from '../infrastructure/local/repository';
const preferenceOptions: (keyof ReaderPreferences)[] = [
  'furigana',
  'romaji',
  'literal',
  'natural',
  'words',
  'kanji',
  'grammar',
  'adaptiveHideKnown',
  'syncEnabled',
];
const separateLineOptions = [
  ['furiganaSeparateLine', 'furigana'],
  ['romajiSeparateLine', 'showRomaji'],
  ['literalSeparateLine', 'literal'],
  ['naturalSeparateLine', 'natural'],
] as const;
const fontSizeOptions = [
  ['fontSize', 'mainText'],
  ['readingFontSize', 'readingLines'],
  ['translationFontSize', 'translationLines'],
  ['cardScalePercent', 'cardText'],
] as const;
export function SettingsPage() {
  const { t } = useTranslation();
  const { user } = useAppData();
  const [importStatus, setImportStatus] = useState('');
  const signedIn = useSession((state) => Boolean(state.identity));
  const p = user.preferences;
  function set<K extends keyof ReaderPreferences>(key: K, value: ReaderPreferences[K]) {
    void user.save({ kind: 'preferences', id: 'reader', payload: { [key]: value } });
  }
  return (
    <>
      <PageTitle title={t('settings')} />
      <div className="settings-layout">
        <Card className="settings-card">
          <h2>{t('mode')}</h2>
          <div className="segmented" data-testid="mode-select">
            {(['detailed', 'adaptive', 'continuous'] as const).map((mode) => (
              <button className={p.mode === mode ? 'active' : ''} key={mode} onClick={() => set('mode', mode)}>
                {t(mode)}
              </button>
            ))}
          </div>
          <p className="muted">{t('adaptiveInfo')}</p>
          <label className="switch-row">
            <span>{t('canvasMode')}</span>
            <input type="checkbox" checked={p.canvasMode} onChange={(e) => set('canvasMode', e.target.checked)} />
            <i />
          </label>
          {preferenceOptions.map((key) => (
            <label className="switch-row" key={key}>
              <span>
                {t(
                  key === 'adaptiveHideKnown'
                    ? 'hideKnown'
                    : key === 'syncEnabled'
                      ? 'sync'
                      : key === 'natural' || key === 'literal'
                        ? key
                        : key === 'words'
                          ? 'wordsLabel'
                          : key === 'kanji'
                            ? 'kanjiLabel'
                            : key === 'grammar'
                              ? 'grammarLabel'
                              : key,
                )}
              </span>
              <input
                data-testid={key === 'furigana' ? 'layer-furigana' : undefined}
                type="checkbox"
                checked={p[key] as boolean}
                onChange={(e) => set(key, e.target.checked as never)}
              />
              <i />
            </label>
          ))}
          <h3>{t('separateLines')}</h3>
          {separateLineOptions.map(([key, labelKey]) => (
            <label className="switch-row" key={key}>
              <span>{t(labelKey)} · {t('separateLine')}</span>
              <input type="checkbox" checked={p[key]} onChange={(e) => set(key, e.target.checked)} />
              <i />
            </label>
          ))}
          <label className="switch-row">
            <span>{t('translationsSeparateLine')}</span>
            <input type="checkbox" checked={p.translationsSeparateLine} onChange={(e) => set('translationsSeparateLine', e.target.checked)} />
            <i />
          </label>
        </Card>
        <Card className="settings-card">
          <h2>{t('show')}</h2>
          {fontSizeOptions.map(([key, labelKey]) => (
            <label className="range-row" key={key}>
              <span>{t(labelKey)} <b>{p[key]}{key === 'cardScalePercent' ? '%' : 'px'}</b></span>
              <input type="range" min={key === 'fontSize' ? 16 : key === 'cardScalePercent' ? 70 : 10} max={key === 'fontSize' ? 42 : key === 'cardScalePercent' ? 150 : 32} step={key === 'cardScalePercent' ? 5 : 1} value={p[key]} onChange={(e) => set(key, Number(e.target.value))} />
            </label>
          ))}
          <label className="range-row">
            <span>
              {t('lineHeight')} <b>{p.lineHeight}</b>
            </span>
            <input
              type="range"
              min="1.4"
              max="3"
              step="0.1"
              value={p.lineHeight}
              onChange={(e) => set('lineHeight', Number(e.target.value))}
            />
          </label>
          <label className="range-row">
            <span>
              {t('width')} <b>{p.width}px</b>
            </span>
            <input
              type="range"
              min="480"
              max="1100"
              step="20"
              value={p.width}
              onChange={(e) => set('width', Number(e.target.value))}
            />
          </label>
          <label className="form-row">
            <span>{t('theme')}</span>
            <select value={p.theme} onChange={(e) => set('theme', e.target.value as ReaderPreferences['theme'])}>
              {(['light', 'dark', 'system'] as const).map((x) => (
                <option key={x} value={x}>
                  {t(x)}
                </option>
              ))}
            </select>
          </label>
          <label className="form-row">
            <span>{t('language')}</span>
            <select value={p.language} onChange={(e) => set('language', e.target.value as 'ru' | 'en')}>
              <option value="ru">Русский</option>
              <option value="en">English</option>
            </select>
          </label>
          <label className="range-row">
            <span>
              {t('dailyLimit')} <b>{p.dailyReviewLimit}</b>
            </span>
            <input
              type="range"
              min="1"
              max="100"
              value={p.dailyReviewLimit}
              onChange={(e) => set('dailyReviewLimit', Number(e.target.value))}
            />
          </label>
          <p className="settings-caption">{t('settingsSaved')}</p>
        </Card>
      </div>
      <Card className="backup-card">
        <ShieldCheck />
        <div>
          <h3>{t('savedOffline')}</h3>
          <p className="muted">{importStatus || t('backupDescription')}</p>
        </div>
        <Button
          variant="outline"
          onClick={async () => download('readfold-backup.json', await local.exportData(user.owner))}
        >
          <FileDown size={16} />
          {t('export')}
        </Button>
        {signedIn && p.syncEnabled && (
          <Button
            variant="ghost"
            onClick={async () => {
              try {
                await synchronize();
                setImportStatus(syncEngine?.status === 'synced' ? t('synced') : t('syncError'));
              } catch {
                setImportStatus(t('syncError'));
              }
            }}
          >
            {t('syncNow')}
          </Button>
        )}
        <label className="button button-outline">
          <FileDown size={16} />
          {t('import')}
          <input
            className="visually-hidden"
            type="file"
            accept="application/json,.json"
            aria-label={t('import')}
            onChange={async (event) => {
              const input = event.currentTarget;
              const file = input.files?.[0];
              if (!file) {
                return;
              }
              try {
                await local.importData(user.owner, JSON.parse(await file.text()) as unknown);
                setImportStatus(t('importSuccess'));
              } catch {
                setImportStatus(t('importError'));
              }
              input.value = '';
            }}
          />
        </label>
      </Card>
      <Link className="back-link diagnostics-link" to="/settings/diagnostics">
        <FileDown size={16} />
        {t('diagnostics')}
      </Link>
    </>
  );
}
export function AccountPage() {
  const { t } = useTranslation();
  const session = useSession();
  const { user } = useAppData();
  const [error, setError] = useState('');
  async function login(provider: 'google' | 'github') {
    if (!services) {
      setError(t('notConfigured'));
      return;
    }
    try {
      await services.auth.signIn(provider);
    } catch {
      setError(t('loginError'));
    }
  }
  async function merge() {
    if (!session.identity) {
      return;
    }
    try {
      await local.mergeGuest(session.identity.appUserId);
      await synchronize();
    } catch {
      setError(t('syncError'));
    }
  }
  return (
    <>
      <PageTitle title={t('accountTitle')} />
      <Card className="account-card">
        <div className="account-avatar">
          <UserRound />
        </div>
        <div>
          <h2>{session.identity ? t('account') : t('guest')}</h2>
          <p className="muted">{session.identity ? t('savedOffline') : t('accountRequired')}</p>
        </div>
        {session.identity ? (
          <>
            <Button variant="outline" onClick={() => void merge()}>
              {t('merge')}
            </Button>
            <Button
              variant="ghost"
              onClick={async () => {
                try {
                  await services?.auth.signOut();
                } catch {
                  setError(t('loginError'));
                }
              }}
            >
              {t('signOut')}
            </Button>
          </>
        ) : (
          <>
            <Button onClick={() => void login('google')}>{t('signInGoogle')}</Button>
            <Button variant="outline" onClick={() => void login('github')}>
              {t('signInGithub')}
            </Button>
          </>
        )}
      </Card>
      {(error || session.error) && (
        <p className="form-error" role="alert">
          {error || t('sessionError')}
        </p>
      )}
      <Card className="backup-card">
        <ShieldCheck />
        <div>
          <h3>{t('savedOffline')}</h3>
          <p className="muted">{t('backupDescription')}</p>
        </div>
        <Button
          variant="outline"
          onClick={async () => download('readfold-backup.json', await local.exportData(user.owner))}
        >
          <FileDown size={16} />
          {t('export')}
        </Button>
      </Card>
    </>
  );
}
export function DiagnosticsPage() {
  const { t } = useTranslation();
  const { user } = useAppData();
  const [items, setItems] = useState<Diagnostic[]>([]);
  const [syncEvents, setSyncEvents] = useState<SyncDiagnosticEvent[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [reportStatus, setReportStatus] = useState('');
  const [sharing, setSharing] = useState(false);
  const developerEmail = 'alexander.aj.ranger@gmail.com';
  useEffect(() => {
    void Promise.all([local.exportDiagnostics(), local.exportSyncEvents()])
      .then(([diagnostics, events]) => {
        setItems(diagnostics.sort((a, b) => b.lastSeen - a.lastSeen));
        setSyncEvents(events.sort((a, b) => b.occurredAt - a.occurredAt));
        setLoaded(true);
      })
      .catch(() => setReportStatus(t('localSaveError')));
  }, [t]);
  async function shareReport() {
    const fileName = 'readfold-diagnostics.json';
    const subject = t('diagnosticEmailSubject');
    const body = t('diagnosticEmailBody', { fileName });
    const report = {
      formatVersion: 2,
      createdAt: new Date().toISOString(),
      app: 'ReadFold',
      page: `${window.location.origin}${window.location.pathname}`,
      browser: navigator.userAgent,
      online: navigator.onLine,
      syncStatus: syncEngine?.status ?? 'unavailable',
      diagnostics: items,
      syncEvents,
    };
    const file = new File([JSON.stringify(report, null, 2)], fileName, { type: 'application/json' });
    setSharing(true);
    setReportStatus('');
    try {
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ title: subject, text: t('diagnosticShareText', { email: developerEmail, body }), files: [file] });
          setReportStatus(t('diagnosticShareFinished'));
          return;
        } catch (error) {
          if (error instanceof DOMException && error.name === 'AbortError') {
            return;
          }
        }
      }
      download(fileName, report);
      window.location.href = `mailto:${developerEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      setReportStatus(t('diagnosticAttachFile', { fileName }));
    } catch {
      setReportStatus(t('diagnosticReportError'));
    } finally {
      setSharing(false);
    }
  }
  return (
    <>
      <PageTitle title={t('diagnostics')} />
      <Card className="diagnostics-card">
        <p className="muted">{t('diagnosticsHelp')}</p>
        {items.map((item) => (
          <div className="diagnostic-entry" key={`${item.category}-${item.code}-${item.status ?? 'none'}`}>
            <div className="diagnostic-entry-heading">
              <b>{item.category === 'sync' ? t('diagnosticSyncFailed') : item.code}</b>
              {item.status && <span>{t('diagnosticStatus')}: {item.status}</span>}
            </div>
            {item.category === 'sync' && (
              <p>
                {t(`syncReason${item.reason ? `${item.reason[0].toUpperCase()}${item.reason.slice(1)}` : 'Unknown'}`)}
              </p>
            )}
            <small>
              {t('diagnosticOccurrences')}: {item.count} · {t('diagnosticLastSeen')}:{' '}
              {new Intl.DateTimeFormat(user.preferences.language, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(item.lastSeen))}
            </small>
          </div>
        ))}
        {syncEvents.map((event) => (
          <div className="diagnostic-entry" key={event.id ?? `${event.occurredAt}-${event.phase}`}>
            <div className="diagnostic-entry-heading">
              <b>{t(event.phase === 'push' ? 'diagnosticPush' : event.phase === 'pull' ? 'diagnosticPull' : 'diagnosticLocal')}</b>
              {event.status && <span>{t('diagnosticStatus')}: {event.status}</span>}
            </div>
            <small>
              {event.serverCode && <>{t('diagnosticServerCode')}: {event.serverCode} · </>}
              {event.batchSize !== undefined && <>{t('diagnosticBatchSize')}: {event.batchSize} · </>}
              {event.cursor !== undefined && <>{t('diagnosticCursor')}: {event.cursor} · </>}
              {new Intl.DateTimeFormat(user.preferences.language, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(event.occurredAt))}
            </small>
          </div>
        ))}
        {items.length === 0 && syncEvents.length === 0 && <p className="muted">{t('noData')}</p>}
        <Button
          variant="outline"
          onClick={async () => download('readfold-diagnostics.json', {
            formatVersion: 2,
            diagnostics: await local.exportDiagnostics(),
            syncEvents: await local.exportSyncEvents(),
          })}
        >
          <FileDown size={16} />
          {t('exportDiagnostics')}
        </Button>
        <p className="muted">{t('diagnosticEmailHelp', { email: developerEmail })}</p>
        <Button variant="outline" disabled={sharing || !loaded} onClick={() => void shareReport()}>
          <Mail size={16} />
          {t('diagnosticEmailButton')}
        </Button>
        {reportStatus && <p role="status" className="muted">{reportStatus}</p>}
      </Card>
    </>
  );
}
