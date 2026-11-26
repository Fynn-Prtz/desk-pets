.pragma library

// Desk Games pet: a little axolotl gamer. Big round head with pink frilly
// gills, chubby body with a light belly, a tail, tiny mitten arms holding a
// small controller, and a headset (band, ear cups, mic) over its head.
// Drawn at px 2 on the shared 44x38 pet canvas (docs/PETS.md); built from
// shapes (ellipses, rounded rects, thick polylines) with top-lit shading and
// memoised per pose key, like the screensaver cat.
//
// Palette keys (PetColors): o outline, b body, h highlight, n shade, d dark
// (headset, pad, spots), w belly, l lightest, p gills / blush, k gill shade,
// e ink, x glint / lit button, r urgent, t shadow.
// scene(state, PetFx) -> body rows + offset + floor shadow + up to six effects.

var W = 44
var H = 36
var FX_SLOTS = 6

// ---------------------------------------------------------------- shapes

function grid() {
  var g = []
  for (var y = 0; y < H; y++) {
    var r = []
    for (var x = 0; x < W; x++) r.push(".")
    g.push(r)
  }
  return g
}

function inDisc(x, y, cx, cy, r) {
  var dx = x + 0.5 - cx, dy = y + 0.5 - cy
  return dx * dx + dy * dy <= r * r
}

function inEllipse(x, y, cx, cy, rx, ry) {
  var dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry
  return dx * dx + dy * dy <= 1
}

// Rounded rect over cells x0..x1, y0..y1 (inclusive), corner radius r.
function inRRect(x, y, x0, y0, x1, y1, r) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false
  var cx = x + 0.5, cy = y + 0.5
  var dx = Math.max(x0 + r - cx, 0, cx - (x1 + 1 - r))
  var dy = Math.max(y0 + r - cy, 0, cy - (y1 + 1 - r))
  return dx * dx + dy * dy <= r * r + 0.01
}

// Distance from the cell centre to a polyline (array of [x, y]).
function segDist(pts, x, y) {
  var px = x + 0.5, py = y + 0.5, best = 1e9
  for (var i = 0; i + 1 < pts.length; i++) {
    var a = pts[i], b = pts[i + 1]
    var vx = b[0] - a[0], vy = b[1] - a[1], l2 = vx * vx + vy * vy
    var t = l2 > 0 ? Math.max(0, Math.min(1, ((px - a[0]) * vx + (py - a[1]) * vy) / l2)) : 0
    var ex = a[0] + vx * t - px, ey = a[1] + vy * t - py
    best = Math.min(best, ex * ex + ey * ey)
  }
  return Math.sqrt(best)
}

// Fill a mask and ring it with outline cells (8-neighbourhood), back to front.
function layer(g, mask, fill) {
  var inside = []
  for (var y = 0; y < H; y++) {
    var r = []
    for (var x = 0; x < W; x++) r.push(mask(x, y))
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

// Bounds-safe "is this cell inside the layer mask" for fill functions.
function IN(inside, x, y) { return y >= 0 && y < H && x >= 0 && x < W && inside[y][x] }

function put(g, x, y, c) { if (y >= 0 && y < H && x >= 0 && x < W) g[y][x] = c }
function putIf(g, x, y, c, only) { if (y >= 0 && y < H && x >= 0 && x < W && only.indexOf(g[y][x]) >= 0) g[y][x] = c }

// Stamp a small pattern ("." = skip) at x, y.
function stamp(g, x, y, rows, map) {
  for (var r = 0; r < rows.length; r++)
    for (var c = 0; c < rows[r].length; c++) {
      var ch = rows[r].charAt(c)
      if (ch === ".") continue
      put(g, x + c, y + r, map && map[ch] ? map[ch] : ch)
    }
}

function mirrorRows(rows) {
  var out = []
  for (var i = 0; i < rows.length; i++) out.push(rows[i].split("").reverse().join(""))
  return out
}

// ---------------------------------------------------------------- face
//
// Ink eyes straight on the body. "E" ink, "X" glint, "P" blush.

// ---------------------------------------------------------------- face

var EYES = {
  open:    [".EE.", "EXEE", "EEEE", "EEEE", ".EE."],
  half:    ["....", "EEEE", "EXEE", ".EE.", "...."],
  blink:   ["....", "....", "....", "EEEE", "...."],
  sleep:   ["....", "....", "E..E", ".EE.", "...."],
  happy:   ["....", ".EE.", "E..E", "....", "...."],
  squintL: ["E...", ".EE.", "...E", ".EE.", "E..."],
  strainL: ["EE..", ".EEE", "...E", ".EEE", "EE.."],
  wide:    [".EE.", "EXXE", "EXEE", "EEEE", ".EE."],
  sparkle: [".EE.", "EXEE", "EEEE", "EEXE", ".EE."],
  focusL:  ["....", "EEEE", "EXEE", ".EE.", "...."],
  worry:   ["....", ".EE.", "EXEE", "EEEE", ".EE."],
  angryL:  ["E...", "EE..", "EXE.", "EEEE", ".EE."],
  dizzy:   [".EEE.", "E...E", "E.E.E", "E...E", ".EEE."],
  dizzyB:  [".EEE.", "E.E.E", "E...E", "E...E", ".EEE."]
}

var BROWS = {
  angry:  ["EE..", "..EE"],
  worry:  ["..EE", "EE.."],
  focus:  ["....", "EEE."]
}

var MOUTHS = {
  none:   [],
  smile:  ["E..E", ".EE."],
  grin:   ["E....E", ".EEEE."],
  omega:  ["E.EE.E", ".E..E."],
  flat:   ["EEEE"],
  o:      [".EE.", "E..E", ".EE."],
  big:    [".EEEE.", "EEEEEE", ".EPPE."],
  grit:   ["EEEEEE", "EXXXXE", "EEEEEE"],
  wobble: [".E..E.", "E.EE.E"],
  pout:   [".EE.", "E..E"],
  tongue: ["EEEE..", ".EEPP.", "...PP."],
  giggle: ["EEEEEE", ".E..E.", "..EE.."],
  tiny:   ["EE"]
}

function drawFace(g, cx, top, face) {
  var map = { "E": "e", "X": "x", "P": "p" }
  var eyes = face.eyes, lx = face.lookX || 0, ly = face.lookY || 0
  var e = EYES[eyes] || EYES.open, eR = /L$/.test(eyes) ? mirrorRows(e) : e
  var ey = top + ly
  var lxp = cx - 5 - e[0].length + lx, rxp = cx + 5 + lx
  stamp(g, lxp, ey, e, map)
  stamp(g, rxp, ey, eR, map)
  if (face.brows && BROWS[face.brows]) {
    var b = BROWS[face.brows]
    stamp(g, lxp, ey - 2, b, map)
    stamp(g, rxp, ey - 2, mirrorRows(b), map)
  }
  if (face.blush !== false) {
    stamp(g, cx - 10, top + 5, ["PPP"], map)
    stamp(g, cx + 7, top + 5, ["PPP"], map)
  }
  var m = MOUTHS[face.mouth] || []
  if (m.length) stamp(g, cx - Math.floor(m[0].length / 2), top + 5, m, map)
}

var TROPHY = [
  ".ooooooo.",
  "oxlwwwwno",
  "oxlwwwwno",
  ".oxlwwno.",
  "..oowoo..",
  "...ono...",
  "...ono...",
  "..ooooo..",
  ".onnnnno.",
  ".ooooooo."
]

// ---------------------------------------------------------------- body
//
// opts: face, lift (head/body raised), squash 0..2, arms pose, pad ("hold" |
//   "raised" | "floor" | "none"), press ("" | "L" | "R"), lit (button that
//   flashes: "" | "a" | "b"), gills pose, headset ("on" | "neck" | "tilt"),
//   tail pose, legs ("stand" | "dangleA/B" | "stompL/R" | "tuck"), lean, trophy

var ARMS = {
  // [left hand, right hand]
  hold:   [[15.5, 26.0], [28.0, 26.0]],
  mashA:  [[15.5, 27.0], [28.0, 26.0]],
  mashB:  [[15.5, 26.0], [28.0, 27.0]],
  rest:   [[11.5, 27.0], [32.0, 27.0]],
  hips:   [[12.0, 25.5], [31.5, 25.5]],
  out:    [[7.5, 24.0], [36.0, 24.0]],
  up:     [[7.0, 15.0], [36.5, 15.0]],
  raise:  [[14.5, 3.5], [29.0, 3.5]],
  ear:    [[10.0, 15.5], [28.0, 26.0]],
  trophy: [[15.5, 28.0], [28.0, 28.0]],
  flailA: [[6.5, 17.0], [37.5, 23.0]],
  flailB: [[6.5, 23.0], [37.5, 17.0]],
  danceA: [[7.0, 17.0], [33.0, 27.0]],
  danceB: [[10.5, 27.0], [36.5, 17.0]],
  tuck:   [[16.0, 28.5], [27.5, 28.5]]
}

// Gill branches of the left side: [root, mid, tip]; the right side mirrors.
var GILLS = {
  rest:  [[[13.5, 8.5], [10.0, 5.5], [7.0, 3.5]], [[11.5, 11.5], [7.5, 9.5], [3.5, 8.5]], [[11.0, 15.0], [7.0, 14.5], [3.5, 15.5]]],
  wigA:  [[[13.5, 8.5], [10.5, 5.0], [8.0, 2.5]], [[11.5, 11.5], [7.5, 8.5], [4.0, 6.5]], [[11.0, 15.0], [7.0, 13.5], [3.5, 13.5]]],
  wigB:  [[[13.5, 8.5], [9.5, 6.5], [6.0, 5.5]], [[11.5, 11.5], [7.5, 10.5], [3.5, 11.0]], [[11.0, 15.0], [7.5, 16.0], [4.5, 18.0]]],
  flare: [[[13.5, 8.5], [10.0, 4.0], [7.5, 1.0]], [[11.5, 11.5], [6.5, 8.5], [2.0, 6.5]], [[11.0, 15.0], [6.0, 14.5], [1.5, 15.0]]],
  droop: [[[13.5, 9.5], [9.5, 9.5], [6.5, 11.5]], [[11.5, 12.5], [7.5, 13.5], [5.0, 16.0]], [[11.5, 16.0], [8.0, 17.5], [6.5, 20.0]]],
  back:  [[[13.5, 8.5], [11.5, 4.5], [10.5, 1.5]], [[11.5, 11.5], [8.5, 7.5], [7.0, 4.5]], [[11.0, 15.0], [7.5, 12.5], [5.5, 10.5]]]
}

var TAILS = {
  rest:  [[28.0, 30.0], [33.0, 31.5], [37.5, 30.0], [40.0, 27.0]],
  wagA:  [[28.0, 30.0], [33.0, 31.0], [37.5, 28.5], [39.0, 25.0]],
  wagB:  [[28.0, 30.0], [33.0, 32.0], [38.0, 31.5], [41.5, 29.5]],
  curl:  [[28.0, 30.0], [32.5, 32.5], [28.0, 34.0], [20.0, 34.0]],
  hang:  [[27.0, 30.0], [30.0, 33.0], [31.5, 35.5]]
}

function mirrorPts(pts) {
  var out = []
  for (var i = 0; i < pts.length; i++) out.push([43 - pts[i][0], pts[i][1]])
  return out
}

function build(o) {
  var g = grid()
  var sq = o.squash || 0, lift = o.lift || 0
  var hcx = 21.5, hcy = 14.5 - lift + sq * 3, hrx = 11.3 + sq * 0.8, hry = 8.6 - sq * 1.2
  var bcx = 21.5, bcy = 27.0 + sq * 0.6, brx = 10.2 + sq * 1.2, bry = 6.4 - sq * 0.7
  var dyHead = hcy - 14.5

  // Tail (behind): a thick tapering polyline with a lighter fin on top.
  var tail = TAILS[o.tail] || TAILS.rest
  function tailR(x, y) {
    var d = segDist(tail, x, y)
    // taper: thicker at the base
    var bx = tail[0][0], by = tail[0][1], dd = Math.sqrt((x + 0.5 - bx) * (x + 0.5 - bx) + (y + 0.5 - by) * (y + 0.5 - by))
    return d < Math.max(0.7, 2.0 - dd * 0.12)
  }
  layer(g, tailR, function(x, y, inside) { return !IN(inside, x, y - 1) ? "h" : (!IN(inside, x, y + 1) ? "n" : "b") })

  // Gills (behind the head): three frilly pink branches per side.
  var gs = GILLS[o.gills] || GILLS.rest
  var branches = []
  for (var i = 0; i < 3; i++) {
    var L = [], R = []
    for (var j = 0; j < 3; j++) L.push([gs[i][j][0] - sq * 0.8, gs[i][j][1] + dyHead])
    branches.push(L); branches.push(mirrorPts(L))
  }
  function inGill(x, y) {
    for (var b = 0; b < branches.length; b++) {
      var br = branches[b]
      if (segDist(br, x, y) < 0.95) return true
      // frills: little bumps along the outer half and a round tip
      if (inDisc(x, y, br[2][0], br[2][1], 1.35)) return true
      var mx = (br[1][0] + br[2][0]) / 2, my = (br[1][1] + br[2][1]) / 2
      if (inDisc(x, y, mx, my - 0.6, 1.15)) return true
    }
    return false
  }
  layer(g, inGill, function(x, y, inside) {
    // pink, with a darker underside only where the gill is thick
    return (!IN(inside, x, y + 1) && IN(inside, x, y - 1) && IN(inside, x, y - 2)) ? "k" : "p"
  })
  // a light streak on each branch's mid point
  for (var b2 = 0; b2 < branches.length; b2++) putIf(g, Math.floor(branches[b2][1][0]), Math.floor(branches[b2][1][1]) - 0, "l", "p")

  // Feet
  var legs = o.legs || "stand"
  var fy = 33.0
  var feet = [[16.5, fy], [27.0, fy]]
  if (legs === "stompL") feet = [[16.5, fy - 1.6], [27.0, fy]]
  if (legs === "stompR") feet = [[16.5, fy], [27.0, fy - 1.6]]
  if (legs === "dangleA") feet = [[15.5, fy + 1.2], [28.0, fy + 0.6]]
  if (legs === "dangleB") feet = [[17.5, fy + 0.6], [26.0, fy + 1.2]]
  if (legs !== "tuck") layer(g, function(x, y) {
    return inEllipse(x, y, feet[0][0], feet[0][1], 2.4, 1.4) || inEllipse(x, y, feet[1][0], feet[1][1], 2.4, 1.4)
  }, function(x, y, inside) { return !IN(inside, x, y - 1) ? "b" : "n" })

  // Arms behind the body (only for poses away from the front)
  var pose = ARMS[o.arms] || ARMS.hold
  var sh = [[12.5, 23.5 + sq], [30.5, 23.5 + sq]]
  var arms = [[sh[0], pose[0]], [sh[1], pose[1]]]
  if (sq > 1) arms = [[sh[0], [8.5, 27.0]], [sh[1], [35.0, 27.0]]]
  function inHand(i, x, y) { return inDisc(x, y, arms[i][1][0], arms[i][1][1], 1.7) }
  function armMask(which) {
    return function(x, y) {
      for (var i = 0; i < 2; i++) {
        if (!which[i]) continue
        if (segDist(arms[i], x, y) < 1.0 || inHand(i, x, y)) return true
      }
      return false
    }
  }
  function armFill(x, y, inside) { return !IN(inside, x, y - 1) ? "h" : (!IN(inside, x, y + 1) ? "n" : "b") }
  // a hand in front of the belly / pad is drawn after the body
  var front = [pose[0][1] > 24 && pose[0][0] > 13, pose[1][1] > 24 && pose[1][0] < 30]
  if (sq > 1) front = [false, false]
  layer(g, armMask([!front[0], !front[1]]), armFill)

  // Body with a light belly
  layer(g, function(x, y) { return inEllipse(x, y, bcx, bcy, brx, bry) }, function(x, y, inside) {
    if (inEllipse(x, y, bcx, bcy + 1.6, brx * 0.55, bry * 0.62)) return !IN(inside, x, y + 1) ? "n" : "w"
    if (!IN(inside, x, y - 1)) return "h"
    if (!IN(inside, x, y + 1)) return "n"
    if (!IN(inside, x + 1, y) || !IN(inside, x + 2, y)) return "n"
    return "b"
  })

  // Head (round, big), top-lit, with three little spots.
  layer(g, function(x, y) { return inEllipse(x, y, hcx, hcy, hrx, hry) }, function(x, y, inside) {
    if (!IN(inside, x, y - 1)) return "h"
    if (y + 1 < H && (!IN(inside, x, y + 1) || !IN(inside, x, y + 2))) return "n"
    if (!IN(inside, x + 1, y)) return "n"
    return "b"
  })
  var top = Math.ceil(hcy - hry)
  putIf(g, 21, top + 2, "d", "b"); putIf(g, 18, top + 3, "d", "b"); putIf(g, 25, top + 3, "d", "b")
  putIf(g, 14, top + 3, "l", "bh"); putIf(g, 15, top + 2, "l", "bh"); putIf(g, 13, top + 4, "h", "b")

  // Face
  if (o.face) drawFace(g, 22, Math.round(hcy) - 3 + (sq > 0 ? 1 : 0), o.face)

  // Headset
  var hs = o.headset || "on"
  if (hs === "on" || hs === "tilt") {
    var band = []
    for (var a = 0; a <= 12; a++) {
      var ang = Math.PI * (1.08 + a * 0.84 / 12)
      band.push([hcx + (hrx - 0.6) * Math.cos(ang), hcy + (hry + 0.2) * Math.sin(ang)])
    }
    layer(g, function(x, y) { return segDist(band, x, y) < 0.75 }, "e")
    // ear cups, the left one lifted while it gets adjusted
    var lift1 = hs === "tilt" ? 2 : 0
    var cupY = Math.round(hcy) - 2
    layer(g, function(x, y) {
      return inRRect(x, y, 8 - sq, cupY - lift1, 11 - sq, cupY + 4 - lift1, 1.6) || inRRect(x, y, 32 + sq, cupY, 35 + sq, cupY + 4, 1.6)
    }, function(x, y, inside) { return !IN(inside, x, y - 1) ? "n" : "d" })
    // mic boom from the left cup to the mouth
    var mic = [[10.5 - sq, cupY + 4.5 - lift1], [12.0, cupY + 6.5], [15.0, cupY + 7.2]]
    for (var y2 = 0; y2 < H; y2++)
      for (var x2 = 0; x2 < W; x2++)
        if (g[y2][x2] !== "e" && segDist(mic, x2, y2) < 0.55) g[y2][x2] = "o"
    stamp(g, 15, cupY + 6, ["dd", "dd"])
  } else if (hs === "neck") {
    // headset off, resting around the neck
    var by = Math.round(hcy + hry) - 1
    for (var x3 = 13; x3 <= 30; x3++) {
      var dip = Math.round(Math.pow((x3 + 0.5 - 21.5) / 8.5, 2) * -1.6) + 1
      putIf(g, x3, by + dip, "e", "bhnw")
    }
    layer(g, function(x, y) { return inRRect(x, y, 10, by - 1, 13, by + 2, 1.4) || inRRect(x, y, 30, by - 1, 33, by + 2, 1.4) },
      function(x, y, inside) { return !IN(inside, x, y - 1) ? "n" : "d" })
  }

  if (o.acc || o.cap || o.mug !== undefined) seasonGamer(g, o, hcx, hcy, hry)   // season: antlers + red nose / horns / party hat; day-night: nightcap, mug
  // Controller
  var pad = o.pad || "hold"
  var px0 = 16, py0 = 24 + sq
  if (pad === "raised") { px0 = 16; py0 = 1 }
  if (pad === "floor") { px0 = 1; py0 = 31 }
  if (pad !== "none") {
    layer(g, function(x, y) { return inRRect(x, y, px0, py0, px0 + 11, py0 + 3, 1.5) }, function(x, y, inside) {
      return !IN(inside, x, y - 1) ? "n" : "d"
    })
    var pl = o.press === "L" ? "o" : "e"
    stamp(g, px0 + 2, py0 + 1, [".E.", "EEE"], { "E": pl })
    put(g, px0 + 3, py0 + 3, pl)
    var lit = o.lit || ""
    put(g, px0 + 8, py0 + 1, lit === "a" ? "x" : "p")
    put(g, px0 + 9, py0 + 2, lit === "b" ? "x" : (o.press === "R" ? "o" : "r"))
    put(g, px0 + 7, py0 + 2, "w")
  }

  // Hands in front (gripping the pad); a raised pad gets just the mittens
  layer(g, armMask([front[0], front[1]]), armFill)
  if (o.arms === "raise") layer(g, function(x, y) { return inHand(0, x, y) || inHand(1, x, y) }, armFill)

  if (o.trophy) {
    // held up in front of the tummy, inked so it pops off the pale belly
    stamp(g, 17, 20, TROPHY, { "o": "e" })
    layer(g, function(x, y) { return inHand(0, x, y) || inHand(1, x, y) }, armFill)
  }

  if (o.lean) {
    for (var y5 = 0; y5 < H; y5++) {
      var s = o.lean * Math.floor(Math.max(0, y5 - 8) / 9)
      if (!s) continue
      var row = g[y5], out = []
      for (var x5 = 0; x5 < W; x5++) { var src = x5 - s; out.push(src >= 0 && src < W ? row[src] : ".") }
      g[y5] = out
    }
  }

  if (o.conf !== undefined) seasonConfetti(g, o.conf)   // season: confetti burst
  var rows = []
  for (var y6 = 0; y6 < H; y6++) rows.push(g[y6].join(""))
  return rows
}

var cache = {}
var cacheSize = 0
function frame(o) {
  var f = o.face || {}
  var key = [o.lift || 0, o.squash || 0, o.arms || "", o.pad || "", o.press || "", o.lit || "", o.gills || "", o.headset || "",
    o.tail || "", o.legs || "", o.lean || 0, o.trophy ? 1 : 0,
    o.face ? [f.eyes, f.mouth, f.brows || "", f.blush === false ? 0 : 1, f.lookX || 0, f.lookY || 0].join(",") : "",
    o.acc || "", o.conf === undefined ? "" : o.conf, o.cap ? 1 : 0, o.mug === undefined ? "" : o.mug].join("|")
  var hit = cache[key]
  if (hit) return hit
  if (cacheSize > 500) { cache = {}; cacheSize = 0 }
  var rows = build(o)
  cache[key] = rows
  cacheSize++
  return rows
}

var shadow = [
  [".........tttttttttttttttttttttttttt.....", "............tttttttttttttttttttt........"],
  ["...........tttttttttttttttttttttt.......", "..............tttttttttttttttt.........."],
  ["..............tttttttttttttttt..........", "........................................"]
]

// ---------------------------------------------------------------- scene
//
// st: { mood (idle|ready|launching|playing|report), strain (0 calm, 1 system
//       buddy under load, 2 maxed / hot), bop, t, wall, blink, fidget, fidgetT,
//       reaction, reactT, hovered, lookX, lookY, dragged, lean, landT, beat }

var FX = null
var effortR = null, dustR = null
function init(fx) {
  if (FX === fx) return
  FX = fx
  effortR = mirrorRows(fx.effort)
  dustR = mirrorRows(fx.dust[1])
}

function scene(st, fx0, season0) {
  if (fx0) init(fx0)
  if (season0) SEASON = season0
  var t = st.t, tick = Math.floor(t * 4), mood = st.mood, strain = st.strain || 0
  var o = { arms: "hold", pad: "hold", gills: "rest", headset: "on", tail: "rest", legs: "stand" }
  var face = { eyes: st.blink ? "blink" : "open", mouth: "smile", lookX: 0, lookY: 0 }
  var dx = 0, dy = 0, fx = []
  var sleepy = mood === "idle" && !st.hovered && !st.bop && !st.reaction && !st.dragged && st.landT < 0

  if (sleepy) {
    // curled up, headset around the neck, pad put down beside it
    o = { squash: 1, arms: "tuck", pad: "floor", gills: "droop", headset: "neck", tail: "curl", legs: "tuck" }
    o.lift = Math.floor(st.wall) % 3 === 0 ? 1 : 0
    face = { eyes: "sleep", mouth: "tiny" }
    for (var z = 0; z < 2; z++) {
      var ph = ((st.wall * 0.35 + z * 0.5) % 1 + 1) % 1
      if (ph < 0.85) fx.push({ rows: z === 0 ? FX.zed : FX.zedSmall, x: 36 + Math.round(Math.sin(ph * 6.28)) - z * 3, y: 13 - Math.round(ph * 11), c: "o", op: 0.7 })
    }
  } else if (mood === "idle" || mood === "ready") {
    var fd = st.fidget, ft = st.fidgetT, step = Math.floor(ft * 4)
    if (fd === "headset") {
      // nudges its left ear cup into place
      var adj = ft > 0.3 && ft < 1.6
      o.arms = adj ? "ear" : "hold"; o.pad = adj ? "none" : "hold"
      o.headset = adj && step % 2 === 0 ? "tilt" : "on"
      face.eyes = adj ? "happy" : face.eyes; face.mouth = adj ? "o" : "smile"; face.lookX = adj ? -1 : 0
    } else if (fd === "press") {
      o.arms = step % 2 === 0 ? "mashB" : "hold"
      o.press = step % 2 === 0 ? "R" : ""
      o.lit = step % 4 < 2 ? "a" : "b"
      face.eyes = "happy"; face.mouth = step % 2 === 0 ? "o" : "grin"; face.lookY = 1
      o.gills = step % 2 === 0 ? "wigA" : "wigB"
    } else if (fd === "look") {
      face.lookX = ft < 0.9 ? -1 : ft < 1.9 ? 1 : 0
      face.lookY = ft > 1.9 && ft < 2.5 ? -1 : 0
      face.mouth = "flat"
    } else if (fd === "stretch") {
      var up = ft > 0.3 && ft < 2.2
      o.arms = "up"; o.pad = "floor"; o.lift = up ? 1 : 0
      o.gills = up ? "flare" : "rest"
      face.eyes = up ? "happy" : "open"; face.mouth = up ? "o" : "smile"
    } else if (fd === "wiggle") {
      o.tail = step % 2 === 0 ? "wagA" : "wagB"
      o.gills = step % 2 === 0 ? "wigA" : "wigB"
      dx = step % 4 < 2 ? -1 : 0
      face.eyes = "happy"; face.mouth = "omega"
    }
    if (mood === "idle" && !fd && face.eyes === "open") face.eyes = "half"
    if (st.hovered && !fd) face.mouth = "grin"
  } else if (mood === "launching") {
    o.arms = "raise"; o.pad = "raised"
    o.gills = tick % 2 === 0 ? "rest" : "wigA"
    o.tail = tick % 2 === 0 ? "wagA" : "wagB"
    dy = tick % 2 === 0 ? -1 : 0
    face = { eyes: "sparkle", mouth: "big" }
    if (tick % 4 < 3) fx.push({ rows: FX.bang, x: 40, y: 3, c: "o", op: 1 })
    if (tick % 2 === 0) fx.push({ rows: FX.sparkle[1], x: 0, y: 3, c: "o", op: 1 })
  } else if (mood === "playing") {
    if (strain === 0) {
      o.arms = tick % 2 === 0 ? "mashA" : "mashB"
      o.press = tick % 2 === 0 ? "L" : "R"
      o.lit = tick % 2 === 0 ? "" : (Math.floor(tick / 2) % 2 === 0 ? "a" : "b")
      face = { eyes: "focusL", brows: "focus", mouth: "tongue", lookY: 1, lookX: tick % 8 < 4 ? 0 : 1 }
      o.tail = tick % 8 < 4 ? "rest" : "wagA"
    } else if (strain === 1) {
      o.arms = tick % 2 === 0 ? "mashA" : "mashB"
      o.press = tick % 2 === 0 ? "L" : "R"
      o.lit = tick % 2 === 0 ? "a" : "b"
      o.gills = "flare"
      face = { eyes: "strainL", mouth: "grit" }
      dx = tick % 2 === 0 ? -1 : 1
      o.legs = tick % 2 === 0 ? "stompL" : "stompR"
      o.tail = tick % 2 === 0 ? "wagA" : "wagB"
      sweat(fx, t, 2)
      if (tick % 4 < 2) { fx.push({ rows: FX.effort, x: 0, y: 18, c: "o", op: 1 }); fx.push({ rows: effortR, x: 40, y: 18, c: "o", op: 1 }) }
    } else {
      o.arms = tick % 2 === 0 ? "mashA" : "mashB"
      o.press = tick % 2 === 0 ? "L" : ""
      o.lit = tick % 2 === 0 ? "a" : ""
      o.gills = tick % 2 === 0 ? "wigA" : "wigB"
      face = { eyes: tick % 2 === 0 ? "dizzy" : "dizzyB", mouth: "wobble" }
      dx = [0, -1, 0, 1][tick % 4]
      o.tail = tick % 2 === 0 ? "wagA" : "wagB"
      fx.push({ rows: FX.spiral[tick % 2], x: 37, y: 0, c: "o", op: 1 })
      sweat(fx, t, 3)
    }
  } else if (mood === "report") {
    o.arms = "trophy"; o.pad = "none"; o.trophy = true
    o.gills = st.blink ? "wigA" : "rest"
    o.tail = st.blink ? "wagA" : "rest"
    face = { eyes: "happy", mouth: "grin" }
    fx.push({ rows: FX.sparkle[st.blink ? 1 : 0], x: 36, y: 19, c: "o", op: 1 })
    fx.push({ rows: FX.sparkle[st.blink ? 0 : 1], x: 3, y: 22, c: "o", op: 1 })
  }

  // cat dancing next door: bop along (unless busy gaming)
  if (st.bop && mood !== "playing" && mood !== "launching" && !st.reaction) {
    var gb = st.beat
    if (mood !== "report") { o.arms = gb % 2 === 0 ? "danceA" : "danceB"; o.pad = "floor" }
    o.gills = gb % 2 === 0 ? "wigA" : "wigB"
    o.tail = gb % 2 === 0 ? "wagA" : "wagB"
    o.squash = 0; o.legs = "stand"; o.lift = 0; o.headset = "on"
    dy = gb % 2 === 0 ? -1 : 0
    dx = Math.floor(gb / 2) % 2 === 0 ? -1 : 0
    face = { eyes: "happy", mouth: gb % 2 === 0 ? "grin" : "omega" }
    for (var nn = 0; nn < 2; nn++) {
      var np = ((t * 0.7 + nn * 0.5) % 1 + 1) % 1
      if (np < 0.8) fx.push({ rows: nn === 0 ? FX.note : FX.noteDouble, x: 1 + nn * 4 + Math.round(Math.sin(np * 6.28)), y: 14 - Math.round(np * 12), c: "o", op: 1 })
    }
  }

  if (st.morningT >= 0 && mood === "ready" && SEASON) face = dayMorning(o, st, face)   // day-night: morning stretch + coffee
  if (sleepy && st.night && SEASON) o.cap = 1   // day-night: nightcap while curled up after 23:00

  // ---- touch reactions ----
  var struggling = mood === "playing" && strain > 0
  if (st.dragged) {
    o = { arms: tick % 2 === 0 ? "flailA" : "flailB", pad: "none", gills: "back", headset: "on",
          tail: "hang", legs: tick % 2 === 0 ? "dangleA" : "dangleB", lean: st.lean || 0 }
    face = { eyes: "wide", mouth: "wobble", brows: "worry" }
    dy = -2; dx = 0
    fx = []
    if (tick % 4 < 3) fx.push({ rows: FX.bang, x: 41, y: 1, c: "r", op: 1 })
    sweat(fx, t, 1)
  } else if (st.landT >= 0) {
    var lt = st.landT
    o = { arms: "out", pad: "none", gills: "rest", headset: "on", tail: "rest", legs: "stand" }
    fx = []; dx = 0; dy = 0
    if (lt < 0.3) {
      o.squash = 2; o.gills = "droop"
      face = { eyes: "squintL", mouth: "o" }
      fx.push({ rows: FX.dust[0], x: 3, y: 31, c: "o", op: 0.6 })
      fx.push({ rows: FX.dust[1], x: 35, y: 31, c: "o", op: 0.6 })
    } else if (lt < 0.5) {
      dy = -1; o.gills = "flare"
      face = { eyes: "wide", mouth: "o" }
      fx.push({ rows: FX.dust[1], x: 2, y: 30, c: "o", op: 0.35 })
      fx.push({ rows: dustR, x: 36, y: 30, c: "o", op: 0.35 })
    } else {
      var lk = Math.floor(lt * 4)
      face = { eyes: lk % 2 === 0 ? "dizzy" : "dizzyB", mouth: "wobble" }
      dx = lk % 2 === 0 ? -1 : 1
      o.gills = lk % 2 === 0 ? "wigA" : "wigB"
      fx.push({ rows: FX.spiral[lk % 2], x: 37, y: 0, c: "o", op: 1 })
    }
  } else if (st.reaction === "squish") {
    o = { arms: "out", pad: "none", gills: "flare", headset: "on", tail: tick % 2 === 0 ? "wagA" : "wagB", legs: "stand", squash: 2 }
    face = { eyes: "happy", mouth: tick % 2 === 0 ? "giggle" : "grin" }
    dx = tick % 2 === 0 ? 0 : 1; dy = 0
    fx = struggling ? keepSweat(t) : []
    if (tick % 4 < 2) fx.push({ rows: FX.sparkle[tick % 2], x: 38, y: 12, c: "o", op: 1 })
  } else if (st.reaction === "pet") {
    // gills wiggle happily, tail wags
    var rt = st.reactT, rk = Math.floor(rt * 4)
    o = { arms: "hold", pad: "hold", gills: rk % 2 === 0 ? "wigA" : "wigB", headset: "on",
          tail: rk % 2 === 0 ? "wagA" : "wagB", legs: "stand", lit: rk % 2 === 0 ? "a" : "b" }
    face = struggling ? { eyes: "strainL", mouth: "grin" } : { eyes: "squintL", mouth: "omega" }
    dy = rt < 0.25 ? -1 : 0; dx = 0
    fx = struggling ? keepSweat(t) : []
    var hp = Math.min(1, rt / 1.6)
    fx.push({ rows: FX.heart, x: 36 + rk % 2, y: 10 - Math.round(hp * 10), c: "r", op: hp < 0.9 ? 1 : 0.5 })
    if (rt > 0.5) {
      var hp2 = Math.min(1, (rt - 0.5) / 1.3)
      fx.push({ rows: FX.heartSmall, x: 2 - rk % 2, y: 10 - Math.round(hp2 * 9), c: "r", op: hp2 < 0.9 ? 1 : 0.5 })
    }
  } else if (st.reaction === "annoyed") {
    // gills puff out, stomps, pouts
    o = { arms: "hips", pad: "floor", gills: "flare", headset: "on", tail: tick % 2 === 0 ? "wagA" : "wagB",
          legs: tick % 2 === 0 ? "stompL" : "stompR" }
    face = { eyes: "angryL", brows: "angry", mouth: "pout" }
    dx = tick % 2 === 0 ? -1 : 0; dy = 0
    fx = struggling ? keepSweat(t) : []
    fx.push({ rows: FX.anger, x: 36, y: tick % 2 === 0 ? 1 : 2, c: "r", op: 1 })
    if (tick % 3 === 0) fx.push({ rows: FX.puff[0], x: 1, y: 20, c: "o", op: 0.5 })
  }

  // hover: eyes follow the pointer
  if (st.hovered && face && !st.reaction && !st.dragged && (face.eyes === "open" || face.eyes === "half" || face.eyes === "blink")) {
    face.lookX = st.lookX; face.lookY = st.lookY
    if (face.eyes === "half") face.eyes = "open"
  }

  o.face = face
  seasonScene(o, st)
  if (fx.length > FX_SLOTS) fx = fx.slice(0, FX_SLOTS)
  var air = Math.max(0, -dy)
  return { rows: frame(o), x: dx, y: dy, shadow: shadow[Math.min(2, air)], fx: fx }
}

function sweat(fx, t, n) {
  for (var i = 0; i < n; i++) {
    var p = ((t * 1.1 + i / n) % 1 + 1) % 1
    var side = i % 2 === 0
    if (p < 0.85) fx.push({ rows: FX.sweat, x: side ? 36 : 3, y: 6 + Math.round(p * 9) + i, c: "l", op: 1 })
  }
}

function keepSweat(t) { var fx = []; sweat(fx, t, 1); return fx }

// ---------------------------------------------------------------- season
//
// Seasonal outfit (shared/PetSeason.js): the excitable gamer kid goes full
// costume. Christmas: reindeer-antler headband over the headset + a glowing
// red Rudolph nose; October: little red devil horns; party days: a party hat
// between the gills, confetti on the floor and a burst while petted (not
// with motion "still"). Frame key fields acc + conf.

var SEASON = null    // PetSeason, handed in by the caller like PetFx

function seasonScene(o, st) {
  if (!SEASON || !st.season) return
  o.acc = st.season
  if (st.season === "party" && st.reaction === "pet" && st.motion !== "still" && st.reactT < 2)
    o.conf = Math.floor(st.reactT * 8) / 16
}

var ANTLER = [
  "oo.oo.",
  "oToTo.",
  "oTTTUo",
  ".oTUo.",
  "..oUo.",
  "..oUo."
]
var HORN = [
  "..o.",
  ".oRo",
  "oRMo",
  "oRMo"
]

function seasonGamer(g, o, hcx, hcy, hry) {
  var top = Math.ceil(hcy - hry)
  var cx = Math.round(hcx)
  if (o.mug !== undefined) stamp(g, 19, 20, SEASON.mug(o.mug))   // day-night: morning coffee in both hands
  if (o.cap) {   // day-night: nightcap instead of any hat
    SEASON.stampHat(function(x, y, c) { put(g, x, y, c) }, SEASON.hat("night", 11, 4, 1), cx - 1, top + 2)
    return
  }
  if (o.acc === "xmas") {
    stamp(g, cx - 10, top - 4, ANTLER)
    stamp(g, cx + 4, top - 4, mirrorRows(ANTLER))
    // red nose with a glint, just above the mouth
    var ny = Math.round(hcy) - 3 + ((o.squash || 0) > 0 ? 1 : 0) + 3
    put(g, cx - 1, ny, "R"); put(g, cx, ny, "W"); put(g, cx - 1, ny + 1, "M"); put(g, cx, ny + 1, "R")
  } else if (o.acc === "spooky") {
    stamp(g, cx - 8, top - 2, HORN)
    stamp(g, cx + 4, top - 2, mirrorRows(HORN))
  } else if (o.acc === "party") {
    SEASON.stampHat(function(x, y, c) { put(g, x, y, c) }, SEASON.hat("party", 8, 6, 1), cx + 1, top + 1)
    var bits = SEASON.confetti(31, 9, 0, 34, 43, 35, -1)
    for (var i = 0; i < bits.length; i++) putIf(g, bits[i][0], bits[i][1], bits[i][2], ".")
  }
}

function seasonConfetti(g, conf) {
  var bits = SEASON.confetti(37, 16, 1, 0, 42, 32, conf)
  for (var i = 0; i < bits.length; i++) put(g, bits[i][0], bits[i][1], bits[i][2])
}

// ---------------------------------------------------------------- day / night
//
// day-night: after 23:00 the curled-up axolotl wears a striped nightcap
// (o.cap); the first wake between 06:00 and 10:00 (st.morningT, s since the
// routine started, -1 = none; 4.5 s) is a big gill-flaring stretch with a
// yawn, then the pad goes down and it holds a steaming mug in both hands
// (o.mug = steam phase 0/1) and sips. Touch reactions still override it.

function dayMorning(o, st, face) {
  var t = st.morningT
  if (t < 1.8) {
    var up = t > 0.3 && t < 1.6
    o.arms = "up"; o.pad = "floor"; o.lift = up ? 1 : 0; o.gills = up ? "flare" : "rest"
    return { eyes: up ? "sleep" : "blink", mouth: up ? "o" : "tiny", lookX: 0, lookY: 0 }
  }
  o.pad = "floor"; o.lift = 0; o.gills = Math.floor(t * 4) % 2 ? "wigA" : "wigB"
  if (t > 4.2) { o.arms = "hips"; return { eyes: "happy", mouth: "grin", lookX: 0, lookY: 0 } }
  o.arms = "hold"; o.mug = Math.floor(t * 4) % 2
  var sip = t > 2.6 && t < 3.4
  return { eyes: t > 2.4 ? "happy" : "open", mouth: sip ? "tiny" : "smile", lookX: 0, lookY: 0 }
}
