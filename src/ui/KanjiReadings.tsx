import { Info } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { kanaToRomaji } from './kana';

export function KanjiReadings({ on, kun, romaji = false }: { on: string[]; kun: string[]; romaji?: boolean }) {
  const { t } = useTranslation();
  const onValue = `${on.join('、')}${romaji ? ` (${on.map(kanaToRomaji).join(', ')})` : ''}`;
  const kunValue = `${kun.join('、')}${romaji ? ` (${kun.map(kanaToRomaji).join(', ')})` : ''}`;

  return (
    <span className="kanji-readings">
      <span>{onValue}</span>
      <span>{kunValue}</span>
      <details className="reading-info">
        <summary aria-label={t('readingOrderHint')}><Info size={14} /></summary>
        <span role="tooltip">{t('readingOrderHint')}</span>
      </details>
    </span>
  );
}
