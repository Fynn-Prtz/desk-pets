.pragma library

// 16x13 pixel router buddy. o outline, b body, s face panel, f face,
// a antenna tips, r / t receive / transmit LEDs, . transparent. Face rows are
// 10 panel pixels wide; the panel is 5 rows (sprite rows 5-9).
function wrap(x) { return ".ob" + x + "bo." }

var eyes = {
  open:    ["ssffssffss", "ssffssffss"],
  blink:   ["ssssssssss", "ssffssffss"],
  sleep:   ["ssssssssss", "sffssssffs"],
  happy:   ["ssfssssfss", "sfsfssfsfs"],
  worried: ["sfssssssfs", "ssffssffss"]
}

var mouths = {
  none: "ssssssssss",
  flat: "sssffffsss",
  open: "ssssffssss"
}

// Antennas (sprite rows 0-2). "wiggle" alternates with "up" while busy;
// "droop" flops them over while offline.
var antennas = {
  up: [
    "a..............a",
    ".o............o.",
    "..o..........o.."
  ],
  wiggle: [
    ".a............a.",
    ".o............o.",
    "..o..........o.."
  ],
  droop: [
    "................",
    ".oo..........oo.",
    "a..o........o..a"
  ]
}

// eyeShift -1 lifts the eyes one row (bobbing to the music).
function router(antennaKey, eyeKey, mouthKey, eyeShift) {
  var ant = antennas[antennaKey] || antennas.up
  var e = eyes[eyeKey] || eyes.open
  var m = mouths[mouthKey] || mouths.none
  var face = eyeShift === -1
    ? [e[0], e[1], "ssssssssss", m, "ssssssssss"]
    : ["ssssssssss", e[0], e[1], m, "ssssssssss"]
  return [
    ant[0],
    ant[1],
    ant[2],
    ".oooooooooooooo.",
    ".obbbbbbbbbbbbo.",
    wrap(face[0]),
    wrap(face[1]),
    wrap(face[2]),
    wrap(face[3]),
    wrap(face[4]),
    ".obbbbbbbbrbtbo.",
    ".oooooooooooooo.",
    "...oo......oo..."
  ]
}

var zed = [
  "oooo",
  "..o.",
  ".o..",
  "oooo"
]

// Packets: down arrows fall into the left antenna, up arrows rise from the right.
var down = [
  ".o.",
  ".o.",
  "ooo",
  ".o."
]

var up = [
  ".o.",
  "ooo",
  ".o.",
  ".o."
]

// Offline: a question mark over the drooping antennas.
var what = [
  ".oo.",
  "o..o",
  "..o.",
  "....",
  "..o."
]

// Rising music note while the cat dances.
var note = [
  "..o..",
  "..oo.",
  "..o.o",
  "..o..",
  "ooo..",
  "ooo.."
]
