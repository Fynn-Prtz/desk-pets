import QtQuick
import qs.Commons
import qs.Commons as Commons
import "Sprites.js" as Sprites

// Pixel floppy disk buddy. Idle: dozes, z's drift up. Light I/O: blinks.
// Busy: the shutter slides, eyes dart, it bobs and bits rise. Full: worried
// brows, a wobbly mouth, the label blushes urgent and it sweats. Moves only
// in whole pixels.
//
// Reacts to its desk neighbours (DeskLink moods, read only, "" = card absent):
//   cat dance -> (unless busy or full) wakes, bobs to the beat, notes rise
Item {
  id: disk
  property string mood: "idle"   // idle | light | busy | full
  property real clock: 0
  property int px: 4
  property bool active: true
  property string catMood: ""

  property bool blinking: false
  readonly property bool grooving: (mood === "idle" || mood === "light") && catMood === "dance"
  readonly property bool sleepy: mood === "idle" && !grooving
  readonly property bool busy: mood === "busy"
  readonly property bool full: mood === "full"
  // True while a neighbour needs the clock even though the disk's own mood
  // would let it rest (the service keeps its tick running for this).
  readonly property bool moving: grooving

  readonly property int beat: Math.floor(clock * 2)
  // Wall-clock seconds, re-read whenever the clock ticks: shared with the cat
  // so the z's float in sync and the groove lands on a steady beat.
  readonly property real wall: { var tick = disk.clock; return (Date.now() % 100000000) / 1000 }
  readonly property int grooveBeat: Math.floor(wall * 4)

  readonly property string eyeKey: grooving ? "happy"
    : sleepy ? "sleep"
    : busy ? (beat % 2 === 0 ? "left" : "right")
    : full ? "worried"
    : blinking ? "blink" : "open"
  readonly property string mouthKey: grooving || busy ? "open"
    : sleepy ? "none" : full ? "wavy" : "flat"
  readonly property string shutterKey: busy && beat % 2 === 1 ? "b" : "a"
  readonly property int eyeShift: grooving && grooveBeat % 2 === 1 ? -1 : 0
  readonly property int hop: grooving ? (grooveBeat % 2 === 0 ? -px : 0)
    : busy && beat % 2 === 0 ? -px : 0

  readonly property var palette: ({
    "o": Commons.Color.foreground,
    "b": Commons.Color.accent,
    "s": Commons.Color.background,
    "l": disk.full ? Qt.tint(Commons.Color.foreground, Util.alpha(Commons.Color.urgent, 0.55)) : Commons.Color.foreground,
    "f": Commons.Color.background
  })
  readonly property var fxPalette: ({ "o": disk.full ? Commons.Color.urgent : Commons.Color.accent })
  readonly property var zedPalette: ({ "o": Commons.Color.foreground })

  width: 16 * px + px * 6
  height: 13 * px + px * 6

  Timer {
    interval: 3200
    running: disk.active && disk.mood === "light" && !disk.grooving
    repeat: true
    onTriggered: { disk.blinking = true; blinkOff.restart(); interval = 2600 + Math.floor(Math.random() * 3000) }
  }
  Timer { id: blinkOff; interval: 150; onTriggered: disk.blinking = false }

  PixelSprite {
    px: disk.px
    x: disk.px * 2
    y: disk.px * 5 + disk.hop
    palette: disk.palette
    rows: Sprites.disk(disk.eyeKey, disk.mouthKey, disk.shutterKey, disk.eyeShift)
  }

  // Rising z's while dozing, notes while grooving, bits while busy, falling
  // sweat while full; whole-pixel steps.
  Repeater {
    model: 2
    PixelSprite {
      required property int index
      readonly property real phase: disk.sleepy
        ? ((disk.wall * 0.35 + index * 0.5) % 1 + 1) % 1
        : ((disk.clock * (disk.grooving ? 0.7 : 0.8) + index * 0.5) % 1 + 1) % 1
      px: 2
      palette: disk.sleepy ? disk.zedPalette : disk.fxPalette
      rows: disk.sleepy ? Sprites.zed : disk.grooving ? Sprites.note
        : disk.busy ? (index === 0 ? Sprites.one : Sprites.zero) : Sprites.drop
      x: disk.width - disk.px * 4 + (index === 0 ? 0 : -disk.px * 3) + Math.round(Math.sin(phase * 6.28)) * disk.px
      // z's, notes and bits rise, sweat falls.
      y: disk.full
        ? Math.round((disk.px * 2 + phase * disk.px * 7) / disk.px) * disk.px
        : Math.round((disk.px * 9 - phase * disk.px * 9) / disk.px) * disk.px
      opacity: (disk.sleepy || disk.grooving || disk.busy || disk.full)
        ? (phase < 0.8 ? 1 : 0) * (disk.sleepy ? 0.6 : 1) : 0
    }
  }
}
