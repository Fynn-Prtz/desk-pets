//! deskmem-feed: per-app memory feed for the `fynnp.deskmem` Omarchy shell widget.
//!
//! Protocol (same as desksys-feed): the widget writes one line to stdin whenever it
//! wants a sample; we answer with one JSON line on stdout. Between requests the
//! process is blocked in read(2), so it costs zero CPU while the widget is hidden.
//! EOF (widget gone) exits.
//!
//! Answer, all sizes in MiB:
//!   {"t":32000,"u":11200,"f":20800,"o":3100,"a":[{"n":"firefox","m":2300},…]}
//!   t = MemTotal, f = MemAvailable ("free"), u = t - f,
//!   a = the biggest app groups (at most TOP, biggest first),
//!   o = u - sum(a): kernel, caches that can't be dropped, shared memory and
//!       every smaller process.
//!
//! Per process we read /proc/<pid>/statm (resident and shared pages) and
//! /proc/<pid>/stat (name, parent), plus the /proc/<pid>/exe link. An app's size is
//! its private resident memory, resident - shared (= RssAnon). Plain RSS counts
//! shared libraries and shared memory once per process, so a browser with 30
//! renderers would add up to more RAM than the machine has; PSS (smaps_rollup) is
//! exact but walks every page table, which is too expensive for a desk card.
//!
//! Grouping: a process is folded into its parent when both run the same executable
//! (chrome / electron / firefox content processes, zygotes) or when its name starts
//! with the parent's name (steam -> steamwebhelper, chrome -> chrome_crashpad).
//! The resulting roots are then merged by name, so two terminals are one slice.

use std::collections::HashMap;
use std::fmt::Write as _;
use std::fs::{self, File};
use std::io::{BufRead, Read, Write};
use std::path::PathBuf;

/// App groups we report; everything else goes into "other".
const TOP: usize = 6;
/// Longest app name we send (chars).
const NAME_MAX: usize = 24;
/// Shortest parent name that may absorb children by prefix ("steam" yes, "sh" no).
const PREFIX_MIN: usize = 4;
/// Guards the parent walk against pid reuse loops.
const DEPTH_MAX: usize = 64;

struct Proc {
    pid: u32,
    ppid: u32,
    comm: String,
    lower: String,
    exe: Option<PathBuf>,
    kib: u64,
}

/// Page size from the aux vector (AT_PAGESZ = 6), std-only. Falls back to 4 KiB.
fn page_size() -> u64 {
    const W: usize = std::mem::size_of::<usize>();
    if let Ok(b) = fs::read("/proc/self/auxv") {
        for pair in b.chunks_exact(2 * W) {
            let mut k = [0u8; W];
            let mut v = [0u8; W];
            k.copy_from_slice(&pair[..W]);
            v.copy_from_slice(&pair[W..]);
            let (k, v) = (usize::from_ne_bytes(k), usize::from_ne_bytes(v));
            if k == 0 {
                break;
            }
            if k == 6 && v > 0 {
                return v as u64;
            }
        }
    }
    4096
}

/// Read a small pseudo-file into a reused buffer.
fn read_to<'a>(path: &str, buf: &'a mut String) -> Option<&'a str> {
    buf.clear();
    File::open(path).ok()?.read_to_string(buf).ok()?;
    Some(buf.as_str())
}

/// (MemTotal, MemAvailable) in KiB.
fn parse_meminfo(s: &str) -> Option<(u64, u64)> {
    let (mut total, mut avail) = (None, None);
    for line in s.lines() {
        let mut it = line.split_whitespace();
        let key = it.next();
        let val = it.next().and_then(|v| v.parse::<u64>().ok());
        match key {
            Some("MemTotal:") => total = val,
            Some("MemAvailable:") => avail = val,
            _ => continue,
        }
        if total.is_some() && avail.is_some() {
            break;
        }
    }
    Some((total?, avail?))
}

/// Name and parent pid from /proc/<pid>/stat. The name sits in parentheses and
/// may itself contain spaces or ')', so split at the last ')'.
fn parse_stat(s: &str) -> Option<(&str, u32)> {
    let l = s.find('(')?;
    let r = s.rfind(')')?;
    let comm = s.get(l + 1..r)?;
    let mut rest = s.get(r + 1..)?.split_whitespace();
    rest.next()?; // state
    let ppid = rest.next()?.parse().ok()?;
    Some((comm, ppid))
}

/// Private resident pages (resident - shared) from /proc/<pid>/statm.
fn parse_statm(s: &str) -> Option<u64> {
    let mut it = s.split_whitespace();
    it.next()?; // size
    let resident: u64 = it.next()?.parse().ok()?;
    let shared: u64 = it.next()?.parse().ok()?;
    Some(resident.saturating_sub(shared))
}

/// Bounded, control-char-free display name.
fn clean_name(raw: &str) -> String {
    let s: String = raw.chars().filter(|c| !c.is_control()).take(NAME_MAX).collect();
    let s = s.trim();
    if s.is_empty() { "?".to_string() } else { s.to_string() }
}

/// Every user-space process with resident private memory.
fn scan(page_kib: u64, buf: &mut String, path: &mut String) -> Vec<Proc> {
    let mut procs = Vec::with_capacity(512);
    let Ok(dir) = fs::read_dir("/proc") else { return procs };
    for e in dir.flatten() {
        let name = e.file_name();
        let Some(pid) = name.to_str().and_then(|n| n.parse::<u32>().ok()) else { continue };
        path.clear();
        let _ = write!(path, "/proc/{pid}/statm");
        // Kernel threads (all zeros) and empty processes own nothing: skip early.
        let Some(pages) = read_to(path, buf).and_then(parse_statm).filter(|&p| p > 0) else { continue };
        path.clear();
        let _ = write!(path, "/proc/{pid}/stat");
        let Some((comm, ppid)) = read_to(path, buf).and_then(parse_stat) else { continue };
        let comm = clean_name(comm);
        path.clear();
        let _ = write!(path, "/proc/{pid}/exe");
        // Only readable for our own processes; others simply never fold by exe.
        let exe = fs::read_link(path.as_str()).ok();
        let lower = comm.to_lowercase();
        let ppid = if ppid == pid { 0 } else { ppid };
        procs.push(Proc { pid, ppid, comm, lower, exe, kib: pages * page_kib });
    }
    procs
}

/// Whether `child` is part of `parent`'s app.
fn folds(child: &Proc, parent: &Proc) -> bool {
    if let (Some(a), Some(b)) = (&child.exe, &parent.exe) {
        if a == b {
            return true;
        }
    }
    parent.lower.chars().count() >= PREFIX_MIN && child.lower.starts_with(&parent.lower)
}

/// App groups (name, KiB), biggest first.
fn group(procs: &[Proc]) -> Vec<(&str, u64)> {
    let index: HashMap<u32, usize> = procs.iter().enumerate().map(|(i, p)| (p.pid, i)).collect();
    let mut groups: HashMap<&str, u64> = HashMap::new();
    for p in procs {
        let mut root = p;
        for _ in 0..DEPTH_MAX {
            match index.get(&root.ppid).map(|&i| &procs[i]) {
                Some(parent) if folds(root, parent) => root = parent,
                _ => break,
            }
        }
        *groups.entry(root.comm.as_str()).or_insert(0) += p.kib;
    }
    let mut ranked: Vec<(&str, u64)> = groups.into_iter().collect();
    ranked.sort_unstable_by(|a, b| b.1.cmp(&a.1).then(a.0.cmp(b.0)));
    ranked
}

fn sample(page_kib: u64, buf: &mut String, path: &mut String, out: &mut String) {
    out.clear();
    let (total, avail) = read_to("/proc/meminfo", buf).and_then(parse_meminfo).unwrap_or((0, 0));
    let avail = avail.min(total);
    let used = total - avail;

    let procs = scan(page_kib, buf, path);
    let mut ranked = group(&procs);
    ranked.truncate(TOP);

    // Private memory can't exceed "used", but stay consistent if it ever does.
    let sum: u64 = ranked.iter().map(|g| g.1).sum();
    if sum > used {
        for g in &mut ranked {
            g.1 = g.1 * used / sum;
        }
    }
    let sum: u64 = ranked.iter().map(|g| g.1).sum();

    let mib = |kib: u64| kib / 1024;
    let _ = write!(
        out,
        "{{\"t\":{},\"u\":{},\"f\":{},\"o\":{},\"a\":[",
        mib(total),
        mib(used),
        mib(avail),
        mib(used.saturating_sub(sum))
    );
    for (i, (name, kib)) in ranked.iter().enumerate() {
        if i > 0 {
            out.push(',');
        }
        out.push_str("{\"n\":\"");
        for c in name.chars() {
            if c == '"' || c == '\\' {
                out.push('\\');
            }
            out.push(c);
        }
        let _ = write!(out, "\",\"m\":{}}}", mib(*kib));
    }
    out.push_str("]}\n");
}

fn main() {
    let page_kib = (page_size() / 1024).max(1);
    let stdin = std::io::stdin();
    let mut stdout = std::io::stdout().lock();
    let mut line = String::new();
    let mut out = String::with_capacity(512);
    let mut buf = String::with_capacity(4096);
    let mut path = String::with_capacity(32);
    loop {
        line.clear();
        match stdin.lock().read_line(&mut line) {
            Ok(0) | Err(_) => break,
            Ok(_) => {}
        }
        sample(page_kib, &mut buf, &mut path, &mut out);
        if stdout.write_all(out.as_bytes()).and_then(|_| stdout.flush()).is_err() {
            break;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn p(pid: u32, ppid: u32, comm: &str, exe: Option<&str>, kib: u64) -> Proc {
        Proc { pid, ppid, comm: comm.into(), lower: comm.to_lowercase(), exe: exe.map(PathBuf::from), kib }
    }

    #[test]
    fn stat_with_odd_name() {
        let s = "1234 (Web (Content)) S 99 1234 1 0 -1 0";
        assert_eq!(parse_stat(s), Some(("Web (Content)", 99)));
    }

    #[test]
    fn statm_private() {
        assert_eq!(parse_statm("1460 467 439 6 0 155 0\n"), Some(28));
        assert_eq!(parse_statm("0 0 0 0 0 0 0"), Some(0));
    }

    #[test]
    fn meminfo_keys() {
        let s = "MemTotal:       32000000 kB\nMemFree:  1 kB\nMemAvailable:   20000000 kB\n";
        assert_eq!(parse_meminfo(s), Some((32000000, 20000000)));
        assert_eq!(parse_meminfo("MemTotal: 5 kB\n"), None);
    }

    #[test]
    fn names_are_bounded_and_clean() {
        assert_eq!(clean_name("a\u{1b}[31mb\n"), "a[31mb");
        assert_eq!(clean_name(&"x".repeat(100)).len(), NAME_MAX);
        assert_eq!(clean_name("\t"), "?");
    }

    #[test]
    fn grouping() {
        let procs = vec![
            p(1, 0, "systemd", None, 10),
            p(10, 1, "bash", Some("/usr/bin/bash"), 5),
            p(11, 10, "chrome", Some("/opt/chrome"), 100),
            p(12, 11, "chrome", Some("/opt/chrome"), 50),
            p(13, 12, "chrome", Some("/opt/chrome"), 50),
            p(14, 11, "chrome_crashpad", None, 1),
            p(20, 1, "steam", Some("/usr/bin/steam"), 30),
            p(21, 20, "steamwebhelper", Some("/steam/swh"), 70),
            p(30, 1, "sh", None, 1),
            p(31, 30, "sh-helper", None, 2),
            p(40, 1, "bash", Some("/usr/bin/bash"), 5),
        ];
        let g = group(&procs);
        assert_eq!(g[0], ("chrome", 201));
        assert_eq!(g[1], ("steam", 100));
        assert!(g.contains(&("bash", 10)));
        assert!(g.contains(&("sh-helper", 2)));
    }
}
