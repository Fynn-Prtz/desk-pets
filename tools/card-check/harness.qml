import QtQuick
import QtQuick.Window
// card-check harness: instantiates a card's real Service.qml, waits, prints
// the properties named in PROPS and grabs the card window to OUT.
Item {
  id: h
  Loader { id: ld; source: "file://PLUGDIR/Service.qml" }
  Timer {
    interval: WAITMS; running: true
    onTriggered: {
      var s = ld.item
      if (!s) { console.log("CHECK no service (load error above)"); Qt.quit(); return }
      var names = "PROPS".split(",")
      for (var i = 0; i < names.length; i++) {
        var v = s[names[i]]
        console.log("CHECK " + names[i] + " = " + (typeof v === "object" ? JSON.stringify(v) : v))
      }
      var win = null
      for (var j = 0; j < s.children.length; j++) if (s.children[j] && s.children[j].contentItem) win = s.children[j]
      if (!win) { for (var k in s.data) if (s.data[k] && s.data[k].contentItem) win = s.data[k] }
      if (!win) { console.log("CHECK no window"); Qt.quit(); return }
      win.contentItem.grabToImage(function(r) { r.saveToFile("OUTPNG"); console.log("CHECK grabbed OUTPNG"); Qt.quit() })
    }
  }
}
