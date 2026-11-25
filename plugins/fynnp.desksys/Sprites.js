.pragma library

// Desk System pet: a little CRT computer with a face on its lit screen, stubby
// legs, mitten arms and a power cable for a tail. Drawn at px 2 on the shared
// 44x38 pet canvas (docs/PETS.md). Built from simple shapes (rounded rects,
// discs, thick polylines) like the screensaver cat; every distinct pose is
// built once and memoised by its key, so the QML side only swaps arrays.
//
// Palette keys (PetColors): o outline, b body, h highlight, n shade, d dark,
// w light (mittens, feet), l lightest (gloss), p blush, e ink, s dark screen,
// g lit screen, f face on the screen, r urgent, k soft urgent, t shadow.
// Extra key: L = power LED (bound to accent / urgent in QML).
//
// scene(state) turns the pet's state (mood, clock, reaction, …) into the body
// frame + its offset + up to six effect sprites. The QML pet and the preview
// script both call it, so the preview is exactly what the card shows.

var W = 44
var H = 36            // body grid; the floor shadow is its own sprite below
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
// Faces are drawn in screen coordinates: cx = the screen's centre column,
// base = its bottom fill row. "E" ink (e on the lit screen, d when it is
// dark), "X" eye glint, "P" blush.

var EYES = {
  // 4 x 5, dark ink with a white glint (E ink, X glint, G glass)
  open:    [".EE.", "EXEE", "EEEE", "EEEE", ".EE."],
  half:    ["....", "EEEE", "EXEE", ".EE.", "...."],
  blink:   ["....", "....", "....", "EEEE", "...."],
  sleep:   ["....", "....", "E..E", ".EE.", "...."],
  happy:   ["....", ".EE.", "E..E", "....", "...."],
  squintL: ["E...", ".EE.", "...E", ".EE.", "E..."],    // >  (mirrored: <)
  strainL: ["EE..", ".EEE", "...E", ".EEE", "EE.."],
  wide:    [".EE.", "E..E", "E..E", "E..E", ".EE."],
  worry:   ["....", ".EE.", "EXEE", "EEEE", ".EE."],
  angryL:  ["E...", "EE..", "EXE.", "EEEE", ".EE."],
  tired:   ["....", "....", "EEEE", "EXEE", ".EE."],
  dizzy:   [".EEE.", "E...E", "E.E.E", "E...E", ".EEE."],
  dizzyB:  [".EEE.", "E.E.E", "E...E", "E...E", ".EEE."],
  xx:      ["E..E", ".EE.", ".EE.", "E..E", "...."]
}

// Brows sit two rows above the eye block (left brow; mirrored for the right).
var BROWS = {
  angry:  ["EE..", "..EE"],
  worry:  ["..EE", "EE.."],
  strain: ["EEE.", "...E"]
}

var MOUTHS = {
  none:   [],
  smile:  ["E..E", ".EE."],
  grin:   ["E....E", ".EEEE."],
  omega:  ["E.EE.E", ".E..E."],
  flat:   ["EEEE"],
  o:      [".EE.", "E..E", ".EE."],
  yawn:   [".EEEE.", "E....E", "E....E", ".EEEE."],
  grit:   ["EEEEEEEE", "EXEXXEXE", "EEEEEEEE"],
  wobble: [".E..E.", "E.EE.E"],
  pout:   [".EE.", "E..E"],
  tongue: ["EEEEEE", ".E..E.", "..PP.."],
  pant:   [".EEEE.", "E....E", ".EPPE."],
  giggle: ["EEEEEE", ".E..E.", "..EE.."],
  tiny:   ["EE"]
}

// ink: E (e on a lit screen, d on a dark one), X glint, P blush.
function drawFace(g, cx, base, top, face, ink) {
  var map = { "E": ink, "X": ink === "e" ? "x" : ink, "P": "p" }
  var eyes = face.eyes, lx = face.lookX || 0, ly = face.lookY || 0
  var eyeTop = base - 10 + ly
  if (eyeTop < top) eyeTop = top
  var e = EYES[eyes] || EYES.open, eR = e
  if (/L$/.test(eyes)) eR = mirrorRows(e)
  var lxp = cx - 4 - e[0].length + lx, rxp = cx + 4 + lx
  stamp(g, lxp, eyeTop, e, map)
  stamp(g, rxp, eyeTop, eR, map)
  if (face.brows && BROWS[face.brows]) {
    var b = BROWS[face.brows]
    stamp(g, lxp, eyeTop - 2, b, map)
    stamp(g, rxp, eyeTop - 2, mirrorRows(b), map)
  }
  if (face.blush) {
    stamp(g, cx - 10, base - 4, ["PPP"], map)
    stamp(g, cx + 7, base - 4, ["PPP"], map)
  }
  var m = MOUTHS[face.mouth] || []
  if (m.length) stamp(g, cx - Math.floor(m[0].length / 2) + (face.mouthX || 0), base - 4, m, map)
}

// Whole-screen pictures (they replace the face). Centred on the screen.
var SCREENS = {
  bang: [
    "EE",
    "EE",
    "EE",
    "EE",
    "EE",
    "..",
    "EE"
  ],
  pad: [
    ".nnnnnnnnnnnnnn.",
    "nnnEnnnnnnnnpnnn",
    "nnEEEnnnnnnpnpnn",
    "nnnEnnnnnnnnpnnn",
    "nnnnnnEEEEnnnnnn",
    ".nnnnn....nnnnn.",
    ".nnnn......nnnn."
  ]
}

// 3x5 digits for the "100%" overload screen.
var GLYPHS = {
  "1": [".E.", "EE.", ".E.", ".E.", "EEE"],
  "0": ["EEE", "E.E", "E.E", "E.E", "EEE"],
  "%": ["E..E", "...E", "..E.", ".E..", "E..E"]
}

// Loading ring: 8 spots of 2x2 around a 10x10 circle; head + fading tail.
var RING = [[4, 0], [7, 1], [8, 4], [7, 7], [4, 8], [1, 7], [0, 4], [1, 1]]

function drawScreenArt(g, sx0, sy0, sx1, sy1, art, frame, ink) {
  var cx = Math.floor((sx0 + sx1 + 1) / 2), cy = Math.floor((sy0 + sy1 + 1) / 2)
  var map = { "E": ink }
  if (art === "spin") {
    var tail = [ink, ink, "d", "n"]
    for (var j = 0; j < 8; j++) stamp(g, cx - 5 + RING[j][0], cy - 5 + RING[j][1], ["EE", "EE"], { "E": "b" })
    for (var i = 3; i >= 0; i--) {
      var p = RING[(frame - i + 16) % 8]
      stamp(g, cx - 5 + p[0], cy - 5 + p[1], ["EE", "EE"], { "E": tail[i] })
    }
    return
  }
  if (art === "100") {
    var txt = ["1", "0", "0", "%"], x = cx - 8, y = cy - 3
    for (var k = 0; k < txt.length; k++) {
      var gl = GLYPHS[txt[k]]
      for (var r = 0; r < gl.length; r++) {
        // glitch: some rows slip sideways
        var slip = frame % 3 === 1 && (r === 1 || r === 3) ? (r === 1 ? 1 : -1) : 0
        stamp(g, x + slip, y + r, [gl[r]], map)
      }
      x += gl[0].length + 1
    }
    if (frame % 3 !== 0) for (var n = sx0 + 1 + frame; n < sx1; n += 4) { put(g, n, cy + 4 - frame, "w"); put(g, n + 1, cy + 4 - frame, "w") }
    return
  }
  if (art === "saver") {
    // tiny screensaver: a star drifting across the dark screen, with a trail
    var path = [[3, 9], [5, 7], [7, 5], [9, 3], [11, 2], [13, 3], [15, 5], [17, 7], [17, 9], [15, 10], [12, 9], [8, 9]]
    var q2 = path[(frame + path.length - 1) % path.length]
    put(g, sx0 + q2[0], sy0 + q2[1], "d")
    var q = path[frame % path.length]
    stamp(g, sx0 + q[0] - 1, sy0 + q[1] - 1, [".E.", "EhE", ".E."], { "E": "w" })
    return
  }
  var pic = SCREENS[art]
  if (!pic) return
  stamp(g, cx - Math.floor(pic[0].length / 2), cy - Math.ceil(pic.length / 2), pic, map)
}

// ---------------------------------------------------------------- body
//
// opts (all strings / small ints, they form the memo key):
//   face: { eyes, mouth, brows, blush, lookX, lookY }  or art: name + artFrame
//   lit (screen on), tint ("" | "k" red screen), led ("L"/"r"/"k"/"d")
//   lift   monitor raised by n cells (breathing / stretching), legs grow
//   squash 0..2 (pressed flat), arms pose, legs pose, cable pose, lean -1/0/1
//   kb     keyboard in front (typing) with pressed key frame, bar progress 0..1

var ARM_POSES = {
  // [left hand, right hand]; shoulders are fixed on the monitor's sides
  rest:   [[3.5, 27.0], [36.5, 27.0]],
  out:    [[0.8, 22.5], [39.2, 22.5]],
  up:     [[2.0, 12.0], [38.0, 12.0]],
  high:   [[4.5, 5.5], [35.5, 5.5]],
  pumpA:  [[1.5, 13.5], [37.5, 25.0]],
  pumpB:  [[2.5, 25.0], [38.5, 13.5]],
  typeA:  [[14.5, 28.5], [25.5, 29.5]],
  typeB:  [[14.5, 29.5], [25.5, 28.5]],
  fanA:   [[3.5, 27.0], [37.5, 11.5]],
  fanB:   [[3.5, 27.0], [39.5, 16.5]],
  flailA: [[1.0, 9.5], [39.5, 16.5]],
  flailB: [[0.5, 16.5], [39.0, 9.5]],
  danceA: [[1.5, 11.5], [37.5, 26.0]],
  danceB: [[2.5, 26.0], [38.5, 11.5]],
  hips:   [[4.5, 25.0], [35.5, 25.0]],
  cover:  [[11.5, 20.5], [28.5, 20.5]]
}

function build(o) {
  var g = grid()
  var sq = o.squash || 0, lift = o.lift || 0
  // Monitor box (fill cells). Pressed flat: lower top, wider sides.
  var mx0 = 6 - sq, mx1 = 33 + sq
  var my1 = 26 - lift + (sq > 0 ? 2 : 0)
  var my0 = 8 - lift + (sq > 0 ? sq * 2 + 3 : 0)
  // Legs + feet
  var footY = 33
  var legs = o.legs || "stand"
  var lf = [[12.5, footY], [27.5, footY]]
  if (legs === "wide") lf = [[10.5, footY], [29.5, footY]]
  if (legs === "stompL") lf = [[12.5, footY - 2], [27.5, footY]]
  if (legs === "stompR") lf = [[12.5, footY], [27.5, footY - 2]]
  if (legs === "dangleA") lf = [[11.5, footY + 1], [28.5, footY + 1]]
  if (legs === "dangleB") lf = [[13.5, footY + 1], [26.5, footY + 1]]
  var dangle = legs.indexOf("dangle") === 0
  function inFoot(x, y, i) {
    var fx = lf[i][0], fy = lf[i][1]
    return dangle ? inEllipse(x, y, fx, fy - 0.5, 2.0, 2.1) : inEllipse(x, y, fx + (i === 0 ? -0.7 : 0.7), fy, 3.1, 1.7)
  }
  layer(g, function(x, y) {
    for (var i = 0; i < 2; i++) {
      var fx = lf[i][0], fy = lf[i][1]
      if (x + 0.5 > fx - 1.6 && x + 0.5 < fx + 1.6 && y >= my1 - 1 && y + 0.5 < fy) return true
      if (inFoot(x, y, i)) return true
    }
    return false
  }, function(x, y, inside) {
    if (inFoot(x, y, 0) || inFoot(x, y, 1)) {
      if (!IN(inside, x, y - 1)) return "h"
      return !IN(inside, x, y + 1) ? "n" : "b"
    }
    return y <= my1 + 1 ? "d" : "n"
  })

  // Power cable tail (behind everything else): a 1-cell wire with a plug.
  var cable = o.cable || "rest", wire, plug
  var cy0 = my1 - 3
  if (cable === "swingA") { wire = [[33, cy0], [35, 27], [35, 31], [34, 34]]; plug = [33, 33] }
  else if (cable === "swingB") { wire = [[33, cy0], [36, 26], [39, 29], [40, 32]]; plug = [40, 31] }
  else { wire = [[33, cy0], [36, 25], [38, 28], [38, 31], [40, 33]]; plug = [40, 32] }
  for (var y = 0; y < H; y++)
    for (var x = 0; x < W; x++)
      if (g[y][x] === "." && segDist(wire, x, y) < 0.55) g[y][x] = "o"
  stamp(g, plug[0], plug[1], ["oo", "oo"])
  stamp(g, plug[0] + 2, plug[1], ["o", "."])

  // Arms: thick polylines from the shoulder to a round mitten.
  var pose = ARM_POSES[o.arms] || ARM_POSES.rest
  var sh = [[mx0 + 1.5, 21.5 - lift], [mx1 - 0.5, 21.5 - lift]]
  var arms = [[sh[0], pose[0]], [sh[1], pose[1]]]
  if (sq > 0) arms = [[sh[0], [mx0 - 3.5, 25.5]], [sh[1], [mx1 + 4.5, 25.5]]]
  function inHand(x, y) {
    for (var i = 0; i < 2; i++) if (inDisc(x, y, arms[i][1][0], arms[i][1][1], 1.8)) return true
    return false
  }
  var behind = o.arms !== "cover"
  function armLayer() {
    layer(g, function(x, y) {
      for (var i = 0; i < 2; i++) if (segDist(arms[i], x, y) < 1.05) return true
      return inHand(x, y)
    }, function(x, y) {
      if (inHand(x, y)) return inHand(x, y - 1) ? (inHand(x, y + 1) ? "b" : "n") : "h"
      return "n"
    })
  }
  if (behind) armLayer()

  // CRT back hump peeking over the top, with vent slits.
  layer(g, function(x, y) { return inRRect(x, y, mx0 + 5, my0 - 3, mx1 - 5, my0 + 2, 2.5) }, function(x, y, inside) {
    if (!IN(inside, x, y - 1)) return "d"
    return (y === my0 - 2 && x % 3 === 0) ? "e" : "n"
  })

  // Monitor
  var R = 4
  layer(g, function(x, y) { return inRRect(x, y, mx0, my0, mx1, my1, R) }, function(x, y, inside) {
    if (!IN(inside, x, y - 1)) return "h"
    if (y >= my1 - 1 || !IN(inside, x, y + 2)) return "n"
    if (!IN(inside, x + 1, y)) return "n"
    return "b"
  })
  // gloss on the top-left corner
  putIf(g, mx0 + 2, my0 + 1, "l", "bh"); putIf(g, mx0 + 3, my0 + 1, "l", "bh"); putIf(g, mx0 + 1, my0 + 2, "l", "bh")

  // Screen recess and glass. Lit: pale glass with a darker rim (CRT bulge).
  var sx0 = mx0 + 4, sx1 = mx1 - 4, sy0 = my0 + 3, sy1 = my1 - 4
  if (sq > 0) sy0 = my0 + 2
  var lit = !!o.lit
  var glass = lit ? (o.tint || "w") : "s"
  var rim = lit ? (o.tint ? "r" : "h") : "s"
  for (var yy = sy0 - 1; yy <= sy1 + 1; yy++)
    for (var xx = sx0 - 1; xx <= sx1 + 1; xx++) {
      if (!inRRect(xx, yy, sx0 - 1, sy0 - 1, sx1 + 1, sy1 + 1, 3.5)) continue
      if (inRRect(xx, yy, sx0, sy0, sx1, sy1, 3)) {
        var edge = !inRRect(xx - 1, yy, sx0, sy0, sx1, sy1, 3) || !inRRect(xx + 1, yy, sx0, sy0, sx1, sy1, 3)
          || !inRRect(xx, yy - 1, sx0, sy0, sx1, sy1, 3) || !inRRect(xx, yy + 1, sx0, sy0, sx1, sy1, 3)
        g[yy][xx] = edge ? rim : glass
        continue
      }
      g[yy][xx] = (yy >= sy1 + 1) ? "n" : "e"
    }
  if (o.tint) glass = o.tint
  // glare in the top-left of the glass
  if (lit && !o.tint) { put(g, sx0 + 2, sy0 + 1, "l"); put(g, sx0 + 3, sy0 + 1, "l"); put(g, sx0 + 1, sy0 + 2, "l"); put(g, sx0 + 1, sy0 + 3, "l") }

  // Chin: vent slits + power LED
  var chin = my1 - 2
  for (var v = 0; v < 3; v++) put(g, mx0 + 3 + v * 2, chin, "d")
  put(g, mx1 - 4, chin, o.led || "L"); put(g, mx1 - 3, chin, o.led || "L")

  // Face or picture
  var ink = lit ? "e" : "d"
  var cxScreen = Math.floor((sx0 + sx1 + 1) / 2)
  if (o.art) drawScreenArt(g, sx0, sy0, sx1, sy1, o.art, o.artFrame || 0, ink)
  if (o.face) drawFace(g, cxScreen, sy1, sy0 + 1, o.face, ink)
  if (o.bar >= 0) {
    // progress bar along the bottom of the screen
    var bx0 = sx0 + 4, bx1 = sx1 - 4, n = Math.round((bx1 - bx0 + 1) * o.bar)
    for (var bx = bx0; bx <= bx1; bx++) put(g, bx, sy1 - 1, bx - bx0 < n ? "b" : "h")
  }

  if (!behind) armLayer()

  // Keyboard in front of the feet (typing), keys pressed alternately.
  if (o.kb) {
    var ky = 29
    layer(g, function(x, y) { return inRRect(x, y, 11, ky, 28, ky + 2, 1) }, function(x, y) {
      if (y === ky + 2) return "n"
      if (y === ky) return "h"
      return x % 2 === 0 ? ((x / 2 + (o.kb === "A" ? 0 : 1)) % 3 === 0 ? "b" : "l") : "d"
    })
    // mittens on top of the keys
    layer(g, inHand, function(x, y) { return inHand(x, y - 1) ? "b" : "h" })
  }

  // Lean (dangling while dragged): shear rows, bottom swings most.
  if (o.lean) {
    for (var y5 = 0; y5 < H; y5++) {
      var s = o.lean * Math.floor(Math.max(0, y5 - 8) / 9)
      if (!s) continue
      var row = g[y5], out = []
      for (var x5 = 0; x5 < W; x5++) {
        var src = x5 - s
        out.push(src >= 0 && src < W ? row[src] : ".")
      }
      g[y5] = out
    }
  }

  var rows = []
  for (var y6 = 0; y6 < H; y6++) rows.push(g[y6].join(""))
  return rows
}

var cache = {}
var cacheSize = 0
function frame(o) {
  var f = o.face || {}
  var key = [o.lit ? 1 : 0, o.tint || "", o.led || "", o.lift || 0, o.squash || 0, o.arms || "", o.legs || "",
    o.cable || "", o.lean || 0, o.kb || "", o.art || "", o.artFrame || 0, o.bar === undefined ? -1 : o.bar,
    o.scan || 0, o.face ? [f.eyes, f.mouth, f.brows || "", f.blush ? 1 : 0, f.lookX || 0, f.lookY || 0, f.mouthX || 0].join(",") : ""].join("|")
  var hit = cache[key]
  if (hit) return hit
  if (cacheSize > 500) { cache = {}; cacheSize = 0 }
  var rows = build(o)
  cache[key] = rows
  cacheSize++
  return rows
}

// Floor shadow, narrower while the pet is in the air.
var shadow = [
  [".........tttttttttttttttttttttt.........", "............tttttttttttttttt............"],
  ["...........tttttttttttttttttt...........", "..............tttttttttttt.............."],
  ["..............tttttttttttt..............", "........................................"]
]

// ---------------------------------------------------------------- scene
//
// st: { mood, t (clock s), wall (s), blink, fidget, fidgetT, reaction, reactT,
//       hovered, lookX, lookY, dragged, lean, landT (-1 = none),
//       grooving, beat (groove beat), screenKey ("" | "bang" | "pad") }
// returns { rows, x, y (cells, body offset), shadow, fx: [{ rows, x, y, c, op }] }

var FX = null    // PetFx, handed in by the caller (QML imports it, the preview loads it)
var effortR = null, dustR = null
function init(fx) {
  if (FX === fx) return
  FX = fx
  effortR = mirrorRows(fx.effort)
  dustR = mirrorRows(fx.dust[1])
}

function scene(st, fx0) {
  if (fx0) init(fx0)
  var t = st.t, tick = Math.floor(t * 4), mood = st.mood
  var stressed = mood === "load" || mood === "maxed" || mood === "hot"
  var o = { lit: true, led: "L", arms: "rest", legs: "stand", cable: "rest" }
  var face = { eyes: "open", mouth: "smile", lookX: st.lookX || 0, lookY: st.lookY || 0 }
  var dx = 0, dy = 0, fx = []
  var sleepy = mood === "idle" && !st.hovered && !st.grooving && !st.screenKey && !st.reaction && !st.dragged && st.landT < 0

  // ---- mood ladder ----
  if (sleepy) {
    o.lit = false
    o.lift = Math.floor(st.wall) % 3 === 0 ? 1 : 0
    o.led = Math.floor(st.wall / 2) % 2 === 0 ? "L" : "d"
    face = { eyes: "sleep", mouth: "tiny" }
    for (var z = 0; z < 2; z++) {
      var ph = ((st.wall * 0.35 + z * 0.5) % 1 + 1) % 1
      if (ph < 0.85) fx.push({ rows: z === 0 ? FX.zed : FX.zedSmall, x: 34 + Math.round(Math.sin(ph * 6.28)) - z * 3, y: 11 - Math.round(ph * 10), c: "o", op: 0.7 })
    }
  } else if (mood === "idle" || mood === "chill") {
    face.eyes = st.blink ? "blink" : "open"
    if (mood === "idle" && !st.hovered) face.eyes = st.blink ? "blink" : "half"
    var fd = st.fidget, ft = st.fidgetT
    if (fd === "look") {
      face.lookX = ft < 0.9 ? -1 : ft < 1.9 ? 1 : 0
      face.lookY = ft > 1.9 && ft < 2.5 ? -1 : 0
      face.mouth = "flat"
    } else if (fd === "stretch") {
      var up = ft > 0.3 && ft < 2.2
      o.arms = up ? "high" : "up"
      o.lift = up ? 1 : 0
      face.eyes = up ? "happy" : "open"
      face.mouth = up ? "o" : "smile"
    } else if (fd === "yawn") {
      face.eyes = ft < 2.2 ? "sleep" : "blink"
      face.mouth = ft < 0.4 ? "o" : ft < 2.0 ? "yawn" : "smile"
      o.arms = ft > 0.4 && ft < 2.0 ? "up" : "rest"
      if (ft > 0.5 && ft < 2.0) o.lift = 1
    } else if (fd === "blip") {
      face = null
      o.art = ft < 2.8 ? "saver" : null
      o.lit = ft >= 2.8
      o.artFrame = tick % 12
      if (ft >= 2.8) face = { eyes: "blink", mouth: "smile" }
    } else if (fd === "wiggle") {
      dx = (tick % 4 < 2) ? -1 : 1
      face.eyes = "happy"; face.mouth = "omega"
      o.arms = tick % 4 < 2 ? "danceA" : "danceB"
    } else if (fd === "beep") {
      face.eyes = "happy"; face.mouth = "o"
      if (ft < 1.6) fx.push({ rows: FX.note, x: 33 + (tick % 2), y: 8 - Math.min(5, Math.floor(ft * 4)), c: "o", op: 1 })
    }
    if (st.hovered && !fd) face.mouth = "grin"
  } else if (mood === "work") {
    o.arms = tick % 2 === 0 ? "typeA" : "typeB"
    o.kb = tick % 2 === 0 ? "A" : "B"
    dy = Math.floor(t * 2) % 2 === 0 ? 0 : 1
    face = { eyes: st.blink ? "blink" : "open", mouth: "tiny", lookY: 1, lookX: st.lookX || 0 }
    var prog = (t % 4) / 4
    o.bar = Math.floor(prog * 8) / 8
    if (prog > 0.875) { face.eyes = "happy"; face.mouth = "smile" }
  } else if (mood === "load") {
    o.arms = tick % 2 === 0 ? "pumpA" : "pumpB"
    o.legs = tick % 2 === 0 ? "stompL" : "stompR"
    o.led = "k"
    dx = tick % 2 === 0 ? -1 : 1
    face = { eyes: "strainL", brows: "strain", mouth: "grit" }
    sweatDrops(fx, t, 2)
    if (tick % 4 < 2) { fx.push({ rows: FX.effort, x: 0, y: 12, c: "o", op: 1 }); fx.push({ rows: effortR, x: 40, y: 12, c: "o", op: 1 }) }
    // fan puffs from the side vent
    var pf = tick % 6
    if (pf < 3) fx.push({ rows: FX.puff[pf], x: 1 - pf, y: 22 - pf * 2, c: "w", op: 0.8 })
  } else if (mood === "maxed") {
    o.led = tick % 2 === 0 ? "r" : "k"
    var cyc = t % 6
    dx = [0, -1, 0, 1][tick % 4]
    o.arms = tick % 2 === 0 ? "flailA" : "flailB"
    o.legs = tick % 2 === 0 ? "stompL" : "stompR"
    if (cyc < 2.5) { face = null; o.art = "spin"; o.artFrame = tick % 8 }
    else if (cyc < 3.75) { face = null; o.art = "100"; o.artFrame = tick % 3; o.tint = "k" }
    else {
      face = { eyes: tick % 2 === 0 ? "dizzy" : "dizzyB", mouth: "wobble" }
      fx.push({ rows: FX.spiral[tick % 2], x: 33, y: 2, c: "o", op: 1 })
    }
    sweatDrops(fx, t, 3)
    if (tick % 3 === 0) fx.push({ rows: FX.bolt, x: 1, y: 4, c: "r", op: 1 })
    if (tick % 4 < 2) fx.push({ rows: effortR, x: 40, y: 14, c: "o", op: 1 })
  } else if (mood === "hot") {
    o.led = tick % 2 === 0 ? "r" : "k"
    o.arms = tick % 2 === 0 ? "fanA" : "fanB"
    face = { eyes: "tired", mouth: tick % 2 === 0 ? "pant" : "tongue", blush: true, brows: "worry" }
    dx = tick % 4 === 0 ? -1 : 0
    fx.push({ rows: FX.flame[tick % 2], x: 30, y: 0, c: "r", op: 1 })
    fx.push({ rows: FX.flame[(tick + 1) % 2], x: 10, y: 1, c: "k", op: 1 })
    var sp = tick % 6
    if (sp < 3) fx.push({ rows: FX.puff[sp], x: 19 - sp, y: 3 - sp, c: "o", op: 0.35 })
    sweatDrops(fx, t, 1)
  }

  // ---- neighbours ----
  if (st.grooving && !stressed && !st.reaction) {
    var gb = st.beat
    face = { eyes: "happy", mouth: gb % 2 === 0 ? "grin" : "omega" }
    o.arms = gb % 2 === 0 ? "danceA" : "danceB"
    o.lit = true; o.art = null; o.kb = null; o.bar = undefined; o.lift = 0
    dy = gb % 2 === 0 ? -1 : 0
    dx = Math.floor(gb / 2) % 2 === 0 ? 0 : 0
    for (var nn = 0; nn < 2; nn++) {
      var np = ((t * 0.7 + nn * 0.5) % 1 + 1) % 1
      if (np < 0.8) fx.push({ rows: nn === 0 ? FX.note : FX.noteDouble, x: 34 - nn * 4 + Math.round(Math.sin(np * 6.28)), y: 12 - Math.round(np * 11), c: "o", op: 1 })
    }
  }
  if (st.screenKey && !st.reaction && !st.dragged) {
    face = null
    o.lit = true
    o.art = st.screenKey
    if (st.screenKey === "bang") { o.arms = "up"; dy = tick % 2 === 0 ? -1 : 0 }
  }

  // ---- reactions (override) ----
  var landing = st.landT >= 0
  if (st.dragged) {
    o.lit = true; o.art = null; o.kb = null; o.bar = undefined; o.lift = 0
    o.legs = tick % 2 === 0 ? "dangleA" : "dangleB"
    o.arms = tick % 2 === 0 ? "flailA" : "flailB"
    o.cable = tick % 2 === 0 ? "swingA" : "swingB"
    o.lean = st.lean || 0
    face = { eyes: "wide", mouth: "wobble", brows: "worry" }
    dy = -2
    fx = []
    if (tick % 4 < 3) fx.push({ rows: FX.bang, x: 38, y: 1, c: "r", op: 1 })
    sweatDrops(fx, t, 1)
  } else if (landing) {
    var lt = st.landT
    o.lit = true; o.art = null; o.kb = null; o.bar = undefined; o.lift = 0
    fx = []
    if (lt < 0.3) {
      o.squash = 2; o.legs = "wide"
      face = { eyes: "squintL", mouth: "o" }
      fx.push({ rows: FX.dust[0], x: 2, y: 31, c: "o", op: 0.6 })
      fx.push({ rows: FX.dust[1], x: 36, y: 31, c: "o", op: 0.6 })
    } else if (lt < 0.5) {
      dy = -1
      face = { eyes: "wide", mouth: "o" }
      fx.push({ rows: FX.dust[1], x: 0, y: 30, c: "o", op: 0.35 })
      fx.push({ rows: dustR, x: 38, y: 30, c: "o", op: 0.35 })
    } else {
      face = { eyes: Math.floor(lt * 4) % 2 === 0 ? "dizzy" : "dizzyB", mouth: "wobble" }
      dx = Math.floor(lt * 4) % 2 === 0 ? -1 : 1
      fx.push({ rows: FX.spiral[Math.floor(lt * 4) % 2], x: 33, y: 2, c: "o", op: 1 })
    }
  } else if (st.reaction === "squish") {
    o.lit = true; o.art = null; o.kb = null; o.bar = undefined; o.lift = 0
    o.squash = 2; o.legs = "wide"
    face = { eyes: "happy", mouth: tick % 2 === 0 ? "giggle" : "grin", blush: true }
    dx = tick % 2 === 0 ? 0 : 1
    fx = stressed ? keepSweat(t) : []
    if (tick % 4 < 2) fx.push({ rows: FX.sparkle[tick % 2], x: 37, y: 9, c: "o", op: 1 })
  } else if (st.reaction === "pet") {
    var rt = st.reactT
    o.lit = true; o.art = null; o.kb = null; o.bar = undefined
    o.arms = "hips"; o.lift = 0
    face = stressed ? { eyes: "strainL", mouth: "grin", blush: true } : { eyes: "squintL", mouth: "omega", blush: true }
    dy = rt < 0.25 ? -1 : 0
    dx = 0
    fx = stressed ? keepSweat(t) : []
    var hp = Math.min(1, rt / 1.6)
    fx.push({ rows: FX.heart, x: 36 + (Math.floor(rt * 4) % 2), y: 10 - Math.round(hp * 9), c: "r", op: hp < 0.9 ? 1 : 0.5 })
    if (rt > 0.5) {
      var hp2 = Math.min(1, (rt - 0.5) / 1.3)
      fx.push({ rows: FX.heartSmall, x: 30 - (Math.floor(rt * 4) % 2), y: 10 - Math.round(hp2 * 8), c: "r", op: hp2 < 0.9 ? 1 : 0.5 })
    }
    if (rt < 1.0) fx.push({ rows: FX.note, x: 0, y: 8 - Math.floor(rt * 4), c: "o", op: 1 })
  } else if (st.reaction === "annoyed") {
    o.lit = true; o.art = null; o.kb = null; o.bar = undefined; o.lift = 0
    o.tint = "k"
    face = { eyes: "angryL", brows: "angry", mouth: "pout" }
    o.legs = tick % 2 === 0 ? "stompL" : "stompR"
    o.arms = "hips"
    dy = 0
    dx = tick % 2 === 0 ? -1 : 0
    fx = stressed ? keepSweat(t) : []
    fx.push({ rows: FX.anger, x: 35, y: tick % 2 === 0 ? 2 : 3, c: "r", op: 1 })
    if (tick % 3 === 0) fx.push({ rows: FX.puff[0], x: 1, y: 6, c: "o", op: 0.5 })
  } else if (st.hovered && !stressed && !st.grooving && !st.screenKey && mood !== "work") {
    if (face) { face.lookX = st.lookX; face.lookY = st.lookY; if (!st.blink && face.eyes === "half") face.eyes = "open" }
  }

  if (face) {
    if (face.lookX === undefined) face.lookX = 0
    if (face.lookY === undefined) face.lookY = 0
    if (st.hovered && face.eyes === "open" && !st.reaction) { face.lookX = st.lookX; face.lookY = st.lookY }
  }
  o.face = face
  if (fx.length > FX_SLOTS) fx = fx.slice(0, FX_SLOTS)
  var air = Math.max(0, -dy)
  return { rows: frame(o), x: dx, y: dy, shadow: shadow[Math.min(2, air)], fx: fx }
}

function sweatDrops(fx, t, n) {
  for (var i = 0; i < n; i++) {
    var p = ((t * 1.1 + i / n) % 1 + 1) % 1
    var side = i % 2 === 0
    if (p < 0.85) fx.push({ rows: FX.sweat, x: side ? 35 : 3, y: 8 + Math.round(p * 9) + i, c: "l", op: 1 })
  }
}

function keepSweat(t) { var fx = []; sweatDrops(fx, t, 1); return fx }
