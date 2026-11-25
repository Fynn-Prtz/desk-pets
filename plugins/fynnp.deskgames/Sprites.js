.pragma library

// Desk Games pet: a gamepad critter. Its body is the controller (wide top,
// two grips that end in stubby feet), shoulder bumpers for ears, a d-pad and
// four face buttons as features, ink eyes with glints between them, mitten
// arms that can reach its own buttons, and the USB cable as a curly sprout.
// Drawn at px 2 on the shared 44x38 pet canvas (docs/PETS.md), built from
// shapes and memoised by pose key like the desksys buddy.
//
// Palette keys (PetColors): o outline, b body, h highlight, n shade, d dark,
// w light, l lightest, p blush/pink, e ink, x glint, r urgent, k soft urgent,
// t shadow. scene(state, PetFx) -> body rows + offset + up to six effects.

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
  strain: ["EEE.", "...E"],
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
  grit:   ["EEEEEEEE", "EXEXXEXE", "EEEEEEEE"],
  wobble: [".E..E.", "E.EE.E"],
  pout:   [".EE.", "E..E"],
  tongue: ["EEEE..", ".EEPP.", "...PP."],
  giggle: ["EEEEEE", ".E..E.", "..EE.."],
  tiny:   ["EE"]
}

function drawFace(g, cx, top, face, mouthDy) {
  var map = { "E": "e", "X": "x", "P": "p" }
  var eyes = face.eyes, lx = face.lookX || 0, ly = face.lookY || 0
  var e = EYES[eyes] || EYES.open, eR = e
  if (/L$/.test(eyes)) eR = mirrorRows(e)
  var ey = top + ly
  var lxp = cx - 3 - e[0].length + lx, rxp = cx + 3 + lx
  stamp(g, lxp, ey, e, map)
  stamp(g, rxp, ey, eR, map)
  if (face.brows && BROWS[face.brows]) {
    var b = BROWS[face.brows]
    stamp(g, lxp, ey - 2, b, map)
    stamp(g, rxp, ey - 2, mirrorRows(b), map)
  }
  if (face.blush) {
    stamp(g, cx - 9, top + 5, ["PPP"], map)
    stamp(g, cx + 6, top + 5, ["PPP"], map)
  }
  var m = MOUTHS[face.mouth] || []
  if (m.length) stamp(g, cx - Math.floor(m[0].length / 2), top + 6 - (mouthDy || 0), m, map)
}

// Trophy (silver: light accent tones), held up in the right hand.
var TROPHY = [
  "..ooooooo..",
  "oooxwwwnooo",
  "o.olwwwno.o",
  ".ooolwnooo.",
  "...oowno...",
  "....ono....",
  "....ono....",
  "...ooooo...",
  "..onnnnno..",
  "..ooooooo.."
]

// ---------------------------------------------------------------- body
//
// opts: face {eyes, mouth, brows, blush, lookX, lookY}, lift, squash,
//       arms pose, legs pose, cable pose, lean, press ("" | "L" | "R" | "B"),
//       lit (which face button flashes: "" | "t" | "r" | "b" | "l"), trophy

var ARM_POSES = {
  rest:   [[3.0, 26.5], [40.0, 26.5]],
  tuck:   [[5.0, 27.0], [38.0, 27.0]],
  out:    [[0.8, 22.0], [42.2, 22.0]],
  up:     [[2.0, 11.5], [41.0, 11.5]],
  high:   [[6.0, 5.5], [37.0, 5.5]],
  hips:   [[3.5, 24.5], [39.5, 24.5]],
  mashA:  [[9.5, 17.0], [34.0, 19.0]],
  mashB:  [[9.5, 19.0], [34.0, 16.5]],
  pressR: [[3.0, 26.5], [34.0, 16.5]],
  flailA: [[1.0, 10.0], [42.0, 17.0]],
  flailB: [[1.0, 17.0], [42.0, 10.0]],
  danceA: [[1.5, 12.0], [41.0, 26.0]],
  danceB: [[2.0, 26.0], [41.5, 12.0]]
}

function build(o) {
  var g = grid()
  var sq = o.squash || 0, lift = o.lift || 0
  var bx0 = 6 - sq, bx1 = 37 + sq
  var by0 = 13 - lift + sq * 3, by1 = 24 - lift + Math.min(sq, 1)
  var gripRy = 5.6 - sq * 1.2, gripCy = 25.6 - lift + sq * 0.8
  var gl = [11.0 - sq, gripCy], gr = [32.0 + sq, gripCy]
  function inBody(x, y) {
    return inRRect(x, y, bx0, by0, bx1, by1, 5) || inEllipse(x, y, gl[0], gl[1], 5.3, gripRy) || inEllipse(x, y, gr[0], gr[1], 5.3, gripRy)
  }

  // Cable sprout from the top (behind): a curl that wags, droops when asleep.
  var cable = o.cable || "rest", cx0 = 21.5, cy0 = by0
  var wires = {
    rest:   [[cx0, cy0], [21.5, 10.0], [20.5, 7.5], [18.5, 5.8], [16.0, 5.2]],
    wagA:   [[cx0, cy0], [21.5, 10.0], [21.0, 7.0], [19.5, 4.8], [17.5, 3.6]],
    wagB:   [[cx0, cy0], [21.5, 10.0], [20.0, 8.0], [17.5, 7.0], [15.0, 7.2]],
    droop:  [[cx0, cy0], [21.0, cy0 - 2.5], [18.5, cy0 - 3.5], [16.0, cy0 - 3.0]],
    swingA: [[cx0, cy0], [20.5, 9.0], [18.0, 6.5], [15.0, 5.0]],
    swingB: [[cx0, cy0], [22.5, 9.0], [25.0, 6.5], [28.0, 5.0]]
  }
  var wire = wires[cable] || wires.rest
  for (var wy = 0; wy < by0; wy++)
    for (var wx = 0; wx < W; wx++)
      if (segDist(wire, wx, wy) < 0.6) g[wy][wx] = "o"
  var tip = wire[wire.length - 1]
  layer(g, function(x, y) { return inDisc(x, y, tip[0], tip[1], 1.1) }, "w")

  // Feet under the grips (hidden when tucked).
  var legs = o.legs || "stand"
  var fl = [[10.5, 32.3], [32.5, 32.3]]
  if (legs === "stompL") fl = [[10.5, 30.6], [32.5, 32.3]]
  if (legs === "stompR") fl = [[10.5, 32.3], [32.5, 30.6]]
  if (legs === "wide") fl = [[8.5, 32.3], [34.5, 32.3]]
  if (legs === "dangleA") fl = [[9.5, 33.0], [33.5, 33.0]]
  if (legs === "dangleB") fl = [[11.5, 33.0], [31.5, 33.0]]
  if (legs !== "tuck") {
    layer(g, function(x, y) {
      for (var i = 0; i < 2; i++) if (inEllipse(x, y, fl[i][0] + (i ? 0.5 : -0.5), fl[i][1], 3.0, 1.6)) return true
      return false
    }, function(x, y, inside) { return !inside[y - 1][x] ? "h" : (y + 1 < H && !inside[y + 1][x] ? "n" : "b") })
  }

  // Shoulder bumpers (ears).
  layer(g, function(x, y) {
    return inRRect(x, y, bx0 + 2, by0 - 3, bx0 + 9, by0 + 1, 1.6) || inRRect(x, y, bx1 - 9, by0 - 3, bx1 - 2, by0 + 1, 1.6)
  }, function(x, y, inside) { return !inside[y - 1][x] ? "n" : "d" })

  // Arms behind the body unless they reach the controls.
  var pose = ARM_POSES[o.arms] || ARM_POSES.rest
  var sh = [[bx0 + 1.0, 21.0 - lift + sq], [bx1, 21.0 - lift + sq]]
  var arms = [[sh[0], pose[0]], [sh[1], pose[1]]]
  if (sq > 1) arms = [[sh[0], [bx0 - 3.5, 26.0]], [sh[1], [bx1 + 4.5, 26.0]]]
  var front = [pose[0][0] > bx0 + 1 && pose[0][1] > by0, pose[1][0] < bx1 - 1 && pose[1][1] > by0]
  function inHand(i, x, y) { return inDisc(x, y, arms[i][1][0], arms[i][1][1], 1.8) }
  function armLayer(which) {
    layer(g, function(x, y) {
      for (var i = 0; i < 2; i++) {
        if (!which[i]) continue
        if (segDist(arms[i], x, y) < 1.05 || inHand(i, x, y)) return true
      }
      return false
    }, function(x, y) {
      for (var i = 0; i < 2; i++) if (which[i] && inHand(i, x, y)) return inHand(i, x, y - 1) ? (inHand(i, x, y + 1) ? "b" : "n") : "h"
      return "n"
    })
  }
  armLayer([!front[0], !front[1]])

  // Body
  layer(g, inBody, function(x, y, inside) {
    if (!inside[y - 1][x]) return "h"
    if (y + 1 < H && !inside[y + 1][x]) return "n"
    if (y + 2 < H && !inside[y + 2][x] && y > by1) return "n"
    if (!inside[y][x + 1]) return "n"
    return "b"
  })
  // gloss
  putIf(g, bx0 + 3, by0 + 1, "l", "bh"); putIf(g, bx0 + 4, by0 + 1, "l", "bh"); putIf(g, bx0 + 2, by0 + 2, "l", "bh")

  // D-pad (left) and face buttons (right).
  var dy0 = by0 + 2 + (sq > 0 ? -1 : 0)
  var press = o.press || ""
  var dc = press === "L" || press === "B" ? "e" : "d"
  stamp(g, bx0 + 1, dy0, ["..DD..", "..DD..", "DDDDDD", "DDDDDD", "..DD..", "..DD.."], { "D": dc })
  put(g, bx0 + 3, dy0, "n"); put(g, bx0 + 1, dy0 + 2, "n")
  var bcx = bx1 - 4, bcy = dy0 + 2
  var lit = o.lit || ""
  // dark well behind the four buttons
  stamp(g, bcx - 3, bcy - 2, ["..DD..", ".DDDD.", "DDDDDD", "DDDDDD", ".DDDD.", "..DD.."], { "D": "d" })
  var btn = [["t", bcx - 1, bcy - 2, "w"], ["l", bcx - 3, bcy, "p"], ["r", bcx + 1, bcy, "r"], ["b", bcx - 1, bcy + 2, "l"]]
  for (var k = 0; k < btn.length; k++) {
    var c = lit === btn[k][0] ? "x" : btn[k][3]
    if ((press === "R" || press === "B") && lit === btn[k][0]) c = "e"
    stamp(g, btn[k][1], btn[k][2], ["CC", "CC"], { "C": c })
  }

  // Face
  if (o.face) drawFace(g, 22, by0 + 2 - sq, o.face, sq)

  armLayer([front[0], front[1]])

  if (o.trophy) {
    // balanced proudly on its head
    stamp(g, 16, by0 - 10, TROPHY)
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

  var rows = []
  for (var y6 = 0; y6 < H; y6++) rows.push(g[y6].join(""))
  return rows
}

var cache = {}
var cacheSize = 0
function frame(o) {
  var f = o.face || {}
  var key = [o.lift || 0, o.squash || 0, o.arms || "", o.legs || "", o.cable || "", o.lean || 0, o.press || "", o.lit || "",
    o.trophy ? 1 : 0, o.face ? [f.eyes, f.mouth, f.brows || "", f.blush ? 1 : 0, f.lookX || 0, f.lookY || 0].join(",") : ""].join("|")
  var hit = cache[key]
  if (hit) return hit
  if (cacheSize > 500) { cache = {}; cacheSize = 0 }
  var rows = build(o)
  cache[key] = rows
  cacheSize++
  return rows
}

var shadow = [
  ["......tttttttttttttttttttttttttttt......", ".........tttttttttttttttttttttt........."],
  [".........tttttttttttttttttttttt.........", "............tttttttttttttttt............"],
  ["............tttttttttttttttt............", "........................................"]
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

var BUTTONS = ["t", "r", "b", "l"]

function scene(st, fx0) {
  if (fx0) init(fx0)
  var t = st.t, tick = Math.floor(t * 4), mood = st.mood, strain = st.strain || 0
  var o = { arms: "rest", legs: "stand", cable: "rest" }
  var face = { eyes: st.blink ? "blink" : "open", mouth: "smile", lookX: 0, lookY: 0 }
  var dx = 0, dy = 0, fx = []
  var sleepy = mood === "idle" && !st.hovered && !st.bop && !st.reaction && !st.dragged && st.landT < 0

  if (sleepy) {
    o.squash = 1; o.legs = "tuck"; o.arms = "tuck"; o.cable = "droop"
    o.lift = Math.floor(st.wall) % 3 === 0 ? 1 : 0
    face = { eyes: "sleep", mouth: "tiny" }
    for (var z = 0; z < 2; z++) {
      var ph = ((st.wall * 0.35 + z * 0.5) % 1 + 1) % 1
      if (ph < 0.85) fx.push({ rows: z === 0 ? FX.zed : FX.zedSmall, x: 35 + Math.round(Math.sin(ph * 6.28)) - z * 3, y: 13 - Math.round(ph * 11), c: "o", op: 0.7 })
    }
  } else if (mood === "idle" || mood === "ready") {
    var fd = st.fidget, ft = st.fidgetT
    if (fd === "press") {
      // presses its own buttons, one after another, delighted
      var step = Math.floor(ft * 4)
      o.arms = "pressR"
      o.lit = BUTTONS[step % 4]
      o.press = step % 2 === 0 ? "R" : ""
      face.eyes = "happy"; face.mouth = step % 2 === 0 ? "o" : "grin"; face.lookX = 1; face.lookY = 0
      o.cable = step % 2 === 0 ? "wagA" : "wagB"
    } else if (fd === "look") {
      face.lookX = ft < 0.9 ? -1 : ft < 1.9 ? 1 : 0
      face.lookY = ft > 1.9 && ft < 2.5 ? -1 : 0
      face.mouth = "flat"
    } else if (fd === "stretch") {
      var up = ft > 0.3 && ft < 2.2
      o.arms = up ? "high" : "up"; o.lift = up ? 1 : 0
      face.eyes = up ? "happy" : "open"; face.mouth = up ? "o" : "smile"
    } else if (fd === "wiggle") {
      dx = tick % 4 < 2 ? -1 : 1
      o.arms = tick % 4 < 2 ? "danceA" : "danceB"
      o.cable = tick % 2 === 0 ? "wagA" : "wagB"
      face.eyes = "happy"; face.mouth = "omega"
    } else if (fd === "dpad") {
      var s2 = Math.floor(ft * 4)
      o.arms = "mashA"; o.press = s2 % 2 === 0 ? "L" : ""
      face.lookX = s2 % 4 < 2 ? -1 : 1; face.mouth = "tiny"
    }
    if (mood === "idle" && !fd && face.eyes === "open") face.eyes = "half"
    if (st.hovered && !fd) face.mouth = "grin"
  } else if (mood === "launching") {
    o.arms = tick % 2 === 0 ? "up" : "high"
    o.cable = tick % 2 === 0 ? "wagA" : "wagB"
    dy = tick % 2 === 0 ? -2 : 0
    face = { eyes: "sparkle", mouth: "big" }
    if (tick % 4 < 3) fx.push({ rows: FX.bang, x: 39, y: 2, c: "o", op: 1 })
    if (tick % 2 === 0) fx.push({ rows: FX.sparkle[1], x: 1, y: 6, c: "o", op: 1 })
  } else if (mood === "playing") {
    if (strain === 0) {
      // focused button mashing, tongue out
      o.arms = tick % 2 === 0 ? "mashA" : "mashB"
      o.press = tick % 2 === 0 ? "L" : "R"
      o.lit = tick % 2 === 0 ? "" : BUTTONS[Math.floor(tick / 2) % 4]
      face = { eyes: "focusL", brows: "focus", mouth: "tongue", lookX: tick % 8 < 4 ? 0 : 1, lookY: 0 }
      o.cable = "rest"
    } else if (strain === 1) {
      // the system is struggling, so is the player
      o.arms = tick % 2 === 0 ? "mashA" : "mashB"
      o.press = "B"
      o.lit = BUTTONS[tick % 4]
      face = { eyes: "strainL", mouth: "grit" }
      dx = tick % 2 === 0 ? -1 : 1
      o.legs = tick % 2 === 0 ? "stompL" : "stompR"
      o.cable = tick % 2 === 0 ? "wagA" : "wagB"
      sweat(fx, t, 2)
      if (tick % 4 < 2) { fx.push({ rows: FX.effort, x: 0, y: 12, c: "o", op: 1 }); fx.push({ rows: effortR, x: 40, y: 12, c: "o", op: 1 }) }
    } else {
      // maxed out: dizzy, still mashing but wobbling
      o.arms = tick % 2 === 0 ? "mashA" : "flailB"
      o.press = tick % 2 === 0 ? "L" : ""
      o.lit = BUTTONS[tick % 4]
      face = { eyes: tick % 2 === 0 ? "dizzy" : "dizzyB", mouth: "wobble" }
      dx = [0, -1, 0, 1][tick % 4]
      o.cable = tick % 2 === 0 ? "swingA" : "swingB"
      fx.push({ rows: FX.spiral[tick % 2], x: 36, y: 1, c: "o", op: 1 })
      sweat(fx, t, 3)
    }
  } else if (mood === "report") {
    o.arms = "hips"; o.trophy = true; o.cable = "droop"
    face = { eyes: "happy", mouth: "grin", blush: true }
    fx.push({ rows: FX.sparkle[st.blink ? 1 : 0], x: 28, y: 0, c: "o", op: 1 })
    fx.push({ rows: FX.sparkle[st.blink ? 0 : 1], x: 10, y: 3, c: "o", op: 1 })
  }

  // cat dancing next door: bop along (unless busy struggling)
  if (st.bop && mood !== "playing" && mood !== "launching" && !st.reaction) {
    var gb = st.beat
    o.arms = gb % 2 === 0 ? "danceA" : "danceB"
    o.cable = gb % 2 === 0 ? "wagA" : "wagB"
    o.squash = 0; o.legs = "stand"; o.lift = 0
    dy = gb % 2 === 0 ? -1 : 0
    dx = Math.floor(gb / 2) % 2 === 0 ? -1 : 1
    face = { eyes: "happy", mouth: gb % 2 === 0 ? "grin" : "omega" }
    if (mood === "report") { o.trophy = true; o.cable = "droop"; face.blush = true }
    for (var nn = 0; nn < 2; nn++) {
      var np = ((t * 0.7 + nn * 0.5) % 1 + 1) % 1
      if (np < 0.8) fx.push({ rows: nn === 0 ? FX.note : FX.noteDouble, x: 2 + nn * 4 + Math.round(Math.sin(np * 6.28)), y: 12 - Math.round(np * 11), c: "o", op: 1 })
    }
  }

  // ---- touch reactions ----
  var struggling = mood === "playing" && strain > 0
  if (st.dragged) {
    o = { arms: tick % 2 === 0 ? "flailA" : "flailB", legs: tick % 2 === 0 ? "dangleA" : "dangleB",
          cable: tick % 2 === 0 ? "swingA" : "swingB", lean: st.lean || 0 }
    face = { eyes: "wide", mouth: "wobble", brows: "worry" }
    dy = -2; dx = 0
    fx = []
    if (tick % 4 < 3) fx.push({ rows: FX.bang, x: 40, y: 1, c: "r", op: 1 })
    sweat(fx, t, 1)
  } else if (st.landT >= 0) {
    var lt = st.landT
    o = { arms: "rest", legs: "stand", cable: "rest" }
    fx = []; dx = 0; dy = 0
    if (lt < 0.3) {
      o.squash = 2; o.legs = "wide"; o.cable = "droop"
      face = { eyes: "squintL", mouth: "o" }
      fx.push({ rows: FX.dust[0], x: 1, y: 31, c: "o", op: 0.6 })
      fx.push({ rows: FX.dust[1], x: 37, y: 31, c: "o", op: 0.6 })
    } else if (lt < 0.5) {
      dy = -1; o.cable = "wagA"
      face = { eyes: "wide", mouth: "o" }
      fx.push({ rows: FX.dust[1], x: 0, y: 30, c: "o", op: 0.35 })
      fx.push({ rows: dustR, x: 38, y: 30, c: "o", op: 0.35 })
    } else {
      var lk = Math.floor(lt * 4)
      face = { eyes: lk % 2 === 0 ? "dizzy" : "dizzyB", mouth: "wobble" }
      dx = lk % 2 === 0 ? -1 : 1
      o.cable = lk % 2 === 0 ? "swingA" : "swingB"
      fx.push({ rows: FX.spiral[lk % 2], x: 36, y: 1, c: "o", op: 1 })
    }
  } else if (st.reaction === "squish") {
    o = { arms: "out", legs: "wide", cable: "droop", squash: 2 }
    face = { eyes: "happy", mouth: tick % 2 === 0 ? "giggle" : "grin", blush: true }
    dx = tick % 2 === 0 ? 0 : 1; dy = 0
    fx = struggling ? keepSweat(t) : []
    if (tick % 4 < 2) fx.push({ rows: FX.sparkle[tick % 2], x: 38, y: 12, c: "o", op: 1 })
  } else if (st.reaction === "pet") {
    var rt = st.reactT, rk = Math.floor(rt * 4)
    o = { arms: rk % 2 === 0 ? "danceA" : "danceB", legs: "stand", cable: rk % 2 === 0 ? "wagA" : "wagB",
          lit: BUTTONS[rk % 4] }
    face = struggling ? { eyes: "strainL", mouth: "grin", blush: true } : { eyes: "squintL", mouth: "omega", blush: true }
    dx = rk % 2 === 0 ? -1 : 1
    dy = rt < 0.25 ? -1 : 0
    fx = struggling ? keepSweat(t) : []
    var hp = Math.min(1, rt / 1.6)
    fx.push({ rows: FX.heart, x: 36 + rk % 2, y: 12 - Math.round(hp * 10), c: "r", op: hp < 0.9 ? 1 : 0.5 })
    if (rt > 0.5) {
      var hp2 = Math.min(1, (rt - 0.5) / 1.3)
      fx.push({ rows: FX.heartSmall, x: 2 - rk % 2, y: 12 - Math.round(hp2 * 9), c: "r", op: hp2 < 0.9 ? 1 : 0.5 })
    }
  } else if (st.reaction === "annoyed") {
    o = { arms: "hips", legs: tick % 2 === 0 ? "stompL" : "stompR", cable: "swingB", lit: "r" }
    face = { eyes: "angryL", brows: "angry", mouth: "pout" }
    dx = tick % 2 === 0 ? -1 : 0; dy = 0
    fx = struggling ? keepSweat(t) : []
    fx.push({ rows: FX.anger, x: 36, y: tick % 2 === 0 ? 2 : 3, c: "r", op: 1 })
    if (tick % 3 === 0) fx.push({ rows: FX.puff[0], x: 2, y: 8, c: "o", op: 0.5 })
  }

  // hover: eyes follow the pointer
  if (st.hovered && face && !st.reaction && !st.dragged && (face.eyes === "open" || face.eyes === "half" || face.eyes === "blink")) {
    face.lookX = st.lookX; face.lookY = st.lookY
    if (face.eyes === "half") face.eyes = "open"
  }

  o.face = face
  if (fx.length > FX_SLOTS) fx = fx.slice(0, FX_SLOTS)
  var air = Math.max(0, -dy)
  return { rows: frame(o), x: dx, y: dy, shadow: shadow[Math.min(2, air)], fx: fx }
}

function sweat(fx, t, n) {
  for (var i = 0; i < n; i++) {
    var p = ((t * 1.1 + i / n) % 1 + 1) % 1
    var side = i % 2 === 0
    if (p < 0.85) fx.push({ rows: FX.sweat, x: side ? 37 : 2, y: 8 + Math.round(p * 9) + i, c: "l", op: 1 })
  }
}

function keepSweat(t) { var fx = []; sweat(fx, t, 1); return fx }
