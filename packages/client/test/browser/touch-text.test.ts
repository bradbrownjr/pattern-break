// The name entry's touch path in a real browser: a touch focuses the hidden input, the
// keyboard types into it, the form takes the whole text, and Enter moves on.

import { afterEach, describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import { FIELD_MAX, ProfileForm } from '../../src/game/profile.ts';
import { TouchTextEntry } from '../../src/game/touch-text.ts';

const made: TouchTextEntry[] = [];
afterEach(() => {
  for (const t of made.splice(0)) t.input.remove();
});

describe('touch text entry', () => {
  it('sets a name from a touch and the keyboard', async () => {
    const entry = new TouchTextEntry(document.body);
    made.push(entry);
    const form = new ProfileForm();
    entry.onChange = (text) => form.replace(text);
    let enters = 0;
    const onKey = (e: KeyboardEvent) => {
      if (entry.owns(e) && e.key === 'Enter') enters++;
    };
    window.addEventListener('keydown', onKey);
    // As the game does: the touch's pointerup handler opens the keyboard on the name.
    const onUp = () => entry.open(form.nickname, FIELD_MAX.nickname, false);
    window.addEventListener('pointerup', onUp, { once: true });
    window.dispatchEvent(new PointerEvent('pointerup', { pointerType: 'touch' }));
    expect(entry.isOpen).toBe(true);
    expect(entry.input.enterKeyHint).toBe('next');

    await userEvent.keyboard('KC1JMH-BRADLEY');
    expect(form.nickname).toBe('KC1JMH-BRADL');
    await userEvent.keyboard('{Backspace}{Backspace}');
    expect(form.nickname).toBe('KC1JMH-BRA');
    await userEvent.keyboard('{Enter}');
    expect(enters).toBe(1);
    window.removeEventListener('keydown', onKey);

    // On to the link: the input follows, then closes on Save.
    form.apply('confirm');
    entry.set(form.link, FIELD_MAX.link, true);
    expect(entry.input.value).toBe('');
    expect(entry.input.enterKeyHint).toBe('done');
    await userEvent.keyboard('https://x.org');
    expect(form.link).toBe('https://x.org');
    entry.close();
    expect(entry.isOpen).toBe(false);
    form.apply('confirm');
    expect(form.apply('confirm')).toBe('save');
  });
});
