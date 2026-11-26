import QtQuick
import Quickshell
// Test stub of Quickshell.Io.FileView backed by StubBus (in memory).
QtObject {
  id: fv
  property string path: ""
  property bool watchChanges: false
  property bool atomicWrites: false
  property bool printErrors: true
  signal loaded()
  signal loadFailed()
  signal fileChanged()
  function text() { return StubBus.read(path) }
  function setText(t) { if (path) StubBus.write(path, t) }
  function reload() { if (path) Qt.callLater(function() { fv.loaded() }) }
  onPathChanged: reload()
  property Connections _c: Connections {
    target: StubBus
    function onChanged(p) { if (fv.watchChanges && p === fv.path) fv.fileChanged() }
  }
}
