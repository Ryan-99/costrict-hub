//! 二进制供应链管理:内置资源安装(GitHub 下载兜底)+ sha256 pin/TOFU。
//! pin 表沿用 pi-gui 2026-08-25 从官方 Release 实测的 v0.3.2 全平台哈希。

use serde::Serialize;
use sha2::{Digest, Sha256};
use std::io::Read;
use std::path::{Path, PathBuf};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

use crate::paths;

const GITHUB_REPO: &str = "mokeyjay/costrict-router";
const USER_AGENT: &str = "costrict-hub";

/// 随包分发二进制的实测 sha256(升级二进制时同步更新;(平台键, sha256, 版本))
const BUNDLED_BINARY_SHA256: &[(&str, &str, &str)] =
    &[("windows-x64", "16e92a0af86b30592248fe648ea286d92866a62f4133ac9cd8db5c72064f43a2", "v0.3.2")];

/// 官方发行包 pin(key = tag/资产名)。上游发新版:更新此表,或删条目走 TOFU。
const PINNED_SHA256: &[(&str, &str)] = &[
    ("v0.3.2/costrict-router_v0.3.2_linux_amd64.tar.gz", "afbc426b13ea4a6ee5966031e286ad21a32ce2e74caa87cfd8f41752b21c036b"),
    ("v0.3.2/costrict-router_v0.3.2_linux_arm64.tar.gz", "eaaac4681f9a66480581eb700aba866ff13b580df22dff2c7766d7d3d957e21c"),
    ("v0.3.2/costrict-router_v0.3.2_macos_amd64.tar.gz", "95c97cd359834d129bb7199d790cd62d1e057cbdbb596469bcf7ce9c39b47456"),
    ("v0.3.2/costrict-router_v0.3.2_macos_arm64.tar.gz", "e0beafaab12006c707248998eea8e54ce03df211792c108fa0eb492ac9911c47"),
    ("v0.3.2/costrict-router_v0.3.2_windows_amd64.zip", "a59a4c57afc785508faef77d03fd4816197a9794d94da2785c03419190abf55f"),
    ("v0.3.2/costrict-router_v0.3.2_windows_arm64.zip", "b1d37bc79e8fd8c25cf937dd2082f4f908e70f4f5f455fabee3a6011c4f6ea47"),
];

pub fn sha256_file(path: &Path) -> Result<String, String> {
    let mut f = std::fs::File::open(path).map_err(|e| e.to_string())?;
    let mut hasher = Sha256::new();
    let mut buf = [0u8; 65536];
    loop {
        let n = f.read(&mut buf).map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

/// TOFU 记录(tag/asset -> sha256)
fn load_verified(app: &AppHandle) -> serde_json::Map<String, serde_json::Value> {
    let p = paths::hub_data_dir(app).join("verified-downloads.json");
    std::fs::read_to_string(p)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn save_verified(app: &AppHandle, map: &serde_json::Map<String, serde_json::Value>) {
    let p = paths::hub_data_dir(app).join("verified-downloads.json");
    if let Some(dir) = p.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    let _ = serde_json::to_string_pretty(map).map(|s| std::fs::write(p, s));
}

/// 从内置资源安装到托管目录(复制前校验已知平台的 sha256)
pub fn install_from_resource(app: &AppHandle) -> bool {
    let Some(key) = paths::bundled_platform_key() else { return false };
    // 资源候选路径
    let mut candidates: Vec<PathBuf> = Vec::new();
    let rel = format!("costrict/{key}/{}", paths::ROUTER_BIN_NAME);
    for prefix in ["", "resources/"] {
        if let Ok(p) = app.path().resolve(format!("{prefix}{rel}"), tauri::path::BaseDirectory::Resource) {
            candidates.push(p);
        }
    }
    if cfg!(debug_assertions) {
        if let Ok(manifest) = std::env::var("CARGO_MANIFEST_DIR") {
            candidates.push(PathBuf::from(manifest).join("resources").join(&rel));
        }
    }
    for src in candidates {
        if !src.is_file() {
            continue;
        }
        let mut version: Option<&str> = None;
        if let Some((_, expected, ver)) = BUNDLED_BINARY_SHA256.iter().find(|(k, _, _)| *k == key) {
            match sha256_file(&src) {
                Ok(actual) if actual == *expected => version = Some(ver),
                Ok(actual) => {
                    eprintln!("[costrict-hub] 随包二进制哈希不匹配({key}): {actual} != {expected},拒绝安装");
                    return false;
                }
                Err(e) => {
                    eprintln!("[costrict-hub] 随包二进制读取失败: {e}");
                    return false;
                }
            }
        }
        let target = paths::managed_binary_path(app);
        if let Some(dir) = target.parent() {
            let _ = std::fs::create_dir_all(dir);
        }
        match std::fs::copy(&src, &target) {
            Ok(_) => {
                if let Some(v) = version {
                    record_version(app, v);
                }
                return true;
            }
            Err(_) => return false,
        }
    }
    false
}

/// 安装/下载成功后记录二进制版本(router 自身不提供 version 子命令)
fn record_version(app: &AppHandle, version: &str) {
    let p = paths::hub_data_dir(app).join("binary-version.txt");
    if let Some(dir) = p.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    let _ = std::fs::write(p, version);
}

pub fn recorded_version(app: &AppHandle) -> Option<String> {
    let p = paths::hub_data_dir(app).join("binary-version.txt");
    if let Ok(s) = std::fs::read_to_string(&p) {
        let s = s.trim().to_string();
        if !s.is_empty() {
            return Some(s);
        }
    }
    // 没有版本记录(旧安装/直接用内置资源):按实际二进制哈希回查内置 pin 表补齐
    let bin = paths::resolve_router_binary(app)?;
    let sha = sha256_file(&bin).ok()?;
    for (key, expected, ver) in BUNDLED_BINARY_SHA256 {
        if *key == paths::bundled_platform_key().unwrap_or_default() && sha == *expected {
            record_version(app, ver);
            return Some(ver.to_string());
        }
    }
    None
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BinaryInfo {
    pub path: Option<String>,
    pub version: Option<String>,
    pub sha256: Option<String>,
    pub managed: bool,
}

pub fn binary_info(app: &AppHandle) -> BinaryInfo {
    match paths::resolve_router_binary(app) {
        Some(p) => {
            let managed = p == paths::managed_binary_path(app);
            BinaryInfo {
                path: Some(p.to_string_lossy().into_owned()),
                version: recorded_version(app),
                sha256: sha256_file(&p).ok(),
                managed,
            }
        }
        None => BinaryInfo { path: None, version: None, sha256: None, managed: false },
    }
}

fn platform_asset_suffix() -> Option<(&'static str, &'static str)> {
    let os = match std::env::consts::OS {
        "windows" => "windows",
        "macos" => "macos",
        "linux" => "linux",
        _ => return None,
    };
    let arch = match std::env::consts::ARCH {
        "x86_64" => "amd64",
        "aarch64" => "arm64",
        _ => return None,
    };
    Some((os, arch))
}

fn client() -> reqwest::Client {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(300))
        .build()
        .expect("download client")
}

fn emit_progress(app: &AppHandle, message: &str) {
    let _ = app.emit("hub:download", serde_json::json!({ "message": message }));
}

/// 从 GitHub 最新 Release 下载并安装到托管目录
pub async fn download_latest(app: AppHandle) -> Result<String, String> {
    let Some((os, arch)) = platform_asset_suffix() else {
        return Err("不支持的平台".into());
    };
    emit_progress(&app, "查询最新版本…");
    let rel: serde_json::Value = client()
        .get(format!("https://api.github.com/repos/{GITHUB_REPO}/releases/latest"))
        .header("User-Agent", USER_AGENT)
        .send()
        .await
        .map_err(|e| format!("查询 Release 失败(检查网络/代理): {e}"))?
        .json()
        .await
        .map_err(|e| e.to_string())?;
    let tag = rel.get("tag_name").and_then(|t| t.as_str()).unwrap_or_default().to_string();
    let assets = rel.get("assets").and_then(|a| a.as_array()).cloned().unwrap_or_default();
    let suffix = if os == "windows" { ".zip" } else { ".tar.gz" };
    let want = format!("_{os}_{arch}{suffix}");
    let asset = assets
        .iter()
        .filter_map(|a| {
            let name = a.get("name").and_then(|n| n.as_str())?;
            let url = a.get("browser_download_url").and_then(|u| u.as_str())?;
            Some((name.to_string(), url.to_string()))
        })
        .find(|(name, _)| name.ends_with(&want));
    let Some((asset_name, asset_url)) = asset else {
        return Err(format!("没有适配当前平台的发行包 ({os}/{arch})"));
    };
    // 资产名来自 GitHub API,压成纯文件名并做字符白名单,防路径注入(沿用 pi-gui CS-2)
    let safe_name = Path::new(&asset_name)
        .file_name()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_default();
    if !safe_name.chars().all(|c| c.is_ascii_alphanumeric() || "._-".contains(c)) {
        return Err(format!("异常的发行包文件名: {asset_name}"));
    }
    emit_progress(&app, &format!("下载 {safe_name}…"));
    let bytes = client()
        .get(&asset_url)
        .header("User-Agent", USER_AGENT)
        .send()
        .await
        .map_err(|e| format!("下载失败: {e}"))?
        .error_for_status()
        .map_err(|e| format!("下载失败: {e}"))?
        .bytes()
        .await
        .map_err(|e| format!("下载失败: {e}"))?;

    // 供应链校验:有 pin 用 pin;无 pin 走 TOFU(首次记录,之后内容变更即拒绝)
    let digest = format!("{:x}", Sha256::digest(&bytes));
    let digest_key = format!("{tag}/{safe_name}");
    let pinned = PINNED_SHA256.iter().find(|(k, _)| *k == digest_key).map(|(_, v)| *v);
    let mut verified = load_verified(&app);
    let known = verified.get(&digest_key).and_then(|v| v.as_str()).map(String::from);
    let expected = pinned.map(String::from).or(known);
    if let Some(expected) = &expected {
        if *expected != digest {
            return Err(format!(
                "下载内容校验失败:{digest_key} sha256 {}… 与已记录 {}… 不一致,疑似发布资产被替换,已拒绝安装",
                &digest[..12],
                &expected[..12]
            ));
        }
    } else {
        emit_progress(&app, &format!("首次下载 {digest_key},记录 sha256={}", &digest[..12]));
        verified.insert(digest_key.clone(), serde_json::Value::String(digest.clone()));
        save_verified(&app, &verified);
    }

    // 落盘归档并解压到临时目录
    let data_dir = paths::hub_data_dir(&app);
    std::fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;
    let archive_path = data_dir.join(&safe_name);
    std::fs::write(&archive_path, &bytes).map_err(|e| e.to_string())?;
    let extract_dir = data_dir.join(format!("extract-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&extract_dir);
    std::fs::create_dir_all(&extract_dir).map_err(|e| e.to_string())?;
    let bin_name = paths::ROUTER_BIN_NAME;
    if safe_name.ends_with(".zip") {
        extract_zip(&archive_path, &extract_dir, bin_name)?;
    } else {
        extract_targz(&archive_path, &extract_dir, bin_name)?;
    }
    let extracted = find_file_recursive(&extract_dir, bin_name).ok_or("解压后未找到二进制")?;
    let target = paths::managed_binary_path(&app);
    std::fs::rename(&extracted, &target)
        .or_else(|_| std::fs::copy(&extracted, &target).map(|_| ()))
        .map_err(|e| e.to_string())?;
    record_version(&app, &tag);
    let _ = std::fs::remove_dir_all(&extract_dir);
    let _ = std::fs::remove_file(&archive_path);
    emit_progress(&app, "安装完成");
    Ok(target.to_string_lossy().into_owned())
}

fn extract_zip(archive: &Path, dir: &Path, wanted: &str) -> Result<(), String> {
    let f = std::fs::File::open(archive).map_err(|e| e.to_string())?;
    let mut zip = zip::ZipArchive::new(f).map_err(|e| e.to_string())?;
    for i in 0..zip.len() {
        let mut entry = zip.by_index(i).map_err(|e| e.to_string())?;
        let name = entry.name().to_string();
        if name.ends_with(wanted) && entry.is_file() {
            let out = dir.join(wanted);
            let mut w = std::fs::File::create(&out).map_err(|e| e.to_string())?;
            std::io::copy(&mut entry, &mut w).map_err(|e| e.to_string())?;
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                if let Some(mode) = entry.unix_mode() {
                    let _ = std::fs::set_permissions(&out, std::fs::Permissions::from_mode(mode | 0o755));
                }
            }
            return Ok(());
        }
    }
    Err(format!("压缩包内未找到 {wanted}"))
}

fn extract_targz(archive: &Path, dir: &Path, wanted: &str) -> Result<(), String> {
    let f = std::fs::File::open(archive).map_err(|e| e.to_string())?;
    let gz = flate2::read::GzDecoder::new(f);
    let mut tar = tar::Archive::new(gz);
    tar.unpack(dir).map_err(|e| e.to_string())?;
    find_file_recursive(dir, wanted)
        .map(|_| ())
        .ok_or_else(|| format!("压缩包内未找到 {wanted}"))
}

fn find_file_recursive(dir: &Path, name: &str) -> Option<PathBuf> {
    let entries = std::fs::read_dir(dir).ok()?;
    for e in entries.flatten() {
        let p = e.path();
        if p.is_file() && p.file_name().map(|n| n.to_string_lossy() == name).unwrap_or(false) {
            return Some(p);
        }
        if p.is_dir() {
            if let Some(found) = find_file_recursive(&p, name) {
                return Some(found);
            }
        }
    }
    None
}
