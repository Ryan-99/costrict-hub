//! router 二进制编排:进程管理 / 登录流程 / key 捕获 / 启动自愈。
//! 逻辑参照 pi-gui costrict-service.ts(已验证的正则与健康检查节奏),重写为 tokio 版。
//!
//! router 的 start 是守护化命令(父进程退出后服务仍在),因此:
//! - start 用 `--debug --log-file <hub>/router.log --pid-file <hub>/router.pid` 固定日志与 pid 位置
//! - restart 一律 stop + start(带上我们的 flag),不依赖 router 自身 restart 的隐式行为

use serde::Serialize;
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::AsyncReadExt;

use crate::parse;
use crate::paths;
use crate::state::{self, AppState};

pub const LOGIN_TIMEOUT_SECS: u64 = 300;

/// 本地回环探测必须绕开系统代理(等价于 pi-gui 里"回环用原生 fetch"的坑)
fn local_client() -> reqwest::Client {
    reqwest::Client::builder()
        .no_proxy()
        .timeout(Duration::from_secs(3))
        .build()
        .expect("local client")
}

pub fn local_endpoint(port: u16) -> String {
    format!("http://127.0.0.1:{port}/v1")
}

fn spawn_cmd(bin: &std::path::Path, args: &[&str]) -> tokio::process::Command {
    let mut cmd = tokio::process::Command::new(bin);
    cmd.args(args)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());
    #[cfg(windows)]
    cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW,避免控制台闪窗
    cmd
}

/// 运行子进程到退出,合并收集 stdout+stderr
pub async fn run_capture(bin: &std::path::Path, args: &[&str], timeout: Duration) -> Result<(i32, String), String> {
    run_capture_inner(bin, args, timeout).await
}

async fn run_capture_inner(bin: &std::path::Path, args: &[&str], timeout: Duration) -> Result<(i32, String), String> {
    let mut child = spawn_cmd(bin, args)
        .spawn()
        .map_err(|e| format!("启动子进程失败: {e}"))?;
    let mut stdout = child.stdout.take().expect("stdout");
    let mut stderr = child.stderr.take().expect("stderr");
    let out_task = tokio::spawn(async move {
        let mut buf = Vec::new();
        let _ = stdout.read_to_end(&mut buf);
        buf
    });
    let err_task = tokio::spawn(async move {
        let mut buf = Vec::new();
        let _ = stderr.read_to_end(&mut buf);
        buf
    });
    let wait = tokio::time::timeout(timeout, child.wait());
    let status = wait.await.map_err(|_| "子进程执行超时".to_string())?.map_err(|e| e.to_string())?;
    let mut output = String::from_utf8_lossy(&out_task.await.unwrap_or_default()).into_owned();
    output.push('\n');
    output.push_str(&String::from_utf8_lossy(&err_task.await.unwrap_or_default()));
    Ok((status.code().unwrap_or(-1), output))
}

// ---------- router 全局配置(登录态) ----------

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RouterConfig {
    pub base_url: Option<String>,
    pub access_token: Option<String>,
    pub refresh_token: Option<String>,
    pub user_id: Option<String>,
}

pub fn read_router_config() -> Option<RouterConfig> {
    let path = paths::router_config_path()?;
    let raw = std::fs::read_to_string(path).ok()?;
    let v: serde_json::Value = serde_json::from_str(&raw).ok()?;
    Some(RouterConfig {
        base_url: v.get("base_url").and_then(|x| x.as_str()).map(String::from),
        access_token: v.get("access_token").and_then(|x| x.as_str()).map(String::from),
        refresh_token: v.get("refresh_token").and_then(|x| x.as_str()).map(String::from),
        user_id: v.get("user_id").and_then(|x| x.as_str()).map(String::from),
    })
}

pub fn is_logged_in() -> bool {
    read_router_config()
        .map(|c| {
            c.access_token.as_deref().unwrap_or_default().len() > 20
                && c.refresh_token.as_deref().unwrap_or_default().len() > 10
        })
        .unwrap_or(false)
}

// ---------- 健康检查 ----------

pub async fn is_service_running(port: u16) -> bool {
    let url = format!("http://127.0.0.1:{port}/healthz");
    matches!(
        local_client().get(&url).send().await,
        Ok(r) if r.status().is_success()
    )
}

pub async fn wait_healthy(port: u16, timeout_ms: u64) -> bool {
    let deadline = tokio::time::Instant::now() + Duration::from_millis(timeout_ms);
    while tokio::time::Instant::now() < deadline {
        if is_service_running(port).await {
            return true;
        }
        tokio::time::sleep(Duration::from_millis(500)).await;
    }
    false
}

// ---------- 状态快照与事件 ----------

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StatusInfo {
    pub binary_present: bool,
    pub binary_version: Option<String>,
    pub service_running: bool,
    pub service_external: bool,
    pub logged_in: bool,
    pub upstream_base_url: Option<String>,
    pub configured_base_url: String,
    pub key_present: bool,
    pub key_from_fallback: bool,
    pub local_endpoint: String,
}

pub async fn status_info(app: &AppHandle) -> StatusInfo {
    let settings = app.state::<AppState>().settings.lock().unwrap().clone();
    let running = is_service_running(settings.port).await;
    let pid_file = paths::hub_router_pid(app);
    let service_external = running && !pid_file.is_file();
    let binary = paths::resolve_router_binary(app);
    let (key, from_fallback) = state::read_local_key(app);
    StatusInfo {
        binary_present: binary.is_some(),
        binary_version: crate::binmgmt::recorded_version(app),
        service_running: running,
        service_external,
        logged_in: is_logged_in(),
        upstream_base_url: read_router_config().and_then(|c| c.base_url),
        configured_base_url: settings.upstream_base_url,
        key_present: key.is_some(),
        key_from_fallback: from_fallback,
        local_endpoint: local_endpoint(settings.port),
    }
}

pub fn emit_status(app: &AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let info = status_info(&app).await;
        let _ = app.emit("hub:status", &info);
    });
}

// ---------- 二进制保障 ----------

/// 确保有可用二进制:解析失败时尝试从内置资源安装(带 sha256 校验)
pub fn ensure_binary(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    if let Some(p) = paths::resolve_router_binary(app) {
        return Ok(p);
    }
    if crate::binmgmt::install_from_resource(app) {
        if let Some(p) = paths::resolve_router_binary(app) {
            return Ok(p);
        }
    }
    Err("未找到 costrict-router 二进制,请在设置页下载安装".into())
}

// ---------- 服务启停 ----------

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StartOutcome {
    pub already_running: bool,
    pub healthy: bool,
    pub new_key: Option<String>,
}

async fn start_locked(app: &AppHandle) -> Result<StartOutcome, String> {
    let (bin, port) = {
        let st = app.state::<AppState>();
        let port = st.settings.lock().unwrap().port;
        (ensure_binary(app)?, port)
    };
    if is_service_running(port).await {
        return Ok(StartOutcome { already_running: true, healthy: true, new_key: None });
    }
    let log_file = paths::hub_router_log(app);
    let pid_file = paths::hub_router_pid(app);
    let log_str = log_file.to_string_lossy().into_owned();
    let pid_str = pid_file.to_string_lossy().into_owned();
    let port_str = port.to_string();
    let (_code, output) = run_capture(
        &bin,
        &[
            "start",
            "--addr",
            &format!("127.0.0.1:{port_str}"),
            "--debug", // 记录 chat metrics,统计页依赖
            "--log-file",
            &log_str,
            "--pid-file",
            &pid_str,
        ],
        Duration::from_secs(60),
    )
    .await?;

    // 一次性 key 只在首次 start 输出,必须当场捕获
    let new_key = parse::extract_api_key(&output);
    if let Some(k) = &new_key {
        state::write_local_key(app, k)?;
    }
    let healthy = wait_healthy(port, 15_000).await;
    if !healthy {
        let tail: String = output.lines().rev().take(8).collect::<Vec<_>>().into_iter().rev().collect::<Vec<_>>().join("\n");
        return Err(format!("服务启动后健康检查未通过。输出末尾:\n{tail}"));
    }
    Ok(StartOutcome { already_running: false, healthy, new_key })
}

/// 对外入口:串行化启动,避免并发双起
pub async fn start_service(app: AppHandle) -> Result<StartOutcome, String> {
    let lock = app.state::<AppState>().service_lock.clone();
    let _guard = lock.lock().await;
    let r = start_locked(&app).await;
    emit_status(&app);
    r
}

pub async fn stop_service(app: AppHandle) -> Result<(), String> {
    let lock = app.state::<AppState>().service_lock.clone();
    let _guard = lock.lock().await;
    let (bin, port) = {
        let st = app.state::<AppState>();
        let port = st.settings.lock().unwrap().port;
        (ensure_binary(&app)?, port)
    };
    // 先按 hub 的 pid 文件停,再补一次默认 stop(覆盖外部/pigui 拉起的情况)
    let pid_str = paths::hub_router_pid(&app).to_string_lossy().into_owned();
    let _ = run_capture(&bin, &["stop", "--pid-file", &pid_str], Duration::from_secs(15)).await;
    let _ = run_capture(&bin, &["stop"], Duration::from_secs(15)).await;
    // 确认端口已释放
    let _ = tokio::time::timeout(Duration::from_secs(5), async {
        while is_service_running(port).await {
            tokio::time::sleep(Duration::from_millis(300)).await;
        }
    })
    .await;
    emit_status(&app);
    Ok(())
}

pub async fn restart_service(app: AppHandle) -> Result<StartOutcome, String> {
    stop_service(app.clone()).await?;
    start_service(app).await
}

/// 重新签发一次性本地 key(会使其他工具里配置的旧 key 失效,UI 需确认)
pub async fn key_reset(app: AppHandle) -> Result<Option<String>, String> {
    let bin = ensure_binary(&app)?;
    let (_code, output) = run_capture(&bin, &["key", "reset"], Duration::from_secs(30)).await?;
    let new_key = parse::extract_api_key(&output);
    if new_key.is_none() {
        return Err(format!("key reset 未输出新 key。输出:\n{output}"));
    }
    state::write_local_key(&app, new_key.as_deref().unwrap())?;
    // key reset 后需要重启服务新 key 才生效
    restart_service(app.clone()).await?;
    emit_status(&app);
    Ok(new_key)
}

// ---------- 登录流程 ----------

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoginEvent {
    pub stage: String, // starting | url | waiting | starting-service | done | error | cancelled
    pub message: Option<String>,
    pub url: Option<String>,
    pub api_key: Option<String>,
}

fn emit_login(app: &AppHandle, stage: &str, message: Option<String>, url: Option<&str>, api_key: Option<&str>) {
    let _ = app.emit(
        "hub:login",
        LoginEvent {
            stage: stage.into(),
            message,
            url: url.map(String::from),
            api_key: api_key.map(String::from),
        },
    );
}

pub async fn login_flow(app: AppHandle, base_url: String) {
    use std::sync::atomic::Ordering;

    if !parse::is_allowed_costrict_url(&base_url) {
        emit_login(
            &app,
            "error",
            Some(format!("不允许的服务地址: {base_url}(仅信任 *.sangfor.com)")),
            None,
            None,
        );
        return;
    }
    let bin = match ensure_binary(&app) {
        Ok(b) => b,
        Err(e) => {
            emit_login(&app, "error", Some(e), None, None);
            return;
        }
    };
    {
        let st = app.state::<AppState>();
        st.login_cancelled.store(false, Ordering::SeqCst);
    }
    emit_login(&app, "starting", Some("正在生成登录链接…".into()), None, None);

    let mut child = match spawn_cmd(&bin, &["login", "--base-url", &base_url]).spawn() {
        Ok(c) => c,
        Err(e) => {
            emit_login(&app, "error", Some(format!("启动登录进程失败: {e}")), None, None);
            return;
        }
    };
    let mut stdout = child.stdout.take().expect("login stdout");
    let mut stderr = child.stderr.take().expect("login stderr");
    // child 句柄放进共享槽,cancel_login 可从另一侧杀掉它
    let slot = app.state::<AppState>().login_child.clone();
    *slot.lock().await = Some(child);

    let shared: Arc<std::sync::Mutex<String>> = Arc::new(std::sync::Mutex::new(String::new()));
    let shared_out = shared.clone();
    let app_out = app.clone();
    let out_task = tokio::spawn(async move {
        let mut buf = [0u8; 4096];
        loop {
            match stdout.read(&mut buf).await {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    let chunk = String::from_utf8_lossy(&buf[..n]);
                    let mut acc = shared_out.lock().unwrap();
                    acc.push_str(&chunk);
                    if let Some(url) = parse::extract_login_url(&acc) {
                        let _ = tauri_plugin_opener::open_url(url.clone(), None::<&str>);
                        emit_login(&app_out, "url", Some("已打开浏览器,请在页面完成 SSO 登录".into()), Some(&url), None);
                    }
                }
            }
        }
    });
    let shared_err = shared.clone();
    let err_task = tokio::spawn(async move {
        let mut buf = [0u8; 4096];
        loop {
            match stderr.read(&mut buf).await {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    shared_err.lock().unwrap().push_str(&String::from_utf8_lossy(&buf[..n]));
                }
            }
        }
    });

    // 持有槽锁等待退出;超时或取消时杀进程
    let wait_result = {
        let mut guard = slot.lock().await;
        match tokio::time::timeout(Duration::from_secs(LOGIN_TIMEOUT_SECS), async {
            if let Some(c) = guard.as_mut() {
                c.wait().await
            } else {
                unreachable!("login child 已放入槽位")
            }
        })
        .await
        {
            Ok(Ok(status)) => Ok(Some(status)),
            Ok(Err(e)) => Err(format!("登录进程异常退出: {e}")),
            Err(_) => {
                if let Some(c) = guard.as_mut() {
                    let _ = c.kill().await;
                }
                Err("__timeout__".into())
            }
        }
    };
    // 释放槽位
    *slot.lock().await = None;
    let _ = out_task.await;
    let _ = err_task.await;

    let cancelled = app.state::<AppState>().login_cancelled.load(Ordering::SeqCst);
    match wait_result {
        Err(e) if e == "__timeout__" => {
            emit_login(&app, "error", Some("登录超时(5 分钟),已取消。可重试".into()), None, None);
            return;
        }
        Err(e) => {
            emit_login(&app, "error", Some(e), None, None);
            return;
        }
        Ok(None) => {
            emit_login(&app, "error", Some("登录进程意外退出".into()), None, None);
            return;
        }
        Ok(Some(status)) => {
            if cancelled {
                emit_login(&app, "cancelled", Some("已取消登录".into()), None, None);
                return;
            }
            if !status.success() {
                let output = shared.lock().unwrap().clone();
                emit_login(&app, "error", Some(format!("登录未完成。输出:\n{output}")), None, None);
                return;
            }
        }
    }

    emit_login(&app, "starting-service", Some("登录成功,正在启动本地服务…".into()), None, None);
    match start_service(app.clone()).await {
        Ok(outcome) => {
            let settings_port = app.state::<AppState>().settings.lock().unwrap().port;
            if outcome.new_key.is_some() {
                let key = state::read_local_key(&app).0.unwrap_or_default();
                emit_login(
                    &app,
                    "done",
                    Some(format!("登录完成,服务已就绪: {}", local_endpoint(settings_port))),
                    None,
                    Some(&key),
                );
            } else {
                emit_login(&app, "done", Some("登录完成,服务已就绪".into()), None, None);
            }
        }
        Err(e) => emit_login(&app, "error", Some(e), None, None),
    }
    emit_status(&app);
}

pub async fn cancel_login(app: AppHandle) {
    use std::sync::atomic::Ordering;
    app.state::<AppState>().login_cancelled.store(true, Ordering::SeqCst);
    let slot = app.state::<AppState>().login_child.clone();
    let mut guard = slot.lock().await;
    if let Some(child) = guard.as_mut() {
        let _ = child.kill().await;
    }
}

// ---------- 启动自愈 ----------

/// 已登录但服务未跑时自动拉起(应用启动时调用)
pub fn self_heal(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let autostart = app.state::<AppState>().settings.lock().unwrap().autostart_service;
        if !autostart || !is_logged_in() {
            return;
        }
        let port = app.state::<AppState>().settings.lock().unwrap().port;
        if is_service_running(port).await {
            emit_status(&app);
            return;
        }
        if let Err(e) = start_service(app.clone()).await {
            eprintln!("[costrict-hub] 自愈启动失败: {e}");
        }
        emit_status(&app);
    });
}
