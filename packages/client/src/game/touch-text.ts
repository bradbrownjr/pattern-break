// The phone's keyboard for the name entry. A page can only open it by focusing a text field
// from a touch's own event handler, so a touch on the name entry focuses this hidden input.
// What the keyboard leaves in the input (letters, autocorrect, paste, a swipe) is read back
// whole on each `input` event, which every keyboard sends; key events from a phone's
// keyboard often carry no key ("Unidentified" on Android).

export class TouchTextEntry {
  readonly input = document.createElement('input');
  /** The input's whole text after each change. */
  onChange: ((text: string) => void) | null = null;

  constructor(parent: HTMLElement) {
    const input = this.input;
    input.type = 'text';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.setAttribute('autocapitalize', 'none');
    input.setAttribute('autocorrect', 'off');
    input.setAttribute('aria-label', 'Name entry');
    input.dataset['touchText'] = '';
    // On screen, so focusing it doesn't scroll the page, but unseen; 16 px keeps iOS from
    // zooming in on focus.
    Object.assign(input.style, {
      position: 'fixed',
      left: '0',
      top: '0',
      width: '1px',
      height: '1px',
      opacity: '0',
      border: '0',
      padding: '0',
      fontSize: '16px',
      pointerEvents: 'none',
    });
    input.addEventListener('input', () => this.onChange?.(input.value));
    // A touch ends with the mouse events kept for old pages, and their mousedown would move
    // focus off the input the touch's pointerup just focused, closing the keyboard again.
    window.addEventListener(
      'mousedown',
      (e) => {
        if (this.isOpen) e.preventDefault();
      },
      { capture: true },
    );
    parent.appendChild(input);
  }

  /** True while the input has focus: the keyboard is up, or a hardware keyboard types into it. */
  get isOpen(): boolean {
    return document.activeElement === this.input;
  }

  /** Whether `e` came from the input. */
  owns(e: Event): boolean {
    return e.target === this.input;
  }

  /**
   * Shows `value` in the input, at most `maxLength` long, with the cursor at its end. `last`
   * labels the keyboard's Enter key Done rather than Next.
   */
  set(value: string, maxLength: number, last: boolean): void {
    const input = this.input;
    input.maxLength = maxLength;
    input.enterKeyHint = last ? 'done' : 'next';
    if (input.value !== value) input.value = value;
    if (this.isOpen) input.setSelectionRange(value.length, value.length);
  }

  /** Focuses the input with `value`. Call it from a touch's event handler, or no keyboard opens. */
  open(value: string, maxLength: number, last: boolean): void {
    this.input.focus({ preventScroll: true });
    this.set(value, maxLength, last);
  }

  close(): void {
    if (this.isOpen) this.input.blur();
  }
}
