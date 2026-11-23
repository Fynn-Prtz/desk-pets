//! desk-session — one-shot parser: finished MangoHud CSV logs -> session report JSON.
//!
//! Run by `desk-session.service`, which `desk-session.path` starts on inotify events
//! (IN_CREATE / IN_CLOSE_WRITE / ...) in the log dir. Nothing runs while a game plays:
//! MangoHud keeps its CSV open and only appends (IN_MODIFY, not watched).
//!
//! Per run:
//!  * a CSV that some process still holds open is *in progress*: we only remember which
//!    Steam app the writer belongs to (SteamAppId from its environ) and skip it;
//!  * a closed, unprocessed CSV is parsed -> `sessions/<end>-<appid>.json` + `latest.json`
//!    (tmp + rename) + one desktop notification; then it is marked processed;
//!  * logs older than 30 days are pruned.
//!
//! std only, no dependencies. All external text (game names, process names) is sanitised
//! and length-bounded before it reaches JSON or the notification.

use std::collections::{HashMap, HashSet};
use std::fs::{self, File};
use std::io::{Read, Write};
use std::os::unix::fs::MetadataExt;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

const PRUNE_AGE: Duration = Duration::from_secs(30 * 24 * 3600);
const DEFAULT_MIN_SESSION_S: f64 = 60.0;
const MAX_TEXT: usize = 120;
const MAX_CSV_BYTES: u64 = 512 * 1024 * 1024;

struct Paths {
    logs: PathBuf,
    sessions: PathBuf,
    state: PathBuf,
    home: PathBuf,
}

fn main() {
    let home = PathBuf::from(std::env::var_os("HOME").unwrap_or_else(|| "/".into()));
    let base = std::env::var_os("DESK_SESSION_BASE")
        .map(PathBuf::from)
        .unwrap_or_else(|| home.join(".local/state/fynnp-desk"));
    let p = Paths {
        logs: base.join("mangohud-logs"),
        sessions: base.join("sessions"),
        state: base.join("desk-session"),
        home,
    };
    for d in [&p.logs, &p.sessions, &p.state] {
        let _ = fs::create_dir_all(d);
    }
    let no_notify = std::env::var_os("DESK_SESSION_NO_NOTIFY").is_some();
    let min_s = std::env::var("DESK_SESSION_MIN_S")
        .ok()
        .and_then(|v| v.parse::<f64>().ok())
        .unwrap_or(DEFAULT_MIN_SESSION_S);

    // Single instance (manual run vs. service).
    let lock = match File::create(p.state.join("lock")) {
        Ok(f) => f,
        Err(e) => return eprintln!("desk-session: cannot create lock: {e}"),
    };
    if lock.lock().is_err() {
        return;
    }

    let mut processed = load_set(&p.state.join("processed"));
    let mut hints = load_hints(&p.state.join("hints.tsv"));

    // Events that arrive while we run may be coalesced by systemd, so rescan until stable.
    let mut last_listing = Vec::new();
    for _ in 0..5 {
        let listing = list_logs(&p.logs);
        if listing == last_listing {
            break;
        }
        let open = open_log_writers(&listing);
        for (name, ino, _size) in &listing {
            if processed.contains(name) {
                continue;
            }
            let path = p.logs.join(name);
            if let Some(&pid) = open.get(ino) {
                // In progress: remember who writes it (best moment to learn the appid).
                if !hints.contains_key(name) {
                    if let Some(h) = hint_from_pid(pid) {
                        hints.insert(name.clone(), h);
                        save_hints(&p.state.join("hints.tsv"), &hints);
                    }
                }
                continue;
            }
            match process_log(&p, &path, name, hints.get(name), min_s, no_notify) {
                Ok(()) => {}
                Err(e) => eprintln!("desk-session: {name}: {e}"),
            }
            processed.insert(name.clone());
            hints.remove(name);
            save_set(&p.state.join("processed"), &processed);
            save_hints(&p.state.join("hints.tsv"), &hints);
        }
        last_listing = listing;
    }

    prune(&p.logs, &mut processed, &mut hints);
    save_set(&p.state.join("processed"), &processed);
    save_hints(&p.state.join("hints.tsv"), &hints);
}

// ---------------------------------------------------------------- log dir

/// (file name, inode, size) of main CSV logs, sorted. Summary files are ignored.
fn list_logs(dir: &Path) -> Vec<(String, u64, u64)> {
    let mut v = Vec::new();
    if let Ok(rd) = fs::read_dir(dir) {
        for e in rd.flatten() {
            let name = e.file_name().to_string_lossy().into_owned();
            if !name.ends_with(".csv") || name.ends_with("_summary.csv") {
                continue;
            }
            if let Ok(m) = e.metadata() {
                if m.is_file() {
                    v.push((name, m.ino(), m.size()));
                }
            }
        }
    }
    v.sort();
    v
}

/// inode -> pid of any process holding one of our logs open. One /proc sweep, only
/// stat()ing fds whose link text ends in ".csv" (paths may differ inside pressure-vessel,
/// so we compare inodes, not strings).
fn open_log_writers(listing: &[(String, u64, u64)]) -> HashMap<u64, u32> {
    let inos: HashSet<u64> = listing.iter().map(|l| l.1).collect();
    let mut out = HashMap::new();
    if inos.is_empty() {
        return out;
    }
    let Ok(rd) = fs::read_dir("/proc") else { return out };
    for e in rd.flatten() {
        let Ok(pid) = e.file_name().to_string_lossy().parse::<u32>() else { continue };
        let fd_dir = e.path().join("fd");
        let Ok(fds) = fs::read_dir(&fd_dir) else { continue };
        for fd in fds.flatten() {
            let Ok(target) = fs::read_link(fd.path()) else { continue };
            if !target.to_string_lossy().ends_with(".csv") {
                continue;
            }
            if let Ok(m) = fs::metadata(fd.path()) {
                if inos.contains(&m.ino()) {
                    out.insert(m.ino(), pid);
                }
            }
        }
    }
    out
}

fn prune(dir: &Path, processed: &mut HashSet<String>, hints: &mut HashMap<String, Hint>) {
    let now = SystemTime::now();
    let mut present = HashSet::new();
    if let Ok(rd) = fs::read_dir(dir) {
        for e in rd.flatten() {
            let name = e.file_name().to_string_lossy().into_owned();
            let old = e
                .metadata()
                .and_then(|m| m.modified())
                .ok()
                .and_then(|t| now.duration_since(t).ok())
                .is_some_and(|age| age > PRUNE_AGE);
            if old && name.ends_with(".csv") {
                let _ = fs::remove_file(e.path());
            } else {
                present.insert(name);
            }
        }
    }
    processed.retain(|n| present.contains(n));
    hints.retain(|n, _| present.contains(n));
}

// ---------------------------------------------------------------- state files

fn load_set(path: &Path) -> HashSet<String> {
    fs::read_to_string(path)
        .unwrap_or_default()
        .lines()
        .filter(|l| !l.is_empty())
        .map(str::to_owned)
        .collect()
}

fn save_set(path: &Path, set: &HashSet<String>) {
    let mut v: Vec<&String> = set.iter().collect();
    v.sort();
    let mut s = String::new();
    for n in v {
        s.push_str(n);
        s.push('\n');
    }
    let _ = write_atomic(path, s.as_bytes());
}

#[derive(Clone)]
struct Hint {
    appid: u64,
    proc_name: String,
}

fn load_hints(path: &Path) -> HashMap<String, Hint> {
    let mut m = HashMap::new();
    for l in fs::read_to_string(path).unwrap_or_default().lines() {
        let mut it = l.splitn(3, '\t');
        if let (Some(n), Some(a), Some(p)) = (it.next(), it.next(), it.next()) {
            if let Ok(appid) = a.parse() {
                m.insert(n.to_owned(), Hint { appid, proc_name: p.to_owned() });
            }
        }
    }
    m
}

fn save_hints(path: &Path, hints: &HashMap<String, Hint>) {
    let mut s = String::new();
    for (n, h) in hints {
        s.push_str(&format!("{n}\t{}\t{}\n", h.appid, sanitize(&h.proc_name).replace('\t', " ")));
    }
    let _ = write_atomic(path, s.as_bytes());
}

fn write_atomic(path: &Path, data: &[u8]) -> std::io::Result<()> {
    let tmp = path.with_extension(format!("tmp{}", std::process::id()));
    {
        let mut f = File::create(&tmp)?;
        f.write_all(data)?;
        f.sync_all()?;
    }
    fs::rename(&tmp, path)
}

// ---------------------------------------------------------------- Steam mapping

/// Walk up from the writer pid until a process carries SteamAppId / SteamGameId.
fn hint_from_pid(pid: u32) -> Option<Hint> {
    let proc_name = fs::read_to_string(format!("/proc/{pid}/comm"))
        .map(|s| s.trim().to_owned())
        .unwrap_or_default();
    let mut cur = pid;
    for _ in 0..12 {
        if let Ok(env) = fs::read(format!("/proc/{cur}/environ")) {
            let get = |key: &[u8]| {
                env.split(|&b| b == 0)
                    .find_map(|kv| kv.strip_prefix(key))
                    .and_then(|v| std::str::from_utf8(v).ok()?.parse::<u64>().ok())
                    .filter(|n| *n != 0)
            };
            if let Some(appid) = get(b"SteamAppId=").or_else(|| get(b"SteamGameId=")) {
                // Non-Steam shortcuts get huge synthetic SteamGameIds; treat as unknown.
                let appid = if appid > u32::MAX as u64 { 0 } else { appid };
                return Some(Hint { appid, proc_name });
            }
        }
        let status = fs::read_to_string(format!("/proc/{cur}/status")).ok()?;
        let ppid = status
            .lines()
            .find_map(|l| l.strip_prefix("PPid:"))
            .and_then(|v| v.trim().parse::<u32>().ok())?;
        if ppid <= 1 {
            break;
        }
        cur = ppid;
    }
    Some(Hint { appid: 0, proc_name })
}

fn steam_libraries(home: &Path) -> Vec<PathBuf> {
    let mut libs = Vec::new();
    for root in [".local/share/Steam", ".steam/steam"] {
        let vdf = home.join(root).join("steamapps/libraryfolders.vdf");
        if let Ok(s) = fs::read_to_string(&vdf) {
            for l in s.lines() {
                let f = vdf_fields(l);
                if f.len() == 2 && f[0] == "path" {
                    libs.push(PathBuf::from(f[1].replace("\\\\", "\\")));
                }
            }
        }
        libs.push(home.join(root));
    }
    let mut seen = HashSet::new();
    libs.retain(|l| {
        let c = fs::canonicalize(l).unwrap_or_else(|_| l.clone());
        l.join("steamapps").is_dir() && seen.insert(c)
    });
    libs
}

/// Quoted fields of one VDF line: `"key"  "value"` -> ["key", "value"].
fn vdf_fields(line: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut cur = String::new();
    let mut inq = false;
    let mut esc = false;
    for ch in line.chars() {
        if inq {
            if esc {
                cur.push(ch);
                esc = false;
            } else if ch == '\\' {
                esc = true;
                cur.push(ch);
            } else if ch == '"' {
                out.push(std::mem::take(&mut cur));
                inq = false;
            } else {
                cur.push(ch);
            }
        } else if ch == '"' {
            inq = true;
        }
    }
    out
}

fn manifest_field(acf: &str, key: &str) -> Option<String> {
    acf.lines().find_map(|l| {
        let f = vdf_fields(l);
        (f.len() == 2 && f[0] == key).then(|| f[1].clone())
    })
}

fn game_name_for(libs: &[PathBuf], appid: u64) -> Option<String> {
    libs.iter().find_map(|lib| {
        let s = read_bounded(&lib.join(format!("steamapps/appmanifest_{appid}.acf")), 1 << 20)?;
        manifest_field(&s, "name")
    })
}

/// Fallback when we never saw the writer: find the installed app whose install dir
/// contains an executable named like MangoHud's program name.
fn appid_for_program(libs: &[PathBuf], prog: &str) -> Option<(u64, String)> {
    let prog_l = prog.to_lowercase();
    if prog_l.is_empty() {
        return None;
    }
    let stem = prog_l.strip_suffix(".exe").unwrap_or(&prog_l).to_owned();
    let mut apps = Vec::new();
    for lib in libs {
        let Ok(rd) = fs::read_dir(lib.join("steamapps")) else { continue };
        for e in rd.flatten() {
            let n = e.file_name().to_string_lossy().into_owned();
            let Some(id) = n.strip_prefix("appmanifest_").and_then(|r| r.strip_suffix(".acf")) else {
                continue;
            };
            let Ok(appid) = id.parse::<u64>() else { continue };
            let Some(acf) = read_bounded(&e.path(), 1 << 20) else { continue };
            let (Some(name), Some(dir)) = (manifest_field(&acf, "name"), manifest_field(&acf, "installdir")) else {
                continue;
            };
            // Steam tools (Proton, runtimes) never produce game logs.
            if name.starts_with("Proton") || name.starts_with("Steam Linux Runtime") || name.starts_with("Steamworks") {
                continue;
            }
            apps.push((appid, name, lib.join("steamapps/common").join(dir)));
        }
    }
    // Cheap pass: name or install dir equals the program name.
    for (appid, name, dir) in &apps {
        let d = dir.file_name().map(|s| s.to_string_lossy().to_lowercase()).unwrap_or_default();
        if d == stem || name.to_lowercase() == stem {
            return Some((*appid, name.clone()));
        }
    }
    // Bounded walk of install dirs for a file called <prog> / <prog>.exe.
    let mut budget: usize = 200_000;
    for (appid, name, dir) in &apps {
        if find_file(dir, &stem, 6, &mut budget) {
            return Some((*appid, name.clone()));
        }
        if budget == 0 {
            break;
        }
    }
    None
}

fn find_file(dir: &Path, stem: &str, depth: u32, budget: &mut usize) -> bool {
    let Ok(rd) = fs::read_dir(dir) else { return false };
    let mut subdirs = Vec::new();
    for e in rd.flatten() {
        if *budget == 0 {
            return false;
        }
        *budget -= 1;
        let n = e.file_name().to_string_lossy().to_lowercase();
        let Ok(ft) = e.file_type() else { continue };
        if ft.is_dir() {
            subdirs.push(e.path());
        } else if n == stem || n.strip_suffix(".exe") == Some(stem) {
            return true;
        }
    }
    depth > 0 && subdirs.iter().any(|d| find_file(d, stem, depth - 1, budget))
}

fn read_bounded(path: &Path, max: u64) -> Option<String> {
    let mut s = String::new();
    File::open(path).ok()?.take(max).read_to_string(&mut s).ok()?;
    Some(s)
}

/// MangoHud names logs `<program>_<YYYY-MM-DD_HH-MM-SS>.csv`.
fn program_from_filename(name: &str) -> String {
    let base = name.strip_suffix(".csv").unwrap_or(name);
    let prog = if base.len() > 20 && base.is_char_boundary(base.len() - 20) && base.as_bytes()[base.len() - 20] == b'_' {
        &base[..base.len() - 20]
    } else {
        base
    };
    sanitize(prog)
}

// ---------------------------------------------------------------- CSV -> stats

#[derive(Default, Debug)]
struct Stats {
    samples: usize,
    duration_s: f64,
    fps_avg: Option<f64>,
    fps_1: Option<f64>,
    fps_01: Option<f64>,
    ft_avg: Option<f64>,
    cpu_temp_max: Option<f64>,
    gpu_temp_max: Option<f64>,
    cpu_load: Option<f64>,
    gpu_load: Option<f64>,
    cpu_w: Option<f64>,
    gpu_w: Option<f64>,
    energy_kwh: Option<f64>,
}

fn parse_csv(text: &str) -> Result<Stats, String> {
    // Drop a trailing partial line (crash mid-write).
    let text = match text.rfind('\n') {
        Some(i) if i + 1 < text.len() => &text[..=i],
        _ => text,
    };
    let mut lines = text.lines();
    let header = lines
        .by_ref()
        .find(|l| l.starts_with("fps,") || l.starts_with("fps,frametime"))
        .ok_or("no MangoHud data header")?;
    let cols: Vec<&str> = header.split(',').map(str::trim).collect();
    let idx = |n: &str| cols.iter().position(|c| *c == n);
    let (i_fps, i_ft, i_cl, i_cp, i_gl, i_ct, i_gt, i_gp, i_el) = (
        idx("fps"),
        idx("frametime"),
        idx("cpu_load"),
        idx("cpu_power"),
        idx("gpu_load"),
        idx("cpu_temp"),
        idx("gpu_temp"),
        idx("gpu_power"),
        idx("elapsed"),
    );

    let mut rows: Vec<Vec<f64>> = Vec::new();
    for l in lines {
        let f: Vec<&str> = l.split(',').collect();
        if f.len() != cols.len() {
            continue;
        }
        let r: Option<Vec<f64>> = f.iter().map(|v| v.trim().parse::<f64>().ok().filter(|x| x.is_finite())).collect();
        if let Some(r) = r {
            rows.push(r);
        }
    }
    if rows.is_empty() {
        return Err("no data rows".into());
    }
    let col = |i: Option<usize>| -> Vec<f64> { i.map(|i| rows.iter().map(|r| r[i]).collect()).unwrap_or_default() };
    let mean = |v: &[f64]| (!v.is_empty()).then(|| v.iter().sum::<f64>() / v.len() as f64);
    // A metric MangoHud could not read is logged as 0 throughout -> unknown.
    let known = |v: Vec<f64>| if v.iter().any(|x| *x > 0.0) { v } else { Vec::new() };
    let maxv = |v: &[f64]| v.iter().cloned().fold(None, |m: Option<f64>, x| Some(m.map_or(x, |m| m.max(x))));

    let mut s = Stats { samples: rows.len(), ..Default::default() };

    // Time axis (MangoHud: ns since log start).
    let el: Vec<f64> = col(i_el).iter().map(|ns| ns / 1e9).collect();
    let interval = if el.len() >= 2 {
        let mut d: Vec<f64> = el.windows(2).map(|w| w[1] - w[0]).filter(|d| *d > 0.0).collect();
        d.sort_by(f64::total_cmp);
        d.get(d.len() / 2).copied().unwrap_or(0.1)
    } else {
        0.1
    };
    s.duration_s = if el.len() >= 2 { (el[el.len() - 1] - el[0]).max(0.0) + interval } else { rows.len() as f64 * interval };

    let fps: Vec<f64> = col(i_fps).into_iter().filter(|x| *x > 0.0).collect();
    let mut ft: Vec<f64> = col(i_ft).into_iter().filter(|x| *x > 0.0).collect();
    // Rows are time-sampled, so the mean of sampled fps is the time-average = frames/time.
    s.fps_avg = mean(&fps).or_else(|| mean(&ft).map(|m| 1000.0 / m));
    s.ft_avg = s.fps_avg.map(|f| 1000.0 / f);
    if !ft.is_empty() {
        ft.sort_by(|a, b| b.total_cmp(a)); // worst first
        let low = |pct: f64| {
            let n = ((ft.len() as f64 * pct).ceil() as usize).clamp(1, ft.len());
            1000.0 / (ft[..n].iter().sum::<f64>() / n as f64)
        };
        s.fps_1 = Some(low(0.01));
        s.fps_01 = Some(low(0.001));
    }
    s.cpu_temp_max = maxv(&known(col(i_ct)));
    s.gpu_temp_max = maxv(&known(col(i_gt)));
    s.cpu_load = mean(&known(col(i_cl)));
    s.gpu_load = mean(&known(col(i_gl)));
    let cpu_p = known(col(i_cp));
    let gpu_p = known(col(i_gp));
    s.cpu_w = mean(&cpu_p);
    s.gpu_w = mean(&gpu_p);

    // energy = ∫ (cpu_power + gpu_power) dt, trapezoid over the elapsed axis.
    if !(cpu_p.is_empty() && gpu_p.is_empty()) {
        let p: Vec<f64> = (0..rows.len())
            .map(|i| cpu_p.get(i).copied().unwrap_or(0.0) + gpu_p.get(i).copied().unwrap_or(0.0))
            .collect();
        let joules = if el.len() == p.len() && el.len() >= 2 {
            let mut j: f64 = el.windows(2).zip(p.windows(2)).map(|(t, w)| (t[1] - t[0]).max(0.0) * (w[0] + w[1]) / 2.0).sum();
            j += p[0] * interval; // first sample's slice
            j
        } else {
            p.iter().sum::<f64>() * interval
        };
        s.energy_kwh = Some(joules / 3.6e6);
    }
    Ok(s)
}

// ---------------------------------------------------------------- report

fn process_log(p: &Paths, path: &Path, name: &str, hint: Option<&Hint>, min_s: f64, no_notify: bool) -> Result<(), String> {
    let meta = fs::metadata(path).map_err(|e| e.to_string())?;
    if meta.len() > MAX_CSV_BYTES {
        return Err("log too large, skipped".into());
    }
    let text = fs::read(path).map_err(|e| e.to_string())?;
    let stats = parse_csv(&String::from_utf8_lossy(&text))?;
    if stats.duration_s < min_s {
        return Err(format!("{:.0}s session, below {min_s:.0}s — no report", stats.duration_s));
    }

    let end = meta.modified().ok().and_then(|t| t.duration_since(UNIX_EPOCH).ok()).map_or(0, |d| d.as_secs());
    let duration = stats.duration_s.round() as u64;
    let start = end.saturating_sub(duration);

    let prog = program_from_filename(name);
    let libs = steam_libraries(&p.home);
    let (appid, game) = match hint {
        Some(h) if h.appid != 0 => {
            let g = game_name_for(&libs, h.appid).unwrap_or_else(|| prog.clone());
            (h.appid, g)
        }
        _ => appid_for_program(&libs, &prog).unwrap_or((0, prog.clone())),
    };
    let game = sanitize(&game);

    let num = |v: Option<f64>, d: usize| v.map_or("null".to_owned(), |x| format!("{x:.d$}"));
    let int = |v: Option<f64>| v.map_or("null".to_owned(), |x| format!("{}", x.round() as i64));
    let json = format!(
        "{{\n  \"version\": 1,\n  \"appid\": {appid}, \"game\": {game_j},\n  \"start\": {start}, \"end\": {end}, \"duration_s\": {duration},\n  \"fps_avg\": {fa}, \"fps_1pct_low\": {f1}, \"fps_0_1pct_low\": {f01},\n  \"frametime_avg_ms\": {ft},\n  \"cpu_temp_max\": {ct}, \"gpu_temp_max\": {gt},\n  \"cpu_load_avg\": {cl}, \"gpu_load_avg\": {gl},\n  \"cpu_power_avg_w\": {cw}, \"gpu_power_avg_w\": {gw},\n  \"energy_kwh\": {en},\n  \"source\": \"mangohud\", \"log\": {log_j}\n}}\n",
        game_j = json_str(&game),
        fa = num(stats.fps_avg, 1),
        f1 = num(stats.fps_1, 1),
        f01 = num(stats.fps_01, 1),
        ft = num(stats.ft_avg, 2),
        ct = int(stats.cpu_temp_max),
        gt = int(stats.gpu_temp_max),
        cl = num(stats.cpu_load, 1),
        gl = num(stats.gpu_load, 1),
        cw = num(stats.cpu_w, 1),
        gw = num(stats.gpu_w, 1),
        en = num(stats.energy_kwh, 3),
        log_j = json_str(&path.to_string_lossy()),
    );

    let mut out_end = end;
    let out = loop {
        let o = p.sessions.join(format!("{out_end}-{appid}.json"));
        if !o.exists() {
            break o;
        }
        out_end += 1;
    };
    write_atomic(&out, json.as_bytes()).map_err(|e| e.to_string())?;
    write_atomic(&p.sessions.join("latest.json"), json.as_bytes()).map_err(|e| e.to_string())?;
    eprintln!("desk-session: {name} -> {} ({} samples)", out.display(), stats.samples);

    if !no_notify {
        notify(&game, duration, &stats);
    }
    Ok(())
}

fn notify(game: &str, duration: u64, s: &Stats) {
    let (h, m) = (duration / 3600, (duration % 3600) / 60);
    let dur = if h > 0 { format!("{h}h {m}m") } else { format!("{}m", m.max(1)) };
    let title = format!("{} · {dur}", truncate(game, 60));
    let body = notify_body(s);
    let icon = std::env::var_os("HOME")
        .map(|h| PathBuf::from(h).join(".local/share/icons/hicolor/64x64/apps/desk-session.png"))
        .filter(|p| p.is_file())
        .map_or("applications-games".to_owned(), |p| p.to_string_lossy().into_owned());
    let _ = Command::new("notify-send")
        .args(["-a", "Game session", "-i", &icon, "--", &markup_escape(&title), &markup_escape(&body)])
        .status();
}

/// One line at Omarchy's notification width (~45 chars): most useful first,
/// lowest-priority parts dropped from the end if it would wrap.
const BODY_MAX: usize = 44;
fn notify_body(s: &Stats) -> String {
    let mut parts = Vec::new();
    if let Some(f) = s.fps_avg {
        parts.push(format!("{f:.0} fps"));
    }
    if let Some(l) = s.fps_1 {
        parts.push(format!("1% low {l:.0}"));
    }
    match (s.cpu_temp_max, s.gpu_temp_max) {
        (Some(c), Some(g)) => parts.push(format!("{c:.0}°/{g:.0}°C")),
        (Some(c), None) => parts.push(format!("CPU {c:.0}°C")),
        (None, Some(g)) => parts.push(format!("GPU {g:.0}°C")),
        (None, None) => {}
    }
    if let Some(e) = s.energy_kwh {
        parts.push(format!("{e:.2} kWh"));
    }
    let mut body = parts.join(" · ");
    while body.chars().count() > BODY_MAX && parts.len() > 1 {
        parts.pop();
        body = parts.join(" · ");
    }
    body
}

// ---------------------------------------------------------------- text safety

fn sanitize(s: &str) -> String {
    let cleaned: String = s.chars().filter(|c| !c.is_control()).collect();
    truncate(cleaned.trim(), MAX_TEXT)
}

fn truncate(s: &str, max: usize) -> String {
    if s.chars().count() <= max {
        s.to_owned()
    } else {
        let mut t: String = s.chars().take(max - 1).collect();
        t.push('…');
        t
    }
}

fn json_str(s: &str) -> String {
    let mut o = String::with_capacity(s.len() + 2);
    o.push('"');
    for c in s.chars() {
        match c {
            '"' => o.push_str("\\\""),
            '\\' => o.push_str("\\\\"),
            c if (c as u32) < 0x20 => o.push_str(&format!("\\u{:04x}", c as u32)),
            c => o.push(c),
        }
    }
    o.push('"');
    o
}

fn markup_escape(s: &str) -> String {
    s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn filename_program() {
        assert_eq!(program_from_filename("AC2-Win64-Shipping.exe_2026-11-23_21-04-55.csv"), "AC2-Win64-Shipping.exe");
        assert_eq!(program_from_filename("my_game_2026-11-23_21-04-55.csv"), "my_game");
    }

    #[test]
    fn body_fits_one_line() {
        let s = Stats {
            fps_avg: Some(1143.0),
            fps_1: Some(1057.0),
            cpu_temp_max: Some(100.0),
            gpu_temp_max: Some(100.0),
            energy_kwh: Some(10.43),
            ..Default::default()
        };
        assert!(notify_body(&s).chars().count() <= BODY_MAX);
        let s = Stats { fps_avg: Some(143.0), fps_1: Some(57.0), cpu_temp_max: Some(78.0), gpu_temp_max: Some(71.0), energy_kwh: Some(0.43), ..Default::default() };
        assert_eq!(notify_body(&s), "143 fps · 1% low 57 · 78°/71°C · 0.43 kWh");
        let s = Stats { gpu_temp_max: Some(71.0), energy_kwh: Some(0.43), ..Default::default() };
        assert_eq!(notify_body(&s), "GPU 71°C · 0.43 kWh");
    }

    #[test]
    fn lows_and_energy() {
        let mut t = String::from("os,cpu,gpu,ram,kernel,driver,cpuscheduler\nArch,X,Y,32,6,1,\n");
        t.push_str("fps,frametime,cpu_load,cpu_power,gpu_load,cpu_temp,gpu_temp,gpu_core_clock,gpu_mem_clock,gpu_vram_used,gpu_power,ram,swap_used,process_rss,cpu_mhz,elapsed\n");
        for i in 0..1000u64 {
            let ft = if i % 100 == 0 { 20.0 } else { 10.0 };
            t.push_str(&format!("100,{ft},50,50,90,70,60,1800,9000,8.0,250,16,0,4,5000,{}\n", i * 100_000_000));
        }
        t.push_str("100,10,5"); // partial trailing line
        let s = parse_csv(&t).unwrap();
        assert_eq!(s.samples, 1000);
        assert!((s.duration_s - 100.0).abs() < 1e-6);
        assert!((s.fps_1.unwrap() - 50.0).abs() < 1e-6);
        assert!((s.energy_kwh.unwrap() - 300.0 * 100.0 / 3.6e6).abs() < 1e-9);
        assert_eq!(s.cpu_temp_max, Some(70.0));
    }
}
