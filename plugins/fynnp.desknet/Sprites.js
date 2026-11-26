.pragma library

// Carrier pigeon pet for the Desk Net card (round 2): 44x38 cells at px 2.
// A plump chibi pigeon facing the viewer: big round head with an
// iridescent neck band, a little beak with a white cere, folded wings with
// two dark bars, pink feet gripping a wire, and a messenger bag across its
// chest whose tag carries the rx/tx lights (palette keys 1 2 = down,
// 3 4 = up, set by the card). Top-lit shading with the shared PetColors
// keys (docs/PETS.md).
//
// Memoised layers, each built once per distinct key:
//   pigeon(key)  the bird (moves with hops / flaps / shakes)
//   ground(key)  the wire it perches on (stays put; behind the bird)
//   front(key)   the envelope pile burying it while traffic is very heavy
// Effects (envelopes in flight, feathers, z's, hearts, sweat) are small
// fixed sprites below + PetFx.
//
// pigeon key: "eyes|lookX|lookY|beak|wings|feet|puff|squash|lean|blush|headX|headY|bag|hold"
//   eyes   open blink sleep happy squint strain dizzy worried wide angry
//   beak   closed open coo tuck
//   wings  fold up mid down hold preen hips
//   feet   stand tap stomp dangle tuck
//   puff   0/1 puffed-up feathers (sleep, annoyed)
//   squash 0..3   lean -1/0/1   blush 0/1/2   headX/headY head offset
//   bag    0..3 envelopes sticking out of the bag
//   hold   "" | map (upside-down map held in the wings)
// ground key: "wire|shadow"  (shadow 1 while hovering/dangling)
// front key:  pile level 0..2

var W = 44
var H = 38

// ---------- raster kit ----------
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
function IN(inside, x, y) { return y >= 0 && y < H && x >= 0 && x < W && inside[y][x] }

function layer(g, mask, fill, ring) {
  var inside = []
  for (var y = 0; y < H; y++) {
    var r = []
    for (var x = 0; x < W; x++) r.push(!!mask(x, y))
    inside.push(r)
  }
  var oc = ring || "o"
  for (var y2 = 0; y2 < H; y2++)
    for (var x2 = 0; x2 < W; x2++) {
      if (inside[y2][x2]) { g[y2][x2] = typeof fill === "function" ? fill(x2, y2, inside) : fill; continue }
      var edge = false
      for (var dy = -1; dy <= 1 && !edge; dy++)
        for (var dx = -1; dx <= 1 && !edge; dx++)
          if (IN(inside, x2 + dx, y2 + dy)) edge = true
      if (edge) g[y2][x2] = oc
    }
  return inside
}

function inEllipse(x, y, cx, cy, rx, ry) {
  var dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry
  return dx * dx + dy * dy <= 1
}
function inRRect(x, y, x0, y0, x1, y1, r) {
  var px = x + 0.5, py = y + 0.5
  if (px < x0 || px > x1 + 1 || py < y0 || py > y1 + 1) return false
  var cx = Math.max(x0 + r, Math.min(x1 + 1 - r, px)), cy = Math.max(y0 + r, Math.min(y1 + 1 - r, py))
  return (px - cx) * (px - cx) + (py - cy) * (py - cy) <= r * r
}
// Tapering capsule along a polyline: radius r0 at the first point, r1 at the last.
function inTaper(pts, x, y, r0, r1) {
  var px = x + 0.5, py = y + 0.5
  var total = 0, lens = []
  for (var i = 0; i + 1 < pts.length; i++) {
    var l = Math.sqrt(Math.pow(pts[i + 1][0] - pts[i][0], 2) + Math.pow(pts[i + 1][1] - pts[i][1], 2))
    lens.push(l); total += l
  }
  var acc = 0
  for (var j = 0; j + 1 < pts.length; j++) {
    var a = pts[j], b = pts[j + 1]
    var vx = b[0] - a[0], vy = b[1] - a[1], l2 = vx * vx + vy * vy
    var t = l2 > 0 ? Math.max(0, Math.min(1, ((px - a[0]) * vx + (py - a[1]) * vy) / l2)) : 0
    var ex = a[0] + vx * t - px, ey = a[1] + vy * t - py
    var s = total > 0 ? (acc + t * lens[j]) / total : 0
    var r = r0 + (r1 - r0) * s
    if (ex * ex + ey * ey <= r * r) return true
    acc += lens[j]
  }
  return false
}
function segDist(pts, x, y) {
  var px = x + 0.5, py = y + 0.5, best = 1e9
  for (var i = 0; i + 1 < pts.length; i++) {
    var a = pts[i], b = pts[i + 1]
    var vx = b[0] - a[0], vy = b[1] - a[1], l2 = vx * vx + vy * vy
    var t = l2 > 0 ? Math.max(0, Math.min(1, ((px - a[0]) * vx + (py - a[1]) * vy) / l2)) : 0
    var ex = a[0] + vx * t - px, ey = a[1] + vy * t - py
    best = Math.min(best, Math.sqrt(ex * ex + ey * ey))
  }
  return best
}

function stamp(g, rows, x, y, mirror, map) {
  for (var r = 0; r < rows.length; r++) {
    var row = rows[r]
    for (var c = 0; c < row.length; c++) {
      var ch = mirror ? row.charAt(row.length - 1 - c) : row.charAt(c)
      if (ch === ".") continue
      put(g, x + c, y + r, map && map[ch] ? map[ch] : ch)
    }
  }
}
function mirrorRows(rows) {
  var out = []
  for (var i = 0; i < rows.length; i++) out.push(rows[i].split("").reverse().join(""))
  return out
}
function mirrorPts(pts) {
  var out = []
  for (var i = 0; i < pts.length; i++) out.push([43 - pts[i][0], pts[i][1]])
  return out
}

// ---------- face parts ----------
var EYES = {
  open:    [".ee.", "exee", "eeee", "eeee", ".ee."],
  blink:   ["....", "....", "....", "eeee", "...."],
  sleep:   ["....", "....", "e..e", ".ee.", "...."],
  happy:   ["....", ".ee.", "e..e", "....", "...."],
  squint:  ["e...", ".ee.", "...e", ".ee.", "e..."],
  strain:  ["ee..", ".eee", "...e", ".eee", "ee.."],
  dizzy:   [".eee", "e...", "e.ee", "e..e", ".ee."],
  worried: ["....", ".ee.", "exee", "eeee", ".ee."],
  wide:    [".ee.", "exxe", "exee", "eeee", ".ee."],
  angry:   ["....", "eee.", "exee", "eeee", ".ee."]
}
var ASYM = { squint: 1, strain: 1, dizzy: 1 }
var BROWS = {
  worried: ["..ee", "ee.."],
  angry:   ["ee..", "..ee"],
  strain:  ["ee..", "..ee"]
}
// Beaks, centred under the eyes: l cere, w beak, e ink.
var BEAKS = {
  closed: ["eeeeee", "ellwwe", ".ewwe.", "..ee.."],
  open:   ["eeeeee", "ellwwe", "eeeeee", "ewppwe", ".eeee."],
  coo:    ["eeeeee", "ellwwe", ".ewwe.", "..ee..", ".e..e.", "..ee.."],
  tuck:   ["eeeeee", "ellwwe", ".eeee."]
}

// ---------- props ----------
// envelope with a red seal (pet palette)
var ENVELOPE = [
  "ooooooo",
  "onlllno",
  "olnlnlo",
  "ollrllo",
  "ooooooo"
]
// the map, held upside down: north arrow points down, route dashed in red
var MAP = [
  "eeeeeeeeeeeeee",
  "elrllwwlllelwe",
  "ellrlwwlllelwe",
  "elllrwwlllelwe",
  "ellllrwlllelwe",
  "elllwwrleeeeee",
  "ellllwwleeelwe",
  "ellllwwrlelrwe",
  "ellllwwllrrrwe",
  "eeeeeeeeeeeeee"
]

// ---------- the pigeon ----------
var cache = {}
var cacheSize = 0
function pigeon(key, season0) {
  if (season0) SEASON = season0
  var hit = cache[key]
  if (hit) return hit
  if (cacheSize > 500) { cache = {}; cacheSize = 0 }
  var rows = build(String(key).split("|"))
  cache[key] = rows
  cacheSize++
  return rows
}

// Wing feathers of the LEFT wing per pose: shoulder + feather tips.
var WINGS = {
  fold:  { s: [12.5, 20], tips: [[10.5, 31], [12, 31.5], [13.5, 31]] },
  hips:  { s: [12, 20], tips: [[8.5, 28], [9.5, 30], [11, 31]] },
  up:    { s: [12, 19], tips: [[3, 7], [2, 11], [3, 15]] },
  mid:   { s: [12, 20], tips: [[1.5, 16], [1.5, 20], [3, 24]] },
  down:  { s: [12, 20], tips: [[3, 27], [4.5, 30], [7, 32]] },
  hold:  { s: [12.5, 20], tips: [[15.5, 26], [15, 25], [14.5, 24]] },
  preen: { s: [12, 20], tips: [[6, 22], [6, 25], [7.5, 28]] }
}

function build(k) {
  var o = {
    eyes: k[0] || "open", lx: +k[1] || 0, ly: +k[2] || 0, beak: k[3] || "closed",
    wings: k[4] || "fold", feet: k[5] || "stand", puff: +k[6] || 0, sq: +k[7] || 0,
    lean: +k[8] || 0, blush: +k[9] || 0, hx: +k[10] || 0, hy: +k[11] || 0,
    bag: +k[12] || 0, hold: k[13] || "", acc: SEASON ? k[14] || "" : "", conf: k[15] ? +k[15] : -1
  }
  var g = grid()
  var sq = o.sq, pf = o.puff
  var footY = o.feet === "dangle" ? 35 : 33
  // body (egg) and head (round, big)
  var bcx = 21.5, bcy = 25 + sq * 0.8 + pf * 0.3, brx = 10.5 + sq * 1.0 + pf * 1.6, bry = 8.3 - sq * 0.5 + pf * 0.6
  var hcx = 21.5 + o.hx, hcy = 13 + o.hy + sq * 2.0 + pf * 1.6, hrx = 9.2 + sq * 0.6, hry = 7.6 - sq * 0.7
  if (o.feet === "dangle") { bcy -= 1; hcy -= 1 }

  // ---- tail feathers peeking out behind, low on both sides ----
  layer(g, function(x, y) {
    return inTaper([[bcx - 4, bcy + 4], [bcx - 9, bcy + 8.5]], x, y, 2.2, 1.6) ||
           inTaper([[bcx + 4, bcy + 4], [bcx + 9, bcy + 8.5]], x, y, 2.2, 1.6)
  }, function(x, y, inside) { return !IN(inside, x, y + 1) ? "e" : "d" })

  // ---- feet ----
  function footMask(x, y) {
    var fl = [bcx - 4, footY], fr = [bcx + 4, footY]
    if (o.feet === "tap") fl[1] -= 1
    if (o.feet === "stomp") fr[1] -= 2
    if (o.feet === "tuck") return false
    var legs = o.feet === "dangle"
      ? [[[fl[0], bcy + 5], [fl[0] - 1, fl[1]]], [[fr[0], bcy + 5], [fr[0] + 1, fr[1]]]]
      : [[[fl[0], bcy + 5], [fl[0], fl[1]]], [[fr[0], bcy + 5], [fr[0], fr[1]]]]
    for (var i = 0; i < 2; i++) {
      if (segDist(legs[i], x, y) < 0.8) return true
      var f = legs[i][1]
      // three toes
      if (Math.floor(f[1]) === y && x >= Math.floor(f[0]) - 2 && x <= Math.floor(f[0]) + 1) return true
    }
    return false
  }
  layer(g, footMask, "k")

  // ---- wings that spread out sit behind the body ----
  var wp = WINGS[o.wings] || WINGS.fold
  var behind = o.wings === "up" || o.wings === "mid" || o.wings === "down" || o.wings === "preen"
  function wingMask(pts) {
    return function(x, y) {
      for (var i = 0; i < pts.tips.length; i++)
        if (inTaper([pts.s, pts.tips[i]], x, y, 3.6 - i * 0.2, 1.3)) return true
      return false
    }
  }
  function wingFill(side) {
    return function(x, y, inside) {
      if (!IN(inside, x, y - 1)) return "h"
      // two dark wing bars across the feathers, dark primaries at the tips
      var sx = side ? 43 - wp.s[0] : wp.s[0]
      var d = Math.sqrt(Math.pow(x + 0.5 - sx, 2) + Math.pow(y + 0.5 - wp.s[1], 2))
      if (d > 5.6 && d < 6.6) return "d"
      if (d > 8.0 && d < 9.0) return "d"
      if (d > 10.5) return "d"
      return "n"
    }
  }
  var wl = wp, wr = { s: [43 - wp.s[0], wp.s[1]], tips: mirrorPts(wp.tips) }
  if (o.wings === "preen") wr = { s: [43 - WINGS.fold.s[0], WINGS.fold.s[1]], tips: mirrorPts(WINGS.fold.tips) }
  if (behind) {
    layer(g, wingMask(wl), wingFill(false))
    if (o.wings !== "preen") layer(g, wingMask(wr), wingFill(true))
  }

  // ---- body ----
  layer(g, function(x, y) { return inEllipse(x, y, bcx, bcy, brx, bry) }, function(x, y, inside) {
    if (!IN(inside, x, y - 1)) return "h"
    if (!IN(inside, x, y + 1)) return "n"
    if (!IN(inside, x + 1, y) || !IN(inside, x + 2, y)) return "n"
    // a soft lighter breast
    if (inEllipse(x, y, bcx, bcy + 1.5, brx * 0.5, bry * 0.6)) return "h"
    return "b"
  })

  // ---- folded wings on the body sides ----
  if (!behind) {
    layer(g, wingMask(wl), wingFill(false))
    layer(g, wingMask(wr), wingFill(true))
  } else if (o.wings === "preen") {
    layer(g, wingMask(wr), wingFill(true))
  }

  // ---- head ----
  layer(g, function(x, y) { return inEllipse(x, y, hcx, hcy, hrx, hry) }, function(x, y, inside) {
    if (!IN(inside, x, y - 1)) return "h"
    if (!IN(inside, x, y - 2) && x < hcx + 2) return "h"
    if (!IN(inside, x + 1, y)) return "n"
    // the iridescent neck band along the bottom of the head
    if (!IN(inside, x, y + 1)) return "p"
    if (!IN(inside, x, y + 2)) return (x === Math.round(hcx) - 4 || x === Math.round(hcx) + 3) ? "h" : "p"
    return "b"
  })
  // head gloss
  var ht = Math.ceil(hcy - hry)
  putIf(g, Math.round(hcx) - 5, ht + 2, "l", "hb"); putIf(g, Math.round(hcx) - 4, ht + 2, "l", "hb")
  putIf(g, Math.round(hcx) - 6, ht + 3, "h", "b")

  // ---- face ----
  var eyeTop = Math.round(hcy - 3.5 + sq * 0.3) + o.ly
  var cx = Math.round(hcx)
  var exL = cx - 9 + o.lx, exR = cx + 4 + o.lx
  var e = EYES[o.eyes] || EYES.open
  stamp(g, e, exL, eyeTop, false)
  stamp(g, e, exR, eyeTop, !!ASYM[o.eyes])
  var brow = BROWS[o.eyes]
  if (brow) {
    stamp(g, brow, exL, eyeTop - 2, false)
    stamp(g, brow, exR, eyeTop - 2, true)
  }
  if (o.blush) {
    var bc = o.blush === 2 ? "r" : "p"
    var by = eyeTop + 5
    put(g, exL - 1, by, bc); put(g, exL, by, bc); put(g, exL + 1, by, bc)
    put(g, exR + 2, by, bc); put(g, exR + 3, by, bc); put(g, exR + 4, by, bc)
  }
  var bk = BEAKS[o.beak] || BEAKS.closed
  stamp(g, bk, cx - 3 + o.lx, eyeTop + 2 + (o.beak === "tuck" ? 2 : 0), false)

  // ---- messenger bag: strap over the left shoulder, bag on the right hip ----
  if (o.wings !== "preen") {
    var strap = [[bcx - 7, bcy - 6], [bcx + 7, bcy + 2]]
    for (var y1 = 0; y1 < H; y1++)
      for (var x1 = 0; x1 < W; x1++)
        if (segDist(strap, x1, y1) < 0.75 && "bhnpd".indexOf(get(g, x1, y1)) >= 0) put(g, x1, y1, "k")
  }
  var bx0 = Math.round(bcx) + 4, by0 = Math.round(bcy) - 1
  // envelopes sticking out of the bag
  for (var i = 0; i < o.bag; i++) stamp(g, o.acc === "xmas" ? GIFT_TOP : ENV_TOP, bx0 + 1 + i * 3, by0 - 2 + (i % 2), false)
  stamp(g, o.acc ? seasonBag(o.acc) : BAG, bx0, by0, false)
  if (o.acc) seasonPigeon(g, o, hcx, hcy, hry, bx0, by0)   // season: hat on the bag / head
  // ---- held things ----
  if (o.hold === "map") stamp(g, MAP, Math.round(bcx) - 7, Math.round(bcy) - 5, false)
  if (o.wings === "hold") layer(g, function(x, y) {
    return inEllipse(x, y, 14.5, bcy, 1.8, 2.4) || inEllipse(x, y, 28.5, bcy, 1.8, 2.4)
  }, function(x, y, inside) { return !IN(inside, x, y - 1) ? "h" : !IN(inside, x, y + 1) ? "d" : "n" })

  if (o.lean) shear(g, o.lean, footY)
  if (o.conf >= 0) seasonConfetti(g, o.conf)   // season: confetti burst

  var out = []
  for (var y = 0; y < H; y++) out.push(g[y].join(""))
  return out
}

// the satchel: flap with a tag carrying the rx (1 2) and tx (3 4) lights
var BAG = [
  ".oooooooo.",
  "opllllllpo",
  "op12pp34ko",
  "oppppppppo",
  ".oeeeeeeo.",
  "okkkkkkkko",
  "okkkkkkkko",
  ".oooooooo."
]
var ENV_TOP = [
  "ooo",
  "olo",
  "olo"
]

function shear(g, dir, pivot) {
  for (var y = 0; y < pivot; y++) {
    var s = Math.round(dir * (pivot - y) / 14)
    if (!s) continue
    var row = g[y].slice()
    for (var x = 0; x < W; x++) {
      var src = x - s
      g[y][x] = src >= 0 && src < W ? row[src] : "."
    }
  }
}

// ---------- the wire (behind) ----------
var gcache = {}
function ground(key, season0) {
  if (season0) SEASON = season0
  var hit = gcache[key]
  if (hit) return hit
  var k = String(key).split("|")
  var g = grid()
  if (+k[1]) {
    for (var x = 12; x <= 31; x++) put(g, x, 36, "t")
  }
  // a sagging wire from post to post
  for (var x2 = 0; x2 < W; x2++) {
    var sag = Math.round(Math.pow((x2 - 21.5) / 21.5, 2) * -1.4) + 1
    put(g, x2, 33 + sag, "d")
    put(g, x2, 34 + sag, "e")
  }
  if (k[2] === "party" && SEASON) {   // season: confetti fallen under the wire
    var bits = SEASON.confetti(23, 10, 1, 36, 42, 37, -1)
    for (var cb = 0; cb < bits.length; cb++) putIf(g, bits[cb][0], bits[cb][1], bits[cb][2], ".t")
  }
  var rows = []
  for (var y = 0; y < H; y++) rows.push(g[y].join(""))
  gcache[key] = rows
  return rows
}

// ---------- the envelope pile (in front) ----------
var fcache = {}
function front(level) {
  var key = String(level)
  var hit = fcache[key]
  if (hit) return hit
  var g = grid()
  var spots = [[5, 31], [14, 32], [24, 32], [32, 31], [9, 27], [28, 27], [19, 28],
               [3, 24], [34, 23], [12, 23], [26, 23]]
  var n = level >= 2 ? spots.length : level >= 1 ? 7 : 0
  for (var i = 0; i < n; i++) {
    var s = spots[i]
    stamp(g, i % 3 === 1 ? ENVELOPE_TILT : ENVELOPE, s[0], s[1], i % 2 === 1)
  }
  var rows = []
  for (var y = 0; y < H; y++) rows.push(g[y].join(""))
  fcache[key] = rows
  return rows
}

// ---------- effect sprites ----------
// envelope in flight (pet palette), and a tilted one
var envelope = ENVELOPE
var ENVELOPE_TILT = [
  "..oooo..",
  ".onwwooo",
  "owwnwnwo",
  "owwwrwwo",
  "oowwwwoo",
  "...oooo."
]
var envelopeTilt = ENVELOPE_TILT
// a loose feather drifting down (pet palette)
var feather = [
  [
    "..oo",
    ".oho",
    "ohno",
    "ono.",
    "oo..",
    "o..."
  ],
  [
    "oo..",
    "ohno",
    "onho",
    ".ono",
    "..oo",
    "...o"
  ]
]
// "coo" puffs (fx palette)
var coo = [
  ".o.o.",
  "o.o.o",
  "....."
]

// ---------- season (shared/PetSeason.js) ----------
//
// The courier's bag is its seasonal spot: at Christmas the satchel turns
// into Santa's sack (red, white fur trim) wearing a little Santa hat, and the
// envelopes poking out become gift boxes; in October it is a jack-o'-lantern
// trick-or-treat bucket; on party days the pigeon wears a party hat, confetti
// lies under the wire and rains down while it is petted. The rx/tx lights
// (1 2 3 4) stay on the tag in every outfit. Key fields 14 acc, 15 conf;
// ground key field 2.

var SEASON = null    // PetSeason, handed in by the QML (pigeon(key, PetSeason))

var SANTA_BAG = [
  ".oooooooo.",
  "oWWWWWWWVo",
  "oR12RR34Mo",
  "oRRRRRRRMo",
  ".oMMMMMMo.",
  "oRRGRGRRMo",
  "oRRRGRRRMo",
  ".oooooooo."
]
var PUMPKIN_BAG = [
  ".oooooooo.",
  "oOOOOOOOUo",
  "oO12OO34Uo",
  "oOOOOOOOUo",
  "oYYOOOYYUo",
  "oOOYYYYOUo",
  "oUOOUUOUUo",
  ".oooooooo."
]
var GIFT_TOP = [
  "oYo",
  "GYG",
  "GYG"
]
function seasonBag(acc) { return acc === "xmas" ? SANTA_BAG : acc === "spooky" ? PUMPKIN_BAG : BAG }

function seasonPigeon(g, o, hcx, hcy, hry, bx0, by0) {
  function q(x, y, c) { put(g, x, y, c) }
  if (o.acc === "xmas") SEASON.stampHat(q, SEASON.hat("santa", 7, 3, 1), bx0 + 3, by0)
  else if (o.acc === "spooky") {
    // the bucket's handle arching over the top
    for (var x = bx0 + 1; x <= bx0 + 8; x++) {
      var y = by0 - 1 - Math.round(2.2 * Math.sin((x - bx0 - 0.5) / 8 * Math.PI))
      if (get(g, x, y) !== "l") put(g, x, y, "e")
    }
  } else if (o.acc === "party") SEASON.stampHat(q, SEASON.hat("party", 8, 6, 1), Math.round(hcx) - 2, Math.ceil(hcy - hry) + 1)
}

function seasonConfetti(g, conf) {
  var bits = SEASON.confetti(29, 16, 1, 0, 42, 31, conf)
  for (var i = 0; i < bits.length; i++) put(g, bits[i][0], bits[i][1], bits[i][2])
}
