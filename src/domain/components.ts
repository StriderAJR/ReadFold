import { z } from 'zod';
import type { Kanji } from './content';

const readableText = z.string().trim().min(1).regex(/^[^\p{C}]+$/u);
export const visualComponentSchema = z.object({
  id: z.string().regex(/^ja:component:[a-z0-9-]+$/),
  form: readableText,
  name: readableText,
  mnemonic: readableText,
  components: z.array(readableText).refine((parts) => new Set(parts).size === parts.length, 'Duplicate component references'),
  reviewed: z.boolean().optional(),
}).strict();

export const componentDictionarySchema = z.array(visualComponentSchema).superRefine((entries, context) => {
  const byForm = new Map(entries.map((entry) => [entry.form, entry]));
  if (byForm.size !== entries.length || new Set(entries.map((entry) => entry.id)).size !== entries.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Duplicate component ID or form' });
  }
  const visited = new Set<string>();
  const active = new Set<string>();
  const visit = (form: string): void => {
    if (active.has(form)) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: `Cyclic component reference: ${form}` });
      return;
    }
    if (visited.has(form)) {
      return;
    }
    const entry = byForm.get(form);
    if (!entry) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: `Unknown component: ${form}` });
      return;
    }
    active.add(form);
    entry.components.forEach(visit);
    active.delete(form);
    visited.add(form);
  };
  entries.forEach((entry) => visit(entry.form));
});

export type VisualComponent = z.infer<typeof visualComponentSchema>;

export function validateComponentReferences(kanji: readonly Kanji[], components: readonly VisualComponent[]): void {
  const forms = new Set(components.map((entry) => entry.form));
  for (const entry of kanji) {
    for (const form of entry.components) {
      if (!forms.has(form)) {
        throw new Error(`Unknown component ${form} in ${entry.character}`);
      }
    }
  }
}
