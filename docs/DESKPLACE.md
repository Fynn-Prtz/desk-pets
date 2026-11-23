# DeskPlace — integrating a desk card with the layout editor

`DeskPlace.qml` (canonical copy in this folder) gives a desk card a user-chosen position and lets
it take part in edit mode (`omarchy-shell desklayout toggle`, SUPER+ALT+E). Copy it **verbatim**
into the plugin folder (like `DeskLink.qml`). Don't edit the copy; change the canonical file
and recopy it to every card.

What it does for you:
- Reads `~/.config/omarchy/desk-layout/<pluginId>.json` with an inotify FileView:
  `{ "monitor": "DP-1", "x": 3048, "y": 58, "w": 360, "h": 344 }`. x/y are the monitor-local
  logical px of the card's top-left at scale 1. w/h are the card's size when it was dropped. A
  card keeps its distance to its *nearest* edges, so a card near the bottom grows upward.
  With no file, it uses the card's shell.json `corner` / `marginX` / `marginY`
  (`top|bottom|center` + `left|right`).
- Edit mode (flag `$XDG_RUNTIME_DIR/fynnp-desk/edit`): the window covers its monitor on the
  Overlay layer, with an accent outline and a name chip with a "→ DP-2" button. Drag snaps to the
  grid, the screen margins and other cards' edges. Arrows nudge by one cell, right-click resets
  (deletes the file), Esc leaves edit mode. A capture MouseArea stops the card's own controls
  from reacting.
- Gives you anchors, margins, layer, keyboard focus, the input masks and the global `rect` for
  occlusion. It scales the edge distances by `uiScale` and clamps them on-screen, so the card
  lands in the same relative spot on an away (fallback) monitor.
- Outside edit mode it costs two inotify watches and nothing else.

## Diff shape (what desksys / deskaudio got — apply the same to deskgames)

1. **Home screen from DeskPlace** (the monitor the layout file names, else your setting):
   ```diff
   -      if (screens[i].name === root.monitorName) return screens[i]
   +      if (screens[i].name === place.monitor) return screens[i]
   ```
2. **No fullscreen escape while editing** (cards with an away screen only):
   ```diff
   -  readonly property var targetScreen: homeFullscreen && awayScreen && awayEmpty ? awayScreen : homeScreen
   +  readonly property var targetScreen: !place.editing && homeFullscreen && awayScreen && awayEmpty ? awayScreen : homeScreen
   ```
3. **Occlusion uses the real position** — replace the whole `cardRect: { … }` block:
   ```qml
   readonly property var cardRect: place.rect
   ```
4. **Stay live while editing**:
   ```diff
   -  readonly property bool active: win.visible && !covered
   +  readonly property bool active: win.visible && (place.editing || !covered)
   ```
5. **PanelWindow** — replace `anchors { … }` / `margins { … }` and the layer/focus lines:
   ```qml
   anchors {
     top: place.anchorTop
     bottom: place.anchorBottom
     left: place.anchorLeft
     right: place.anchorRight
   }
   margins {
     top: place.marginTop
     bottom: place.marginBottom
     left: place.marginLeft
     right: place.marginRight
   }
   WlrLayershell.layer: place.wlrLayer
   WlrLayershell.keyboardFocus: place.keyboardFocus
   ```
   Input mask:
   - click-through card (had `mask: Region {}`): `mask: place.editing ? place.editMask : place.noInput`
   - interactive card (had no mask): `mask: place.editing ? place.editMask : null`
6. **Add DeskPlace inside the PanelWindow** (anywhere; it sets `z: 100` itself) and offset the card:
   ```qml
   // Placement + edit mode; see docs/DESKPLACE.md in the desk-pets repo.
   DeskPlace {
     id: place
     pluginId: "fynnp.deskgames"
     label: root.manifest && root.manifest.name ? String(root.manifest.name) : "Desk Games"
     defaultMonitor: root.monitorName
     corner: root.corner
     marginX: root.marginX
     marginY: root.marginY
     homeScreen: root.homeScreen
     targetScreen: root.targetScreen
     uiScale: root.uiScale
     cardWidth: root.cardWidth
     cardHeight: card.height
   }

   BorderSurface {
     id: card
     x: place.cardX
     y: place.cardY
     ...
   ```
   Keep `implicitWidth/implicitHeight` as they are (scaled card size). In edit mode the
   window is stretched by its four anchors.

### deskgames specifics
deskgames has no fullscreen escape: its `targetScreen` *is* its home screen. Do this:
- Rename its screen lookup to `homeScreen` (step 1 with `place.monitor`) and add
  `readonly property var targetScreen: homeScreen` and `readonly property real uiScale: 1`.
  Or pass `homeScreen: root.targetScreen; targetScreen: root.targetScreen; uiScale: 1`
  directly, after step 1 is applied to its `targetScreen` lookup. Skip step 2.
- `center-right` / `center-left` corners are supported (`spec.v === "center"`, margins 0).
  `onTop/onBottom/onLeft/centered` and the old `cardRect` can go.
- It is interactive, so use `mask: place.editing ? place.editMask : null`.
- `pluginId` must be exactly `"fynnp.deskgames"`. It is already in DeskPlace's `peerIds`, so
  the other cards snap to it.

## Contracts
- Edit flag: `$XDG_RUNTIME_DIR/fynnp-desk/edit` = `"1\n<grid>\n"` or `"0\n"`. It is owned by
  `fynnp.desklayout` (IPC `toggle|enter|leave|status`, 2-min idle auto-leave). Cards write
  `"1\n<grid>\n"` on every drop/nudge ("still busy", which restarts the idle timer) and `"0\n"` on Esc.
- Peer rects for magnetic snapping: `$XDG_RUNTIME_DIR/fynnp-desk/rect-<pluginId>` =
  `{"monitor","x","y","w","h"}`. Written on entering edit mode and on every move, and blanked on
  destruction. Watched only while editing.
- Layout files are written atomically on drop. FileView's watch survives the rename.
