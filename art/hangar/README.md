# Hangar intro art

The sources for the hangar intro's pictures (`packages/client/src/game/hangar.ts`): the
hangar with the fighter, the cockpit, the captain's frames, and the glove. Each is the
image service's full-size output, kept as it came back. `tools/hangar-art.py` turns them
into the game-sized PNGs in `packages/client/src/game/hangar-art/`; see
`docs/DEVELOPMENT.md`, "Hangar intro art".

## How they were made

Generated on 2026-11-10 through Brad's image service (the `nexarc-images` MCP server),
with OpenAI's `gpt-image-2.5-sunburst` at medium quality. Each was an edit of reference
images, so the art keeps the layout of the intro's first version, drawn in code:

- `ship-ref`: the game's player ship sprite (`packages/client/src/render/ship.ts`), drawn
  32 times its size on a dark background.
- `hangar-walk`, `hangar-play`: two of the first version's frames, `docs/img/*.png` at
  commit 2b8e9ef.

| File | Size | References | SHA-256 |
|---|---|---|---|
| `hangar.webp` | 1280x720 | `hangar-walk`, `ship-ref` | `84093d249fa7d10dc1ff7f4201096b79911e739db09c43ded42f68b3d177e35b` |
| `cockpit.webp` | 1280x720 | the first cockpit (below) | `3d493f1a473360c8e9d77fba0025c1de0e30be665f8e9b77cf13d1d94a58f5c9` |
| `pilot.webp` | 1152x864, transparent | `hangar-walk` | `02884463ce1867fdb3c14d0555a681ab612d42e9670fb7c8ab5f597b33625b7e` |
| `hand.webp` | 1152x864, transparent | `hangar-play` | `580df891e2469ad8412f637866118f288239c6e9d4f8a7b0d02fc173ca4076cf` |

The service keeps the outputs under these image IDs, for edits that should keep the same
look: hangar `53efe46e-d99d-4086-928d-54b9e41f9dfa`, cockpit
`c5d3044b-f210-4013-856a-3a5fb0d982e5`, pilot `d72419b6-339e-41c6-9674-5a11c78f04e6`, hand
`498fa574-af6f-4fe2-8e08-175df8e22e2b`.

## Prompts

**`hangar.webp`** (references: `hangar-walk`, then `ship-ref`):

> Retro 16-bit pixel art, strictly black and white (greyscale only, no colour at all),
> about seven flat grey tones from near-black to near-white, hard pixel edges, no
> anti-aliasing, no gradients, no text, no people. Chunky pixels, as if drawn at 384x216
> and scaled up.
>
> Reference 1 is a storyboard frame of a hangar: keep its composition. Dark back wall with
> steel girders, roof trusses across the top, three hanging work lights casting faint light
> cones, a grey floor whose edge is about 79% of the way down the image, a dashed floor
> line and hazard stripes under the aircraft. Leave the left third of the floor open and
> empty (a character will walk there later; do not draw any person).
>
> Reference 2 is the game's player ship, a 16x8 sprite seen from the side, nose to the
> right: a long, thin, needle-pointed nose; a slim body; a small swept fin on top and a
> matching one underneath, both at the rear; a cockpit window on the upper middle of the
> body (the white pixels); the engine nozzle at the very back (the magenta pixels). Redraw
> the fighter in the hangar as a larger, detailed side view of exactly this shape, nose to
> the right, occupying roughly the same place as the fighter in reference 1 (right of
> centre, about half the image wide). It rests on slim landing struts so the lower fin
> clears the floor. Its cockpit canopy is raised open on a hinge at the back, showing a
> dark cockpit opening. A simple metal boarding ladder leans against the left side of the
> fuselage, from the floor up to the cockpit rim.
>
> Moody, quiet, film-noir lighting from the work lights.

**`cockpit.webp`** was made in two steps. The first cockpit (image ID
`741e9e43-7678-4d9e-a497-98b0e0739a01`, reference: `hangar-play`) had a deck window too
short for a cassette seen face-on (Brad, 2026-11-10), so it was edited with a second prompt,
given after the first.

First:

> Retro 16-bit pixel art, strictly black and white (greyscale only, no colour), about
> seven flat grey tones, hard pixel edges, no anti-aliasing, no gradients. Chunky pixels,
> as if drawn at 384x216 and scaled up. No hands, no people, no cassette, and no text or
> labels anywhere.
>
> A first-person view from the pilot's seat of a small fighter's cockpit, with the same
> layout as the reference storyboard frame: through the open canopy at the top, the dim
> hangar beyond (dark wall, girders, a faint ceiling light); a glare shield across the
> image at the same height as in the reference; below it the instrument panel with a row of
> small indicator lights, two round analogue gauges left and right in the same places as
> the reference, rivets, panel seams and a few small switches. In the centre lower part, in
> the same place and size as the reference, a built-in car-style cassette deck: a housing
> with an empty dark tape window (no tape inside) and, under it, a row of five plain
> rectangular keys with no symbols on them.
>
> Keep the top quarter of the image fairly plain and dark, since titles will be drawn
> there.

Then, editing the first cockpit:

> Edit this cockpit image. Keep everything exactly the same (the view out of the open
> canopy, the glare shield, the row of indicator lights, both round gauges and their
> positions, the rivets, seams and toggle switches, the colours and the pixel-art style,
> strictly greyscale) except the cassette deck in the lower centre.
>
> Replace the cassette deck with a taller front-loading cassette deck, like a boombox or
> home tape deck: a recessed housing with a tape door whose window is sized and shaped for
> a standard compact cassette seen face-on. A compact cassette is 4 by 2.5 inches, so the
> window must be about 1.6 times as wide as it is tall: about 27% of the image width wide
> and about 32% of the image height tall, centred horizontally. Its top edge is a little
> below the row of indicator lights (about 41% of the way down the image) and its bottom
> edge about 73% of the way down. The window is empty and dark (no cassette inside).
> Directly under the door, a single row of five plain rectangular piano-style keys of equal
> size with no symbols on them, filling the deck's width, ending about 82% of the way down
> the image. The deck housing frames the door and keys with a bevelled metal bezel and four
> rivets.
>
> Retro 16-bit pixel art, hard pixel edges, no anti-aliasing, no gradients, no text or
> labels anywhere, no hands, no people.

The result has a door about twice as wide as it is tall, with a window showing the middle
of a tape, as a deck's door does, rather than the 1.6:1 window asked for, and it drew a
faint cassette in the window; `tools/hangar-art.py` paints that out.

**`pilot.webp`** (reference: `hangar-walk`; transparent background):

> A game sprite sheet in retro 16-bit pixel art, strictly black and white (greyscale only,
> no colour), five or six flat grey tones, hard pixel edges, no anti-aliasing, on a
> transparent background. No text, no labels, no grid lines, no shadows on the ground.
>
> The same character in every frame: a fighter pilot in a one-piece flight suit (mid
> grey), boots and gloves (dark grey), and a rounded white flight helmet with a dark visor
> down. Lean, upright posture. The pilot in reference 1 (small, at the left of the hangar)
> shows the role; draw a better, clearer version.
>
> Seven frames, all at exactly the same scale, evenly spaced in a single horizontal row
> with clear empty space between them, each figure standing on the same baseline:
> 1-4: a four-frame walk cycle, side view facing right (contact, passing, contact with the
> other leg, passing), arms swinging opposite to the legs.
> 5-6: two frames climbing a ladder, seen from the side facing right, hands reaching up for
> rungs and one knee raised, alternating which arm and leg are up (do not draw the ladder).
> 7: seated, side view facing right, only the head, shoulders and upper chest, as if seen
> above a cockpit rim, hands not visible.

**`hand.webp`** (reference: `hangar-play`; transparent background):

> Two game sprites in retro 16-bit pixel art, strictly black and white (greyscale only, no
> colour), five or six flat grey tones, hard pixel edges, no anti-aliasing, on a
> transparent background. No text, no labels, no cassette, no buttons, nothing else in the
> image.
>
> First-person view of the pilot's right arm reaching forward into the picture from the
> bottom-right corner: a dark-grey flight-suit sleeve, a light cuff at the wrist, and a
> padded mid-grey flight glove with visible finger segments. The reference storyboard
> shows the role (the crude hand pressing a key at the bottom); draw a much better hand and
> arm at a similar size relative to the frame.
>
> Two separate poses side by side with clear empty space between them, each arm entering
> from its own bottom-right:
> Left: the hand gripping something flat and rectangular from its right-hand end, fingers
> curled over the top edge and the thumb underneath, as if holding the end of a cassette
> tape (do not draw the cassette; leave the space between the fingers and thumb empty).
> Right: the hand pointing, index finger straight out to the left and slightly down, as if
> pressing a button, the other fingers curled into the palm.

## Not checked

- **The terms for using generated images in a published game.** OpenAI's and the image
  service's terms haven't been read for this; check them before the game is published.
