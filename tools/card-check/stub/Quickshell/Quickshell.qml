pragma Singleton
import QtQuick
// card-check stub: env values are filled in by run.sh (@HOME@ ...).
QtObject {
  readonly property var envs: ({ HOME: "@HOME@", XDG_RUNTIME_DIR: "@RUN@", XDG_CACHE_HOME: "@CACHE@" })
  function env(k) { return envs[k] !== undefined ? envs[k] : "" }
  readonly property var screens: [{ name: "DP-1", x: 0, y: 0, width: 2560, height: 1440 }]
  function execDetached(cmd) { console.log("STUB execDetached", JSON.stringify(cmd)) }
}
