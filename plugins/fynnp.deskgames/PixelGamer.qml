import QtQuick
import qs.Commons
import qs.Commons as Commons
import "Sprites.js" as Sprites

// Pixel gamepad critter. Idle: dozes, z's drift up. Ready: perks up, blinks.
// Launching: wide eyes, jumps. Playing: focused, mashes buttons. Report:
// proud grin, holds a tiny trophy that glints. Peers: sweats while the system
// buddy is under load, bops while the cat dances. Whole-pixel moves only.
Item {
  id: gamer
  property string mood: "idle"   // idle | ready | launching | playing | report
  property bool sweat: false
  property bool bop: false
  property real clock: 0
  property int px: 4

  property bool blinking: false
  readonly property bool sleepy: mood === "idle" && !bop
  readonly property bool sweating: sweat && !sleepy && mood !== "report"

  readonly property string eyeKey: sleepy ? "sleep"
    : mood === "launching" ? "wide"
    : mood === "playing" ? "focus"
    : mood === "report" || bop ? "happy"
    : sweating ? "worry"
    : blinking ? "blink" : "open"
  readonly property string mouthKey: sleepy ? "none"
    : mood === "launching" ? "open"
    : mood === "report" || bop ? "grin"
    : "flat"

  readonly property int beat: Math.floor(clock * 4)
  readonly property int frame: mood === "playing" ? 1 + beat % 2 : 0
  readonly property int hop: mood === "launching" ? (beat % 2 === 0 ? -px * 2 : 0)
    : bop && mood !== "playing" ? (beat % 2 === 0 ? -px : 0) : 0
  readonly property int sway: bop && mood !== "playing" && mood !== "launching"
    ? ((Math.floor(beat / 2) % 2 === 0) ? -px : px) : 0

  readonly property var palette: ({
    "o": Commons.Color.foreground,
    "b": Commons.Color.accent,
    "d": Commons.Color.background,
    "a": Qt.tint(Commons.Color.accent, Util.alpha(Commons.Color.urgent, 0.55)),
    "h": Commons.Color.foreground,
    "s": Commons.Color.background,
    "f": Commons.Color.foreground,
    "m": Commons.Color.urgent
  })
  readonly property var fxPalette: ({ "o": Commons.Color.accent })
  readonly property var zedPalette: ({ "o": Commons.Color.foreground })
  readonly property var trophyPalette: ({ "o": Commons.Color.accent, "s": Commons.Color.foreground })

  width: 16 * px + px * 6
  height: 13 * px + px * 6

  // Blinks (and the trophy's glint) on a slow random timer, only while awake
  // and still -- the clock is not running in these moods.
  Timer {
    interval: 3200
    running: gamer.visible && (gamer.mood === "ready" || gamer.mood === "report") && !gamer.bop && !gamer.sweating
    repeat: true
    onTriggered: { gamer.blinking = true; blinkOff.restart(); interval = 2600 + Math.floor(Math.random() * 3000) }
  }
  Timer { id: blinkOff; interval: 150; onTriggered: gamer.blinking = false }

  PixelSprite {
    px: gamer.px
    x: gamer.px * 2 + gamer.sway
    y: gamer.px * 5 + gamer.hop
    palette: gamer.palette
    rows: Sprites.gamer(gamer.eyeKey, gamer.mouthKey, gamer.frame)
  }

  // Trophy held up beside the right side of the body (never over the grip);
  // follows the body's sway/hop so the two never overlap.
  PixelSprite {
    visible: gamer.mood === "report"
    px: 2
    x: gamer.px * 2 + 16 * gamer.px + gamer.sway
    y: gamer.px * 5 + 6 * gamer.px + gamer.hop
    palette: gamer.trophyPalette
    rows: Sprites.trophy
  }
  PixelSprite {
    visible: gamer.mood === "report" && gamer.blinking
    px: 2
    x: gamer.px * 2 + 16 * gamer.px + 8 + gamer.sway
    y: gamer.px * 5 + 6 * gamer.px - 8 + gamer.hop
    palette: gamer.zedPalette
    rows: Sprites.sparkle
  }

  // Rising z's while dozing, notes while bopping, falling sweat; whole pixels.
  Repeater {
    model: 2
    PixelSprite {
      required property int index
      readonly property bool rising: gamer.sleepy || (gamer.bop && !gamer.sweating)
      readonly property real phase: ((gamer.clock * (gamer.sleepy ? 0.35 : 0.8) + index * 0.5) % 1 + 1) % 1
      px: 2
      palette: gamer.sleepy ? gamer.zedPalette : gamer.fxPalette
      rows: gamer.sleepy ? Sprites.zed : gamer.sweating ? Sprites.drop : Sprites.note
      x: gamer.width - gamer.px * 4 + (index === 0 ? 0 : -gamer.px * 3) + Math.round(Math.sin(phase * 6.28)) * gamer.px
      y: rising
        ? Math.round((gamer.px * 9 - phase * gamer.px * 9) / gamer.px) * gamer.px
        : Math.round((gamer.px * 2 + phase * gamer.px * 7) / gamer.px) * gamer.px
      opacity: (gamer.sleepy || gamer.sweating || gamer.bop) && gamer.mood !== "report"
        ? (phase < 0.8 ? 1 : 0) * (gamer.sleepy ? 0.6 : 1) : 0
    }
  }
}
