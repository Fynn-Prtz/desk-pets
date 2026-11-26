pragma Singleton
import QtQml
// in-memory files; writes notify every watching FileView on that path (like inotify)
QtObject {
  property var files: ({})
  property var watchers: []
  property var log: []
  function read(p) { return files[p] === undefined ? "" : files[p] }
  function write(p, t) {
    files[p] = t
    var w = watchers.slice()
    for (var i = 0; i < w.length; i++) if (w[i] && w[i].path === p && w[i].watchChanges) w[i].fileChanged()
  }
  function watch(v) { if (watchers.indexOf(v) < 0) watchers.push(v) }
  function unwatch(v) { var i = watchers.indexOf(v); if (i >= 0) watchers.splice(i, 1) }
}
