import QtQuick
import qs.Commons
import qs.Commons as Commons

// PetColors: the one shading palette every desk pet is drawn with, derived
// from the live Omarchy theme (follows theme switches).
// Canonical copy: shared/PetColors.qml -- copy verbatim. Guide: docs/PETS.md
//
// Sprite keys (one character per cell, "." = empty):
//   o outline   foreground                 b body       accent
//   h highlight accent + fg 45%  (top light) n shade      accent + bg 20% (lower side)
//   d dark      accent + bg 45%  (stripes)   w light fur  accent + fg 70% (belly, socks)
//   l lightest  accent + fg 85%              p blush/pink accent + urgent 55%
//   e ink       background (eyes, mouth)     x glint      foreground (eye sparkle)
//   s screen    background                   g glow       background + accent 18% (lit screen)
//   f face      foreground (face drawn on a screen)
//   r red       urgent                       k soft red   urgent + bg 35%
//   t shadow    foreground @ 8% (floor shadow)
//
// Usage:  PetColors { id: colors }
//         palette: colors.extend({ "l": someLedColor })   // override / add keys
QtObject {
  id: pc

  readonly property color fg: Commons.Color.foreground
  readonly property color bg: Commons.Color.background
  readonly property color accent: Commons.Color.accent
  readonly property color urgent: Commons.Color.urgent

  readonly property var base: ({
    "o": fg,
    "b": accent,
    "h": Qt.tint(accent, Util.alpha(fg, 0.45)),
    "n": Qt.tint(accent, Util.alpha(bg, 0.2)),
    "d": Qt.tint(accent, Util.alpha(bg, 0.45)),
    "w": Qt.tint(accent, Util.alpha(fg, 0.7)),
    "l": Qt.tint(accent, Util.alpha(fg, 0.85)),
    "p": Qt.tint(accent, Util.alpha(urgent, 0.55)),
    "e": bg,
    "x": fg,
    "s": bg,
    "g": Qt.tint(bg, Util.alpha(accent, 0.18)),
    "f": fg,
    "r": urgent,
    "k": Qt.tint(urgent, Util.alpha(bg, 0.35)),
    "t": Util.alpha(fg, 0.08)
  })

  // A copy of the base palette with some keys replaced or added. Bind it to a
  // property so the object is rebuilt only when an input actually changes.
  function extend(extra) {
    var out = {}
    for (var k in base) out[k] = base[k]
    for (var j in extra) out[j] = extra[j]
    return out
  }

  // Single-colour palette for effect sprites (PetFx): "o" = c, "h" = lighter c.
  function fx(c) {
    return { "o": c, "h": Qt.tint(c, Util.alpha(fg, 0.6)), "e": bg }
  }
}
