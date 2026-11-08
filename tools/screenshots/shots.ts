// The screenshot manifest. `pnpm screenshots` regenerates every figure listed here.
// Fields and the capture-mode parameters are described in docs/DEVELOPMENT.md, "Screenshots".

export interface Shot {
  /** File name stem: the image is written to docs/img/<id>.png. Lowercase letters, digits, hyphens. */
  id: string;
  /** Capture-mode query parameters. `capture=1` is added by the script. */
  query: Record<string, string>;
  /** Viewport in CSS pixels. Default 1152x648, an exact 3x of the 384x216 internal resolution. */
  viewport?: { width: number; height: number };
  /** CSS selector to crop to. Default is the whole viewport. */
  element?: string;
  /** Describes what is on screen, for people who cannot see the image. */
  alt: string;
  caption: string;
  /** Where the figure is used. Empty means a test sample only. */
  usedIn: ('readme' | 'docs')[];
}

export const DEFAULT_VIEWPORT = { width: 1152, height: 648 };

export const shots: Shot[] = [
  {
    id: 'smoke-placeholder',
    query: { scene: 'placeholder' },
    alt: 'A white page with the text "Pattern Break" and the generator version in small black type in its top left corner.',
    caption: 'Smoke test of the screenshot pipeline: the placeholder page. Not used in the README.',
    usedIn: [],
  },
];
