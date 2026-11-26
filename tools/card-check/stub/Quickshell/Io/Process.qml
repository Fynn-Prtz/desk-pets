import QtQuick
// Never runs anything: logs the command and "exits" with STUB_EXIT (run.sh).
Item {
  id: p
  property var command: []
  property bool running: false
  property bool stdinEnabled: false
  property var stdout
  property var stderr
  signal exited(int code, int status)
  function write(s) {}
  property int runs: 0
  onRunningChanged: if (running) { runs++; console.log("STUB Process run", JSON.stringify(command).slice(0, 400)); done.restart() }
  Timer { id: done; interval: 50; onTriggered: { p.running = false; var c = p.command.join(" ").indexOf("curl") >= 0 ? @EXIT@ : 0; p.exited(c, 0) } }
}
