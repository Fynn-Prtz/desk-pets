import QtQuick
import "Sprites.js" as Sprites
import "PetFx.js" as PetFx
import "PetSeason.js" as PetSeason
import "PetLove.js" as PetLove

// Pixel axolotl gamer (px 2 on the shared 44x38 pet canvas, docs/PETS.md):
// big round head with pink frilly gills, chubby body, tail, mitten arms
// holding a small controller, headset with mic. Everything it shows comes
// from Sprites.scene(); this item gathers state, times fidgets / blinks /
// reactions and lays out body, shadow and effects.
//
//   idle       curled up asleep, headset around its neck, pad put down, z's
//   ready      blinks, fidgets (adjusts headset, presses buttons, looks
//              around, stretches, wiggles gills + tail)
//   launching  sparkly eyes, hops with the pad raised over its head, "!"
//   playing    focused, tongue out, mashing the pad (buttons flash)
//     strain 1 (system buddy under load): > < eyes, gritted teeth, gills
//              flared, frantic mashing, stomping, sweat, effort lines
//     strain 2 (buddy maxed / hot): rolling dizzy eyes, wobbling, spirals
//   report     proud grin, holds the trophy up in front of its tummy,
//              sparkles twinkle on the blink timer (no clock ticks)
//   bop        cat dancing next door: dances with notes
// Touch (PetTouch): pet (gills wiggle, tail wags, hearts), annoyed (gills
// puff, stomps), squish, hover (eyes follow), drag (dangles, gills swept
// back), landing.
Item {
  id: gamer
  property string motion: "full"   // full | calm | still (petMotion setting, wired by pet-settings)
  property bool reactions: true    // petReactions setting: false = no touch
  // full: everything · calm: no fidgets (the card drops the cat bop) · still:
  // mood frames only, no blinks; the card stops its clock.
  readonly property bool extras: motion === "full"
  readonly property bool still: motion === "still"
  property string season: ""   // "" | xmas | party | spooky (PetSeason.js via the card's PetCalendar)
  property string mood: "idle"   // idle | ready | launching | playing | report
  property int strain: 0         // 0 calm | 1 system under load | 2 maxed / hot
  property bool bop: false
  property real clock: 0
  property int px: 2
  property bool active: true
  property var place: null
  property Item window: null
  property alias touch: touch

  width: 44 * px
  height: 38 * px

  PetColors { id: colors }

  readonly property bool moving: bop || fidget !== "" || touch.busy || landPlay.running || morningPlay.running || greeting || loveRow
  readonly property bool fast: active && (touch.reaction !== "" || touch.dragged || touch.landing || landPlay.running || greeting)
  readonly property real wall: { var tick = gamer.clock; return (Date.now() % 100000000) / 1000 }

  // ---------- blinks (also the trophy's twinkle) ----------
  property bool blinking: false
  readonly property bool awake: mood === "ready" || mood === "report" || (mood === "idle" && touch.hovered)
  Timer {
    interval: 3200
    running: gamer.active && gamer.awake && !gamer.bop && !gamer.still
    repeat: true
    onTriggered: {
      gamer.blinking = true
      blinkOff.interval = gamer.mood === "report" ? 450 : 150
      blinkOff.restart()
      interval = gamer.mood === "report" ? 1200 + Math.floor(Math.random() * 1200) : 2600 + Math.floor(Math.random() * 3000)
    }
  }
  Timer { id: blinkOff; interval: 150; onTriggered: gamer.blinking = false }

  // ---------- idle fidgets (ready only) ----------
  readonly property var fidgets: ["headset", "press", "look", "stretch", "wiggle"]
  readonly property var fidgetLength: ({ headset: 2000, press: 2500, look: 2800, stretch: 2600, wiggle: 2000 })
  property string fidget: ""
  property real fidgetStart: 0
  Timer {
    interval: 9000
    running: gamer.active && gamer.extras && gamer.mood === "ready" && !gamer.bop && gamer.fidget === ""
      && touch.reaction === "" && !touch.dragged && !touch.hovered
    onTriggered: {
      gamer.fidget = gamer.fidgets[Math.floor(Math.random() * gamer.fidgets.length)]
      if (gamer.night && Math.random() < 0.5) gamer.fidget = "stretch"   // day-night: extra sleepy (big tired stretch)
      gamer.fidgetStart = gamer.clock
      fidgetEnd.interval = gamer.fidgetLength[gamer.fidget]
      fidgetEnd.restart()
      interval = 8000 + Math.floor(Math.random() * 7000)
    }
  }
  Timer { id: fidgetEnd; onTriggered: gamer.fidget = "" }
  onMoodChanged: if (fidget !== "" && mood !== "ready") { fidget = ""; fidgetEnd.stop() }
  onActiveChanged: if (!active) { fidget = ""; fidgetEnd.stop() }
  onExtrasChanged: if (!extras) { fidget = ""; fidgetEnd.stop() }


  // ---------- reactions ----------
  property real reactStart: 0
  property real landStart: 0
  Connections {
    target: touch
    function onSerialChanged() { gamer.reactStart = gamer.clock; gamer.fidget = "" }
    function onLandingsChanged() { gamer.landStart = gamer.clock; landPlay.restart() }
  }
  Timer { id: landPlay; interval: 1500 }

  // ---------- day / night (day-night; PetCalendar via the card) ----------
  // night: nightcap while curled up + tired stretches; morning: the first
  // wake of the day (idle -> ready) is a stretch + coffee. Single-shot timers.
  property bool night: false
  property bool morning: false
  property string morningDay: ""
  property real morningStart: 0
  readonly property bool dozing: mood === "idle"
  onDozingChanged: if (!dozing && morning && motion !== "still" && morningDay !== new Date().toDateString()) morningWait.restart()
  Timer {
    id: morningWait
    interval: 800
    onTriggered: if (gamer.active && gamer.morningDay !== new Date().toDateString() && gamer.mood === "ready" && touch.reaction === "" && !touch.dragged) gamer.startMorning()
  }
  Timer { id: morningPlay; interval: 4500 }
  function startMorning() {
    gamer.morningDay = new Date().toDateString()
    gamer.morningStart = gamer.clock
    gamer.fidget = ""
    morningPlay.restart()
  }

  // ---------- affection (PetMemory.qml in the card; rows from PetLove.js) ----------
  // Level 1..5 (0 = off). After a pet: a game HUD: a row of life hearts in the top-left corner, filling up fast like a health refill; the newest one blinks
  // right after a level-up. On hover (motion "full", at most every 30 s): level 3 perks up,
  // level 4+ plays the wave from its welcome-back greeting.
  property int affection: 0
  property bool affectionUp: false
  property real loveStart: 0
  property double lastHello: 0
  readonly property bool loveRow: loveShow.running && affection > 0 && motion !== "still"
  readonly property real loveT: clock - loveStart
  readonly property int loveShown: Math.max(0, Math.min(5, Math.floor((loveT - 0.4) / 0.15) + 1))
  readonly property int loveFilled: affectionUp && Math.floor(clock * 4) % 2 === 0 ? affection - 1 : affection
  Timer { id: loveShow; interval: 3400 }
  Connections {
    target: touch
    function onSerialChanged() { if (touch.reaction === "pet" && gamer.affection > 0) { gamer.loveStart = gamer.clock; loveShow.restart() } }
    function onHoveredChanged() { if (touch.hovered) gamer.hoverHello() }
  }
  function greetPart(from, to) {
    fidget = ""; fidgetEnd.stop(); greetStart = clock - from
    greetPlay.interval = Math.round((to - from) * 1000); greetPlay.restart()
  }
  function hoverHello() {
    if (motion !== "full" || !active || affection < 3 || greeting || touch.reaction !== "" || touch.dragged) return
    var now = Date.now()
    if (now - lastHello < 30000) return
    lastHello = now
    if (affection >= 4) greetPart(1.4, 2.7); else greetPart(0, 0.4)
  }
  PixelSprite {
    visible: gamer.loveRow && gamer.loveT >= 0.4
    px: gamer.px
    x: 0 * gamer.px
    y: 0 * gamer.px
    z: 5
    opacity: gamer.loveT > 3.0 ? 0.5 : 1
    palette: colors.base
    rows: gamer.loveRow ? PetLove.row(["r.r", "rrr", ".r."], ["n.n", "nnn", ".n."], 5, gamer.loveFilled, gamer.loveShown, 1) : []
  }

  // ---------- welcome back (shared/PetGreet.qml bumps greetSerial) ----------
  // "Player two has joined": jump with the pad held high, "1UP", then a wave.
  property int greetSerial: 0
  property real greetStart: 0
  readonly property bool greeting: greetPlay.running
  onGreetSerialChanged: if (motion !== "still" && active && !touch.dragged) {
    fidget = ""; fidgetEnd.stop(); greetStart = clock; greetPlay.interval = 2700; greetPlay.restart()
  }
  onMotionChanged: if (motion === "still") greetPlay.stop()
  Timer { id: greetPlay; interval: 2700 }

  PetTouch {
    id: touch
    gazing: chat.looking
    gazeX: chat.lookX
    gazeY: chat.lookY
    anchors.fill: parent
    active: gamer.active
    reactions: gamer.reactions
    place: gamer.place

    window: gamer.window
  }

  readonly property var scene: Sprites.scene({
    mood: gamer.mood,
    strain: gamer.strain,
    bop: gamer.bop,
    t: gamer.clock,
    wall: gamer.wall,
    blink: gamer.blinking,
    fidget: gamer.fidget,
    fidgetT: gamer.clock - gamer.fidgetStart,
    reaction: touch.reaction,
    reactT: gamer.clock - gamer.reactStart,
    hovered: touch.hovered,
    lookX: touch.lookX,
    lookY: touch.lookY,
    dragged: touch.dragged,
    lean: touch.lean,
    landT: landPlay.running && !touch.dragged ? gamer.clock - gamer.landStart : -1,
    beat: Math.floor(gamer.wall * 4),
    season: gamer.season,
    motion: gamer.motion,
    night: gamer.night,
    morningT: morningPlay.running ? gamer.clock - gamer.morningStart : -1,
    greetT: greetPlay.running ? gamer.clock - gamer.greetStart : -1
  }, PetFx, PetSeason)

  readonly property var fxPalettes: ({
    "o": colors.fx(colors.fg),
    "r": colors.fx(colors.urgent),
    "l": colors.fx(colors.base.l)
  })
  readonly property var none: []

  PixelSprite {
    px: gamer.px
    x: 2 * gamer.px
    y: 35 * gamer.px
    palette: colors.base
    rows: gamer.scene.shadow
  }

  PixelSprite {
    px: gamer.px
    x: gamer.scene.x * gamer.px
    y: gamer.scene.y * gamer.px
    palette: gamer.season !== "" ? colors.extend(PetSeason.palette(colors.bg, Qt.rgba)) : colors.base
    rows: gamer.scene.rows
  }

  Repeater {
    model: 6
    PixelSprite {
      required property int index
      readonly property var fx: index < gamer.scene.fx.length ? gamer.scene.fx[index] : null
      visible: !!fx
      px: gamer.px
      x: fx ? fx.x * gamer.px : 0
      y: fx ? fx.y * gamer.px : 0
      opacity: fx ? fx.op : 0
      palette: fx ? gamer.fxPalettes[fx.c] : gamer.fxPalettes.o
      rows: fx ? fx.rows : gamer.none
    }
  }

  // ---------- pet chat (shared PetChat.qml) ----------
  // Calm and awake: may send a bubble (axolotls blow bubbles) to a neighbour card now and then;
  // asleep: may receive one (wakes up to look). Only with motion "full".
  readonly property string chatStatus: !gamer.extras || !gamer.active || gamer.bop ? ""
    : gamer.mood === "ready" ? "calm" : gamer.mood === "idle" ? "sleep" : ""
  PetChat {
    id: chat
    name: "gamer"
    item: "bubble"
    status: gamer.chatStatus
    place: gamer.place
    clock: gamer.clock
    px: gamer.px
    from: Qt.point(21, 0)
  }
}
