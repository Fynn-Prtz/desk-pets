.pragma library

// Dachshund pet for the Desk Disk card (round 2): 44x38 cells drawn at px 2.
// A long sausage dog that digs and buries data: big round head turned to the
// viewer (left), floppy ears, light muzzle, tan eyebrow dots, a long body
// to the right on four stubby legs, a thin tail. Top-lit shading with the
// shared PetColors keys (docs/PETS.md).
//
// Two memoised layers, each built once per distinct key:
//   dog(key)    the dog itself (moves with hops / shakes)
//   ground(key) floor shadow, holes, dirt mounds and the overflowing pile
//               (stays put; drawn behind the dog)
// Effects (dirt clods, bones, z's, hearts, sweat) are small fixed sprites.
//
// dog key: "eyes|lookX|lookY|mouth|pose|legs|ears|tail|carry|squash|lean|blush|headX|headY"
//   eyes   open blink sleep happy squint strain dizzy worried wide angry
//   mouth  none smile omega open o grit wobble pout pant sniff
//   pose   stand dig curl dangle
//   legs   stand walk1 walk2 tap shake1 shake2 scratch1 scratch2 dig1 dig2 stomp
//   ears   flop perk down flap1 flap2
//   tail   up wag1 wag2 down curl
//   carry  "" bone block
//   squash 0..3 (shorter + wider)    lean -1/0/1 (shear)
//   blush  0 none, 1 pink, 2 urgent  headX/headY: head offset in cells
//
// ground key: "shadow|hole|mound|pile"
//   shadow 0 none, 1 standing, 2 small (dangling)
//   hole   0 none, 1 hole in front of the paws, 2 hole with a block in it
//   mound  0 none, 1..3 dirt heap growing behind, 4 bed mound (sleep),
//          5 big heap + dirt clumps all over the floor (frantic digging)
//   pile   0 none, 1 full disk: mounds everywhere + overflowing bone pile

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

// Fill mask with fill(x, y, inside) and ring it with a 1-cell outline.
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
function inSuper(x, y, cx, cy, rx, ry, n) {
  return Math.pow(Math.abs(x + 0.5 - cx) / rx, n) + Math.pow(Math.abs(y + 0.5 - cy) / ry, n) <= 1
}
// distance from the cell centre to a polyline
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

// Top-lit fill: highlight under the top contour, shade along the bottom
// and the right side.
function lit(base) {
  return function(x, y, inside) {
    if (!IN(inside, x, y - 1)) return "h"
    if (!IN(inside, x, y + 1) || !IN(inside, x, y + 2)) return "n"
    if (!IN(inside, x + 1, y)) return "n"
    return base
  }
}

// ---------- face parts (left eye; the right one is mirrored) ----------
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
// Mouths sit under the nose, centred on the muzzle.
var MOUTHS = {
  none:   [],
  smile:  ["e..e", ".ee."],
  omega:  ["e.ee.e", ".e..e."],
  open:   [".eeee.", ".eppe.", "..ee.."],
  o:      [".ee.", "e..e", ".ee."],
  grit:   ["eeeeee", "exexxe", "eeeeee"],
  wobble: [".e..e.", "e.ee.e"],
  pout:   [".ee.", "e..e"],
  pant:   ["eeeeee", ".eppe.", ".pllp.", ".pppp.", "..pp.."],
  sniff:  []
}
var NOSE = ["eeee", ".ee."]
var NOSE_SNIFF = [".ee.", "eeee"]

// ---------- props ----------
var BONE = [
  ".ooo...............ooo.",
  "olllo.............ollwo",
  "ollllooooooooooooollwwo",
  ".olllllllllllllllllwwo.",
  "ollllooooooooooooollwwo",
  "olllo.............ollwo",
  ".ooo...............ooo."
]
var BONE_S = [
  ".oo.........oo.",
  "olloooooooooolo",
  "ollllllllllllwo",
  "onwoooooooooono",
  ".oo.........oo."
]
var BONE_UP = [
  ".o.o.",
  "olwlo",
  ".olo.",
  ".olo.",
  ".olo.",
  "olnlo",
  ".o.o."
]
var BLOCK = [
  "ooooooo",
  "ohhhhho",
  "odldldo",
  "odlddlo",
  "onnnnno",
  "ooooooo"
]

// ---------- the dog ----------
var cache = {}
var cacheSize = 0
function dog(key) {
  var hit = cache[key]
  if (hit) return hit
  if (cacheSize > 500) { cache = {}; cacheSize = 0 }
  var rows = build(String(key).split("|"))
  cache[key] = rows
  cacheSize++
  return rows
}

function build(k) {
  var o = {
    eyes: k[0] || "open", lx: +k[1] || 0, ly: +k[2] || 0, mouth: k[3] || "smile",
    pose: k[4] || "stand", legs: k[5] || "stand", ears: k[6] || "flop", tail: k[7] || "up",
    carry: k[8] || "", sq: +k[9] || 0, lean: +k[10] || 0, blush: +k[11] || 0,
    hx: +k[12] || 0, hy: +k[13] || 0
  }
  var g = grid()
  var sq = o.sq, pose = o.pose

  // ---- geometry per pose ----
  // head centre / radii, body polyline + radius, leg roots
  var hcx = 14.5 + o.hx, hcy = 15.5 + o.hy + sq * 1.4
  var hrx = 9.4 + sq * 0.7, hry = 7.6 - sq * 0.8
  var body = [[21, 25.5 + sq * 0.4], [35, 25.5 + sq * 0.4]], br = 5.0, bsy = 1 - sq * 0.12
  var footY = 34
  var tailRoot = [39, 23 + sq]
  if (pose === "dig") {
    hcy = 19.5 + o.hy; hcx = 14 + o.hx
    body = [[21, 27], [35, 24]]
    tailRoot = [39, 21.5]
  } else if (pose === "curl") {
    hcx = 13 + o.hx; hcy = 21.5 + o.hy; hry = 7.2; hrx = 9.2
    body = [[19, 26.5], [35, 26.5]]; br = 5.0; bsy = 0.92 - sq * 0.06
    tailRoot = [39, 28]
  } else if (pose === "dangle") {
    hcy = 13.5 + o.hy
    body = [[21, 23], [35, 23]]
    tailRoot = [39, 21]
    footY = 36
  }
  var bcy = (body[0][1] + body[1][1]) / 2
  function inBody(x, y) {
    // vertical squash about the body's centre line
    var yy = bcy + (y + 0.5 - bcy) / bsy - 0.5
    return segDist(body, x, yy) <= br
  }
  function bodyYAt(x, top) {
    // the body's top/bottom edge row near column x (for leg roots)
    for (var y = 0; y < H; y++) if (inBody(x, top ? y : H - 1 - y)) return top ? y : H - 1 - y
    return 25
  }

  // ---- tail (behind everything) ----
  var TAILS = {
    up:   [[0, 0], [1.6, -3.6], [2.0, -7.6]],
    wag1: [[0, 0], [1.2, -3.8], [0.6, -8.0]],
    wag2: [[0, 0], [2.2, -3.2], [3.0, -7.0]],
    down: [[0, 0], [2.2, 2.0], [2.8, 5.5]],
    curl: [[0, 0], [2.5, 2.5], [0.5, 5.8], [-6, 6.6], [-12, 6.4]]
  }
  var tp = TAILS[o.tail] || TAILS.up
  var tpts = []
  for (var i = 0; i < tp.length; i++) tpts.push([tailRoot[0] + tp[i][0], tailRoot[1] + tp[i][1]])
  if (o.tail !== "curl")
    layer(g, function(x, y) { return inTaper(tpts, x, y, 1.9, 0.75) }, lit("b"))

  // ---- legs ----
  // each: [x centre, lift (cells up), forward reach]; far legs drawn first (shaded)
  var fl = { stand: 0, walk1: 0, walk2: 0, tap: 0 }
  var near = [[18.5, 0, 0], [33.5, 0, 0]]     // front near, back near
  var far = [[23.0, 0, 0], [37.5, 0, 0]]
  var lg = o.legs
  if (lg === "walk1") { near[0][1] = 1; far[1][1] = 1 }
  if (lg === "walk2") { far[0][1] = 1; near[1][1] = 1 }
  if (lg === "tap") near[0][1] = 2
  if (lg === "stomp") near[0][1] = 1
  if (lg === "shake1") { near[0][0] -= 1; near[1][0] += 1 }
  if (lg === "shake2") { far[0][0] += 1; far[1][0] -= 1 }
  if (lg === "scratch1") near[1] = [32.5, 5, -3]
  if (lg === "scratch2") near[1] = [34.5, 6, -1]
  if (pose === "dig") {
    near[0] = lg === "dig1" ? [15.5, 2, -2] : [17.5, 0, 0]
    far[0] = lg === "dig1" ? [22.0, 0, 0] : [20.0, 2, -2]
    near[1] = [32.5, 0, 0]; far[1] = [37.0, 0, 0]
  }
  function legMask(list) {
    return function(x, y) {
      for (var i = 0; i < list.length; i++) {
        var L = list[i], cx = L[0]
        var top = bodyYAt(Math.round(cx), false) - 2
        var bot = footY - L[1]
        if (pose === "dangle") {
          var sway = (lg === "shake1" ? -1 : lg === "shake2" ? 1 : 0)
          if (inTaper([[cx, top], [cx + sway, bot]], x, y, 1.7, 1.5)) return true
          continue
        }
        var reach = L[2]
        // leg + a rounded paw that pokes a little forward (left)
        if (inTaper([[cx, top], [cx + reach, bot - 1]], x, y, 1.7, 1.5)) return true
        if (inEllipse(x, y, cx + reach - 0.6, bot - 0.5, 2.3, 1.4)) return true
      }
      return false
    }
  }
  function legFill(shadeBase) {
    return function(x, y, inside) {
      if (!IN(inside, x, y + 1)) return "w"       // light toes
      if (!IN(inside, x - 1, y) && shadeBase === "b") return "h"
      return shadeBase
    }
  }
  if (pose !== "curl") layer(g, legMask(far), legFill("n"))

  // ---- body ----
  layer(g, inBody, function(x, y, inside) {
    if (!IN(inside, x, y - 1)) return "h"
    if (!IN(inside, x, y + 1)) return "n"
    if (!IN(inside, x + 1, y) || !IN(inside, x + 2, y)) return "n"
    // light chest / belly under the front
    if (!IN(inside, x, y + 2) && x < body[0][0] + 5) return "w"
    return "b"
  })

  // the near legs over the body
  if (pose !== "curl") layer(g, legMask(near), legFill("b"))

  // curl: the tail wraps around the front of the body, paws tucked
  if (o.tail === "curl" || pose === "curl") {
    var cp = TAILS.curl, cpts = []
    for (var c = 0; c < cp.length; c++) cpts.push([tailRoot[0] + cp[c][0], tailRoot[1] + cp[c][1]])
    layer(g, function(x, y) { return inTaper(cpts, x, y, 2.0, 1.0) }, lit("b"))
    // tucked front paws under the chin
    layer(g, function(x, y) { return inEllipse(x, y, 15.5, 30.5, 3.2, 1.6) || inEllipse(x, y, 20.5, 30.8, 3, 1.5) },
      function(x, y, inside) { return !IN(inside, x, y - 1) ? "w" : "n" })
  }

  // ---- ears behind the head when flying up ----
  var flap = o.ears === "flap1" || o.ears === "flap2"
  var earL, earR, er0 = 2.0, er1 = 3.0
  var top = hcy - hry
  var eo = 7.5      // ear root offset from the head centre
  if (o.ears === "perk") {
    earL = [[hcx - eo, top + 2], [hcx - 11, top + 4], [hcx - 12, top + 8.5]]
    earR = [[hcx + eo, top + 2], [hcx + 11, top + 4], [hcx + 12, top + 8.5]]
  } else if (o.ears === "down") {
    earL = [[hcx - eo + 0.5, top + 3], [hcx - 10, top + 8], [hcx - 9.5, top + 14]]
    earR = [[hcx + eo - 0.5, top + 3], [hcx + 10, top + 8], [hcx + 9.5, top + 14]]
  } else if (o.ears === "flap1") {
    earL = [[hcx - eo, top + 2], [hcx - 10.5, top - 0.5], [hcx - 12, top - 3]]
    earR = [[hcx + eo, top + 2], [hcx + 11, top + 3], [hcx + 13, top + 6]]
  } else if (o.ears === "flap2") {
    earL = [[hcx - eo, top + 2], [hcx - 11, top + 3], [hcx - 13, top + 6]]
    earR = [[hcx + eo, top + 2], [hcx + 10.5, top - 0.5], [hcx + 12, top - 3]]
  } else {   // flop
    earL = [[hcx - eo, top + 2], [hcx - 10.8, top + 5.5], [hcx - 11, top + 11.5]]
    earR = [[hcx + eo, top + 2], [hcx + 10.8, top + 5.5], [hcx + 11, top + 11.5]]
  }
  function earMask(x, y) { return inTaper(earL, x, y, er0, er1) || inTaper(earR, x, y, er0, er1) }
  function earFill(x, y, inside) {
    if (!IN(inside, x, y - 1) || !IN(inside, x - 1, y)) return "n"
    return "d"
  }
  if (flap) layer(g, earMask, earFill)

  // ---- head ----
  layer(g, function(x, y) { return inSuper(x, y, hcx, hcy, hrx, hry, 2.1) }, function(x, y, inside) {
    if (!IN(inside, x, y - 1)) return "h"
    if (!IN(inside, x, y - 2) && x < hcx + 3) return "h"
    if (!IN(inside, x, y + 1)) return "n"
    if (!IN(inside, x + 1, y)) return "n"
    return "b"
  })
  // forehead gloss
  var ht = Math.ceil(hcy - hry)
  putIf(g, Math.round(hcx) - 4, ht + 2, "l", "hb"); putIf(g, Math.round(hcx) - 3, ht + 2, "l", "hb")
  putIf(g, Math.round(hcx) - 5, ht + 3, "h", "b")

  // muzzle: a light rounded snout low on the face
  var mcy = hcy + 3.6 - sq * 0.3, mcx = hcx + 0.5
  layer(g, function(x, y) { return inSuper(x, y, mcx, mcy, 4.6, 2.9 - sq * 0.2, 2.2) }, function(x, y, inside) {
    if (!IN(inside, x, y + 1)) return "w"
    if (!IN(inside, x, y - 1)) return "l"
    return "l"
  }, "n")

  // ---- face ----
  var eyeTop = Math.round(hcy - 4.5 + sq * 0.4) + o.ly
  var exL = Math.round(hcx) - 7 + o.lx, exR = Math.round(hcx) + 2 + o.lx
  var e = EYES[o.eyes] || EYES.open
  stamp(g, e, exL, eyeTop, false)
  stamp(g, e, exR, eyeTop, !!ASYM[o.eyes])
  var brow = BROWS[o.eyes]
  if (brow) {
    stamp(g, brow, exL, eyeTop - 2, false)
    stamp(g, brow, exR, eyeTop - 2, true)
  } else {
    // tan eyebrow dots (black-and-tan dachshund)
    put(g, exL + 2, eyeTop - 2, "w"); put(g, exL + 3, eyeTop - 2, "w")
    put(g, exR, eyeTop - 2, "w"); put(g, exR + 1, eyeTop - 2, "w")
  }
  if (o.blush) {
    var bc = o.blush === 2 ? "r" : "p"
    var by = eyeTop + 5
    put(g, exL - 1, by, bc); put(g, exL, by, bc); put(g, exL + 1, by, bc)
    put(g, exR + 2, by, bc); put(g, exR + 3, by, bc); put(g, exR + 4, by, bc)
  }
  var noseY = Math.round(mcy - 2.2)
  var nx = Math.round(mcx) - 2
  stamp(g, o.mouth === "sniff" ? NOSE_SNIFF : NOSE, nx, noseY, false)
  if (!o.carry) {
    var m = MOUTHS[o.mouth] || []
    if (m.length) stamp(g, m, Math.round(mcx) - Math.floor(m[0].length / 2), noseY + 2, false)
  }

  // ---- ears hanging in front of the head sides ----
  if (!flap) layer(g, earMask, earFill)

  // ---- carried prop ----
  if (o.carry === "bone") stamp(g, BONE, Math.round(mcx) - 11, noseY + 1, false, { o: "e" })
  if (o.carry === "block") stamp(g, BLOCK, Math.round(mcx) - 3, noseY + 2, false, { o: "e" })

  if (o.lean) shear(g, o.lean, footY)

  var out = []
  for (var y = 0; y < H; y++) out.push(g[y].join(""))
  return out
}

// Tilt: rows above the feet shift so the top leans `dir`.
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

// ---------- the ground ----------
// ground(key): behind the dog; front(key): heaps drawn over it (full disk).
var gcache = {}
function ground(key) { return groundLayer(String(key), false) }
function front(key) { return groundLayer(String(key), true) }
function groundLayer(key, fore) {
  var ck = (fore ? "F" : "B") + key
  var hit = gcache[ck]
  if (hit) return hit
  var k = key.split("|")
  var rows = buildGround(+k[0] || 0, +k[1] || 0, +k[2] || 0, +k[3] || 0, fore)
  gcache[ck] = rows
  return rows
}

// Dirt: soft-urgent earth (reads brown on most themes) with darker speckles.
function dirtFill(x, y, inside) {
  if (!IN(inside, x, y - 1)) return "p"
  var hsh = (x * 73 + y * 151 + ((x * y) % 7) * 37) % 23
  if (hsh === 0) return "e"
  if (hsh === 5 || hsh === 13) return "p"
  return "k"
}

function buildGround(shadow, hole, mound, pile, fore) {
  var g = grid()
  if (fore) {
    if (pile) {
      // the overflowing heap swallowing the dog's back half, bones poking out
      layer(g, function(x, y) {
        return y <= 35 && (inEllipse(x, y, 36, 39, 8.5, 21) || inEllipse(x, y, 43, 37, 4.5, 26) || inEllipse(x, y, 29, 38, 4, 9))
      }, dirtFill)
      stamp(g, BONE_UP, 38, 9, false)
      stamp(g, BONE_S, 29, 24, false)
      // a little mound over the front paws
      layer(g, function(x, y) { return y <= 35 && inEllipse(x, y, 15, 37.5, 4.5, 4) }, dirtFill)
    }
    var out0 = []
    for (var y0 = 0; y0 < H; y0++) out0.push(g[y0].join(""))
    return out0
  }
  // floor shadow
  if (shadow) {
    var x0 = shadow === 2 ? 12 : 6, x1 = shadow === 2 ? 32 : 40
    for (var x = x0; x <= x1; x++) put(g, x, 35, "t")
    for (var x2 = x0 + 3; x2 <= x1 - 3; x2++) put(g, x2, 36, "t")
  }
  if (pile) {
    // more mounds all around: behind the head and the back
    layer(g, function(x, y) {
      return y <= 35 && (inEllipse(x, y, 3, 37, 4.5, 7) || inEllipse(x, y, 25, 36, 7, 18) || inEllipse(x, y, 33, 36, 6, 22))
    }, dirtFill)
    stamp(g, BONE_UP, 22, 17, false)
    stamp(g, ["oo..", "olo.", ".olo", "..oo"], 1, 29, false)
  }
  if (mound === 4) {
    // a comfy dirt bed under a sleeping dog
    layer(g, function(x, y) { return y <= 35 && inEllipse(x, y, 22, 37, 19, 6.5) }, dirtFill)
  } else if (mound > 0) {
    if (mound >= 5) {
      // dirt everywhere: a bigger heap and clumps all over the floor
      var bits = [[2, 31], [20, 33], [26, 34], [31, 32], [13, 30], [35, 34]]
      for (var bi = 0; bi < bits.length; bi++) stamp(g, bi % 2 ? [".pp.", "pkkp"] : ["pk", "ke"], bits[bi][0], bits[bi][1], false)
    }
    var r = 2 + Math.min(mound, 4) * 1.4
    layer(g, function(x, y) { return y <= 35 && inEllipse(x, y, 41, 36, r + 1, r) }, dirtFill)
  }
  if (hole === 3) {
    // freshly buried: a little patted-down mound where the hole was
    layer(g, function(x, y) { return y <= 35 && inEllipse(x, y, 9, 36, 6, 2.6) }, dirtFill)
  } else if (hole) {
    // a dark hole in front of the paws with a dirt rim
    layer(g, function(x, y) { return inEllipse(x, y, 9, 35.5, 7, 1.6) }, function(x, y, inside) {
      return !IN(inside, x, y - 1) ? "d" : "e"
    }, "n")
    if (hole === 2) stamp(g, BLOCK.slice(0, 4), 6, 31, false)
    layer(g, function(x, y) { return y <= 35 && inEllipse(x, y, 1, 35, 2.5, 2.6) }, dirtFill)
  }
  var out = []
  for (var y = 0; y < H; y++) out.push(g[y].join(""))
  return out
}

// ---------- effect sprites (fx palette: o colour, h lighter, e ink) ----------
// dirt clods flying back (drawn with the pet palette: d dirt, n shade, o rim)
var clods = [
  [".o.", "oko", ".o."],
  [".oo.", "okpo", "okko", ".oo."],
  [".oo", "okp", ".oo"]
]
// a small bone spilling off the pile (pet palette)
var boneSmall = [
  "o.....o",
  ".ooooo.",
  "o.....o"
]
boneSmall = [
  "oo...oo",
  "olooolo",
  "ollllwo",
  "onooono",
  "oo...oo"
]
// sniff puffs by the nose (fx palette)
var sniff = [
  ["o.", ".o"],
  ["o..", ".o.", "..o"]
]
// a tiny "woof" mark (annoyed bark), fx palette
var bark = [
  "o.o.o",
  ".o.o.",
  "....."
]
