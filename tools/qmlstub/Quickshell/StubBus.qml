pragma Singleton
import QtQuick
// Test stub: an in-memory "filesystem" shared by every stub FileView, so
// cards in one engine see each other's writes (inotify stand-in).
QtObject {
  property var files: ({})
  signal changed(string path)
  property var log: []
  function write(path, text) { files[path] = text; log.push(path + " <- " + String(text).trim()); changed(path) }
  function read(path) { return files[path] === undefined ? "" : files[path] }
}
