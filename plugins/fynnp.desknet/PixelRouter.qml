import QtQuick
import "Sprites.js" as Sprites
import "PetFx.js" as PetFx

// Carrier pigeon pet for the Desk Net card (round 2; px 2 on a 44x38 cell
// canvas; guide: docs/PETS.md). It delivers your packets.
//
// Ladder (from the card's mood + rx / tx):
//   idle    sleeps puffed up on its wire, beak tucked, z's
//   light   awake: blinks, now and then a fidget (preens a wing, head-bob
//           walk, coos with a puffed chest, stretches its wings, looks
//           around)
//   busy    flies: wings flapping, envelopes fly in from the top left into
//           the messenger bag (download) and out of it to the top right
//           (upload); the bag fills up with letters
//   heavy   (>= 10 MB/s) STRUGGLES: buried in a pile of envelopes that
//           keeps raining down, frantic flapping, strain face, sweat,
//           feathers flying, effort lines; very heavy (>= 60 MB/s): the pile
//           reaches its chin, red cheeks, steam, shaking
//   offline lost: holds a map upside down, looks around, "?", worried,
//           the bag lights blink urgent
// The bag's tag carries the rx (left) / tx (right) lights.
// Touch (PetTouch): pet -> > < squint, blush, hearts, coos and flutters;
// annoyed -> puffs up, wings on hips, anger mark, stomps; squish ->
// squashed, giggling; hover -> wakes, eyes follow; layout drag -> flaps
// wildly with dangling feet, feathers fly; landing -> squash, dust, dizzy.
// Neighbours (DeskLink, read only): cat dance -> head-bob groove, notes.
//
// Frames are memoised by key in Sprites.js (pigeon, ground, front); nothing
// here builds rows. The file keeps its old name so the card wiring stays.
Item {
  id: pet
  property string motion: "full"   // full | calm | still (petMotion setting, wired by pet-settings)
  property string mood: "idle"   // idle | light | busy | offline
  property real rx: 0            // bytes/s
  property real tx: 0
  property real clock: 0         // seconds, advanced by the card while `needsClock`
  property int px: 2
  property bool active: true
  property string catMood: ""
  property var place: null       // the card's DeskPlace (drag reactions)
  property Item window: null     // win.contentItem (input mask)
  property alias touch: touch

  width: 44 * px
  height: 38 * px

  PetColors { id: colors }

  // ---------- state ----------
  readonly property bool offline: mood === "offline"
  readonly property bool busy: mood === "busy"
  readonly property real rate: rx + tx
  readonly property int strain: !busy ? 0 : rate >= 60e6 ? 2 : rate >= 10e6 ? 1 : 0
  readonly property bool downOn: rx >= 4096
  readonly property bool upOn: tx >= 4096
  readonly property bool grooving: !busy && !offline && catMood === "dance"
  readonly property bool sleepy: mood === "idle" && !grooving && !touch.hovered
  readonly property string reaction: touch.reaction
  property string fidget: ""
  property real fidgetAt: 0
  property real reactAt: 0
  property real landAt: 0
  property bool blinking: false

  // True while the pet wants frames although its mood would let it rest.
  readonly property bool moving: grooving || touch.busy || fidget !== ""
  // The card's clock runs while this is true (125 ms while touch.busy).
  readonly property bool needsClock: mood !== "light" || moving

  readonly property int tick: Math.round(clock * (touch.busy ? 8 : 4))
  readonly property int beat: Math.floor(clock * 2)
  // Wall-clock seconds, re-read on every tick: shared with the other pets
  // so z's float in sync and grooves land on the same beat.
  readonly property real wall: { var c = pet.clock; return (Date.now() % 100000000) / 1000 }
  readonly property int grooveBeat: Math.floor(wall * 4)
  readonly property real rt: clock - reactAt
  readonly property real lt: clock - landAt
  readonly property real ft: clock - fidgetAt
  // delivery cycle while busy: 3 s
  readonly property real cyc: (clock % 3) / 3

  Connections {
    target: touch
    function onSerialChanged() { pet.reactAt = pet.clock }
    function onLandingsChanged() { pet.landAt = pet.clock }
  }

  // ---------- pose ----------
  // One object per tick; each sprite only repaints when its key changes.
  //   pigeon: e lx ly b(beak) w(wings) f(feet) pf(puff) sq ln bl hx hy bag h(hold)
  //   ground: sh (hover shadow)   front: pile   moves: hop (< 0 = up), dx
  function pose() {
    var p = { e: "open", lx: 0, ly: 0, b: "closed", w: "fold", f: "stand", pf: 0, sq: 0, ln: 0, bl: 1,
              hx: 0, hy: 0, bag: 1, h: "", sh: 0, pile: 0, hop: 0, dx: 0 }
    var odd = tick % 2 === 1
    if (touch.dragged) {
      p.e = "wide"; p.b = "open"; p.w = odd ? "up" : "down"; p.f = "dangle"; p.bl = 0; p.sh = 1
      p.ln = touch.lean !== 0 ? touch.lean : (beat % 2 ? 1 : -1)
      return p
    }
    if (touch.landing) {
      if (lt < 0.25) { p.e = "squint"; p.b = "open"; p.sq = 3; p.w = "mid" }
      else { p.e = "dizzy"; p.b = "closed"; p.ln = tick % 4 < 2 ? 1 : -1; p.w = "hips" }
      return p
    }
    if (reaction === "squish") {
      p.e = "happy"; p.b = "coo"; p.sq = odd ? 3 : 2; p.w = "hips"
      return p
    }
    if (reaction === "annoyed") {
      p.e = "angry"; p.b = "closed"; p.pf = 1; p.w = "hips"; p.bl = 2; p.lx = -1
      p.f = beat % 2 ? "stomp" : "stand"
      p.hop = beat % 2 && tick % 4 === 1 ? -1 : 0
      return p
    }
    if (reaction === "pet") {
      p.e = strain ? "happy" : rt < 1.1 ? "squint" : "happy"; p.b = strain ? "open" : "coo"
      p.w = odd ? "hold" : "hips"; p.pf = rt < 1.1 ? 1 : 0; p.bl = strain === 2 ? 2 : 1
      p.hop = rt < 0.25 ? -2 : rt < 0.5 ? -1 : 0
      if (strain) p.pile = strain
      return p
    }
    if (grooving) {
      p.e = "happy"; p.b = grooveBeat % 2 ? "coo" : "closed"; p.w = grooveBeat % 4 === 1 ? "up" : grooveBeat % 4 === 3 ? "mid" : "fold"
      p.hx = grooveBeat % 2 ? 1 : -1; p.hop = grooveBeat % 2 === 0 ? -1 : 0; p.f = grooveBeat % 2 ? "tap" : "stand"
      return p
    }
    var look = touch.hovered
    if (offline) {
      // lost: map upside down, looking around for the way
      p.e = "worried"; p.b = "closed"; p.w = "hold"; p.h = "map"; p.bl = 0; p.bag = 0
      var side = Math.floor(clock / 1.5) % 3
      p.lx = side === 0 ? -1 : side === 1 ? 1 : 0; p.ly = side === 2 ? 1 : -1
      p.ln = side === 2 && beat % 2 ? 1 : 0
      if (look) { p.lx = touch.lookX; p.ly = touch.lookY }
      return p
    }
    if (busy && strain > 0) {
      // buried in letters, flapping like mad
      p.e = "strain"; p.b = "open"; p.w = odd ? "up" : "mid"; p.bl = strain === 2 ? 2 : 1
      p.bag = 3; p.pile = strain; p.hy = strain === 2 ? 1 : 0
      p.dx = strain === 2 ? (odd ? 1 : -1) : 0
      return p
    }
    if (busy) {
      // flying deliveries: flap every tick, hover above the wire
      p.w = odd ? "up" : "down"; p.f = "dangle"; p.sh = 1
      p.hop = odd ? -3 : -2
      p.b = cyc < 0.5 ? "closed" : "open"
      p.lx = downOn && cyc < 0.5 ? -1 : upOn ? 1 : 0; p.ly = -1
      p.bag = downOn ? 1 + Math.floor(cyc * 3) : 1
      if (look) { p.lx = touch.lookX; p.ly = touch.lookY }
      return p
    }
    if (sleepy) {
      p.e = "sleep"; p.b = "tuck"; p.pf = 1; p.f = "tuck"; p.bl = 0; p.bag = 0
      p.sq = Math.floor(wall) % 3 === 0 ? 0 : 1
      return p
    }
    // calm (light, or idle while hovered)
    if (fidget === "look") { p.lx = ft < 0.75 ? -1 : ft < 1.5 ? 1 : 0; p.ly = ft >= 1.5 ? -1 : 0 }
    else if (fidget === "preen") { p.e = "happy"; p.w = "preen"; p.hx = tick % 2 ? -4 : -3; p.hy = 3; p.b = "closed" }
    else if (fidget === "bob") { p.hx = tick % 2 ? 1 : -1; p.hy = tick % 4 < 2 ? 0 : 1; p.f = tick % 2 ? "tap" : "stand" }
    else if (fidget === "coo") { p.e = "happy"; p.pf = 1; p.b = tick % 4 < 2 ? "coo" : "closed"; p.hy = tick % 4 < 2 ? 0 : 1 }
    else if (fidget === "stretch") { p.w = ft < 1.5 ? (tick % 2 ? "up" : "mid") : "fold"; p.e = ft < 1.5 ? "happy" : "open"; p.b = ft < 1.5 ? "open" : "closed" }
    else if (blinking) p.e = "blink"
    if (look) { p.lx = touch.lookX; p.ly = touch.lookY; p.e = "open"; p.b = "closed" }
    return p
  }
  readonly property var p: pose()
  readonly property string key: [p.e, p.lx, p.ly, p.b, p.w, p.f, p.pf, p.sq, p.ln, p.bl, p.hx, p.hy, p.bag, p.h].join("|")
  readonly property string groundKey: "1|" + p.sh

  // ---------- bag lights ----------
  // One character per light ("1" "2" down, "3" "4" up): 0 off, 1 lit,
  // 2 urgent, 3 heart. The palette is rebuilt only when this string changes.
  readonly property string leds: {
    if (offline) return beat % 4 === 0 ? "2222" : "0000"
    if (reaction === "pet" && !touch.dragged) {
      let hb = Math.floor(rt * 8) % 8            // lub-dub, rest
      let on = hb === 0 || hb === 2
      return on ? "3333" : "0000"
    }
    if (sleepy) return "0000"
    var flick = busy ? tick % 2 : 0
    var d1 = downOn ? (busy ? (flick ? "1" : "0") : "1") : "0"
    var d2 = downOn && rx >= 65536 ? (busy ? (flick ? "0" : "1") : "1") : "0"
    var u1 = upOn ? (busy ? (flick ? "0" : "1") : "1") : "0"
    var u2 = upOn && tx >= 65536 ? (busy ? (flick ? "1" : "0") : "1") : "0"
    return d1 + d2 + u1 + u2
  }
  function ledColor(c, off) {
    return c === "1" ? colors.fg : c === "2" ? colors.urgent : c === "3" ? colors.base.p : off
  }
  readonly property var bodyPalette: {
    var s = pet.leds
    var off = colors.base.e
    return colors.extend({
      "1": ledColor(s.charAt(0), off), "2": ledColor(s.charAt(1), off),
      "3": ledColor(s.charAt(2), off), "4": ledColor(s.charAt(3), off)
    })
  }
  readonly property var plainPalette: colors.base

  // ---------- timers (only while visible and calm) ----------
  readonly property bool calm: active && !sleepy && !busy && !offline && !grooving && reaction === "" && !touch.dragged
  Timer {
    interval: 3200
    running: pet.calm && pet.fidget === ""
    repeat: true
    onTriggered: { pet.blinking = true; blinkOff.restart(); interval = 2600 + Math.floor(Math.random() * 3000) }
  }
  Timer { id: blinkOff; interval: 150; onTriggered: pet.blinking = false }
  Timer {
    id: fidgetTimer
    interval: 11000
    running: pet.calm && pet.fidget === "" && !touch.hovered
    repeat: true
    onTriggered: {
      var kinds = ["look", "preen", "bob", "coo", "stretch"]
      pet.fidgetAt = pet.clock
      pet.fidget = kinds[Math.floor(Math.random() * kinds.length)]
      fidgetEnd.restart()
      interval = 8000 + Math.floor(Math.random() * 7000)
    }
  }
  Timer { id: fidgetEnd; interval: 2200; onTriggered: pet.fidget = "" }
  onCalmChanged: if (!calm) { fidget = ""; fidgetEnd.stop() }

  // ---------- palettes ----------
  readonly property var inkFx: colors.fx(colors.fg)
  readonly property var heartFx: colors.fx(colors.urgent)
  readonly property var sweatFx: colors.fx(colors.base.w)
  readonly property var hotFx: colors.fx(colors.urgent)

  // ---------- the wire, the pigeon, the letter pile ----------
  PixelSprite {
    px: pet.px
    palette: pet.plainPalette
    rows: Sprites.ground(pet.groundKey)
  }
  PixelSprite {
    id: body
    px: pet.px
    x: pet.p.dx * pet.px
    y: pet.p.hop * pet.px
    palette: pet.bodyPalette
    rows: Sprites.pigeon(pet.key)
  }
  PixelSprite {
    px: pet.px
    visible: pet.p.pile > 0
    palette: pet.plainPalette
    rows: Sprites.front(pet.p.pile)
  }

  // ---------- effects ----------
  component FxSprite: PixelSprite {
    property real cx: 0
    property real cy: 0
    x: Math.round(cx) * px
    y: Math.round(cy) * px
  }
  readonly property var effortR: PetFx.mirror(PetFx.effort)
  readonly property var dustR: [PetFx.mirror(PetFx.dust[0]), PetFx.mirror(PetFx.dust[1])]

  function ph(speed, offset) { return ((pet.clock * speed + offset) % 1 + 1) % 1 }
  function wph(speed, offset) { return ((pet.wall * speed + offset) % 1 + 1) % 1 }

  readonly property bool petting: reaction === "pet" && !touch.dragged && !touch.landing
  readonly property bool annoyed: reaction === "annoyed" && !touch.dragged && !touch.landing
  readonly property bool reacting: reaction !== "" || touch.dragged || touch.landing
  readonly property bool flying: busy && strain === 0 && !reacting
  readonly property bool buried: busy && strain > 0 && !reacting
  readonly property bool sweating: (strain > 0 || offline) && !touch.dragged

  // z's while asleep (two, staggered)
  Repeater {
    model: 2
    FxSprite {
      px: pet.px
      required property int index
      readonly property real t: pet.wph(0.3, index * 0.5)
      visible: pet.sleepy && !pet.reacting && t < 0.85
      opacity: 0.75
      palette: pet.inkFx
      rows: index === 0 ? PetFx.zed : PetFx.zedSmall
      cx: 32 + t * 6 + (index ? 2 : 0)
      cy: 9 - t * 9
    }
  }

  // notes while grooving or cooing
  Repeater {
    model: 2
    FxSprite {
      px: pet.px
      required property int index
      readonly property real t: pet.ph(0.7, index * 0.5)
      visible: (pet.grooving && !pet.reacting) || (pet.fidget === "coo" && index === 0)
      palette: pet.inkFx
      rows: index === 0 ? PetFx.note : PetFx.noteDouble
      cx: 35 + Math.round(Math.sin(t * 6.28)) + (index ? -4 : 0)
      cy: 10 - t * 10
      opacity: t < 0.85 ? 1 : 0
    }
  }
  // coo puffs by the beak
  FxSprite {
    px: pet.px
    visible: (pet.fidget === "coo" || (pet.petting && pet.strain === 0)) && pet.tick % 4 < 2
    palette: pet.inkFx
    opacity: 0.8
    rows: Sprites.coo
    cx: 29; cy: 15
  }

  // envelopes: download ones fly in from the top left and are caught by
  // the left wing (into the bag), upload ones fly out of the bag to the
  // top right
  Repeater {
    model: 4
    FxSprite {
      px: pet.px
      required property int index
      readonly property bool down: index < 2
      readonly property real t: pet.ph(1 / 1.5, (index % 2) * 0.5)
      visible: pet.flying && (down ? pet.downOn : pet.upOn) && t < 0.9
      palette: pet.plainPalette
      rows: index % 2 ? Sprites.envelopeTilt : Sprites.envelope
      cx: down ? -7 + t * 11 : 30 + t * 14
      cy: down ? -5 + t * 18 + pet.p.hop : 20 + pet.p.hop - t * 26
    }
  }

  // ...and while buried they rain down onto the pile
  Repeater {
    model: 4
    FxSprite {
      px: pet.px
      required property int index
      readonly property real t: pet.ph(pet.strain === 2 ? 1.6 : 1.1, index / 4)
      visible: pet.buried && (index < 3 || pet.strain === 2) && t < 0.85
      palette: pet.plainPalette
      rows: index % 2 ? Sprites.envelopeTilt : Sprites.envelope
      cx: [3, 33, 12, 26][index] + (index % 2 ? -1 : 1) * Math.round(t * 3)
      cy: -6 + t * 30
    }
  }

  // loose feathers (frantic flapping, being dragged, preening)
  Repeater {
    model: 2
    FxSprite {
      px: pet.px
      required property int index
      readonly property real t: pet.ph(0.8, index * 0.5)
      visible: (pet.buried || touch.dragged || (pet.fidget === "preen" && index === 0)) && t < 0.9
      palette: pet.plainPalette
      rows: Sprites.feather[(pet.tick + index) % 2]
      cx: (index ? 36 : 4) + Math.round(Math.sin(t * 9) * 2)
      cy: 12 + t * 18
    }
  }

  // sweat drops (buried, lost, dragged around)
  Repeater {
    model: 2
    FxSprite {
      px: pet.px
      required property int index
      readonly property real t: pet.ph(1.1, index * 0.45)
      visible: (pet.sweating && (index === 0 || pet.strain === 2)) || (touch.dragged && index === 0)
      palette: pet.sweatFx
      rows: PetFx.sweat
      cx: index === 0 ? 32 : 9
      cy: 4 + t * 7
      opacity: t < 0.8 ? 1 : 0
    }
  }

  // effort lines beside the buried bird
  FxSprite {
    px: pet.px
    visible: pet.buried && pet.tick % 2 === 0
    palette: pet.inkFx
    rows: PetFx.effort
    cx: 39; cy: 3
  }
  FxSprite {
    px: pet.px
    visible: pet.buried && pet.tick % 2 === 0
    palette: pet.inkFx
    rows: pet.effortR
    cx: 0; cy: 3
  }
  // steam when it's way too much
  FxSprite {
    px: pet.px
    readonly property int f: Math.floor(pet.ph(1.3, 0) * 4)
    visible: pet.buried && pet.strain === 2 && f < 3
    palette: pet.inkFx
    opacity: 0.7
    rows: PetFx.puff[Math.min(2, f)]
    cx: 20; cy: 3 - f
  }

  // hearts rising while petted
  Repeater {
    model: 2
    FxSprite {
      px: pet.px
      required property int index
      readonly property real t: Math.max(0, pet.rt - index * 0.35) / 1.4
      visible: pet.petting && t > 0 && t < 1
      palette: pet.heartFx
      rows: index === 0 ? PetFx.heart : PetFx.heartSmall
      cx: (index === 0 ? 34 : 3) + Math.round(Math.sin(t * 9))
      cy: (index === 0 ? 8 : 10) - t * 8
    }
  }

  // anger mark (annoyed), spiral (dizzy), "!" (dragged), "?" (lost)
  FxSprite {
    px: pet.px
    visible: pet.annoyed && pet.tick % 4 !== 3
    palette: pet.hotFx
    rows: PetFx.anger
    cx: 33; cy: 2
  }
  FxSprite {
    px: pet.px
    visible: touch.landing && pet.lt >= 0.25
    palette: pet.inkFx
    rows: PetFx.spiral[pet.tick % 2]
    cx: 33; cy: 1
  }
  FxSprite {
    px: pet.px
    visible: touch.dragged
    palette: pet.hotFx
    rows: PetFx.bang
    cx: 36; cy: 1 + (pet.tick % 2)
  }
  FxSprite {
    px: pet.px
    visible: pet.offline && !pet.reacting
    palette: pet.inkFx
    rows: PetFx.question
    cx: pet.p.lx < 0 ? 3 : 35; cy: 1 + (pet.beat % 2)
  }

  // landing dust
  FxSprite {
    px: pet.px
    visible: touch.landing && pet.lt < 0.5
    palette: pet.inkFx
    opacity: 0.6
    rows: PetFx.dust[pet.lt < 0.2 ? 0 : 1]
    cx: pet.lt < 0.2 ? 7 : 5; cy: 30
  }
  FxSprite {
    px: pet.px
    visible: touch.landing && pet.lt < 0.5
    palette: pet.inkFx
    opacity: 0.6
    rows: pet.dustR[pet.lt < 0.2 ? 0 : 1]
    cx: pet.lt < 0.2 ? 31 : 33; cy: 30
  }

  // ---------- input ----------
  PetTouch {
    id: touch
    anchors.fill: parent
    active: pet.active
    place: pet.place
    window: pet.window
  }
}
