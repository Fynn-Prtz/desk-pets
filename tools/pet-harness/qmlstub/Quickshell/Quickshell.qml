pragma Singleton
import QtQuick
// Test stub of the Quickshell singleton: env() and execDetached() only.
// execDetached understands the pet-chat write: ["sh","-c","printf … > \"$1\"","sh",path,payload].
QtObject {
  function env(name) { return name === "XDG_RUNTIME_DIR" ? "/run/stub" : name === "HOME" ? "/home/stub" : "" }
  function execDetached(cmd) { if (cmd.length >= 6 && String(cmd[2]).indexOf("printf") >= 0) StubBus.write(cmd[4], cmd[5] + "\n") }
}
