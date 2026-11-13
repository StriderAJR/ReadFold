import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { FileDown, ShieldCheck, UserRound } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { useAppData, PageTitle, download } from './Common';
import { local, services, synchronize, syncEngine, useSession } from '../application/runtime';
import type { ReaderPreferences } from '../domain/user-state';
const preferenceOptions: (keyof ReaderPreferences)[] = [
  'furigana',
  'hiragana',
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
  ['hiraganaSeparateLine', 'showHiragana'],
  ['romajiSeparateLine', 'showRomaji'],
  ['literalSeparateLine', 'literal'],
  ['naturalSeparateLine', 'natural'],
] as const;
const fontSizeOptions = [
  ['fontSize', 'mainText'],
  ['readingFontSize', 'readingLines'],
  ['translationFontSize', 'translationLines'],
  ['wordsFontSize', 'wordsLabel'],
  ['kanjiFontSize', 'kanjiLabel'],
  ['grammarFontSize', 'grammarLabel'],
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
                              : key === 'hiragana'
                                ? 'showHiragana'
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
        </Card>
        <Card className="settings-card">
          <h2>{t('show')}</h2>
          {fontSizeOptions.map(([key, labelKey]) => (
            <label className="range-row" key={key}>
              <span>{t(labelKey)} <b>{p[key]}px</b></span>
              <input type="range" min={key === 'fontSize' ? 16 : 10} max={key === 'fontSize' ? 42 : 32} value={p[key]} onChange={(e) => set(key, Number(e.target.value))} />
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
  const [items, setItems] = useState<Record<string, number>>({});
  useEffect(() => {
    void local.diagnosticSummary().then(setItems);
  }, []);
  return (
    <>
      <PageTitle title={t('diagnostics')} />
      <Card className="diagnostics-card">
        <p className="muted">{t('savedOffline')}</p>
        {Object.entries(items).map(([key, value]) => (
          <div className="history-row" key={key}>
            <span>{key}</span>
            <b>{value}</b>
          </div>
        ))}
        <Button
          variant="outline"
          onClick={async () => download('readfold-diagnostics.json', await local.exportDiagnostics())}
        >
          <FileDown size={16} />
          {t('exportDiagnostics')}
        </Button>
      </Card>
    </>
  );
}
