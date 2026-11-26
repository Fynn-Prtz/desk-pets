import QtQuick
// Loads <directory>/@LANG@.json like the real Translations (run.sh sets LANG).
QtObject {
  property url directory
  property var table: ({})
  onDirectoryChanged: {
    var x = new XMLHttpRequest()
    x.open("GET", directory + "/@LANG@.json", false)
    try { x.send(); table = JSON.parse(x.responseText) } catch (e) { console.log("STUB Translations failed", e) }
  }
  function t(k, d) { return table[k] !== undefined ? table[k] : d }
}
