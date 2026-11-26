import QtQuick
import "Sprites.js" as Sprites
import "PetSeason.js" as PetSeason
import "PetFx.js" as Fx

// Pixel hamster that hoards RAM in its cheek pouches (docs/PETS.md).
// 44 x 38 cells at px 2. The frame is a short string key; the sprite only
// repaints when the key changes (frames are memoised in Sprites.js).
//
// Ladder (mood, from the card):
//   sleep    curled-up ball, breathing, z's
//   calm     sits, blinks; now and then washes its face, looks around,
//            sniffs, nibbles a seed or yawns
//   busy     stuffs RAM-chip seeds into its cheeks (pouches grow with usage)
//   strain   huge cheeks, a wobbling tower of chips on its head, strain eyes,
//            gritted teeth, sweat and effort lines
//   critical about to burst: flushed, dizzy / panicking, chips spill out,
//            red steam, spiral
// Touch: pet -> squint, hearts, chubby wiggle; annoyed -> puffed pout, anger
// mark, stomps; squish -> squashed fluffball, giggles; hover -> eyes follow,
// nose twitches (wakes it up); drag -> dangles holding its cheeks; drop ->
// plop + dust, then a dizzy wobble. Cat dances (DeskLink) -> grooves.
Item {
  id: pet
  property string motion: "full"   // full | calm | still (petMotion setting, wired by pet-settings)
  property bool reactions: true    // petReactions setting: false = no touch, card click-through
  // full: everything · calm: no fidgets, no groove with the cat · still: mood
  // frames only, no blinks; the card stops its clock.
  readonly property bool extras: motion === "full"
  readonly property bool still: motion === "still"
  property string season: ""   // "" | xmas | party | spooky (PetSeason.js via the card's PetCalendar)

  property string mood: "sleep"   // sleep | calm | busy | strain | critical
  property real fill: 0           // used memory 0..1 (pouch size)
  property real clock: 0          // seconds, from the card clock
  property int px: 2
  property bool active: true
  property string catMood: ""
  property var place: null
  property Item window: null

  property alias touch: touch

  width: 44 * px
  height: 38 * px

  PetColors { id: colors }

  // ---------- state ----------
  readonly property bool struggling: mood === "strain" || mood === "critical"
  readonly property bool grooving: extras && catMood === "dance" && (mood === "sleep" || mood === "calm")
    && touch.reaction === "" && !touch.dragged && !touch.landing
  readonly property bool awake: mood !== "sleep" || touch.hovered || touch.reaction !== ""
    || touch.dragged || touch.landing || grooving

  property bool blinking: false
  property string fidget: ""
  property real fidgetT0: 0
  property real reactT0: 0
  property real landT0: 0

  // Needs frames although the mood alone would rest (calm is still).
  readonly property bool moving: touch.busy || grooving || fidget !== "" || morningPlay.running

  readonly property int step: Math.floor(clock * 4 + 0.001)   // 4 per second
  readonly property int fstep: Math.floor(clock * 8 + 0.001)  // 8 per second (reactions)
  // Wall-clock seconds, re-read on every tick: z's and the groove beat stay in
  // step with the other cards' pets.
  readonly property real wall: { var tick = pet.clock; return (Date.now() % 100000000) / 1000 }
  readonly property int beat: Math.floor(wall * 4)

  readonly property int baseCheek: mood === "busy" ? 1 + Math.round(Math.max(0, Math.min(1, (fill - 0.6) / 0.2)) * 2)
    : mood === "strain" ? 3 + Math.round(Math.max(0, Math.min(1, (fill - 0.8) / 0.1)))
    : mood === "critical" ? 5 : 0
  readonly property int basePile: mood === "strain" ? (fill >= 0.85 ? 3 : 2) : mood === "critical" ? 3 : 0

  Connections {
    target: touch
    function onSerialChanged() { pet.reactT0 = pet.clock }
    function onLandingsChanged() { pet.landT0 = pet.clock }
  }

  // ---------- frame ----------
  function spec() {
    var s = step, f = fstep
    var o = { pose: "sit", eyes: blinking ? "blink" : "open", look: [0, 0], mouth: "omega",
      cheek: baseCheek, paws: "down", item: "", pile: basePile, flush: mood === "critical",
      lean: 0, nose: 0, breath: 0 }
    var t
    if (touch.dragged) {
      o.pose = "dangle"; o.eyes = f % 12 < 9 ? "wide" : "worried"; o.mouth = "wobbly"
      o.paws = "cheeks"; o.cheek = Math.max(1, Math.min(3, baseCheek)); o.pile = 0; o.lean = touch.lean
    } else if (touch.landing) {
      t = clock - landT0
      if (t < 0.3) { o.pose = "plop"; o.eyes = "squint"; o.mouth = "open"; o.pile = 0 }
      else { o.eyes = "dizzy"; o.mouth = "wobbly"; o.lean = f % 2 ? 1 : -1; o.pile = 0 }
    } else if (touch.reaction === "squish") {
      o.pose = "squish"; o.eyes = "happy"; o.mouth = f % 4 < 2 ? "open" : "smile"; o.pile = 0
      o.cheek = Math.min(baseCheek, 2)
    } else if (touch.reaction === "pet") {
      if (struggling) {
        // Smiling through the strain.
        o.eyes = "happy"; o.mouth = "smile"; o.paws = "cheeks"
      } else {
        o.pose = f % 4 < 2 ? "wiggle" : "sit"; o.eyes = "squint"; o.mouth = f % 4 < 2 ? "open" : "omega"
      }
    } else if (touch.reaction === "annoyed") {
      o.cheek = Math.max(2, Math.min(5, baseCheek + 2)); o.eyes = "angry"; o.mouth = "pout"
    } else if (grooving) {
      o.eyes = "happy"; o.mouth = beat % 4 < 2 ? "smile" : "open"; o.lean = beat % 2 ? 1 : -1
    } else if (mood === "sleep" && !touch.hovered) {
      o.pose = "ball"; o.breath = (clock % 3) < 1 ? 1 : 0; o.cheek = 0
    } else if (mood === "busy") {
      // Grab a chip, lift it, stuff it in, chew.
      var b = s % 8
      if (b < 2) { o.item = "chip"; if (b === 0) o.look = [0, 1] }
      else if (b < 4) { o.item = "chip"; o.paws = "hold"; o.mouth = "open"; if (b === 3) o.eyes = "happy" }
      else { o.mouth = b === 5 ? "chew2" : b === 7 ? "omega" : "chew"; if (b === 4) o.pose = "wiggle" }
    } else if (mood === "strain") {
      o.paws = "cheeks"
      o.eyes = s % 12 < 9 ? "strain" : "worried"
      o.mouth = o.eyes === "strain" ? "teeth" : "wobbly"
      o.lean = [0, 1, 0, -1][s % 4]
    } else if (mood === "critical") {
      var panic = s % 8 >= 4
      o.paws = panic ? "cheeks" : "down"
      o.eyes = panic ? "wide" : "dizzy"
      o.mouth = panic ? "open" : "wobbly"
      o.lean = [1, 0, -1, 0][s % 4]
    } else if (fidget !== "") {
      t = clock - fidgetT0
      if (fidget === "look") o.look = t < 0.75 ? [-1, 0] : t < 1.5 ? [1, 0] : t < 2 ? [0, -1] : [0, 0]
      else if (fidget === "sniff") { o.nose = s % 2; o.look = [0, -1] }
      else if (fidget === "wash") { o.paws = s % 2 ? "wash2" : "wash"; o.eyes = "happy" }
      else if (fidget === "nibble") { o.paws = "hold"; o.item = "seed"; o.mouth = s % 2 ? "chew" : "chew2"; if (s % 6 === 5) o.eyes = "happy" }
      else if (fidget === "yawn") { o.eyes = t < 0.5 ? "blink" : t < 1.25 ? "happy" : o.eyes; o.mouth = t < 1.25 ? "open" : "omega" }
    }
    // Hover: eyes follow the cursor, the nose twitches.
    if (touch.hovered && touch.reaction === "" && !touch.dragged && !touch.landing) {
      if (o.eyes === "open" || o.eyes === "wide" || o.eyes === "worried") o.look = [touch.lookX, touch.lookY]
      if (o.pose !== "ball" && !struggling) o.nose = f % 4 < 2 ? 1 : 0
    }
    // Day/night: nightcap when curled up after 23:00, morning stretch + coffee.
    if (o.pose === "ball" && night) o.cap = 1
    if (morningPlay.running && mood === "calm" && touch.reaction === "" && !touch.dragged && !touch.landing) {
      t = clock - morningT0
      o.look = [0, 0]; o.item = ""; o.nose = 0
      if (t < 1.8) {
        var up = t > 0.3 && t < 1.6
        o.pose = up ? "dangle" : "sit"; o.paws = up ? "wash" : "down"; o.eyes = up ? "sleep" : "blink"; o.mouth = up ? "open" : "omega"
      } else if (t < 4.2) {
        var sip = t > 2.6 && t < 3.4
        o.paws = sip ? "hold" : "down"; o.item = "mug" + (f % 4 < 2 ? 0 : 1); o.eyes = sip || t > 3.4 ? "happy" : "open"; o.mouth = sip ? "chew" : "omega"
      } else { o.eyes = "happy"; o.mouth = "smile" }
    }
    // Season: outfit + confetti while petted on party days (not with motion "still").
    o.acc = season
    if (season === "party" && touch.reaction === "pet" && motion !== "still" && clock - reactT0 < 2)
      o.conf = Math.floor((clock - reactT0) * 8) / 16
    return Sprites.key(o)
  }

  readonly property string frameKey: spec()

  // Whole-cell offsets: shakes, hops, stomps, the dangle lift.
  readonly property int offX: touch.dragged ? 0
    : touch.reaction === "pet" && !struggling ? (fstep % 4 < 2 ? 1 : -1)
    : touch.reaction !== "" || touch.landing ? 0
    : mood === "critical" ? (step % 2 ? 1 : -1)
    : mood === "strain" ? step % 2 : 0
  readonly property int offY: touch.dragged ? -2
    : touch.reaction === "annoyed" ? (fstep % 4 < 2 ? -1 : 0)
    : touch.reaction === "pet" && !struggling ? (fstep % 8 < 2 ? -1 : 0)
    : grooving ? (beat % 2 ? 0 : -1) : 0

  // ---------- timers (all stop when the card is inactive) ----------
  Timer {
    interval: 3200
    repeat: true
    running: pet.active && !pet.still && (pet.mood === "calm" || pet.mood === "busy") && !pet.grooving
    onTriggered: { pet.blinking = true; blinkOff.restart(); interval = 2600 + Math.floor(Math.random() * 3000) }
  }
  Timer { id: blinkOff; interval: 150; onTriggered: pet.blinking = false }

  Timer {
    interval: 9000
    repeat: true
    running: pet.active && pet.extras && pet.mood === "calm" && pet.fidget === "" && !touch.busy && !pet.grooving
    onTriggered: {
      var picks = ["look", "sniff", "wash", "nibble", "yawn", "wash", "nibble"]
      var durs = { look: 2500, sniff: 2000, wash: 2500, nibble: 3500, yawn: 1750 }
      var pick = picks[Math.floor(Math.random() * picks.length)]
      if (pet.night && Math.random() < 0.5) pick = "yawn"   // day-night: extra sleepy
      pet.fidgetT0 = pet.clock
      pet.fidget = pick
      fidgetEnd.interval = durs[pick]
      fidgetEnd.restart()
      interval = 8000 + Math.floor(Math.random() * 7000)
    }
  }
  Timer { id: fidgetEnd; onTriggered: pet.fidget = "" }
  onMoodChanged: { fidget = ""; fidgetEnd.stop() }
  onActiveChanged: if (!active) { fidget = ""; fidgetEnd.stop(); blinking = false }
  onExtrasChanged: if (!extras) { fidget = ""; fidgetEnd.stop() }

  // ---------- day / night (day-night; PetCalendar via the card) ----------
  // night: nightcap while curled up + more yawns; morning: the first wake of
  // the day (sleep -> calm) is a stretch + a cup of coffee. Single-shot timers.
  property bool night: false
  property bool morning: false
  property string morningDay: ""
  property real morningT0: 0
  readonly property bool dozing: mood === "sleep"
  onDozingChanged: if (!dozing && morning && motion !== "still" && morningDay !== new Date().toDateString()) morningWait.restart()
  Timer {
    id: morningWait
    interval: 800
    onTriggered: if (pet.active && pet.morningDay !== new Date().toDateString() && pet.mood === "calm" && touch.reaction === "" && !touch.dragged) pet.startMorning()
  }
  Timer { id: morningPlay; interval: 4500 }
  function startMorning() {
    pet.morningDay = new Date().toDateString()
    pet.morningT0 = pet.clock
    pet.fidget = ""
    morningPlay.restart()
  }

  // ---------- palettes ----------
  readonly property var pal: season !== "" ? colors.extend(PetSeason.palette(colors.bg, Qt.rgba)) : colors.base
  readonly property var fxFg: colors.fx(colors.fg)
  readonly property var fxHeart: colors.fx(colors.urgent)
  readonly property var fxSweat: colors.fx(colors.base.h)
  readonly property var fxHot: colors.fx(colors.urgent)

  // ---------- the hamster ----------
  PixelSprite {
    px: pet.px
    x: pet.offX * pet.px
    y: pet.offY * pet.px
    palette: pet.pal
    rows: Sprites.frame(pet.frameKey, PetSeason)
  }

  // ---------- effects (whole-cell positions; cells -> px) ----------
  // A fx sprite: visible only in its state; rows change only between frames.
  // Derived fx frames, built once (no array building inside bindings).
  readonly property var dustRight: [Fx.mirror(Fx.dust[0]), Fx.mirror(Fx.dust[1])]
  readonly property var effortLeft: Fx.mirror(Fx.effort)
  component FxSprite: PixelSprite {
    property real cx: 0
    property real cy: 0
    px: pet.px
    x: Math.round(cx) * pet.px
    y: Math.round(cy) * pet.px
  }

  readonly property real tReact: clock - reactT0
  readonly property bool sleeping: mood === "sleep" && !awake

  // z's drift up while asleep.
  Repeater {
    model: 2
    FxSprite {
      required property int index
      readonly property real ph: ((pet.wall * 0.35 + index * 0.5) % 1 + 1) % 1
      visible: pet.sleeping && ph < 0.85
      opacity: 0.6
      palette: pet.fxFg
      rows: index === 0 ? Fx.zed : Fx.zedSmall
      cx: 33 + index * 3 + Math.round(Math.sin(ph * 6.28))
      cy: 14 - ph * 13
    }
  }

  // Hearts while being petted.
  Repeater {
    model: 2
    FxSprite {
      required property int index
      readonly property real ph: (pet.tReact - index * 0.45) / 1.3
      visible: touch.reaction === "pet" && ph >= 0 && ph < 1
      palette: pet.fxHeart
      rows: index === 0 ? Fx.heart : Fx.heartSmall
      cx: (index === 0 ? 34 : 4) + Math.round(Math.sin(ph * 9))
      cy: (index === 0 ? 10 : 12) - ph * 10
    }
  }

  // Anger mark, pulsing.
  FxSprite {
    visible: touch.reaction === "annoyed"
    palette: pet.fxHot
    rows: Fx.anger
    cx: pet.fstep % 4 < 2 ? 35 : 36
    cy: pet.fstep % 4 < 2 ? 2 : 1
  }

  // Giggle sparkles while squished.
  FxSprite {
    visible: touch.reaction === "squish"
    palette: pet.fxFg
    rows: Fx.sparkle[pet.fstep % 4 < 2 ? 0 : 1]
    cx: 36
    cy: 10
  }

  // "!" while dangling.
  FxSprite {
    visible: touch.dragged
    palette: pet.fxHot
    rows: Fx.bang
    cx: 39
    cy: pet.fstep % 6 < 3 ? 2 : 1
  }

  // Landing dust at the feet.
  FxSprite {
    visible: touch.landing && pet.clock - pet.landT0 < 0.5
    palette: pet.fxFg
    opacity: 0.6
    rows: Fx.dust[pet.clock - pet.landT0 < 0.25 ? 0 : 1]
    cx: 5
    cy: 32
  }
  FxSprite {
    visible: touch.landing && pet.clock - pet.landT0 < 0.5
    palette: pet.fxFg
    opacity: 0.6
    rows: pet.dustRight[pet.clock - pet.landT0 < 0.25 ? 0 : 1]
    cx: 33
    cy: 32
  }

  // Notes while grooving.
  Repeater {
    model: 2
    FxSprite {
      required property int index
      readonly property real ph: ((pet.wall * 0.7 + index * 0.5) % 1 + 1) % 1
      visible: pet.grooving && ph < 0.8
      palette: pet.fxFg
      rows: index === 0 ? Fx.note : Fx.noteDouble
      cx: index === 0 ? 35 + Math.round(Math.sin(ph * 6.28)) : 2 + Math.round(Math.sin(ph * 6.28))
      cy: 12 - ph * 10
    }
  }

  readonly property bool showStruggle: struggling && !touch.dragged && !touch.landing
    && touch.reaction !== "squish"

  // Sweat drops slide off the head (both sides when critical).
  Repeater {
    model: 2
    FxSprite {
      required property int index
      readonly property real ph: ((pet.clock * 1.0 + index * 0.5) % 1 + 1) % 1
      visible: (pet.showStruggle && (index === 0 || pet.mood === "critical") && ph < 0.85)
        || (touch.dragged && index === 0 && ph < 0.85)
      palette: pet.fxSweat
      rows: Fx.sweat
      cx: index === 0 ? 35 + ph * 2 : 4 - ph * 2
      cy: 7 + ph * 8
    }
  }

  // Effort lines beside the head while straining.
  FxSprite {
    visible: pet.showStruggle && pet.mood === "strain" && pet.step % 2 === 0
    palette: pet.fxFg
    rows: Fx.effort
    cx: 39
    cy: 2
  }
  FxSprite {
    visible: pet.showStruggle && pet.mood === "strain" && pet.step % 2 === 0
    palette: pet.fxFg
    rows: pet.effortLeft
    cx: 1
    cy: 2
  }

  // Critical: red steam puffs, a dizzy spiral, chips spilling out of its mouth.
  Repeater {
    model: 2
    FxSprite {
      required property int index
      readonly property int fr: (pet.step + index * 2) % 4
      visible: pet.showStruggle && pet.mood === "critical" && fr < 3
      palette: pet.fxHot
      opacity: fr === 2 ? 0.6 : 0.9
      rows: Fx.puff[Math.min(fr, 2)]
      cx: index === 0 ? 34 + fr : 6 - fr * 2
      cy: 4 - fr * 2
    }
  }
  FxSprite {
    visible: pet.showStruggle && pet.mood === "critical"
    palette: pet.fxHot
    rows: Fx.spiral[pet.step % 2]
    cx: 36
    cy: 12
  }
  Repeater {
    model: 2
    FxSprite {
      required property int index
      readonly property real ph: ((pet.clock * 0.8 + index * 0.5) % 1 + 1) % 1
      readonly property int dir: index === 0 ? -1 : 1
      visible: pet.showStruggle && pet.mood === "critical" && ph < 0.95
      palette: pet.pal
      rows: Sprites.chip
      cx: (index === 0 ? 15 : 22) + dir * ph * 13
      cy: 21 + ph * ph * 12
    }
  }

  // Input over the body (mask + hover/click/hold).
  PetTouch {
    id: touch
    gazing: chat.looking
    gazeX: chat.lookX
    gazeY: chat.lookY
    anchors.fill: parent
    active: pet.active
    reactions: pet.reactions
    place: pet.place
    window: pet.window

  }

  // ---------- pet chat (shared PetChat.qml) ----------
  // Calm and awake: may send a sunflower seed from the hoard to a neighbour card now and then;
  // asleep: may receive one (wakes up to look). Only with motion "full".
  readonly property string chatStatus: !pet.extras || !pet.active || pet.grooving ? ""
    : pet.mood === "calm" ? "calm" : pet.mood === "sleep" ? "sleep" : ""
  PetChat {
    id: chat
    name: "hamster"
    item: "seed"
    status: pet.chatStatus
    place: pet.place
    clock: pet.clock
    px: pet.px
    from: Qt.point(22, 0)
  }
}
