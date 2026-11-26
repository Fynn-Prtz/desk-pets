import QtQuick
import "Sprites.js" as Sprites
import "PetFx.js" as PetFx

// Pixel tree frog that dresses for the weather (px 2 on the shared 44x38 pet
// canvas, docs/PETS.md). Everything it shows comes from Sprites.scene(): this
// item gathers the state, times fidgets / blinks / reactions and lays out the
// body, the floor shadow, up to six effect sprites and the sky layer (rain,
// snow or fog in front of the frog, masked by its umbrella).
//
// Moods (from the forecast, Weather.js):
//   sleep   late at night: dozes, throat sac breathing, z's
//   night   evening: gazes at the stars now and then
//   sun     sunglasses, smug grin; fidgets: glint, pushes the shades up, fly
//   hot     flattened under its shades, panting, fanning itself, sweating
//   cloudy  calm: blinks, looks around, snaps a fly, croaks, hops, yawns
//   cold    scarf, shivers in bursts, teeth chatter, breath puffs
//   wind    leans into the wind, scarf flapping, leaves blowing past
//   fog     peers left and right into drifting fog bands, "?"
//   drizzle umbrella, sways, a small hop in its puddle now and then
//   rain    umbrella, PUDDLE JUMPING with splashes
//   storm   hangs on to the umbrella the wind keeps grabbing (flips inside
//           out), strains, sweats, lightning
//   snow    scarf, snow on its eye domes, catches flakes on its tongue
//   setup / offline / waiting: no location / no data yet (waves, "?")
// `cold` adds the scarf to any mood. Neighbours: cat dancing -> croaks along;
// gamer launching -> "!".
// Touch (PetTouch): pet (happy croak, hearts), annoyed (puffs up, stomps),
// squish, hover (wakes, eyes follow), drag (dangles; floats on its umbrella),
// landing (squash + dust or a splash, then dizzy).
// motion: full | calm (no idle fidgets / neighbour extras) | still (one frame
// per mood, no clock at all).
Item {
  id: frog
  property string motion: "full"   // full | calm | still (petMotion setting)
  property string mood: "waiting"
  property bool cold: false
  property bool heavy: false
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

  readonly property bool still: motion === "still"
  readonly property bool calmOnly: motion !== "full"
  readonly property bool calmMood: mood === "cloudy" || mood === "sun" || mood === "night" || mood === "waiting"
    || mood === "setup" || mood === "offline"
  readonly property bool bop: !calmOnly && catMood === "dance" && calmMood
  readonly property bool bang: !calmOnly && gamerMood === "launching"

  // The mood itself animates (rain, snow, z's ...); calm moods rest.
  readonly property bool animated: !still && !calmMood
  // Wants frames although the mood alone would rest.
  readonly property bool moving: !still && (bop || bang || fidget !== "" || touch.busy || landPlay.running)
  readonly property bool fast: active && !still && (touch.reaction !== "" || touch.dragged || touch.landing || landPlay.running)

  readonly property real wall: { var tick = frog.clock; return (Date.now() % 100000000) / 1000 }

  // ---------- blinks ----------
  property bool blinking: false
  Timer {
    interval: 3200
    running: frog.active && !frog.still && frog.mood !== "sleep" && frog.mood !== "hot" && !frog.bop
    repeat: true
    onTriggered: { frog.blinking = true; blinkOff.restart(); interval = 2600 + Math.floor(Math.random() * 3000) }
  }
  Timer { id: blinkOff; interval: 150; onTriggered: frog.blinking = false }

  // ---------- idle fidgets (calm moods, motion full) ----------
  readonly property var fidgetSets: ({
    cloudy: ["look", "fly", "croak", "hop", "yawn"],
    waiting: ["look", "croak"],
    sun: ["glint", "shades", "fly", "croak", "look"],
    night: ["stars", "croak", "look", "yawn"],
    setup: ["look"],
    offline: ["look"],
    cold: ["look"]
  })
  readonly property var fidgetLength: ({ look: 2800, fly: 2800, croak: 2200, hop: 1600, yawn: 2200,
                                         glint: 2000, shades: 2600, stars: 3000 })
  property string fidget: ""
  property real fidgetStart: 0
  Timer {
    interval: 9000
    running: frog.active && !frog.calmOnly && !!frog.fidgetSets[frog.mood] && !frog.bop && !frog.bang
      && frog.fidget === "" && touch.reaction === "" && !touch.dragged && !touch.hovered
    onTriggered: {
      var set = frog.fidgetSets[frog.mood]
      frog.fidget = set[Math.floor(Math.random() * set.length)]
      frog.fidgetStart = frog.clock
      fidgetEnd.interval = frog.fidgetLength[frog.fidget]
      fidgetEnd.restart()
      interval = 8000 + Math.floor(Math.random() * 7000)
    }
  }
  Timer { id: fidgetEnd; onTriggered: frog.fidget = "" }
  onMoodChanged: if (fidget !== "") { fidget = ""; fidgetEnd.stop() }
  onActiveChanged: if (!active) { fidget = ""; fidgetEnd.stop() }
  onCalmOnlyChanged: if (calmOnly) { fidget = ""; fidgetEnd.stop() }

  // ---------- reactions ----------
  property real reactStart: 0
  property real landStart: 0
  Connections {
    target: touch
    function onSerialChanged() { frog.reactStart = frog.clock; frog.fidget = "" }
    function onLandingsChanged() { frog.landStart = frog.clock; if (!frog.still) landPlay.restart() }
  }
  Timer { id: landPlay; interval: 1500 }

  PetTouch {
    id: touch
    anchors.fill: parent
    active: frog.active
    place: frog.place
    window: frog.window
  }

  readonly property var scene: Sprites.scene({
    mood: frog.mood,
    cold: frog.cold,
    heavy: frog.heavy,
    still: frog.still,
    t: frog.clock,
    wall: frog.wall,
    blink: frog.blinking,
    fidget: frog.fidget,
    fidgetT: frog.clock - frog.fidgetStart,
    reaction: touch.reaction,
    reactT: frog.clock - frog.reactStart,
    hovered: touch.hovered,
    lookX: touch.lookX,
    lookY: touch.lookY,
    dragged: touch.dragged,
    lean: touch.lean,
    landT: landPlay.running && !touch.dragged ? frog.clock - frog.landStart : -1,
    bop: frog.bop,
    bang: frog.bang,
    beat: Math.floor(frog.wall * 4)
  }, PetFx)

  readonly property var fxPalettes: ({
    "o": colors.fx(colors.fg),
    "r": colors.fx(colors.urgent),
    "l": colors.fx(colors.base.l),
    "w": colors.fx(colors.base.w),
    "n": colors.fx(colors.base.n),
    "p": colors.fx(colors.base.p)
  })
  readonly property var none: []

  PixelSprite {
    px: frog.px
    x: 2 * frog.px
    y: 35 * frog.px
    palette: colors.base
    rows: frog.scene.shadow
  }

  PixelSprite {
    px: frog.px
    x: frog.scene.x * frog.px
    y: frog.scene.y * frog.px
    palette: colors.base
    rows: frog.scene.rows
  }

  Repeater {
    model: 6
    PixelSprite {
      required property int index
      readonly property var fx: index < frog.scene.fx.length ? frog.scene.fx[index] : null
      visible: !!fx
      px: frog.px
      x: fx ? fx.x * frog.px : 0
      y: fx ? fx.y * frog.px : 0
      opacity: fx ? fx.op : 0
      palette: fx ? frog.fxPalettes[fx.c] : frog.fxPalettes.o
      rows: fx ? fx.rows : frog.none
    }
  }

  // Weather in front of the frog (rain / snow / fog).
  PixelSprite {
    visible: !!frog.scene.sky
    px: frog.px
    opacity: frog.scene.skyOp
    palette: colors.base
    rows: frog.scene.sky || frog.none
  }
}
