import QtQuick
import qs.Commons
import qs.Commons as Commons
import "Sprites.js" as Sprites

// Pixel router buddy. Idle (little traffic): dozes, z's drift up. Light
// traffic: awake, blinks, its LEDs show which way bytes flow. Busy: ^ ^,
// antennas wiggle, LEDs flicker, packets fall into the left antenna (down)
// and rise from the right one (up). Offline: antennas flop over, worried
// eyes, LEDs and tips turn urgent, a "?" hangs above (static, no clock).
// Moves only in whole pixels.
//
// Reacts to its desk neighbours (DeskLink moods, read-only, "" = card absent):
//   cat dance -> (unless busy / offline) wakes, bobs to the beat, notes rise
Item {
  id: buddy
  property string mood: "idle"   // idle | light | busy | offline
  property real clock: 0
  property int px: 4
  property bool active: true
  property real rx: 0            // bytes/s
  property real tx: 0
  property string catMood: ""

  property bool blinking: false
  readonly property bool offline: mood === "offline"
  readonly property bool busy: mood === "busy"
  readonly property bool grooving: !busy && !offline && catMood === "dance"
  readonly property bool sleepy: mood === "idle" && !grooving
  // True while a neighbour needs the clock even though the buddy's own mood
  // would let it rest (the service keeps its tick running for this).
  readonly property bool moving: grooving

  readonly property bool rxOn: rx >= 4096
  readonly property bool txOn: tx >= 4096
  readonly property bool rxFast: rx >= 65536
  readonly property bool txFast: tx >= 65536

  readonly property int beat: Math.floor(clock * 2)
  // Wall-clock seconds, re-read whenever the clock ticks: shared with the
  // other pets so everybody's z's float in sync and grooves land on the beat.
  readonly property real wall: { var tick = buddy.clock; return (Date.now() % 100000000) / 1000 }
  readonly property int grooveBeat: Math.floor(wall * 4)
  readonly property int eyeShift: grooving && grooveBeat % 2 === 1 ? -1 : 0
  readonly property int hop: grooving && grooveBeat % 2 === 0 ? -px : 0

  readonly property string antennaKey: offline ? "droop" : busy && beat % 2 === 1 ? "wiggle" : "up"
  readonly property string eyeKey: offline ? "worried"
    : grooving || busy ? "happy"
    : sleepy ? "sleep"
    : blinking ? "blink" : "open"
  readonly property string mouthKey: offline ? "flat" : grooving || busy ? "open" : sleepy ? "none" : "flat"

  // LEDs: lit = foreground, dark = panel colour. While busy they flicker in
  // turn on the beat; offline both glow urgent.
  readonly property bool rxLit: rxOn && (!busy || beat % 2 === 0)
  readonly property bool txLit: txOn && (!busy || beat % 2 === 1)
  readonly property color rxColor: offline ? Commons.Color.urgent : rxLit ? Commons.Color.foreground : Commons.Color.background
  readonly property color txColor: offline ? Commons.Color.urgent : txLit ? Commons.Color.foreground : Commons.Color.background
  readonly property color tipColor: offline ? Commons.Color.urgent
    : busy && beat % 2 === 0 ? Commons.Color.foreground : Commons.Color.accent

  readonly property var palette: ({
    "o": Commons.Color.foreground,
    "b": Commons.Color.accent,
    "s": Commons.Color.background,
    "f": Commons.Color.foreground,
    "a": buddy.tipColor,
    "r": buddy.rxColor,
    "t": buddy.txColor
  })
  readonly property var fxPalette: ({ "o": offline ? Commons.Color.urgent : Commons.Color.accent })
  readonly property var zedPalette: ({ "o": Commons.Color.foreground })

  width: 16 * px + px * 6
  height: 13 * px + px * 6

  Timer {
    interval: 3200
    running: buddy.active && buddy.mood === "light" && !buddy.grooving
    repeat: true
    onTriggered: { buddy.blinking = true; blinkOff.restart(); interval = 2600 + Math.floor(Math.random() * 3000) }
  }
  Timer { id: blinkOff; interval: 150; onTriggered: buddy.blinking = false }

  PixelSprite {
    id: body
    px: buddy.px
    x: buddy.px * 2
    y: buddy.px * 5 + buddy.hop
    palette: buddy.palette
    rows: Sprites.router(buddy.antennaKey, buddy.eyeKey, buddy.mouthKey, buddy.eyeShift)
  }

  // Rising z's while dozing, notes while grooving (both on the right, like
  // the computer buddy); packets at the antenna tips while busy.
  Repeater {
    model: 2
    PixelSprite {
      required property int index
      readonly property real phase: buddy.sleepy
        ? ((buddy.wall * 0.35 + index * 0.5) % 1 + 1) % 1
        : buddy.grooving ? ((buddy.clock * 0.7 + index * 0.5) % 1 + 1) % 1
        : ((buddy.clock * 0.8 + index * 0.5) % 1 + 1) % 1
      // index 0 = download (left tip), 1 = upload (right tip)
      readonly property bool flowing: index === 0 ? buddy.rxFast : buddy.txFast
      px: 2
      palette: buddy.sleepy ? buddy.zedPalette : buddy.fxPalette
      rows: buddy.sleepy ? Sprites.zed : buddy.grooving ? Sprites.note
        : index === 0 ? Sprites.down : Sprites.up
      x: buddy.sleepy || buddy.grooving
        ? buddy.width - buddy.px * 4 + (index === 0 ? 0 : -buddy.px * 3) + Math.round(Math.sin(phase * 6.28)) * buddy.px
        : index === 0 ? buddy.px * 2 : buddy.px * 17
      // z's and notes rise; packets fall into the left tip, rise from the right.
      y: buddy.sleepy || buddy.grooving
        ? Math.round((buddy.px * 9 - phase * buddy.px * 9) / buddy.px) * buddy.px
        : index === 0 ? Math.round(phase * 3) * buddy.px
        : Math.round(3 - phase * 3) * buddy.px
      opacity: buddy.sleepy || buddy.grooving
        ? (phase < 0.8 ? 1 : 0) * (buddy.sleepy ? 0.6 : 1)
        : buddy.busy && flowing && phase < 0.85 ? 1 : 0
    }
  }

  // Offline: a still "?" between the flopped antennas.
  PixelSprite {
    visible: buddy.offline
    px: 2
    palette: buddy.fxPalette
    rows: Sprites.what
    x: body.x + 8 * buddy.px - 4
    y: buddy.px * 2
  }
}
