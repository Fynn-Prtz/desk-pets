import QtQuick
import Quickshell.Io
import qs.Commons
// Scripted check of shared/PetGreet.qml against the stubs in this folder
// (run by tools/greet-test.sh). Three cards: B left, A right-top, C right-bottom.
Item {
  id: t
  property var events: []
  property double t0: Date.now()
  property int fails: 0
  function log(s) { console.log(((Date.now() - t0) / 1000).toFixed(2) + "s " + s) }
  function expect(ok, what) { if (!ok) fails++; log((ok ? "PASS " : "FAIL ") + what) }
  readonly property string dir: "/stub/XDG_RUNTIME_DIR/fynnp-desk"

  PetGreet { id: a; pluginId: "fynnp.desksys"; rect: ({ x: 2000, y: 50, w: 360, h: 300 }); active: true
    onSerialChanged: t.events.push("A") }
  PetGreet { id: b; pluginId: "fynnp.deskmem"; rect: ({ x: 100, y: 400, w: 360, h: 300 }); active: true
    onSerialChanged: t.events.push("B") }
  PetGreet { id: c; pluginId: "fynnp.deskaudio"; rect: ({ x: 2010, y: 500, w: 360, h: 300 }); active: true
    onSerialChanged: t.events.push("C") }
  function idleOf(g) { for (var i = 0; i < g.resources.length; i++) if (g.resources[i].respectInhibitors !== undefined) return g.resources[i]; return null }
  function reset() { a.lastReturn = 0; b.lastReturn = 0; c.lastReturn = 0; events = [] }

  property var steps: [
    function() { expect(a.rank() === 1 && b.rank() === 0 && c.rank() === 2, "rank by position: B=" + b.rank() + " A=" + a.rank() + " C=" + c.rank())
                 StubFs.write(dir + "/saver", "1\n"); StubFs.write(dir + "/saver", ""); StubFs.write(dir + "/saver", "0\n") },
    function() { expect(events.join("") === "BAC", "catsaver hide -> staggered B,A,C: " + events.join(""))
                 events = []; StubFs.write(dir + "/saver", "1\n"); StubFs.write(dir + "/saver", "0\n") },
    function() { expect(events.length === 0, "second hide within 10 s counts once: " + events.join(""))
                 reset(); c.active = false
                 var ia = idleOf(a), ib = idleOf(b), ic = idleOf(c)
                 ia.isIdle = true; ib.isIdle = true; ic.isIdle = true
                 ia.isIdle = false; ib.isIdle = false; ic.isIdle = false },
    function() { expect(events.join("") === "BA", "idle end -> A,B greet, covered C waits: " + events.join(""))
                 events = []; c.active = true },
    function() { expect(events.join("") === "C", "C greets once uncovered: " + events.join(""))
                 reset(); IpcRegistry.locked = true; idleOf(b).isIdle = true; idleOf(b).isIdle = false },
    function() { expect(events.length === 0, "locked: waits"); IpcRegistry.locked = false },
    function() { expect(events.join("") === "B", "after unlock (2 s re-check) greets: " + events.join(""))
                 reset(); idleOf(b).isIdle = false; StubFs.write(dir + "/saver", "0\n") },
    function() { expect(events.length === 0, "no idle / no saver show before -> nothing: " + events.join(""))
                 b.welcome = false; idleOf(b).isIdle = true; idleOf(b).isIdle = false },
    function() { expect(events.length === 0, "welcome:false -> nothing")
                 console.log(t.fails === 0 ? "ALL PASS" : t.fails + " FAILED"); Qt.exit(t.fails ? 1 : 0) }
  ]
  property int step: 0
  Timer { interval: 1600; running: true; repeat: true; triggeredOnStart: false
    onTriggered: { t.steps[t.step](); t.step++ } }
}
