pragma Singleton
import QtQml
// stub: lock.isLocked answers from `locked`
QtObject {
  property bool locked: false
  function call(target, fn, args) { return target === "lock" ? { ran: true, output: locked ? "true" : "false" } : { ran: false } }
}
