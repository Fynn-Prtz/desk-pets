import QtQuick
import "Sprites.js" as Sprites
import "PetFx.js" as PetFx
import "PetSeason.js" as PetSeason
import "PetLove.js" as PetLove

// Pixel owl, the clock card's timekeeper (px 2 on the shared 44x38 pet
// canvas, docs/PETS.md): round feathery body with ear tufts, a pale facial
// disc with huge eyes, perched on a branch next to a pocket watch that shows
// the real time. Everything it shows comes from Sprites.scene(); this item
// gathers state, times fidgets / blinks / hoots / reactions and lays out the
// branch, the owl and the effects.
//
//   awake   blinks, fidgets: swivels its head right round, preens, checks
//           and taps the pocket watch, ruffles its feathers, tilts its head
//           ("?"), stretches a wing, yawns
//   drowsy  the hour before bedtime: heavy lids, yawns, ruffles, preens
//   sleep   at night: puffed up, tufts flat, wings wrapped, breathing, z's;
//           hover = one eye peeks open and follows the pointer
//   hoot    on the hour (hoot(n)): glances at the watch, then hoots n times
//           (puffed chest, beak open, "Hoo" + sound rings), the watch swings
// Touch (PetTouch): pet (fluffs up, happy squint, blush, tufts wiggle,
// hearts), annoyed (puffs up huge, wings on hips, beak clacks, stamps),
// squish, hover (head turns to follow: owls move heads, not eyes), drag
// (flaps, talons dangle, feathers fly), landing (squash, flutter, dizzy).
//
// Seasons (PetCalendar): Santa hat / witch hat / party hat between the ear
// tufts. Day-night: a nightcap while it sleeps; the first wake of the morning
// is a two-wing stretch, a sip of coffee and winding the pocket watch for the
// day. Welcome back: one hoot and a wing wave. Affection: a row of feathers
// after petting; fond owls perk up / wave on hover. Pet chat: sends a feather.
//
// motion: full = everything · calm = no fidgets, a single hoot on the hour ·
// still = mood frames only: no hoots, no blinks, no clock ticks.
Item {
  id: owl
  property string motion: "full"   // full | calm | still (petMotion setting)
  property bool reactions: true    // petReactions setting: false = no touch
  readonly property bool extras: motion === "full"
  property string season: ""   // "" | xmas | party | spooky (PetSeason.js via the card's PetCalendar)
  property string mood: "awake"    // awake | drowsy | sleep
  property real clock: 0
  property int hourStep: 0         // watch hour hand: 0..23 half hours on a 12 h dial
  property int minuteStep: 0       // watch minute hand: 0..11 (five minutes each)
  property int px: 2
  property bool active: true
  property var place: null
  property Item window: null
  property alias touch: touch

  width: 44 * px
  height: 38 * px

  PetColors { id: colors }

  readonly property bool still: motion === "still"
  readonly property bool hooting: hootEnd.running
  readonly property bool moving: !still && (mood === "sleep" || fidget !== "" || hooting || touch.busy || landPlay.running
    || morningPlay.running || greeting || loveRow)
  readonly property bool fast: active && (touch.reaction !== "" || touch.dragged || touch.landing || landPlay.running || greeting)
  readonly property real wall: { var tick = owl.clock; return (Date.now() % 100000000) / 1000 }

  // ---------- hoots ----------
  property int hootCount: 0
  property real hootStart: 0
  // n hoots (the hour on a 12 h dial); ignored asleep / still / covered.
  function hoot(n) {
    if (still || !active || mood === "sleep" || n <= 0 || greeting || morningPlay.running) return
    if (motion === "calm") n = 1
    fidget = ""; fidgetEnd.stop()
    hootCount = n
    hootStart = clock
    hootEnd.interval = 750 + n * 750 + 150
    hootEnd.restart()
  }
  Timer { id: hootEnd }
  onActiveChanged: if (!active) { fidget = ""; fidgetEnd.stop(); hootEnd.stop() }

  // ---------- blinks ----------
  property bool blinking: false
  Timer {
    interval: 3400
    running: owl.active && !owl.still && (owl.mood !== "sleep" || owl.touch.hovered)
    repeat: true
    onTriggered: {
      owl.blinking = true
      blinkOff.interval = owl.mood === "drowsy" ? 420 : 160
      blinkOff.restart()
      interval = owl.mood === "drowsy" ? 2200 + Math.floor(Math.random() * 1800) : 2600 + Math.floor(Math.random() * 3600)
    }
  }
  Timer { id: blinkOff; interval: 160; onTriggered: owl.blinking = false }

  // ---------- idle fidgets (full motion only) ----------
  readonly property var awakeFidgets: ["swivel", "preen", "watch", "ruffle", "tilt", "stretch", "watch", "swivel", "yawn"]
  readonly property var drowsyFidgets: ["yawn", "ruffle", "yawn", "preen"]
  readonly property var fidgetLength: ({ swivel: 3200, preen: 3000, watch: 3200, ruffle: 2200, tilt: 2500, stretch: 2700, yawn: 2000 })
  property string fidget: ""
  property real fidgetStart: 0
  Timer {
    interval: 8000
    running: owl.active && owl.motion === "full" && owl.mood !== "sleep" && owl.fidget === "" && !owl.hooting
      && touch.reaction === "" && !touch.dragged && !touch.hovered
    onTriggered: {
      var pool = owl.mood === "drowsy" ? owl.drowsyFidgets : owl.awakeFidgets
      owl.fidget = pool[Math.floor(Math.random() * pool.length)]
      if (owl.night && Math.random() < 0.5) owl.fidget = "yawn"   // day-night: up past bedtime, extra sleepy
      owl.fidgetStart = owl.clock
      fidgetEnd.interval = owl.fidgetLength[owl.fidget]
      fidgetEnd.restart()
      interval = 9000 + Math.floor(Math.random() * 9000)
    }
  }
  Timer { id: fidgetEnd; onTriggered: owl.fidget = "" }
  onMoodChanged: { fidget = ""; fidgetEnd.stop() }
  onMotionChanged: {
    if (motion !== "full") { fidget = ""; fidgetEnd.stop() }
    if (motion === "still") greetPlay.stop()
  }

  // ---------- reactions ----------
  property real reactStart: 0
  property real landStart: 0
  Connections {
    target: touch
    function onSerialChanged() { owl.reactStart = owl.clock; owl.fidget = ""; hootEnd.stop() }
    function onLandingsChanged() { owl.landStart = owl.clock; landPlay.restart() }
  }
  Timer { id: landPlay; interval: 1500 }

  // ---------- day / night (day-night; PetCalendar via the card) ----------
  // The owl keeps its own hours (nightFrom / nightTo): `night` from the card is
  // true while it sleeps there (or after 23:00) -> nightcap. morning: the first
  // wake of the day between 06:00 and 10:00 is a two-wing stretch + yawn, a sip
  // of coffee, then it winds the pocket watch for the day. Single-shot timers.
  property bool night: false
  property bool morning: false
  property string morningDay: ""
  property real morningStart: 0
  readonly property bool dozing: mood === "sleep"
  onDozingChanged: if (!dozing && morning && motion !== "still" && morningDay !== new Date().toDateString()) morningWait.restart()
  Timer {
    id: morningWait
    interval: 800
    onTriggered: if (owl.active && owl.morningDay !== new Date().toDateString() && owl.mood !== "sleep" && !owl.hooting
                     && touch.reaction === "" && !touch.dragged) owl.startMorning()
  }
  Timer { id: morningPlay; interval: 4500 }
  function startMorning() {
    owl.morningDay = new Date().toDateString()
    owl.morningStart = owl.clock
    owl.fidget = ""; fidgetEnd.stop()
    morningPlay.restart()
  }

  // ---------- affection (PetMemory.qml in the card; rows from PetLove.js) ----------
  // Level 1..5 (0 = off). After a pet: five little feathers drift into a row
  // above the watch twig, one by one; the newest blinks right after a level-up.
  // On hover (motion "full", at most every 30 s): level 3 perks its tufts up,
  // level 4+ waves a wing like in its welcome-back greeting.
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
    function onSerialChanged() { if (touch.reaction === "pet" && owl.affection > 0) { owl.loveStart = owl.clock; loveShow.restart() } }
    function onHoveredChanged() { if (touch.hovered) owl.hoverHello() }
  }
  function greetPart(from, to) {
    fidget = ""; fidgetEnd.stop(); greetStart = clock - from
    greetPlay.interval = Math.round((to - from) * 1000); greetPlay.restart()
  }
  function hoverHello() {
    if (motion !== "full" || !active || affection < 3 || greeting || hooting || touch.reaction !== "" || touch.dragged) return
    var now = Date.now()
    if (now - lastHello < 30000) return
    lastHello = now
    if (affection >= 4) greetPart(1.4, 2.7); else greetPart(0, 0.45)
  }
  PixelSprite {
    visible: owl.loveRow && owl.loveT >= 0.4
    px: owl.px
    x: 30 * owl.px
    y: 0
    z: 5
    opacity: owl.loveT > 3.0 ? 0.5 : 1
    palette: colors.base
    rows: owl.loveRow ? PetLove.row([".r", "rk", "rk", "o."], [".n", "nd", "nd", "o."], 5, owl.loveFilled, owl.loveShown, 1) : []
  }

  // ---------- welcome back (shared/PetGreet.qml bumps greetSerial) ----------
  // Perks up (opens its eyes if asleep), one proud "HOO!", then waves a wing.
  property int greetSerial: 0
  property real greetStart: 0
  readonly property bool greeting: greetPlay.running
  onGreetSerialChanged: if (motion !== "still" && active && !touch.dragged) {
    fidget = ""; fidgetEnd.stop(); hootEnd.stop(); greetStart = clock; greetPlay.interval = 2700; greetPlay.restart()
  }
  Timer { id: greetPlay; interval: 2700 }

  PetTouch {
    id: touch
    gazing: chat.looking
    gazeX: chat.lookX
    gazeY: chat.lookY
    anchors.fill: parent
    active: owl.active
    reactions: owl.reactions
    place: owl.place
    window: owl.window
  }

  readonly property var scene: Sprites.scene({
    mood: owl.mood,
    t: owl.clock,
    wall: owl.still ? 0 : owl.wall,
    blink: owl.blinking,
    fidget: owl.fidget,
    fidgetT: owl.clock - owl.fidgetStart,
    hoot: owl.hooting ? owl.hootCount : -1,
    hootT: owl.clock - owl.hootStart,
    hh: owl.hourStep,
    mm: owl.minuteStep,
    reaction: touch.reaction,
    reactT: owl.clock - owl.reactStart,
    hovered: touch.hovered,
    lookX: touch.lookX,
    lookY: touch.lookY,
    dragged: touch.dragged,
    lean: touch.lean,
    landT: landPlay.running && !touch.dragged ? owl.clock - owl.landStart : -1,
    still: owl.still,
    season: owl.season,
    motion: owl.motion,
    night: owl.night,
    morningT: morningPlay.running ? owl.clock - owl.morningStart : -1,
    greetT: greetPlay.running ? owl.clock - owl.greetStart : -1
  }, PetFx, PetSeason)

  readonly property var fxPalettes: ({
    "o": colors.fx(colors.fg),
    "r": colors.fx(colors.urgent),
    "l": colors.fx(colors.base.l)
  })
  readonly property var none: []

  // branch, twig and pocket watch (behind, never offset)
  PixelSprite {
    px: owl.px
    palette: colors.base
    rows: owl.scene.prop
  }

  PixelSprite {
    px: owl.px
    x: owl.scene.x * owl.px
    y: owl.scene.y * owl.px
    palette: owl.season !== "" ? colors.extend(PetSeason.palette(colors.bg, Qt.rgba)) : colors.base
    rows: owl.scene.rows
  }

  Repeater {
    model: 6
    PixelSprite {
      required property int index
      readonly property var fx: index < owl.scene.fx.length ? owl.scene.fx[index] : null
      visible: !!fx
      px: owl.px
      x: fx ? fx.x * owl.px : 0
      y: fx ? fx.y * owl.px : 0
      opacity: fx ? fx.op : 0
      palette: fx ? owl.fxPalettes[fx.c] : owl.fxPalettes.o
      rows: fx ? fx.rows : owl.none
    }
  }

  // ---------- pet chat (shared PetChat.qml) ----------
  // Awake and calm: may send a feather (a quill for writing, from the wise owl)
  // to a neighbour card now and then; asleep: may receive one (one eye opens,
  // then both). Only with motion "full".
  readonly property string chatStatus: !owl.extras || !owl.active || owl.hooting ? ""
    : owl.mood === "sleep" ? "sleep" : "calm"
  PetChat {
    id: chat
    name: "owl"
    item: "feather"
    status: owl.chatStatus
    place: owl.place
    clock: owl.clock
    px: owl.px
    from: Qt.point(16, 1)
  }
}
