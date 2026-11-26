import QtQml
// stub: "runs" instantly and exits 0
QtObject {
  id: pr
  property bool running: false
  property var command: []
  property bool stdinEnabled: false
  signal exited(int code)
  onRunningChanged: if (running) Qt.callLater(function() { pr.running = false; pr.exited(0) })
}
