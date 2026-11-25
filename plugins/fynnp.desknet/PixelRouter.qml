import QtQuick
import "Sprites.js" as Sprites
import "PetFx.js" as PetFx

// Pixel router pet (v2, px 2 on a 44x38 cell canvas; guide: docs/PETS.md).
//
// Ladder (from the card's mood + rx / tx):
//   idle    sleeps: antennas droop relaxed, slow breathing, z's
//   light   awake: blinks, LEDs twinkle with the traffic, now and then a
//           fidget (look around, antenna wiggle, stretch, yawn)
//   busy    juggles packets: envelopes drop in from the top left (download),
//           fly off to the top right (upload); antennas bob, LEDs flicker
//   heavy   (>= 10 MB/s) STRUGGLES: packets rain in faster than it can catch,
//           antennas bent, frantic arms, gritted teeth, sweat, effort lines;
//           very heavy (>= 60 MB/s): red cheeks, steam, even more packets
//   offline sad: antennas flopped, worried, looks left and right for a
//           signal, a "?" and Wi-Fi arcs that keep failing, LEDs urgent
// Touch (PetTouch): pet -> > < squint, blush, hearts, antennas make a heart
// and the LEDs blink a heartbeat; annoyed -> antennas cross, anger mark,
// pout, stomps; squish -> squashed, giggling; hover -> wakes, eyes follow;
// layout drag -> dangles, antennas wave wildly; landing -> squash, dust,
// dizzy wobble.
// Neighbours (DeskLink, read only): cat dance -> grooves along, notes rise.
//
// Frames are memoised by key in Sprites.js; nothing here builds rows.
Item {
  id: pet
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

  Connections {
    target: touch
    function onSerialChanged() { pet.reactAt = pet.clock }
    function onLandingsChanged() { pet.landAt = pet.clock }
  }

  // ---------- pose ----------
  function pose() {
    var p = { e: "open", lx: 0, ly: 0, m: "smile", a: "rest", g: "stand", an: "up", sq: 0, dp: 0,
              ln: 0, bs: 1, hop: 0, dx: 0 }
    var odd = tick % 2 === 1
    if (touch.dragged) {
      p.e = "wide"; p.m = "o"; p.a = odd ? "flail1" : "flail2"; p.g = "dangle"; p.dp = -2
      p.an = odd ? "wave1" : "wave2"; p.bs = 0
      p.ln = touch.lean !== 0 ? touch.lean : (beat % 2 ? 1 : -1)
      return p
    }
    if (touch.landing) {
      if (lt < 0.25) { p.e = "squint"; p.m = "o"; p.sq = 3; p.dp = 1; p.an = "relax" }
      else { p.e = "dizzy"; p.m = "wobble"; p.ln = tick % 4 < 2 ? 1 : -1; p.an = odd ? "wiggle1" : "wiggle2" }
      return p
    }
    if (reaction === "squish") {
      p.e = "happy"; p.m = "omega"; p.sq = odd ? 3 : 2; p.a = "hug"; p.an = "relax"
      return p
    }
    if (reaction === "annoyed") {
      p.e = "angry"; p.m = "pout"; p.a = "fists"; p.bs = 2; p.an = "cross"; p.lx = -1
      p.g = beat % 2 ? "tap" : "stand"
      p.hop = beat % 2 && tick % 4 === 1 ? -1 : 0
      return p
    }
    if (reaction === "pet") {
      p.e = rt < 1.1 ? "squint" : "happy"; p.m = strain ? "grit" : "omega"; p.a = "hug"; p.an = "heart"
      p.hop = rt < 0.25 ? -2 : rt < 0.5 ? -1 : 0
      if (strain) p.g = odd ? "shake1" : "shake2"
      return p
    }
    if (grooving) {
      p.e = "happy"; p.m = "open"; p.a = grooveBeat % 2 ? "cheer" : "wave"
      p.an = grooveBeat % 2 ? "wiggle1" : "wiggle2"
      p.hop = grooveBeat % 2 === 0 ? -1 : 0; p.g = grooveBeat % 2 ? "tap" : "stand"
      return p
    }
    var look = touch.hovered
    if (offline) {
      p.e = "worried"; p.m = beat % 4 === 3 ? "pout" : "wobble"; p.an = "flop"; p.bs = 0
      let side = Math.floor(clock / 1.5) % 2
      p.lx = side ? 1 : -1; p.ly = -1
      if (look) { p.lx = touch.lookX; p.ly = touch.lookY }
      return p
    }
    if (busy && strain > 0) {
      p.e = "strain"; p.m = "grit"; p.a = odd ? "flail1" : "catch"; p.g = odd ? "shake1" : "shake2"; p.dp = 1
      p.an = beat % 2 ? "bent1" : "bent2"
      p.bs = strain === 2 ? 2 : 1; p.sq = strain === 2 ? 1 : 0
      p.dx = strain === 2 ? (odd ? 1 : -1) : (odd ? 1 : 0)
      return p
    }
    if (busy) {
      let b = beat % 2
      p.a = b ? "juggle1" : "juggle2"; p.an = b ? "wiggle1" : "wiggle2"
      p.e = "open"; p.ly = -1; p.lx = b ? -1 : 1; p.m = "open"
      p.hop = tick % 2 ? -1 : 0
      if (look) { p.lx = touch.lookX; p.ly = touch.lookY }
      return p
    }
    if (sleepy) {
      p.e = "sleep"; p.m = "none"; p.bs = 0; p.an = "relax"
      p.sq = Math.floor(wall) % 3 === 0 ? 0 : 1
      return p
    }
    // calm (light, or idle while hovered)
    if (fidget === "look") { p.lx = ft < 0.75 ? -1 : ft < 1.5 ? 1 : 0; p.ly = ft >= 1.5 ? -1 : 0 }
    else if (fidget === "wiggle") { p.e = "happy"; p.m = "o"; p.an = Math.floor(ft * 4) % 2 ? "wiggle1" : "wiggle2" }
    else if (fidget === "stretch") { p.a = ft < 1.5 ? "cheer" : "rest"; p.an = ft < 1.5 ? "perk" : "up"; p.e = ft < 1.5 ? "happy" : "open"; p.dp = ft < 1.5 ? -1 : 0; p.m = "open" }
    else if (fidget === "yawn") { p.e = ft < 1.4 ? "sleep" : "blink"; p.m = ft < 1.4 ? "o" : "smile"; p.an = "relax"; p.sq = ft < 1.4 ? 0 : 1 }
    else if (blinking) p.e = "blink"
    if (look) { p.lx = touch.lookX; p.ly = touch.lookY; p.e = "open"; p.m = "smile"; p.an = "perk" }
    return p
  }
  readonly property var p: pose()
  readonly property string key: [p.e, p.lx, p.ly, p.m, p.a, p.g, p.an, p.sq, p.dp, p.ln, p.bs].join("|")

  // ---------- LEDs ----------
  // One character per light ("1" "2" down, "3" "4" up, "a" antenna tips):
  // 0 off, 1 lit, 2 urgent, 3 heart. The palette is rebuilt only when this
  // string changes.
  readonly property string leds: {
    if (offline) return beat % 4 === 0 ? "22222" : "00002"
    if (reaction === "pet" && !touch.dragged) {
      let hb = Math.floor(rt * 8) % 8            // lub-dub, rest
      let on = hb === 0 || hb === 2
      return on ? "33333" : "00000"
    }
    if (sleepy) return "00000"
    var flick = busy ? tick % 2 : 0
    var d1 = downOn ? (busy ? (flick ? "1" : "0") : "1") : "0"
    var d2 = downOn && rx >= 65536 ? (busy ? (flick ? "0" : "1") : "1") : "0"
    var u1 = upOn ? (busy ? (flick ? "0" : "1") : "1") : "0"
    var u2 = upOn && tx >= 65536 ? (busy ? (flick ? "1" : "0") : "1") : "0"
    var tip = busy && beat % 2 === 0 ? "1" : "0"
    return d1 + d2 + u1 + u2 + tip
  }
  function ledColor(c, off) {
    return c === "1" ? colors.fg : c === "2" ? colors.urgent : c === "3" ? colors.base.p : off
  }
  readonly property var bodyPalette: {
    var s = pet.leds
    var off = colors.base.e
    return colors.extend({
      "1": ledColor(s.charAt(0), off), "2": ledColor(s.charAt(1), off),
      "3": ledColor(s.charAt(2), off), "4": ledColor(s.charAt(3), off),
      "a": ledColor(s.charAt(4), offline ? colors.base.k : colors.base.h)
    })
  }

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
    interval: 11000
    running: pet.calm && pet.fidget === "" && !touch.hovered
    repeat: true
    onTriggered: {
      var kinds = ["look", "wiggle", "stretch", "yawn"]
      pet.fidgetAt = pet.clock
      pet.fidget = kinds[Math.floor(Math.random() * kinds.length)]
      fidgetEnd.restart()
      interval = 8000 + Math.floor(Math.random() * 7000)
    }
  }
  Timer { id: fidgetEnd; interval: 2200; onTriggered: pet.fidget = "" }
  onCalmChanged: if (!calm) { fidget = ""; fidgetEnd.stop() }

  // ---------- fx palettes ----------
  readonly property var inkFx: colors.fx(colors.fg)
  readonly property var heartFx: colors.fx(colors.urgent)
  readonly property var sweatFx: colors.fx(colors.base.w)
  readonly property var hotFx: colors.fx(colors.urgent)
  readonly property var packetFx: colors.fx(colors.base.l)

  // ---------- the router ----------
  PixelSprite {
    id: body
    px: pet.px
    x: pet.p.dx * pet.px
    y: pet.p.hop * pet.px
    palette: pet.bodyPalette
    rows: Sprites.router(pet.key)
  }

  // ---------- effects ----------
  // An effect sprite placed in whole cells (inline components can't see
  // `pet`, so every instance sets its px).
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
  readonly property bool juggling: busy && !reacting
  readonly property bool struggling: busy && strain > 0 && !reacting

  // z's while asleep
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
      cx: 34 + t * 6 + (index ? 2 : 0)
      cy: 12 - t * 11
    }
  }

  // notes while grooving
  Repeater {
    model: 2
    FxSprite {
      px: pet.px
      required property int index
      readonly property real t: pet.ph(0.7, index * 0.5)
      visible: pet.grooving && !pet.reacting && t < 0.85
      palette: pet.inkFx
      rows: index === 0 ? PetFx.note : PetFx.noteDouble
      cx: 36 + Math.round(Math.sin(t * 6.28)) + (index ? -3 : 0)
      cy: 12 - t * 11
    }
  }

  // packets: downloads drop in from the top left into the hands, uploads
  // fly off to the top right. Struggling: five, faster, some miss.
  Repeater {
    model: 5
    FxSprite {
      px: pet.px
      required property int index
      readonly property bool down: index % 2 === 0 ? pet.downOn || !pet.upOn : !pet.upOn
      readonly property real t: pet.ph(pet.strain === 2 ? 1.6 : pet.strain === 1 ? 1.25 : 0.9, index / (pet.struggling ? 5 : 2))
      readonly property bool miss: pet.struggling && index >= 3
      visible: pet.juggling && (pet.struggling || index < 2) && t < 0.92
      palette: pet.packetFx
      rows: Sprites.packet
      cx: miss ? (index === 3 ? 1 + t * 3 : 37 - t * 2)
        : down ? 2 + index * 3 + t * 6 - (pet.struggling ? index * 2 : 0)
        : 29 + t * 9
      cy: miss ? -2 + t * 34
        : down ? -2 + t * 17
        : 16 - t * 18
    }
  }

  // sweat, effort lines, steam while struggling; sweat while dragged
  Repeater {
    model: 2
    FxSprite {
      px: pet.px
      required property int index
      readonly property real t: pet.ph(1.1, index * 0.45)
      visible: (pet.struggling && (index === 0 || pet.strain === 2)) || (touch.dragged && index === 0)
      palette: pet.sweatFx
      rows: PetFx.sweat
      cx: index === 0 ? 38 : 2
      cy: 13 + t * 7
      opacity: t < 0.8 ? 1 : 0
    }
  }
  FxSprite {
    px: pet.px
    visible: pet.struggling && pet.tick % 2 === 0
    palette: pet.inkFx
    rows: PetFx.effort
    cx: 40; cy: 20
  }
  FxSprite {
    px: pet.px
    visible: pet.struggling && pet.tick % 2 === 0
    palette: pet.inkFx
    rows: pet.effortR
    cx: 0; cy: 20
  }
  FxSprite {
    px: pet.px
    readonly property int f: Math.floor(pet.ph(1.3, 0) * 4)
    visible: pet.struggling && pet.strain === 2 && f < 3
    palette: pet.inkFx
    opacity: 0.7
    rows: PetFx.puff[Math.min(2, f)]
    cx: 18; cy: 6 - f
  }

  // offline: "?" and Wi-Fi arcs that grow, then fail
  FxSprite {
    px: pet.px
    visible: pet.offline && !pet.reacting
    palette: pet.inkFx
    rows: PetFx.question
    cx: 20; cy: 2 + (pet.beat % 2)
  }
  FxSprite {
    px: pet.px
    readonly property int f: Math.floor(pet.clock * 1.5) % 5
    visible: pet.offline && !pet.reacting
    palette: f === 4 ? pet.hotFx : pet.inkFx
    opacity: f === 4 ? 1 : 0.7
    rows: f === 4 ? Sprites.nowifi : Sprites.wifi[Math.min(2, f)]
    cx: 35; cy: 3
  }

  // hearts while petted
  Repeater {
    model: 2
    FxSprite {
      px: pet.px
      required property int index
      readonly property real t: Math.max(0, pet.rt - index * 0.35) / 1.4
      visible: pet.petting && t > 0 && t < 1
      palette: pet.heartFx
      rows: index === 0 ? PetFx.heart : PetFx.heartSmall
      cx: (index === 0 ? 35 : 4) + Math.round(Math.sin(t * 9))
      cy: (index === 0 ? 12 : 14) - t * 10
    }
  }

  // anger mark, dizzy spiral, "!"
  FxSprite {
    px: pet.px
    visible: pet.annoyed && pet.tick % 4 !== 3
    palette: pet.hotFx
    rows: PetFx.anger
    cx: 36; cy: 5
  }
  FxSprite {
    px: pet.px
    visible: touch.landing && pet.lt >= 0.25
    palette: pet.inkFx
    rows: PetFx.spiral[pet.tick % 2]
    cx: 19; cy: 4
  }
  FxSprite {
    px: pet.px
    visible: touch.dragged
    palette: pet.hotFx
    rows: PetFx.bang
    cx: 21; cy: 2 + (pet.tick % 2)
  }

  // landing dust
  FxSprite {
    px: pet.px
    visible: touch.landing && pet.lt < 0.5
    palette: pet.inkFx
    opacity: 0.6
    rows: PetFx.dust[pet.lt < 0.2 ? 0 : 1]
    cx: pet.lt < 0.2 ? 6 : 4; cy: 32
  }
  FxSprite {
    px: pet.px
    visible: touch.landing && pet.lt < 0.5
    palette: pet.inkFx
    opacity: 0.6
    rows: pet.dustR[pet.lt < 0.2 ? 0 : 1]
    cx: pet.lt < 0.2 ? 32 : 34; cy: 32
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
