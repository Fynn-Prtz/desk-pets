pragma Singleton
import QtQml
QtObject {
  function env(n) { return "/stub/" + n }
  function execDetached(cmd) {}
}
