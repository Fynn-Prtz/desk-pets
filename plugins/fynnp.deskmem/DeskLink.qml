import QtQuick
import Quickshell
import Quickshell.Io

// DeskLink: a tiny mood bus between the desk cards (fynnp.deskaudio,
// fynnp.desksys, fynnp.deskgames). Every card publishes its own mood to
// $XDG_RUNTIME_DIR/fynnp-desk/<name>.mood (tmpfs, written only when the mood
// actually changes) and watches the other cards' files with inotify. No
// polling, no timers. Copy this file verbatim into each plugin.
//
//   DeskLink { id: link; name: "cat"; mood: root.catMood }
//   ... link.peers.buddy  -> "idle" | "chill" | "work" | "load" | "maxed" | "hot" | ""
//
// Names: "cat" (audio card), "buddy" (system card), "gamer" (games card).
// Moods are short lowercase words; "" means unknown / card not running.
Item {
  id: link
  property string name: ""
  property string mood: ""
  readonly property string dir: Quickshell.env("XDG_RUNTIME_DIR") + "/fynnp-desk"
  readonly property var names: ["cat", "buddy", "gamer"]
  property var peers: ({ cat: "", buddy: "", gamer: "" })
  property bool ready: false

  visible: false
  width: 0
  height: 0

  function clean(t) {
    var s = String(t || "").trim().toLowerCase()
    return /^[a-z][a-z0-9-]{0,23}$/.test(s) ? s : ""
  }
  function setPeer(n, t) {
    var v = clean(t)
    if (peers[n] === v) return
    var next = ({})
    for (var k in peers) next[k] = peers[k]
    next[n] = v
    peers = next
  }

  // Create the directory and empty files once, so every watcher has an inode.
  Process {
    running: true
    command: ["sh", "-c", "mkdir -p \"$1\" && cd \"$1\" && touch cat.mood buddy.mood gamer.mood", "sh", link.dir]
    onExited: { link.ready = true; link.publish() }
  }

  function publish() {
    if (!ready || name === "") return
    writer.setText(mood + "\n")
  }
  onMoodChanged: publish()

  FileView {
    id: writer
    path: link.ready && link.name ? link.dir + "/" + link.name + ".mood" : ""
    atomicWrites: false   // keep the inode so the other cards' watches survive
    printErrors: false
  }

  Instantiator {
    model: link.ready ? link.names : []
    delegate: FileView {
      required property string modelData
      path: link.dir + "/" + modelData + ".mood"
      watchChanges: true
      printErrors: false
      onLoaded: link.setPeer(modelData, text())
      onFileChanged: reload()
    }
  }

  // Clear our mood when the card goes away, so peers do not react to a ghost.
  Component.onDestruction: if (ready && name) writer.setText("\n")
}
