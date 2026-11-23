import QtQuick
import Quickshell
import Quickshell.Io
import Quickshell.Wayland
import qs.Commons
import qs.Commons as Commons
import "Sprites.js" as Sprites

// Cat Saver: a full-screen pixel-art screensaver. A cat sleeps curled up in the
// middle of every monitor, breathing, swishing its tail, z's drifting up under
// a crescent moon and a few rarely twinkling stars.
//
// Nothing exists while it is hidden: the windows are created by a Variants
// whose model is empty until the saver shows, and the only clock runs while
// shown. Idle detection is the compositor's ext-idle-notify (IdleMonitor),
// which costs nothing until the timeout fires; inhibitors (video players,
// games) are respected.
//
// Gates checked once when idle fires (one tiny `sh` per idle event, no polling):
//   ~/.local/state/omarchy/indicators/stay-awake   (Omarchy's stay-awake)
//   ~/.local/state/omarchy/toggles/screensaver-off (omarchy-toggle-enabled)
// The lock state comes from the lock service's in-process IPC handler; it is
// re-checked once a second while shown, so the saver gets out of the lock's way.
//
// Settings on this plugin's entry in ~/.config/omarchy/shell.json:
//   { "id": "fynnp.catsaver", "timeout": 150, "fps": 8, "pixel": 11 }
//   timeout: idle seconds before showing (0 = never by itself; IPC still works)
//   fps:     animation clock while shown (1–15)
//   pixel:   sprite pixel size on a 1440-px-tall screen; scaled per screen
//
// IPC (testing): omarchy-shell catsaver show | hide | status
Item {
  id: root

  property var shell: null
  property var manifest: null
  readonly property string home: Quickshell.env("HOME")
  readonly property string stayAwakePath: home + "/.local/state/omarchy/indicators/stay-awake"
  readonly property string offTogglePath: home + "/.local/state/omarchy/toggles/screensaver-off"

  // ---------- settings ----------
  property int timeout: 150
  property int fps: 8
  property int pixel: 11

  function clampInt(v, lo, hi, dflt) {
    var n = parseInt(v, 10)
    if (isNaN(n)) return dflt
    return Math.max(lo, Math.min(hi, n))
  }

  function applySettings(raw) {
    var cfg = null
    try { cfg = JSON.parse(raw) } catch (e) { return }
    var list = cfg && Array.isArray(cfg.plugins) ? cfg.plugins : []
    var entry = {}
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].id === "fynnp.catsaver") { entry = list[i]; break }
    }
    timeout = clampInt(entry.timeout, 0, 86400, 150)
    if (timeout > 0 && timeout < 10) timeout = 10
    fps = clampInt(entry.fps, 1, 15, 8)
    pixel = clampInt(entry.pixel, 4, 24, 11)
  }

  FileView {
    path: root.home + "/.config/omarchy/shell.json"
    watchChanges: true
    printErrors: false
    onLoaded: root.applySettings(text())
    onFileChanged: reload()
  }

  // ---------- state ----------
  property bool shown: false
  property double shownAt: 0
  property string lastReason: ""
  readonly property int idleGraceMs: 1500   // mapping the overlay may count as activity
  readonly property int pointerGraceMs: 400 // the surface appearing under the cursor

  function locked() {
    var r = IpcRegistry.call("lock", "isLocked", [])
    return !!r && r.ran === true && r.output === "true"
  }

  function show(reason) {
    if (shown) return
    if (locked()) { lastReason = "skipped: locked"; return }
    tick = 0
    shownAt = Date.now()
    lastReason = reason || "show"
    shown = true
  }

  function hide(reason) {
    if (!shown) return
    lastReason = reason || "hide"
    shown = false
  }

  // ---------- cursor (same mechanism as omarchy-screensaver) ----------
  // BlankCursor only applies once the pointer moves over the surface, so the
  // compositor cursor is hidden for as long as the saver is up. Every hide path
  // goes through `shown`; destruction (shell restart) restores too, and a
  // runtime marker lets the next start restore after a crash.
  readonly property string cursorMarker: Quickshell.env("XDG_RUNTIME_DIR") + "/fynnp-catsaver.cursor-hidden"
  property bool cursorHidden: false

  function setCursorHidden(hide) {
    if (hide === cursorHidden) return
    cursorHidden = hide
    var v = hide ? "true" : "false"
    var marker = hide ? "touch \"$1\"" : "rm -f \"$1\""
    Quickshell.execDetached(["sh", "-c",
      marker + "; hyprctl eval 'hl.config({ cursor = { invisible = " + v + " } })' >/dev/null 2>&1"
      + " || hyprctl keyword cursor:invisible " + v + " >/dev/null 2>&1 || true",
      "sh", cursorMarker])
  }

  onShownChanged: setCursorHidden(shown)
  Component.onDestruction: if (cursorHidden) setCursorHidden(false)
  Component.onCompleted: Quickshell.execDetached(["sh", "-c",
    "[ -e \"$1\" ] || exit 0; rm -f \"$1\"; hyprctl eval 'hl.config({ cursor = { invisible = false } })' >/dev/null 2>&1"
    + " || hyprctl keyword cursor:invisible false >/dev/null 2>&1 || true",
    "sh", cursorMarker])

  function tryShow() {
    if (shown || gate.running) return
    if (locked()) { lastReason = "skipped: locked"; return }
    gate.running = true
  }

  IdleMonitor {
    id: idle
    enabled: root.timeout > 0
    timeout: Math.max(1, root.timeout)
    respectInhibitors: true
    onIsIdleChanged: {
      if (isIdle) root.tryShow()
      else if (root.shown && Date.now() - root.shownAt > root.idleGraceMs) root.hide("activity")
    }
  }

  // Exit 0 = a gate file exists = stay hidden.
  Process {
    id: gate
    command: ["sh", "-c", "[ -e \"$1\" ] || [ -e \"$2\" ]", "sh", root.stayAwakePath, root.offTogglePath]
    onExited: function(code) {
      if (code === 0) { root.lastReason = "skipped: stay-awake or screensaver-off"; return }
      if (idle.isIdle) root.show("idle")
    }
  }

  // ---------- animation clock (only while shown) ----------
  property int tick: 0
  Timer {
    interval: Math.round(1000 / root.fps)
    repeat: true
    running: root.shown
    onTriggered: {
      root.tick++
      if (root.tick % root.fps === 0 && root.locked()) root.hide("locked")
    }
  }

  // Integer state: these only notify when they actually change, so the cat's
  // canvas repaints on a new frame, not on every tick.
  readonly property int tailStep: Math.max(1, Math.round(fps * 0.35))
  readonly property int tailFrame: Sprites.tailSequence[Math.floor(tick / tailStep) % Sprites.tailSequence.length]
  readonly property int breathStep: Math.max(1, Math.round(fps * 1.4))
  readonly property int breath: Math.floor(tick / breathStep) % 2

  readonly property var catPalette: ({
    "o": Commons.Color.foreground,
    "b": Commons.Color.accent,
    "d": Qt.tint(Commons.Color.accent, Util.alpha(Commons.Color.background, 0.35)),
    "p": Qt.tint(Commons.Color.accent, Util.alpha(Commons.Color.urgent, 0.55)),
    "e": Commons.Color.background,
    "s": Util.alpha(Commons.Color.foreground, 0.08)
  })
  readonly property var skyPalette: ({ "o": Util.alpha(Commons.Color.foreground, 0.55) })
  readonly property var moonPalette: ({ "o": Qt.tint(Commons.Color.foreground, Util.alpha(Commons.Color.accent, 0.25)) })
  readonly property var zedPalette: ({ "o": Commons.Color.foreground })

  // Stars around the cat, in cat-pixel units from the cat's top-left corner.
  // period/offset in seconds: each sparkles for half a second, rarely.
  readonly property var stars: [
    { x: -14, y: -16, period: 11, offset: 2 },
    { x: -4, y: -27, period: 17, offset: 9 },
    { x: 9, y: -12, period: 13, offset: 5 },
    { x: 22, y: -22, period: 19, offset: 14 },
    { x: 33, y: -11, period: 15, offset: 1 },
    { x: 58, y: -6, period: 12, offset: 7 },
    { x: 63, y: 8, period: 21, offset: 16 },
    { x: -19, y: 3, period: 16, offset: 11 }
  ]

  // ---------- windows (exist only while shown) ----------
  Variants {
    model: root.shown ? Quickshell.screens : []

    PanelWindow {
      id: win
      required property var modelData
      screen: modelData
      color: Commons.Color.background

      anchors { top: true; bottom: true; left: true; right: true }
      exclusionMode: ExclusionMode.Ignore
      WlrLayershell.namespace: "fynnp-catsaver"
      WlrLayershell.layer: WlrLayer.Overlay
      WlrLayershell.keyboardFocus: WlrKeyboardFocus.Exclusive

      // Same share of the screen on every monitor (logical pixels, so the
      // 1.25-scaled 1080p screen gets a proportionally sized cat).
      readonly property int px: Math.max(4, Math.round(root.pixel * modelData.height / 1440))
      readonly property int zpx: Math.max(2, Math.round(px / 2))

      // Swallow every key: the first press only dismisses.
      Item {
        anchors.fill: parent
        focus: true
        Keys.onPressed: function(event) { event.accepted = true; root.hide("key") }
        Keys.onReleased: function(event) { event.accepted = true }
      }

      MouseArea {
        id: pointer
        anchors.fill: parent
        hoverEnabled: true
        acceptedButtons: Qt.AllButtons
        cursorShape: Qt.BlankCursor
        property bool hasOrigin: false
        property real ox: 0
        property real oy: 0
        onPressed: function(mouse) { mouse.accepted = true; root.hide("click") }
        onWheel: function(wheel) { wheel.accepted = true; root.hide("wheel") }
        onPositionChanged: function(mouse) {
          if (!hasOrigin || Date.now() - root.shownAt < root.pointerGraceMs) {
            ox = mouse.x; oy = mouse.y; hasOrigin = true
            return
          }
          if (Math.abs(mouse.x - ox) + Math.abs(mouse.y - oy) > 3) root.hide("pointer")
        }
      }

      Item {
        id: scene
        width: Sprites.cols * win.px
        height: Sprites.rowsCount * win.px
        x: Math.round((win.width - width) / 2 / win.px) * win.px
        y: Math.round((win.height - height) / 2 / win.px) * win.px + win.px * 4

        Repeater {
          model: root.stars
          PixelSprite {
            required property var modelData
            readonly property bool sparkle: {
              var p = modelData.period * root.fps
              return (root.tick + modelData.offset * root.fps) % p < Math.max(1, Math.round(root.fps / 2))
            }
            px: win.zpx
            x: modelData.x * win.px - win.zpx
            y: modelData.y * win.px - win.zpx
            palette: root.skyPalette
            rows: sparkle ? Sprites.starSparkle : Sprites.starDot
          }
        }

        PixelSprite {
          px: win.px
          x: 46 * win.px
          y: -24 * win.px
          palette: root.moonPalette
          rows: Sprites.moon
        }

        PixelSprite {
          px: win.px
          palette: root.catPalette
          rows: Sprites.frames[root.breath][root.tailFrame]
        }

        // Three z's rising from the head, staggered, in whole z-pixel steps.
        Repeater {
          model: 3
          PixelSprite {
            required property int index
            readonly property int span: root.fps * 4
            readonly property real phase: ((root.tick + index * span / 3) % span) / span
            readonly property int rise: Math.floor(phase * 14)
            px: win.zpx
            palette: root.zedPalette
            rows: Sprites.zed
            x: 19 * win.px + Math.floor(rise / 3) * win.zpx + ((rise + index) % 4 < 2 ? 0 : win.zpx)
            y: 3 * win.px - rise * win.zpx * 2
            opacity: rise < 2 ? 0.35 : rise < 10 ? 0.7 : rise < 13 ? 0.35 : 0
          }
        }
      }
    }
  }

  // ---------- IPC (testing) ----------
  ShellIpc {
    target: "catsaver"

    function show(): string {
      if (root.locked()) return "locked"
      root.show("ipc")
      return root.shown ? "shown" : "hidden"
    }

    function hide(): string {
      root.hide("ipc")
      return "hidden"
    }

    function status(): string {
      return JSON.stringify({
        shown: root.shown,
        idle: idle.isIdle,
        timeout: root.timeout,
        fps: root.fps,
        pixel: root.pixel,
        locked: root.locked(),
        last: root.lastReason
      })
    }
  }
}
