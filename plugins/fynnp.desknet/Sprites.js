.pragma library

// Router pet for the Desk Net card, v2: 44x38 cells drawn at px 2.
// A chubby little router box with two antennas (ball tips), a face on its
// front, a strip of port LEDs, stubby arms and legs. Top-lit shading like the
// screensaver cat (shared/PetColors keys, see docs/PETS.md). Extra keys:
//   a  antenna tips            1 2 3 4  port LEDs (left to right)
// The QML side colours those through colors.with({...}).
//
// The body frame is built from shape functions and memoised by its key, so
// each pose is built once and reused; QML only swaps keys. Effects (packets,
// z's, hearts, sweat, wifi arcs) are separate small sprites.
//
// router(key): key is "eyes|lookX|lookY|mouth|arms|legs|antennas|squash|drop|lean|blush"
//   eyes     open blink sleep happy squint strain dizzy worried wide angry
//   mouth    none smile omega open o grit wobble pout flat
//   arms     rest wave up catch juggle1 juggle2 flail1 flail2 hug cheer fists
//   legs     stand tap shake1 shake2 dangle
//   antennas up relax wiggle1 wiggle2 bent1 bent2 flop cross wave1 wave2 heart perk
//   squash   rows the body top sinks (0..3); 2+ also widens it
//   drop     rows the body sits lower (-2..2; < 0 = stretched legs)
//   lean     -1/0/1 tilt
//   blush    0 none, 1 pink, 2 urgent

var W = 44
var H = 38
var FLOOR = 35

// ---------- tiny raster kit (same idea as the catsaver) ----------
function grid() {
  var g = []
  for (var y = 0; y < H; y++) {
    var r = []
    for (var x = 0; x < W; x++) r.push(".")
    g.push(r)
  }
  return g
}

function put(g, x, y, c) { if (y >= 0 && y < H && x >= 0 && x < W) g[y][x] = c }
function get(g, x, y) { return y >= 0 && y < H && x >= 0 && x < W ? g[y][x] : "." }
function putIf(g, x, y, c, only) { if (only.indexOf(get(g, x, y)) >= 0) put(g, x, y, c) }

// Fill mask(x, y) with fill(x, y, inside) and ring it with a 1-cell outline
// (8-neighbourhood). Returns the inside table.
function layer(g, mask, fill) {
  var inside = []
  for (var y = 0; y < H; y++) {
    var r = []
    for (var x = 0; x < W; x++) r.push(!!mask(x, y))
    inside.push(r)
  }
  for (var y2 = 0; y2 < H; y2++) {
    for (var x2 = 0; x2 < W; x2++) {
      if (inside[y2][x2]) { g[y2][x2] = typeof fill === "function" ? fill(x2, y2, inside) : fill; continue }
      var edge = false
      for (var dy = -1; dy <= 1 && !edge; dy++)
        for (var dx = -1; dx <= 1 && !edge; dx++) {
          var yy = y2 + dy, xx = x2 + dx
          if (yy >= 0 && yy < H && xx >= 0 && xx < W && inside[yy][xx]) edge = true
        }
      if (edge) g[y2][x2] = "o"
    }
  }
  return inside
}

function isIn(inside, x, y) { return y >= 0 && y < H && x >= 0 && x < W && inside[y][x] }

// Rounded box: superellipse through the cell centres.
function inBox(x, y, x0, y0, x1, y1, n) {
  var cx = (x0 + x1 + 1) / 2, cy = (y0 + y1 + 1) / 2
  var rx = (x1 - x0 + 1) / 2, ry = (y1 - y0 + 1) / 2
  var dx = Math.abs(x + 0.5 - cx) / rx, dy = Math.abs(y + 0.5 - cy) / ry
  return Math.pow(dx, n) + Math.pow(dy, n) <= 1
}

// Capsule (thick segment) from a to b with radius r.
function inSeg(x, y, a, b, r) {
  var px = x + 0.5, py = y + 0.5
  var vx = b[0] - a[0], vy = b[1] - a[1], l2 = vx * vx + vy * vy
  var t = l2 > 0 ? Math.max(0, Math.min(1, ((px - a[0]) * vx + (py - a[1]) * vy) / l2)) : 0
  var ex = a[0] + vx * t - px, ey = a[1] + vy * t - py
  return ex * ex + ey * ey <= r * r
}

// Top-lit shading of a filled region: highlight under the top contour,
// shade above the bottom one.
function shade(base, hiCut) {
  return function(x, y, inside) {
    if (!isIn(inside, x, y - 1) && x < hiCut) return "h"
    if (!isIn(inside, x, y + 2)) return "n"
    return base
  }
}

// Stamp a small pattern; "." is skipped. mirror flips it horizontally.
function stamp(g, rows, x, y, mirror) {
  for (var r = 0; r < rows.length; r++) {
    var row = rows[r]
    for (var c = 0; c < row.length; c++) {
      var ch = mirror ? row.charAt(row.length - 1 - c) : row.charAt(c)
      if (ch !== ".") put(g, x + c, y + r, ch)
    }
  }
}

// ---------- face parts (4 wide; the right eye is the mirror) ----------
var EYES = {
  open:    [".ee.", "eexe", "eeee", ".ee."],
  blink:   ["....", "....", "eeee", "...."],
  sleep:   ["....", "e..e", ".ee.", "...."],
  happy:   ["....", ".ee.", "e..e", "...."],
  squint:  ["ee..", "..ee", "ee..", "...."],
  strain:  ["e...", ".ee.", "...e", ".ee."],
  dizzy:   ["eee.", "e..e", "e.ee", ".e.."],
  worried: [".ee.", "eexe", "eeee", ".ee."],
  wide:    [".ee.", "eexe", "eeee", "eeee", ".ee."],
  angry:   ["....", "eee.", "eexe", ".ee."]
}
// Brows (row above the eyes), left side; mirrored for the right.
var BROWS = {
  worried: ["...e", ".ee."],
  angry:   ["e...", ".ee."],
  strain:  ["ee..", "..ee"]
}
var MOUTHS = {
  none:   [],
  smile:  ["e..e", ".ee."],
  omega:  ["e.ee.e", ".e..e."],
  open:   [".ee.", "eppe", ".ee."],
  o:      [".ee.", "e..e", ".ee."],
  grit:   ["eeeeee", "exexex", "eeeeee"],
  wobble: [".e.e.e", "e.e.e."],
  pout:   [".ee.", "e..e"],
  flat:   ["eeee"]
}

// ---------- face parts (4 wide; the right eye mirrors where it matters) ----------
var EYES = {
  open:    [".ee.", "eexe", "eeee", ".ee."],
  blink:   ["....", "....", "eeee", "...."],
  sleep:   ["....", "e..e", ".ee.", "...."],
  happy:   ["....", ".ee.", "e..e", "...."],
  squint:  ["ee..", "..ee", "ee..", "...."],
  strain:  ["e...", ".ee.", "...e", ".ee."],
  dizzy:   ["eee.", "e..e", "e.ee", ".e.."],
  worried: [".ee.", "eexe", "eeee", ".ee."],
  wide:    [".ee.", "eexe", "eeee", "eeee", ".ee."],
  angry:   ["....", "eee.", "eexe", ".ee."]
}
var BROWS = {
  worried: ["...e", ".ee."],
  angry:   ["e...", ".ee."],
  strain:  ["ee..", "..ee"]
}
var MOUTHS = {
  none:   [],
  smile:  ["e..e", ".ee."],
  omega:  ["e.ee.e", ".e..e."],
  open:   [".ee.", "eppe", ".ee."],
  o:      [".ee.", "e..e", ".ee."],
  grit:   ["eeeeee", "exexex", "eeeeee"],
  wobble: [".e.e.e", "e.e.e."],
  pout:   [".ee.", "e..e"],
  flat:   ["eeee"]
}

// Antenna shapes for the LEFT antenna as offsets from its base: [mid, tip].
// The right one mirrors (dx negated) unless the pose lists its own.
var ANTENNAS = {
  up:      { l: [[-1, -5], [-2, -10]] },
  perk:    { l: [[0, -5], [-1, -11]] },
  relax:   { l: [[-2, -4], [-6, -7]] },
  wiggle1: { l: [[-1, -5], [-4, -9]], r: [[1, -5], [0, -10]] },
  wiggle2: { l: [[-1, -5], [0, -10]], r: [[1, -5], [4, -9]] },
  bent1:   { l: [[-1, -6], [4, -8]], r: [[2, -5], [6, -3]] },
  bent2:   { l: [[-2, -5], [-6, -3]], r: [[1, -6], [-4, -8]] },
  flop:    { l: [[-3, -3], [-7, -1]] },
  cross:   { l: [[1, -5], [7, -9]] },
  wave1:   { l: [[-3, -4], [-8, -6]], r: [[2, -5], [2, -10]] },
  wave2:   { l: [[-2, -5], [-2, -10]], r: [[3, -4], [8, -6]] },
  heart:   { l: [[-2, -6], [3, -10]] }
}

// 1-cell line between two points (Bresenham).
function line(g, a, b, c) {
  var x0 = Math.round(a[0]), y0 = Math.round(a[1]), x1 = Math.round(b[0]), y1 = Math.round(b[1])
  var dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1, err = dx + dy
  for (;;) {
    put(g, x0, y0, c)
    if (x0 === x1 && y0 === y1) break
    var e2 = 2 * err
    if (e2 >= dy) { err += dy; x0 += sx }
    if (e2 <= dx) { err += dx; y0 += sy }
  }
}

function drawAntenna(g, base, pts) {
  var mid = [base[0] + pts[0][0], base[1] + pts[0][1]]
  var tip = [base[0] + pts[1][0], base[1] + pts[1][1]]
  line(g, base, mid, "o")
  line(g, mid, tip, "o")
  // ball tip: 2x2 light with an outline ring
  var tx = Math.round(tip[0]), ty = Math.round(tip[1])
  layer(g, function(x, y) { return (x === tx || x === tx + 1) && (y === ty - 1 || y === ty) }, function(x, y) {
    return x === tx && y === ty - 1 ? "x" : "a"
  })
  put(g, tx - 1, ty - 2, "."); put(g, tx + 2, ty - 2, "."); put(g, tx - 1, ty + 1, "."); put(g, tx + 2, ty + 1, ".")
}

// ---------- the router ----------
var cache = {}
var cacheSize = 0

function router(key) {
  var hit = cache[key]
  if (hit) return hit
  if (cacheSize > 400) { cache = {}; cacheSize = 0 }
  var rows = build(String(key).split("|"))
  cache[key] = rows
  cacheSize++
  return rows
}

function build(k) {
  var eyes = k[0] || "open", lx = +k[1] || 0, ly = +k[2] || 0, mouth = k[3] || "none"
  var arms = k[4] || "rest", legs = k[5] || "stand", ant = k[6] || "up"
  var sq = +k[7] || 0, drop = +k[8] || 0, lean = +k[9] || 0, blush = +k[10] || 0
  var g = grid()

  var wide = sq >= 2 ? 1 : 0
  var x0 = 8 - wide, x1 = 35 + wide
  var y0 = 13 + sq + drop, y1 = 30 + drop

  // Legs, behind the body.
  var lt = legs === "dangle" ? 2 : 0
  var dl = 0, dr = 0, upL = 0
  if (legs === "shake1") { dl = -1; dr = 1 }
  if (legs === "shake2") { dl = 1; dr = -1 }
  if (legs === "tap") upL = 1
  var feetBottom = 33 + lt
  layer(g, function(x, y) {
    var top = y1 - 1
    if (x >= 13 + dl && x <= 17 + dl && y >= top && y <= feetBottom - upL) return true
    if (x >= 26 + dr && x <= 30 + dr && y >= top && y <= feetBottom) return true
    return false
  }, function(x, y) { return y >= feetBottom - 1 - (x < 22 ? upL : 0) ? "n" : "d" })

  // Antennas, behind the body (their bases tuck under the top edge).
  var A = ANTENNAS[ant] || ANTENNAS.up
  var lp = A.l
  var rp = A.r || [[-lp[0][0], lp[0][1]], [-lp[1][0], lp[1][1]]]
  drawAntenna(g, [12, y0 + 1], lp)
  drawAntenna(g, [31, y0 + 1], rp)

  var AR = armSegs(arms, y0, y1, x0, x1)
  for (var i = 0; i < AR.back.length; i++) drawArm(g, AR.back[i])

  // Body: a soft box, lighter top plate, shaded underside.
  var body = layer(g, function(x, y) { return inBox(x, y, x0, y0, x1, y1, 4) }, function(x, y, inside) {
    if (!isIn(inside, x, y - 1)) return "l"
    if (!isIn(inside, x, y - 2)) return "h"
    if (!isIn(inside, x, y + 1) || !isIn(inside, x, y + 2)) return "n"
    if (!isIn(inside, x + 1, y)) return "n"
    if (!isIn(inside, x - 1, y)) return "h"
    return "b"
  })
  // the top plate's front edge
  for (var tx = x0 + 2; tx <= x1 - 2; tx++) putIf(g, tx, y0 + 2, "w", "b")
  // vent slots on the top plate
  for (var vx = 17; vx <= 26; vx += 3) { putIf(g, vx, y0 + 1, "n", "h"); putIf(g, vx + 1, y0 + 1, "n", "h") }

  // Port strip with LEDs at the bottom of the front.
  var py = y1 - 3
  for (var sx = 12; sx <= 31; sx++) { put(g, sx, py, "d"); put(g, sx, py + 1, "d") }
  put(g, 11, py, "n"); put(g, 32, py, "n"); put(g, 11, py + 1, "n"); put(g, 32, py + 1, "n")
  var leds = [[14, "1"], [18, "2"], [24, "3"], [28, "4"]]
  for (var l = 0; l < leds.length; l++) { put(g, leds[l][0], py, leds[l][1]); put(g, leds[l][0] + 1, py, leds[l][1]) }
  // little port holes under the LEDs
  for (var ph = 13; ph <= 30; ph += 2) put(g, ph, py + 1, "e")

  // Face.
  var fy = Math.max(0, sq - 1)
  var ey = y0 + 4 + ly - Math.min(sq, 2)
  var exL = 14 + lx, exR = 26 + lx
  var eye = EYES[eyes] || EYES.open
  if (eyes === "wide") ey -= 1
  var asym = eyes === "squint" || eyes === "strain" || eyes === "dizzy" || eyes === "angry"
  stamp(g, eye, exL, ey, false)
  stamp(g, eye, exR, ey, asym)
  var brow = BROWS[eyes]
  if (brow) { stamp(g, brow, exL, ey - 2, false); stamp(g, brow, exR, ey - 2, true) }
  var fyy = y0 + 4 - Math.min(sq, 2)
  if (blush) {
    var bc = blush === 2 ? "r" : "p"
    put(g, 12, fyy + 4, bc); put(g, 13, fyy + 4, bc); put(g, 30, fyy + 4, bc); put(g, 31, fyy + 4, bc)
  }
  var m = MOUTHS[mouth] || []
  if (m.length) stamp(g, m, 22 - m[0].length / 2, fyy + 5, false)

  for (var j = 0; j < AR.front.length; j++) drawArm(g, AR.front[j])

  var sw = legs === "dangle" ? 7 : 11 + wide
  for (var fx = 22 - sw; fx < 22 + sw; fx++) if (get(g, fx, FLOOR) === ".") put(g, fx, FLOOR, "t")
  for (var fx2 = 22 - sw + 3; fx2 < 22 + sw - 3; fx2++) if (get(g, fx2, FLOOR + 1) === ".") put(g, fx2, FLOOR + 1, "t")

  if (lean) shear(g, lean, y1)

  var out = []
  for (var y = 0; y < H; y++) out.push(g[y].join(""))
  return out
}

// Arm capsules for a pose: { back: [...], front: [...] }, each [a, b, r].
function armSegs(pose, y0, y1, x0, x1) {
  var sy = y0 + 9
  var L = x0, R = x1
  switch (pose) {
  case "wave":    // right arm waving up, left resting
    return { back: [[[L + 1, sy], [L - 2, sy + 4], 1.3]], front: [[[R - 1, sy - 1], [R + 3, sy - 6], 1.3]] }
  case "cheer":   // both arms up and out
    return { back: [], front: [[[L + 1, sy - 1], [L - 3, sy - 7], 1.3], [[R - 1, sy - 1], [R + 3, sy - 7], 1.3]] }
  case "up":      // holding something overhead
    return { back: [], front: [[[L, y0 + 7], [L + 1, y0 - 2], 1.3], [[R, y0 + 7], [R - 1, y0 - 2], 1.3]] }
  case "carry":   // right hand up by the shutter (pulling / stuffing bits), left on the hip
    return { back: [[[L + 1, sy], [L - 2, sy + 3], 1.3]], front: [[[R - 1, sy - 2], [R + 2, y0 + 1], 1.3]] }
  case "carry2":  // the other hand
    return { back: [[[R - 1, sy], [R + 2, sy + 3], 1.3]], front: [[[L + 1, sy - 2], [L - 2, y0 + 1], 1.3]] }
  case "catch":   // both hands up and out, catching
    return { back: [], front: [[[L + 1, sy - 1], [L - 3, sy - 5], 1.3], [[R - 1, sy - 1], [R + 3, sy - 5], 1.3]] }
  case "juggle1": // left hand up, right down
    return { back: [], front: [[[L + 1, sy - 1], [L - 2, sy - 6], 1.3], [[R - 1, sy], [R + 3, sy + 1], 1.3]] }
  case "juggle2":
    return { back: [], front: [[[L + 1, sy], [L - 3, sy + 1], 1.3], [[R - 1, sy - 1], [R + 2, sy - 6], 1.3]] }
  case "flail1":
    return { back: [], front: [[[L + 1, sy - 1], [L - 3, sy - 6], 1.3], [[R - 1, sy], [R + 3, sy + 3], 1.3]] }
  case "flail2":
    return { back: [], front: [[[L + 1, sy], [L - 3, sy + 3], 1.3], [[R - 1, sy - 1], [R + 3, sy - 6], 1.3]] }
  case "hug":     // hands pressed to the cheeks
    return { back: [], front: [[[L + 1, sy], [L + 3, sy + 3], 1.3], [[R - 1, sy], [R - 3, sy + 3], 1.3]] }
  case "fists":   // stomping, arms down and tense
    return { back: [], front: [[[L + 1, sy], [L - 1, sy + 4], 1.4], [[R - 1, sy], [R + 1, sy + 4], 1.4]] }
  default:        // rest: little nubs at the sides
    return { back: [[[L + 1, sy], [L - 2, sy + 3], 1.3], [[R - 1, sy], [R + 2, sy + 3], 1.3]], front: [] }
  }
}

function drawArm(g, s) {
  layer(g, function(x, y) { return inSeg(x, y, s[0], s[1], s[2]) }, function(x, y, inside) {
    return !isIn(inside, x, y - 1) ? "h" : !isIn(inside, x, y + 1) ? "n" : "b"
  })
}

// Tilt: shift rows above the feet so the top leans `dir` (cells).
function shear(g, dir, y1) {
  var pivot = y1 + 1
  for (var y = 0; y < pivot; y++) {
    var s = Math.round(dir * (pivot - y) / 12)
    if (!s) continue
    var row = g[y].slice()
    for (var x = 0; x < W; x++) {
      var src = x - s
      g[y][x] = src >= 0 && src < W ? row[src] : "."
    }
  }
}

// ---------- effect sprites (fx palette: o colour, h lighter, e ink) ----------
// A packet: a tiny envelope.
var packet = [
  "oooooo",
  "oehheo",
  "oheeho",
  "ohhhho",
  "oooooo"
]
// Wi-Fi arcs searching for a signal: 0..3 arcs lit.
var wifi = [
  [
    ".......",
    ".......",
    ".......",
    ".......",
    "...o..."
  ],
  [
    ".......",
    ".......",
    "..ooo..",
    ".......",
    "...o..."
  ],
  [
    ".ooooo.",
    "o.....o",
    "..ooo..",
    ".......",
    "...o..."
  ]
]
// A broken arc with an x: the search failed.
var nowifi = [
  "o.o....",
  ".o.....",
  "o.ooo..",
  ".......",
  "...o..."
]
