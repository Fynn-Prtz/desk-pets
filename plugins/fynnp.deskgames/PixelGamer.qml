import QtQuick
import "Sprites.js" as Sprites
import "PetFx.js" as PetFx
import "PetSeason.js" as PetSeason

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

  readonly property bool moving: bop || fidget !== "" || touch.busy || landPlay.running
  readonly property bool fast: active && (touch.reaction !== "" || touch.dragged || touch.landing || landPlay.running)
  readonly property real wall: { var tick = gamer.clock; return (Date.now() % 100000000) / 1000 }

  // ---------- blinks (also the trophy's twinkle) ----------
  property bool blinking: false
  readonly property bool awake: mood === "ready" || mood === "report" || (mood === "idle" && touch.hovered)
  Timer {
    interval: 3200
    running: gamer.active && gamer.awake && !gamer.bop
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
    running: gamer.active && gamer.mood === "ready" && !gamer.bop && gamer.fidget === ""
      && touch.reaction === "" && !touch.dragged && !touch.hovered
    onTriggered: {
      gamer.fidget = gamer.fidgets[Math.floor(Math.random() * gamer.fidgets.length)]
      gamer.fidgetStart = gamer.clock
      fidgetEnd.interval = gamer.fidgetLength[gamer.fidget]
      fidgetEnd.restart()
      interval = 8000 + Math.floor(Math.random() * 7000)
    }
  }
  Timer { id: fidgetEnd; onTriggered: gamer.fidget = "" }
  onMoodChanged: if (fidget !== "" && mood !== "ready") { fidget = ""; fidgetEnd.stop() }
  onActiveChanged: if (!active) { fidget = ""; fidgetEnd.stop() }

  // ---------- reactions ----------
  property real reactStart: 0
  property real landStart: 0
  Connections {
    target: touch
    function onSerialChanged() { gamer.reactStart = gamer.clock; gamer.fidget = "" }
    function onLandingsChanged() { gamer.landStart = gamer.clock; landPlay.restart() }
  }
  Timer { id: landPlay; interval: 1500 }

  PetTouch {
    id: touch
    anchors.fill: parent
    active: gamer.active
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
    motion: gamer.motion
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
}
