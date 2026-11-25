.pragma library

// Hamster for the memory card: a chubby fluffball that hoards RAM in its
// cheek pouches. 44 x 38 cells, drawn at px 2 (see docs/PETS.md).
//
// Built from shape functions (ellipses, each layer ringed with its own
// outline, top-lit shading) like the screensaver cat, then kept as string
// rows. Frames are memoised by their key: each distinct pose is built once
// and reused, so the QML side only swaps which rows array is shown.
//
//   hamster({ pose, eyes, look, mouth, cheek, paws, item, pile, flush, lean, nose })
//     pose  "sit" | "ball" (sleeping, breath 0/1 via `breath`) | "squish" |
//           "plop" | "dangle" | "wiggle"
//     eyes  open blink sleep happy squint strain dizzy worried wide angry
//     look  [lx, ly] in -1..1 (eyes move one cell)
//     mouth omega smile open teeth wobbly pout chew none
//     cheek 0..5 pouch size (0 = flat fluffy cheeks, 5 = about to burst)
//     paws  down | hold | wash | wash2 | cheeks
//     item  "" | "seed" | "chip" (held between the paws)
//     pile  0..3 RAM chips balanced on the head
//     flush true = red in the face (critical)
//     lean  -1 | 0 | 1 shear (dangling against the drag)
//     nose  0 | 1 (sniff twitch: nose one cell up)
//
// Palette keys: PetColors (o b h n d w l p e x r k t).

var W = 44
var H = 38
var FLOOR = 35
var CX = 22

// ---------- small sprites (drawn with PixelSprite at px 2) ----------

// A tiny RAM stick: PCB, two black memory chips, gold-ish contact pins.
var chip = [
  "ooooooo",
  "oeedeeo",
  "odododo"
]

// Sunflower seed (dark husk, light stripe), 2 cells wide.
var seed = [
  "ee",
  "le",
  "le",
  "ee"
]

// Arms over the light belly, contoured in shade ("n") because the outline
// colour would vanish on light fur. Left side; the right arm is the mirror.
var ARM_DOWN = [      // resting on the tummy, hands together (x 14.., y 22..)
  "bnn....",
  "bbbnnp.",
  "nbbbbpp",
  ".nnnnn."
]
var ARM_HOLD = [      // raised to the mouth (x 15.., y 19..)
  ".....pp",
  "....bpp",
  "..nbbn.",
  ".nbbn..",
  "nbbn...",
  "bnn...."
]
// A paw on the face or a pouch.
var PAW = [
  ".oo.",
  "ohpo",
  "oppo",
  ".oo."
]

// ---------- grid helpers ----------

function grid() {
  var g = []
  for (var y = 0; y < H; y++) {
    var r = []
    for (var x = 0; x < W; x++) r.push(".")
    g.push(r)
  }
  return g
}

// Squash / stretch around the feet: shapes are defined in rest space and
// sampled through the inverse transform, details are placed with fwd().
var SX = 1, SY = 1
function sx(x) { return CX + (x + 0.5 - CX) / SX }
function sy(y) { return FLOOR - (FLOOR - (y + 0.5)) / SY }
function fwdX(x) { return Math.round(CX + (x + 0.5 - CX) * SX - 0.5) }
function fwdY(y) { return Math.round(FLOOR - (FLOOR - (y + 0.5)) * SY - 0.5) }

function ell(px, py, cx, cy, rx, ry) {
  var dx = (px - cx) / rx
  var dy = (py - cy) / ry
  return dx * dx + dy * dy
}
function inE(x, y, cx, cy, rx, ry) { return ell(sx(x), sy(y), cx, cy, rx, ry) <= 1 }

// Fill a mask and ring it with outline cells (8-neighbourhood) that are not
// part of it. Rows at or below `floorY` are clipped (the pet stands on it).
function layer(g, mask, fill, floorY) {
  var inside = []
  for (var y = 0; y < H; y++) {
    var r = []
    for (var x = 0; x < W; x++) r.push(y < floorY && mask(x, y))
    inside.push(r)
  }
  for (var y2 = 0; y2 < H; y2++) {
    for (var x2 = 0; x2 < W; x2++) {
      if (inside[y2][x2]) { g[y2][x2] = fill(x2, y2, inside); continue }
      if (y2 > floorY) continue
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

function put(g, x, y, c) { if (y >= 0 && y < H && x >= 0 && x < W) g[y][x] = c }
function putIf(g, x, y, c, only) { if (y >= 0 && y < H && x >= 0 && x < W && only.indexOf(g[y][x]) >= 0) g[y][x] = c }
function isIn(inside, x, y) { return y >= 0 && y < H && x >= 0 && x < W && inside[y][x] }

// Stamp rows (with "." transparent) at x, y; mirror flips them.
function stamp(g, rows, x, y, mirror) {
  for (var r = 0; r < rows.length; r++) {
    var s = rows[r]
    for (var c = 0; c < s.length; c++) {
      var ch = mirror ? s.charAt(s.length - 1 - c) : s.charAt(c)
      if (ch !== ".") put(g, x + c, y + r, ch)
    }
  }
}

// Top-lit shading: highlight under the upper contour (left / centre side),
// shade above the lower contour.
function shade(base, hiX) {
  return function(x, y, inside) {
    if (!isIn(inside, x, y - 1) && x < hiX) return "h"
    if (!isIn(inside, x, y + 2) || !isIn(inside, x, y + 1)) return "n"
    if (!isIn(inside, x - 1, y) && !isIn(inside, x, y + 3)) return "n"
    return base
  }
}

// ---------- eyes ----------
// Left eye patterns, 4 wide, bottom-aligned on row 15 (eye body 12..15, brows
// above); the right eye is the mirror. "x" is the glint.
var EYES = {
  open:    ["....", ".ee.", "exee", "eeee", ".ee."],
  blink:   ["....", "....", "....", "eeee", "...."],
  sleep:   ["....", "....", "....", "e..e", ".ee."],
  happy:   ["....", "....", ".ee.", "e..e", "...."],
  squint:  ["....", "ee..", "..ee", "ee..", "...."],
  strain:  ["e...", ".ee.", "ee..", "..ee", "ee.."],
  dizzy:   ["....", "e..e", ".ee.", ".ee.", "e..e"],
  worried: ["..ee", "ee..", "....", ".ee.", "exee", ".ee."],
  wide:    ["....", ".ll.", "leel", "leel", ".ll."],
  angry:   ["ee..", "..ee", "....", "eeee", "exee", ".ee."]
}

function drawEyes(g, kind, lx, ly) {
  var pat = EYES[kind] || EYES.open
  var moves = kind === "open" || kind === "wide" || kind === "worried"
  var dx = moves ? lx : 0, dy = moves ? ly : 0
  var ey = fwdY(15) - pat.length + 1 + dy
  stamp(g, pat, fwdX(14) + dx, ey, false)
  stamp(g, pat, fwdX(29) - 3 + dx, ey, true)
}

// ---------- mouths ----------
// 6 wide (x 19..24), drawn from the row under the nose.
var MOUTHS = {
  omega:  ["e.ee.e", ".e..e."],
  smile:  [".e..e.", "..ee.."],
  open:   [".elle.", ".eppe.", "..ee.."],
  teeth:  ["eeeeee", "elelle", "eeeeee"],
  wobbly: ["......", ".e.e.e", "e.e.e."],
  pout:   ["..ee..", ".e..e."],
  chew:   ["..ee..", "..ll.."],
  chew2:  ["e.ee.e", ".e..e."],
  none:   ["..ee.."]
}

// ---------- frame ----------

function build(o) {
  var g = grid()
  var pose = o.pose
  SX = 1; SY = 1
  if (pose === "squish") { SX = 1.16; SY = 0.74 }
  else if (pose === "plop") { SX = 1.22; SY = 0.68 }
  else if (pose === "wiggle") { SX = 1.06; SY = 0.95 }
  else if (pose === "dangle") { SX = 0.93; SY = 1.04 }
  else if (o.pile >= 3) { SX = 1.05; SY = 0.86 }   // squashed under the hoard
  else if (o.pile === 2) { SX = 1.04; SY = 0.9 }
  else if (o.pile === 1) { SX = 1.02; SY = 0.95 }

  var ball = pose === "ball"
  var dangle = pose === "dangle"
  var c = ball ? 0 : o.cheek
  var breath = o.breath ? 1 : 0

  // One fluffball: head and body overlap without a seam.
  // Asleep it is a single round ball whose top rises one cell per breath.
  var hcy = ball ? 25.7 - breath * 0.5 : 15.8
  var hrx = ball ? 14.2 : 11.6, hry = ball ? 9.6 + breath * 0.5 : 9.4
  var bcy = ball ? hcy : 26.8
  var brx = ball ? hrx : 13.0, bry = ball ? hry : 8.6

  // Feet (pink soles), dangling feet hang lower and closer.
  if (!ball) {
    var fy = dangle ? 34.0 : 33.8, frx = dangle ? 2.0 : 2.8, fry = dangle ? 2.0 : 1.5
    var fx1 = dangle ? 17.2 : 16.0, fx2 = dangle ? 26.8 : 28.0
    layer(g, function(x, y) {
      return inE(x, y, fx1, fy, frx, fry) || inE(x, y, fx2, fy, frx, fry)
    }, function(x, y) { return y >= fwdY(34) ? "p" : "w" }, FLOOR)
  }

  // Ears (before the body, whose outline closes their base).
  var eary = ball ? hcy - hry + 1.4 : hcy - 7.6
  var earx = ball ? 7.6 : 8.0
  var earR = ball ? 2.4 : 3.0
  layer(g, function(x, y) {
    return inE(x, y, CX - earx, eary, earR, earR) || inE(x, y, CX + earx, eary, earR, earR)
  }, function(x, y) {
    if (inE(x, y, CX - earx + 0.3, eary + 0.5, earR - 1.2, earR - 1.2)
        || inE(x, y, CX + earx - 0.3, eary + 0.5, earR - 1.2, earR - 1.2)) return "p"
    return "b"
  }, FLOOR)

  // Body: accent back, light underside from the muzzle down (golden-hamster
  // bib), top-lit rim, shade along the bottom and the flanks.
  var bibCy = ball ? 33.4 : 25.4, bibRx = ball ? 10.0 : 8.6, bibRy = ball ? 5.6 : 9.6
  layer(g, function(x, y) {
    return inE(x, y, CX, hcy, hrx, hry) || inE(x, y, CX, bcy, brx, bry)
  }, function(x, y, inside) {
    var top = !isIn(inside, x, y - 1)
    var bottom = !isIn(inside, x, y + 1) || !isIn(inside, x, y + 2)
    var side = !isIn(inside, x - 1, y) || !isIn(inside, x + 1, y)
    var bib = inE(x, y, CX, bibCy, bibRx, bibRy)
      || (!ball && (inE(x, y, CX - 6.4, hcy + 4.2, 3.6, 2.8) || inE(x, y, CX + 6.4, hcy + 4.2, 3.6, 2.8)))
    if (top) return x < CX + 6 ? "h" : "b"
    if (bib) return bottom ? "n" : (!ball && y < fwdY(hcy + 3.4) && x < CX + 3) ? "l" : "w"
    if (bottom) return "n"
    if (side && y > fwdY(hcy)) return "n"
    if (!isIn(inside, x, y - 2) && x < CX + 3) return "h"
    return "b"
  }, FLOOR)

  // Cheek pouches: round balloons with their own outline, so a stuffed
  // hamster really bulges. Small ones stay soft (no outline across the face).
  var pcx = 7.8 + c * 0.8, pcy = 19.4 + c * 0.2
  var prx = 3.0 + c * 0.8, pry = 2.8 + c * 0.85
  if (c >= 2) {
    layer(g, function(x, y) {
      return inE(x, y, CX - pcx, pcy, prx, pry) || inE(x, y, CX + pcx, pcy, prx, pry)
    }, function(x, y, inside) {
      var pc = x < CX ? CX - pcx : CX + pcx
      var out = x < CX ? -1 : 1
      if (!isIn(inside, x, y + 1)) return "n"
      // Tight shine on the upper outer side: stretched-skin look.
      if (inE(x, y, pc + out * prx * 0.35, pcy - pry * 0.5, Math.max(0.9, prx * 0.22), Math.max(0.7, pry * 0.14))) return "l"
      if (!isIn(inside, x, y - 1)) return "h"
      // Flushed: hatched red blush strokes across the middle of the pouch.
      if (o.flush && inE(x, y, pc + out * 0.4, pcy + pry * 0.15, prx * 0.62, pry * 0.32))
        return (x * out + y) % 3 === 0 ? "r" : "p"
      if (sy(y) < pcy - pry * 0.1) return "b"
      if (!isIn(inside, x, y + 2)) return "n"
      return "w"
    }, FLOOR)
  }

  // Tiny forehead stripe.
  if (!ball) {
    var ty = fwdY(hcy - hry) + 2
    putIf(g, 21, ty, "d", "bh"); putIf(g, 22, ty, "d", "bh")
    putIf(g, 21, ty + 1, "n", "bh"); putIf(g, 22, ty + 1, "n", "bh")
  }

  // Face.
  var lx = o.look ? o.look[0] : 0, ly = o.look ? o.look[1] : 0
  if (ball) {
    // Asleep in a ball: closed eyes, a pink nose, blush, paws tucked in.
    stamp(g, EYES.sleep, 14, 21, false)
    stamp(g, EYES.sleep, 26, 21, true)
    put(g, 12, 26, "p"); put(g, 13, 26, "p"); put(g, 30, 26, "p"); put(g, 31, 26, "p")
    put(g, 21, 27, "p"); put(g, 22, 27, "p")
    stamp(g, MOUTHS.omega, 19, 28, false)
    stamp(g, ["pp....pp", "nn....nn"], 18, 31, false)
  } else {
    drawEyes(g, o.eyes, lx, ly)
    // Blush under the eyes (urgent red when flushed).
    var by = fwdY(16) + 1
    var blush = o.flush ? "r" : "p"
    var bl = [fwdX(12), fwdX(13), fwdX(30), fwdX(31)]
    for (var i = 0; i < bl.length; i++) putIf(g, bl[i], by, blush, "bwhnlk")
    // Nose (sniff: one cell up) and buck-tooth mouth.
    var ny = fwdY(18) + (o.nose ? -1 : 0)
    put(g, 21, ny, "p"); put(g, 22, ny, "p")
    var m = MOUTHS[o.mouth] || MOUTHS.omega
    stamp(g, m, 19, fwdY(18) + 1, false)
  }

  // Paws.
  if (!ball) {
    var p1 = o.paws
    var ad = fwdY(22 + Math.max(0, c - 1))
    if (p1 === "down") { stamp(g, ARM_DOWN, fwdX(14), ad, false); stamp(g, ARM_DOWN, fwdX(29) - 6, ad, true) }
    else if (p1 === "hold") { stamp(g, ARM_HOLD, fwdX(15), fwdY(19), false); stamp(g, ARM_HOLD, fwdX(28) - 6, fwdY(19), true) }
    else if (p1 === "wash" || p1 === "wash2") {
      var up = p1 === "wash" ? 0 : 2
      stamp(g, ARM_HOLD, fwdX(12), fwdY(14) + up, false)
      stamp(g, ARM_HOLD, fwdX(31) - 6, fwdY(16) - up, true)
    }
    else if (p1 === "cheeks") {
      stamp(g, PAW, fwdX(CX - pcx - prx), fwdY(pcy), false)
      stamp(g, PAW, fwdX(CX + pcx + prx) - 3, fwdY(pcy), true)
    }
    // Held items: at the mouth with raised paws, else in the hands on the tummy.
    var iy = p1 === "hold" ? fwdY(19) : fwdY(22)
    if (o.item === "seed") stamp(g, seed, 21, iy, false)
    else if (o.item === "chip") stamp(g, chip, 18, iy + (p1 === "hold" ? 1 : 0), false)
  }

  // Hoard balanced on the head.
  if (o.pile > 0 && !ball) {
    var top = fwdY(hcy - hry)
    var spots = [[18, top - 2], [20, top - 5], [17, top - 8]]
    for (var p = 0; p < o.pile && p < spots.length; p++) stamp(g, chip, spots[p][0], spots[p][1], p === 1)
  }

  // Floor shadow.
  if (!dangle) {
    var sw = Math.round((ball ? 15 : 13) * SX)
    for (var sxp = CX - sw; sxp < CX + sw; sxp++) {
      if (g[FLOOR][sxp] === ".") g[FLOOR][sxp] = "t"
      if (sxp > CX - sw + 3 && sxp < CX + sw - 4 && g[FLOOR + 1][sxp] === ".") g[FLOOR + 1][sxp] = "t"
    }
  }

  // Lean: shear the upper body against the drag (whole cells).
  if (o.lean) {
    for (var yy = 0; yy < H; yy++) {
      var shift = Math.round(o.lean * Math.max(0, 30 - yy) / 10)
      if (shift === 0) continue
      var src = g[yy].slice()
      for (var xx = 0; xx < W; xx++) {
        var from = xx - shift
        g[yy][xx] = from >= 0 && from < W ? src[from] : "."
      }
    }
  }

  var rows = []
  for (var r = 0; r < H; r++) rows.push(g[r].join(""))
  return rows
}

// ---------- memoised entry points ----------

var cache = {}
var cacheSize = 0

// The frame key: a short string, so QML can hold it in a string property and
// only touch the sprite when it actually changes.
function key(o) {
  return [o.pose || "sit", o.eyes || "open", o.look ? o.look[0] : 0, o.look ? o.look[1] : 0,
    o.mouth || "omega", o.cheek || 0, o.paws || "down", o.item || "", o.pile || 0,
    o.flush ? 1 : 0, o.lean || 0, o.nose ? 1 : 0, o.breath ? 1 : 0].join("|")
}

function frame(k) {
  var hit = cache[k]
  if (hit) return hit
  // A session only ever sees a bounded set of poses; reset if it ever grows.
  if (cacheSize > 400) { cache = {}; cacheSize = 0 }
  var f = String(k).split("|")
  var rows = build({
    pose: f[0] || "sit", eyes: f[1] || "open", look: [parseInt(f[2], 10) || 0, parseInt(f[3], 10) || 0],
    mouth: f[4] || "omega", cheek: Math.max(0, Math.min(5, parseInt(f[5], 10) || 0)),
    paws: f[6] || "down", item: f[7] || "", pile: Math.max(0, Math.min(3, parseInt(f[8], 10) || 0)),
    flush: f[9] === "1", lean: parseInt(f[10], 10) || 0, nose: f[11] === "1" ? 1 : 0, breath: f[12] === "1" ? 1 : 0
  })
  cache[k] = rows
  cacheSize++
  return rows
}

function hamster(o) { return frame(key(o)) }
