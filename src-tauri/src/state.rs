//! hub 自身状态:设置持久化 + 本地 API Key 存取(keyring 优先,失败降级文件)。
//! sk-costrict key 只在 router start 首次输出一次,丢失只能 key reset——
//! 存储层必须可靠,写盘用 tmp+rename 原子替换(沿用 pi-gui B-11 教训)。

use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::AppHandle;

use crate::paths;

pub const DEFAULT_BASE_URL: &str = "https://zgsm.sangfor.com";
pub const DEFAULT_PORT: u16 = 14567;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Settings {
    /// CoStrict 服务地址(登录时传给 router --base-url;企业内网可改)
    pub upstream_base_url: String,
    /// 本地代理端口
    pub port: u16,
    /// 默认模型(接入页/仪表盘共用,供 agent 配置片段代入)
    pub default_model: String,
    /// 应用启动时自动拉起 router 服务(已登录但服务未跑时)
    pub autostart_service: bool,
    /// 退出应用时停止 router 服务
    pub stop_service_on_exit: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            upstream_base_url: DEFAULT_BASE_URL.to_string(),
            port: DEFAULT_PORT,
            default_model: "Auto".to_string(),
            autostart_service: true,
            stop_service_on_exit: true,
        }
    }
}

pub fn load_settings(app: &AppHandle) -> Settings {
    let path = paths::settings_file(app);
    let Ok(raw) = std::fs::read_to_string(&path) else {
        return Settings::default();
    };
    match serde_json::from_str(&raw) {
        Ok(s) => s,
        Err(_) => {
            // 损坏设置不致命,备份后回默认值
            let bak = path.with_extension(format!("json.corrupt-{}.bak", chrono::Utc::now().timestamp()));
            let _ = std::fs::rename(&path, bak);
            Settings::default()
        }
    }
}

pub fn save_settings(app: &AppHandle, settings: &Settings) -> Result<(), String> {
    let path = paths::settings_file(app);
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let tmp = path.with_extension(format!("json.{}.tmp", std::process::id()));
    std::fs::write(&tmp, serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    // Windows 占用退路:目标被占时先删再换名
    if std::fs::rename(&tmp, &path).is_err() {
        let _ = std::fs::remove_file(&path);
        std::fs::rename(&tmp, &path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

// ---------- 本地 API Key 存取 ----------

const KEYRING_SERVICE: &str = "com.costrict.hub";
const KEYRING_USER: &str = "costrict-local-api-key";

fn key_fallback_file(app: &AppHandle) -> PathBuf {
    paths::hub_data_dir(app).join("local-api-key.txt")
}

/// 读 key:先 keyring,再降级文件。返回 (key, 是否来自降级文件)
pub fn read_local_key(app: &AppHandle) -> (Option<String>, bool) {
    if let Ok(entry) = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER) {
        match entry.get_password() {
            Ok(k) if !k.is_empty() => return (Some(k), false),
            // 凭据不存在或读不出来,继续尝试降级文件
            _ => {}
        }
    }
    if let Ok(k) = std::fs::read_to_string(key_fallback_file(app)) {
        let k = k.trim().to_string();
        if !k.is_empty() {
            return (Some(k), true);
        }
    }
    (None, false)
}

pub fn write_local_key(app: &AppHandle, key: &str) -> Result<(), String> {
    if let Ok(entry) = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER) {
        match entry.set_password(key) {
            Ok(()) => {
                // keyring 成功后清掉可能残留的降级文件
                let _ = std::fs::remove_file(key_fallback_file(app));
                return Ok(());
            }
            Err(e) => eprintln!("[costrict-hub] keyring 写入失败,降级文件存储: {e}"),
        }
    }
    let path = key_fallback_file(app);
    if let Some(dir) = path.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    std::fs::write(&path, key).map_err(|e| e.to_string())
}

pub fn clear_local_key(app: &AppHandle) {
    if let Ok(entry) = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER) {
        let _ = entry.delete_credential();
    }
    let _ = std::fs::remove_file(key_fallback_file(app));
}

// ---------- 全局运行态 ----------

use std::sync::atomic::AtomicBool;
use std::sync::Arc;

/// 登录子进程句柄(供 cancel) + 取消标记 + 防并发启动锁
pub struct AppState {
    pub settings: Mutex<Settings>,
    pub login_child: Arc<std::sync::Mutex<Option<std::process::Child>>>,
    pub login_cancelled: Arc<AtomicBool>,
    pub service_lock: Arc<tokio::sync::Mutex<()>>,
}
