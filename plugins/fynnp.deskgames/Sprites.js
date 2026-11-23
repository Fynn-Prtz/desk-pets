.pragma library

// 16x13 pixel gamepad critter. o outline, b body, d d-pad, a face buttons,
// h a pressed button / d-pad arm, s face plate, f face, m open mouth,
// . transparent. The face plate is 8 pixels wide (columns 4..11).
function row(left, face, right) { return left + face + right }

var eyes = {
  open:   ["ssfssfss", "ssfssfss"],
  blink:  ["ssssssss", "ssfssfss"],
  sleep:  ["ssssssss", "sffssffs"],
  happy:  ["ssfssfss", "sfsffsfs"],
  wide:   ["sffssffs", "sffssffs"],
  focus:  ["sfssssfs", "ssfssfss"],
  worry:  ["ssfssfss", "sfssssfs"]
}

var mouths = {
  none:  "ssssssss",
  flat:  "sssffsss",
  grin:  "ssffffss",
  open:  "sssmmsss"
}

// frame 0: rest; 1 and 2: alternating button mash.
function gamer(eyeKey, mouthKey, frame) {
  var e = eyes[eyeKey] || eyes.open
  var dl = frame === 1 ? "h" : "d", dr = frame === 2 ? "h" : "d"
  var bt = frame === 1 ? "h" : "a", bl = frame === 2 ? "h" : "a"
  return [
    "..ooo......ooo..",
    ".oooooooooooooo.",
    "obbbbbbbbbbbbbbo",
    row("obdb", "ssssssss", "b" + bt + "bo"),
    row("o" + dl + "d" + dr, e[0], bl + "bao"),
    row("obdb", e[1], "babo"),
    row("obbb", mouths[mouthKey] || mouths.none, "bbbo"),
    "obbbbssssssbbbbo",
    "obbbbbbbbbbbbbbo",
    "obbbboooooobbbbo",
    "obbbo......obbbo",
    "obbo........obbo",
    ".oo..........oo."
  ]
}

var zed = [
  "oooo",
  "..o.",
  ".o..",
  "oooo"
]

var drop = [
  ".o.",
  "ooo",
  "ooo",
  ".o."
]

var note = [
  "..o..",
  "..oo.",
  "..o.o",
  "..o..",
  "ooo..",
  "ooo.."
]

// Tiny trophy cup, drawn at px 2 (9x8). o cup/handles/stem/base, s shine.
// Handles are open loops at the sides, the cup narrows into a stem on a base.
var trophy = [
  "ooooooooo",
  "o.osooo.o",
  "o.osooo.o",
  ".ooooooo.",
  "...ooo...",
  "....o....",
  "...ooo...",
  "..ooooo.."
]

var sparkle = [
  ".o.",
  "ooo",
  ".o."
]
