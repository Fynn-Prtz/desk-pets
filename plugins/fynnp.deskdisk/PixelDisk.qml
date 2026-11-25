import QtQuick
import "Sprites.js" as Sprites
import "PetFx.js" as PetFx

// Pixel floppy pet (v2, px 2 on a 44x38 cell canvas; guide: docs/PETS.md).
//
// Ladder (from the card's mood + util / rates):
//   idle  sleeps: slow breathing, closed eyes, drifting z's
//   light awake: blinks, now and then a fidget (look around, shutter wiggle
//         and hum, stretch, yawn)
//   busy  carries bits: reads pull 1/0 bits out of the shutter, writes stuff
//         them in; the shutter slides and the floppy bobs
//   heavy (util >= 50 % or >= 50 MB/s) STRUGGLES: a stack of data blocks held
//         overhead, shaking knees, gritted teeth, sweat, effort lines;
//         very heavy (util >= 90 % or >= 250 MB/s): a bigger wobbling pile,
//         red cheeks, steam
//   full  (a filesystem > 90 %) bloated and bulging, worried wobble, bits
//         spilling out, sweat, the label band turns urgent; full while
//         heavy I/O = dizzy
// Touch (PetTouch): pet -> > < squint, blush, hearts, click-whirr;
// annoyed -> anger mark, shutter slams, pout, stomps; squish -> squashed,
// giggling; hover -> wakes, eyes follow; layout drag -> dangles, flails,
// shutter flaps; landing -> squash, dust, dizzy wobble.
// Neighbours (DeskLink, read only): cat dance -> grooves along, notes rise.
//
// Frames are memoised by key in Sprites.js; nothing here builds rows.
Item {
  id: pet
  property string mood: "idle"   // idle | light | busy | full
  property real util: 0          // % busy, busiest disk
  property real readRate: 0      // bytes/s
  property real writeRate: 0
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
  readonly property bool full: mood === "full"
  readonly property bool busy: mood === "busy"
  readonly property real ioRate: readRate + writeRate
  readonly property int strain: !(busy || full) ? 0
    : (util >= 90 || ioRate >= 250e6) ? 2
    : (util >= 50 || ioRate >= 50e6) ? 1 : 0
  readonly property bool reading: readRate >= writeRate
  readonly property bool grooving: (mood === "idle" || mood === "light") && catMood === "dance"
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
  readonly property real rt: clock - reactAt          // seconds into the reaction
  readonly property real lt: clock - landAt
  readonly property real ft: clock - fidgetAt

  Connections {
    target: touch
    function onSerialChanged() { pet.reactAt = pet.clock }
    function onLandingsChanged() { pet.landAt = pet.clock }
  }

  // ---------- pose ----------
  // One object per tick; the sprite only repaints when `key` changes.
  function pose() {
    var p = { e: "open", lx: 0, ly: 0, m: "smile", a: "rest", g: "stand", sh: 0, sq: 0, dp: 0,
              ln: 0, bl: full ? 1 : 0, bs: 1, st: 0, bd: full ? 1 : 0, hop: 0, dx: 0 }
    var odd = tick % 2 === 1
    if (touch.dragged) {
      p.e = "wide"; p.m = "o"; p.a = odd ? "flail1" : "flail2"; p.g = "dangle"; p.dp = -2
      p.ln = touch.lean !== 0 ? touch.lean : (beat % 2 ? 1 : -1)
      p.sh = odd ? 3 : -2; p.bs = 0
      return p
    }
    if (touch.landing) {
      if (lt < 0.25) { p.e = "squint"; p.m = "o"; p.sq = 3; p.dp = 1 }
      else { p.e = "dizzy"; p.m = "wobble"; p.ln = tick % 4 < 2 ? 1 : -1 }
      return p
    }
    if (reaction === "squish") {
      p.e = "happy"; p.m = "omega"; p.sq = odd ? 3 : 2; p.a = "hug"
      return p
    }
    if (reaction === "annoyed") {
      p.e = "angry"; p.m = "pout"; p.a = "fists"; p.bs = 2; p.lx = -1
      p.g = beat % 2 ? "tap" : "stand"
      p.sh = rt < 0.25 ? 3 : 0                 // the shutter slams shut
      p.hop = beat % 2 && tick % 4 === 1 ? -1 : 0
      return p
    }
    if (reaction === "pet") {
      p.e = rt < 1.1 ? "squint" : "happy"; p.m = strain ? "grit" : "omega"; p.a = "hug"; p.bs = full ? 2 : 1
      p.hop = rt < 0.25 ? -2 : rt < 0.5 ? -1 : 0
      p.sh = Math.floor(rt * 8) % 4 === 1 ? 2 : 0     // click-whirr
      if (strain) p.g = odd ? "shake1" : "shake2"
      return p
    }
    if (grooving) {
      p.e = "happy"; p.m = "open"; p.a = grooveBeat % 2 ? "cheer" : "wave"
      p.hop = grooveBeat % 2 === 0 ? -1 : 0; p.g = grooveBeat % 2 ? "tap" : "stand"
      return p
    }
    var look = touch.hovered
    if (full) {
      if (strain) { p.e = "dizzy"; p.m = "wobble"; p.ln = tick % 4 < 2 ? 1 : -1; p.g = odd ? "shake1" : "shake2"; p.bs = 2; return p }
      p.e = "worried"; p.m = "wobble"; p.bs = 2
      var w = beat % 4
      p.ln = w === 1 ? 1 : w === 3 ? -1 : 0
      if (look) { p.lx = touch.lookX; p.ly = touch.lookY }
      return p
    }
    if (busy && strain > 0) {
      p.e = "strain"; p.m = "grit"; p.a = "up"; p.g = odd ? "shake1" : "shake2"; p.dp = 2
      p.st = strain + (strain === 2 && beat % 2 ? 10 : 0)
      p.bs = strain === 2 ? 2 : 1; p.sq = strain === 2 ? 1 : 0
      p.dx = strain === 2 ? (odd ? 1 : -1) : (odd ? 1 : 0)
      return p
    }
    if (busy) {
      var b = beat % 2
      p.a = b ? "carry" : "carry2"; p.sh = reading ? (b ? 3 : 0) : (b ? 0 : 3)
      p.e = "open"; p.ly = -1; p.lx = b ? 1 : -1; p.m = "open"
      p.hop = tick % 2 ? -1 : 0
      if (look) { p.lx = touch.lookX; p.ly = touch.lookY }
      return p
    }
    if (sleepy) {
      p.e = "sleep"; p.m = "none"; p.bs = 0
      p.sq = Math.floor(wall) % 3 === 0 ? 0 : 1
      return p
    }
    // calm (light, or idle while hovered)
    if (fidget === "look") { p.lx = ft < 0.75 ? -1 : ft < 1.5 ? 1 : 0; p.ly = ft >= 1.5 ? -1 : 0; p.m = "smile" }
    else if (fidget === "hum") { p.e = "happy"; p.m = "o"; p.sh = Math.floor(ft * 4) % 2 ? 2 : -1; p.g = beat % 2 ? "tap" : "stand" }
    else if (fidget === "stretch") { p.a = ft < 1.5 ? "cheer" : "rest"; p.e = ft < 1.5 ? "happy" : "open"; p.dp = ft < 1.5 ? -1 : 0; p.m = "open" }
    else if (fidget === "yawn") { p.e = ft < 1.4 ? "sleep" : "blink"; p.m = ft < 1.4 ? "o" : "smile"; p.sq = ft < 1.4 ? 0 : 1 }
    else if (blinking) p.e = "blink"
    if (look) { p.lx = touch.lookX; p.ly = touch.lookY; p.e = "open"; p.m = "smile" }
    return p
  }
  readonly property var p: pose()
  readonly property string key: [p.e, p.lx, p.ly, p.m, p.a, p.g, p.sh, p.sq, p.dp, p.ln, p.bl, p.bs, p.st, p.bd].join("|")

  // ---------- timers (only while visible and calm) ----------
  readonly property bool calm: active && !sleepy && !busy && !full && !grooving && reaction === "" && !touch.dragged
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
      var kinds = ["look", "hum", "stretch", "yawn"]
      pet.fidgetAt = pet.clock
      pet.fidget = kinds[Math.floor(Math.random() * kinds.length)]
      fidgetEnd.restart()
      interval = 8000 + Math.floor(Math.random() * 7000)
    }
  }
  Timer { id: fidgetEnd; interval: 2200; onTriggered: pet.fidget = "" }
  onCalmChanged: if (!calm) { fidget = ""; fidgetEnd.stop() }

  // ---------- palettes ----------
  readonly property var bodyPalette: colors.base
  readonly property var inkFx: colors.fx(colors.fg)
  readonly property var heartFx: colors.fx(colors.base.p)
  readonly property var sweatFx: colors.fx(colors.base.w)
  readonly property var hotFx: colors.fx(colors.urgent)
  readonly property var bitFx: colors.fx(full ? colors.base.k : colors.base.l)

  // ---------- the floppy ----------
  PixelSprite {
    id: body
    px: pet.px
    x: pet.p.dx * pet.px
    y: pet.p.hop * pet.px
    palette: pet.bodyPalette
    rows: Sprites.disk(pet.key)
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
  readonly property bool lifting: busy && strain > 0 && !full && !reacting
  readonly property bool carrying: busy && strain === 0 && !full && !reacting
  readonly property bool sweating: (strain > 0 || full) && !touch.dragged

  // z's while asleep (two, staggered), drifting up to the top-right corner
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
      cx: 33 + t * 6 + (index ? 2 : 0)
      cy: 9 - t * 9
    }
  }

  // notes while grooving / humming
  Repeater {
    model: 2
    FxSprite {
      px: pet.px
      required property int index
      readonly property real t: pet.ph(0.7, index * 0.5)
      visible: (pet.grooving && !pet.reacting) || (pet.fidget === "hum" && index === 0)
      palette: pet.inkFx
      rows: index === 0 ? PetFx.note : PetFx.noteDouble
      cx: 35 + Math.round(Math.sin(t * 6.28)) + (index ? -3 : 0)
      cy: 11 - t * 10
      opacity: t < 0.85 ? 1 : 0
    }
  }

  // bits: pulled out of the slot (reads) or stuffed in (writes); spilling when full
  Repeater {
    model: 3
    FxSprite {
      px: pet.px
      required property int index
      readonly property real t: pet.ph(pet.full ? 0.6 : 1.2, index / 3)
      readonly property bool spill: pet.full && !pet.reacting
      visible: (pet.carrying || spill) && t < 0.9
      palette: pet.bitFx
      rows: index === 1 ? Sprites.zero : Sprites.one
      cx: spill ? (index === 1 ? 9 - t * 6 : 31 + t * 7)
        : 21 + (index - 1) * t * 6
      cy: spill ? 9 + t * t * 20
        : pet.reading ? 6 - t * 7 : -1 + t * 7
    }
  }

  // sweat drops (struggling, full, dragged around)
  Repeater {
    model: 2
    FxSprite {
      px: pet.px
      required property int index
      readonly property real t: pet.ph(1.1, index * 0.45)
      visible: (pet.sweating && (index === 0 || pet.strain === 2 || pet.full))
        || (touch.dragged && index === 0)
      palette: pet.sweatFx
      rows: PetFx.sweat
      cx: index === 0 ? 37 : 3
      cy: 9 + t * 7
      opacity: t < 0.8 ? 1 : 0
    }
  }

  // effort lines beside a struggling floppy
  FxSprite {
    px: pet.px
    visible: pet.lifting && pet.tick % 2 === 0
    palette: pet.inkFx
    rows: PetFx.effort
    cx: 39; cy: 14
  }
  FxSprite {
    px: pet.px
    visible: pet.lifting && pet.tick % 2 === 0
    palette: pet.inkFx
    rows: pet.effortR
    cx: 1; cy: 14
  }
  // steam puffs off the top of a very heavy pile
  FxSprite {
    px: pet.px
    readonly property int f: Math.floor(pet.ph(1.3, 0) * 4)
    visible: pet.lifting && pet.strain === 2 && f < 3
    palette: pet.inkFx
    opacity: 0.7
    rows: PetFx.puff[Math.min(2, f)]
    cx: 34; cy: 3 - f
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
      cx: (index === 0 ? 34 : 5) + Math.round(Math.sin(t * 9))
      cy: (index === 0 ? 9 : 12) - t * 9
    }
  }
  // click-whirr beside the shutter
  FxSprite {
    px: pet.px
    visible: pet.petting && pet.rt < 0.9
    palette: pet.inkFx
    rows: Sprites.whirr[pet.tick % 2]
    cx: 31; cy: 5
  }

  // anger mark (annoyed), spiral (dizzy), "!" (dragged)
  FxSprite {
    px: pet.px
    visible: pet.annoyed && pet.tick % 4 !== 3
    palette: pet.hotFx
    rows: PetFx.anger
    cx: 35; cy: 3
  }
  FxSprite {
    px: pet.px
    visible: (touch.landing && pet.lt >= 0.25) || (pet.full && pet.strain > 0 && !pet.reacting)
    palette: pet.inkFx
    rows: PetFx.spiral[pet.tick % 2]
    cx: 35; cy: 2
  }
  FxSprite {
    px: pet.px
    visible: touch.dragged
    palette: pet.hotFx
    rows: PetFx.bang
    cx: 37; cy: 1 + (pet.tick % 2)
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
