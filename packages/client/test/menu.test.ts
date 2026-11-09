import { describe, expect, it } from 'vitest';
import { ControlsPages, JukeboxMenu, PauseMenu, SettingsMenu, TitleMenu } from '../src/game/menu.ts';

describe('TitleMenu', () => {
  it('moves the cursor with up and down, wrapping at both ends', () => {
    const m = new TitleMenu(3);
    expect(m.item).toBe('play');
    expect(m.apply('up')).toBe('moved');
    expect(m.item).toBe('settings');
    m.apply('down');
    m.apply('down');
    expect(m.item).toBe('practice');
  });

  it("changes Practice's song and the difficulty with left and right", () => {
    const m = new TitleMenu(3, 0, 'normal');
    expect(m.apply('left')).toBeNull();
    expect(m.song).toBe(0);
    m.apply('down');
    expect(m.apply('left')).toBe('changed');
    expect(m.song).toBe(2);
    m.apply('right');
    expect(m.song).toBe(0);
    m.apply('down');
    m.apply('right');
    expect(m.difficulty).toBe('hard');
    m.apply('right');
    expect(m.difficulty).toBe('easy');
  });

  it('opens play, practice, the jukebox, the controls or the settings on confirm, and steps the difficulty forward', () => {
    const m = new TitleMenu(3, 1, 'easy');
    expect(m.apply('confirm')).toBe('play');
    m.apply('down');
    expect(m.apply('confirm')).toBe('practice');
    m.apply('down');
    expect(m.apply('confirm')).toBe('changed');
    expect(m.difficulty).toBe('normal');
    m.apply('down');
    expect(m.apply('confirm')).toBe('jukebox');
    m.apply('down');
    expect(m.apply('confirm')).toBe('controls');
    m.apply('down');
    expect(m.apply('confirm')).toBe('settings');
    expect(m.apply('back')).toBeNull();
  });

  it('has nothing to change with one song', () => {
    const m = new TitleMenu(1);
    m.apply('down');
    expect(m.apply('right')).toBeNull();
  });
});

describe('JukeboxMenu', () => {
  it('plays the song under the cursor, and stops it if it is the one playing', () => {
    const j = new JukeboxMenu(3);
    expect(j.apply('down')).toEqual({ type: 'moved' });
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

describe('PauseMenu', () => {
  it('moves through Resume, Controls and Quit, wrapping; back resumes', () => {
    const m = new PauseMenu();
    expect(m.apply('confirm')).toBe('resume');
    expect(m.apply('down')).toBe('moved');
    expect(m.apply('confirm')).toBe('controls');
    m.apply('down');
    expect(m.apply('confirm')).toBe('quit');
    m.apply('down');
    expect(m.item).toBe('resume');
    m.apply('up');
    expect(m.apply('back')).toBe('resume');
    expect(m.apply('left')).toBeNull();
  });
});

describe('ControlsPages', () => {
  it('switches pages with left and right; confirm steps on and leaves from the last page', () => {
    const p = new ControlsPages();
    expect(p.page).toBe('keyboard');
    expect(p.apply('right')).toBe('moved');
    expect(p.page).toBe('gamepad');
    expect(p.apply('right')).toBe('moved');
    expect(p.page).toBe('keyboard');
    expect(p.apply('confirm')).toBe('moved');
    expect(p.page).toBe('gamepad');
    expect(p.apply('confirm')).toBe('back');
    expect(p.apply('back')).toBe('back');
    expect(p.apply('up')).toBeNull();
  });
});

describe('SettingsMenu', () => {
  it('changes a volume with left and right, stopping at off and 5', () => {
    const m = new SettingsMenu({ music: 5, effects: 1 });
    expect(m.apply('right')).toBeNull();
    expect(m.apply('left')).toBe('changed');
    expect(m.values.music).toBe(4);
    m.apply('down');
    m.apply('left');
    expect(m.values.effects).toBe(0);
    expect(m.apply('left')).toBeNull();
  });

  it('steps a volume up on confirm, wrapping from 5 to off, and leaves from Back', () => {
    const m = new SettingsMenu({ music: 5, effects: 4 });
    expect(m.apply('confirm')).toBe('changed');
    expect(m.values.music).toBe(0);
    m.apply('up');
    expect(m.item).toBe('back');
    expect(m.apply('right')).toBeNull();
    expect(m.apply('confirm')).toBe('back');
    m.apply('down');
    expect(m.apply('back')).toBe('back');
  });

  it('works on its own copy of the settings', () => {
    const start = { music: 3, effects: 3 };
    new SettingsMenu(start).apply('left');
    expect(start.music).toBe(3);
  });
});
