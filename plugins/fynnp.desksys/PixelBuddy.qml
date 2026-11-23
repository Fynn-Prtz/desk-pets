import QtQuick
import qs.Commons
import qs.Commons as Commons
import "Sprites.js" as Sprites

// Pixel computer buddy. Idle: dozes, z's drift up. Light work: blinks.
// Working: ^ ^ and bobs. Under load: strains and sweats. Maxed/hot: shakes,
// LED turns urgent, a flame flickers. Moves only in whole pixels.
//
// Reacts to its desk neighbours (DeskLink moods, "" = card absent):
//   cat dance        -> (unless stressed) wakes, bobs to the beat, eyes
//                       bounce on the screen, notes rise
//   gamer launching  -> "!" on the screen
//   gamer playing    -> game pad on the screen while under load
Item {
  id: buddy
  property string mood: "idle"   // idle | chill | work | load | maxed | hot
  property real clock: 0
  property int px: 4
  property bool active: true
  property string catMood: ""
  property string gamerMood: ""

  property bool blinking: false
  readonly property bool stressed: mood === "load" || mood === "maxed" || mood === "hot"
  readonly property bool grooving: !stressed && catMood === "dance"
  readonly property string screenKey: gamerMood === "launching" ? "bang"
    : (gamerMood === "playing" && stressed) ? "pad" : ""
  readonly property bool sleepy: mood === "idle" && !grooving && screenKey === ""
  // True while a neighbour needs the clock even though the buddy's own mood
  // would let it rest (the service keeps its tick running for this).
  readonly property bool moving: grooving

  readonly property string eyeKey: grooving ? "happy"
    : sleepy ? "sleep"
    : mood === "work" ? "happy"
    : mood === "load" ? "strain"
    : (mood === "maxed" || mood === "hot") ? "dizzy"
    : blinking ? "blink" : "open"
  readonly property string mouthKey: grooving ? "open"
    : sleepy ? "none" : (mood === "maxed" || mood === "hot") ? "open" : "flat"

  readonly property int beat: Math.floor(clock * 2)
  // Wall-clock seconds, re-read whenever the clock ticks: shared with the cat
  // so both cards' z's float in sync, and the groove lands on a steady beat.
  readonly property real wall: { var tick = buddy.clock; return (Date.now() % 100000000) / 1000 }
  readonly property int grooveBeat: Math.floor(wall * 4)
  readonly property int eyeShift: grooving && grooveBeat % 2 === 1 ? -1 : 0
  readonly property int hop: grooving ? (grooveBeat % 2 === 0 ? -px : 0)
    : mood === "work" && beat % 2 === 0 ? -px : 0
  readonly property int shake: (mood === "maxed" || mood === "hot") ? (beat % 2 === 0 ? -px : px) : 0

  readonly property color ledColor: stressed ? Commons.Color.urgent : Commons.Color.accent
  readonly property var palette: ({
    "o": Commons.Color.foreground,
    "b": Commons.Color.accent,
    "s": Commons.Color.background,
    "f": Commons.Color.foreground,
    "l": buddy.ledColor
  })
  readonly property var fxPalette: ({ "o": mood === "hot" ? Commons.Color.urgent : Commons.Color.accent })
  readonly property var zedPalette: ({ "o": Commons.Color.foreground })

  width: 16 * px + px * 6
  height: 13 * px + px * 6

  Timer {
    interval: 3200
    running: buddy.active && buddy.mood === "chill" && !buddy.grooving && buddy.screenKey === ""
    repeat: true
    onTriggered: { buddy.blinking = true; blinkOff.restart(); interval = 2600 + Math.floor(Math.random() * 3000) }
  }
  Timer { id: blinkOff; interval: 150; onTriggered: buddy.blinking = false }

  PixelSprite {
    px: buddy.px
    x: buddy.px * 2 + buddy.shake
    y: buddy.px * 5 + buddy.hop
    palette: buddy.palette
    rows: Sprites.buddy(buddy.eyeKey, buddy.mouthKey, buddy.screenKey, buddy.eyeShift)
  }

  // Rising z's while dozing, notes while grooving, sweat / flame while
  // stressed; whole-pixel steps.
  Repeater {
    model: 2
    PixelSprite {
      required property int index
      readonly property real phase: buddy.sleepy
        ? ((buddy.wall * 0.35 + index * 0.5) % 1 + 1) % 1
        : ((buddy.clock * (buddy.grooving ? 0.7 : 0.8) + index * 0.5) % 1 + 1) % 1
      px: 2
      palette: buddy.sleepy ? buddy.zedPalette : buddy.fxPalette
      rows: buddy.sleepy ? Sprites.zed : buddy.grooving ? Sprites.note
        : buddy.mood === "hot" ? Sprites.flame : Sprites.drop
      x: buddy.width - buddy.px * 4 + (index === 0 ? 0 : -buddy.px * 3) + Math.round(Math.sin(phase * 6.28)) * buddy.px
      // z's, notes and flames rise, sweat falls.
      y: buddy.sleepy || buddy.grooving || buddy.mood === "hot"
        ? Math.round((buddy.px * 9 - phase * buddy.px * 9) / buddy.px) * buddy.px
        : Math.round((buddy.px * 2 + phase * buddy.px * 7) / buddy.px) * buddy.px
      opacity: (buddy.sleepy || buddy.stressed || buddy.grooving)
        ? (phase < 0.8 ? 1 : 0) * (buddy.sleepy ? 0.6 : 1) : 0
    }
  }
}
