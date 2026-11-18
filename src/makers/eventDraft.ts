import type { Answers } from '../events/model';
import type { MakerDoc } from './model';
import { US_STATES } from '../network/model';

/** Deliberately allowlisted: private event answers never become profile text. */
export function eventProfileDraft(m: MakerDoc, exists: boolean, draft: { name: string; answers: Answers }): Partial<MakerDoc> {
  const parts = draft.answers.town.split(',').map((p) => p.trim());
  const stateText = parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
  const state = US_STATES.find(([code, name]) => code.toLowerCase() === stateText || name.toLowerCase() === stateText)?.[0];
  return {
    display_name: m.display_name || draft.name,
    bio: m.bio || draft.answers.makes,
    town: m.town || (state ? parts.slice(0, -1).join(', ') : draft.answers.town),
    state: !m.town && state ? state : m.state,
    home_space_id: m.home_space_id || draft.answers.home_space_id,
    // What you work with is not private: it is the same list as the profile's.
    disciplines: m.disciplines?.length ? m.disciplines : (draft.answers.disciplines ?? []),
    ...(!exists ? { visibility: 'hidden' as const } : {}),
  };
}
