.pragma library

// 16x14 pixel cat. o outline, b body, p blush/inner ear, e eye, w eye shine,
// m open mouth, . transparent. Rows 0-4 are the ears (+ head top), so the
// ears can perk up one pixel or fold flat without moving the face.
var ears = {
  normal: [
    "................",
    "..oo........oo..",
    "..opo......opo..",
    "..oppo....oppo..",
    "..obbboooobbbo.."
  ],
  // Gamer launching: ears shoot up one pixel, tips sharpen.
  perk: [
    "..o..........o..",
    "..oo........oo..",
    "..opo......opo..",
    "..oppo....oppo..",
    "..obbboooobbbo.."
  ],
  // Buddy stressed: ears fold out flat, airplane style.
  flat: [
    "................",
    "................",
    "................",
    "ooo..........ooo",
    "oppooooooooooppo"
  ]
}

var head = [
  ".obbbbbbbbbbbbo.",
  ".obbbbbbbbbbbbo.",
  null, // eyes row A
  null, // eyes row B
  ".obpbbboobbbpbo.",
  null, // mouth row A
  "..obbbboobbbbo..",
  "...obbbbbbbbo...",
  "....oooooooo...."
]

var eyes = {
  open:  [".obbwebbbbwebbo.", ".obbeebbbbeebbo."],
  blink: [".obbbbbbbbbbbbo.", ".obbeebbbbeebbo."],
  happy: [".obbebbbbbbebbo.", ".obebebbbbebebo."],
  sleep: [".obbbbbbbbbbbbo.", ".obeeebbbbeeebo."],
  // Pupils at the top, whites below: looking up at the buddy.
  up:    [".obbeebbbbeebbo.", ".obbwwbbbbwwbbo."]
}

var mouths = {
  closed: ".obbbbobbobbbbo.",
  open:   ".obbbbommobbbbo."
}

function cat(eyeKey, mouthKey, earKey) {
  var e = eyes[eyeKey] || eyes.open
  var h = head.slice()
  h[2] = e[0]
  h[3] = e[1]
  h[5] = mouths[mouthKey] || mouths.closed
  return (ears[earKey] || ears.normal).concat(h)
}

var note = [
  "..o..",
  "..oo.",
  "..o.o",
  "..o..",
  "ooo..",
  "ooo.."
]

var zed = [
  "oooo",
  "..o.",
  ".o..",
  "oooo"
]
