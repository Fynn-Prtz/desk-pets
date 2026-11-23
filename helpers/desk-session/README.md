# desk-session

Turns finished MangoHud CSV logs into fynnp-desk game session reports
(`~/.local/state/fynnp-desk/sessions/<end>-<appid>.json` + `latest.json`) and sends a notification.
Schema: see below; example: `sample-session.json`.

    cargo build --release && install -m755 target/release/desk-session bin/desk-session
    cp systemd/desk-session.{path,service} ~/.config/systemd/user/ && systemctl --user daemon-reload

Env for testing: `DESK_SESSION_BASE=<dir>` (instead of ~/.local/state/fynnp-desk),
`DESK_SESSION_NO_NOTIFY=1`, `DESK_SESSION_MIN_S=<seconds>` (default 60; shorter logs give no report).

## Session report schema (desk-session writes, fynnp.deskgames reads)

One JSON file per finished game session in `~/.local/state/fynnp-desk/sessions/`,
named `<unix-end-ts>-<appid-or-0>.json`, plus a symlink/copy `latest.json` in the same dir,
written atomically (write tmp + rename). Schema (all numbers may be `null` if unknown):

```json
{
  "version": 1,
  "appid": 244210, "game": "Assetto Corsa Competizione",
  "start": 1795400000, "end": 1795404321, "duration_s": 4321,
  "fps_avg": 142.3, "fps_1pct_low": 98.1, "fps_0_1pct_low": 71.0,
  "frametime_avg_ms": 7.0,
  "cpu_temp_max": 78, "gpu_temp_max": 71,
  "cpu_load_avg": 34.0, "gpu_load_avg": 88.0,
  "cpu_power_avg_w": 65.2, "gpu_power_avg_w": 290.4,
  "energy_kwh": 0.43,
  "source": "mangohud", "log": "/path/to/original.csv"
}
```

