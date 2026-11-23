//! Disk sources: /proc/diskstats (I/O rates of whole disks), /proc/self/mountinfo (real
//! filesystems) and statvfs(3) (their usage). std only; statvfs comes from glibc, which every
//! Rust binary on Linux links anyway, so it is declared by hand instead of pulling in `libc`.

use std::collections::HashMap;
use std::ffi::CString;
use std::io::Read;
use std::os::raw::{c_char, c_int, c_ulong};
use std::path::Path;
use std::time::Instant;

// ---------------------------------------------------------------- statvfs

// `struct statvfs` as glibc defines it on 64-bit Linux (bits/statvfs.h): fsblkcnt_t and
// fsfilcnt_t are unsigned long there, and the `__f_unused` padding after f_fsid only exists
// on 32-bit targets. 11 x 8 bytes + 6 x 4 bytes = 112 bytes, checked below.
#[cfg(not(all(target_os = "linux", target_env = "gnu", target_pointer_width = "64")))]
compile_error!("deskdisk-feed's statvfs layout is written for 64-bit Linux with glibc");

#[repr(C)]
struct Statvfs {
    f_bsize: c_ulong,
    f_frsize: c_ulong,
    f_blocks: c_ulong,
    f_bfree: c_ulong,
    f_bavail: c_ulong,
    f_files: c_ulong,
    f_ffree: c_ulong,
    f_favail: c_ulong,
    f_fsid: c_ulong,
    f_flag: c_ulong,
    f_namemax: c_ulong,
    __f_spare: [c_int; 6],
}

const _: () = assert!(std::mem::size_of::<Statvfs>() == 112);

extern "C" {
    fn statvfs(path: *const c_char, buf: *mut Statvfs) -> c_int;
}

/// (total, used, available-to-users) in bytes, like df.
fn usage(mount: &str) -> Option<(u64, u64, u64)> {
    let path = CString::new(mount).ok()?;
    // All-zero is a valid value for this plain-integer struct.
    let mut st = Statvfs {
        f_bsize: 0, f_frsize: 0, f_blocks: 0, f_bfree: 0, f_bavail: 0, f_files: 0,
        f_ffree: 0, f_favail: 0, f_fsid: 0, f_flag: 0, f_namemax: 0, __f_spare: [0; 6],
    };
    // SAFETY: `path` is a valid NUL-terminated string that outlives the call, and `st` is a
    // writable, correctly laid out (see the size check above) struct statvfs. statvfs only
    // writes into `st` and keeps no pointer to either argument after it returns.
    let rc = unsafe { statvfs(path.as_ptr(), &mut st) };
    if rc != 0 {
        return None;
    }
    let unit = if st.f_frsize > 0 { st.f_frsize } else { st.f_bsize };
    let total = st.f_blocks.saturating_mul(unit);
    let used = st.f_blocks.saturating_sub(st.f_bfree).saturating_mul(unit);
    let avail = st.f_bavail.saturating_mul(unit);
    Some((total, used, avail))
}

// ---------------------------------------------------------------- filesystems

pub struct Fs {
    pub mount: String,
    pub source: String,
    pub fstype: String,
    pub total: u64,
    pub used: u64,
    pub avail: u64,
}

/// Filesystem types that live on a real disk. Everything else (tmpfs, proc, sysfs, overlay,
/// squashfs, nsfs, cgroup, autofs, fuse.* network mounts …) is skipped.
const REAL_FS: &[&str] = &[
    "ext2", "ext3", "ext4", "btrfs", "xfs", "f2fs", "bcachefs", "zfs", "jfs", "reiserfs",
    "nilfs2", "vfat", "exfat", "ntfs", "ntfs3", "fuseblk", "hfsplus",
];

/// mountinfo escapes space, tab, newline and backslash as \ooo octal.
fn unescape(s: &str) -> String {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'\\' && i + 3 < b.len() && b[i + 1..i + 4].iter().all(|c| (b'0'..=b'7').contains(c)) {
            out.push((b[i + 1] - b'0') * 64 + (b[i + 2] - b'0') * 8 + (b[i + 3] - b'0'));
            i += 4;
        } else {
            out.push(b[i]);
            i += 1;
        }
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// Real, deduplicated filesystems: "/" first, then by mount point. Btrfs subvolumes and bind
/// mounts share one source device, so only the shortest mount point of each device is kept.
pub fn filesystems() -> Vec<Fs> {
    let text = std::fs::read_to_string("/proc/self/mountinfo").unwrap_or_default();
    // device key -> (mount point, source, fstype)
    let mut by_dev: HashMap<String, (String, String, String)> = HashMap::new();
    for line in text.lines() {
        // id parent maj:min root mountpoint opts [optional…] - fstype source superopts
        let Some((pre, post)) = line.split_once(" - ") else { continue };
        let pre: Vec<&str> = pre.split(' ').collect();
        let mut post = post.split(' ');
        let (Some(fstype), Some(source)) = (post.next(), post.next()) else { continue };
        if pre.len() < 5 || !REAL_FS.contains(&fstype) || source.starts_with("/dev/loop") {
            continue;
        }
        let mount = unescape(pre[4]);
        let source = unescape(source);
        let key = if source.starts_with("/dev/") { source.clone() } else { pre[2].to_string() };
        let keep = match by_dev.get(&key) {
            Some((m, _, _)) => mount.len() < m.len(),
            None => true,
        };
        if keep {
            by_dev.insert(key, (mount, source, fstype.to_string()));
        }
    }
    let mut out: Vec<Fs> = by_dev
        .into_values()
        .filter_map(|(mount, source, fstype)| {
            let (total, used, avail) = usage(&mount)?;
            (total > 0).then_some(Fs { mount, source, fstype, total, used, avail })
        })
        .collect();
    out.sort_by(|a, b| (a.mount != "/", &a.mount).cmp(&(b.mount != "/", &b.mount)));
    out
}

// ---------------------------------------------------------------- I/O rates

pub struct Rate {
    /// bytes/s read and written, summed over whole disks
    pub read: f64,
    pub write: f64,
    /// % of the interval the busiest disk had I/O in flight
    pub util: f64,
}

#[derive(Clone, Copy)]
struct Counters {
    sectors_read: u64,
    sectors_written: u64,
    io_ms: u64,
}

pub struct IoMeter {
    buf: String,
    prev: HashMap<String, Counters>,
    prev_at: Option<Instant>,
    /// name -> is a whole physical disk (cached; a name never changes kind)
    whole: HashMap<String, bool>,
}

impl IoMeter {
    pub fn new() -> Self {
        IoMeter { buf: String::with_capacity(4096), prev: HashMap::new(), prev_at: None, whole: HashMap::new() }
    }

    /// Whole disks are the /sys/block entries backed by a device (sda, nvme0n1, vda, mmcblk0).
    /// Partitions are not in /sys/block, and loop, ram, zram, dm-* (LUKS, LVM) and md have no
    /// `device` link, so stacked devices are not counted twice.
    fn is_whole(&mut self, name: &str) -> bool {
        if let Some(&w) = self.whole.get(name) {
            return w;
        }
        let w = Path::new("/sys/block").join(name).join("device").exists();
        self.whole.insert(name.to_string(), w);
        w
    }

    pub fn sample(&mut self) -> Rate {
        self.buf.clear();
        let ok = std::fs::File::open("/proc/diskstats")
            .and_then(|mut f| f.read_to_string(&mut self.buf))
            .is_ok();
        let now = Instant::now();
        let dt = self.prev_at.map(|t| now.duration_since(t).as_secs_f64()).unwrap_or(0.0);
        let mut rate = Rate { read: 0.0, write: 0.0, util: 0.0 };
        if !ok {
            return rate;
        }
        let text = std::mem::take(&mut self.buf);
        for line in text.lines() {
            // major minor name reads merged sectors ms writes merged sectors ms inflight io_ms …
            let f: Vec<&str> = line.split_whitespace().collect();
            if f.len() < 13 || !self.is_whole(f[2]) {
                continue;
            }
            let n = |i: usize| f[i].parse::<u64>().unwrap_or(0);
            let c = Counters { sectors_read: n(5), sectors_written: n(9), io_ms: n(12) };
            let Some(p) = self.prev.get_mut(f[2]) else {
                self.prev.insert(f[2].to_string(), c);
                continue;
            };
            if dt > 0.0 {
                // diskstats sectors are always 512 bytes, whatever the hardware uses.
                rate.read += c.sectors_read.saturating_sub(p.sectors_read) as f64 * 512.0 / dt;
                rate.write += c.sectors_written.saturating_sub(p.sectors_written) as f64 * 512.0 / dt;
                let util = c.io_ms.saturating_sub(p.io_ms) as f64 / (dt * 10.0);
                rate.util = rate.util.max(util.min(100.0));
            }
            *p = c;
        }
        self.buf = text;
        self.prev_at = Some(now);
        rate
    }
}
