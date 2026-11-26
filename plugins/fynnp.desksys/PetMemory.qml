import QtQuick
import Quickshell
import Quickshell.Io

// PetMemory: pets remember being petted. Counts every pet (PetTouch reaction
// "pet") per card in ~/.local/state/fynnp-desk/affection.json and turns the
// count into an affection level 1..5. Copy this file verbatim into each plugin.
//
//   PetMemory { id: memory; pluginId: "fynnp.desksys"; touch: buddy.touch }
//   PixelBuddy { ...; affection: memory.level; affectionUp: memory.fresh }
//
// File: { "fynnp.desksys": 42, "fynnp.deskmem": 7, ... }. Every card owns only
// its own key; before writing it merges into the latest file content (kept
// current by an inotify watch), so cards never drop each other's counts.
// Writes are debounced: at most one per minute per card, plus one on shutdown
// if a count is still pending. Nothing runs between pets.
//
// Levels (pets so far): 1 new friend · 2 from 10 · 3 from 30 · 4 from 80 · 5 from 200.
// Settings on the fynnp.desklayout entry of ~/.config/omarchy/shell.json:
//   "affection": true    count pets, show the heart row, perk up / wave on hover
//                        (false: level 0, nothing is read or written)
Item {
  id: memory
  property string pluginId: ""
  property var touch: null               // the pet's PetTouch
  property bool remember: true
  property int count: 0
  readonly property var steps: [0, 10, 30, 80, 200]
  readonly property int level: !remember || !loaded ? 0
    : count >= steps[4] ? 5 : count >= steps[3] ? 4 : count >= steps[2] ? 3 : count >= steps[1] ? 2 : 1
  // true for a few seconds after a pet raised the level (the newest heart sparkles)
  readonly property bool fresh: freshTimer.running

  readonly property string dir: Quickshell.env("HOME") + "/.local/state/fynnp-desk"
  readonly property int writeGapMs: 60000

  visible: false
  width: 0
  height: 0

  // ---------- settings ----------
  function applySettings(raw) {
    var cfg = null
    try { cfg = JSON.parse(raw) } catch (e) { return }
    var list = cfg && Array.isArray(cfg.plugins) ? cfg.plugins : []
    var entry = {}
    for (var i = 0; i < list.length; i++)
      if (list[i] && list[i].id === "fynnp.desklayout") { entry = list[i]; break }
    remember = entry.affection !== false
  }
  FileView {
    path: Quickshell.env("HOME") + "/.config/omarchy/shell.json"
    watchChanges: true
    printErrors: false
    onLoaded: memory.applySettings(text())
    onFileChanged: reload()
  }

  // ---------- the file ----------
  property bool ready: false     // directory exists
  property bool loaded: false    // our count came from the file (or there was none)
  property var disk: ({})        // last parsed content
  property bool dirty: false
  property double lastWrite: 0

  Process {
    running: memory.remember && memory.pluginId !== ""
    command: ["sh", "-c", "mkdir -p \"$1\" && cd \"$1\" && { [ -s affection.json ] || printf '{}\\n' > affection.json; }", "sh", memory.dir]
    onExited: memory.ready = true
  }

  FileView {
    id: file
    path: memory.ready && memory.remember ? memory.dir + "/affection.json" : ""
    watchChanges: true
    atomicWrites: false   // keep the inode so the other cards' watches survive
    printErrors: false
    onLoaded: memory.ingest(text())
    onFileChanged: reload()
  }

  function ingest(t) {
    var d = null
    try { d = JSON.parse(String(t).slice(0, 65536)) } catch (e) { return }   // mid-write: keep the last one
    if (!d || typeof d !== "object" || Array.isArray(d)) return
    disk = d
    var n = parseInt(d[pluginId], 10)
    n = isNaN(n) ? 0 : Math.max(0, Math.min(1e9, n))
    if (!loaded) { count = Math.max(count, n); loaded = true }
    else if (n > count) count = n   // never go backwards
  }

  function save() {
    if (!dirty || !ready || !remember || !pluginId) return
    var d = {}
    for (var k in disk) {
      var v = parseInt(disk[k], 10)
      if (/^[a-z0-9.-]{1,64}$/.test(k) && !isNaN(v)) d[k] = v
    }
    d[pluginId] = count
    dirty = false
    lastWrite = Date.now()
    disk = d
    file.setText(JSON.stringify(d) + "\n")
  }

  Timer {
    id: writeLater
    onTriggered: memory.save()
  }
  function schedule() {
    if (writeLater.running) return
    writeLater.interval = Math.max(1000, writeGapMs - (Date.now() - lastWrite))
    writeLater.restart()
  }
  Component.onDestruction: save()

  // ---------- counting ----------
  Timer { id: freshTimer; interval: 4000 }
  Connections {
    target: memory.touch
    function onSerialChanged() {
      if (!memory.remember || !memory.loaded || memory.touch.reaction !== "pet") return
      var before = memory.level
      memory.count++
      memory.dirty = true
      memory.schedule()
      if (memory.level > before) freshTimer.restart()
    }
  }
}
