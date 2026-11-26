.pragma library

// Desk Clock pet: a punctual little owl, the card's timekeeper. Round blob
// of a body with ear tufts, a pale heart-shaped facial disc, huge glinting
// eyes, a small hooked beak, a speckled chest and folded wings, perched on a
// branch. Its pocket watch hangs from a twig beside it and shows the real
// time (hour hand in half hours, minute hand in five-minute steps).
// Drawn at px 2 on the shared 44x38 pet canvas (docs/PETS.md), built from
// shapes with top-lit shading and memoised per pose key, like the axolotl.
//
// Palette keys (PetColors): o outline, b body, h highlight, n shade (wings,
// eyelids), d dark (beak, wing bars, branch), w facial disc / chest, l watch
// face / talons, p blush, e ink (eyes, hands), x glint, t shadow.
//
// scene(state, PetFx) -> { rows, x, y, prop, fx }: owl rows + cell offset,
// the branch/watch rows (behind, never offset) and up to six effects.

var W = 44
var H = 38
var FX_SLOTS = 6
var CX = 16          // owl centre line: cells 15 | 16 mirror (x' = 31 - x)

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

// Distance from the cell centre to a polyline (array of [x, y]); with
// `along` it also returns how far along the line (0..1) the nearest point is.
function segDist(pts, x, y, along) {
  var px = x + 0.5, py = y + 0.5, best = 1e9, bestT = 0, total = 0, lens = []
  for (var k = 0; k + 1 < pts.length; k++) {
    var l = Math.sqrt(Math.pow(pts[k + 1][0] - pts[k][0], 2) + Math.pow(pts[k + 1][1] - pts[k][1], 2))
    lens.push(l); total += l
  }
  var acc = 0
  for (var i = 0; i + 1 < pts.length; i++) {
    var a = pts[i], b = pts[i + 1]
    var vx = b[0] - a[0], vy = b[1] - a[1], l2 = vx * vx + vy * vy
    var t = l2 > 0 ? Math.max(0, Math.min(1, ((px - a[0]) * vx + (py - a[1]) * vy) / l2)) : 0
    var ex = a[0] + vx * t - px, ey = a[1] + vy * t - py
    var d = ex * ex + ey * ey
    if (d < best) { best = d; bestT = total > 0 ? (acc + t * lens[i]) / total : 0 }
    acc += lens[i]
  }
  if (along) along.t = bestT
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

// Fill a mask without an outline (markings on top of a body).
function paint(g, mask, fill) {
  for (var y = 0; y < H; y++)
    for (var x = 0; x < W; x++)
      if (mask(x, y)) g[y][x] = typeof fill === "function" ? fill(x, y) : fill
}

function IN(inside, x, y) { return y >= 0 && y < H && x >= 0 && x < W && inside[y][x] }
function put(g, x, y, c) { if (y >= 0 && y < H && x >= 0 && x < W) g[y][x] = c }
function putIf(g, x, y, c, only) { if (y >= 0 && y < H && x >= 0 && x < W && only.indexOf(g[y][x]) >= 0) g[y][x] = c }

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

function mirrorPts(pts) {
  var out = []
  for (var i = 0; i < pts.length; i++) out.push([2 * CX - pts[i][0], pts[i][1]])
  return out
}

// ---------------------------------------------------------------- the prop
//
// A branch across the bottom, a forked twig on the right and the pocket
// watch hanging from it on a short chain. key: hour step 0..23 (half hours
// on a 12 h dial), minute step 0..11, swing -1/0/1.

var WATCH_CX = 36.5, WATCH_CY = 21.5, WATCH_R = 6.4

function buildProp(hh, mm, sw) {
  var g = grid()
  // twig behind the watch: rises from the branch, bends left into a hook
  var twig = [[40.5, 33.5], [41.2, 24], [40.6, 14], [38.5, 9.8], [36.2, 9.6]]
  layer(g, function(x, y) { return segDist(twig, x, y) < 1.05 }, function(x, y, inside) {
    return !IN(inside, x - 1, y) ? "n" : "d"
  })
  // branch: one thick gnarled bough, lighter on top, a knot and a leafy end
  var bough = [[-2, 34.2], [12, 33.6], [26, 33.4], [44, 34.0]]
  layer(g, function(x, y) { return segDist(bough, x, y) < 1.75 || inEllipse(x, y, 2.5, 31.2, 1.6, 1.1) }, function(x, y, inside) {
    if (!IN(inside, x, y - 1)) return "n"
    return "d"
  })
  put(g, 6, 34, "n"); put(g, 7, 34, "n"); put(g, 24, 35, "n"); put(g, 33, 35, "n"); put(g, 34, 35, "n")
  layer(g, function(x, y) { return inEllipse(x, y, 1.6, 29.6, 1.2, 1.9) }, function(x, y, inside) {
    return !IN(inside, x, y - 1) ? "h" : "b"
  })

  // chain from the hook to the crown (slants with the swing)
  var cx = WATCH_CX + sw, top = WATCH_CY - WATCH_R
  for (var cy = 10; cy < top - 1; cy++) {
    var f = (cy - 10) / Math.max(1, top - 11)
    put(g, Math.floor(36.0 + sw * f), cy, cy % 2 === 0 ? "o" : "l")
  }
  // crown
  stamp(g, Math.floor(cx) - 1, Math.floor(top) - 2, [".o.", "olo"])

  // case + face
  layer(g, function(x, y) { return inDisc(x, y, cx, WATCH_CY, WATCH_R) }, function(x, y) {
    var dx = x + 0.5 - cx, dy = y + 0.5 - WATCH_CY, d = Math.sqrt(dx * dx + dy * dy)
    if (d > WATCH_R - 1.2) return dy < -0.5 ? "h" : (dx > 1.5 || dy > 1.5 ? "n" : "b")
    return "l"
  })
  put(g, Math.floor(cx - 3.2), Math.floor(WATCH_CY - 4.2), "x")
  put(g, Math.floor(cx - 4.2), Math.floor(WATCH_CY - 3.2), "x")
  // hour ticks at 12 / 3 / 6 / 9
  var ccx = Math.floor(cx), ccy = Math.floor(WATCH_CY)
  put(g, ccx, ccy - 4, "n"); put(g, ccx + 4, ccy, "n"); put(g, ccx, ccy + 4, "n"); put(g, ccx - 4, ccy, "n")
  // hands from the centre cell
  var c0 = [ccx + 0.5, ccy + 0.5]
  var am = mm * Math.PI / 6, ah = hh * Math.PI / 12
  var mtip = [c0[0] + 4.1 * Math.sin(am), c0[1] - 4.1 * Math.cos(am)]
  var htip = [c0[0] + 2.7 * Math.sin(ah), c0[1] - 2.7 * Math.cos(ah)]
  for (var y = ccy - 5; y <= ccy + 5; y++)
    for (var x = ccx - 5; x <= ccx + 5; x++) {
      if (!inDisc(x, y, cx, WATCH_CY, WATCH_R - 1.2)) continue
      if (segDist([c0, mtip], x, y) < 0.55 || segDist([c0, htip], x, y) < 0.62) put(g, x, y, "e")
    }
  put(g, ccx, ccy, "d")

  return toRows(g)
}

var propCache = {}
function prop(hh, mm, sw) {
  var key = hh + "|" + mm + "|" + sw
  var hit = propCache[key]
  if (hit) return hit
  if (Object.keys(propCache).length > 80) propCache = {}
  return (propCache[key] = buildProp(hh, mm, sw))
}

// ---------------------------------------------------------------- owl
//
// o: sq (squash 0..2), puff (0..2, feathers fluffed), lift (head raised),
//    sunk (head drawn in, sleep), tufts (up|perk|flat|back|tiltL|tiltR),
//    face {eyes, eyesR?, fx, fy, tilt, beak, blush}, back (head turned
//    round: no face), wingL / wingR (pose names), feet, lean

var WINGS = {
  // left wing: shoulder, elbow, tip (the right wing mirrors)
  fold:    [[7.4, 19.5], [5.4, 25.0], [7.0, 30.6]],
  wrap:    [[8.0, 19.0], [7.4, 25.0], [10.5, 31.0]],
  lift:    [[7.2, 19.5], [3.8, 24.0], [3.2, 29.0]],
  hips:    [[7.4, 19.5], [3.2, 23.5], [6.8, 27.8]],
  up:      [[7.0, 19.0], [3.0, 13.5], [1.2, 7.5]],
  mid:     [[7.0, 19.5], [2.0, 19.5], [0.2, 22.5]],
  down:    [[7.2, 20.0], [3.2, 26.5], [2.2, 32.0]],
  stretch: [[7.0, 19.0], [1.6, 20.5], [-1.0, 25.5]],
  preen:   [[7.6, 19.5], [6.6, 15.5], [10.0, 13.5]],
  // right-wing only poses (already in right-wing coordinates)
  point:   [[24.4, 19.5], [28.0, 19.0], [30.6, 17.4]],
  tap:     [[24.4, 19.5], [28.2, 20.6], [31.0, 20.2]]
}
var RIGHT_ONLY = { point: 1, tap: 1 }

var BEAKS = {
  shut: ["oddo", ".dd.", ".oo."],
  open: ["oddo", "deed", "oddo", ".oo."],
  wide: ["oddo", "deed", "deed", "oddo", ".oo."],
  nib:  ["oddo", ".do.", "..o."]
}

var DIZZY = [
  [".eee.", "e...e", "e.e.e", "e...e", ".eee."],
  [".eee.", "e.e.e", "e...e", "e...e", ".eee."]
]

// One big owl eye at ex, ey. side -1 left / +1 right (for slanted lids).
function drawEye(g, ex, ey, kind, side, look) {
  var fx = Math.floor(ex), fy = Math.floor(ey)
  if (kind === "closed") { stamp(g, fx - 3, fy, ["e....e", ".eeee."]); return }
  if (kind === "happy") { stamp(g, fx - 3, fy - 1, [".eeee.", "e....e"]); return }
  if (kind === "blink") { stamp(g, fx - 3, fy, [".nnnn.", "eeeeee"]); return }
  if (kind === "dizzy" || kind === "dizzyB") { stamp(g, fx - 2, fy - 2, DIZZY[kind === "dizzy" ? (side < 0 ? 0 : 1) : (side < 0 ? 1 : 0)]); return }
  var r = kind === "wide" ? 3.8 : 3.4
  for (var y = fy - 4; y <= fy + 4; y++)
    for (var x = fx - 4; x <= fx + 4; x++) {
      if (!inDisc(x, y, ex, ey, r)) continue
      var u = (x + 0.5 - ex) * -side          // > 0 toward the beak
      var v = y + 0.5 - ey                      // > 0 downward
      var lid = false
      if (kind === "half") lid = v < -0.4
      else if (kind === "sleepy") lid = v < 0.6
      else if (kind === "angry") lid = v < -1.2 + 0.85 * u
      else if (kind === "worry") lid = v < -1.6 - 0.7 * u
      g[y][x] = lid ? "n" : "e"
    }
  // glints (skip where a lid covers them)
  var gx = Math.floor(ex) - 2 + (look > 0 ? 1 : 0), gy = Math.floor(ey) - 2
  var glint = [[gx, gy], [gx + 1, gy], [gx, gy + 1]]
  if (kind === "wide") glint.push([gx + 1, gy + 1])
  for (var i = 0; i < glint.length; i++) putIf(g, glint[i][0], glint[i][1], "x", "e")
  putIf(g, Math.floor(ex) + 1, Math.floor(ey) + 1, "x", "e")
}

function build(o) {
  var g = grid()
  var sq = o.sq || 0, puff = o.puff || 0, lift = o.lift || 0, sunk = o.sunk || 0
  var face = o.face || null
  // head + body blob
  var hcy = 13.5 - lift + sq * 1.6 + sunk * 1.6
  var hrx = 11.2 + sq * 0.7 + puff * 0.4, hry = 8.6 - sq * 0.9
  var bcy = 23.6 + sq * 0.9, brx = 10.0 + puff * 0.9 + sq * 0.9, bry = 9.0 - sq * 0.8 + puff * 0.2
  var tilt = face ? (face.tilt || 0) : 0

  // ear tufts: base on the head, tip pose
  var tb = hcy - hry + 3.0
  var tips = {
    up:   [[4.8, tb - 5.8], [27.2, tb - 5.8]],
    perk: [[4.4, tb - 7.0], [27.6, tb - 7.0]],
    flat: [[2.6, tb - 2.6], [29.4, tb - 2.6]],
    back: [[3.2, tb - 4.6], [28.8, tb - 4.6]]
  }
  var tp = tips[o.tufts] || tips.up
  var tufts = [[[8.6, tb + 0.4], [tp[0][0], tp[0][1] + Math.max(0, tilt) * 1.0]],
               [[23.4, tb + 0.4], [tp[1][0], tp[1][1] - Math.min(0, tilt) * 1.0]]]
  if (o.back) tufts = [[[9.0, tb + 0.4], [tp[0][0] + 0.6, tp[0][1]]], [[23.0, tb + 0.4], [tp[1][0] - 0.6, tp[1][1]]]]
  function inTuft(x, y) {
    for (var i = 0; i < 2; i++) {
      var a = {}
      var d = segDist(tufts[i], x, y, a)
      if (d < 1.5 - a.t * 1.1) return true
    }
    return false
  }

  // wings behind the body only for raised poses (drawn first)
  var wl = WINGS[o.wingL] || WINGS.fold
  var wr = RIGHT_ONLY[o.wingR] ? WINGS[o.wingR] : mirrorPts(WINGS[o.wingR] || WINGS.fold)
  var wingPts = [wl, wr]
  for (var wi = 0; wi < 2; wi++) for (var wj = 0; wj < 3; wj++) wingPts[wi][wj] = [wingPts[wi][wj][0], wingPts[wi][wj][1] + sq * 0.8]

  // body
  var inside = layer(g, function(x, y) {
    return inEllipse(x, y, CX, hcy, hrx, hry) || inEllipse(x, y, CX, bcy, brx, bry) || inTuft(x, y)
  }, function(x, y, ins) {
    if (!IN(ins, x, y - 1)) return "h"
    if (!IN(ins, x, y + 1) || !IN(ins, x, y + 2) && y > bcy) return "n"
    if (!IN(ins, x + 1, y)) return "n"
    return "b"
  })
  // tuft insides darker, a few head feather flecks
  paint(g, function(x, y) { return inside[y][x] && y < tb - 0.5 && g[y][x] === "b" }, "d")

  // chest: pale bib with chevron speckles
  var chy = bcy + 2.0
  paint(g, function(x, y) { return inside[y][x] && inEllipse(x, y, CX, chy, 6.6 + puff * 0.7, 6.4) && g[y][x] !== "o" }, function(x, y) {
    return IN(inside, x, y + 1) ? "w" : "n"
  })
  var chev = [[13, chy - 3], [18, chy - 3], [15, chy], [11, chy + 0.5], [20, chy + 0.5], [13, chy + 3], [18, chy + 3]]
  for (var c = 0; c < chev.length; c++) {
    var cx0 = chev[c][0], cy0 = Math.round(chev[c][1])
    putIf(g, cx0, cy0, "n", "w"); putIf(g, cx0 + 1, cy0 + 1, "n", "w"); putIf(g, cx0 + 2, cy0, "n", "w")
  }

  var fxs = face ? (face.fx || 0) : 0, fys = face ? (face.fy || 0) : 0
  var exL = CX - 4.5 + fxs, exR = CX + 4.5 + fxs, ey = hcy + 0.6 + fys + (sq > 0 ? 0.5 : 0)
  if (o.back) {
    // head turned all the way round: a darker crown and a feather seam
    paint(g, function(x, y) { return inside[y][x] && g[y][x] === "b" && inEllipse(x, y, CX, hcy + 0.5, hrx - 2.5, hry - 2.2) }, "n")
    for (var s = -3; s <= 3; s++) putIf(g, CX - 1 + (s % 2 === 0 ? 0 : 1), Math.round(hcy) + s, "d", "nb")
    putIf(g, CX - 4, Math.round(hcy) - 1, "d", "n"); putIf(g, CX + 3, Math.round(hcy) - 1, "d", "n")
    putIf(g, CX - 5, Math.round(hcy) + 2, "d", "n"); putIf(g, CX + 4, Math.round(hcy) + 2, "d", "n")
  } else if (face) {
    // facial disc: two overlapping pale rounds framing the eyes, a darker rim
    var ty = tilt
    var dL = [exL, ey - ty * 0.5], dR = [exR, ey + ty * 0.5]
    paint(g, function(x, y) {
      return inside[y][x] && g[y][x] !== "o" && (inDisc(x, y, dL[0], dL[1], 5.3) || inDisc(x, y, dR[0], dR[1], 5.3))
    }, function(x, y) {
      var rim = !(inDisc(x, y, dL[0], dL[1], 4.4) || inDisc(x, y, dR[0], dR[1], 4.4))
      return rim ? "n" : "l"
    })
    // brow ridge: a V of darker feathers between the eyes down to the beak
    var bx = CX + fxs, by = Math.round(ey) - 4
    putIf(g, bx - 2, by, "n", "l"); putIf(g, bx + 1, by, "n", "l")
    putIf(g, bx - 1, by + 1, "n", "l"); putIf(g, bx, by + 1, "n", "l")
    // eyes
    var eL = face.eyes || "open", eR = face.eyesR || eL
    drawEye(g, dL[0], dL[1], eL, -1, face.look || 0)
    drawEye(g, dR[0], dR[1], eR, 1, face.look || 0)
    // blush on the disc below the outer eye corners
    if (face.blush) {
      stamp(g, Math.floor(dL[0]) - 4, Math.floor(dL[1]) + 3, ["pp"])
      stamp(g, Math.floor(dR[0]) + 3, Math.floor(dR[1]) + 3, ["pp"])
    }
    // beak
    var bk = BEAKS[face.beak] || BEAKS.shut
    stamp(g, Math.floor(bx) - 2, Math.round(ey) + 1, bk)
  }

  // wings in front of the body
  function wingMask(w) {
    return function(x, y) {
      var a = {}
      var d = segDist(w, x, y, a)
      return d < 2.3 - a.t * 1.5
    }
  }
  for (var k = 0; k < 2; k++) {
    var w = wingPts[k]
    layer(g, wingMask(w), function(x, y, ins) {
      var a = {}
      segDist(w, x, y, a)
      if (!IN(ins, x, y - 1) && a.t < 0.5) return "b"
      if (a.t > 0.55 && (y % 2 === 0)) return "d"
      return "n"
    })
  }

  // talons gripping the branch (or dangling / stomping)
  var feet = o.feet || "perch"
  var fy = 32.0, fl = fy, fr = fy
  if (feet === "stompL") fl -= 1.4
  if (feet === "stompR") fr -= 1.4
  if (feet === "dangleA") { fl += 1.6; fr += 0.8 }
  if (feet === "dangleB") { fl += 0.8; fr += 1.6 }
  if (feet !== "tuck") {
    // three pale toes per foot, claws curled over the front of the branch
    var FOOT = [".ooo.", "olwlo", "e.e.e"]
    stamp(g, CX - 6, Math.floor(fl), FOOT)
    stamp(g, CX + 1, Math.floor(fr), FOOT)
  }

  if (o.lean) {
    for (var y5 = 0; y5 < H; y5++) {
      var sh = o.lean * Math.floor(Math.max(0, y5 - 8) / 9)
      if (!sh) continue
      var row = g[y5], out = []
      for (var x5 = 0; x5 < W; x5++) { var src = x5 - sh; out.push(src >= 0 && src < W ? row[src] : ".") }
      g[y5] = out
    }
  }
  return toRows(g)
}

function toRows(g) {
  var rows = []
  for (var y = 0; y < H; y++) rows.push(g[y].join(""))
  return rows
}

var cache = {}
var cacheSize = 0
function frame(o) {
  var f = o.face || {}
  var key = [o.sq || 0, o.puff || 0, o.lift || 0, o.sunk || 0, o.tufts || "", o.back ? 1 : 0, o.wingL || "", o.wingR || "",
    o.feet || "", o.lean || 0,
    o.face ? [f.eyes, f.eyesR || "", f.fx || 0, f.fy || 0, f.tilt || 0, f.beak || "", f.blush ? 1 : 0, f.look || 0].join(",") : ""].join("|")
  var hit = cache[key]
  if (hit) return hit
  if (cacheSize > 500) { cache = {}; cacheSize = 0 }
  var rows = build(o)
  cache[key] = rows
  cacheSize++
  return rows
}

// ---------------------------------------------------------------- own effects

// "Hoo" in a tiny 3x5 hand, drawn by scene() above the watch.
var HOO = [
  "o.o........",
  "o.o.ooo.ooo",
  "ooo.o.o.o.o",
  "o.o.o.o.o.o",
  "o.o.ooo.ooo"
]

// a small loose feather, two tumbling frames
var FEATHER = [
  [".oo", "oho", "oo."],
  ["oo.", "oho", ".oo"]
]

// sound rings beside the beak while hooting
// sound rings left of the head while hooting: "(" then a wider "("
var RING = [
  [".o", "o.", "o.", ".o"],
  [".o.", "o..", "o..", "o..", ".o."]
]

// ---------------------------------------------------------------- scene
//
// st: { mood (awake|drowsy|sleep), t, wall, blink, fidget, fidgetT, hoot
//       (hoot index 0.. while hooting, else -1), hootN, hootT, hh, mm,
//       reaction, reactT, hovered, lookX, lookY, dragged, lean, landT, still }

var FX = null
function init(fx) { if (FX !== fx) FX = fx }

function scene(st, fx0) {
  if (fx0) init(fx0)
  var t = st.t, tick = Math.floor(t * 4), mood = st.mood
  var o = { tufts: "up", wingL: "fold", wingR: "fold", feet: "perch" }
  var face = { eyes: st.blink ? "blink" : "open", beak: "shut" }
  var dx = 0, dy = 0, fx = [], sw = 0
  var asleep = mood === "sleep" && !st.reaction && !st.dragged && st.landT < 0

  if (asleep) {
    o = { puff: Math.floor(st.wall) % 4 < 2 ? 1 : 2, sunk: 1, tufts: "flat", wingL: "wrap", wingR: "wrap", feet: "perch" }
    face = { eyes: "closed", beak: "shut" }
    if (st.hovered) {
      // one eye peeks open and follows the pointer; the other keeps sleeping
      face = { eyes: "closed", eyesR: "half", beak: "shut", fx: st.lookX, fy: st.lookY > 0 ? 1 : 0 }
    }
    if (!st.still) {
      for (var z = 0; z < 2; z++) {
        var ph = ((st.wall * 0.3 + z * 0.5) % 1 + 1) % 1
        if (ph < 0.85) fx.push({ rows: z === 0 ? FX.zed : FX.zedSmall, x: 1 + Math.round(Math.sin(ph * 6.28)) + z * 2, y: 12 - Math.round(ph * 11), c: "o", op: 0.7 })
      }
    } else fx.push({ rows: FX.zed, x: 1, y: 4, c: "o", op: 0.7 })
  } else if (st.hoot >= 0) {
    // on the hour: a glance at the watch, then one hoot per hour
    var ht = st.hootT
    if (ht < 0.75) {
      o.wingR = ht < 0.5 ? "point" : "tap"
      face = { eyes: "open", beak: "shut", fx: 1, look: 1 }
      sw = ht >= 0.5 ? 1 : 0
    } else {
      var hp = ((ht - 0.75) % 0.75) / 0.75, hi = Math.floor((ht - 0.75) / 0.75)
      var on = hp < 0.6
      o.puff = on ? 2 : 1; o.lift = on ? 1 : 0; o.tufts = on ? "perk" : "up"
      face = { eyes: on ? "happy" : "open", beak: on ? (hp < 0.3 ? "open" : "wide") : "shut" }
      sw = hi % 2 === 0 ? 1 : -1
      if (on) {
        fx.push({ rows: HOO, x: 31, y: 3 - Math.round(hp * 3), c: "o", op: hp < 0.45 ? 1 : 0.55 })
        fx.push({ rows: RING[hp < 0.3 ? 0 : 1], x: 0 + (hp < 0.3 ? 1 : 0), y: 13, c: "o", op: 0.6 })
      }
    }
  } else if (mood === "awake" || mood === "drowsy" || mood === "sleep") {
    var fd = st.fidget, ft = st.fidgetT, step = Math.floor(ft * 4)
    if (mood === "drowsy" && face.eyes === "open") face.eyes = "half"
    if (mood === "sleep") face.eyes = "half"     // woken by a touch / drag that just ended
    if (fd === "swivel") {
      // the owl trick: the head turns right round and comes back the other way
      var sv = [[0, -1], [0.45, -2], [0.9, "back"], [1.9, 2], [2.35, 1], [2.8, 0]]
      var cur = 0
      for (var si = 0; si < sv.length; si++) if (ft >= sv[si][0]) cur = sv[si][1]
      if (cur === "back") { o.back = true; face = null }
      else { face.fx = cur; face.look = cur > 0 ? 1 : (cur < 0 ? -1 : 0) }
    } else if (fd === "preen") {
      var pr = ft > 0.3 && ft < 2.3
      if (pr) {
        o.wingL = "preen"; face.fx = -2; face.fy = 1
        face.eyes = "happy"; face.beak = step % 2 === 0 ? "nib" : "shut"
      }
      if (ft > 2.0) {
        var fp = Math.min(1, (ft - 2.0) / 0.9)
        fx.push({ rows: FEATHER[step % 2], x: 4 + (step % 2), y: 18 + Math.round(fp * 12), c: "l", op: fp < 0.85 ? 1 : 0.5 })
      }
    } else if (fd === "watch") {
      // checks the pocket watch, taps it, nods: right on time
      face.fx = 1; face.look = 1
      if (ft < 0.6) o.wingR = "point"
      else if (ft < 1.6) { o.wingR = step % 2 === 0 ? "tap" : "point"; sw = step % 2 === 0 ? 1 : 0 }
      else if (ft < 2.6) { sw = step % 4 < 2 ? -1 : 1; face.eyes = "open"; dy = step % 2 === 0 ? 1 : 0; face.fx = 0 }
      else { face.eyes = "happy"; face.fx = 0 }
    } else if (fd === "ruffle") {
      var ru = ft > 0.25 && ft < 1.6
      o.puff = ru ? 2 : 0
      if (ru) { dx = step % 2 === 0 ? -1 : 1; face.eyes = "closed"; o.tufts = step % 2 === 0 ? "back" : "up" }
      if (ft > 0.8) {
        var rp = Math.min(1, (ft - 0.8) / 1.0)
        fx.push({ rows: FEATHER[step % 2], x: 27 - (step % 2), y: 14 + Math.round(rp * 14), c: "l", op: rp < 0.85 ? 1 : 0.5 })
        fx.push({ rows: FEATHER[(step + 1) % 2], x: 3 + (step % 2), y: 12 + Math.round(rp * 16), c: "l", op: rp < 0.85 ? 1 : 0.5 })
      }
    } else if (fd === "tilt") {
      var tl = ft < 1.2 ? -1 : 1
      if (ft > 0.2 && ft < 2.2) { face.tilt = tl; face.eyes = "wide" }
      if (ft > 0.3 && ft < 2.0) fx.push({ rows: FX.question, x: 29, y: 1, c: "o", op: 1 })
    } else if (fd === "stretch") {
      var left = ft < 1.3
      if (ft > 0.2 && ft < 2.4) {
        if (left) o.wingL = "stretch"; else o.wingR = "stretch"
        face.eyes = "closed"; o.lift = 1
      }
    } else if (fd === "yawn") {
      if (ft > 0.3 && ft < 1.8) { face.eyes = "closed"; face.beak = "wide"; o.lift = 1; o.tufts = "back" }
    }
    if (st.hovered && face && !fd) o.tufts = "perk"
  }

  // ---- touch reactions ----
  if (st.dragged) {
    o = { wingL: tick % 2 === 0 ? "up" : "down", wingR: tick % 2 === 0 ? "up" : "down", tufts: "back",
          feet: tick % 2 === 0 ? "dangleA" : "dangleB", lean: st.lean || 0 }
    face = { eyes: "wide", beak: "open" }
    dy = tick % 2 === 0 ? -2 : -1; dx = 0; sw = tick % 4 < 2 ? 1 : -1
    fx = []
    if (tick % 4 < 3) fx.push({ rows: FX.bang, x: 30, y: 0, c: "r", op: 1 })
    if (tick % 2 === 0) fx.push({ rows: FEATHER[tick % 2], x: 1, y: 26 + (tick % 4), c: "l", op: 0.8 })
  } else if (st.landT >= 0) {
    var lt = st.landT
    o = { wingL: "lift", wingR: "lift", tufts: "up", feet: "perch" }
    fx = []; dx = 0; dy = 0
    if (lt < 0.3) {
      o.sq = 2; o.tufts = "flat"
      face = { eyes: "closed", beak: "open" }
      fx.push({ rows: FX.dust[0], x: 3, y: 31, c: "o", op: 0.6 })
      fx.push({ rows: FX.dust[1], x: 24, y: 31, c: "o", op: 0.6 })
      sw = 1
    } else if (lt < 0.5) {
      dy = -1; o.wingL = "mid"; o.wingR = "mid"
      face = { eyes: "wide", beak: "shut" }
      sw = -1
    } else {
      var lk = Math.floor(lt * 4)
      face = { eyes: lk % 2 === 0 ? "dizzy" : "dizzyB", beak: "shut" }
      dx = lk % 2 === 0 ? -1 : 1
      fx.push({ rows: FX.spiral[lk % 2], x: 26, y: 0, c: "o", op: 1 })
      var lp = Math.min(1, (lt - 0.5) / 1.0)
      fx.push({ rows: FEATHER[lk % 2], x: 5 + lk % 2, y: 6 + Math.round(lp * 20), c: "l", op: 0.8 })
    }
  } else if (st.reaction === "squish") {
    o = { sq: 2, puff: 1, wingL: "mid", wingR: "mid", tufts: tick % 2 === 0 ? "flat" : "back", feet: "perch" }
    face = { eyes: "happy", beak: tick % 2 === 0 ? "open" : "shut", blush: true }
    dx = tick % 2 === 0 ? 0 : 1; dy = 0
    fx = []
    if (tick % 4 < 2) fx.push({ rows: FX.sparkle[tick % 2], x: 28, y: 10, c: "o", op: 1 })
  } else if (st.reaction === "pet") {
    // fluffs up, squints happily, ear tufts wiggle; a sleepy owl wakes for it
    var rt = st.reactT, rk = Math.floor(rt * 4)
    o = { puff: 1, wingL: "fold", wingR: "fold", tufts: rk % 2 === 0 ? "up" : "back", feet: "perch" }
    face = { eyes: "happy", beak: "shut", blush: true, tilt: rk % 4 < 2 ? 0 : 1 }
    if (mood === "sleep" && rt < 0.5) face = { eyes: "half", beak: "shut" }
    dy = rt < 0.25 ? -1 : 0; dx = 0
    fx = []
    var hp1 = Math.min(1, rt / 1.6)
    fx.push({ rows: FX.heart, x: 27 + rk % 2, y: 12 - Math.round(hp1 * 11), c: "r", op: hp1 < 0.9 ? 1 : 0.5 })
    if (rt > 0.5) {
      var hp2 = Math.min(1, (rt - 0.5) / 1.3)
      fx.push({ rows: FX.heartSmall, x: 1 - rk % 2 + 1, y: 12 - Math.round(hp2 * 10), c: "r", op: hp2 < 0.9 ? 1 : 0.5 })
    }
  } else if (st.reaction === "annoyed") {
    // puffs up huge, wings on hips, beak clacks, stamps on the branch
    o = { puff: 2, wingL: "hips", wingR: "hips", tufts: "perk", feet: tick % 2 === 0 ? "stompL" : "stompR" }
    face = { eyes: "angry", beak: tick % 2 === 0 ? "open" : "shut" }
    dx = tick % 2 === 0 ? -1 : 0; dy = 0
    fx = []
    fx.push({ rows: FX.anger, x: 28, y: tick % 2 === 0 ? 1 : 2, c: "r", op: 1 })
    if (tick % 3 === 0) fx.push({ rows: FX.puff[0], x: 0, y: 18, c: "o", op: 0.5 })
  }

  // hover: the head turns to follow the pointer (owls move heads, not eyes)
  if (st.hovered && face && !st.reaction && !st.dragged && st.landT < 0 && st.hoot < 0 && !asleep && !st.fidget) {
    face.fx = st.lookX; face.fy = st.lookY; face.look = st.lookX
    if (face.eyes === "half" || face.eyes === "blink") face.eyes = st.blink ? "blink" : "open"
  }

  o.face = face
  if (fx.length > FX_SLOTS) fx = fx.slice(0, FX_SLOTS)
  return { rows: frame(o), x: dx, y: dy, prop: prop(st.hh || 0, st.mm || 0, st.still ? 0 : sw), fx: fx }
}
