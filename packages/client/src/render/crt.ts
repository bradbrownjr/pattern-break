// The CRT setting (docs/PLAN.md, "Visual spec"), off by default: a slight bloom, scanlines
// and a vignette. The bloom is a filter on the whole picture at the game's 384x216: each
// pixel gains a little of the bright pixels up to 2 px around it. The scanlines and the
// vignette are a CSS overlay on the canvas at the screen's own resolution, so a scanline is
// a fraction of a game pixel: a dark band across the bottom of each game pixel row. At 1
// device pixel per game pixel there is no room for one, so only the vignette shows.

import { Filter, GlProgram, UniformGroup, defaultFilterVert } from 'pixi.js';

const BLOOM_FRAG = `
in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
// highp, as Pixi's default filter vertex shader declares them; a mismatch fails to link.
uniform highp vec4 uInputSize;
uniform highp vec4 uInputClamp;
uniform float uStrength;

vec3 bright(vec2 offset) {
  vec2 at = clamp(vTextureCoord + offset * uInputSize.zw, uInputClamp.xy, uInputClamp.zw);
  vec3 c = texture(uTexture, at).rgb;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  return c * smoothstep(0.35, 0.9, l);
}

void main(void) {
  vec4 base = texture(uTexture, vTextureCoord);
  vec3 glow = (bright(vec2(1.0, 0.0)) + bright(vec2(-1.0, 0.0)) + bright(vec2(0.0, 1.0)) + bright(vec2(0.0, -1.0))) * 0.12;
  glow += (bright(vec2(1.0, 1.0)) + bright(vec2(-1.0, 1.0)) + bright(vec2(1.0, -1.0)) + bright(vec2(-1.0, -1.0))) * 0.07;
  glow += (bright(vec2(2.0, 0.0)) + bright(vec2(-2.0, 0.0)) + bright(vec2(0.0, 2.0)) + bright(vec2(0.0, -2.0))) * 0.05;
  finalColor = vec4(min(base.rgb + glow * uStrength, vec3(base.a)), base.a);
}
`;

/** How much of the glow is added. */
export const BLOOM_STRENGTH = 0.35;
/** A scanline's share of a game pixel row, and how dark it is. */
export const SCANLINE_SHARE = 0.35;
export const SCANLINE_ALPHA = 0.32;
/** The vignette: clear to this share of the way out, then darkening to this at the corners. */
const VIGNETTE_CLEAR = 0.62;
const VIGNETTE_ALPHA = 0.45;

/** The bloom filter. WebGL only: the game asks for WebGL (createGameRenderer). */
export function bloomFilter(): Filter {
  return new Filter({
    glProgram: GlProgram.from({ vertex: defaultFilterVert, fragment: BLOOM_FRAG, name: 'pb-bloom' }),
    resources: { bloomUniforms: new UniformGroup({ uStrength: { value: BLOOM_STRENGTH, type: 'f32' } }) },
  });
}

/**
 * The overlay's CSS background for a game pixel `pixelPx` CSS px tall: scanlines when a
 * game pixel is at least 2 device pixels (`devicePx`), and the vignette.
 */
export function overlayBackground(pixelPx: number, devicePx: number): string {
  const vignette = `radial-gradient(ellipse at center, rgba(0,0,0,0) ${VIGNETTE_CLEAR * 100}%, rgba(0,0,0,${VIGNETTE_ALPHA}) 100%)`;
  if (devicePx < 2) return vignette;
  const dark = `rgba(0,0,0,${SCANLINE_ALPHA})`;
  const start = pixelPx * (1 - SCANLINE_SHARE);
  const lines = `repeating-linear-gradient(to bottom, rgba(0,0,0,0) 0px, rgba(0,0,0,0) ${start}px, ${dark} ${start}px, ${dark} ${pixelPx}px)`;
  return `${lines}, ${vignette}`;
}
