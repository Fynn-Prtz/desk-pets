import QtQuick
import Quickshell
import Quickshell.Io
import "PetSeason.js" as PetSeason

// PetCalendar: the date-driven part of a desk pet (season-hats). One per
// card Service; hand `season` to the pet (`season: seasonCal.season`).
// Canonical copy: shared/PetCalendar.qml -- copy verbatim (with PetSeason.js).
//
//   season   "" | "xmas" | "party" | "spooky"  (PetSeason.accessory())
//   night    23:00-06:00: nightcap when asleep, more yawns (day-night)
//   morning  06:00-10:00: the first wake is a stretch + a tiny coffee (day-night)
//
// Settings on the fynnp.desklayout entry in ~/.config/omarchy/shell.json
// (one switch for every card):
//   "seasons": true      false = no seasonal outfits at all
//   "birthday": "MM-DD"  party hats on that day
//   "dayNight": true     false = no nightcap / morning coffee
//
// Cost: one inotify watch on shell.json and one Date every 15 minutes while
// the card is visible (re-checked whenever it becomes visible again; the
// season part changes at most at midnight). Nothing ticks while covered.
Item {
  id: cal

  property bool active: false
  property bool enabled: true
  property bool dayNight: true
  property string birthday: ""
  property string season: ""
  property bool night: false
  property bool morning: false

  readonly property string home: Quickshell.env("HOME")

  function refresh() {
    var now = new Date()
    season = enabled ? PetSeason.accessory(now, birthday) : ""
    var d = PetSeason.dayPart(now)
    night = dayNight && d.night
    morning = dayNight && d.morning
  }
  onEnabledChanged: refresh()
  onBirthdayChanged: refresh()
  onDayNightChanged: refresh()

  FileView {
    path: cal.home + "/.config/omarchy/shell.json"
    watchChanges: true
    printErrors: false
    onLoaded: {
      var c = PetSeason.config(text())
      if (!c) return
      cal.enabled = c.on
      cal.birthday = c.birthday
      cal.dayNight = c.dayNight
    }
    onFileChanged: reload()
  }

  Timer {
    interval: 900000
    repeat: true
    triggeredOnStart: true
    running: cal.active
    onTriggered: cal.refresh()
  }
}
