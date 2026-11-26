import QtQuick
import Quickshell
import Quickshell.Io
import Quickshell.Wayland
import qs.Commons

// PetGreet: "welcome back". Notices the user coming back to the desk and bumps
// `serial` once per return, so the card's pet greets (each pet in its own way).
// The cards greet one after another, left to right (top to bottom within a
// column), card by card. Copy this file verbatim into each plugin.
//
//   PetGreet { id: greet; pluginId: "fynnp.desksys"; rect: place.rect; active: root.active }
//   PixelBuddy { ...; greetSerial: greet.serial }
//
// Event sources (no polling, nothing runs between events):
//   - IdleMonitor (ext-idle-notify): no input for `welcomeAfter` seconds = away;
//     the first input after that = back. Inhibitors (video, games) are respected.
//   - $XDG_RUNTIME_DIR/fynnp-desk/saver, written by fynnp.catsaver ("1" shown,
//     "0" hidden), watched with inotify: the catsaver going away = back.
//     Handy for testing:  echo 1 > $XDG_RUNTIME_DIR/fynnp-desk/saver; echo 0 > ...
// Both arriving together count once. While the screen is locked the greeting
// waits (re-checked every 2 s for at most a minute, only after a return); a card
// that is covered at that moment greets when it is uncovered within a minute.
//
// Order: every card publishes its global rect to fynnp-desk/greet-<id> (when it
// changes, on tmpfs) and watches its peers' files; on a return it greets after
// 400 ms per card ranked before it.
//
// Settings on the fynnp.desklayout entry of ~/.config/omarchy/shell.json:
//   "welcome": true        greet on return (false = off, nothing is watched)
//   "welcomeAfter": 120    seconds without input that count as "away" (30..3600)
Item {
  id: greet
  property string pluginId: ""
  property var rect: null          // place.rect (global, logical px)
  property bool active: false      // the card is visible and not covered
  property int serial: 0           // bumped once per greeting (read-only for the card)

  property bool welcome: true
  property int welcomeAfter: 120

  readonly property string dir: Quickshell.env("XDG_RUNTIME_DIR") + "/fynnp-desk"
  readonly property var ids: ["fynnp.desksys", "fynnp.deskmem", "fynnp.deskaudio", "fynnp.deskdisk",
    "fynnp.desknet", "fynnp.deskgames", "fynnp.deskclock", "fynnp.deskweather"]
  readonly property int stepMs: 400
  readonly property int windowMs: 60000   // a pending greeting expires after this

  visible: false
  width: 0
  height: 0

  // ---------- settings (global, on the desklayout entry) ----------
  function applySettings(raw) {
    var cfg = null
    try { cfg = JSON.parse(raw) } catch (e) { return }
    var list = cfg && Array.isArray(cfg.plugins) ? cfg.plugins : []
    var entry = {}
    for (var i = 0; i < list.length; i++)
      if (list[i] && list[i].id === "fynnp.desklayout") { entry = list[i]; break }
    welcome = entry.welcome !== false
    var n = parseInt(entry.welcomeAfter, 10)
    welcomeAfter = isNaN(n) ? 120 : Math.max(30, Math.min(3600, n))
  }
  FileView {
    path: Quickshell.env("HOME") + "/.config/omarchy/shell.json"
    watchChanges: true
    printErrors: false
    onLoaded: greet.applySettings(text())
    onFileChanged: reload()
  }

  // ---------- return detection ----------
  property double lastReturn: 0
  property double pendingSince: 0   // 0 = nothing pending

  function back(reason) {
    if (!welcome) return
    var now = Date.now()
    if (now - lastReturn < 10000) return   // idle end + catsaver hide = one return
    lastReturn = now
    pendingSince = now
    tryGreet()
  }

  function locked() {
    var r = IpcRegistry.call("lock", "isLocked", [])
    return !!r && r.ran === true && r.output === "true"
  }

  function tryGreet() {
    if (pendingSince === 0) return
    if (Date.now() - pendingSince > windowMs) { pendingSince = 0; return }
    if (locked()) { lockWait.restart(); return }
    if (!active) return   // onActiveChanged picks it up
    pendingSince = 0
    stagger.interval = 120 + rank() * stepMs
    stagger.restart()
  }
  onActiveChanged: if (active) tryGreet(); else stagger.stop()

  Timer { id: lockWait; interval: 2000; onTriggered: greet.tryGreet() }
  Timer { id: stagger; onTriggered: if (greet.active) greet.serial++ }

  IdleMonitor {
    enabled: greet.welcome
    timeout: greet.welcomeAfter
    respectInhibitors: true
    property bool wasIdle: false
    onIsIdleChanged: {
      if (isIdle) { wasIdle = true; return }
      if (wasIdle) { wasIdle = false; greet.back("input") }
    }
  }

  // ---------- catsaver flag + peer rects ----------
  property bool ready: false
  property var peers: ({})
  property string saverState: ""

  Process {
    running: greet.welcome && greet.pluginId !== ""
    command: ["sh", "-c", "mkdir -p \"$1\" && cd \"$1\" && touch saver \"greet-$2\"", "sh", greet.dir, greet.pluginId]
    onExited: { greet.ready = true; greet.publish() }
  }

  FileView {
    path: greet.ready ? greet.dir + "/saver" : ""
    watchChanges: true
    printErrors: false
    onLoaded: {
      var s = String(text()).trim()
      if (s === "") return   // mid-write (truncate, then write)
      if (s === "0" && greet.saverState === "1") greet.back("catsaver")
      greet.saverState = s
    }
    onFileChanged: reload()
  }

  readonly property string rectText: rect ? Math.round(rect.x + rect.w / 2) + " " + Math.round(rect.y + rect.h / 2) : ""
  onRectTextChanged: publish()
  function publish() {
    if (!ready || !pluginId) return
    writer.setText(rectText + "\n")
  }
  FileView {
    id: writer
    path: greet.ready && greet.pluginId ? greet.dir + "/greet-" + greet.pluginId : ""
    atomicWrites: false   // keep the inode so the peers' watches survive
    printErrors: false
  }
  Component.onDestruction: if (ready && pluginId) writer.setText("\n")

  Instantiator {
    model: greet.ready ? greet.ids.filter(function(i) { return i !== greet.pluginId }) : []
    delegate: FileView {
      required property string modelData
      path: greet.dir + "/greet-" + modelData
      watchChanges: true
      printErrors: false
      onLoaded: greet.setPeer(modelData, text())
      onFileChanged: reload()
      Component.onDestruction: greet.setPeer(modelData, "")
    }
  }

  function setPeer(id, t) {
    var m = /^(-?\d+) (-?\d+)/.exec(String(t || "").slice(0, 64))
    var next = ({})
    for (var k in peers) if (k !== id) next[k] = peers[k]
    if (m) next[id] = { x: parseInt(m[1], 10), y: parseInt(m[2], 10) }
    peers = next
  }

  // Cards before this one: left to right; within a column (centres closer
  // than 200 px) top to bottom.
  function before(a, b) {
    if (Math.abs(a.x - b.x) > 200) return a.x < b.x
    return a.y < b.y
  }
  function rank() {
    if (!rect) return 0
    var me = { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 }
    var n = 0
    for (var k in peers) if (before(peers[k], me)) n++
    return Math.min(n, 7)
  }
}
