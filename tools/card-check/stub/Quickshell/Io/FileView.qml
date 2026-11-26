import QtQuick
// Reads / writes real files through XMLHttpRequest (run.sh enables file XHR).
Item {
  id: fv
  property string path: ""
  property bool watchChanges: false
  property bool printErrors: true
  property bool atomicWrites: true
  property string _text: ""
  signal loaded()
  signal loadFailed(var error)
  signal fileChanged()
  function text() { return _text }
  function reload() {
    if (!path) return
    var x = new XMLHttpRequest()
    x.open("GET", "file://" + path, false)
    try { x.send() } catch (e) { loadFailed(e); return }
    if (x.status !== 0 && x.status !== 200 || !x.responseText) { console.log("STUB FileView missing", path); loadFailed("missing"); return }
    _text = x.responseText
    console.log("STUB FileView loaded", path, _text.length)
    loaded()
  }
  function setText(t) {
    var x = new XMLHttpRequest()
    x.open("PUT", "file://" + path, false)
    try { x.send(t) } catch (e) {}
    _text = t
  }
  onPathChanged: Qt.callLater(reload)
}
