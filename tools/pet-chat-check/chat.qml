import QtQuick
import QtQuick.Window
import "file://PLUGA" as A
import "file://PLUGB" as B

// Filled in by tools/pet-chat-check/run.sh. Two real pets on stub cards
// (sender left at x 0, receiver right at x 400 or below at y 400), stub
// Quickshell bus; the sender's chat is triggered at once, then both clocks
// advance 1/8 s per real 125 ms and both pets are grabbed side by side.
Window {
  id: win
  width: 240; height: 100; visible: true
  QtObject { id: scr; property string name: "DP-1" }
  QtObject { id: placeA; property bool dragging: false; property bool editing: false; property real dragX: 0
    property var targetScreen: scr; property var rect: ({ x: 0, y: 0, w: 360, h: 300 }) }
  QtObject { id: placeB; property bool dragging: false; property bool editing: false; property real dragX: 0
    property var targetScreen: scr; property var rect: VERTICAL ? ({ x: 0, y: 400, w: 360, h: 300 }) : ({ x: 400, y: 0, w: 360, h: 300 }) }
  Rectangle {
    id: stage
    width: 240; height: 100; color: "#211d30"
    A.TYPEA { id: a; x: 16; y: 18; px: 2; place: placeA }
    B.TYPEB { id: b; x: 136; y: 18; px: 2; place: placeB }
    Rectangle { x: 119; width: 2; height: 100; color: "#111" }
  }
  property int f: 0
  property var log: []
  function note(s) { log.push(s); console.log(s) }
  Component.onCompleted: {
    var pa = PROPSA, pb = PROPSB
    for (var k in pa) a[k] = pa[k]
    for (k in pb) b[k] = pb[k]
    a.clock = 100; b.clock = 100
    boot.start()
  }
  Timer {   // let the stub Processes "exit" and the files get published
    id: boot; interval: 300
    onTriggered: {
      win.note("status A=" + a.chatStatus + " B=" + b.chatStatus + " partnersA=" + JSON.stringify(a.children.length >= 0 ? aChat().partners : []))
      aChat().send()
      step.start()
    }
  }
  function aChat() { for (var i = a.children.length - 1; i >= 0; i--) if (a.children[i].hasOwnProperty("partners")) return a.children[i]; return null }
  function bChat() { for (var i = b.children.length - 1; i >= 0; i--) if (b.children[i].hasOwnProperty("partners")) return b.children[i]; return null }
  Timer {
    id: step; interval: 125; repeat: true
    onTriggered: {
      a.clock += 0.125; b.clock += 0.125
      var ca = aChat(), cb = bChat()
      if (win.f % 4 === 0) win.note("t=" + (win.f / 8) + " A " + ca.phase + " look " + a.touch.lookX + "," + a.touch.lookY + "  B " + cb.phase + " look " + b.touch.lookX + "," + b.touch.lookY)
      var n = win.f
      stage.grabToImage(function(r) { r.saveToFile("OUT/f-" + String(n).padStart(3, "0") + ".png") })
      win.f++
      if (win.f > 40) { step.stop(); Qt.callLater(Qt.quit) }
    }
  }
}
