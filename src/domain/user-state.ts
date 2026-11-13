export type EntityKind = 'reading' | 'learning' | 'preferences' | 'favorite' | 'review';
export type LearningStatus = 'encountered' | 'learning' | 'known' | 'mastered';
export interface UserOperation {
  id: string;
  ownerId: string;
  deviceId: string;
  entityKind: EntityKind;
  entityId: string;
  payload: Record<string, unknown>;
  createdAt: string;
}
export interface RemotePage {
  operations: UserOperation[];
  cursor: number;
}
export interface SyncTransport {
  push(operations: UserOperation[]): Promise<void>;
  pull(cursor: number): Promise<RemotePage>;
}
export interface AppIdentity {
  appUserId: string;
  authUserId: string;
}
export interface AuthService {
  restore(): Promise<AppIdentity | null>;
  signIn(provider: 'google' | 'github'): Promise<void>;
  signOut(): Promise<void>;
  subscribe(callback: (identity: AppIdentity | null) => void, onError?: (error: unknown) => void): () => void;
}
export type ReadingMode = 'detailed' | 'adaptive' | 'continuous';
export interface ReaderPreferences {
  language: 'ru' | 'en';
  theme: 'light' | 'dark' | 'system';
  fontSize: number;
  readingFontSize: number;
  translationFontSize: number;
  wordsFontSize: number;
  kanjiFontSize: number;
  grammarFontSize: number;
  lineHeight: number;
  width: number;
  mode: ReadingMode;
  canvasMode: boolean;
  furigana: boolean;
  furiganaSeparateLine: boolean;
  hiragana: boolean;
  hiraganaSeparateLine: boolean;
  romaji: boolean;
  romajiSeparateLine: boolean;
  literal: boolean;
  literalSeparateLine: boolean;
  natural: boolean;
  naturalSeparateLine: boolean;
  words: boolean;
  kanji: boolean;
  grammar: boolean;
  adaptiveHideKnown: boolean;
  syncEnabled: boolean;
  dailyReviewLimit: number;
}
export const defaultPreferences: ReaderPreferences = {
  language: 'ru',
  theme: 'system',
  fontSize: 24,
  readingFontSize: 16,
  translationFontSize: 18,
  wordsFontSize: 16,
  kanjiFontSize: 16,
  grammarFontSize: 16,
  lineHeight: 2,
  width: 760,
  mode: 'detailed',
  canvasMode: false,
  furigana: true,
  furiganaSeparateLine: false,
  hiragana: false,
  hiraganaSeparateLine: false,
  romaji: false,
  romajiSeparateLine: false,
  literal: true,
  literalSeparateLine: false,
  natural: true,
  naturalSeparateLine: false,
  words: true,
  kanji: true,
  grammar: true,
  adaptiveHideKnown: true,
  syncEnabled: true,
  dailyReviewLimit: 20,
};
