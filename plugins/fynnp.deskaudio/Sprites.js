.pragma library

// Audio card cat, v2: a sitting tabby on a 44x38 cell grid (drawn at px 2),
// built from shapes like the screensaver cat (plugins/fynnp.catsaver) but
// awake: big head, big glinting eyes, blush, a tiny ω mouth, pink ear
// insides, tabby stripes, light chest and socks, a tail that moves.
// Guide: docs/PETS.md.
//
// Two halves:
//   rows(key)    -> the frame for a pose key (built once, then memoised)
//   scene(state) -> what the cat does right now: { key, dx, fx[] }. All the
//                   choreography (dances, fidgets, reactions) lives here as
//                   pure functions of a tick counter, so the QML side only
//                   feeds inputs and the preview tool can replay everything.
//
// Palette keys (PetColors): o outline  b body  h highlight  n shade  d stripes
// w light fur  l lightest  p pink  e ink  x glint  t floor shadow.

var W = 44
var H = 38
var FLOOR = 36          // body cells end at row 35; rows 36-37 hold the shadow
var CX = 19.5           // centre line (cell 19 is the middle column)

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

function ell(x, y, cx, cy, rx, ry) {
  var dx = (x + 0.5 - cx) / rx
  var dy = (y + 0.5 - cy) / ry
  return dx * dx + dy * dy <= 1
}

function inTri(x, y, a, b, c) {
  var px = x + 0.5, py = y + 0.5
  function s(p1, p2) { return (px - p2[0]) * (p1[1] - p2[1]) - (p1[0] - p2[0]) * (py - p2[1]) }
  var d1 = s(a, b), d2 = s(b, c), d3 = s(c, a)
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0))
}

// Distance from the cell centre to a polyline, and how far along it.
function polyHit(pts, x, y) {
  var px = x + 0.5, py = y + 0.5, acc = 0, best = 1e9, at = 0
  for (var i = 0; i + 1 < pts.length; i++) {
    var a = pts[i], b = pts[i + 1]
    var vx = b[0] - a[0], vy = b[1] - a[1], len = Math.sqrt(vx * vx + vy * vy)
    var t = Math.max(0, Math.min(1, ((px - a[0]) * vx + (py - a[1]) * vy) / (len * len)))
    var ex = a[0] + vx * t - px, ey = a[1] + vy * t - py, d = Math.sqrt(ex * ex + ey * ey)
    if (d < best) { best = d; at = acc + t * len }
    acc += len
  }
  return { d: best, at: at, len: acc }
}

function capsule(a, b, r) {
  return function(x, y) { return polyHit([a, b], x, y).d <= r }
}

// Fill a mask with `fill` (key or fn(x, y, inside)), then ring it with a
// one-cell outline (8-neighbourhood) over whatever was there. Cells at or
// below `floorY` are clipped; the outline may sit on the floor row.
function layer(g, mask, fill, floorY) {
  if (floorY === undefined) floorY = FLOOR
  var inside = []
  var x, y
  for (y = 0; y < H; y++) {
    var r = []
    for (x = 0; x < W; x++) r.push(y < floorY && mask(x, y))
    inside.push(r)
  }
  for (y = 0; y < H; y++) {
    for (x = 0; x < W; x++) {
      if (inside[y][x]) { g[y][x] = typeof fill === "function" ? fill(x, y, inside) : fill; continue }
      if (y > floorY) continue
      var edge = false
      for (var dy = -1; dy <= 1 && !edge; dy++)
        for (var dx = -1; dx <= 1 && !edge; dx++) {
          var yy = y + dy, xx = x + dx
          if (yy >= 0 && yy < H && xx >= 0 && xx < W && inside[yy][xx]) edge = true
        }
      if (edge) g[y][x] = "o"
    }
  }
  return inside
}

function put(g, x, y, c) { if (y >= 0 && y < H && x >= 0 && x < W) g[y][x] = c }
function putIf(g, x, y, c, only) { if (y >= 0 && y < H && x >= 0 && x < W && only.indexOf(g[y][x]) >= 0) g[y][x] = c }

// Paint a small stamp (rows of chars, "." = leave) with its top-left at x, y.
function stamp(g, rows, x, y, only) {
  for (var r = 0; r < rows.length; r++)
    for (var c = 0; c < rows[r].length; c++) {
      var ch = rows[r].charAt(c)
      if (ch === ".") continue
      if (only) putIf(g, x + c, y + r, ch, only); else put(g, x + c, y + r, ch)
    }
}

function mirrorRows(rows) {
  var out = []
  for (var i = 0; i < rows.length; i++) out.push(rows[i].split("").reverse().join(""))
  return out
}

// Top-lit shading: highlight under the upper contour (light comes from the
// upper left), shade above the lower contour and down the right side.
function shader(base, hiRight) {
  return function(x, y, inside) {
    var up = y === 0 || !inside[y - 1][x]
    if (up && x < hiRight) return "h"
    var down = y + 1 >= H || !inside[y + 1][x]
    if (down) return "n"
    if (x + 1 < W && !inside[y][x + 1] && !up) return "n"
    return base
  }
}

// ---------------------------------------------------------------- poses
//
// A pose is a flat object; its key is the fields joined with "|".
var FIELDS = ["body", "lift", "hx", "hy", "face", "eyes", "lx", "ly", "brow",
              "mouth", "blush", "ears", "paws", "tail", "puff", "lean", "breath", "hp"]

function pose(over) {
  var p = { body: "sit", lift: 0, hx: 0, hy: 0, face: "f", eyes: "open", lx: 0, ly: 0, brow: "-",
            mouth: "w", blush: 1, ears: "n", paws: "down", tail: "rest", puff: 0, lean: 0, breath: 0, hp: "on" }
  if (over) for (var k in over) p[k] = over[k]
  return p
}

function keyOf(p) {
  var out = []
  for (var i = 0; i < FIELDS.length; i++) out.push(p[FIELDS[i]])
  return out.join("|")
}

function parseKey(key) {
  var parts = String(key).split("|")
  var p = {}
  for (var i = 0; i < FIELDS.length; i++) {
    var v = parts[i]
    p[FIELDS[i]] = /^-?\d+$/.test(v) ? parseInt(v, 10) : v
  }
  return pose(p)
}

// Body plans: head/body geometry per posture.
var BODY = {
  //        head dy, head rx/ry add, torso cy/rx/ry, haunch cy/ry, leg top, ear len
  sit:     { hy: 0, hrx: 0, hry: 0, ty: 30.2, trx: 7.0, try_: 6.6, ay: 32.8, ary: 3.4, leg: 29.4, ear: 1 },
  crouch:  { hy: 2, hrx: 0.8, hry: -0.9, ty: 31.2, trx: 7.8, try_: 5.4, ay: 33.4, ary: 2.8, leg: 30.6, ear: 0.92 },
  squish:  { hy: 3, hrx: 1.4, hry: -1.6, ty: 31.8, trx: 8.6, try_: 4.8, ay: 33.6, ary: 2.6, leg: 31.4, ear: 0.82 },
  stretch: { hy: -1, hrx: -0.3, hry: 0.2, ty: 29.6, trx: 6.6, try_: 7.2, ay: 32.8, ary: 3.4, leg: 29, ear: 1.05 },
  loaf:    { hy: 5, hrx: 0, hry: 0, ty: 30.6, trx: 13, try_: 6, ay: 0, ary: 0, leg: 0, ear: 0.9 },
  dangle:  { hy: 0, hrx: -0.4, hry: 0, ty: 29.0, trx: 5.8, try_: 6.6, ay: 0, ary: 0, leg: 27, ear: 1 }
}

// Ears: [angle of the cat's left ear, of its right ear] in degrees (+ = towards
// the middle), length scale.
var EARS = {
  n: [0, 0, 1], perk: [6, 6, 1.14], flat: [-68, -68, 0.86], droop: [-26, -26, 0.92],
  l: [-24, 14, 1], r: [14, -24, 1], twL: [-48, -18, 0.94], twR: [-18, -48, 0.94]
}

function rot(pt, pivot, deg) {
  var a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a)
  var dx = pt[0] - pivot[0], dy = pt[1] - pivot[1]
  // Positive angle tilts the left ear's tip towards the middle (clockwise).
  return [pivot[0] + dx * c - dy * s, pivot[1] + dx * s + dy * c]
}

function earTris(hcx, hcy, deg, len, side) {
  // Left ear around a pivot on the head's upper left; right ear = mirror.
  var pivot = [hcx - 7.0, hcy - 5.6]
  function T(pt) {
    var p = [pivot[0] + (pt[0] - pivot[0]), pivot[1] + (pt[1] - pivot[1]) * len]
    p = rot(p, pivot, deg)
    if (side > 0) p = [2 * hcx - p[0], p[1]]
    return p
  }
  var outer = [T([hcx - 9.4, hcy - 12.7]), T([hcx - 12.6, hcy - 2.6]), T([hcx - 2.6, hcy - 7.6])]
  var inner = [T([hcx - 9.2, hcy - 10.6]), T([hcx - 11.0, hcy - 4.6]), T([hcx - 5.0, hcy - 7.0])]
  return { outer: outer, inner: inner }
}

// Tail paths (continuous coords). Drawn behind the body unless `front`.
var TAILS = {
  rest: [[25.0, 34.0], [30.0, 34.4], [34.2, 33.2], [36.0, 30.4], [35.2, 27.8]],
  low:  [[25.5, 33.5], [29.6, 33.4], [33.4, 31.2], [35.4, 28.0], [35.0, 25.6]],
  mid:  [[25.5, 33.0], [29.4, 31.4], [32.4, 28.0], [33.6, 24.2], [32.6, 21.8]],
  up:   [[25.0, 32.6], [29.4, 30.0], [32.4, 26.0], [33.4, 21.6], [32.0, 18.8]],
  swR:  [[25.5, 33.0], [30.0, 32.0], [34.2, 29.4], [37.0, 25.8], [38.0, 23.0]],
  swL:  [[13.5, 33.0], [9.0, 32.0], [4.8, 29.4], [2.4, 26.0], [1.8, 23.0]],
  midL: [[13.5, 33.0], [9.6, 31.4], [6.6, 28.0], [5.4, 24.2], [6.4, 21.8]],
  wrap: [[34.6, 33.0], [32.4, 34.6], [27.6, 35.0], [23.2, 34.6]],
  back: [[19.5, 34.6], [19.6, 30.0], [20.8, 26.0], [23.4, 23.0], [25.6, 23.4]]
}
var FRONT_TAILS = { wrap: true, back: true }

// Eye stamps: 4 wide, top row at eye row 0 (y 14); rows may start above with
// `dy`. L = cat's left eye (viewer's left), R defaults to the same stamp (so
// the glint stays on the same side); `m` mirrors it for slanted shapes.
var EYES = {
  open:   { dy: -1, L: [".ee.", "exxe", "exee", "eeee", ".ee."] },
  look:   { dy: -1, L: [".ee.", "exxe", "exee", "eeee", ".ee."] },
  wide:   { dy: -1, L: [".ll.", "llll", "leel", "leel", ".ll."] },
  half:   { dy: 1, L: ["eeee", "exee", ".ee."] },
  blink:  { dy: 2, L: ["eeee", ".ee."] },
  sleep:  { dy: 1, L: ["e..e", ".ee."] },
  happy:  { dy: 1, L: [".ee.", "e..e"] },
  squint: { dy: 0, L: ["ee..", "..ee", "ee.."], m: true },
  strain: { dy: 0, L: ["e...", ".eee", "e..."], m: true },
  angry:  { dy: 0, L: ["e...", "eee.", "eeee", ".ee."], m: true },
  dizzy:  { dy: -1, L: ["eeee", "...e", "ee.e", "e..e", "eeee"] },
  peek:   { dy: 1, L: ["e..e", ".ee."], R: [".ee.", "exxe", "eeee", ".ee."], Rdy: 0 },
  wink:   { dy: -1, L: [".ee.", "exxe", "exee", "eeee", ".ee."], R: [".ee.", "e..e"], Rdy: 1 }
}

// Brows sit just above the eyes (cells relative to the eye's top-left).
var BROWS = {
  worry: [[0, -2], [1, -2], [2, -3], [3, -3]],
  angry: [[0, -3], [1, -3], [2, -2], [3, -2]]
}

// Mouth stamps, centred on the middle column, top row at y 20.
var MOUTHS = {
  w:      ["e.e.e", ".e.e."],
  o:      [".e.", "epe", ".e."],
  sing:   [".eee.", "eeeee", "eppe e".replace(" ", "e"), ".eee."],
  smile:  ["e...e", ".eee."],
  grit:   ["eeeee", "exxxe", "eeeee"],
  wobble: [".e.e.", "e.e.e"],
  pout:   [".e.", "e.e"],
  hiss:   ["eeeee", "exexe", "eeeee", ".epe."],
  yawn:   [".eee.", "eeeee", "eeeee", "epppe", ".eee."],
  mlem:   ["e.e.e", ".epe.", "..p.."],
  laugh:  ["eeeee", "eeeee", ".epe."],
  none:   []
}
MOUTHS.sing = [".eee.", "eeeee", "epppe", ".eee."]

// Front paws: shoulder -> paw end. dn = paw resting on the floor.
function pawPath(kind, side, b) {
  // side -1 = cat's left (viewer's left), +1 = right. Coords are given for the
  // left paw and mirrored. `out`: the paw pokes out beside the head, so the arm
  // goes behind the head and only the paw is drawn in front.
  var shoulder = [CX + side * 4.0, Math.min(b.leg, 26.4) + (b.leg - 29.4)]
  var outer = [CX + side * 8.4, 25.0 + (b.leg - 29.4)]
  function m(x) { return side < 0 ? x : 2 * CX - x }
  function P(px, py, rx, ry, out) { return { a: out ? outer : shoulder, b: [m(px), py], paw: [m(px), py], rx: rx, ry: ry, out: out } }
  switch (kind) {
  case "wave":  return P(4.0, 19.0, 2.0, 1.9, true)
  case "wave2": return P(3.4, 15.2, 2.0, 1.9, true)
  case "up":    return P(3.8, 11.2, 2.0, 1.9, true)
  case "up2":   return P(4.6, 6.8, 2.0, 1.9, true)
  case "point": return P(2.6, 9.0, 1.8, 1.8, true)
  case "low":   return P(6.4, 31.6, 1.9, 1.7, false)
  case "lick":  return P(17.6, 23.4, 2.2, 1.8, false)
  case "lick2": return P(17.2, 21.8, 2.2, 1.8, false)
  case "clap":  return P(18.3, 26.4, 1.7, 2.0, false)
  case "open":  return P(12.8, 26.8, 1.8, 2.0, false)
  }
  return null
}

var PAWS = {
  //       cat's left, cat's right
  down:   ["down", "down"],
  waveL:  ["wave", "down"],  waveL2: ["wave2", "down"],
  waveR:  ["down", "wave"],  waveR2: ["down", "wave2"],
  up:     ["up", "up"],      up2:    ["up2", "up2"],
  lick:   ["down", "lick"],  lick2:  ["down", "lick2"],
  clap:   ["clap", "clap"],  open:   ["open", "open"],
  pointR: ["low", "point"],  pointL: ["point", "low"],
  tuck:   [null, null],      dangle: [null, null]
}

// ---------------------------------------------------------------- frame

function build(p) {
  var g = grid()
  var b = BODY[p.body] || BODY.sit
  var lean = p.lean | 0
  var breath = p.breath | 0
  var hcx = CX + p.hx + (p.body === "loaf" ? -2 : 0)
  var hcy = 15.5 + b.hy + p.hy
  var hrx = 11.6 + b.hrx, hry = 8.7 + b.hry
  var back = p.face === "b"
  var fs = p.face === "l" ? -2 : p.face === "r" ? 2 : 0
  var floorY = p.body === "dangle" ? H : FLOOR
  var e = EARS[p.ears] || EARS.n
  var tailPts = TAILS[p.tail] || TAILS.rest
  var tailR = p.puff ? 2.2 : 1.5

  // -- tail
  function drawTail(pts) {
    var hit0 = polyHit(pts, 0, 0)
    var tlen = hit0.len
    layer(g, function(x, y) {
      var r = tailR
      if (p.puff) r += ((x * 7 + y * 13) % 3) * 0.25   // ragged, bristling fur
      return polyHit(pts, x, y).d <= r
    }, function(x, y) {
      var h = polyHit(pts, x, y)
      if (h.at > tlen - 2.4) return "d"
      if (Math.floor(h.at) % 4 === 2) return "d"
      return h.at < 2.5 ? "n" : "b"
    }, floorY)
  }
  if (p.body === "dangle") {
    var tx = 24.6 + lean * 1.6
    drawTail([[22.8, 32.0], [24.0, 35.0], [tx, 37.6]])
  } else if (!FRONT_TAILS[p.tail]) drawTail(tailPts)

  // -- body
  var sitting = p.body !== "loaf" && p.body !== "dangle"
  var pk = PAWS[p.paws] || PAWS.down
  var legDown = [pk[0] === "down", pk[1] === "down"]
  var bcx = p.body === "loaf" ? CX + 2.6 : CX
  var tcy = b.ty - (p.body === "loaf" ? breath * 0.6 : 0), trx = b.trx, tryy = b.try_ + (p.body === "loaf" ? breath * 0.6 : 0)
  if (p.body === "stretch") tcy -= 0
  layer(g, function(x, y) {
    if (ell(x, y, bcx, tcy, trx, tryy)) return true
    if (b.ary > 0 && (ell(x, y, CX - 5.6, b.ay, 3.8, b.ary) || ell(x, y, CX + 5.6, b.ay, 3.8, b.ary))) return true
    if (sitting && (ell(x, y, CX - 8.0, 34.9, 2.6, 1.5) || ell(x, y, CX + 8.0, 34.9, 2.6, 1.5))) return true
    return false
  }, function(x, y, inside) {
    if (sitting) {
      var lf = x - Math.floor(CX)                    // column from the middle
      var al = Math.abs(lf)
      // hind feet: light toes with a toe line
      if (y >= 34 && al >= 6) return (al === 8 && y === 35) ? "n" : "w"
      // front legs (when on the floor), split by a centre line
      var down = lf < 0 ? legDown[0] : legDown[1]
      if (y + 0.5 > b.leg && !back) {
        if (lf === 0 && down) return "o"
        if (down && al >= 1 && al <= 4) {
          if (y >= 33) return (y === 35 && (al === 2 || al === 3)) ? "n" : (al === 2 && y === 35 ? "n" : "w")
          return al === 4 ? "n" : (y + 0.5 < b.leg + 1 ? "h" : "b")
        }
        if (down && al === 5) return "o"
      }
    }
    // light chest
    if (!back && p.body !== "loaf" && p.body !== "dangle" && ell(x, y, CX, tcy - 2.2, 4.4, 4.8)) return "w"
    if (!back && p.body === "dangle" && ell(x, y, CX, tcy - 1, 3.2, 5)) return "w"
    // tabby stripes on the flanks: short bands slanting down and out
    var fx = x + 0.5 - bcx
    var side = fx < 0 ? -1 : 1
    var ax = Math.abs(fx)
    if (p.body !== "loaf" && b.ary > 0) {
      // two short stripes curving over each haunch
      var hy0 = b.ay - b.ary + 0.5
      if ((Math.abs(ax - 7.0) < 1.1 && Math.abs(y + 0.5 - (hy0 + 1.0)) < 0.5) ||
          (Math.abs(ax - 8.4) < 1.0 && Math.abs(y + 0.5 - (hy0 + 2.6)) < 0.5)) return "d"
    }
    var bands = p.body === "loaf" ? [4.2, 7.6, 11.0] : []
    for (var i = 0; i < bands.length; i++) {
      var yy = y + 0.5 - (tcy - tryy)
      var bx = bands[i] + yy * 0.25
      if (yy > 1.6 && yy < (p.body === "loaf" ? 5.2 : 6.0) && Math.abs(ax - bx) < 0.7) return "d"
    }
    if (back && Math.abs(fx) < 0.8 && y < tcy + 2) return "d"   // spine stripe
    return shader("b", bcx + 2)(x, y, inside)
  }, floorY)

  if (p.body === "loaf") {
    // tucked front paws under the chin
    layer(g, function(x, y) { return ell(x, y, CX - 4.4, 35.2, 2.3, 1.3) || ell(x, y, CX + 0.8, 35.2, 2.3, 1.3) }, "w", FLOOR)
  }
  if (p.body === "dangle") {
    // limp legs: hind legs splay, front legs hang; they swing with the drag
    var legs = [
      [[CX - 4.6, 31.4], [CX - 5.8 + lean, 35.2]], [[CX + 4.6, 31.4], [CX + 5.8 + lean, 35.2]],
      [[CX - 2.0, 28.0], [CX - 2.2 + lean, 33.6]], [[CX + 2.0, 28.0], [CX + 2.2 + lean, 33.6]]
    ]
    for (var li = 0; li < legs.length; li++) {
      (function(seg) {
        layer(g, function(x, y) { return polyHit(seg, x, y).d <= 1.35 }, function(x, y) {
          return y + 0.5 > seg[1][1] - 1.6 ? "w" : (x + 0.5 > seg[0][0] + 0.4 ? "n" : "b")
        }, H)
      })(legs[li])
    }
  }

  // -- front legs on the floor (raised ones are drawn after the head)
  var raised = []
  function drawLeg(kind, side, part) {
    // part: "arm" (arm only), "paw" (paw only), or both
    var pp = pawPath(kind, side, b)
    if (!pp) return
    var R = 1.3
    function armHit(x, y) { return polyHit([pp.a, pp.b], x, y).d <= R }
    function pawHit(x, y) { return ell(x, y, pp.paw[0], pp.paw[1], pp.rx, pp.ry) }
    layer(g, function(x, y) {
      if (part === "arm") return armHit(x, y)
      if (part === "paw") return pawHit(x, y)
      return armHit(x, y) || pawHit(x, y)
    }, function(x, y) {
      if (pawHit(x, y)) return (y + 0.5 < pp.paw[1] - pp.ry + 1.2) ? "l" : "w"
      return polyHit([pp.a, pp.b], x, y - 1).d > R ? "h" : (side > 0 ? "n" : "b")
    }, floorY)
  }
  if (p.body !== "loaf" && p.body !== "dangle" && !back) {
    for (var s = 0; s < 2; s++) {
      var kind = pk[s]
      if (!kind) continue
      if (kind === "down") continue
      var side0 = s === 0 ? -1 : 1
      if (pawPath(kind, side0, b).out) drawLeg(kind, side0, "arm")
      raised.push([kind, side0])
    }
  }

  // -- ears (before the head so its outline closes their bases)
  var eL = earTris(hcx + (back ? 0 : fs * 0.5), hcy, e[0], e[2] * b.ear, -1)
  var eR = earTris(hcx + (back ? 0 : fs * 0.5), hcy, e[1], e[2] * b.ear, 1)
  layer(g, function(x, y) {
    return inTri(x, y, eL.outer[0], eL.outer[1], eL.outer[2]) || inTri(x, y, eR.outer[0], eR.outer[1], eR.outer[2])
  }, function(x, y) {
    if (!back && (inTri(x, y, eL.inner[0], eL.inner[1], eL.inner[2]) || inTri(x, y, eR.inner[0], eR.inner[1], eR.inner[2]))) return "p"
    var up = !(inTri(x, y - 1, eL.outer[0], eL.outer[1], eL.outer[2]) || inTri(x, y - 1, eR.outer[0], eR.outer[1], eR.outer[2]))
    return up ? "h" : (back ? "n" : "b")
  }, floorY)

  // -- head with chubby cheeks
  var cheekY = hcy + 4.0
  function headMask(x, y) {
    return ell(x, y, hcx, hcy, hrx, hry) || ell(x, y, hcx - hrx + 3.0, cheekY, 3.6, 3.2) || ell(x, y, hcx + hrx - 3.0, cheekY, 3.6, 3.2)
  }
  var mcx = hcx + fs                      // muzzle centre
  var mY = hcy + 5.5
  layer(g, headMask, function(x, y, inside) {
    if (!back && (ell(x, y, mcx - 1.6, mY, 2.5, 1.9) || ell(x, y, mcx + 1.6, mY, 2.5, 1.9))) return "w"
    return shader("b", hcx + hrx * 0.45)(x, y, inside)
  }, floorY)

  // forehead "M" and cheek stripes
  var ftop = Math.round(hcy - hry) + 1
  var mx = Math.round(hcx + (back ? 0 : fs * 0.5)) // middle column
  var tabby = back
    ? [[0, 1], [0, 2], [0, 3], [-3, 1], [-3, 2], [3, 1], [3, 2], [-6, 2], [6, 2]]
    : [[0, 1], [0, 2], [-3, 1], [-3, 2], [3, 1], [3, 2], [-1, 3], [1, 3]]
  for (var ti = 0; ti < tabby.length; ti++) putIf(g, mx + tabby[ti][0] - (tabby[ti][0] < 0 ? 1 : 0), ftop + tabby[ti][1], "d", "bh")

  if (!back) {
    var ey = Math.round(hcy - 1.5)           // eye row 0
    var exL = Math.round(hcx - 7.5) + fs + p.lx, exR = Math.round(hcx + 3.5) + fs + p.lx
    var eyy = ey + p.ly
    var cs = Math.round(hcx - hrx + 1)
    // cheek stripes
    putIf(g, cs, ey + 2, "d", "bhn"); putIf(g, cs + 1, ey + 2, "d", "bhn"); putIf(g, cs, ey + 4, "d", "bhn")
    putIf(g, 2 * Math.round(hcx) - cs - 1 + 1, ey + 2, "d", "bhn"); putIf(g, 2 * Math.round(hcx) - cs - 1, ey + 2, "d", "bhn"); putIf(g, 2 * Math.round(hcx) - cs + 0, ey + 4, "d", "bhn")

    // eyes
    var es = EYES[p.eyes] || EYES.open
    var Lrows = es.L
    var Rrows = es.R || (es.m ? mirrorRows(es.L) : es.L)
    stamp(g, Lrows, exL, eyy + es.dy)
    stamp(g, Rrows, exR, eyy + (es.Rdy !== undefined ? es.Rdy : es.dy))
    if (BROWS[p.brow]) {
      var br = BROWS[p.brow]
      for (var bi = 0; bi < br.length; bi++) {
        put(g, exL + br[bi][0], eyy + br[bi][1] + 1, "e")
        put(g, exR + 3 - br[bi][0], eyy + br[bi][1] + 1, "e")
      }
    }

    // blush
    if (p.blush > 0) {
      var by = ey + 5
      var bxL = exL - 2 - p.lx, bxR = exR + 3 - p.lx
      var bl = p.blush > 1 ? ["ppp", "ppp"] : ["ppp"]
      stamp(g, bl, bxL, by - (p.blush > 1 ? 1 : 0), "bhnw")
      stamp(g, bl, bxR, by - (p.blush > 1 ? 1 : 0), "bhnw")
    }

    // nose + mouth
    var nx = Math.floor(mcx) - 1
    var ny = ey + 5
    put(g, nx, ny, "p"); put(g, nx + 1, ny, "p"); put(g, nx + 2, ny, "p"); put(g, nx + 1, ny + 1, "p")
    var mr = MOUTHS[p.mouth] || MOUTHS.w
    if (mr.length) {
      var mw = mr[0].length
      var my = ny + 2
      stamp(g, mr, nx + 1 - (mw - 1) / 2, my)
    }
  }

  // -- DJ headphones: on the head (ears poke out above the band), or slipped
  // round the neck while it sleeps
  if (p.hp === "on") drawPhonesOn(g, hcx, hcy, hrx, hry, floorY)
  else if (p.hp === "neck") drawPhonesNeck(g, hcx, hcy, hrx, hry, floorY)

  // -- raised paws in front of the body and face
  for (var ri = 0; ri < raised.length; ri++) {
    var rk = raised[ri]
    drawLeg(rk[0], rk[1], pawPath(rk[0], rk[1], b).out ? "paw" : "both")
  }

  // -- front tail (wrapped round the paws, or seen from behind)
  if (FRONT_TAILS[p.tail] && p.body !== "dangle") drawTail(tailPts)

  // -- lift: move everything up, keep the floor shadow down
  var lift = p.lift | 0
  if (p.body === "dangle") lift += 2
  if (lift > 0) {
    for (var y = 0; y < H; y++) g[y] = y + lift < H ? g[y + lift] : emptyRow()
  }

  // -- floor shadow under the feet
  var minX = W, maxX = -1
  for (var yy2 = FLOOR - 3; yy2 < FLOOR; yy2++)
    for (var x2 = 0; x2 < W; x2++) if (g[yy2][x2] !== "." && g[yy2][x2] !== "t") { minX = Math.min(minX, x2); maxX = Math.max(maxX, x2) }
  if (maxX < 0) { minX = 11 + lift; maxX = 28 - lift } else if (lift > 0) { minX = Math.max(minX, 9 + lift * 2); maxX = Math.min(maxX, 30 - lift * 2) }
  if (p.body === "dangle") { minX = 14; maxX = 25 }
  for (var x3 = minX - 1; x3 <= maxX + 1; x3++) if (g[FLOOR][x3] === ".") g[FLOOR][x3] = "t"
  for (var x4 = minX + 2; x4 <= maxX - 2; x4++) if (g[FLOOR + 1][x4] === ".") g[FLOOR + 1][x4] = "t"

  var out = []
  for (var y5 = 0; y5 < H; y5++) out.push(g[y5].join(""))
  return out
}

// Headphone cup: dark shell, pink cushion ring peeking at the head side, a
// glint on the shell.
function drawCup(g, cx, cy, side, rx, ry, floorY) {
  layer(g, function(x, y) { return ell(x, y, cx, cy, rx, ry) }, function(x, y, inside) {
    var up = y === 0 || !inside[y - 1][x]
    var inner = side < 0 ? x + 0.5 > cx + rx - 1.2 : x + 0.5 < cx - rx + 1.2
    if (inner) return "p"
    if (up) return "d"
    if (ell(x, y, cx - side * 0.4, cy - 0.6, 0.9, 1.2)) return "x"
    return "e"
  }, floorY)
}

function arc(cx, cy, rx, ry, a0, a1, n) {
  var pts = []
  for (var i = 0; i <= n; i++) {
    var a = (a0 + (a1 - a0) * i / n) * Math.PI / 180
    pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry])
  }
  return pts
}

function drawPhonesOn(g, hcx, hcy, hrx, hry, floorY) {
  var band = arc(hcx, hcy + 0.4, hrx - 0.4, hry + 0.6, 196, 344, 14)
  layer(g, function(x, y) { return polyHit(band, x, y).d <= 0.85 }, function(x, y, inside) {
    return (y === 0 || !inside[y - 1][x]) ? "d" : "e"
  }, floorY)
  drawCup(g, hcx - hrx + 0.2, hcy + 0.8, -1, 2.5, 3.5, floorY)
  drawCup(g, hcx + hrx - 0.2, hcy + 0.8, 1, 2.5, 3.5, floorY)
}

function drawPhonesNeck(g, hcx, hcy, hrx, hry, floorY) {
  var cy = hcy + hry - 0.6
  var band = arc(hcx, cy - 1.4, 7.6, 2.4, 20, 160, 10)
  layer(g, function(x, y) { return polyHit(band, x, y).d <= 0.8 }, "e", floorY)
  drawCup(g, hcx - 7.8, cy, -1, 2.2, 2.6, floorY)
  drawCup(g, hcx + 7.8, cy, 1, 2.2, 2.6, floorY)
}

function emptyRow() { var r = []; for (var x = 0; x < W; x++) r.push("."); return r }

var memo = {}
function rows(key) {
  var r = memo[key]
  if (!r) { r = build(parseKey(key)); memo[key] = r }
  return r
}
function frame(p) { return rows(keyOf(p)) }

// ---------------------------------------------------------------- effects
// Cat-only effect sprites (the shared ones come from PetFx.js, by name).
var purr = [
  ".o...",
  "o.o.o",
  "...o."
]
var giggle = [
  "o.o",
  ".o.",
  "o.o"
]
var dustL = [
  ".o....",
  "ooo.o.",
  "ooooo."
]
var dustL2 = [
  "o..o..",
  "oo.oo.",
  "......"
]
var noteSmall = [
  ".oo",
  ".o.",
  "oo.",
  "oo."
]

// ---------------------------------------------------------------- scene
//
// state: {
//   mode   "sleep" | "drowsy" | "idle" | "dance"
//   t      tick in 1/8 s (int; advances by 2 at 4 fps, by 1 at 8 fps)
//   tier   dance tier from sustained energy: 0 gentle, 1 normal, 3 intense, 4 maxed
//   amp    instant loudness 0..3
//   blink  bool
//   hov, lx, ly       hover + look direction (-1/0/1)
//   fid, ft           idle fidget name and ticks since it started
//   rea, rt           touch reaction ("" | pet | annoyed | squish) and ticks since
//   drag, lean        layout drag (dangle) and swing
//   lt                ticks since landing (or -1)
//   nb                neighbour: "" | worried | stressed | alert
//   zp                wall-clock seconds (shared phase of the z's with the buddy)
// }
// returns { key, dx, fx: [{ n, x, y, c, o }] } (cells; fx n = effect name).

var FX_SLOTS = 8   // PixelCat has this many effect sprites

var FIDGETS = { lick: 16, yawn: 12, look: 14, stretch: 12, pounce: 12 }
var FIDGET_NAMES = ["lick", "yawn", "look", "stretch", "pounce"]
function fidgetTicks(name) { return (FIDGETS[name] || 0) * 2 }   // FIDGETS in 4 fps steps

var IDLE_TAIL = ["rest", "rest", "rest", "rest", "low", "mid", "mid", "low", "rest", "rest", "rest", "rest", "rest", "low", "mid", "up", "mid", "low", "rest", "rest"]

var DANCE_GENTLE = ["sway", "bob", "swish", "sway", "tap"]
var DANCE_MOVES = ["bob", "side", "wave", "hands", "swish", "spin", "clap", "point", "side", "hands", "bob", "wave", "point", "spin", "clap", "swish"]

function earsFor(lx, ly) { return lx < 0 ? "l" : lx > 0 ? "r" : ly < 0 ? "perk" : "n" }

// Rising effect: phase 0..1 -> whole-cell position, or null when hidden.
function riser(name, phase, x0, y0, height, sway, col) {
  phase = ((phase % 1) + 1) % 1
  if (phase > 0.85) return null
  return { n: name, x: x0 + Math.round(Math.sin(phase * 6.283) * sway), y: Math.round(y0 - phase * height), c: col, o: 1 }
}

function danceMove(s) {
  var b = Math.floor(s.t / 2)          // 4 fps steps; a beat = 2 steps
  var section = Math.floor(b / 16)     // a move lasts two bars (4 s)
  var tier = s.tier
  if (tier <= 0) return DANCE_GENTLE[section % DANCE_GENTLE.length]
  if (tier >= 4 && section % 4 === 3) return "roof"
  if (tier >= 3 && section % 2 === 0) return "bang"
  return DANCE_MOVES[section % DANCE_MOVES.length]
}

function dance(s, out) {
  var b = Math.floor(s.t / 2)
  var i = b % 8, beat = i % 2 === 0
  var amp = s.amp, tier = s.tier
  var hopH = tier <= 0 ? 0 : Math.min(2, amp)          // how high hops go
  var loud = amp >= 2 && tier > 0
  var p = pose({ eyes: "happy", mouth: "w", tail: beat ? "mid" : "low" })
  var move = danceMove(s)
  switch (move) {
  case "sway":
    p.hx = [0, 0, 1, 1, 0, 0, -1, -1][i]
    p.tail = p.hx > 0 ? "low" : p.hx < 0 ? "mid" : "rest"
    p.mouth = amp >= 1 ? "smile" : "w"
    break
  case "tap":
    p.paws = i % 4 === 0 ? "waveR" : "down"
    p.hy = beat ? 1 : 0
    p.tail = beat ? "low" : "mid"
    break
  case "bob":
    p.hy = beat ? 1 : 0
    p.lift = !beat ? Math.min(1, hopH) : 0
    p.mouth = loud && !beat ? "sing" : "w"
    p.tail = beat ? "swR" : "mid"
    p.ears = beat ? "n" : "perk"
    break
  case "side":
    out.dx = [0, -1, -2, -1, 0, 1, 2, 1][i]
    p.hx = [-1, -1, -1, 0, 1, 1, 1, 0][i]
    p.tail = out.dx < 0 ? "swR" : out.dx > 0 ? "midL" : "mid"
    p.lift = beat ? 0 : Math.min(1, hopH)
    p.mouth = loud ? "sing" : "smile"
    break
  case "wave":
    var right = i >= 4
    p.paws = right ? (beat ? "waveR" : "waveR2") : (beat ? "waveL" : "waveL2")
    p.hx = right ? 1 : -1
    p.eyes = right ? "wink" : "happy"
    p.mouth = loud ? "sing" : "o"
    p.tail = right ? "up" : "mid"
    break
  case "hands":
    p.paws = beat ? "up" : "up2"
    p.lift = beat ? 0 : Math.max(1, hopH)
    p.mouth = p.lift > 0 ? "sing" : "o"
    p.ears = p.lift > 0 ? "perk" : "n"
    p.tail = "up"
    break
  case "swish":
    p.hx = beat ? -1 : 1
    p.tail = beat ? "midL" : "swR"
    p.eyes = s.hov ? "open" : "look"
    p.lx = beat ? -1 : 1
    p.ears = beat ? "l" : "r"
    p.mouth = "w"
    out.dx = beat ? -1 : 0
    break
  case "spin":
    p.face = ["f", "l", "b", "r", "f", "f", "f", "f"][i]
    if (p.face === "b") p.tail = "back"
    if (p.face === "l" || p.face === "r") p.eyes = "open"
    if (i === 4) { p.lift = Math.max(1, hopH); p.paws = "up"; p.mouth = "sing" }
    if (i === 5) { p.paws = "up2"; p.mouth = "smile"; p.ears = "perk"; p.tail = "up" }
    if (i >= 6) { p.paws = "down"; p.mouth = "smile"; p.tail = "up" }
    break
  case "clap":
    p.paws = beat ? "clap" : "open"
    p.mouth = beat ? (loud ? "sing" : "o") : "w"
    p.lift = !beat ? Math.min(1, hopH) : 0
    p.tail = beat ? "up" : "mid"
    break
  case "point":
    var r2 = i < 4
    p.paws = beat ? (r2 ? "pointR" : "pointL") : "down"
    p.hx = beat ? (r2 ? 1 : -1) : 0
    p.eyes = "look"; p.lx = r2 ? 1 : -1; p.ly = beat ? -1 : 0
    p.ears = r2 ? "r" : "l"
    p.mouth = loud ? "sing" : "o"
    p.tail = r2 ? "midL" : "swR"
    break
  case "bang":
    // headbanging: head slams down on the beat, flies back up between
    p.hy = beat ? 2 : -1
    p.eyes = "happy"
    p.ears = beat ? "n" : "perk"
    p.mouth = beat ? "smile" : "sing"
    p.paws = beat ? "down" : (b % 4 === 1 ? "waveL2" : "waveR2")
    p.lift = beat ? 0 : 1
    p.tail = beat ? "swR" : "midL"
    out.dx = beat ? 0 : (b % 4 === 1 ? -1 : 1)
    break
  case "roof":
    // raise the roof: paws pumping overhead, big happy hops
    p.paws = beat ? "up2" : "up"
    p.lift = beat ? 2 : 0
    p.mouth = "sing"
    p.ears = "perk"
    p.tail = beat ? "up" : "swR"
    break
  }

  // hover: open eyes and watch the pointer while dancing
  if (s.hov && p.face === "f" && move !== "bang" && move !== "roof") {
    p.eyes = "open"; p.lx = s.lx; p.ly = s.ly
  }

  // notes rise from the top right; more and faster when it's loud
  var spd = tier <= 0 ? 0.04 : 0.06 + amp * 0.015
  var nN = tier <= 0 ? 1 : amp >= 2 ? 3 : 2
  for (var k = 0; k < nN; k++) {
    var f = riser(k === 1 ? "noteDouble" : k === 2 ? "noteSmall" : "note", s.t * spd + k / nN, 36 - k * 3, 14 + k, 14, 1, k === 2 ? "w" : "o")
    if (f) out.fx.push(f)
  }
  if (tier >= 3) {
    // the louder, the more party: sparkles pop around, hearts at max
    var sp = b % 3
    out.fx.push({ n: b % 2 ? "sparkle1" : "sparkle0", x: [2, 37, 6][sp], y: [3, 2, 24][sp], c: "o", o: 1 })
    out.fx.push({ n: b % 2 ? "sparkle0" : "sparkle1", x: [38, 3, 36][sp], y: [24, 14, 12][sp], c: "w", o: 1 })
    if (tier >= 4 && beat) out.fx.push({ n: "heartSmall", x: 1, y: 6 - (b % 4), c: "r", o: 1 })
  }
  return p
}

function idle(s, out) {
  var b = Math.floor(s.t / 2)
  var p = pose({ tail: IDLE_TAIL[Math.floor(b / 2) % IDLE_TAIL.length] })
  if (s.blink) p.eyes = "blink"
  if (s.hov) { p.lx = s.lx; p.ly = s.ly; p.ears = earsFor(s.lx, s.ly) }
  var len = fidgetTicks(s.fid)
  if (s.fid && s.ft >= 0 && s.ft < len && !s.hov) {
    var f = Math.floor(s.ft / 2)
    switch (s.fid) {
    case "lick":
      if (f < 12) {
        p.paws = f % 2 ? "lick2" : "lick"
        p.eyes = "happy"
        p.mouth = f % 2 ? "w" : "mlem"
        p.hy = f % 4 < 2 ? 0 : 1
      } else { p.eyes = f < 14 ? "happy" : p.eyes; p.mouth = "w" }
      break
    case "yawn":
      if (f < 2) { p.eyes = "half"; p.mouth = "o" }
      else if (f < 8) { p.eyes = "squint"; p.mouth = "yawn"; p.ears = "droop"; p.hy = -1 }
      else if (f < 10) { p.eyes = "half"; p.mouth = "w" }
      else p.eyes = "blink"
      break
    case "look":
      p.eyes = "look"
      p.lx = [-1, -1, -1, -1, 0, 1, 1, 1, 1, 0, 0, 0, 0, 0][f]
      p.ly = f >= 9 && f < 12 ? -1 : 0
      p.ears = earsFor(p.lx, p.ly)
      if (f >= 9 && f < 12) out.fx.push({ n: "question", x: 33, y: 4, c: "o", o: 1 })
      break
    case "stretch":
      if (f < 2) { p.body = "crouch"; p.eyes = "half" }
      else if (f < 9) { p.body = "stretch"; p.paws = f % 2 ? "up2" : "up2"; p.eyes = "squint"; p.mouth = f < 6 ? "yawn" : "o"; p.ears = "perk"; p.tail = "up" }
      else { p.eyes = "happy"; p.mouth = "w" }
      break
    case "pounce":
      if (f < 6) { p.eyes = "look"; p.lx = 1; p.ly = 1; p.ears = "r"; p.tail = f % 2 ? "swR" : "low" }
      else if (f === 6) { p.body = "crouch"; p.eyes = "wide"; p.lx = 1; p.ly = 1; p.tail = "swR"; out.fx.push({ n: "bang", x: 34, y: 6, c: "o", o: 1 }) }
      else if (f < 9) { p.lift = 2; p.paws = "up"; p.eyes = "wide"; p.mouth = "o"; p.ears = "perk"; p.tail = "up" }
      else if (f === 9) { p.body = "crouch"; p.eyes = "happy"; p.tail = "low" }
      else { p.eyes = "happy"; p.mouth = "smile"; p.tail = "up" }
      break
    }
  }
  return p
}

function drowsy(s, out) {
  var b = Math.floor(s.t / 2)
  var p = pose({ ears: "droop", tail: "rest" })
  var nod = b % 14
  if (nod < 9) { p.eyes = "half"; p.hy = nod >= 5 ? 1 : 0 }
  else if (nod < 10) { p.eyes = "wide"; p.ears = "perk" }    // jerks awake
  else { p.eyes = s.blink ? "blink" : "open" }
  if (s.hov) { p.eyes = "half"; p.lx = s.lx; p.ears = earsFor(s.lx, 0) }
  return p
}

function sleep(s, out) {
  var p = pose({ body: "loaf", eyes: "sleep", ears: "droop", tail: "wrap", paws: "tuck", hp: "neck" })
  p.breath = (s.t % 24) < 8 ? 1 : 0
  var tw = s.t % 60
  if (tw < 3) p.ears = "twL"
  else if (tw >= 30 && tw < 32) p.ears = "twR"
  if (s.hov) { p.eyes = "peek"; p.lx = 0; p.ears = s.lx < 0 ? "twL" : "twR" }
  // z's (phase from the wall clock, in step with the buddy's)
  for (var k = 0; k < 2; k++) {
    var ph = ((s.zp * 0.35 + k * 0.5) % 1 + 1) % 1
    if (ph < 0.8) out.fx.push({ n: k ? "zedSmall" : "zed", x: 30 + k * 4 + Math.round(Math.sin(ph * 6.28)), y: Math.round(15 - ph * 15), c: "o", o: s.hov ? 0.35 : 0.6 })
  }
  return p
}

function scene(s) {
  var out = { key: "", dx: 0, fx: [] }
  var p
  var t8 = s.t
  if (s.drag) {
    p = pose({ body: "dangle", eyes: "wide", brow: "worry", mouth: "o", ears: "droop", tail: "rest", lean: s.lean || 0 })
    p.lx = -(s.lean || 0)
    var ph = t8 % 8
    out.fx.push({ n: "sweat", x: 32, y: 6 + Math.floor(ph / 2), c: "l", o: 1 })
    if (t8 % 16 < 6) out.fx.push({ n: "bang", x: 37, y: 1, c: "o", o: 1 })
  } else if (s.lt >= 0 && s.lt < 18) {
    var lt = s.lt
    if (lt < 2) {
      p = pose({ body: "crouch", eyes: "squint", mouth: "o", ears: "flat", tail: "low" })
      out.fx.push({ n: "dustL", x: 3, y: 33, c: "w", o: 0.9 })
      out.fx.push({ n: "dustR", x: 35, y: 33, c: "w", o: 0.9 })
    } else if (lt < 4) {
      p = pose({ eyes: "open", mouth: "o", ears: "n", tail: "mid" })
      out.fx.push({ n: "dustL2", x: 1, y: 32, c: "w", o: 0.6 })
      out.fx.push({ n: "dustR2", x: 37, y: 32, c: "w", o: 0.6 })
    } else {
      // proud: chin up, eyes shut, tail straight up
      p = pose({ eyes: "happy", mouth: "smile", ears: "perk", tail: "up", hy: -1, blush: 1 })
      out.fx.push({ n: "sparkle" + (Math.floor(lt / 2) % 2), x: 33, y: 3, c: "o", o: 1 })
      if (lt > 8) out.fx.push({ n: "sparkle" + (Math.floor(lt / 2 + 1) % 2), x: 3, y: 6, c: "o", o: 1 })
    }
  } else if (s.rea === "pet") {
    var rt = s.rt
    var asleep = s.mode === "sleep"
    p = asleep ? sleep({ t: s.t, zp: s.zp, hov: false }, { fx: [] }) : pose({ tail: "up" })
    p.eyes = asleep ? "happy" : "squint"
    p.blush = 2
    p.mouth = "w"
    if (!asleep && rt >= 1 && rt <= 2) p.lift = 1
    out.dx = rt > 2 && rt % 2 ? 1 : 0   // purr vibration
    out.fx.push({ n: "purr", x: 1, y: asleep ? 24 : 19 + (rt % 2), c: "w", o: 1 })
    out.fx.push({ n: "purrR", x: 37, y: asleep ? 24 : 20 - (rt % 2), c: "w", o: 1 })
    var h1 = riser("heart", rt / 14, 35, 10, 9, 1, "r")
    if (h1) out.fx.push(h1)
    if (rt >= 5) { var h2 = riser("heartSmall", (rt - 5) / 12, 1, 8, 7, 1, "r"); if (h2) out.fx.push(h2) }
  } else if (s.rea === "annoyed") {
    var at = s.rt
    if (at < 9) {
      p = pose({ body: "crouch", eyes: "angry", brow: "angry", mouth: "hiss", ears: "flat", tail: "up", puff: 1, blush: 0 })
      out.dx = at < 4 && at % 2 ? 1 : 0
    } else {
      // turns away in a huff
      p = pose({ face: "l", eyes: "blink", brow: "angry", mouth: "pout", ears: "flat", tail: (at >> 1) % 2 ? "swR" : "mid", puff: 1, hx: -1, blush: 1 })
    }
    out.fx.push({ n: "anger", x: 32 - (at % 4 < 2 ? 0 : 1), y: 3 - (at % 4 < 2 ? 0 : 1), c: "r", o: 1 })
    if (at >= 9 && at < 13) out.fx.push({ n: "puff" + Math.min(2, at - 9), x: 2, y: 18, c: "o", o: 0.6 })
  } else if (s.rea === "squish") {
    var qt = s.rt
    p = pose({ body: "squish", eyes: (qt >> 2) % 2 ? "squint" : "happy", mouth: "laugh", blush: 2, ears: "n", tail: (qt >> 1) % 2 ? "mid" : "low" })
    out.dx = (qt >> 1) % 2
    out.fx.push({ n: "giggle", x: 34 + (qt % 2), y: 12 - ((qt >> 1) % 3), c: "w", o: 1 })
    out.fx.push({ n: "giggle", x: 2 - (qt % 2), y: 14 - ((qt >> 2) % 3), c: "w", o: 1 })
  } else if (s.mode === "dance") {
    p = dance(s, out)
  } else if (s.nb === "alert") {
    p = pose({ eyes: "wide", ears: "perk", mouth: "o", tail: "up" })
    if (s.hov) { p.lx = s.lx; p.ly = s.ly }
    if (s.t % 8 < 5) out.fx.push({ n: "bang", x: 36, y: 3, c: "o", o: 1 })
  } else if (s.nb === "worried" || s.nb === "stressed") {
    p = pose({ eyes: s.blink ? "blink" : "open", ly: -1, lx: 1, brow: "worry", mouth: "wobble", ears: "flat", tail: "low" })
    if (s.hov) { p.lx = s.lx; p.ly = s.ly }
    if (s.nb === "stressed") out.fx.push({ n: "sweat", x: 32, y: 7 + (Math.floor(s.t / 2) % 3), c: "l", o: 1 })
  } else if (s.mode === "sleep") {
    p = sleep(s, out)
  } else if (s.mode === "drowsy") {
    p = drowsy(s, out)
  } else {
    p = idle(s, out)
  }
  out.key = keyOf(p)
  if (out.fx.length > FX_SLOTS) out.fx = out.fx.slice(0, FX_SLOTS)
  return out
}

// ---------------------------------------------------------------- fx rows

var fxMemo = {}
function fxRows(name, FX) {
  if (!name) return []
  if (fxMemo[name]) return fxMemo[name]
  var r = null
  var local = { purr: purr, giggle: giggle, dustL: dustL, dustL2: dustL2, noteSmall: noteSmall }
  if (local[name]) r = local[name]
  else if (name === "purrR") r = mirrorRows(purr)
  else if (name === "dustR") r = mirrorRows(dustL)
  else if (name === "dustR2") r = mirrorRows(dustL2)
  else if (name === "sweatL") r = mirrorRows(FX.sweat)
  else if (/^(sparkle|spiral|puff|flame)\d$/.test(name)) r = FX[name.slice(0, -1)][parseInt(name.slice(-1), 10)]
  else if (FX[name] && typeof FX[name] !== "function") r = FX[name]
  r = r || []
  fxMemo[name] = r
  return r
}
