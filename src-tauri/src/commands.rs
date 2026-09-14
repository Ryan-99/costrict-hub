//! Tauri command 层:前端 invoke 的全部入口。

use serde::Serialize;
use tauri::{AppHandle, Manager, State};

use crate::binmgmt;
use crate::quota;
use crate::router_proc;
use crate::state::{self, AppState, Settings};
use crate::usage;

#[tauri::command]
pub async fn get_status(app: AppHandle) -> router_proc::StatusInfo {
    router_proc::status_info(&app).await
}

#[tauri::command]
pub async fn start_login(app: AppHandle, base_url: String) -> Result<(), String> {
    // 防重复登录:上一次流程还在跑时拒绝
    let slot = app.state::<AppState>().login_child.clone();
    if slot.try_lock().is_err() {
        return Err("已有登录流程进行中".into());
    }
    tauri::async_runtime::spawn(router_proc::login_flow(app, base_url));
    Ok(())
}

#[tauri::command]
pub async fn cancel_login(app: AppHandle) {
    router_proc::cancel_login(app).await;
}

#[tauri::command]
pub async fn start_service(app: AppHandle) -> Result<router_proc::StartOutcome, String> {
    router_proc::start_service(app).await
}

#[tauri::command]
pub async fn stop_service(app: AppHandle) -> Result<(), String> {
    router_proc::stop_service(app).await
}

#[tauri::command]
pub async fn restart_service(app: AppHandle) -> Result<router_proc::StartOutcome, String> {
    router_proc::restart_service(app).await
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyInfo {
    pub key: Option<String>,
    pub from_fallback: bool,
}

#[tauri::command]
pub fn get_key(app: AppHandle) -> KeyInfo {
    let (key, from_fallback) = state::read_local_key(&app);
    KeyInfo { key, from_fallback }
}

/// 清除本地保存的 key(不重置 router 侧;配合 key reset 使用)
#[tauri::command]
pub fn clear_key(app: AppHandle) {
    state::clear_local_key(&app);
    router_proc::emit_status(&app);
}

/// 重新签发一次性 key(旧 key 立即失效,已配置的其他工具会 401)
#[tauri::command]
pub async fn reset_key(app: AppHandle) -> Result<Option<String>, String> {
    router_proc::key_reset(app).await
}

#[tauri::command]
pub async fn get_quota(app: AppHandle) -> quota::QuotaSnapshot {
    quota::quota_now(app).await
}

#[tauri::command]
pub async fn get_models(app: AppHandle) -> Result<Vec<quota::ModelInfo>, String> {
    quota::load_models(&app).await
}

#[tauri::command]
pub async fn get_usage(app: AppHandle, days: Option<u32>) -> usage::UsageReport {
    let days = days.unwrap_or(7).clamp(1, 90);
    usage::build_report(usage::collect_records(&app, days))
}

#[tauri::command]
pub fn get_settings(app: AppHandle, settings: State<AppState>) -> Settings {
    let _ = app;
    settings.settings.lock().unwrap().clone()
}

#[tauri::command]
pub async fn save_settings(app: AppHandle, settings: Settings) -> Result<Settings, String> {
    if !crate::parse::is_allowed_costrict_url(&settings.upstream_base_url) {
        return Err(format!("不允许的服务地址: {}(仅信任 *.sangfor.com)", settings.upstream_base_url));
    }
    if settings.port < 1024 {
        return Err("端口需在 1024-65535 之间".into());
    }
    state::save_settings(&app, &settings)?;
    {
        let st = app.state::<AppState>();
        *st.settings.lock().unwrap() = settings.clone();
    }
    router_proc::emit_status(&app);
    Ok(settings)
}

/// router 自带的 Codex 接入:自动写 ~/.codex/config.toml(实际改动由 router 完成)
#[tauri::command]
pub async fn codex_catalog(app: AppHandle) -> Result<String, String> {
    let bin = router_proc::ensure_binary(&app)?;
    let (_code, output) = router_proc::run_capture(&bin, &["codex-catalog"], std::time::Duration::from_secs(60)).await?;
    Ok(output)
}

/// router 自带连通自检:真实发送一条消息(消耗 Credit,UI 需确认)
#[tauri::command]
pub async fn test_model(app: AppHandle, model: String) -> Result<String, String> {
    let bin = router_proc::ensure_binary(&app)?;
    let (_code, output) = router_proc::run_capture(
        &bin,
        &["test", "--model", &model],
        std::time::Duration::from_secs(120),
    )
    .await?;
    Ok(output)
}

#[tauri::command]
pub fn get_binary_info(app: AppHandle) -> binmgmt::BinaryInfo {
    binmgmt::binary_info(&app)
}

#[tauri::command]
pub async fn download_binary(app: AppHandle) -> Result<String, String> {
    binmgmt::download_latest(app).await
}

/// 白名单式打开目录/文件(只允许 hub 与 router 相关路径,不给任意路径开洞)
#[tauri::command]
pub fn open_app_path(app: AppHandle, kind: String) -> Result<(), String> {
    let path = match kind.as_str() {
        "hub-data" => crate::paths::hub_data_dir(&app),
        "hub-log" => crate::paths::hub_router_log(&app),
        "router-config" => crate::paths::router_config_path().ok_or("无法定位 router 配置")?,
        "router-log" => {
            let mut candidates = vec![crate::paths::hub_router_log(&app)];
            candidates.extend(crate::paths::router_default_logs());
            candidates
                .into_iter()
                .find(|p| p.is_file())
                .ok_or("未找到日志文件")?
        }
        _ => return Err("未知路径类型".into()),
    };
    // 目录直接打开;文件打开所在目录并选中
    tauri_plugin_opener::open_path(path.clone(), None::<&str>).map_err(|e| e.to_string())
}
