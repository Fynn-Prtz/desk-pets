.pragma library

// 16x13 pixel computer buddy. o outline, b body, s screen, f face,
// l power LED, . transparent. Face rows are 10 screen pixels wide; the
// screen is 6 rows (sprite rows 2-7).
function wrap(x) { return ".ob" + x + "bo." }

var eyes = {
  open:   ["ssffssffss", "ssffssffss"],
  blink:  ["ssssssssss", "ssffssffss"],
  sleep:  ["ssssssssss", "sffssssffs"],
  happy:  ["ssfssssfss", "sfsfssfsfs"],
  strain: ["sfssssssfs", "ssffssffss"],
  dizzy:  ["sfsfssfsfs", "ssfssssfss"]
}

var mouths = {
  none:   "ssssssssss",
  flat:   "sssffffsss",
  open:   "ssssffssss"
}

// Full-screen glyphs that replace the face (6 rows each).
var screens = {
  // Gamer launching: "!"
  bang: [
    "ssssffssss",
    "ssssffssss",
    "ssssffssss",
    "ssssssssss",
    "ssssffssss",
    "ssssssssss"
  ],
  // Gamer playing under load: a tiny game pad (d-pad left, buttons right).
  pad: [
    "ssssssssss",
    "sffffffffs",
    "ffsffffsff",
    "fsssffsfsf",
    "ffsffffsff",
    "fffssssfff"
  ]
}

// eyeShift -1 lifts the eyes one row (bobbing to the music).
function buddy(eyeKey, mouthKey, screenKey, eyeShift) {
  var scr = screens[screenKey]
  if (!scr) {
    var e = eyes[eyeKey] || eyes.open
    scr = ["ssssssssss", e[0], e[1], "ssssssssss", mouths[mouthKey] || mouths.none, "ssssssssss"]
    if (eyeShift === -1) scr = [e[0], e[1], "ssssssssss", "ssssssssss", scr[4], "ssssssssss"]
  }
  return [
    ".oooooooooooooo.",
    ".obbbbbbbbbbbbo.",
    wrap(scr[0]),
    wrap(scr[1]),
    wrap(scr[2]),
    wrap(scr[3]),
    wrap(scr[4]),
    wrap(scr[5]),
    ".obbbbbbbbbblbo.",
    ".oooooooooooooo.",
    "......obbo......",
    "....oobbbboo....",
    "....oooooooo...."
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

var flame = [
  ".o..",
  ".oo.",
  "oo.o",
  "oooo",
  ".oo."
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
