// The end screens' name entry (name-entry.ts): the last name is filled in and typing
// replaces it, up and down cycle a letter, Backspace erases, and Enter posts only a name
// the shared rules (packages/core/src/name.ts) take.

import { NAME_CHARS } from '@game/core';
import { describe, expect, it } from 'vitest';
import { NameEntry, loadLastName, nameHint, saveLastName } from '../src/game/name-entry.ts';

describe('NameEntry', () => {
  it('fills in the last name; Enter posts it as it is', () => {
    const e = new NameEntry('KC1JMH');
    expect(e.name).toBe('KC1JMH');
    expect(e.at).toBe(0);
    expect(e.apply('confirm')).toBe('post');
    expect(e.name).toBe('KC1JMH');
  });

  it('replaces the filled-in name on the first letter typed, in capitals', () => {
    const e = new NameEntry('KC1JMH');
    e.type('j');
    e.type('o');
    expect(e.name).toBe('JO');
    expect(e.at).toBe(2);
    e.type('rdan');
    expect(e.name).toBe('JORDAN');
  });

  it('erases a filled-in name all at once, then a letter at a time', () => {
    const e = new NameEntry('AMY');
    expect(e.erase()).toBe(true);
    expect(e.name).toBe('');
    expect(e.erase()).toBe(false);
    e.type('AMY');
    e.erase();
    expect(e.name).toBe('AM');
  });

  it('stops at 8 places, typing over the last one, and Backspace then takes it', () => {
    const e = new NameEntry();
    e.type('ABCDEFGHIJ');
    expect(e.name).toBe('ABCDEFGH');
    e.type('J');
    expect(e.name).toBe('ABCDEFGJ');
    expect(e.at).toBe(7);
    e.erase();
    expect(e.name).toBe('ABCDEFG');
    expect(e.at).toBe(7);
    e.erase();
    expect(e.name).toBe('ABCDEF');
  });

  it('drops what a name may not hold', () => {
    const e = new NameEntry();
    expect(e.type('@#')).toBe(false);
    e.type('b_r a.d');
    expect(e.name).toBe('BR A.D');
  });

  it('cycles the letter under the cursor with up and down, the arcade way', () => {
    const e = new NameEntry();
    expect(e.apply('up')).toBe('changed');
    expect(e.name).toBe('A');
    e.apply('up');
    expect(e.name).toBe('B');
    e.apply('down');
    e.apply('down');
    expect(e.name).toBe(NAME_CHARS.at(-1));
    e.apply('up');
    expect(e.apply('right')).toBe('moved');
    e.apply('down');
    expect(e.name).toBe(`A${NAME_CHARS.at(-1)}`);
    expect(e.apply('right')).toBe('moved');
    expect(e.apply('right')).toBeNull();
    e.apply('left');
    expect(e.apply('erase')).toBe('changed');
    expect(e.name).toBe(NAME_CHARS.at(-1));
  });

  it('edits a filled-in name in place with up and down', () => {
    const e = new NameEntry('BRAD');
    e.apply('up');
    expect(e.name).toBe('CRAD');
    e.type('X');
    expect(e.name).toBe('XRAD');
  });

  it('trims spaces from the ends, and posts only a name the rules take', () => {
    const e = new NameEntry();
    expect(e.apply('confirm')).toBeNull();
    expect(e.error).toBe('Name needed');
    e.type('A55');
    expect(e.apply('confirm')).toBeNull();
    expect(e.error).toBe('Name refused');
    e.erase();
    expect(e.error).toBe('');
    e.replace(' ACE ');
    expect(e.apply('confirm')).toBe('post');
    expect(e.name).toBe('ACE');
  });

  it('Esc skips', () => {
    expect(new NameEntry('AMY').apply('back')).toBe('skip');
  });

  it('shows every place, and blinks the one under the cursor', () => {
    const e = new NameEntry('BRAD');
    expect(e.line(true)).toBe('Name BRAD____');
    expect(e.line(false)).toBe('Name  RAD____');
    e.apply('right');
    e.apply('right');
    e.apply('right');
    e.apply('right');
    expect(e.line(false)).toBe('Name BRAD ___');
  });

  it('takes the whole text from the phone keyboard', () => {
    const e = new NameEntry('AMY');
    expect(e.replace('jordan!')).toBe(true);
    expect(e.name).toBe('JORDAN!');
    expect(e.at).toBe(7);
    expect(e.replace('JORDAN!')).toBe(false);
  });
});

describe('the last name', () => {
  it('is kept in storage, and cleaned on the way back', () => {
    const map = new Map<string, string>();
    const storage = { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v) };
    expect(loadLastName(storage)).toBe('');
    saveLastName(storage, 'KC1JMH');
    expect(loadLastName(storage)).toBe('KC1JMH');
    map.set('pattern-break.name', 'way too long name');
    expect(loadLastName(storage)).toBe('WAY TOO ');
    expect(loadLastName(null)).toBe('');
  });

  it('hints the keys for the keyboard or a gamepad', () => {
    expect(nameHint(false)).toBe('Enter Post  Esc Skip');
    expect(nameHint(true)).toBe('A Post  B Skip');
  });
});
