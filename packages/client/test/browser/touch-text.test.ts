// The name entry's touch path in a real browser: a touch focuses the hidden input, the
// keyboard types into it, the entry takes the whole text, and Enter reaches the game.

import { NAME_MAX } from '@game/core';
import { afterEach, describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import { NameEntry } from '../../src/game/name-entry.ts';
import { TouchTextEntry } from '../../src/game/touch-text.ts';

const made: TouchTextEntry[] = [];
afterEach(() => {
  for (const t of made.splice(0)) t.input.remove();
});

describe('touch text entry', () => {
  it('sets a name from a touch and the keyboard', async () => {
    const entry = new TouchTextEntry(document.body);
    made.push(entry);
    const name = new NameEntry('AMY');
    entry.onChange = (text) => name.replace(text);
    let enters = 0;
    const onKey = (e: KeyboardEvent) => {
      if (entry.owns(e) && e.key === 'Enter') enters++;
    };
    window.addEventListener('keydown', onKey);
    // As the game does: the touch's pointerup handler opens the keyboard on the name.
    const onUp = () => entry.open(name.name, NAME_MAX, true);
    window.addEventListener('pointerup', onUp, { once: true });
    window.dispatchEvent(new PointerEvent('pointerup', { pointerType: 'touch' }));
    expect(entry.isOpen).toBe(true);
    expect(entry.input.value).toBe('AMY');
    expect(entry.input.enterKeyHint).toBe('done');

    await userEvent.keyboard('{Backspace}{Backspace}{Backspace}kc1jmh-bradley');
    expect(name.name).toBe('KC1JMH-B');
    await userEvent.keyboard('{Backspace}{Backspace}');
    expect(name.name).toBe('KC1JMH');
    await userEvent.keyboard('{Enter}');
    expect(enters).toBe(1);
    window.removeEventListener('keydown', onKey);
    entry.close();
    expect(entry.isOpen).toBe(false);
    expect(name.apply('confirm')).toBe('post');
  });
});
