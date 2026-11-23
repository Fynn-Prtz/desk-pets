import QtQuick
import qs.Commons
import qs.Commons as Commons
import "Sprites.js" as Sprites

// Pixel cat. Idle: blinks. Music: ^ ^ eyes, hops on the beat in whole pixels,
// mouth opens on loud parts, pixel notes rise. Silence: sleeps, z's drift up.
//
// Reacts to its desk neighbours (DeskLink moods, "" = card absent):
//   buddy load|maxed|hot -> wakes, looks up at the buddy, ears fold flat
//   gamer launching      -> wakes, ears perk up
// Reactions only swap string keys, so the sprite repaints on a mood change
// and never per tick.
Item {
  id: cat
  property real level: 0
  property bool playing: false
  property real clock: 0
  property int px: 4
  property bool active: true
  property string buddyMood: ""
  property string gamerMood: ""

  readonly property bool happy: playing && level > 0.02
  readonly property bool alert: !happy && gamerMood === "launching"
  readonly property bool worried: !happy && !alert
    && (buddyMood === "load" || buddyMood === "maxed" || buddyMood === "hot")
  readonly property bool sleepy: !playing && level <= 0.02 && !alert && !worried
  property bool blinking: false
  // Strings only signal when they change, so the sprite repaints on a new
  // expression rather than on every level tick.
  readonly property string eyeKey: happy ? "happy" : alert ? "open" : worried ? "up"
    : sleepy ? "sleep" : blinking ? "blink" : "open"
  readonly property string mouthKey: happy && level > 0.55 ? "open" : "closed"
  readonly property string earKey: alert ? "perk" : worried ? "flat" : "normal"

  readonly property int beat: Math.floor(clock * 4.2)
  readonly property int hop: happy && (beat % 2 === 0) ? -px * (level > 0.5 ? 2 : 1) : 0
  readonly property int sway: happy ? ((Math.floor(beat / 2) % 2 === 0) ? -px : px) : 0
  // Wall-clock seconds, re-read whenever the card's clock ticks: the z's of
  // the cat and the buddy share one phase, so they float up in sync.
  readonly property real wall: { var tick = cat.clock; return (Date.now() % 100000000) / 1000 }

  readonly property var palette: ({
    "o": Commons.Color.foreground,
    "b": Commons.Color.accent,
    "p": Qt.tint(Commons.Color.accent, Util.alpha(Commons.Color.urgent, 0.55)),
    "e": Commons.Color.background,
    "w": Commons.Color.foreground,
    "m": Commons.Color.background
  })

  readonly property var notePalette: ({ "o": Commons.Color.accent })
  readonly property var zedPalette: ({ "o": Commons.Color.foreground })

  width: 16 * px + px * 6
  height: 13 * px + px * 6

  Timer {
    interval: 3200
    running: cat.active && !cat.sleepy && !cat.happy && !cat.worried && !cat.alert
    repeat: true
    onTriggered: { cat.blinking = true; blinkOff.restart(); interval = 2600 + Math.floor(Math.random() * 3000) }
  }
  Timer { id: blinkOff; interval: 150; onTriggered: cat.blinking = false }

  PixelSprite {
    id: body
    px: cat.px
    // 14 rows (one spare row on top for perked ears); bottom stays put.
    x: cat.px * 2 + cat.sway
    y: cat.px * 4 + cat.hop
    palette: cat.palette
    rows: Sprites.cat(cat.eyeKey, cat.mouthKey, cat.earKey)
  }

  // Rising notes / z's, moving in whole-pixel steps.
  Repeater {
    model: 2
    PixelSprite {
      required property int index
      readonly property real phase: cat.sleepy
        ? ((cat.wall * 0.35 + index * 0.5) % 1 + 1) % 1
        : ((cat.clock * 0.7 + index * 0.5) % 1 + 1) % 1
      px: 2
      palette: cat.sleepy ? cat.zedPalette : cat.notePalette
      rows: cat.sleepy ? Sprites.zed : Sprites.note
      x: cat.width - cat.px * 4 + (index === 0 ? 0 : -cat.px * 3) + Math.round(Math.sin(phase * 6.28) * 1) * cat.px
      y: Math.round((cat.px * 9 - phase * cat.px * 9) / cat.px) * cat.px
      opacity: (cat.happy || cat.sleepy) ? (phase < 0.8 ? 1 : 0) * (cat.sleepy ? 0.6 : 1) : 0
    }
  }
}
