# Desk pets — design and integration guide

Every desk card has a pixel pet in its hero row. This guide defines how they look, move,
struggle and react, so a pet on one card feels like it belongs with all the others.

## Shared pieces (canonical in `shared/`, copied verbatim into each card)

| file | what |
|---|---|
| `PixelSprite.qml` | string rows + palette → one Canvas, repaints only on change, merges runs |
| `PetColors.qml` | the shading palette from the live theme (keys below), `extend({…})`, `fx(colour)` |
| `PetFx.js` | shared effect sprites: hearts, sweat, z's, notes, sparkle, anger, `!`, `?`, spiral, puff, dust, effort lines, bolt, flame |
| `PetTouch.qml` | click / hold / hover / layout-drag input → `reaction`, `look`, `lean`, `landing`, `busy`, `maskRect` |
| `DeskPlace.qml`, `DeskLink.qml` | placement/edit mode and the mood bus (unchanged contracts) |

Never edit a copy inside a plugin; change `shared/` and recopy everywhere.
Preview tool: `tools/pet-preview.js` (contact sheets + GIFs with the live theme; header has usage).

## Grid and size

- The pet item stays **88 × 76 logical px** (same footprint as the old px-4 pets), so card layouts
  don't change. Pets are now drawn at **px 2** on a **44 × 38 cell** canvas.
- The pet body uses at most ~36 × 30 cells; keep ~3 cells above for hops and the top-right corner
  (~10 × 12 cells) for effects. Effects may overlap the body.
- All motion is in whole cells (2 px). Never fractional positions, never smooth tweening.

## Palette keys (PetColors)

`o` outline (fg) · `b` body (accent) · `h` highlight (top light) · `n` shade (lower side) ·
`d` dark (stripes, details) · `w` light fur/belly · `l` lightest · `p` blush/pink · `e` ink (eyes,
mouth) · `x` eye glint · `s` screen · `g` lit screen glow · `f` face on a screen · `r` urgent ·
`k` soft urgent · `t` floor shadow. Use only these (plus per-pet overrides via `extend()` for LEDs etc.)
so every theme works. Reference for shading quality: the screensaver cat (`plugins/fynnp.catsaver/Sprites.js`).

## Cute rules

- Big head, small body, stubby limbs. Rounded silhouettes: cut outline corners (no square corners).
- One-cell `o` outline all around, top-lit shading (`h` just under the top edge, `n` along the
  bottom), a floor shadow (`t`) under the feet.
- Big eyes: 3–4 cells tall with an `x` glint in the upper corner. Blush `p` under the eyes.
  Tiny mouths (ω, little smile, small "o").
- Expressions are the main storytelling tool. Every pet needs at least: open (+ look left/right/up/
  down by moving pupils one cell), blink, sleep, happy `^ ^`, squint `> <` (being petted), strain
  (struggling), dizzy (spirals), worried, wide (surprised), angry (slanted brows).
- Mouths: smile, open, gritted teeth (struggle), wobbly (worried), pout (annoyed).

## Behaviour ladder (data → mood → animation)

Each pet maps its card's data to an intensity ladder. Struggle must be **visible and funny**:
the heavier the work, the harder the pet visibly tries.

1. **sleep** (nothing happening): slow breathing (body rises one cell for ~1 s every ~3 s), closed
   eyes, drifting z's.
2. **calm**: awake, blinks (random 2.6–5.6 s), an occasional idle fidget every ~8–15 s
   (look around, stretch, yawn, scratch, wiggle) — pick from a small set at random.
3. **working**: rhythmic, pet-specific activity (typing, juggling packets, spinning, munching…).
4. **struggling**: gritted teeth + strain eyes, sweat drops, 1-cell shake, effort lines, steam puffs;
   the activity itself looks effortful (heavy lifting, bulging cheeks, overloaded arms).
5. **overwhelmed / critical**: dizzy spirals, smoke or flames, wobbling, near collapse; uses `r`.

Keep the mood keys as strings so the sprite only repaints when a key changes.

## Interaction (PetTouch)

| input | reaction (all pets) |
|---|---|
| hover | wake up / perk up; eyes follow the cursor (`lookX/lookY` → pupils) |
| click → `reaction === "pet"` | squint `> <`, blush, 1–2 hearts rise, a little hop or wiggle; pet-specific flavour (purr, giggle, beep) |
| 4+ quick clicks → `"annoyed"` | anger mark, pout / puffed cheeks, turns away or stomps |
| press & hold → `"squish"` | squashed sprite (2–3 cells shorter, 1–2 wider), giggling |
| layout drag (`dragged`, `lean`) | dangling / tilting against the motion, wide worried eyes, sweat or "!" |
| drop (`landing`) | squash on landing + dust puffs, then a short dizzy wobble |

A reaction overrides the mood animation while it plays, but a struggling pet keeps sweating
(petting a maxed-out pet → it tries to smile through the strain).

## Performance contract

- Clock: the card's 250 ms clock (4 fps). It may run at 125 ms (8 fps) **only** while a reaction,
  drag or landing plays (`touch.busy`). Zero ticks when nothing moves.
- Every Timer `running:` includes the card's `active`. PetTouch already stops everything when inactive.
- Sprites: build frames from small row arrays / shape functions and **memoise** by key in Sprites.js
  (a frame is built once, then reused). No per-tick string building of the whole sprite.
- `pet.moving` (true while the pet needs frames although the mood would rest: grooving,
  `touch.busy`, an idle fidget in progress) keeps the clock running.

## Pet settings (`pet`, `petReactions`, `petMotion`)

Every pet has `property string motion` (`"full" | "calm" | "still"`) and `property bool reactions`, set by
the card from its shell.json entry. Every feature must respect them, and turning them down must only
remove work:

- `full`: everything.
- `calm`: no optional idle extras: no fidget timer, no neighbour moments (grooving to the cat, screen
  signs, worried looks, future pet chat). Mood animations, blinks and responses to the user stay.
- `still`: mood frames only. The card's clock Timer does not run (`&& petMotion !== "still"`), the pet runs
  no Timer (no blinks, no fidgets). Bindings still follow touch: a click shows the reaction's first pose and
  hover turns the eyes, with zero ticks.
- `reactions: false` → PetTouch `reactions: false`: no hover, clicks, drag dangle or landing, and an empty
  `maskRect` (click-through cards become fully click-through). `pet: false` hides the pet item
  (`visible: false`, `active: false`, width 0) and the card's clock stays off; maskRect is empty then too.
- Check: `tools/pet-settings-check/run.sh` (loads every real pet offscreen, counts running timers per mode).

## Card integration (each card)

1. Copy `shared/{PixelSprite,PetColors,PetTouch,DeskPlace}.qml` and `shared/PetFx.js` into the plugin.
2. In the pet component: `PetColors { id: colors }`, `PetTouch { id: touch; anchors.fill: parent;
   active: …; reactions: …; place: …; window: … }`, expose `property alias touch: touch` and include
   `touch.busy` in `moving`.

3. Instantiate the pet with `px: 2`.
4. Click-through cards (`mask` was `place.noInput`): add
   `Region { id: petRegion; x: pet.touch.maskRect.x; y: pet.touch.maskRect.y; width: pet.touch.maskRect.width; height: pet.touch.maskRect.height }`
   and use `mask: place.editing ? place.editMask : petRegion`. Interactive cards (mask `null`) need nothing.
