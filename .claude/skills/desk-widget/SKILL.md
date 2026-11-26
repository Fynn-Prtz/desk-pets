---
name: desk-widget
description: >
  Use when the user wants a new desktop widget/card, screensaver, or pixel-art buddy for their Omarchy
  desktop, or wants to change the existing desk cards (fynnp.desksys, fynnp.deskmem, fynnp.deskdisk, fynnp.desknet, fynnp.deskclock, fynnp.deskweather, fynnp.deskaudio, fynnp.deskgames,
  fynnp.catsaver, fynnp.desklayout). Triggers: "widget", "desk card", "desktop card", "pixel buddy",
  "screensaver", "another card like the audio one", "on my desktop", "move/place widgets".
  Holds the architecture, reusable components, style rules, performance rules, gotchas and the QA
  workflow so a new card takes minutes, not an hour of rediscovery. Load the `omarchy` skill too.
---

# Desk widgets (desk-pets: pixel-art Omarchy desk cards)

A family of always-on pixel-art cards on the desktop layer (under windows, above the wallpaper),
built as **Omarchy shell (Quickshell) service plugins**. Source of truth: the `desk-pets` repo
(`~/src/desk-pets`, github.com/Fynn-Prtz/desk-pets); `~/.config/omarchy/plugins/fynnp.*` are symlinks
into `plugins/`, and `./install.sh` builds the Rust helpers and wires everything up (idempotent). They all look identical in style; a new card
must be indistinguishable from the others. The user's priorities: **looks matching exactly** and
**zero cost while not visible** (gaming PC, RTX 3080 Ti + 9800X3D).

## What exists (copy from these, don't start from scratch)

| plugin (`~/.config/omarchy/plugins/…`) | what | buddy | notes |
|---|---|---|---|
| `fynnp.deskmem` | per-app RAM pie (CellGrid cells), legend | — (pie in the buddy slot) | Rust feed `deskmem-feed`, interval 3000 |
| `fynnp.deskdisk` | filesystems, usage meters, mirrored I/O history | PixelDisk (floppy) | Rust feed `deskdisk-feed`; CellGrid has `down` for mirrored graphs |
| `fynnp.desknet` | default iface + IPv4, ↓/↑ rates, history, totals | PixelRouter | Rust feed `desknet-feed` |
| `fynnp.deskclock` | time, date, day/week/year progress, uptime | PixelOwl (owl + pocket watch) | no helper: minute-boundary Timer gated on `active`, `/proc/uptime` read once/hourly |
| `fynnp.deskaudio` | now playing, visualizer, in/out devices, app mixer | PixelCat (dances) | interactive; the original style reference |
| `fynnp.desksys` | CPU/GPU/RAM/VRAM load, temps, watts, history | PixelBuddy (computer) | **best template** for a read-only card; Rust feed `~/.local/bin/desksys-feed` (src `helpers/desksys-feed`) |
| `fynnp.deskgames` | Steam recently played, launch, last session report | PixelGamer (gamepad) | Rust inotify feed in `helper/`, `bin/deskgames-feed` |
| `fynnp.deskweather` | Open-Meteo now / 40 h lattice / 3 days, opt-in location | PixelFrog (umbrella, shades, scarf) | one-shot `curl` Process ≤ every 30 min while visible, cache in `~/.cache/fynnp-desk`; `Weather.js` pure + node-testable |
| `fynnp.catsaver` | sleeping pixel-cat screensaver, IdleMonitor, all monitors | big cat | replaces Omarchy's TTE saver (`idle.screensaver: 0`); IPC `omarchy-shell catsaver show/hide/status` |
| `fynnp.desklayout` | edit mode backdrop + IPC, SUPER+ALT+E | — | IPC `omarchy-shell desklayout toggle`; positions in `~/.config/omarchy/desk-layout/<id>.json` |

Support pieces (repo paths): `helpers/desk-session` (MangoHud CSV → session JSON + notification, systemd
path unit, installed to `~/.local/bin`), `shared/` (canonical `DeskLink.qml`, `DeskPlace.qml`),
`docs/DESKPLACE.md`, `extras/` (udev, MangoHud, Hyprland snippets). The original multi-agent brief and
agent reports (design decisions) live outside the repo in `~/src/desk-widgets/` on the author's machine.

## Recipe for a new card (~15 min)

1. `cp -r plugins/fynnp.desksys plugins/fynnp.<name>` in the repo (add it to `PLUGINS` and the defaults in
   `install.sh`, then `./install.sh` links it); strip the content Column, keep: settings/FileView of shell.json,
   `homeScreen/awayScreen/targetScreen` (fullscreen escape), `uiScale` (away-screen scaling), occlusion
   (`cardRect`, `covered`, `active`, Hyprland rawEvent refresh), `PanelWindow` + `BorderSurface` card.
   Change the plugin id string in **every** place (`applySettings` looks it up by id), layer namespace
   `fynnp-<name>`, manifest, i18n.
2. Add the card's entry to `~/.config/omarchy/shell.json` `plugins[]` (back it up first). Add a blur
   rule in `~/.config/hypr/looknfeel.lua`:
   `hl.layer_rule({ match = { namespace = "^fynnp-<name>$" }, blur = true, ignore_alpha = 0.1 })`.
3. Wire `DeskPlace.qml` (placement/edit mode, see `docs/DESKPLACE.md`) and, if the card
   has a mood, `DeskLink.qml` (copy both verbatim from the repo's `shared/`). Register the mood name in
   DeskLink's `names` list in **all** copies if you add a new peer.
4. Data: event-driven only. Small text files → `FileView { watchChanges: true }`. Anything needing
   native APIs, parsing big files, or polling hardware → a tiny Rust helper started as a `Process`
   with `stdinEnabled`, which **blocks on stdin** and answers one JSON line per request (see
   `desksys-feed`) or blocks in inotify/poll and prints only on change (see `deskgames-feed`).
   The card's poll Timer must have `running: root.active && …`.
5. `omarchy restart shell`, check the log, then visual QA (below).

## Style contract (match exactly)

- Card: `BorderSurface`, width **360**, `color: Qt.rgba(Color.popups.background…, cardOpacity 0.5)`,
  `borderSpec: Border.flat(Util.alpha(Color.foreground, 0.08), 1)`, `radius: Style.cornerRadius`,
  padding `Style.space(14)`, Column spacing `Style.space(10)`.
- Text: `DaText` (PlainText, `Style.fontFamily`) with `Style.font.{subtitle,title,body,bodySmall,caption}`.
  Hero title `subtitle` bold; secondary lines `caption` opacity 0.6; percentages `bodySmall` opacity 0.75,
  width 38, right-aligned. Glyphs: Nerd Font MD icons in `Color.accent`, `Style.font.title`, width 18.
- Hero row: pixel buddy (`PixelSprite`, 16×13 grid, **px 4**, item `16*px+6*px` × `13*px+6*px`, sprite at
  x `2*px`, y `5*px`) + 3 text lines anchored to its right with `Style.space(10)` margin.
- Meters/graphs: `CellGrid.qml` (40-column lattice, gap 2, off = `fg@0.07`, on = accent, head/top cell =
  foreground). Rows like `StatRow.qml` / AppRow (22 px row + meter). `PanelSeparator` between sections,
  `PanelSectionHeader` for section titles. Warnings use `Color.urgent`.
- Sprites: string rows + palette (`o` outline = foreground, `b` body = accent, `e`/`s` = background,
  pink = `Qt.tint(accent, alpha(urgent,.55))`). Move only in whole `px` steps; side effects (z's, notes,
  sweat, sparkles) are `px: 2` sprites. Moods are string keys so a sprite repaints only when they change.
- Layer `WlrLayer.Bottom`, `ExclusionMode.Ignore`, `WlrKeyboardFocus.None`; read-only cards set
  `mask: Region {}` (click-through). Strings in `i18n/en.json` + `de.json` via `Commons.Translations`.

## Performance rules

- Nothing ticks while the card is covered/hidden (`root.active`). Idle motion ≤ 4 fps (250 ms clock),
  0 fps when nothing moves; blink timers gated too.
- No `Process` per tick, no polling where inotify/Hyprland events/systemd path units exist.
- Helpers in Rust (user preference when it matters), std-only where possible; measure RSS/CPU after.
- Untrusted text (Steam names, files, MPRIS) → PlainText sinks, bounded `.slice()`, control chars stripped.

Offscreen check of a whole card (Service.qml + window) on a box without Quickshell:
`tools/card-check/run.sh plugins/<card> out.png '<shell.json>' prop1,prop2` (stubs in `tools/card-check/stub`).

## Gotchas (each cost real time once)

- **Hot reload lies**: saving plugin QML logs "Local plugin changed, reloading" but the shell keeps a
  cached component. Always `omarchy restart shell` (blinks the bar) to test QML changes.
- **Logs**: plugin `console.warn` and QML errors are NOT in journalctl; read the newest
  `/run/user/1000/quickshell/by-id/*/log.log` (`ls -td … | head -1`).
- **Hyprland 0.56 is Lua**: `hyprctl dispatch 'hl.dsp.focus({ workspace = "9" })'`,
  `hl.dsp.focus({ monitor = "DP-2" })`, `hl.dsp.window.fullscreen({ mode = "fullscreen" })`,
  `hl.dsp.focus({ window = "address:0x…" })`. Config edits: validate with `hyprctl configerrors`.
- **Quickshell Hyprland state goes stale**: call `Hyprland.refreshMonitors(); refreshWorkspaces();
  refreshToplevels()` (debounced) on raw events; `workspace.hasFullscreen` exists.
- **Input masks**: `Region { item: x }` does not reliably follow an item that moves. Bind `x/y/width/height`
  explicitly, and widen the mask to the whole window while a drag is in progress (fixed in DeskPlace).
- **Qt 6 value-type references**: `var s = obj.somePoint` is a live reference that re-reads the property.
  Copy the numbers (`var x = obj.p.x`) before changing anything the binding depends on.
- **Fractional scaling**: Qt reports DP-2's 1.25 as dpr 2 — use `Hyprland.monitorFor(screen).scale`.
- Monitors: DP-1 3440×1440 @1 (home), DP-2 1920×1080 @1.25 (1536×864 logical). Bar ≈ 26 px → top
  cards use marginY ≥ 58. Optional sim-rig monitor "AOC CU34G4" (see `~/.config/hypr/simrig.lua`).
- `omarchy-shell <target> <fn>` calls plugin IPC handlers. Quickshell FileView watches survive tmp+rename
  (tested), so atomic writes are fine; the tiny shared runtime files (moods, edit flag, rects) still use
  `atomicWrites: false` by convention.
- CPU watts come from RAPL `energy_uj`, readable via udev rule `/etc/udev/rules.d/99-desksys-rapl.rules`.
  GPU via NVML (dlopen `libnvidia-ml.so.1`). MangoHud logs to `~/.local/state/fynnp-desk/mangohud-logs`.
- Never edit `/usr/share/omarchy/**`; read it for APIs (`shell/Ui`, `shell/Commons`, `shell/plugins`).
  Quickshell types: `/usr/lib/qt6/qml/Quickshell/**/*.qmltypes`.

## Placement / edit mode (DeskPlace)

Every movable card embeds `DeskPlace.qml` (canonical copy in `shared/`, integration diff in
`docs/DESKPLACE.md`). SUPER+ALT+E (`omarchy-shell desklayout toggle|enter|leave|status`)
flips `$XDG_RUNTIME_DIR/fynnp-desk/edit`; cards then stretch their window over the monitor on the Overlay
layer and the card is dragged inside it (no per-move compositor round trips), snapping to the grid
(shell.json `fynnp.desklayout.grid`, 24), screen edges and peers' `rect-<id>` files. Drop writes
`~/.config/omarchy/desk-layout/<plugin-id>.json` (`monitor,x,y,w,h`; nearest-edge anchoring so cards
grow the right way); right-click resets (deletes it). Without a file, shell.json corner/margins apply.
A new card needs: homeScreen from `place.monitor`, `cardRect: place.rect`, `active` true while editing,
window anchors/margins/layer/focus/mask from `place`, and card `x/y: place.cardX/Y`.

## Visual QA without annoying the user

Cards sit under windows. To screenshot: remember the current workspaces, flip DP-1 to an empty one,
`grim -g "x,y wxh"` (get geometry from `hyprctl layers -j`, namespace `fynnp-*`), flip back **in the same
command**, verify with `hyprctl monitors -j`. Fake states instead of waiting for them: write moods to
`$XDG_RUNTIME_DIR/fynnp-desk/<name>.mood`, drop a sample `~/.local/state/fynnp-desk/sessions/latest.json`
(`helpers/desk-session/sample-session.json`), then clean up. Overlays: schedule the hide
(`(sleep 4; omarchy-shell catsaver hide) &`) before `show`. Read sprites by cropping + `magick -scale 300%`.

## Bigger jobs: parallel agents with herdr

The user likes multi-agent builds in herdr (`HERDR_ENV=1`). Pattern that worked: write a shared
`BRIEF.md` (style, perf, ownership, contracts) + one `tasks/<name>.md` per agent, create a tab with a 2×2
pane grid (`herdr tab create`, `herdr pane split … --no-focus`), `herdr agent start <name> --kind claude
--pane <id> -- --permission-mode auto`, `herdr agent prompt <name> "Read BRIEF + task …"`. Agents never
take screenshots or switch workspaces; the orchestrator does all visual QA and owns `shell.json`.
`Bash(herdr agent *)` is allowed in settings. New-folder trust prompts and "teach auto mode" dialogs
are the user's call — ask, don't click through.
