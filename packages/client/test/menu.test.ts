import { describe, expect, it } from 'vitest';
import { ControlsPages, JukeboxMenu, KeysMenu, PauseMenu, SETTINGS_ITEMS, Scroller, SettingsMenu, TitleMenu, keysRows } from '../src/game/menu.ts';
import { DEFAULT_SETTINGS } from '../src/game/settings.ts';

describe('TitleMenu', () => {
  it('moves the cursor with up and down, wrapping at both ends', () => {
    const m = new TitleMenu(3);
    expect(m.item).toBe('play');
    expect(m.apply('up')).toBe('moved');
    expect(m.item).toBe('credits');
    m.apply('down');
    m.apply('down');
    expect(m.item).toBe('levels');
  });

  it("changes Levels' song and the difficulty with left and right", () => {
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

  it('opens play, levels, the scores, the jukebox, the controls, the settings, help or the credits on confirm, and steps the difficulty forward', () => {
    const m = new TitleMenu(3, 1, 'easy');
    expect(m.apply('confirm')).toBe('play');
    m.apply('down');
    expect(m.apply('confirm')).toBe('levels');
    m.apply('down');
    expect(m.apply('confirm')).toBe('changed');
    expect(m.difficulty).toBe('normal');
    m.apply('down');
    expect(m.apply('confirm')).toBe('scores');
    m.apply('down');
    expect(m.apply('confirm')).toBe('jukebox');
    m.apply('down');
    expect(m.apply('confirm')).toBe('controls');
    m.apply('down');
    expect(m.apply('confirm')).toBe('settings');
    m.apply('down');
    expect(m.apply('confirm')).toBe('help');
    m.apply('down');
    expect(m.apply('confirm')).toBe('credits');
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

  it('lists Import, then Back; left and right choose File or Folder where the browser has it', () => {
    const plain = new JukeboxMenu(2);
    expect([0, 1, 2, 3].map((i) => plain.rowAt(i).kind)).toEqual(['song', 'song', 'import', 'back']);
    plain.cursor = 2;
    expect(plain.apply('right')).toBeNull();
    expect(plain.apply('confirm')).toEqual({ type: 'import', folder: false });
    const folder = new JukeboxMenu(2, true);
    expect(folder.rowCount).toBe(4);
    expect(folder.apply('right')).toBeNull(); // on a song
    folder.cursor = 2;
    expect(folder.apply('right')).toEqual({ type: 'moved' });
    expect(folder.apply('confirm')).toEqual({ type: 'import', folder: true });
    folder.apply('left');
    expect(folder.apply('confirm')).toEqual({ type: 'import', folder: false });
    folder.apply('down');
    expect(folder.onBack).toBe(true);
  });

  it('puts the cursor on the first imported song, or keeps it on its row', () => {
    const j = new JukeboxMenu(3);
    j.addSongs(2);
    expect(j.songCount).toBe(5);
    expect(j.cursor).toBe(3);
    j.cursor = 5; // Import
    j.addSongs(1, false);
    expect(j.row).toEqual({ kind: 'import' });
    j.cursor = 1;
    j.addSongs(1, false);
    expect(j.cursor).toBe(1);
  });

  it('keeps the cursor and the playing song in place when a song is removed', () => {
    const j = new JukeboxMenu(5);
    j.cursor = 4;
    j.playing = 3;
    expect(j.removeSong(1)).toBe(false);
    expect([j.cursor, j.playing]).toEqual([3, 2]);
    // The cursor on the removed song moves onto the next one; playing it stops it.
    expect(j.removeSong(2)).toBe(true);
    expect([j.cursor, j.playing]).toEqual([2, null]);
    // Removing the last song leaves the cursor on Import.
    j.cursor = 2;
    j.removeSong(2);
    expect(j.row).toEqual({ kind: 'import' });
  });
});

describe('TitleMenu song list', () => {
  it("keeps Levels' song as songs are added and removed", () => {
    const m = new TitleMenu(3, 2);
    m.addSongs(2);
    m.removeSong(0);
    expect(m.song).toBe(1);
    m.removeSong(1);
    // Its own song went: Levels takes the next one.
    expect(m.song).toBe(1);
    m.song = 2;
    m.removeSong(2);
    expect(m.song).toBe(0);
  });
});

describe('PauseMenu', () => {
  it('moves through Resume, Controls, Help and Quit, wrapping; back resumes', () => {
    const m = new PauseMenu();
    expect(m.apply('confirm')).toBe('resume');
    expect(m.apply('down')).toBe('moved');
    expect(m.apply('confirm')).toBe('controls');
    m.apply('down');
    expect(m.apply('confirm')).toBe('help');
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
    expect(p.page).toBe('arrows');
    expect(p.apply('right')).toBe('moved');
    expect(p.page).toBe('wasd');
    expect(p.apply('left')).toBe('moved');
    expect(p.apply('left')).toBe('moved');
    expect(p.page).toBe('gamepad');
    expect(p.apply('right')).toBe('moved');
    expect(p.page).toBe('arrows');
    expect(p.apply('confirm')).toBe('moved');
    expect(p.apply('confirm')).toBe('moved');
    expect(p.page).toBe('gamepad');
    expect(p.apply('confirm')).toBe('back');
    expect(p.apply('back')).toBe('back');
    expect(p.apply('up')).toBeNull();
  });
});

describe('SettingsMenu: Keys', () => {
  it('opens the Keys screen on confirm and ignores left and right there', () => {
    const m = new SettingsMenu(DEFAULT_SETTINGS);
    m.cursor = SETTINGS_ITEMS.indexOf('keys');
    expect(m.apply('left')).toBeNull();
    expect(m.apply('right')).toBeNull();
    expect(m.apply('confirm')).toBe('keys');
  });
});

describe('KeysMenu', () => {
  it('lists the device, each action, Reset and Back; the pad adds Cancel and Replay', () => {
    expect(keysRows('keyboard')).toEqual(['device', 'up', 'down', 'left', 'right', 'fire', 'bomb', 'missile', 'nuke', 'boost', 'pause', 'reset', 'back']);
    expect(keysRows('pad').slice(-4)).toEqual(['cancel', 'replay', 'reset', 'back']);
  });

  it('changes the device with left, right or confirm on its row', () => {
    const m = new KeysMenu();
    expect(m.apply('right')).toBe('device');
    expect(m.device).toBe('pad');
    expect(m.apply('confirm')).toBe('device');
    expect(m.device).toBe('keyboard');
  });

  it('moves between slots on an action row, stopping at the ends, and keeps the slot between rows', () => {
    const m = new KeysMenu();
    m.apply('down');
    expect(m.action).toBe('up');
    expect(m.apply('left')).toBeNull();
    expect(m.apply('right')).toBe('moved');
    expect(m.apply('right')).toBe('moved');
    expect(m.apply('right')).toBeNull();
    expect(m.slot).toBe(2);
    m.apply('down');
    expect(m.action).toBe('down');
    expect(m.slot).toBe(2);
    expect(m.apply('confirm')).toBe('set');
  });

  it('resets and leaves from its last rows, wraps, and leaves on back', () => {
    const m = new KeysMenu();
    m.apply('up');
    expect(m.item).toBe('back');
    expect(m.action).toBeNull();
    expect(m.apply('right')).toBeNull();
    expect(m.apply('confirm')).toBe('back');
    m.apply('up');
    expect(m.apply('confirm')).toBe('reset');
    expect(m.apply('back')).toBe('back');
    m.apply('down');
    m.apply('down');
    expect(m.item).toBe('device');
  });
});

describe('SettingsMenu', () => {
  it('changes a volume with left and right, stopping at off and 5', () => {
    const m = new SettingsMenu({ ...DEFAULT_SETTINGS, music: 5, effects: 1 });
    expect(m.apply('right')).toBeNull();
    expect(m.apply('left')).toBe('changed');
    expect(m.values.music).toBe(4);
    m.apply('down');
    m.apply('left');
    expect(m.values.effects).toBe(0);
    expect(m.apply('left')).toBeNull();
  });

  it('steps a volume up on confirm, wrapping from 5 to off, and leaves from Back', () => {
    const m = new SettingsMenu({ ...DEFAULT_SETTINGS, music: 5, effects: 4 });
    expect(m.apply('confirm')).toBe('changed');
    expect(m.values.music).toBe(0);
    m.apply('up');
    expect(m.item).toBe('back');
    expect(m.apply('right')).toBeNull();
    expect(m.apply('confirm')).toBe('back');
    m.apply('down');
    expect(m.apply('back')).toBe('back');
  });

  it('sets Flashing, Shake, CRT and LED colours with left and right, and flips them on confirm', () => {
    const m = new SettingsMenu(DEFAULT_SETTINGS);
    m.cursor = SETTINGS_ITEMS.indexOf('flashing');
    expect(m.apply('left')).toBeNull();
    expect(m.apply('right')).toBe('changed');
    expect(m.values.flashing).toBe('full');
    expect(m.apply('right')).toBeNull();
    expect(m.apply('confirm')).toBe('changed');
    expect(m.values.flashing).toBe('reduced');
    m.apply('down');
    expect(m.item).toBe('shake');
    expect(m.apply('right')).toBeNull();
    expect(m.apply('left')).toBe('changed');
    expect(m.values.shake).toBe(false);
    expect(m.apply('confirm')).toBe('changed');
    expect(m.values.shake).toBe(true);
    m.apply('down');
    expect(m.item).toBe('crt');
    expect(m.apply('right')).toBeNull();
    expect(m.apply('left')).toBe('changed');
    expect(m.values.crt).toBe(false);
    m.apply('down');
    expect(m.item).toBe('leds');
    expect(m.apply('confirm')).toBe('changed');
    expect(m.values.leds).toBe('colourBlind');
    expect(m.apply('right')).toBeNull();
  });

  it('steps Sync by 5 ms within -300 to +100, and opens the Sync screen on confirm', () => {
    const m = new SettingsMenu(DEFAULT_SETTINGS);
    while (m.item !== 'sync') m.apply('down');
    expect(m.apply('left')).toBe('changed');
    expect(m.values.syncMs).toBe(-5);
    m.values.syncMs = 100;
    expect(m.apply('right')).toBeNull();
    m.values.syncMs = -300;
    expect(m.apply('left')).toBeNull();
    expect(m.apply('right')).toBe('changed');
    expect(m.values.syncMs).toBe(-295);
    expect(m.apply('confirm')).toBe('sync');
  });

  it('turns Perf on and off with left and right or confirm', () => {
    const m = new SettingsMenu(DEFAULT_SETTINGS);
    while (m.item !== 'perf') m.apply('down');
    expect(m.apply('left')).toBeNull();
    expect(m.apply('right')).toBe('changed');
    expect(m.values.perf).toBe(true);
    expect(m.apply('confirm')).toBe('changed');
    expect(m.values.perf).toBe(false);
    m.apply('down');
    expect(m.item).toBe('keys');
  });

  it('works on its own copy of the settings', () => {
    const start = { ...DEFAULT_SETTINGS, music: 3, effects: 3 };
    new SettingsMenu(start).apply('left');
    expect(start.music).toBe(3);
  });
});

describe('Scroller', () => {
  it('scrolls a row with up and down and a page with left and right, within the list', () => {
    const s = new Scroller(30, 10);
    expect(s.maxTop).toBe(20);
    expect(s.apply('up')).toBeNull();
    expect(s.apply('down')).toBe('moved');
    expect(s.top).toBe(1);
    s.apply('right');
    expect(s.top).toBe(10);
    s.apply('right');
    s.apply('right');
    expect(s.top).toBe(20);
    expect(s.apply('down')).toBeNull();
    s.apply('left');
    expect(s.top).toBe(11);
  });

  it('pages down on confirm and leaves from the end, and back leaves anywhere', () => {
    const s = new Scroller(25, 10);
    expect(s.apply('confirm')).toBe('moved');
    expect(s.apply('confirm')).toBe('moved');
    expect(s.top).toBe(15);
    expect(s.apply('confirm')).toBe('back');
    s.top = 3;
    expect(s.apply('back')).toBe('back');
  });

  it('has nothing to scroll when everything fits', () => {
    const s = new Scroller(5, 10);
    expect(s.maxTop).toBe(0);
    expect(s.apply('down')).toBeNull();
    expect(s.apply('confirm')).toBe('back');
  });
});
