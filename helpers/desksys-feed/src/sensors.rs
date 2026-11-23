//! Hardware sampling. Every file is opened once and re-read with seek+read into a
//! reused buffer, so a sample costs a handful of syscalls and zero allocations.

use std::ffi::c_void;
use std::fs::{self, File};
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::time::Instant;

#[derive(Default, Clone, Copy)]
pub struct Gpu {
    pub util: f32,
    pub temp: Option<f32>,
    pub watts: Option<f32>,
    pub vram: Option<(f32, f32)>, // used, total (GiB)
}

#[derive(Default, Clone, Copy)]
pub struct Stats {
    pub cpu: f32,
    pub cpu_temp: Option<f32>,
    pub cpu_watts: Option<f32>,
    pub mem: (f32, f32), // used, total (GiB)
    pub gpu: Option<Gpu>,
}

/// Read the start of a pseudo-file into `buf` (no allocation after warm-up).
fn read_into<'a>(f: &mut File, buf: &'a mut [u8]) -> Option<&'a str> {
    f.seek(SeekFrom::Start(0)).ok()?;
    let mut n = 0;
    while n < buf.len() {
        match f.read(&mut buf[n..]) {
            Ok(0) => break,
            Ok(k) => n += k,
            Err(_) => return None,
        }
    }
    std::str::from_utf8(&buf[..n]).ok()
}

fn read_num(f: &mut File) -> Option<f64> {
    let mut b = [0u8; 32];
    read_into(f, &mut b)?.trim().parse().ok()
}

fn find_hwmon(names: &[&str]) -> Option<PathBuf> {
    for e in fs::read_dir("/sys/class/hwmon").ok()?.flatten() {
        let p = e.path();
        if let Ok(n) = fs::read_to_string(p.join("name")) {
            if names.contains(&n.trim()) {
                return Some(p);
            }
        }
    }
    None
}

struct Rapl {
    file: File,
    max: u64,
    prev: Option<(u64, Instant)>,
}

impl Rapl {
    fn open() -> Option<Self> {
        let base = Path::new("/sys/class/powercap/intel-rapl:0");
        let max = fs::read_to_string(base.join("max_energy_range_uj")).ok()?.trim().parse().ok()?;
        let file = File::open(base.join("energy_uj")).ok()?; // root-only unless the udev rule is installed
        Some(Self { file, max, prev: None })
    }

    fn watts(&mut self) -> Option<f32> {
        let now = Instant::now();
        let e = read_num(&mut self.file)? as u64;
        let out = self.prev.and_then(|(pe, pt)| {
            let de = if e >= pe { e - pe } else { e + self.max - pe };
            let dt = now.duration_since(pt).as_secs_f64();
            (dt > 0.05).then(|| (de as f64 / 1e6 / dt) as f32)
        });
        self.prev = Some((e, now));
        out
    }
}

// ---------- NVIDIA via NVML (dlopen'd, no build-time dependency) ----------

type NvmlDev = *mut c_void;
#[repr(C)]
#[derive(Default)]
struct NvUtil {
    gpu: u32,
    mem: u32,
}
#[repr(C)]
#[derive(Default)]
struct NvMem {
    total: u64,
    free: u64,
    used: u64,
}

struct Nvml {
    _lib: libloading::Library,
    dev: NvmlDev,
    util: unsafe extern "C" fn(NvmlDev, *mut NvUtil) -> i32,
    power: unsafe extern "C" fn(NvmlDev, *mut u32) -> i32,
    temp: unsafe extern "C" fn(NvmlDev, u32, *mut u32) -> i32,
    mem: unsafe extern "C" fn(NvmlDev, *mut NvMem) -> i32,
    name: Option<String>,
}

impl Nvml {
    fn open() -> Option<Self> {
        unsafe {
            let lib = libloading::Library::new("libnvidia-ml.so.1").ok()?;
            let init: unsafe extern "C" fn() -> i32 = *lib.get(b"nvmlInit_v2\0").ok()?;
            if init() != 0 {
                return None;
            }
            let by_index: unsafe extern "C" fn(u32, *mut NvmlDev) -> i32 =
                *lib.get(b"nvmlDeviceGetHandleByIndex_v2\0").ok()?;
            let mut dev: NvmlDev = std::ptr::null_mut();
            if by_index(0, &mut dev) != 0 {
                return None;
            }
            let util = *lib.get(b"nvmlDeviceGetUtilizationRates\0").ok()?;
            let power = *lib.get(b"nvmlDeviceGetPowerUsage\0").ok()?;
            let temp = *lib.get(b"nvmlDeviceGetTemperature\0").ok()?;
            let mem = *lib.get(b"nvmlDeviceGetMemoryInfo\0").ok()?;
            let name = lib
                .get::<unsafe extern "C" fn(NvmlDev, *mut u8, u32) -> i32>(b"nvmlDeviceGetName\0")
                .ok()
                .and_then(|f| {
                    let mut b = [0u8; 96];
                    (f(dev, b.as_mut_ptr(), b.len() as u32) == 0).then(|| {
                        let n = b.iter().position(|&c| c == 0).unwrap_or(b.len());
                        String::from_utf8_lossy(&b[..n]).into_owned()
                    })
                });
            Some(Self { _lib: lib, dev, util, power, temp, mem, name })
        }
    }

    fn sample(&self) -> Gpu {
        unsafe {
            let mut u = NvUtil::default();
            let mut p = 0u32;
            let mut t = 0u32;
            let mut m = NvMem::default();
            let gib = 1024.0 * 1024.0 * 1024.0;
            Gpu {
                util: if (self.util)(self.dev, &mut u) == 0 { u.gpu as f32 } else { 0.0 },
                watts: ((self.power)(self.dev, &mut p) == 0).then(|| p as f32 / 1000.0),
                temp: ((self.temp)(self.dev, 0, &mut t) == 0).then(|| t as f32),
                vram: ((self.mem)(self.dev, &mut m) == 0)
                    .then(|| (m.used as f32 / gib, m.total as f32 / gib)),
            }
        }
    }
}

// ---------- AMD dGPU via sysfs (fallback when there is no NVIDIA card) ----------

struct AmdGpu {
    busy: File,
    power: Option<File>,
    temp: Option<File>,
    vram_used: Option<File>,
    vram_total: f32,
}

impl AmdGpu {
    fn open() -> Option<Self> {
        // pick the amdgpu with the most VRAM (dGPU over iGPU)
        let mut best: Option<(u64, PathBuf)> = None;
        for e in fs::read_dir("/sys/class/drm").ok()?.flatten() {
            let n = e.file_name();
            let n = n.to_string_lossy();
            if !n.starts_with("card") || n.contains('-') {
                continue;
            }
            let dev = e.path().join("device");
            if !dev.join("gpu_busy_percent").exists() {
                continue;
            }
            let vt: u64 = fs::read_to_string(dev.join("mem_info_vram_total"))
                .ok()
                .and_then(|s| s.trim().parse().ok())
                .unwrap_or(0);
            if best.as_ref().map_or(true, |(b, _)| vt > *b) {
                best = Some((vt, dev));
            }
        }
        let (vt, dev) = best?;
        let hw = fs::read_dir(dev.join("hwmon")).ok()?.flatten().next().map(|e| e.path());
        let open = |p: Option<PathBuf>| p.and_then(|p| File::open(p).ok());
        Some(Self {
            busy: File::open(dev.join("gpu_busy_percent")).ok()?,
            power: open(hw.as_ref().map(|h| h.join("power1_average")))
                .or_else(|| open(hw.as_ref().map(|h| h.join("power1_input")))),
            temp: open(hw.as_ref().map(|h| h.join("temp1_input"))),
            vram_used: open(Some(dev.join("mem_info_vram_used"))),
            vram_total: vt as f32 / (1024.0 * 1024.0 * 1024.0),
        })
    }

    fn sample(&mut self) -> Gpu {
        Gpu {
            util: read_num(&mut self.busy).unwrap_or(0.0) as f32,
            watts: self.power.as_mut().and_then(read_num).map(|v| (v / 1e6) as f32),
            temp: self.temp.as_mut().and_then(read_num).map(|v| (v / 1000.0) as f32),
            vram: self
                .vram_used
                .as_mut()
                .and_then(read_num)
                .map(|v| ((v / (1024.0 * 1024.0 * 1024.0)) as f32, self.vram_total)),
        }
    }
}

enum GpuSrc {
    Nvidia(Nvml),
    Amd(AmdGpu),
    None,
}

pub struct Sensors {
    stat: File,
    meminfo: File,
    prev_cpu: (u64, u64), // total, idle
    cpu_temp: Option<File>,
    rapl: Option<Rapl>,
    gpu: GpuSrc,
    pub rapl_denied: bool,
    pub cpu_name: String,
    pub gpu_name: String,
}

fn short_cpu_name() -> String {
    let txt = fs::read_to_string("/proc/cpuinfo").unwrap_or_default();
    let raw = txt
        .lines()
        .find_map(|l| l.strip_prefix("model name").and_then(|r| r.split_once(':')).map(|(_, v)| v.trim()))
        .unwrap_or("");
    let raw = raw.split(" @ ").next().unwrap_or(raw);
    raw.split_whitespace()
        .filter(|w| {
            !matches!(*w, "AMD" | "Intel(R)" | "Core(TM)" | "Processor" | "CPU" | "with" | "Radeon" | "Graphics")
                && !w.ends_with("-Core")
        })
        .collect::<Vec<_>>()
        .join(" ")
}

fn short_gpu_name(n: &str) -> String {
    n.trim_start_matches("NVIDIA ").trim_start_matches("GeForce ").trim().to_string()
}

impl Sensors {
    pub fn new() -> std::io::Result<Self> {
        let cpu_temp = find_hwmon(&["k10temp", "zenpower", "coretemp"])
            .and_then(|p| File::open(p.join("temp1_input")).ok());
        let rapl = Rapl::open();
        let rapl_denied = rapl.is_none() && Path::new("/sys/class/powercap/intel-rapl:0").exists();
        let gpu = Nvml::open()
            .map(GpuSrc::Nvidia)
            .or_else(|| AmdGpu::open().map(GpuSrc::Amd))
            .unwrap_or(GpuSrc::None);
        let gpu_name = match &gpu {
            GpuSrc::Nvidia(n) => n.name.as_deref().map(short_gpu_name).unwrap_or_default(),
            GpuSrc::Amd(_) => "Radeon".into(),
            GpuSrc::None => String::new(),
        };
        let mut s = Self {
            cpu_name: short_cpu_name(),
            gpu_name,
            stat: File::open("/proc/stat")?,
            meminfo: File::open("/proc/meminfo")?,
            prev_cpu: (0, 0),
            cpu_temp,
            rapl,
            gpu,
            rapl_denied,
        };
        s.cpu(); // prime deltas
        if let Some(r) = s.rapl.as_mut() {
            r.watts();
        }
        Ok(s)
    }

    fn cpu(&mut self) -> f32 {
        let mut buf = [0u8; 256]; // first line only; /proc/stat is several KB
        let Some(txt) = read_into(&mut self.stat, &mut buf) else { return 0.0 };
        let line = txt.lines().next().unwrap_or("");
        let mut total = 0u64;
        let mut idle = 0u64;
        for (i, v) in line.split_ascii_whitespace().skip(1).take(8).enumerate() {
            let v: u64 = v.parse().unwrap_or(0);
            total += v;
            if i == 3 || i == 4 {
                idle += v; // idle + iowait
            }
        }
        let (pt, pi) = self.prev_cpu;
        self.prev_cpu = (total, idle);
        let dt = total.saturating_sub(pt);
        if dt == 0 {
            return 0.0;
        }
        100.0 * (1.0 - idle.saturating_sub(pi) as f32 / dt as f32)
    }

    fn mem(&mut self) -> (f32, f32) {
        let mut buf = [0u8; 256];
        let Some(txt) = read_into(&mut self.meminfo, &mut buf) else { return (0.0, 0.0) };
        let (mut total, mut avail) = (0f32, 0f32);
        for l in txt.lines().take(3) {
            let mut it = l.split_ascii_whitespace();
            let k = it.next().unwrap_or("");
            let v: f32 = it.next().and_then(|v| v.parse().ok()).unwrap_or(0.0);
            match k {
                "MemTotal:" => total = v,
                "MemAvailable:" => avail = v,
                _ => {}
            }
        }
        let gib = 1024.0 * 1024.0;
        ((total - avail) / gib, total / gib)
    }

    pub fn sample(&mut self) -> Stats {
        Stats {
            cpu: self.cpu().clamp(0.0, 100.0),
            cpu_temp: self.cpu_temp.as_mut().and_then(read_num).map(|v| (v / 1000.0) as f32),
            cpu_watts: self.rapl.as_mut().and_then(Rapl::watts),
            mem: self.mem(),
            gpu: match &mut self.gpu {
                GpuSrc::Nvidia(n) => Some(n.sample()),
                GpuSrc::Amd(a) => Some(a.sample()),
                GpuSrc::None => None,
            },
        }
    }
}
