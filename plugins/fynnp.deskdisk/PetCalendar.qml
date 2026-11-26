import QtQuick
import Quickshell
import Quickshell.Io
import "PetSeason.js" as PetSeason

// PetCalendar: the date-driven part of a desk pet (season-hats). One per
// card Service; hand `season` to the pet (`season: seasonCal.season`).
// Canonical copy: shared/PetCalendar.qml -- copy verbatim (with PetSeason.js).
//
//   season   "" | "xmas" | "party" | "spooky"  (PetSeason.accessory())
//
// Settings on the fynnp.desklayout entry in ~/.config/omarchy/shell.json
// (one switch for every card):
//   "seasons": true      false = no seasonal outfits at all
//   "birthday": "MM-DD"  party hats on that day
//
// Cost: one inotify watch on shell.json and one Date per hour while the card
// is visible (re-checked whenever it becomes visible again). Nothing ticks
// while covered or with seasons off.
Item {
  id: cal

  property bool active: false
  property bool enabled: true
  property string birthday: ""
  property string season: ""

  readonly property string home: Quickshell.env("HOME")

  function refresh() { season = enabled ? PetSeason.accessory(new Date(), birthday) : "" }
  onEnabledChanged: refresh()
  onBirthdayChanged: refresh()

  FileView {
    path: cal.home + "/.config/omarchy/shell.json"
    watchChanges: true
    printErrors: false
    onLoaded: {
      var c = PetSeason.config(text())
      if (!c) return
      cal.enabled = c.on
      cal.birthday = c.birthday
    }
    onFileChanged: reload()
  }

  Timer {
    interval: 3600000
    repeat: true
    triggeredOnStart: true
    running: cal.active && cal.enabled
    onTriggered: cal.refresh()
  }
}
