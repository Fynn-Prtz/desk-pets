import QtQuick
import "Sprites.js" as Sprites
import "PetFx.js" as PetFx

// Pixel penguin at a tiny CRT (px 2 on the shared 44x38 pet canvas,
// docs/PETS.md). The penguin stands at a little desk with a beige CRT, a
// keyboard and a mug. Everything it shows comes from Sprites.scene(): this
// item only gathers the state, times fidgets / blinks / reactions and lays
// out the body, the floor shadow and up to six effect sprites.
//
// Ladder (mood from CPU/GPU load + temps):
//   idle  dozes with its head on the keyboard, screen off, breathes, z's
//   chill blinks, fidgets (sip from the mug, look around, stretch, yawn,
//         waddle, a few keystrokes)
//   work  types away, code scrolls, progress bar fills
//   load  STRUGGLE: frantic typing, flapping, > < eyes, gritted beak, sweat,
//         effort lines, the CRT rattles and its fans puff
//   maxed dizzy, loading ring / "100" glitch on the screen, papers flying
//   hot   MELTS: sinks into a growing puddle, fans itself, steams, pants;
//         pulls itself together now and then (shiver), thermometer on screen
// Neighbours: cat dance -> grooves, equaliser on the screen; gamer launching
// -> "!" on the screen; gamer playing while stressed -> gamepad on the screen.
// Touch (PetTouch): pet (heart on the screen), annoyed, squish, hover (eyes
// follow), drag (penguin lifted, flails), landing (squash + dust, then dizzy).
Item {
  id: buddy
  property string motion: "full"   // full | calm | still (petMotion setting, wired by pet-settings)
  property bool reactions: true    // petReactions setting: false = no touch, card click-through
  // full: everything · calm: no fidgets, no neighbour extras (groove, screen
  // signs) · still: mood frames only, no blinks; the card stops its clock.
  readonly property bool extras: motion === "full"
  readonly property bool still: motion === "still"
  property string mood: "idle"   // idle | chill | work | load | maxed | hot
  property real clock: 0
  property int px: 2
  property bool active: true
  property string catMood: ""
  property string gamerMood: ""
  property var place: null
  property Item window: null
  property alias touch: touch

  width: 44 * px
  height: 38 * px

  PetColors { id: colors }

  readonly property bool stressed: mood === "load" || mood === "maxed" || mood === "hot"
  readonly property bool grooving: extras && !stressed && catMood === "dance"
  readonly property string screenKey: !extras ? ""
    : gamerMood === "launching" ? "bang"
    : (gamerMood === "playing" && stressed) ? "pad" : ""

  // Wants frames although the mood alone would rest (the service keeps its
  // clock running for this).
  readonly property bool moving: grooving || screenKey !== "" || fidget !== "" || touch.busy || landPlay.running
  // Reactions, drags and landings play at 8 fps; everything else at 4.
  readonly property bool fast: active && (touch.reaction !== "" || touch.dragged || touch.landing || landPlay.running)

  // Wall-clock seconds, re-read on every tick: shared with the cat so z's
  // and the groove beat line up across cards.
  readonly property real wall: { var tick = buddy.clock; return (Date.now() % 100000000) / 1000 }

  // ---------- blinks ----------
  property bool blinking: false
  readonly property bool awake: mood === "chill" || mood === "work" || (mood === "idle" && touch.hovered)
  Timer {
    interval: 3200
    running: buddy.active && buddy.awake && !buddy.grooving && !buddy.still
    repeat: true
    onTriggered: { buddy.blinking = true; blinkOff.restart(); interval = 2600 + Math.floor(Math.random() * 3000) }
  }
  Timer { id: blinkOff; interval: 150; onTriggered: buddy.blinking = false }

  // ---------- idle fidgets (chill only) ----------
  readonly property var fidgets: ["look", "stretch", "yawn", "sip", "wiggle", "type"]
  readonly property var fidgetLength: ({ look: 2800, stretch: 2600, yawn: 2600, sip: 3000, wiggle: 2000, type: 2000 })
  property string fidget: ""
  property real fidgetStart: 0
  Timer {
    interval: 9000
    running: buddy.active && buddy.extras && buddy.mood === "chill" && !buddy.grooving && buddy.screenKey === ""
      && buddy.fidget === "" && touch.reaction === "" && !touch.dragged && !touch.hovered
    onTriggered: {
      buddy.fidget = buddy.fidgets[Math.floor(Math.random() * buddy.fidgets.length)]
      buddy.fidgetStart = buddy.clock
      fidgetEnd.interval = buddy.fidgetLength[buddy.fidget]
      fidgetEnd.restart()
      interval = 8000 + Math.floor(Math.random() * 7000)
    }
  }
  Timer { id: fidgetEnd; onTriggered: buddy.fidget = "" }
  onMoodChanged: if (fidget !== "" && mood !== "chill") { fidget = ""; fidgetEnd.stop() }
  onActiveChanged: if (!active) { fidget = ""; fidgetEnd.stop() }
  onExtrasChanged: if (!extras) { fidget = ""; fidgetEnd.stop() }

  // ---------- reactions ----------
  property real reactStart: 0
  property real landStart: 0
  Connections {
    target: touch
    function onSerialChanged() { buddy.reactStart = buddy.clock; buddy.fidget = "" }
    function onLandingsChanged() { buddy.landStart = buddy.clock; landPlay.restart() }
  }
  // Landing: 0.3 s squash + dust, a little rebound, then a dizzy wobble.
  Timer { id: landPlay; interval: 1500 }

  PetTouch {
    id: touch
    gazing: chat.looking
    gazeX: chat.lookX
    gazeY: chat.lookY
    anchors.fill: parent
    active: buddy.active
    reactions: buddy.reactions
    place: buddy.place

    window: buddy.window
  }

  readonly property var scene: Sprites.scene({
    mood: buddy.mood,
    t: buddy.clock,
    wall: buddy.wall,
    blink: buddy.blinking,
    fidget: buddy.fidget,
    fidgetT: buddy.clock - buddy.fidgetStart,
    reaction: touch.reaction,
    reactT: buddy.clock - buddy.reactStart,
    hovered: touch.hovered,
    lookX: touch.lookX,
    lookY: touch.lookY,
    dragged: touch.dragged,
    lean: touch.lean,
    landT: landPlay.running && !touch.dragged ? buddy.clock - buddy.landStart : -1,
    grooving: buddy.grooving,
    beat: Math.floor(buddy.wall * 4),
    screenKey: buddy.screenKey
  }, PetFx)

  readonly property var bodyPalette: colors.extend({ "L": colors.accent })
  readonly property var fxPalettes: ({
    "o": colors.fx(colors.fg),
    "r": colors.fx(colors.urgent),
    "k": colors.fx(colors.base.k),
    "l": colors.fx(colors.base.l),
    "w": colors.fx(colors.base.w),
    "p": colors.fx(colors.base.p)
  })
  readonly property var none: []

  PixelSprite {
    px: buddy.px
    x: 2 * buddy.px
    y: 35 * buddy.px
    palette: colors.base
    rows: buddy.scene.shadow
  }

  PixelSprite {
    px: buddy.px
    x: buddy.scene.x * buddy.px
    y: buddy.scene.y * buddy.px
    palette: buddy.bodyPalette
    rows: buddy.scene.rows
  }

  Repeater {
    model: 6
    PixelSprite {
      required property int index
      readonly property var fx: index < buddy.scene.fx.length ? buddy.scene.fx[index] : null
      visible: !!fx
      px: buddy.px
      x: fx ? fx.x * buddy.px : 0
      y: fx ? fx.y * buddy.px : 0
      opacity: fx ? fx.op : 0
      palette: fx ? buddy.fxPalettes[fx.c] : buddy.fxPalettes.o
      rows: fx ? fx.rows : buddy.none
    }
  }

  // ---------- pet chat (shared PetChat.qml) ----------
  // Calm and awake: may send a paper plane (a memo for the neighbour) to a neighbour card now and then;
  // asleep: may receive one (wakes up to look). Only with motion "full".
  readonly property string chatStatus: !buddy.extras || !buddy.active || buddy.stressed || buddy.grooving || buddy.screenKey !== "" ? ""
    : buddy.mood === "chill" ? "calm" : buddy.mood === "idle" ? "sleep" : ""
  PetChat {
    id: chat
    name: "buddy"
    item: "plane"
    status: buddy.chatStatus
    place: buddy.place
    clock: buddy.clock
    px: buddy.px
    from: Qt.point(10, 0)
  }
}
