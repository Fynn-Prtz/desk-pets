.pragma library

// Hamster for the memory card: a round fluffball with a big head, big glinting
// eyes set wide and low, cream muzzle and belly, small pink-lined ears, a
// cowlick and strong blush. It hoards RAM in round balloon cheek pouches.
// 44 x 38 cells, drawn at px 2 (see docs/PETS.md).
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

// Tiny pink paws. Resting: two stubs held together on the chest (left side,
// the right one is the mirror). Raised: paws up at the chin holding an item.
var PAW_REST = [
  "bb...",
  "nbbpp",
  ".nnpp"
]
var PAW_UP = [
  "..pp",
  ".bpp",
  "bbn.",
  "bn.."
]
// A paw on the face or a pouch: furry arm end with a pink pad.
var PAW = [
  ".bb.",
  "bppb",
  "bppn",
  ".nn."
]
// Cowlick on top of the head; the bottom row sits on the head's first row.
var TUFT = [
  "...o.o",
  "..o.o.",
  ".ohoh.",
  "..hh.."
]
// A paw on the face or a pouch.
var PAW = [
  ".nn.",
  "nppn",
  "nppn",
  ".nn."
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
// soft: outline cells that land on fur already drawn become a shade crease
// ("n") instead of the light outline, so a pouch does not draw a hard ring
// across the face.
function layer(g, mask, fill, floorY, soft) {
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
      if (edge) g[y2][x2] = soft && g[y2][x2] !== "." && g[y2][x2] !== "o" && g[y2][x2] !== "t" ? "n" : "o"
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
// Left eye patterns, 5 wide, bottom-aligned on row EYE_Y; the right eye is
// the mirror. Big glossy eyes set wide and low: "x" is the glint.
var EYE_Y = 18
var EYE_X = 12
var EYES = {
  open:    [".eee.", "exxee", "exxee", "eeeee", "eeexe", ".eee."],
  blink:   [".....", ".....", ".....", "eeeee", "....."],
  sleep:   [".....", ".....", ".....", "e...e", ".eee."],
  happy:   [".....", ".eee.", "e...e", ".....", "....."],
  squint:  ["e....", ".ee..", "...ee", ".ee..", "e...."],
  strain:  ["ee...", "..ee.", "....e", "..ee.", "ee..."],
  dizzy:   ["e...e", ".e.e.", "..e..", ".e.e.", "e...e"],
  worried: ["...ee", ".ee..", ".eee.", "exxee", "exxee", "eeeee", ".eee."],
  wide:    [".lll.", "leeel", "lexel", "leeel", ".lll."],
  angry:   ["ee...", "..ee.", "eeeee", "exxee", "eeexe", ".eee."]
}

function drawEyes(g, kind, lx, ly, up) {
  var pat = EYES[kind] || EYES.open
  var moves = kind === "open" || kind === "wide" || kind === "worried" || kind === "angry"
  var dx = moves ? lx : 0, dy = moves ? ly : 0
  var ey = fwdY(EYE_Y) - pat.length + 1 + dy - up
  var w = pat[0].length
  var x0 = fwdX(EYE_X)
  stamp(g, pat, x0 + dx, ey, false)
  stamp(g, pat, 43 - x0 - (w - 1) + dx, ey, true)
}

// ---------- mouths ----------
// 6 wide (x 19..24), drawn from the row under the nose.
var MOUTHS = {
  omega:  ["e.ee.e", ".e..e."],
  smile:  [".e..e.", "..ee.."],
  open:   [".eeee.", ".eppe.", "..ee.."],
  teeth:  ["eeeeee", "elelle", "eeeeee"],
  wobbly: [".e.e.e", "e.e.e."],
  pout:   ["..ee..", ".e..e."],
  chew:   ["..ee..", "..ll.."],
  chew2:  ["e.ee.e", ".e..e."],
  none:   ["..ee.."]
}

// Stamp a left-side pattern and its mirror (axis between cells 21 and 22),
// positions given in rest space.
function pair(g, rows, x, y) {
  var w = rows[0].length
  var fx = fwdX(x)
  stamp(g, rows, fx, y, false)
  stamp(g, rows, 43 - fx - (w - 1), y, true)
}

// ---------- frame ----------

function build(o) {
  var g = grid()
  var pose = o.pose
  SX = 1; SY = 1
  if (pose === "squish") { SX = 1.14; SY = 0.76 }
  else if (pose === "plop") { SX = 1.18; SY = 0.7 }
  else if (pose === "wiggle") { SX = 1.05; SY = 0.95 }
  else if (pose === "dangle") { SX = 0.94; SY = 1.03 }
  else if (o.pile >= 3) { SX = 1.03; SY = 0.86 }   // squashed under the hoard
  else if (o.pile === 2) { SX = 1.02; SY = 0.9 }
  else if (o.pile === 1) { SX = 1.01; SY = 0.95 }

  var ball = pose === "ball"
  var dangle = pose === "dangle"
  var c = ball ? 0 : o.cheek
  var breath = o.breath ? 1 : 0

  // A dominant round head over a small round body, no seam. Asleep it is one
  // fluffy ball whose top rises a little per breath.
  var hcy = ball ? 24.9 - breath * 0.5 : 15.4
  var hrx = ball ? 13.8 : 14.6, hry = ball ? 10.4 + breath * 0.5 : 11.2
  var bcy = ball ? hcy : 28.8
  var brx = ball ? hrx : 11.0, bry = ball ? hry : 6.4
  var headTop = hcy - hry

  // Pouch geometry (also used by the paws holding them).
  var pof = 9.6 + c * 0.75, pr = 4.0 + c * 0.75
  var pcx = pof, pcy = 22.6 + c * 0.15, prx = pr, pry = pr * 0.92

  // Feet: pink soles peeking out under the body; dangling feet hang lower.
  if (!ball) {
    var fy = dangle ? 34.2 : 34.2, frx = dangle ? 1.8 : 2.4, fry = dangle ? 1.8 : 1.3
    var fx1 = dangle ? 17.6 : 16.4
    layer(g, function(x, y) {
      return inE(x, y, fx1, fy, frx, fry) || inE(x, y, 44 - fx1, fy, frx, fry)
    }, function(x, y) { return y >= fwdY(34) ? "p" : "w" }, FLOOR)
  }

  // Small round ears, half behind the head, pink insides.
  var eary = ball ? hcy - hry + 1.6 : headTop + 1.8
  var earx = ball ? 9.0 : 10.0
  var earR = ball ? 2.8 : 3.5
  layer(g, function(x, y) {
    return inE(x, y, CX - earx, eary, earR, earR) || inE(x, y, CX + earx, eary, earR, earR)
  }, function(x, y) {
    var ir = earR - 1.3
    if (inE(x, y, CX - earx + 0.4, eary + 0.4, ir, ir) || inE(x, y, CX + earx - 0.4, eary + 0.4, ir, ir)) return "p"
    return "b"
  }, FLOOR)

  // Fur tufts: little bumps where the cheeks are widest. At pouch size 1 the
  // cheeks themselves bulge out (no own outline yet).
  function fluff(x, y) {
    if (ball) return inE(x, y, CX - 15.6, hcy + 2.4, 1.4, 1.1) || inE(x, y, CX + 15.6, hcy + 2.4, 1.4, 1.1)
    var bump = inE(x, y, CX - 14.8, 20.6, 1.5, 1.4) || inE(x, y, CX + 14.8, 20.6, 1.5, 1.4)
    if (c === 1) bump = bump || inE(x, y, CX - pcx, pcy, prx + 0.6, pry + 0.4) || inE(x, y, CX + pcx, pcy, prx + 0.6, pry + 0.4)
    return bump
  }

  // Cream face (muzzle and lower cheeks) and belly.
  var mcy = ball ? hcy + 3.2 : 20.6
  function cream(x, y) {
    if (ball) return inE(x, y, CX, mcy, 6.2, 3.6) || inE(x, y, CX, hcy + 9.0, 12.5, 5.2)
    return inE(x, y, CX, mcy, 6.0, 3.9)
      || inE(x, y, CX - 8.4, 23.2, 6.0, 3.2) || inE(x, y, CX + 8.4, 23.2, 6.0, 3.2)
      || inE(x, y, CX, 28.4, 8.4, 7.0)
  }

  // Head + body: accent back, top-lit rim, cream underside, shaded flanks.
  layer(g, function(x, y) {
    return inE(x, y, CX, hcy, hrx, hry) || inE(x, y, CX, bcy, brx, bry) || fluff(x, y)
  }, function(x, y, inside) {
    var top = !isIn(inside, x, y - 1)
    var bottom = !isIn(inside, x, y + 1)
    var low = bottom || !isIn(inside, x, y + 2)
    var side = !isIn(inside, x - 1, y) || !isIn(inside, x + 1, y)
    if (top) return x < CX + 7 ? "h" : "b"
    if (cream(x, y)) {
      if (low) return "n"
      if (inE(x, y, CX, mcy - 0.6, 4.6, 2.6)) return "l"
      return "w"
    }
    if (low) return "n"
    if (side && sy(y) > hcy + 1) return "n"
    if (!isIn(inside, x, y - 2) && x < CX + 4) return "h"
    return "b"
  }, FLOOR)

  // Cheek pouches: round cream balloons with their own outline, a tight
  // shine and the blush riding on them.
  if (c >= 2) {
    layer(g, function(x, y) {
      return inE(x, y, CX - pcx, pcy, prx, pry) || inE(x, y, CX + pcx, pcy, prx, pry)
    }, function(x, y, inside) {
      var pc = x < CX ? CX - pcx : CX + pcx
      var out = x < CX ? -1 : 1
      if (!isIn(inside, x, y + 1)) return "n"
      if (inE(x, y, pc + out * prx * 0.36, pcy - pry * 0.5, Math.max(1.0, prx * 0.24), Math.max(0.8, pry * 0.16))) return "l"
      if (!isIn(inside, x, y - 1)) return "h"
      // Blush across the middle of the pouch, hatched red when flushed.
      if (inE(x, y, pc + out * 0.3, pcy + pry * 0.1, Math.max(1.6, prx * 0.4), Math.max(1.0, pry * 0.22)))
        return o.flush ? ((x * out + y) % 3 === 0 ? "r" : "p") : "p"
      if (!isIn(inside, x, y + 2)) return "n"
      return "w"
    }, FLOOR, true)
  }

  // A little cowlick of hair on top.
  if (!(o.pile > 0)) {
    var tt = fwdY(headTop) + (ball ? 1 : 0)
    stamp(g, TUFT, fwdX(19), tt - TUFT.length + 1, false)
  }

  // Face.
  var lx = o.look ? o.look[0] : 0, ly = o.look ? o.look[1] : 0
  if (ball) {
    var fyb = fwdY(hcy + 1.6)
    pair(g, EYES.sleep.slice(3), 12, fyb)
    pair(g, ["ppp", ".p."], 9, fyb + 2)
    put(g, 21, fyb + 2, "p"); put(g, 22, fyb + 2, "p")
    stamp(g, MOUTHS.omega, 19, fyb + 3, false)
    pair(g, ["pp", "nn"], 16, fwdY(32))
  } else {
    var up = c >= 4 ? 1 : 0
    drawEyes(g, o.eyes, lx, ly, up)
    // Blush under the eyes (urgent red when flushed); on the pouches once
    // they have their own outline.
    if (c < 2) {
      var by = fwdY(19)
      var blush = o.flush ? "r" : "p"
      for (var bx = 0; bx < 3; bx++) {
        putIf(g, fwdX(10 + bx), by, blush, "bwhnlk")
        putIf(g, 43 - fwdX(10 + bx), by, blush, "bwhnlk")
        if (bx > 0) { putIf(g, fwdX(9 + bx), by + 1, blush, "bwhnlk"); putIf(g, 43 - fwdX(9 + bx), by + 1, blush, "bwhnlk") }
      }
    }
    // Nose (sniff: one cell up) and the little mouth.
    var ny = fwdY(19) + (o.nose ? -1 : 0)
    put(g, 21, ny, "p"); put(g, 22, ny, "p")
    var m = MOUTHS[o.mouth] || MOUTHS.omega
    stamp(g, m, 19, fwdY(19) + 1, false)
  }

  // Paws.
  if (!ball) {
    var p1 = o.paws
    if (p1 === "down") pair(g, PAW_REST, 15, fwdY(25.2 + (c >= 3 ? 0.6 : 0)))
    else if (p1 === "hold") pair(g, PAW_UP, 15, fwdY(21))
    else if (p1 === "wash" || p1 === "wash2") {
      var sw2 = p1 === "wash" ? 0 : 2
      stamp(g, PAW, fwdX(14), fwdY(18) + sw2, false)
      stamp(g, PAW, 43 - fwdX(14) - 3, fwdY(20) - sw2, true)
    }
    else if (p1 === "cheeks") {
      var pw = Math.max(c, 1)
      var ox = c >= 2 ? CX - pcx - prx + 0.6 : 7.2
      pair(g, PAW, ox, fwdY(pcy - 1))
    }
    // Held items: at the mouth with raised paws, else in the paws on the tummy.
    var iy = p1 === "hold" ? fwdY(21) : fwdY(25)
    if (o.item === "seed") stamp(g, o.acc ? seasonTreat(o.acc) : seed, 21, iy, false)
    else if (o.item === "chip") stamp(g, chip, 18, iy + (p1 === "hold" ? 1 : 0), false)
  }

  if (o.acc) seasonHamster(g, o, headTop, hcy, hry, ball)   // season: hat under the hoard, floor confetti
  // Hoard balanced on the head.
  if (o.pile > 0 && !ball) {
    var top = fwdY(headTop)
    var spots = [[18, top - 3], [20, top - 5], [17, top - 7]]
    for (var p = 0; p < o.pile && p < spots.length; p++) stamp(g, chip, spots[p][0], spots[p][1], p === 1)
  }

  // Floor shadow.
  if (!dangle) {
    var sw = Math.round((ball ? 15 : 12) * SX)
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

  if (o.conf >= 0) seasonConfetti(g, o.conf)   // season: confetti burst over everything
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
    o.flush ? 1 : 0, o.lean || 0, o.nose ? 1 : 0, o.breath ? 1 : 0, o.acc || "", o.conf >= 0 ? o.conf : ""].join("|")
}

function frame(k, season0) {
  if (season0) SEASON = season0
  var hit = cache[k]
  if (hit) return hit
  // A session only ever sees a bounded set of poses; reset if it ever grows.
  if (cacheSize > 400) { cache = {}; cacheSize = 0 }
  var f = String(k).split("|")
  var rows = build({
    pose: f[0] || "sit", eyes: f[1] || "open", look: [parseInt(f[2], 10) || 0, parseInt(f[3], 10) || 0],
    mouth: f[4] || "omega", cheek: Math.max(0, Math.min(5, parseInt(f[5], 10) || 0)),
    paws: f[6] || "down", item: f[7] || "", pile: Math.max(0, Math.min(3, parseInt(f[8], 10) || 0)),
    flush: f[9] === "1", lean: parseInt(f[10], 10) || 0, nose: f[11] === "1" ? 1 : 0, breath: f[12] === "1" ? 1 : 0,
    acc: SEASON ? f[13] || "" : "", conf: f[14] ? parseFloat(f[14]) : -1
  })
  cache[k] = rows
  cacheSize++
  return rows
}

function hamster(o, season0) { return frame(key(o), season0) }

// ---------- season (shared/PetSeason.js) ----------
//
// The hoarder dresses up and hoards the season's treats: a floppy Santa hat
// at Christmas, a hollowed pumpkin cap in October, a party hat on party days,
// always between the ears and under the RAM tower; the nibble seed becomes a
// candy cane / candy corn / cupcake. Confetti lies on the floor on party days
// and rains down while it is petted. Key fields acc + conf (memoised).

var SEASON = null    // PetSeason, handed in by the QML (frame(key, PetSeason))

var TREATS = {
  xmas:   ["WRW", "R.W", "W..", "R..", "W.."],             // candy cane
  spooky: [".W.", "YYY", "OOO", "OOO"],                    // candy corn
  party:  [".R.", "WWW", "FIF", "FIF"]                     // cupcake with a cherry
}
function seasonTreat(acc) { return TREATS[acc] || seed }

function seasonHamster(g, o, headTop, hcy, hry, ball) {
  var top = ball ? fwdY(hcy - hry) + 1 : fwdY(headTop)
  function p(x, y, c) { put(g, x, y, c) }
  if (o.acc === "xmas") SEASON.stampHat(p, SEASON.hat("santa", 13, 5, 1), CX - 1, top + 3)
  else if (o.acc === "party") SEASON.stampHat(p, SEASON.hat("party", 8, 6, -1), CX + 2, top + 2)
  else if (o.acc === "spooky") {
    // a little hollowed pumpkin worn as a cap: ribbed dome, stem and leaf
    var cy = top + 1.5
    layer(g, function(x, y) {
      return (inE(x, y, CX, cy, 7.4, 4.2) && sy(y) < cy + 1.6) || (x === CX && fwdY(cy - 4.2) - 1 === y)
    }, function(x, y, inside) {
      if (sy(y) < cy - 4.0) return "J"
      if (!isIn(inside, x, y + 1)) return "U"
      if (!isIn(inside, x, y - 1)) return "Y"
      var rib = Math.abs(x + 0.5 - CX)
      return (Math.round(rib) === 3 || Math.round(rib) === 6) ? "U" : "O"
    }, FLOOR)
    put(g, CX + 1, fwdY(cy - 4.2) - 1, "G"); put(g, CX + 2, fwdY(cy - 4.2), "G")
  }
  if (o.acc === "party") {
    var bits = SEASON.confetti(5, 10, 2, 36, 41, 37, -1)
    for (var i = 0; i < bits.length; i++) putIf(g, bits[i][0], bits[i][1], bits[i][2], ".t")
  }
}

function seasonConfetti(g, conf) {
  var bits = SEASON.confetti(11, 16, 1, 0, 42, 33, conf)
  for (var i = 0; i < bits.length; i++) put(g, bits[i][0], bits[i][1], bits[i][2])
}
