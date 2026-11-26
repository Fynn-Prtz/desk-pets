import QtQuick
import "Sprites.js" as Sprites
import "PetFx.js" as PetFx

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
// motion: full = everything · calm = no fidgets, a single hoot on the hour ·
// still = mood frames only: no hoots, no blinks, no clock ticks.
Item {
  id: owl
  property string motion: "full"   // full | calm | still (petMotion setting)
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
  readonly property bool moving: !still && (mood === "sleep" || fidget !== "" || hooting || touch.busy || landPlay.running)
  readonly property bool fast: active && (touch.reaction !== "" || touch.dragged || touch.landing || landPlay.running)
  readonly property real wall: { var tick = owl.clock; return (Date.now() % 100000000) / 1000 }

  // ---------- hoots ----------
  property int hootCount: 0
  property real hootStart: 0
  // n hoots (the hour on a 12 h dial); ignored asleep / still / covered.
  function hoot(n) {
    if (still || !active || mood === "sleep" || n <= 0) return
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
      owl.fidgetStart = owl.clock
      fidgetEnd.interval = owl.fidgetLength[owl.fidget]
      fidgetEnd.restart()
      interval = 9000 + Math.floor(Math.random() * 9000)
    }
  }
  Timer { id: fidgetEnd; onTriggered: owl.fidget = "" }
  onMoodChanged: { fidget = ""; fidgetEnd.stop() }
  onMotionChanged: if (motion !== "full") { fidget = ""; fidgetEnd.stop() }

  // ---------- reactions ----------
  property real reactStart: 0
  property real landStart: 0
  Connections {
    target: touch
    function onSerialChanged() { owl.reactStart = owl.clock; owl.fidget = ""; hootEnd.stop() }
    function onLandingsChanged() { owl.landStart = owl.clock; landPlay.restart() }
  }
  Timer { id: landPlay; interval: 1500 }

  PetTouch {
    id: touch
    anchors.fill: parent
    active: owl.active
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
    still: owl.still
  }, PetFx)

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
    palette: colors.base
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
}
