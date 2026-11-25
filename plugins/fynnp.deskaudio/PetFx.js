.pragma library

// PetFx: effect sprites shared by every desk pet, so a heart or a sweat drop
// looks the same on every card. Canonical copy: shared/PetFx.js -- copy
// verbatim. Guide: docs/PETS.md
//
// Drawn with PixelSprite at the pet's px (2) using PetColors.fx(colour):
//   o main colour, h highlight (lighter), e ink (background), . empty.
// Suggested colours: heart/blush -> "p" tone or urgent, sweat -> accent light,
// z/notes/sparkles -> foreground, anger/steam-when-hot -> urgent.

var heart = [
  ".oo.oo.",
  "ohhoooo",
  "ohooooo",
  "ooooooo",
  ".ooooo.",
  "..ooo..",
  "...o..."
]

var heartSmall = [
  "oo.oo",
  "ohooo",
  "ooooo",
  ".ooo.",
  "..o.."
]

// Sweat drop, falls / slides down.
var sweat = [
  "..o..",
  ".oho.",
  "ohooo",
  "ohooo",
  ".ooo."
]

var zed = [
  "ooooo",
  "...o.",
  "..o..",
  ".o...",
  "ooooo"
]

var zedSmall = [
  "ooo",
  ".o.",
  "ooo"
]

var note = [
  "..ooo",
  "..o.o",
  "..o.o",
  "..o..",
  "ooo..",
  "ooo.."
]

var noteDouble = [
  ".ooooo",
  ".o...o",
  ".o...o",
  ".o...o",
  "oo..oo",
  "oo..oo"
]

// Twinkle: two frames (small, big).
var sparkle = [
  [
    ".....",
    "..o..",
    ".ooo.",
    "..o..",
    "....."
  ],
  [
    "..o..",
    "..o..",
    "oohoo",
    "..o..",
    "..o.."
  ]
]

// Anger vein (cartoon "cross-popping" mark).
var anger = [
  ".o...o.",
  "oo...oo",
  ".......",
  "oo...oo",
  ".o...o."
]

var bang = [
  "oo",
  "oo",
  "oo",
  "oo",
  "..",
  "oo"
]

var question = [
  ".ooo.",
  "o...o",
  "...o.",
  "..o..",
  ".....",
  "..o.."
]

// Dizzy spiral, two frames (turns).
var spiral = [
  [
    ".oooo.",
    "o....o",
    "o.oo.o",
    "o.o..o",
    "o.ooo.",
    ".o...."
  ],
  [
    "....o.",
    ".ooo.o",
    "o..o.o",
    "o.oo.o",
    "o....o",
    ".oooo."
  ]
]

// Steam / exertion puff, grows over three frames, then fades.
var puff = [
  [
    ".oo.",
    "oooo",
    ".oo."
  ],
  [
    "..oo..",
    ".oooo.",
    "oohooo",
    ".oooo."
  ],
  [
    "..o.oo..",
    ".oooooo.",
    "oohooooo",
    "ooooooo.",
    ".oo.oo.."
  ]
]

// Landing dust: left and right halves kick out from the feet.
var dust = [
  [
    "..o...",
    ".ooo..",
    "ooooo."
  ],
  [
    ".o..o.",
    "oo.ooo",
    "......"
  ]
]

// Effort lines ("strain" marks) to put beside a struggling pet, mirrored by
// flipping the rows yourself if needed.
var effort = [
  "o...",
  ".o..",
  "....",
  "oo..",
  "....",
  ".o..",
  "o..."
]

// Small lightning bolt (overload / electric).
var bolt = [
  "..oo",
  ".oo.",
  "oooo",
  ".oo.",
  "oo..",
  "o..."
]

// Flame, two frames (overheating).
var flame = [
  [
    "..o...",
    ".oo.o.",
    ".oohoo",
    "oohhoo",
    "ohhhho",
    ".oooo."
  ],
  [
    "...o..",
    ".o.oo.",
    "oohoo.",
    "oohhoo",
    "ohhhho",
    ".oooo."
  ]
]

// Mirror a sprite horizontally (for left/right variants).
function mirror(rows) {
  var out = []
  for (var i = 0; i < rows.length; i++) out.push(rows[i].split("").reverse().join(""))
  return out
}
