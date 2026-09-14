//! 路径解析:hub 自身数据目录、router 二进制(内置/托管/下载)、router 全局配置与日志。
//! router 的配置目录与日志位置是它自己的约定,与 pi-gui 共享同一份登录态。

use std::path::PathBuf;
use tauri::{AppHandle, Manager};

pub const ROUTER_BIN_NAME: &str = if cfg!(windows) {
    "costrict-router.exe"
} else {
    "costrict-router"
};

/// 内置资源目录的平台键(resources/costrict/<key>/)
pub fn bundled_platform_key() -> Option<&'static str> {
    match (std::env::consts::OS, std::env::consts::ARCH) {
        ("windows", "x86_64") => Some("windows-x64"),
        ("windows", "aarch64") => Some("windows-arm64"),
        ("macos", "x86_64") => Some("macos-x64"),
        ("macos", "aarch64") => Some("macos-arm64"),
        ("linux", "x86_64") => Some("linux-x64"),
        ("linux", "aarch64") => Some("linux-arm64"),
        _ => None,
    }
}

/// hub 应用数据目录(设置、托管二进制、router 日志/pid)
pub fn hub_data_dir(app: &AppHandle) -> PathBuf {
    app.path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
}

pub fn settings_file(app: &AppHandle) -> PathBuf {
    hub_data_dir(app).join("settings.json")
}

/// hub 托管的 router 二进制(install 后落在这里,和 pi-gui 的 userData/costrict 同思路)
pub fn managed_binary_path(app: &AppHandle) -> PathBuf {
    hub_data_dir(app).join(ROUTER_BIN_NAME)
}

/// hub 启动 router 时指定的日志与 pid(router 自身默认位置在系统缓存目录,不便统计)
pub fn hub_router_log(app: &AppHandle) -> PathBuf {
    hub_data_dir(app).join("router.log")
}

pub fn hub_router_pid(app: &AppHandle) -> PathBuf {
    hub_data_dir(app).join("router.pid")
}

/// router 全局配置(登录态所在)。尊重它自己的 COSTRICT_ROUTER_CONFIG 覆盖。
pub fn router_config_path() -> Option<PathBuf> {
    if let Ok(p) = std::env::var("COSTRICT_ROUTER_CONFIG") {
        if !p.is_empty() {
            return Some(PathBuf::from(p));
        }
    }
    dirs::config_dir().map(|d| d.join("costrict-router").join("config.json"))
}

/// router 默认日志位置(服务不是 hub 拉起时在这里;含滚动备份)
pub fn router_default_logs() -> Vec<PathBuf> {
    let Some(base) = dirs::data_local_dir().map(|d| d.join("costrict-router").join("costrict-router.log")) else {
        return Vec::new();
    };
    vec![
        base.clone(),
        sibling(&base, "1"),
        sibling(&base, "2"),
        sibling(&base, "3"),
    ]
}

fn sibling(base: &PathBuf, n: &str) -> PathBuf {
    let s = base.to_string_lossy().to_string();
    PathBuf::from(format!("{s}.{n}"))
}

/// 内置二进制在打包产物里的候选路径(Resource 目录,不同打包器前缀略有差异)
fn resource_candidates(app: &AppHandle) -> Vec<PathBuf> {
    let mut out = Vec::new();
    let Some(key) = bundled_platform_key() else {
        return out;
    };
    let rel = format!("costrict/{key}/{ROUTER_BIN_NAME}");
    for prefix in ["", "resources/"] {
        if let Ok(p) = app.path().resolve(format!("{prefix}{rel}"), tauri::path::BaseDirectory::Resource) {
            out.push(p);
        }
    }
    // dev 兜底:直接找源码树里的 resources(cargo test / 无 tauri 上下文时)
    if cfg!(debug_assertions) {
        if let Ok(manifest) = std::env::var("CARGO_MANIFEST_DIR") {
            out.push(PathBuf::from(manifest)
                .join("resources/costrict")
                .join(bundled_platform_key().unwrap_or_default())
                .join(ROUTER_BIN_NAME));
        }
    }
    out
}

/// 解析可用的 router 二进制:环境变量覆盖 → 已托管 → 内置资源(dev 源码树兜底)
pub fn resolve_router_binary(app: &AppHandle) -> Option<PathBuf> {
    if let Ok(p) = std::env::var("COSTRICT_HUB_ROUTER_BIN") {
        if !p.is_empty() && std::path::Path::new(&p).is_file() {
            return Some(PathBuf::from(p));
        }
    }
    let managed = managed_binary_path(app);
    if managed.is_file() {
        return Some(managed);
    }
    for c in resource_candidates(app) {
        if c.is_file() {
            return Some(c);
        }
    }
    None
}
