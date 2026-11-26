import QtQuick
import "Sprites.js" as Sprites
import "PetFx.js" as PetFx

// Dachshund pet for the Desk Disk card (v3 look; px 2 on a 44x38 cell
// canvas; guide: docs/PETS.md). It digs and buries your data.
//
// Ladder (from the card's mood + util / rates):
//   idle  sleeps curled up on a dirt mound: breathing, z's
//   light awake: blinks, now and then a fidget (sniffs the ground, wags
//         its tail, scratches an ear with a hind paw, yawns, looks around)
//   busy  writes: trots in with a data block, drops it in a hole and buries
//         it (dirt flies back between its legs); reads: digs and comes up
//         with a bone in its mouth, tail wagging
//   heavy (util >= 50 % or >= 50 MB/s) STRUGGLES: frantic digging, ears
//         flapping, tongue out panting, sweat, effort lines, dirt everywhere;
//         very heavy (util >= 90 % or >= 250 MB/s): even more dirt, red
//         cheeks, shaking, steam
//   full  (a filesystem > 90 %) half buried in an overflowing pile of
//         mounds, ears down, worried, bones spilling; full while heavy I/O
//         = dizzy
// Touch (PetTouch): pet -> > < squint, blush, hearts, wagging tail;
// annoyed -> anger mark, pout, stomps and woofs; squish -> squashed,
// giggling; hover -> perks its ears, eyes follow; layout drag -> dangles,
// ears flapping up, paws paddling; landing -> squash, dust, dizzy wobble.
// Neighbours (DeskLink, read only): cat dance -> grooves along, notes rise.
//
// Frames are memoised by key in Sprites.js (dog, ground, front); nothing
// here builds rows. The file keeps its old name so the card wiring stays.
Item {
  id: pet
  property string motion: "full"   // full | calm | still (petMotion setting, wired by pet-settings)
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
  // busy work cycle: 4 s per block buried / bone dug up
  readonly property real cyc: (clock % 4) / 4

  Connections {
    target: touch
    function onSerialChanged() { pet.reactAt = pet.clock }
    function onLandingsChanged() { pet.landAt = pet.clock }
  }

  // ---------- pose ----------
  // One object per tick; each sprite only repaints when its key changes.
  //   dog:    e lx ly m p(pose) g(legs) ea(ears) t(tail) c(carry) sq ln bl hx hy
  //   ground: sh(shadow) ho(hole) mo(mound) pi(pile)
  //   moves:  hop (cells up, < 0), dx; dig: "" | "dig" | "frantic" (dirt clods)
  function pose() {
    var p = { e: "open", lx: 0, ly: 0, m: "smile", p: "stand", g: "stand", ea: "flop", t: "up", c: "",
              sq: 0, ln: 0, bl: 1, hx: 0, hy: 0, sh: 1, ho: 0, mo: 0, pi: full ? 1 : 0, hop: 0, dx: 0, dig: "" }
    var odd = tick % 2 === 1
    if (touch.dragged) {
      p.p = "dangle"; p.e = "wide"; p.m = "o"; p.ea = odd ? "flap1" : "flap2"; p.t = "down"
      p.g = odd ? "shake1" : "shake2"; p.bl = 0; p.sh = 2; p.pi = 0
      p.ln = touch.lean !== 0 ? touch.lean : (beat % 2 ? 1 : -1)
      return p
    }
    if (touch.landing) {
      if (lt < 0.25) { p.e = "squint"; p.m = "o"; p.sq = 3; p.ea = "perk" }
      else { p.e = "dizzy"; p.m = "wobble"; p.ln = tick % 4 < 2 ? 1 : -1; p.ea = "down" }
      return p
    }
    if (reaction === "squish") {
      p.e = "happy"; p.m = "omega"; p.sq = odd ? 3 : 2; p.t = odd ? "wag1" : "wag2"; p.ea = "perk"
      return p
    }
    if (reaction === "annoyed") {
      p.e = "angry"; p.m = beat % 2 ? "o" : "pout"; p.bl = 2; p.lx = -1; p.t = "down"
      p.g = beat % 2 ? "stomp" : "stand"; p.ea = "perk"
      p.hop = beat % 2 && tick % 4 === 1 ? -1 : 0
      return p
    }
    if (reaction === "pet") {
      p.e = rt < 1.1 ? "squint" : "happy"; p.m = strain ? "pant" : "omega"
      p.t = odd ? "wag1" : "wag2"; p.ea = "perk"; p.bl = full || strain === 2 ? 2 : 1
      p.hop = rt < 0.25 ? -2 : rt < 0.5 ? -1 : 0
      if (strain) p.g = odd ? "shake1" : "shake2"
      return p
    }
    if (grooving) {
      p.e = "happy"; p.m = "open"; p.t = grooveBeat % 2 ? "wag1" : "wag2"
      p.ea = grooveBeat % 2 ? "perk" : "flop"; p.hop = grooveBeat % 2 === 0 ? -1 : 0
      p.g = grooveBeat % 2 ? "tap" : "stand"
      return p
    }
    var look = touch.hovered
    if (full) {
      p.ea = "down"; p.t = odd ? "wag1" : "up"; p.bl = 2
      if (strain) { p.e = "dizzy"; p.m = "wobble"; p.ln = tick % 4 < 2 ? 1 : -1; return p }
      p.e = "worried"; p.m = "wobble"
      var w = beat % 4
      p.ln = w === 1 ? 1 : w === 3 ? -1 : 0
      if (look) { p.lx = touch.lookX; p.ly = touch.lookY }
      return p
    }
    if (busy && strain > 0) {
      // frantic digging: paws every tick, ears flying, tongue out
      p.p = "dig"; p.g = odd ? "dig1" : "dig2"; p.e = "strain"; p.m = "pant"
      p.ea = odd ? "flap1" : "flop"; p.t = odd ? "wag1" : "wag2"
      p.ho = 1; p.mo = 5; p.bl = strain === 2 ? 2 : 1; p.dig = "frantic"
      p.dx = strain === 2 ? (odd ? 1 : -1) : 0
      return p
    }
    if (busy) {
      var c = cyc, b = beat % 2
      if (reading) {
        // dig, dig, dig ... found one! trot about with the bone
        if (c < 0.55) {
          p.p = "dig"; p.g = b ? "dig1" : "dig2"; p.ly = 1; p.m = "open"; p.t = b ? "wag1" : "wag2"
          p.ho = 1; p.mo = c < 0.2 ? 1 : c < 0.4 ? 2 : 3; p.dig = "dig"
        } else {
          p.c = "bone"; p.e = "happy"; p.g = b ? "walk1" : "walk2"; p.t = tick % 2 ? "wag1" : "wag2"
          p.ea = "perk"; p.ho = 1; p.mo = 3; p.hop = c < 0.62 ? -2 : (tick % 2 ? -1 : 0)
        }
      } else {
        // trot in with a block, drop it in the hole, bury it
        if (c < 0.35) {
          p.c = "block"; p.g = b ? "walk1" : "walk2"; p.t = tick % 2 ? "wag1" : "wag2"; p.ho = 1; p.mo = 1
          p.hop = tick % 2 ? -1 : 0
        } else if (c < 0.45) {
          p.p = "dig"; p.e = "happy"; p.ly = 1; p.m = "omega"; p.ho = 2; p.mo = 1
        } else {
          p.p = "dig"; p.g = b ? "dig1" : "dig2"; p.ly = 1; p.m = "open"; p.t = b ? "wag1" : "wag2"
          p.ho = c < 0.8 ? 2 : 3; p.mo = 1; p.dig = "dig"
        }
      }
      if (look && p.p === "stand") { p.lx = touch.lookX; p.ly = touch.lookY }
      return p
    }
    if (sleepy) {
      p.p = "curl"; p.e = "sleep"; p.m = "none"; p.t = "curl"; p.bl = 0; p.mo = 4; p.sh = 0
      p.sq = Math.floor(wall) % 3 === 0 ? 0 : 1
      return p
    }
    // calm (light, or idle while hovered)
    if (fidget === "look") { p.lx = ft < 0.75 ? -1 : ft < 1.5 ? 1 : 0; p.ly = ft >= 1.5 ? -1 : 0; p.ea = ft >= 1.5 ? "perk" : "flop" }
    else if (fidget === "sniff") { p.hy = 2; p.ly = 1; p.m = tick % 2 ? "sniff" : "smile"; p.hx = ft < 1.1 ? 0 : -1 }
    else if (fidget === "wag") { p.e = "happy"; p.m = "open"; p.t = tick % 2 ? "wag1" : "wag2"; p.ea = "perk"; p.hop = beat % 2 ? -1 : 0 }
    else if (fidget === "scratch") { p.e = tick % 4 < 2 ? "happy" : "squint"; p.m = "omega"; p.g = tick % 2 ? "scratch1" : "scratch2"; p.hx = 1; p.ea = "perk"; p.ln = 1 }
    else if (fidget === "yawn") { p.e = ft < 1.4 ? "sleep" : "blink"; p.m = ft < 1.4 ? "o" : "smile"; p.sq = ft < 1.4 ? 0 : 1; p.ea = "down" }
    else if (blinking) p.e = "blink"
    if (look) { p.lx = touch.lookX; p.ly = touch.lookY; p.e = "open"; p.m = "smile"; p.ea = "perk" }
    return p
  }
  readonly property var p: pose()
  readonly property string key: [p.e, p.lx, p.ly, p.m, p.p, p.g, p.ea, p.t, p.c, p.sq, p.ln, p.bl, p.hx, p.hy].join("|")
  readonly property string groundKey: [p.sh, p.ho, p.mo, p.pi].join("|")

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
      var kinds = ["look", "sniff", "wag", "scratch", "yawn"]
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
  readonly property var heartFx: colors.fx(colors.urgent)
  readonly property var sweatFx: colors.fx(colors.base.w)
  readonly property var hotFx: colors.fx(colors.urgent)

  // ---------- the ground, the dog, the heap in front ----------
  PixelSprite {
    px: pet.px
    palette: pet.bodyPalette
    rows: Sprites.ground(pet.groundKey)
  }
  PixelSprite {
    id: body
    px: pet.px
    x: pet.p.dx * pet.px
    y: pet.p.hop * pet.px
    palette: pet.bodyPalette
    rows: Sprites.dog(pet.key)
  }
  PixelSprite {
    px: pet.px
    visible: pet.p.pi > 0
    palette: pet.bodyPalette
    rows: Sprites.front(pet.groundKey)
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
  readonly property bool frantic: p.dig === "frantic"
  readonly property bool sweating: (strain > 0 || full) && !touch.dragged

  // z's while asleep (two, staggered), drifting up from the curled head
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
      cx: 27 + t * 6 + (index ? 2 : 0)
      cy: 10 - t * 9
    }
  }

  // notes while grooving
  Repeater {
    model: 2
    FxSprite {
      px: pet.px
      required property int index
      readonly property real t: pet.ph(0.7, index * 0.5)
      visible: pet.grooving && !pet.reacting
      palette: pet.inkFx
      rows: index === 0 ? PetFx.note : PetFx.noteDouble
      cx: 34 + Math.round(Math.sin(t * 6.28)) + (index ? -6 : 0)
      cy: 12 - t * 10
      opacity: t < 0.85 ? 1 : 0
    }
  }

  // dirt clods kicked back between the legs: drawn behind the dog, they
  // fly up over its back and land on the heap; more and faster while
  // struggling
  Repeater {
    model: 8
    FxSprite {
      px: pet.px
      z: -1
      required property int index
      readonly property int n: pet.frantic ? (pet.strain === 2 ? 8 : 6) : 3
      readonly property real t: pet.ph(pet.frantic ? 1.6 : 1.0, index / n)
      readonly property real arc: [16, 22, 13, 26, 18, 24, 20, 28][index]
      visible: pet.p.dig !== "" && !pet.reacting && index < n && t < 0.92
      palette: pet.bodyPalette
      rows: Sprites.clods[index % 3]
      cx: 26 + t * (13 + index % 3 * 1.5)
      cy: 31 - Math.sin(t * 3.14) * arc
    }
  }

  // a bone glints when it's dug up
  FxSprite {
    px: pet.px
    visible: pet.p.c === "bone" && !pet.reacting && pet.cyc < 0.8
    palette: pet.inkFx
    rows: PetFx.sparkle[pet.tick % 2]
    cx: 28; cy: 11
  }

  // sniff puffs at the nose
  FxSprite {
    px: pet.px
    visible: pet.fidget === "sniff" && pet.tick % 2 === 1 && !pet.reacting
    palette: pet.inkFx
    opacity: 0.7
    rows: PetFx.puff[pet.tick % 4 < 2 ? 0 : 1]
    cx: 5 + pet.p.hx - (pet.tick % 4 < 2 ? 0 : 1); cy: 26
  }

  // bones spilling down the full pile
  Repeater {
    model: 2
    FxSprite {
      px: pet.px
      required property int index
      readonly property real t: pet.ph(0.45, index * 0.5)
      visible: pet.full && !pet.reacting && t < 0.85
      palette: pet.bodyPalette
      rows: Sprites.boneSmall
      cx: (index ? 30 : 37) - t * (index ? 8 : 6)
      cy: (index ? 12 : 6) + t * t * 22
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
      cx: index === 0 ? 29 : 0
      cy: (pet.frantic ? 10 : 5) + t * 7
      opacity: t < 0.8 ? 1 : 0
    }
  }

  // effort lines around the frantic digger
  FxSprite {
    px: pet.px
    visible: pet.frantic && !pet.reacting && pet.tick % 2 === 0
    palette: pet.inkFx
    rows: PetFx.effort
    cx: 39; cy: 9
  }
  FxSprite {
    px: pet.px
    visible: pet.frantic && !pet.reacting && pet.tick % 2 === 0
    palette: pet.inkFx
    rows: pet.effortR
    cx: 0; cy: 6
  }
  // steam off a very hard-working head
  FxSprite {
    px: pet.px
    readonly property int f: Math.floor(pet.ph(1.3, 0) * 4)
    visible: pet.frantic && pet.strain === 2 && !pet.reacting && f < 3
    palette: pet.inkFx
    opacity: 0.7
    rows: PetFx.puff[Math.min(2, f)]
    cx: 13; cy: 6 - f
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
      cx: (index === 0 ? 29 : 1) + Math.round(Math.sin(t * 9))
      cy: (index === 0 ? 6 : 4) - t * 6
    }
  }

  // anger mark + woofs (annoyed), spiral (dizzy), "!" (dragged)
  FxSprite {
    px: pet.px
    visible: pet.annoyed && pet.tick % 4 !== 3
    palette: pet.hotFx
    rows: PetFx.anger
    cx: 28; cy: 1
  }
  FxSprite {
    px: pet.px
    visible: pet.annoyed && pet.beat % 2 === 1
    palette: pet.inkFx
    rows: Sprites.bark
    cx: 0; cy: 2 + (pet.tick % 2)
  }
  FxSprite {
    px: pet.px
    visible: (touch.landing && pet.lt >= 0.25) || (pet.full && pet.strain > 0 && !pet.reacting)
    palette: pet.inkFx
    rows: PetFx.spiral[pet.tick % 2]
    cx: 28; cy: 0
  }
  FxSprite {
    px: pet.px
    visible: touch.dragged
    palette: pet.hotFx
    rows: PetFx.bang
    cx: 34; cy: 1 + (pet.tick % 2)
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
    cx: pet.lt < 0.2 ? 33 : 35; cy: 32
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
