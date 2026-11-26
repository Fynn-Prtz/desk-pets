import QtQml
import Quickshell.Io
QtObject {
  id: fv
  property string path: ""
  property bool watchChanges: false
  property bool printErrors: true
  property bool atomicWrites: true
  property string _text: ""
  signal loaded()
  signal fileChanged()
  function text() { return _text }
  function reload() { _text = StubFs.read(path); loaded() }
  function setText(t) { StubFs.write(path, t) }
  onPathChanged: if (path) { StubFs.watch(fv); reload() }
  Component.onDestruction: StubFs.unwatch(fv)
}
