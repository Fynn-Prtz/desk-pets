import QtQuick
import Quickshell.Io
// Scripted check of shared/PetMemory.qml against the stubs (tools/memory-test.sh).
Item {
  id: t
  property int fails: 0
  function expect(ok, what) { if (!ok) fails++; console.log((ok ? "PASS " : "FAIL ") + what) }
  readonly property string f: "/stub/HOME/.local/state/fynnp-desk/affection.json"
  QtObject { id: ta; property string reaction: ""; property int serial: 0 }
  QtObject { id: tb; property string reaction: ""; property int serial: 0 }
  function pet(tt, kind) { tt.reaction = kind; tt.serial++ }
  PetMemory { id: a; pluginId: "fynnp.desksys"; touch: ta; writeGapMs: 1500 }
  PetMemory { id: b; pluginId: "fynnp.deskmem"; touch: tb; writeGapMs: 1500 }
  property var steps: [
    function() { StubFs.write(f, '{"fynnp.desksys": 8, "fynnp.deskmem": 29, "fynnp.other": 3}\n') },
    function() { expect(a.count === 8 && a.level === 1 && b.level === 2, "loaded: a=" + a.count + "/L" + a.level + " b=" + b.count + "/L" + b.level)
                 pet(ta, "pet"); pet(ta, "annoyed"); pet(ta, "squish"); pet(ta, "pet")
                 pet(tb, "pet") },
    function() { expect(a.count === 10 && a.level === 2 && a.fresh, "only pets count, level-up is fresh: " + a.count)
                 expect(b.count === 30 && b.level === 3, "b level 3 at 30")
                 expect(JSON.parse(StubFs.read(f))["fynnp.desksys"] === 8, "debounced: not written yet") },
    function() { var d = JSON.parse(StubFs.read(f))
                 expect(d["fynnp.desksys"] === 10 && d["fynnp.deskmem"] === 30 && d["fynnp.other"] === 3, "both merged, foreign key kept: " + StubFs.read(f).trim())
                 pet(ta, "pet"); pet(ta, "pet") },
    function() { expect(JSON.parse(StubFs.read(f))["fynnp.desksys"] === 10, "second write waits for the gap") },
    function() { expect(JSON.parse(StubFs.read(f))["fynnp.desksys"] === 12, "then written: " + StubFs.read(f).trim())
                 StubFs.write(f, ""); StubFs.write(f, "{\"fynnp.desksys\": 3}") },
    function() { expect(a.count === 12, "never goes backwards: " + a.count)
                 a.count = 199; pet(ta, "pet") },
    function() { expect(a.level === 5, "level 5 at 200")
                 a.remember = false },
    function() { expect(a.level === 0, "affection:false -> level 0"); pet(ta, "pet") },
    function() { expect(a.count === 200, "no counting while off")
                 console.log(t.fails === 0 ? "ALL PASS" : t.fails + " FAILED"); Qt.exit(t.fails ? 1 : 0) }
  ]
  property int step: 0
  Timer { interval: 900; running: true; repeat: true; onTriggered: { t.steps[t.step](); t.step++ } }
}
