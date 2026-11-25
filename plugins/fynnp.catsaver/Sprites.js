.pragma library

// Sleeping cat for the screensaver, v2: a little more resolution (68x32 cells
// instead of 49x23, drawn at a smaller pixel size so the cat keeps its size)
// and more detail: top-lit shading, tabby stripes, forehead "M", lighter muzzle
// and socks, toe lines, whiskers, a ringed tail.
//
// Built once at load from simple shapes and kept as string rows (same format
// as the desk cards' sprites). Every frame is precomputed here; the QML side
// only swaps which rows array is shown.
//
// Palette keys:
//   o outline        b body           h highlight (top light)   n shade (belly side)
//   d dark (stripes, tail rings)      w light fur (socks)
//   p pink (ears, nose, blush)        e closed eyes / mouth      l whiskers
//   s floor shadow   . empty
//
// Layers are painted back to front and each paints its own 1-cell outline,
// so overlapping parts (head over body, tail over body) stay separated.

var W = 68
var H = 32
var FLOOR = 29

function grid() {
  var g = []
  for (var y = 0; y < H; y++) {
    var r = []
    for (var x = 0; x < W; x++) r.push(".")
    g.push(r)
  }
  return g
}

function ell(x, y, cx, cy, rx, ry) {
  var dx = (x + 0.5 - cx) / rx
  var dy = (y + 0.5 - cy) / ry
  return dx * dx + dy * dy
}
function inEllipse(x, y, cx, cy, rx, ry) { return ell(x, y, cx, cy, rx, ry) <= 1 }

function inTriangle(x, y, a, b, c) {
  var px = x + 0.5, py = y + 0.5
  function s(p1, p2) { return (px - p2[0]) * (p1[1] - p2[1]) - (p1[0] - p2[0]) * (py - p2[1]) }
  var d1 = s(a, b), d2 = s(b, c), d3 = s(c, a)
  var neg = d1 < 0 || d2 < 0 || d3 < 0, pos = d1 > 0 || d2 > 0 || d3 > 0
  return !(neg && pos)
}

// mask(x, y) -> bool. Fill with `fill`, then ring it with outline cells
// (8-neighbourhood) that are not part of the mask. Everything at and below
// `floorY` is clipped (the cat sits on the floor).
function layer(g, mask, fill, floorY) {
  var inside = []
  for (var y = 0; y < H; y++) {
    var r = []
    for (var x = 0; x < W; x++) r.push(y < floorY && mask(x, y))
    inside.push(r)
  }
  for (var y2 = 0; y2 < H; y2++) {
    for (var x2 = 0; x2 < W; x2++) {
      if (inside[y2][x2]) { g[y2][x2] = typeof fill === "function" ? fill(x2, y2, inside) : fill; continue }
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

// Top-lit shading for a filled layer: a highlight just under the upper
// contour, a shade band just above the lower one.
function shadeFor(cx, cy, rx, ry, base, hiRows, loRows) {
  return function(x, y, inside) {
    var above = y - hiRows >= 0 && !inside[y - hiRows][x]
    var below = y + loRows < H && !inside[y + loRows][x]
    if (above && x + 0.5 < cx + rx * 0.55) return "h"
    if (below) return "n"
    return base
  }
}

// ---------- tail ----------
// Thick polyline of discs. The base hugs the body's front, the tip swishes.
var tailBase = [[45.5, 27.6], [51, 27.9], [56.5, 27.7]]
var tailTips = [
  [[61.0, 27.2], [64.2, 26.2]],   // resting on the floor, tip curled
  [[61.0, 26.9], [64.0, 24.8]],
  [[60.8, 26.4], [63.4, 23.2]],
  [[60.6, 26.0], [61.8, 22.4]],   // tip up
  [[60.4, 25.9], [59.6, 22.6]]    // tip flicked back
]
var TAIL_R = 1.55

function tailSegs(frame) {
  var pts = tailBase.concat(tailTips[frame])
  var segs = []
  for (var i = 0; i + 1 < pts.length; i++) segs.push([pts[i], pts[i + 1]])
  return segs
}

// Distance along the tail (0 at the base) of the closest point, or -1.
function tailAt(segs, x, y) {
  var px = x + 0.5, py = y + 0.5, acc = 0, best = -1, bestD = 1e9
  for (var s = 0; s < segs.length; s++) {
    var a = segs[s][0], b = segs[s][1]
    var vx = b[0] - a[0], vy = b[1] - a[1], len = Math.sqrt(vx * vx + vy * vy)
    var t = Math.max(0, Math.min(1, ((px - a[0]) * vx + (py - a[1]) * vy) / (len * len)))
    var ex = a[0] + vx * t - px, ey = a[1] + vy * t - py, d = ex * ex + ey * ey
    if (d <= TAIL_R * TAIL_R && d < bestD) { bestD = d; best = acc + t * len }
    acc += len
  }
  return best
}

function tailLength(segs) {
  var acc = 0
  for (var s = 0; s < segs.length; s++) {
    var a = segs[s][0], b = segs[s][1]
    acc += Math.sqrt((b[0] - a[0]) * (b[0] - a[0]) + (b[1] - a[1]) * (b[1] - a[1]))
  }
  return acc
}

// ---------- frame ----------
function build(breath, tailFrame) {
  var g = grid()
  var lift = breath ? 1 : 0

  // Body loaf (top rises one cell while breathing in).
  var bcx = 36, bcy = 20.6 - lift / 2, brx = 19.4, bry = 11.6 + lift / 2
  var bodyShade = shadeFor(bcx, bcy, brx, bry, "b", 1, 2)
  layer(g, function(x, y) { return inEllipse(x, y, bcx, bcy, brx, bry) }, function(x, y, inside) {
    // Tabby stripes: short slanted bands hanging down from the back line.
    var top = bcy - bry * Math.sqrt(Math.max(0, 1 - Math.pow((x + 0.5 - bcx) / brx, 2)))
    var depth = y + 0.5 - top
    var stripes = [29, 35, 41, 47]
    for (var i = 0; i < stripes.length; i++) {
      var sx = stripes[i] + depth * 0.45
      if (depth > 1.2 && depth < 5.6 - i * 0.3 && Math.abs(x + 0.5 - sx) < 0.95) return "d"
    }
    // Haunch: a soft curve of shade marking the back leg.
    var hd = ell(x, y, 47, 25.5, 6.2, 4.4)
    if (hd > 0.78 && hd <= 1 && y < 27 && x > 42) return "n"
    return bodyShade(x, y, inside)
  }, FLOOR)

  // Tail wraps along the front: rings every few cells, darker tip.
  var segs = tailSegs(tailFrame)
  var tl = tailLength(segs)
  layer(g, function(x, y) { return tailAt(segs, x, y) >= 0 }, function(x, y) {
    var t = tailAt(segs, x, y)
    if (t > tl - 2.2) return "d"
    if (Math.floor(t) % 4 === 1) return "d"
    if (y + 0.5 < 27.0 && t < tl - 4) return "h"
    return "b"
  }, FLOOR + 1)

  // Ears (drawn before the head so the head's outline closes their bases).
  var earL = [[6.2, 5.6], [4.6, 13.4], [12.8, 12.6]]
  var earR = [[23.4, 5.6], [16.8, 12.6], [25.0, 13.4]]
  var pinkL = [[6.9, 8.4], [6.2, 12.6], [10.6, 12.2]]
  var pinkR = [[22.7, 8.4], [19.0, 12.2], [23.4, 12.6]]
  layer(g, function(x, y) { return inTriangle(x, y, earL[0], earL[1], earL[2]) || inTriangle(x, y, earR[0], earR[1], earR[2]) },
    function(x, y) {
      if (inTriangle(x, y, pinkL[0], pinkL[1], pinkL[2]) || inTriangle(x, y, pinkR[0], pinkR[1], pinkR[2])) return "p"
      return "b"
    }, FLOOR)

  // Head, resting low on the left.
  var hcx = 14.8, hcy = 18.0, hrx = 10.4, hry = 8.0
  var headShade = shadeFor(hcx, hcy, hrx, hry, "b", 1, 1)
  layer(g, function(x, y) { return inEllipse(x, y, hcx, hcy, hrx, hry) }, function(x, y, inside) {
    // Light muzzle and chin.
    if (inEllipse(x, y, 13.4, 22.3, 2.4, 1.6) || inEllipse(x, y, 16.4, 22.3, 2.4, 1.6)) return "h"
    return headShade(x, y, inside)
  }, FLOOR)

  // Cheek fluff: a notch of fur sticking out at each side of the face.
  put(g, 4, 21, "b"); put(g, 3, 21, "o"); put(g, 4, 22, "o")
  put(g, 25, 21, "b"); put(g, 26, 21, "o"); put(g, 25, 22, "o")

  // Front paws tucked under the chin: white socks with toe lines.
  layer(g, function(x, y) {
    return inEllipse(x, y, 10.6, 27.8, 3.7, 1.9) || inEllipse(x, y, 19.0, 27.8, 3.7, 1.9)
  }, "w", FLOOR)
  put(g, 14, 27, "o"); put(g, 14, 28, "o"); put(g, 15, 27, "o"); put(g, 15, 28, "o")
  putIf(g, 9, 28, "n", "w"); putIf(g, 11, 28, "n", "w"); putIf(g, 18, 28, "n", "w"); putIf(g, 20, 28, "n", "w")

  // Forehead tabby "M".
  var m = [[11, 12], [12, 11], [14, 11], [14, 12], [15, 11], [15, 12], [17, 11], [18, 12]]
  for (var i = 0; i < m.length; i++) putIf(g, m[i][0], m[i][1], "d", "bh")

  // Closed eyes (curved, with a little lash at the outer corner).
  var eyeL = [[8, 18], [9, 19], [10, 19], [11, 19], [12, 18], [7, 17]]
  var eyeR = [[17, 18], [18, 19], [19, 19], [20, 19], [21, 18], [22, 17]]
  for (var j = 0; j < eyeL.length; j++) { put(g, eyeL[j][0], eyeL[j][1], "e"); put(g, eyeR[j][0], eyeR[j][1], "e") }

  // Nose, mouth, blush, whiskers.
  put(g, 14, 21, "p"); put(g, 15, 21, "p"); put(g, 13, 21, "p"); put(g, 16, 21, "p")
  put(g, 14, 22, "p"); put(g, 15, 22, "p")
  // Mouth: a little "ω" under the nose.
  put(g, 12, 23, "e"); put(g, 13, 24, "e"); put(g, 14, 23, "e"); put(g, 15, 23, "e"); put(g, 16, 24, "e"); put(g, 17, 23, "e")
  put(g, 6, 21, "p"); put(g, 7, 21, "p"); put(g, 22, 21, "p"); put(g, 23, 21, "p")
  put(g, 9, 22, "l"); put(g, 8, 22, "l"); put(g, 7, 23, "l"); put(g, 6, 23, "l")
  put(g, 20, 22, "l"); put(g, 21, 22, "l"); put(g, 22, 23, "l"); put(g, 23, 23, "l")

  // Floor shadow under the whole loaf.
  for (var x = 3; x < W - 1; x++) if (g[FLOOR][x] === ".") g[FLOOR][x] = "s"
  for (var x2 = 7; x2 < W - 5; x2++) if (g[FLOOR + 1][x2] === ".") g[FLOOR + 1][x2] = "s"

  var rows = []
  for (var y = 0; y < H; y++) rows.push(g[y].join(""))
  return rows
}

// frames[breath][tail]
var frames = []
for (var b = 0; b < 2; b++) {
  var row = []
  for (var t = 0; t < tailTips.length; t++) row.push(build(b, t))
  frames.push(row)
}

// Slow swish with long rests: indices into tailTips, one step per tail tick.
var tailSequence = [0, 0, 0, 0, 0, 0, 1, 2, 3, 4, 3, 2, 1, 0, 0, 0, 0, 1, 2, 3, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0]

var cols = W
var rowsCount = H

var zed = [
  "oooo",
  "..o.",
  ".o..",
  "oooo"
]

var starDot = [
  "...",
  ".o.",
  "..."
]

var starSparkle = [
  ".o.",
  "ooo",
  ".o."
]

var moon = [
  "...oooo....",
  "..ooo......",
  ".ooo.......",
  "ooo........",
  "ooo........",
  "ooo........",
  "ooo........",
  "ooo........",
  ".ooo.......",
  "..ooo......",
  "...oooo...."
]
