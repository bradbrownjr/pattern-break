import { describe, expect, it } from 'vitest';
import { JukeboxMenu, TitleMenu } from '../src/game/menu.ts';

describe('TitleMenu', () => {
  it('moves the cursor with up and down, wrapping at both ends', () => {
    const m = new TitleMenu(3);
    expect(m.item).toBe('play');
    m.apply('up');
    expect(m.item).toBe('jukebox');
    m.apply('down');
    m.apply('down');
    expect(m.item).toBe('song');
  });

  it('changes the song and difficulty under the cursor with left and right', () => {
    const m = new TitleMenu(3, 0, 'normal');
    m.apply('left');
    expect(m.song).toBe(0);
    m.apply('down');
    m.apply('left');
    expect(m.song).toBe(2);
    m.apply('right');
    expect(m.song).toBe(0);
    m.apply('down');
    m.apply('right');
    expect(m.difficulty).toBe('hard');
    m.apply('right');
    expect(m.difficulty).toBe('easy');
  });

  it('opens play or the jukebox on confirm, and steps a choice forward otherwise', () => {
    const m = new TitleMenu(3, 1, 'easy');
    expect(m.apply('confirm')).toBe('play');
    m.apply('down');
    expect(m.apply('confirm')).toBeNull();
    expect(m.song).toBe(2);
    m.apply('down');
    m.apply('confirm');
    expect(m.difficulty).toBe('normal');
    m.apply('down');
    expect(m.apply('confirm')).toBe('jukebox');
    expect(m.apply('back')).toBeNull();
  });
});

describe('JukeboxMenu', () => {
  it('plays the song under the cursor, and stops it if it is the one playing', () => {
    const j = new JukeboxMenu(3);
    j.apply('down');
    expect(j.apply('confirm')).toEqual({ type: 'play', song: 1 });
    j.playing = 1;
    expect(j.apply('confirm')).toEqual({ type: 'stop' });
    j.apply('down');
    expect(j.apply('confirm')).toEqual({ type: 'play', song: 2 });
  });

  it('goes back from the Back row or with the back action', () => {
    const j = new JukeboxMenu(3);
    j.apply('up');
    expect(j.onBack).toBe(true);
    expect(j.apply('confirm')).toEqual({ type: 'back' });
    j.apply('down');
    expect(j.cursor).toBe(0);
    expect(j.apply('back')).toEqual({ type: 'back' });
    expect(j.apply('left')).toBeNull();
  });

  it('plays on to the next song, wrapping after the last', () => {
    const j = new JukeboxMenu(3);
    expect(j.next(0)).toBe(1);
    expect(j.next(2)).toBe(0);
  });
});
