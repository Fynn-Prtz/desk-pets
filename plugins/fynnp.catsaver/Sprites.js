.pragma library

// Sleeping cat for the screensaver, built once at load from simple shapes and
// kept as string rows (same format as the desk cards' sprites). Every frame
// is precomputed here; the QML side only swaps which rows array is shown.
//
// Palette keys: o outline, b body, d darker body (stripes / tail tip),
// p pink (inner ear, nose, blush), e closed eye, s floor shadow, . empty.
//
// Layers are painted back to front and each paints its own 1-cell outline,
// so overlapping parts (head over body, tail over body) stay separated.

var W = 49
var H = 23

function grid() {
  var g = []
  for (var y = 0; y < H; y++) {
    var r = []
    for (var x = 0; x < W; x++) r.push(".")
    g.push(r)
  }
  return g
}

function inEllipse(x, y, cx, cy, rx, ry) {
  var dx = (x + 0.5 - cx) / rx
  var dy = (y + 0.5 - cy) / ry
  return dx * dx + dy * dy <= 1
}

// mask(x, y) -> bool. Fill with `fill`, then ring it with outline cells
// (8-neighbourhood) that are not part of the mask. `floorY` clips everything
// at and below that row (the cat sits on the floor).
function layer(g, mask, fill, floorY) {
  var inside = []
  for (var y = 0; y < H; y++) {
    var r = []
    for (var x = 0; x < W; x++) r.push(y < floorY && mask(x, y))
    inside.push(r)
  }
  for (var y2 = 0; y2 < H; y2++) {
    for (var x2 = 0; x2 < W; x2++) {
      if (inside[y2][x2]) { g[y2][x2] = typeof fill === "function" ? fill(x2, y2) : fill; continue }
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
}

function put(g, x, y, c) { if (y >= 0 && y < H && x >= 0 && x < W) g[y][x] = c }

var FLOOR = 21

// Tail: thick polyline of discs. Base hugs the body's front, the tip swishes.
var tailBase = [[34, 20.3], [38, 20.4], [42, 20.2]]
var tailTips = [
  [[44.5, 19.9], [46.4, 19.2]],   // resting on the floor, tip curled
  [[44.5, 19.7], [46.4, 18.2]],
  [[44.4, 19.3], [46.0, 17.1]],
  [[44.2, 19.0], [45.0, 16.6]],   // tip up
  [[44.0, 18.9], [43.8, 16.6]]    // tip flicked back
]

function tailMask(frame) {
  var pts = tailBase.concat(tailTips[frame])
  var segs = []
  for (var i = 0; i + 1 < pts.length; i++) segs.push([pts[i], pts[i + 1]])
  return function(x, y) {
    var px = x + 0.5, py = y + 0.5
    for (var s = 0; s < segs.length; s++) {
      var a = segs[s][0], b = segs[s][1]
      var vx = b[0] - a[0], vy = b[1] - a[1]
      var t = ((px - a[0]) * vx + (py - a[1]) * vy) / (vx * vx + vy * vy)
      t = Math.max(0, Math.min(1, t))
      var ex = a[0] + vx * t - px, ey = a[1] + vy * t - py
      if (ex * ex + ey * ey <= 1.05) return true
    }
    return false
  }
}

function tailTipCells(frame) {
  var tip = tailTips[frame][1]
  return [Math.floor(tip[0]), Math.floor(tip[1])]
}

function build(breath, tailFrame) {
  var g = grid()
  // Body loaf: one row taller while breathing in (top rises by a pixel).
  var lift = breath ? 1 : 0
  layer(g, function(x, y) {
    return inEllipse(x, y, 26, 15 - lift / 2, 14, 8.5 + lift / 2)
  }, function(x, y) {
    // A few back stripes in the darker body tone.
    if ((x === 25 || x === 29 || x === 33) && y >= 8 - lift && y <= 9 - lift) return "d"
    if ((x === 26 || x === 30 || x === 34) && y === 10 - lift) return "d"
    return "b"
  }, FLOOR)

  // Tail wraps along the front.
  layer(g, tailMask(tailFrame), function(x, y) { return x % 4 === 0 ? "d" : "b" }, FLOOR + 1)
  var tip = tailTipCells(tailFrame)
  put(g, tip[0], tip[1], "d")

  // Ears (drawn first so the head's outline closes their bases).
  var ears = { 5: [5, 6], 6: [4, 7], 7: [4, 8], 8: [4, 9] }
  layer(g, function(x, y) {
    var span = ears[y]
    if (!span) return false
    return (x >= span[0] && x <= span[1]) || (20 - x >= span[0] && 20 - x <= span[1])
  }, function(x, y) {
    if ((x === 5 || x === 15) && (y === 6 || y === 7)) return "p"
    if ((x === 6 && y === 7) || (x === 14 && y === 7)) return "p"
    return "b"
  }, FLOOR)

  // Head, resting low on the left.
  layer(g, function(x, y) { return inEllipse(x, y, 10.5, 13.5, 7.6, 6.2) }, "b", FLOOR)

  // Front paws tucked under the chin.
  layer(g, function(x, y) {
    return inEllipse(x, y, 7.5, 19.8, 2.6, 1.6) || inEllipse(x, y, 13.5, 19.8, 2.6, 1.6)
  }, "b", FLOOR)
  // Re-draw the gap between the paws as outline.
  put(g, 10, 19, "o"); put(g, 10, 20, "o")

  // Face: closed eyes (‿ ‿), pink nose, blush.
  put(g, 6, 13, "e"); put(g, 7, 14, "e"); put(g, 8, 14, "e"); put(g, 9, 13, "e")
  put(g, 12, 13, "e"); put(g, 13, 14, "e"); put(g, 14, 14, "e"); put(g, 15, 13, "e")
  put(g, 10, 15, "p"); put(g, 11, 15, "p"); put(g, 10, 16, "p"); put(g, 11, 16, "p")
  put(g, 9, 16, "e"); put(g, 12, 16, "e"); put(g, 10, 17, "e"); put(g, 11, 17, "e")
  put(g, 5, 15, "p"); put(g, 16, 15, "p")

  // Floor shadow under the whole loaf.
  for (var x = 3; x < W - 1; x++) if (g[FLOOR][x] === "." || g[FLOOR][x] === "o") g[FLOOR][x] = g[FLOOR][x] === "o" ? "o" : "s"
  for (var x2 = 6; x2 < W - 4; x2++) if (g[FLOOR + 1][x2] === ".") g[FLOOR + 1][x2] = "s"

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
  "..oooo..",
  ".ooo....",
  "ooo.....",
  "ooo.....",
  "ooo.....",
  "ooo.....",
  ".ooo....",
  "..oooo.."
]
