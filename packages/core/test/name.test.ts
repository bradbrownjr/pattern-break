// Names (name.ts): the characters and length a name may have, and the rough vulgarity
// filter, checked against obvious vulgarities and against innocent names that contain one
// (the "Scunthorpe problem").

import { describe, expect, it } from 'vitest';
import { NAME_CHARS, NAME_MAX, cleanName, isVulgar, nameProblem, nameReadings } from '../src/name.ts';

describe('nameProblem', () => {
  it('takes 1 to 8 capitals, digits, inner spaces and marks', () => {
    for (const name of ['A', 'BRAD', 'KC1JMH', 'ACE-1', 'R.TYPE', 'MR X', 'WHO?', 'ABCDEFGH', '--X--']) {
      expect(nameProblem(name), name).toBeNull();
    }
  });

  it('turns down empty, long, small letters, edge spaces and other characters', () => {
    expect(nameProblem('')).toBe('empty');
    expect(nameProblem('   ')).toBe('empty');
    expect(nameProblem('ABCDEFGHI')).toBe('bad');
    expect(nameProblem('brad')).toBe('bad');
    expect(nameProblem(' BRAD')).toBe('bad');
    expect(nameProblem('BRAD ')).toBe('bad');
    expect(nameProblem('BR@D')).toBe('bad');
    expect(nameProblem('BRÄD')).toBe('bad');
    expect(nameProblem('B_RAD')).toBe('bad');
  });

  it('names a vulgar name', () => {
    expect(nameProblem('FUCK')).toBe('vulgar');
  });
});

describe('isVulgar', () => {
  it('finds obvious vulgarities, spaced out or spelled with look-alikes', () => {
    const bad = [
      'FUCK',
      'FUUUCK',
      'F U C K',
      'F.U.C.K',
      'FCKFUCK',
      'SH1T',
      'BULLSHIT',
      'ASS',
      'A55',
      'A.S.S',
      'ASS MAN',
      'ASSHOLE',
      'JACKASS',
      'DUMBASS',
      'BITCH',
      'B1TCH',
      'CUNT',
      'PUSSY',
      'DICK',
      'D1CK',
      'DICKHEAD',
      'COCK',
      'TITS',
      'FAG',
      'FAGGOT',
      'N1GGER',
      'NIGGA',
      'WH0RE',
      'SLUT',
      'P0RN',
      'PENIS',
      'CUM',
      'SEX',
      'RAPE',
      'NAZI',
      'HITLER',
      'KKK',
      'PISS',
      'TWAT',
    ];
    for (const name of bad) expect(isVulgar(name), name).toBe(true);
  });

  it('passes innocent names that contain a root', () => {
    const innocent = [
      'CUTLASS',
      'CLASS',
      'BASS',
      'PASSWORD',
      'ASSET',
      'ASSASSIN',
      'MASSES',
      'GLASS',
      'SCUNTHOR',
      'COCKPIT',
      'PEACOCK',
      'HANCOCK',
      'COCKBURN',
      'DICKENS',
      'DICKSON',
      'TITAN',
      'TITLE',
      'PETITE',
      'CUCUMBER',
      'DOCUMENT',
      'GRAPE',
      'DRAPE',
      'ESSEX',
      'SUSSEX',
      'SEXTANT',
      'SWANK',
      'JANUS',
      'URANUS',
      'ANALOG',
      'CANAL',
      'SHIPMENT',
      'PUSH IT',
      'WISH IT',
      'NIGER',
      'NIGEL',
      'NAZIR',
      'SPERMWHL',
      'HOMER',
      'BOOBOO',
      'KC1JMH',
      'BRAD',
      'JORDAN',
      'AMY',
      'ACE',
      'R2D2',
      'XXX',
      'HELLO',
      'DAMN',
    ];
    for (const name of innocent) expect(isVulgar(name), name).toBe(false);
  });
});

describe('nameReadings', () => {
  it('reads look-alikes as letters and joins runs of single letters, not words', () => {
    expect(nameReadings('A55-MAN')).toEqual({ spaced: 'ASS MAN', joined: 'ASS MAN' });
    expect(nameReadings('A S S')).toEqual({ spaced: 'A S S', joined: 'ASS' });
    expect(nameReadings('PUSH IT')).toEqual({ spaced: 'PUSH IT', joined: 'PUSH IT' });
  });
});

describe('cleanName', () => {
  it('capitalizes, drops what a name may not hold, and stops at the maximum', () => {
    expect(cleanName('brad')).toBe('BRAD');
    expect(cleanName('br@d!')).toBe('BRD!');
    expect(cleanName('abcdefghij')).toBe('ABCDEFGH');
    expect(NAME_MAX).toBe(8);
    expect(new Set(NAME_CHARS).size).toBe(NAME_CHARS.length);
  });
});
