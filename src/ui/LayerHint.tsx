import { BookOpenText, CaseSensitive, Languages, Lightbulb, MessageCircle, Puzzle, Superscript, WholeWord } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const icons = {
  furigana: Superscript,
  hiragana: Languages,
  romaji: CaseSensitive,
  literal: BookOpenText,
  natural: MessageCircle,
  wordsLabel: WholeWord,
  mnemonicComponents: Puzzle,
  mnemonic: Lightbulb,
} as const;

export function LayerHint({ label }: { label: keyof typeof icons }) {
  const { t } = useTranslation();
  const Icon = icons[label];
  const title = label === 'mnemonic' ? `${t(label)}. ${t('mnemonicNotice')}` : t(label);
  return (
    <span className="layer-hint" role="img" aria-label={title} title={title} tabIndex={0}>
      <Icon size={14} aria-hidden="true" />
    </span>
  );
}
