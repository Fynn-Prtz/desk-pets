.pragma library

// Floppy-disk pet for the Desk Disk card, v2: 44x38 cells drawn at px 2.
// A chunky 3.5" floppy with a sliding metal shutter on top, a paper label
// that is its face, a cut top-right corner, stubby arms and legs. Top-lit
// shading like the screensaver cat (shared/PetColors keys, see docs/PETS.md).
//
// The whole body frame is built from a few shape functions and memoised by
// its key string, so each distinct pose is built once and then reused; the
// QML side only swaps keys. Effects (z's, hearts, sweat, bits) are separate
// small sprites (PetFx.js + the bits below).
//
// disk(key): key is "eyes|lookX|lookY|mouth|arms|legs|shutter|squash|drop|lean|bloat|blush|stack|band"
//   eyes    open blink sleep happy squint strain dizzy worried wide angry
//   mouth   none smile omega open o grit wobble pout
//   arms    rest wave up carry flail1 flail2 hug cheer
//   legs    stand tap shake1 shake2 dangle
//   shutter cells the shutter slides right (-2..3)
//   squash  rows the body top sinks (0..3); a squash of 2+ also widens it
//   drop    rows the body sits lower on bent knees (-2..2; < 0 = stretched legs)
//   lean    -1/0/1: rows shear so the top tilts that way (left/right)
//   bloat   0/1: bulging, rounder body (disk full)
//   blush   0 none, 1 pink cheeks, 2 urgent cheeks
//   stack   0 none, 1/2 data blocks held overhead; +10 wobbles the pile right
//   band    0 normal label band, 1 urgent band (full)

var W = 44
var H = 38
var FLOOR = 35          // floor shadow row

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

// ---------- the floppy ----------
var cache = {}
var cacheSize = 0

function disk(key) {
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
  var arms = k[4] || "rest", legs = k[5] || "stand", sh = +k[6] || 0
  var sq = +k[7] || 0, drop = +k[8] || 0, lean = +k[9] || 0, bloat = +k[10] || 0
  var blush = +k[11] || 0, stack = +k[12] || 0, band = +k[13] || 0
  var g = grid()

  var wide = (sq >= 2 ? 1 : 0) + bloat * 2
  var x0 = 9 - wide, x1 = 34 + wide
  var y0 = 9 + sq + drop - bloat, y1 = 30 + drop
  var cut = 4 + (bloat ? 1 : 0)

  // Legs, behind the body.
  var lt = legs === "dangle" ? 2 : 0
  var legL = [13, 17], legR = [26, 30]
  var dl = 0, dr = 0, upL = 0
  if (legs === "shake1") { dl = -1; dr = 1 }
  if (legs === "shake2") { dl = 1; dr = -1 }
  if (legs === "tap") upL = 1
  var feetBottom = 33 + lt
  layer(g, function(x, y) {
    var top = y1 - 1
    if (x >= legL[0] + dl && x <= legL[1] + dl && y >= top && y <= feetBottom - upL) return true
    if (x >= legR[0] + dr && x <= legR[1] + dr && y >= top && y <= feetBottom) return true
    return false
  }, function(x, y) { return y >= feetBottom - 1 - (x < 22 ? upL : 0) ? "n" : "d" })

  // Arms behind the body (resting nubs hang at the sides).
  var A = armSegs(arms, y0, y1, x0, x1)
  for (var i = 0; i < A.back.length; i++) drawArm(g, A.back[i])

  // Body.
  var nPow = bloat ? 2.6 : 5
  var body = layer(g, function(x, y) {
    if (!inBox(x, y, x0, y0, x1, y1, nPow)) return false
    if (x - (x1 - cut) > y - y0) return false            // the cut corner
    return true
  }, function(x, y, inside) {
    if (!isIn(inside, x, y - 1)) return "h"
    if (!isIn(inside, x + 1, y - 1) && !isIn(inside, x + 1, y)) return "h"
    if (!isIn(inside, x, y + 1) || !isIn(inside, x, y + 2)) return "n"
    if (!isIn(inside, x + 1, y)) return "n"
    if (!isIn(inside, x - 1, y)) return "h"
    return "b"
  })

  // Shutter track (recess) and the metal shutter with its window.
  var sTop = y0, sBot = y0 + 6 - (sq >= 2 ? 1 : 0)    // sBot = first row below the shutter
  for (var yy = sTop; yy <= sBot; yy++)
    for (var xx = 12; xx <= 29; xx++) if (isIn(body, xx, yy)) put(g, xx, yy, yy === sBot ? "n" : "d")
  var s0 = 14 + sh, s1 = 26 + sh
  for (var yy2 = sTop; yy2 < sBot; yy2++)
    for (var xx2 = s0; xx2 <= s1; xx2++) {
      if (!isIn(body, xx2, yy2)) continue
      put(g, xx2, yy2, yy2 === sTop || xx2 === s0 ? "l" : yy2 === sBot - 1 || xx2 === s1 ? "n" : "w")
    }
  // window slot
  var wx = 21 + sh
  for (var wy = sTop + 1; wy <= sBot - 2; wy++) { put(g, wx, wy, "e"); put(g, wx + 1, wy, "e"); put(g, wx + 2, wy, "d") }

  // Write-protect hole, bottom left.
  put(g, x0 + 2, y1 - 3, "e"); put(g, x0 + 2, y1 - 4, "e")

  // Label (the face): paper in a thin dark frame, a pink band on top.
  var lx0 = 13 - bloat, lx1 = 30 + bloat
  var ly0 = sBot + 2, ly1 = y1 - 1
  for (var ly2 = ly0 - 1; ly2 <= ly1; ly2++)
    for (var lx2 = lx0 - 1; lx2 <= lx1 + 1; lx2++) {
      var edgeY = ly2 === ly0 - 1 || ly2 === ly1, edgeX = lx2 === lx0 - 1 || lx2 === lx1 + 1
      if (edgeY && edgeX) continue
      var c = "l"
      if (edgeY || edgeX) c = "d"
      else if (ly2 === ly0) c = band ? "r" : "p"
      else if (ly2 === ly1 - 1 || lx2 === lx1) c = "w"
      put(g, lx2, ly2, c)
    }
  put(g, lx1 - 3, ly0, band ? "k" : "w"); put(g, lx1 - 2, ly0, band ? "k" : "w")

  // Face.
  var ey = ly0 + 2 + ly
  var exL = 15 + lx, exR = 25 + lx
  var eye = EYES[eyes] || EYES.open
  if (eyes === "wide") ey -= 1
  var asym = eyes === "squint" || eyes === "strain" || eyes === "dizzy" || eyes === "angry"
  stamp(g, eye, exL, ey, false)
  stamp(g, eye, exR, ey, asym)
  var brow = BROWS[eyes]
  if (brow) {
    stamp(g, brow, exL, ey - 2, false)
    stamp(g, brow, exR, ey - 2, true)
  }
  if (blush) {
    var bc = blush === 2 ? "r" : "p"
    var by = ly0 + 6
    put(g, 14, by, bc); put(g, 15, by, bc); put(g, 28, by, bc); put(g, 29, by, bc)
  }
  var m = MOUTHS[mouth] || []
  if (m.length) stamp(g, m, 22 - m[0].length / 2, ly0 + 7, false)

  // Arms in front (holding, hugging, flailing).
  for (var j = 0; j < A.front.length; j++) drawArm(g, A.front[j])

  // Data blocks held overhead.
  if (stack % 10 > 0) drawStack(g, stack % 10, stack >= 10 ? 1 : 0, y0)

  // Floor shadow under the feet (stays put when dangling: further away = smaller).
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
  var sy = y0 + 13
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

// One or two tiers of data blocks, balanced on the raised hands.
function drawStack(g, level, wob, y0) {
  var base = y0 - 2          // bottom outline row of the lowest tier (on the hands)
  var blocks = level === 1
    ? [[15, base - 4, 28, base, 0], [17, base - 8, 26, base - 4, 1]]
    : [[10, base - 4, 22, base, 0], [21, base - 4, 33, base, 0], [14, base - 8, 29, base - 4, 1]]
  for (var i = 0; i < blocks.length; i++) {
    var b = blocks[i]
    var off = wob ? (b[4] ? 2 : 1) : 0
    var bx0 = b[0] + off, by0 = b[1], bx1 = b[2] + off, by1 = b[3]
    layer(g, function(x, y) {
      return x > bx0 && x < bx1 && y > by0 && y < by1
    }, function(x, y) {
      if (y === by0 + 1) return "h"
      if (y === by1 - 1 || x === bx1 - 1) return "n"
      return "d"
    })
    // 1 0 1 1 marks on the block face
    var my = by0 + 2
    for (var c = bx0 + 2; c < bx1 - 2; c += 2) put(g, c, my, (c + i) % 4 === 0 ? "w" : "l")
  }
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
var one = [
  ".oo.",
  "ooo.",
  ".oo.",
  ".oo.",
  "oooo"
]
var zero = [
  ".oo.",
  "o..o",
  "o..o",
  "o..o",
  ".oo."
]
// Whirr arcs beside the shutter while being petted / spinning up.
var whirr = [
  [
    "..o.",
    ".o..",
    ".o..",
    "..o."
  ],
  [
    "...o",
    "..o.",
    ".o..",
    ".o..",
    "..o.",
    "...o"
  ]
]
