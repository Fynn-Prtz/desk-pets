.pragma library

// 16x13 pixel floppy disk critter. o outline, b body, s metal shutter,
// l label, f face ink on the label, . transparent. The top-right corner is
// cut like a real 3.5" disk. The face lives on the label: 10 pixels wide,
// 5 rows (sprite rows 6-10).
function wrap(x) { return ".ob" + x + "bo." }

var eyes = {
  open:    ["llffllffll", "llffllffll"],
  blink:   ["llllllllll", "llffllffll"],
  sleep:   ["llllllllll", "lffllllffl"],
  happy:   ["llfllllfll", "lflfllflfl"],
  // Busy: eyes dart left and right, following the head.
  left:    ["lffllfflll", "lffllfflll"],
  right:   ["lllffllffl", "lllffllffl"],
  // Full: raised inner brows over open eyes.
  worried: ["lllfllflll", "llffllffll"]
}

var mouths = {
  none:  "llllllllll",
  flat:  "lllfffflll",
  open:  "llllffllll",
  wavy:  "llflfflfll"
}

// The shutter (7 pixels wide) with its slot; it slides while the disk is busy.
var shutters = {
  a: "ssoosss",
  b: "ssssoos"
}

// eyeShift -1 lifts the eyes one row (bobbing to the music).
function disk(eyeKey, mouthKey, shutterKey, eyeShift) {
  var e = eyes[eyeKey] || eyes.open
  var m = mouths[mouthKey] || mouths.none
  var blank = "llllllllll"
  var label = eyeShift === -1 ? [e[0], e[1], blank, m, blank] : [blank, e[0], e[1], m, blank]
  var sh = shutters[shutterKey] || shutters.a
  return [
    ".oooooooooooo...",
    ".obbsssssssbbo..",
    ".obb" + sh + "bbbo.",
    ".obb" + sh + "bbbo.",
    ".obbsssssssbbbo.",
    ".obbbbbbbbbbbbo.",
    wrap(label[0]),
    wrap(label[1]),
    wrap(label[2]),
    wrap(label[3]),
    wrap(label[4]),
    ".obbbbbbbbbbbbo.",
    ".oooooooooooooo."
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

// Rising bits while the disk is busy.
var one = [
  ".o.",
  "oo.",
  ".o.",
  ".o.",
  "ooo"
]

var zero = [
  ".o.",
  "o.o",
  "o.o",
  "o.o",
  ".o."
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
