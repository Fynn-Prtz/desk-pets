pragma Singleton
import QtQuick
QtObject {
  signal rawEvent(var event)
  function monitorFor(s) { return { scale: 1, activeWorkspace: { hasFullscreen: false, toplevels: { values: [] } } } }
  function refreshMonitors() {}
  function refreshWorkspaces() {}
  function refreshToplevels() {}
}
