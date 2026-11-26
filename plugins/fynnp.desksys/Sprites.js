.pragma library

// Desk System pet: a little penguin working at a tiny CRT on a desk. Drawn at
// px 2 on the shared 44x38 pet canvas (docs/PETS.md). The penguin stands on
// the left (3/4 view, facing the desk), the desk with a beige CRT, keyboard
// and a mug sits on the right. Built from simple shapes (ellipses, discs,
// rounded rects, tapered polylines) like the screensaver cat; every distinct
// pose is built once and memoised by its key, so the QML side only swaps
// arrays.
//
// Palette keys (PetColors): o outline, b body (penguin back), h highlight,
// n shade, d dark (desk), w light (face mask, belly, CRT casing), l lightest,
// p blush / mug, e ink, x glint, s dark screen, g lit screen, r urgent,
// k soft urgent (beak, feet), t shadow.
// Extra key: L = power LED (bound to accent in QML).
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

// Distance from the cell centre to a polyline (array of [x, y]); also returns
// how far along the line (0..1) the closest point is, in segT.
var segT = 0
function segDist(pts, x, y) {
  var px = x + 0.5, py = y + 0.5, best = 1e9, total = 0, acc = 0, bestAt = 0
  for (var i = 0; i + 1 < pts.length; i++) total += Math.sqrt(Math.pow(pts[i + 1][0] - pts[i][0], 2) + Math.pow(pts[i + 1][1] - pts[i][1], 2))
  for (var j = 0; j + 1 < pts.length; j++) {
    var a = pts[j], b = pts[j + 1]
    var vx = b[0] - a[0], vy = b[1] - a[1], l2 = vx * vx + vy * vy
    var t = l2 > 0 ? Math.max(0, Math.min(1, ((px - a[0]) * vx + (py - a[1]) * vy) / l2)) : 0
    var ex = a[0] + vx * t - px, ey = a[1] + vy * t - py
    var d = ex * ex + ey * ey
    if (d < best) { best = d; bestAt = acc + Math.sqrt(l2) * t }
    acc += Math.sqrt(l2)
  }
  segT = total > 0 ? bestAt / total : 0
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

// Top-lit fill for a round part: h along the top edge, n along the bottom
// and the right side, b inside.
function shade(x, y, inside) {
  if (!IN(inside, x, y - 1)) return "b"
  if (!IN(inside, x, y - 2)) return "n"
  return "d"
}

// ---------------------------------------------------------------- face
//
// Eyes 4 x 5 (E ink, X glint), stamped on the light face mask.

var EYES = {
  open:    [".EE.", "EXEE", "EEEE", "EEEE", ".EE."],
  half:    ["....", "EEEE", "EXEE", ".EE.", "...."],
  blink:   ["....", "....", "....", "EEEE", "...."],
  sleep:   ["....", "....", "E..E", ".EE.", "...."],
  happy:   ["....", ".EE.", "E..E", "....", "...."],
  squintL: ["E...", ".EE.", "...E", ".EE.", "E..."],    // >  (mirrored: <)
  strainL: ["EE..", ".EEE", "...E", ".EEE", "EE.."],
  wide:    [".EE.", "E..E", "E..E", "E..E", ".EE."],
  worry:   ["....", ".EE.", "EXEE", "EEEE", ".EE."],
  angryL:  ["....", "EE..", "EXE.", "EEEE", ".EE."],
  tired:   ["....", "....", "EEEE", "EXEE", ".EE."],
  droop:   ["....", "....", "EEEE", "EEXE", "EEE."],
  dizzy:   [".EEE.", "E...E", "E.E.E", "E...E", ".EEE."],
  dizzyB:  [".EEE.", "E.E.E", "E...E", "E...E", ".EEE."],
  focus:   ["....", "EEEE", "EEXE", "EEEE", ".EE."]
}

// Brows sit two rows above the eye block (left brow; mirrored for the right).
var BROWS = {
  angry:  ["EE..", "..EE"],
  worry:  ["..EE", "EE.."],
  strain: ["EEE.", "...E"],
  focus:  ["....", "EEEE"]
}

// Beaks (K beak, E ink, P tongue), centred under the eyes.
var BEAKS = {
  tiny:   ["KKK", ".K."],
  smile:  ["KKK", "EKE", ".E."],
  open:   ["KKK", "EEE", ".K."],
  grin:   ["KKKKK", "EPPPE", ".KKK."],
  omega:  ["KKK", "EKE", "E.E"],
  yawn:   [".KKK.", "EEEEE", "EEPEE", ".KKK."],
  grit:   ["KKKKK", "XEXEX", "KKKKK"],
  wobble: ["KKK", ".K.", "E.E.E", ".E.E."],
  pout:   [".K.", "KKK", "KKK"],
  tongue: ["KKK", "EEE", ".P."],
  pant:   ["KKK", "EPE", "EPE", ".K."],
  sip:    ["KKK", ".K."]
}

// cx = face centre column, top = eye row.
function drawFace(g, cx, top, face) {
  var map = { "E": "e", "X": "x", "P": "p", "K": "k" }
  var eyes = face.eyes, lx = face.lookX || 0, ly = face.lookY || 0
  var e = EYES[eyes] || EYES.open, eR = e
  if (/L$/.test(eyes)) eR = mirrorRows(e)
  var et = top + ly
  var lxp = cx - 2 - e[0].length + lx, rxp = cx + 2 + lx
  stamp(g, lxp, et, e, map)
  stamp(g, rxp, et, eR, map)
  if (face.brows && BROWS[face.brows]) {
    var b = BROWS[face.brows]
    stamp(g, lxp, et - 2, b, map)
    stamp(g, rxp, et - 2, mirrorRows(b), map)
  }
  if (face.blush !== false) {
    stamp(g, lxp - 2, top + 5, ["PP"], map)
    stamp(g, rxp + e[0].length, top + 5, ["PP"], map)
  }
  var m = BEAKS[face.mouth] || BEAKS.tiny
  stamp(g, cx - Math.floor(m[0].length / 2) + (face.lookX > 0 ? 1 : 0), top + 5, m, map)
}

// ---------------------------------------------------------------- screen
//
// The CRT glass is x 29..38, y 9..18. Lit glass "g", text in "b"/"h"/"l".

var SX0 = 29, SX1 = 38, SY0 = 9, SY1 = 18

// "Code" lines: start column offset + length, cycled while scrolling.
var CODE = [[0, 5], [2, 4], [2, 6], [4, 3], [2, 5], [0, 3], [0, 6], [2, 3], [4, 4], [2, 2], [0, 4], [2, 5]]

var PICS = {
  bang: ["EE", "EE", "EE", "EE", "..", "EE"],
  pad: [
    ".nnnnnnnn.",
    "nnEnnnnpnn",
    "nEEEnnpnpn",
    "nnEnnnnpnn",
    ".nnn..nnn."
  ],
  heart: [".rr.rr.", "rlrrrrr", "rrrrrrr", ".rrrrr.", "..rrr..", "...r..."],
  therm: [".EE.", ".ll.", ".ll.", ".rr.", ".rr.", "rrrr", "rrrr", ".rr."],
  zz: ["EEE", ".E.", "EEE"]
}

// 3x5 digits for the "100%" overload screen.
var GLYPHS = {
  "1": [".E.", "EE.", ".E.", ".E.", "EEE"],
  "0": ["EEE", "E.E", "E.E", "E.E", "EEE"]
}

// Loading ring: 8 spots of 2x2 around a 10x10 circle; head + fading tail.
var RING = [[4, 0], [7, 1], [8, 4], [7, 7], [4, 8], [1, 7], [0, 4], [1, 1]]

function drawScreen(g, o) {
  var scr = o.scr || "off"
  var cx = 34, cy = 14
  if (scr === "off") return
  if (scr === "code" || scr === "bar") {
    var lines = scr === "bar" ? 3 : 4
    for (var i = 0; i < lines; i++) {
      var c = CODE[(i + (o.scroll || 0)) % CODE.length]
      for (var k = 0; k < c[1]; k++) put(g, SX0 + 1 + c[0] + k, SY0 + 1 + i * 2, i === lines - 1 && o.scroll === undefined ? "h" : (k === 0 ? "h" : "b"))
    }
    if (scr === "code" && o.cursor) { put(g, SX0 + 1 + 6, SY0 + 7, "l"); put(g, SX0 + 2 + 6, SY0 + 7, "l") }
    if (scr === "bar") {
      // progress bar along the bottom
      var n = Math.round(8 * (o.bar || 0))
      for (var bx = 0; bx < 8; bx++) {
        put(g, SX0 + 1 + bx, SY1 - 2, bx < n ? "l" : "d")
        put(g, SX0 + 1 + bx, SY1 - 1, bx < n ? "h" : "d")
      }
    }
    return
  }
  if (scr === "spin") {
    var tail = ["l", "h", "b", "n"]
    for (var j = 0; j < 8; j++) stamp(g, cx - 5 + RING[j][0], cy - 5 + RING[j][1], ["EE", "EE"], { "E": "d" })
    for (var q = 3; q >= 0; q--) {
      var p = RING[((o.frame || 0) - q + 16) % 8]
      stamp(g, cx - 5 + p[0], cy - 5 + p[1], ["EE", "EE"], { "E": tail[q] })
    }
    return
  }
  if (scr === "100") {
    var txt = ["1", "0", "0"], x = SX0 + 1, y = cy - 3, f = o.frame || 0
    for (var t = 0; t < 3; t++) {
      var gl = GLYPHS[txt[t]]
      for (var r = 0; r < gl.length; r++) {
        var slip = f % 3 === 1 && (r === 1 || r === 3) ? (r === 1 ? 1 : -1) : 0
        stamp(g, x + slip, y + r, [gl[r]], { "E": "l" })
      }
      x += 3
    }
    if (f % 3 !== 0) for (var n2 = SX0 + f; n2 <= SX1; n2 += 3) put(g, n2, cy + 4 - f, "w")
    return
  }
  if (scr === "eq") {
    // equaliser bars bouncing on the beat
    var hts = [[3, 6, 4, 7, 2], [6, 3, 7, 4, 5]][(o.frame || 0) % 2]
    for (var e = 0; e < 5; e++)
      for (var hh = 0; hh < hts[e]; hh++) { put(g, SX0 + 1 + e * 2, SY1 - 1 - hh, hh > 4 ? "l" : "h") }
    return
  }
  var pic = PICS[scr]
  if (!pic) return
  stamp(g, cx - Math.floor(pic[0].length / 2), cy - Math.ceil(pic.length / 2), pic, { "E": "l" })
}

// ---------------------------------------------------------------- desk
//
// Desk (x 19..42, top at y 24), beige CRT (x 26..41, y 6..21) with the glass
// in the middle, a little keyboard in front of it and a mug on the left.

function drawDesk(g, o) {
  // legs
  layer(g, function(x, y) { return y >= 26 && y <= 33 && (x === 21 || x === 22 || x === 39 || x === 40) }, function(x) { return x === 21 || x === 39 ? "n" : "d" })
  // top
  layer(g, function(x, y) { return inRRect(x, y, 19, 24, 42, 26, 0.8) }, function(x, y) { return y === 24 ? "n" : "d" })
  // CRT back hump with vent slits, then the casing
  var shake = o.crtShake || 0
  layer(g, function(x, y) { return inRRect(x, y, 30 + shake, 4, 37 + shake, 8, 1.8) }, function(x, y, inside) {
    if (!IN(inside, x, y - 1)) return "w"
    return (y === 5 && x % 2 === 0) ? "n" : "h"
  })
  layer(g, function(x, y) { return inRRect(x, y, 26 + shake, 6, 41 + shake, 21, 2.6) || inRRect(x, y, 31 + shake, 21, 36 + shake, 23, 0.6) }, function(x, y, inside) {
    if (y >= 22) return y === 23 ? "n" : "h"
    if (!IN(inside, x, y - 1)) return "l"
    if (!IN(inside, x, y + 1) || y === 21) return "h"
    if (!IN(inside, x + 1, y)) return "h"
    return "w"
  })
  // glass: dark bezel ring, glass inside
  var lit = (o.scr || "off") !== "off"
  var tint = o.tint || ""
  for (var y = SY0 - 1; y <= SY1 + 1; y++)
    for (var x = SX0 - 1; x <= SX1 + 1; x++) {
      if (!inRRect(x, y, SX0 - 1, SY0 - 1, SX1 + 1, SY1 + 1, 2.4)) continue
      var xs = x + shake
      if (!inRRect(x, y, SX0, SY0, SX1, SY1, 1.8)) { put(g, xs, y, "e"); continue }
      put(g, xs, y, !lit ? "s" : (tint || "g"))
    }
  if (shake) {
    // draw the screen content into a scratch grid and shift it
    var tmp = grid()
    drawScreen(tmp, o)
    for (var y2 = SY0; y2 <= SY1; y2++) for (var x2 = SX0; x2 <= SX1; x2++) if (tmp[y2][x2] !== ".") put(g, x2 + shake, y2, tmp[y2][x2])
  } else drawScreen(g, o)
  // glare on the glass
  if (lit && !tint) { putIf(g, SX0 + shake, SY0 + 1, "h", "g"); putIf(g, SX0 + 1 + shake, SY0, "h", "g") }
  // chin: vents + power LED
  for (var v = 0; v < 3; v++) put(g, 28 + v * 2 + shake, 20, "h")
  put(g, 38 + shake, 20, o.led || "L"); put(g, 39 + shake, 20, o.led || "L")

  // keyboard in front of the CRT (keys flash while typing)
  layer(g, function(x, y) { return inRRect(x, y, 25, 22, 36, 23, 0.6) }, function(x, y) {
    if (y === 23) return "n"
    if (x % 2 === 0) return "d"
    var k = (x - 25) >> 1
    return o.key !== undefined && o.key >= 0 && (k === o.key || k === (o.key + 3) % 6) ? "l" : "h"
  })
  // mug (unless the penguin holds it)
  if (o.mug !== "held") drawMug(g, 20, 20)
}

function drawMug(g, x0, y0) {
  layer(g, function(x, y) { return inRRect(x, y, x0, y0, x0 + 3, y0 + 3, 0.6) || (x === x0 + 4 && y >= y0 + 1 && y <= y0 + 2) }, function(x, y) {
    if (x === x0 + 4) return "o"
    if (y === y0) return x === x0 ? "l" : "e"     // rim + coffee
    return x === x0 + 3 ? "k" : (x === x0 && y === y0 + 1 ? "l" : "p")
  })
}

// ---------------------------------------------------------------- penguin
//
// opts (all strings / small ints, they form the memo key):
//   face: { eyes, mouth, brows, blush, lookX, lookY }
//   lift (breathing / stretching), squash 0..2, melt 0..3 (hot), doze (head on
//   the keyboard), arms pose, legs pose, lean -1/0/1, px/py (penguin offset)

var FLIPPERS = {
  // [left tip, right tip]; shoulders sit on the body's sides
  rest:   [[2.5, 28.5], [18.5, 28.5]],
  out:    [[-0.5, 23.5], [21.5, 23.5]],
  up:     [[0.5, 15.5], [20.5, 15.5]],
  high:   [[2.5, 12.0], [18.5, 12.0]],
  typeA:  [[2.5, 28.0], [24.5, 21.5]],
  typeB:  [[2.5, 28.0], [26.5, 22.5]],
  rushA:  [[-0.5, 17.5], [25.5, 21.0]],
  rushB:  [[1.5, 29.0], [28.0, 22.5]],
  sip:    [[2.5, 28.0], [15.5, 20.5]],
  reach:  [[2.5, 28.0], [21.5, 21.5]],
  fanA:   [[2.5, 28.5], [22.5, 12.0]],
  fanB:   [[2.5, 28.5], [23.0, 17.0]],
  flailA: [[-0.5, 15.5], [21.5, 27.5]],
  flailB: [[1.0, 28.0], [21.0, 15.0]],
  danceA: [[0.5, 16.0], [19.5, 28.0]],
  danceB: [[2.0, 28.0], [20.5, 16.0]],
  hips:   [[3.0, 26.0], [18.0, 26.0]],
  droop:  [[1.5, 31.5], [19.5, 31.5]],
  doze:   [[3.5, 29.0], [24.5, 23.0]]
}

function buildPenguin(o) {
  var g = grid()
  var sq = o.squash || 0, lift = o.lift || 0, melt = o.melt || 0
  var cx = 10.5
  var hcy = 12.5 - lift + sq * 2 + melt * 2 + (o.doze ? 4 : 0)
  var hrx = 9.6 + sq * 0.7 + melt * 0.3, hry = 8.4 - sq * 0.8 - melt * 0.3
  var bcy = 27.0 + sq * 1.0 + melt * 1.2, brx = 7.8 + sq * 1.2 + melt * 1.3, bry = 6.6 - sq * 1.0 - melt * 1.1

  // puddle (melting) under everything
  if (melt > 0) {
    var prx = 9.5 + melt * 1.5
    layer(g, function(x, y) { return y >= 33 && inEllipse(x, y, cx + 1, 34.2, prx, 1.5) }, function(x, y, inside) {
      if (!IN(inside, x, y - 1)) return (x % 5 === 1) ? "l" : "h"
      return "b"
    })
  }

  // feet
  var legs = o.legs || "stand"
  var fy = 33.5
  var feet = [[7.0, fy], [14.5, fy]]
  if (legs === "stompL") feet = [[7.0, fy - 1.5], [14.5, fy]]
  if (legs === "stompR") feet = [[7.0, fy], [14.5, fy - 1.5]]
  if (legs === "dangleA") feet = [[6.5, fy + 0.5], [14.0, fy + 1.5]]
  if (legs === "dangleB") feet = [[7.5, fy + 1.5], [15.0, fy + 0.5]]
  if (legs === "wide") feet = [[4.5, fy], [17.0, fy]]
  if (melt < 3) layer(g, function(x, y) {
    return inEllipse(x, y, feet[0][0] - 0.6, feet[0][1], 2.6, 1.3) || inEllipse(x, y, feet[1][0] + 0.6, feet[1][1], 2.6, 1.3)
  }, function(x, y, inside) { return !IN(inside, x, y - 1) ? "k" : "k" })

  // flippers behind the body (only the far one when it hangs)
  var pose = FLIPPERS[o.arms] || FLIPPERS.rest
  var shY = bcy - 4.5
  var sh = [[cx - brx + 3.5, shY], [cx + brx - 3.0, shY]]
  if (sq > 1) pose = [[sh[0][0] - 5.5, shY + 3.0], [sh[1][0] + 5.5, shY + 3.0]]
  var arms = [[sh[0], pose[0]], [sh[1], pose[1]]]
  function inFlip(i, x, y) {
    var d = segDist(arms[i], x, y)
    return d < 1.9 - segT * 0.9
  }
  function flipMask(which) {
    return function(x, y) { return (which[0] && inFlip(0, x, y)) || (which[1] && inFlip(1, x, y)) }
  }
  // a flipper is in front when it reaches over the belly or the desk
  var front = [pose[0][0] > sh[0][0] + 1, !o.doze && (pose[1][0] < sh[1][0] - 1 || pose[1][0] > 20)]
  layer(g, flipMask([!front[0], !front[1]]), shade)

  // body: dark back, light belly
  layer(g, function(x, y) { return inEllipse(x, y, cx, bcy, brx, bry) }, function(x, y, inside) {
    if (inEllipse(x, y, cx + 1.2, bcy + 0.8, brx * 0.62, bry * 0.8)) return !IN(inside, x, y + 1) ? "h" : (inEllipse(x, y, cx + 2.0, bcy - 1.0, brx * 0.25, bry * 0.3) ? "l" : "w")
    return shade(x, y, inside)
  })
  // head: dark cap with a light heart-shaped face mask
  var bodyCx = cx
  if (o.doze) cx += 3
  var fcx = cx + 1
  var ey = Math.round(hcy) - 1
  function mask2(x, y) { return inDisc(x, y, fcx - 3.3, ey + 2.6, 3.3) || inDisc(x, y, fcx + 3.3, ey + 2.6, 3.3) || inEllipse(x, y, fcx, ey + 5.4, 5.4, 2.4) }
  layer(g, function(x, y) {
    if (inEllipse(x, y, cx, hcy, hrx, hry)) return true
    // tuft
    return o.tuft !== false && (inDisc(x, y, cx + 1.0, hcy - hry + 0.1, 1.0) || inDisc(x, y, cx + 2.0, hcy - hry - 0.5, 0.7))
  }, function(x, y, inside) {
    var mask = mask2(x, y)
    if (mask && inEllipse(x, y, cx, hcy, hrx - 0.6, hry - 0.4)) return !IN(inside, x, y + 1) ? "h" : (!mask2(x, y - 1) ? "l" : "w")
    return shade(x, y, inside)
  })
  // gloss on the cap
  var ht = Math.ceil(hcy - hry)
  putIf(g, Math.floor(cx - 4), ht + 2, "h", "bn"); putIf(g, Math.floor(cx - 3), ht + 1, "h", "bn"); putIf(g, Math.floor(cx - 5), ht + 3, "b", "n")

  if (o.face) drawFace(g, Math.floor(fcx), ey, o.face)

  // flippers in front
  layer(g, flipMask(front), shade)
  if (o.mug === "held") stamp(g, Math.floor(fcx) + 2, ey + 5, ["elle.", "eppke", "eppke", ".eee."])

  if (o.lean) {
    for (var y5 = 0; y5 < H; y5++) {
      var s2 = o.lean * Math.floor(Math.max(0, y5 - 8) / 9)
      if (!s2) continue
      var row2 = g[y5], out2 = []
      for (var x5 = 0; x5 < W; x5++) { var src2 = x5 - s2; out2.push(src2 >= 0 && src2 < W ? row2[src2] : ".") }
      g[y5] = out2
    }
  }
  return g
}

// ---------------------------------------------------------------- break sign
// break-buddy: a little picket sign with a steaming mug, held up in front of
// the CRT by the right flipper (o.sign 1 = held, 2 = raised a cell while the
// penguin waves it). Drawn after the desk and before the penguin, so the
// flipper grips the stick and the board covers the top of the screen.
var SIGN = [
  ".eeeeeeeeeee.",
  "ellllllllllle",
  "eppppwpwppppe",
  "epppwpwpppppe",
  "eppeeeeeepppe",
  "eppelwwweeepe",
  "eppelwwwepepe",
  "eppelwwweeepe",
  "epppeeeeppppe",
  "ekkkkkkkkkkke",
  ".eeeeeeeeeee."
]
FLIPPERS.sign = [[2.5, 28.5], [22.5, 15.5]]
FLIPPERS.signUp = [[2.5, 28.5], [22.5, 14.5]]
function drawSign(g, o) {
  var bx = 20, by = o.sign === 2 ? 0 : 1
  for (var y = by + SIGN.length; y < by + SIGN.length + 5; y++) { put(g, 22, y, "w"); put(g, 23, y, "n") }
  stamp(g, bx, by, SIGN)
}

function build(o) {
  var g = grid()
  drawDesk(g, o)
  if (o.sign) drawSign(g, o)
  var p = buildPenguin(o)

  var ox = o.px || 0, oy = o.py || 0
  for (var y = 0; y < H; y++)
    for (var x = 0; x < W; x++) {
      var c = p[y][x]
      if (c !== ".") put(g, x + ox, y + oy, c)
    }
  var rows = []
  for (var y6 = 0; y6 < H; y6++) rows.push(g[y6].join(""))
  return rows
}

var cache = {}
var cacheSize = 0
function frame(o) {
  var f = o.face || {}
  var key = [o.scr || "", o.scroll === undefined ? "" : o.scroll, o.cursor ? 1 : 0, o.bar === undefined ? "" : o.bar, o.frame || 0,
    o.tint || "", o.led || "", o.key === undefined ? "" : o.key, o.mug || "", o.crtShake || 0,
    o.lift || 0, o.squash || 0, o.melt || 0, o.doze ? 1 : 0, o.arms || "", o.legs || "", o.lean || 0, o.px || 0, o.py || 0,
    o.face ? [f.eyes, f.mouth, f.brows || "", f.blush === false ? 0 : 1, f.lookX || 0, f.lookY || 0].join(",") : ""].join("|")
  if (o.sign) key += "|sign" + o.sign
  var hit = cache[key]
  if (hit) return hit
  if (cacheSize > 500) { cache = {}; cacheSize = 0 }
  var rows = build(o)
  cache[key] = rows
  cacheSize++
  return rows
}

// Floor shadow (40 wide, drawn at x 2): penguin + desk legs; the penguin part
// shrinks while it is in the air.
var shadow = [
  "..ttttttttttttttt....tttt..............ttt",
  "....ttttttttttt......tttt..............ttt",
  "......ttttttt........tttt..............ttt"
]
for (var si = 0; si < shadow.length; si++) shadow[si] = [shadow[si].slice(0, 40)]

// ---------------------------------------------------------------- scene
//
// st: { mood, t (clock s), wall (s), blink, fidget, fidgetT, reaction, reactT,
//       hovered, lookX, lookY, dragged, lean, landT (-1 = none),
//       grooving, beat (groove beat), screenKey ("" | "bang" | "pad") }
// returns { rows, x, y (cells, body offset), shadow, fx: [{ rows, x, y, c, op }] }

var FX = null    // PetFx, handed in by the caller (QML imports it, the preview loads it)
var effortR = null, dustR = null
var PAPER = [
  ["oooo", "o..o", "oooo", "oooo"],
  [".oo.", "oooo", "o.oo", ".oo."],
  ["ooo.", "o.oo", "oooo", ".ooo"]
]
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
  var o = { scr: "code", cursor: true, led: "L", arms: "rest", legs: "stand" }
  var face = { eyes: "open", mouth: "tiny", lookX: st.lookX || 0, lookY: st.lookY || 0 }
  var dx = 0, py = 0, fx = []
  var sleepy = mood === "idle" && !st.hovered && !st.grooving && !st.screenKey && !st.reaction && !st.dragged && st.landT < 0

  // ---- mood ladder ----
  if (sleepy) {
    // dozing with its head on the keyboard, screen off, breathing
    o.scr = "off"; o.cursor = false
    o.doze = true; o.arms = "doze"
    o.lift = Math.floor(st.wall) % 3 === 0 ? 1 : 0
    o.led = Math.floor(st.wall / 2) % 2 === 0 ? "L" : "d"
    face = { eyes: "sleep", mouth: o.lift ? "tiny" : "open", lookX: 0, lookY: 0 }
    for (var z = 0; z < 2; z++) {
      var ph = ((st.wall * 0.35 + z * 0.5) % 1 + 1) % 1
      if (ph < 0.85) fx.push({ rows: z === 0 ? FX.zed : FX.zedSmall, x: 18 + Math.round(Math.sin(ph * 6.28)) - z * 3, y: 7 - Math.round(ph * 7), c: "o", op: 0.7 })
    }
  } else if (mood === "idle" || mood === "chill") {
    face.eyes = st.blink ? "blink" : "open"
    if (mood === "idle") { o.scr = "off"; o.cursor = false; if (!st.hovered) face.eyes = st.blink ? "blink" : "half" }
    var fd = st.fidget, ft = st.fidgetT
    if (fd === "sip") {
      // reach for the mug, sip (eyes closed), put it back
      if (ft < 0.5 || ft > 2.6) o.arms = "reach"
      else { o.arms = "sip"; o.mug = "held"; face.eyes = ft > 0.8 ? "happy" : "open"; face.mouth = "sip" }
      if (ft > 2.2 && ft < 2.6) { face.eyes = "happy"; face.mouth = "smile" }
      if (ft > 0.9 && ft < 2.3) fx.push({ rows: FX.puff[Math.floor(ft * 2) % 3], x: 13, y: 9 - Math.floor((ft - 0.9) * 3), c: "w", op: 0.5 })
    } else if (fd === "look") {
      face.lookX = ft < 0.9 ? -1 : ft < 1.9 ? 1 : 0
      face.lookY = ft > 1.9 && ft < 2.5 ? -1 : 0
      face.mouth = "tiny"
    } else if (fd === "stretch") {
      var up = ft > 0.3 && ft < 2.2
      o.arms = up ? "high" : "up"
      o.lift = up ? 1 : 0
      face.eyes = up ? "happy" : "open"
      face.mouth = up ? "open" : "tiny"
    } else if (fd === "yawn") {
      face.eyes = ft < 2.2 ? "sleep" : "blink"
      face.mouth = ft < 0.4 ? "open" : ft < 2.0 ? "yawn" : "smile"
      o.arms = ft > 0.4 && ft < 2.0 ? "out" : "rest"
      if (ft > 0.5 && ft < 2.0) o.lift = 1
    } else if (fd === "wiggle") {
      // happy waddle
      dx = 0
      o.px = (tick % 4 < 2) ? -1 : 1
      o.legs = tick % 2 === 0 ? "stompL" : "stompR"
      face.eyes = "happy"; face.mouth = "omega"
      o.arms = tick % 4 < 2 ? "out" : "rest"
    } else if (fd === "type") {
      // a few idle keystrokes
      o.arms = tick % 2 === 0 ? "typeA" : "typeB"
      o.key = tick % 6
      face.lookX = 1; face.mouth = "tiny"
    }
    if (st.hovered && !fd) face.mouth = "smile"
  } else if (mood === "work") {
    o.arms = tick % 2 === 0 ? "typeA" : "typeB"
    o.key = tick % 6
    o.scr = "bar"; o.cursor = false
    o.scroll = Math.floor(t * 2) % CODE.length
    var prog = (t % 4) / 4
    o.bar = Math.floor(prog * 8) / 8
    py = Math.floor(t * 2) % 2 === 0 ? 0 : 1
    face = { eyes: st.blink ? "blink" : "focus", mouth: "tiny", lookX: 1, lookY: 0 }
    if (prog > 0.875) { face.eyes = "happy"; face.mouth = "smile" }
  } else if (mood === "load") {
    // STRUGGLE: frantic typing, the free flipper flapping, stomping
    o.arms = tick % 2 === 0 ? "rushA" : "rushB"
    o.legs = tick % 2 === 0 ? "stompL" : "stompR"
    o.key = (tick * 2) % 6
    o.scr = "bar"; o.cursor = false
    o.scroll = (tick * 3) % CODE.length
    o.bar = Math.floor(((t % 8) / 8) * 8) / 8
    o.led = "k"
    o.px = tick % 2 === 0 ? 0 : 1
    o.crtShake = tick % 4 === 1 ? 1 : 0
    face = { eyes: "strainL", brows: "strain", mouth: "grit", lookX: 0, lookY: 0 }
    sweatDrops(fx, t, 2)
    if (tick % 4 < 2) fx.push({ rows: effortR, x: 20, y: 6, c: "o", op: 1 })
    // the CRT's fan puffs from its back
    var pf = tick % 6
    if (pf < 3) fx.push({ rows: FX.puff[pf], x: 38 + pf, y: 2 - Math.min(2, pf), c: "w", op: 0.8 })
    pf = (tick + 3) % 6
    if (pf < 3) fx.push({ rows: FX.puff[pf], x: 27 - pf, y: 2 - Math.min(2, pf), c: "w", op: 0.6 })
  } else if (mood === "maxed") {
    // overwhelmed: dizzy, loading ring / 100 glitch, papers flying
    o.led = tick % 2 === 0 ? "r" : "k"
    var cyc = t % 6
    o.arms = tick % 2 === 0 ? "flailA" : "flailB"
    o.legs = tick % 2 === 0 ? "stompL" : "stompR"
    o.px = [0, -1, 0, 1][tick % 4]
    o.crtShake = tick % 2
    if (cyc < 3.5) { o.scr = "spin"; o.frame = tick % 8 }
    else { o.scr = "100"; o.frame = tick % 3; o.tint = "k" }
    face = { eyes: tick % 2 === 0 ? "dizzy" : "dizzyB", mouth: "wobble", lookX: 0, lookY: 0 }
    fx.push({ rows: FX.spiral[tick % 2], x: 17, y: 0, c: "o", op: 1 })
    sweatDrops(fx, t, 1)
    for (var pp = 0; pp < 3; pp++) {
      var pa = ((t * 0.45 + pp / 3) % 1 + 1) % 1
      fx.push({ rows: PAPER[(tick + pp) % 3], x: 22 + pp * 6 + Math.round(Math.sin((pa + pp) * 9) * 2), y: 22 - Math.round(pa * 22), c: "l", op: pa < 0.85 ? 1 : 0.5 })
    }
  } else if (mood === "hot") {
    // the penguin MELTS: sinks into a growing puddle, fans itself, steams
    var mc = t % 10
    o.melt = mc < 2 ? 1 : mc < 5 ? 2 : mc < 8 ? 3 : 2
    var shiver = mc >= 8
    o.led = tick % 2 === 0 ? "r" : "k"
    o.arms = o.melt >= 3 ? (tick % 2 === 0 ? "droop" : "fanB") : (tick % 2 === 0 ? "fanA" : "fanB")
    o.scr = "therm"; o.tint = "k"
    face = { eyes: o.melt >= 3 ? "droop" : "tired", brows: "worry", mouth: tick % 2 === 0 ? "pant" : "tongue", lookX: 0, lookY: 0 }
    if (shiver) { o.px = tick % 2 === 0 ? -1 : 1; face.eyes = "wide"; face.mouth = "open" }
    var sp = tick % 6
    if (sp < 3) fx.push({ rows: FX.puff[sp], x: 4 - sp, y: Math.max(0, o.melt * 2 - 1 - sp * 2), c: "w", op: 0.5 })
    sp = (tick + 3) % 6
    if (sp < 3) fx.push({ rows: FX.puff[sp], x: 13 + sp, y: Math.max(0, o.melt * 2 - 2 - sp * 2), c: "w", op: 0.4 })
    sweatDrops(fx, t, 2)
  }

  // ---- neighbours ----
  if (st.grooving && !stressed && !st.reaction) {
    var gb = st.beat
    face = { eyes: "happy", mouth: gb % 2 === 0 ? "grin" : "omega", lookX: 0, lookY: 0 }
    o.arms = gb % 2 === 0 ? "danceA" : "danceB"
    o.legs = gb % 2 === 0 ? "stompL" : "stompR"
    o.scr = "eq"; o.frame = gb % 2; o.doze = false; o.lift = 0; o.key = undefined
    py = gb % 2 === 0 ? -1 : 0
    for (var nn = 0; nn < 2; nn++) {
      var np = ((t * 0.7 + nn * 0.5) % 1 + 1) % 1
      if (np < 0.8) fx.push({ rows: nn === 0 ? FX.note : FX.noteDouble, x: 18 + nn * 4 + Math.round(Math.sin(np * 6.28)), y: 10 - Math.round(np * 10), c: "o", op: 1 })
    }
  }
  if (st.screenKey && !st.reaction && !st.dragged) {
    o.scr = st.screenKey; o.tint = ""
    o.doze = false
    face.lookX = 1
    if (st.screenKey === "bang") { face.eyes = "wide"; face.mouth = "open"; o.arms = "up"; py = tick % 2 === 0 ? -1 : 0 }
  }

  // ---- break-buddy: holds up a "take a break" sign (st.breakSign) ----
  // Not while struggling (the load matters more) or while a neighbour moment
  // plays; touch reactions below override it. st.signWave (motion full) waves
  // the sign once a second, otherwise it is held still.
  if (st.breakSign && !stressed && !(st.grooving && !st.reaction) && !st.screenKey) {
    var wave = st.signWave && Math.floor(t * 2) % 2 === 0
    o.sign = wave ? 2 : 1
    o.arms = wave ? "signUp" : "sign"
    o.doze = false; o.lift = 0; o.key = undefined; o.mug = ""; o.px = 0; o.legs = "stand"
    if (o.scr === "off") { o.scr = "code"; o.cursor = true }
    face = { eyes: st.blink ? "blink" : wave ? "happy" : "open", mouth: "smile", lookX: 0, lookY: 0 }
    py = 0
    fx = []
  }

  // ---- reactions (override) ----
  var landing = st.landT >= 0
  var calm = { doze: false, melt: 0, lift: 0, mug: "", px: 0 }
  if (st.dragged) {
    reset(o, calm)
    o.legs = tick % 2 === 0 ? "dangleA" : "dangleB"
    o.arms = tick % 2 === 0 ? "flailA" : "flailB"
    o.lean = st.lean || 0
    if (o.scr === "off") o.scr = "code"
    face = { eyes: "wide", mouth: "wobble", brows: "worry", lookX: 0, lookY: 0 }
    py = -3
    fx = []
    if (tick % 4 < 3) fx.push({ rows: FX.bang, x: 20, y: 0, c: "r", op: 1 })
    sweatDrops(fx, t, 1)
  } else if (landing) {
    var lt = st.landT
    reset(o, calm)
    fx = []
    if (lt < 0.3) {
      o.squash = 2; o.legs = "wide"
      face = { eyes: "squintL", mouth: "open" }
      fx.push({ rows: FX.dust[0], x: 0, y: 31, c: "o", op: 0.6 })
      fx.push({ rows: FX.dust[1], x: 18, y: 31, c: "o", op: 0.6 })
    } else if (lt < 0.5) {
      py = -1
      face = { eyes: "wide", mouth: "open" }
      fx.push({ rows: FX.dust[1], x: 0, y: 30, c: "o", op: 0.35 })
      fx.push({ rows: dustR, x: 19, y: 30, c: "o", op: 0.35 })
    } else {
      face = { eyes: Math.floor(lt * 4) % 2 === 0 ? "dizzy" : "dizzyB", mouth: "wobble" }
      o.px = Math.floor(lt * 4) % 2 === 0 ? -1 : 1
      fx.push({ rows: FX.spiral[Math.floor(lt * 4) % 2], x: 17, y: 0, c: "o", op: 1 })
    }
  } else if (st.reaction === "squish") {
    reset(o, calm)
    o.squash = 2; o.legs = "wide"; o.arms = "rest"
    face = { eyes: "happy", mouth: tick % 2 === 0 ? "grin" : "omega" }
    o.px = tick % 2 === 0 ? 0 : 1
    fx = stressed ? keepSweat(t) : []
    if (tick % 4 < 2) fx.push({ rows: FX.sparkle[tick % 2], x: 19, y: 10, c: "o", op: 1 })
  } else if (st.reaction === "pet") {
    var rt = st.reactT
    reset(o, calm)
    o.arms = rt < 0.75 ? "up" : "hips"
    o.scr = "heart"; o.tint = ""
    face = stressed ? { eyes: "strainL", mouth: "grin" } : { eyes: "squintL", mouth: "omega" }
    py = rt < 0.25 ? -1 : 0
    fx = stressed ? keepSweat(t) : []
    var hp = Math.min(1, rt / 1.6)
    fx.push({ rows: FX.heart, x: 17 + (Math.floor(rt * 4) % 2), y: 8 - Math.round(hp * 8), c: "r", op: hp < 0.9 ? 1 : 0.5 })
    if (rt > 0.5) {
      var hp2 = Math.min(1, (rt - 0.5) / 1.3)
      fx.push({ rows: FX.heartSmall, x: 1 - (Math.floor(rt * 4) % 2), y: 9 - Math.round(hp2 * 8), c: "r", op: hp2 < 0.9 ? 1 : 0.5 })
    }
  } else if (st.reaction === "annoyed") {
    reset(o, calm)
    o.tint = "k"; if (o.scr === "off") o.scr = "code"
    face = { eyes: "angryL", brows: "angry", mouth: "pout", lookX: 0, lookY: 0 }
    o.legs = tick % 2 === 0 ? "stompL" : "stompR"
    o.arms = tick % 2 === 0 ? "flailA" : "hips"
    o.px = tick % 2 === 0 ? -1 : 0
    fx = stressed ? keepSweat(t) : []
    fx.push({ rows: FX.anger, x: 17, y: tick % 2 === 0 ? 0 : 1, c: "r", op: 1 })
    if (tick % 3 === 0) fx.push({ rows: FX.puff[0], x: 0, y: 8, c: "o", op: 0.5 })
  } else if (st.hovered && !stressed && !st.grooving && !st.screenKey && mood !== "work") {
    // wakes up and looks at the cursor
    o.doze = false
    if (!st.blink && face.eyes === "half") face.eyes = "open"
  }

  if (face) {
    if (face.lookX === undefined) face.lookX = 0
    if (face.lookY === undefined) face.lookY = 0
    if (st.hovered && face.eyes === "open" && !st.reaction) { face.lookX = st.lookX; face.lookY = st.lookY }
  }
  if (o.sign && (st.dragged || landing || st.reaction)) o.sign = 0
  o.face = face
  o.py = py

  if (fx.length > FX_SLOTS) fx = fx.slice(0, FX_SLOTS)
  var air = Math.max(0, -py)
  return { rows: frame(o), x: dx, y: 0, shadow: shadow[Math.min(2, air)], fx: fx }
}

function reset(o, calm) { for (var k in calm) o[k] = calm[k]; o.key = undefined; o.squash = 0 }

function sweatDrops(fx, t, n) {
  for (var i = 0; i < n; i++) {
    var p = ((t * 1.1 + i / n) % 1 + 1) % 1
    var side = i % 2 === 0
    if (p < 0.85) fx.push({ rows: FX.sweat, x: side ? 17 : 0, y: 6 + Math.round(p * 9) + i, c: "l", op: 1 })
  }
}

function keepSweat(t) { var fx = []; sweatDrops(fx, t, 1); return fx }
