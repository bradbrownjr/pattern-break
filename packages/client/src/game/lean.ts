// A stick's lean: how far the touch stick or a gamepad's stick is pushed, which sets how
// fast the ship goes (InputSampler.setLean; Brad, 2026-11-12).

/** A stick's lean, -1 to 1 on each axis, y down. */
export interface Lean {
  x: number;
  y: number;
}

/**
 * (x, y), as a share of full travel, through a round dead zone of `deadZone`: nothing
 * inside it, then rising from 0 at its edge to 1 at full travel, along the stick's
 * direction. This is the dead zone Microsoft's XInput guide shows (Microsoft Learn,
 * "Getting Started With XInput", Dead Zone): checked on the stick's distance from centre,
 * with the lean measured from its edge.
 */
export function radialLean(x: number, y: number, deadZone: number, out: Lean = { x: 0, y: 0 }): Lean {
  const length = Math.hypot(x, y);
  if (length <= deadZone) {
    out.x = out.y = 0;
    return out;
  }
  const k = Math.min(1, (length - deadZone) / (1 - deadZone)) / length;
  out.x = x * k;
  out.y = y * k;
  return out;
}
