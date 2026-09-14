//! 额度看板与模型列表。
//! 额度:读 router config.json 里的 access_token(router 自动保持新鲜),
//! 直连官方插件同款端点 /quota-manager/api/v1/quota(Credit 积分制,对齐插件 15s 轮询)。
//! 模型:上游 /ai-gateway/api/v1/models(带 creditConsumption)与本地 /v1/models 合并。

use chrono::{DateTime, Utc};
use serde::Serialize;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

use crate::router_proc::local_endpoint;
use crate::state::AppState;

/// 外网请求走可代理的客户端(环境变量代理生效);本地回环一律 no_proxy 客户端
fn upstream_client() -> reqwest::Client {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .build()
        .expect("upstream client")
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuotaSnapshot {
    pub total_quota: Option<f64>,
    pub used_quota: Option<f64>,
    pub is_star: Option<String>,
    pub fetched_at: DateTime<Utc>,
    pub error: Option<String>,
}

pub async fn fetch_quota(base_url: &str, access_token: &str) -> QuotaSnapshot {
    let url = format!("{}/quota-manager/api/v1/quota", base_url.trim_end_matches('/'));
    let res = upstream_client()
        .get(&url)
        .header("Authorization", format!("Bearer {access_token}"))
        .header("X-Request-ID", uuid::Uuid::new_v4().to_string())
        .send()
        .await;
    let snapshot_at = Utc::now();
    match res {
        Err(e) => QuotaSnapshot {
            total_quota: None,
            used_quota: None,
            is_star: None,
            fetched_at: snapshot_at,
            error: Some(format!("请求失败: {e}")),
        },
        Ok(r) if !r.status().is_success() => QuotaSnapshot {
            total_quota: None,
            used_quota: None,
            is_star: None,
            fetched_at: snapshot_at,
            error: Some(format!("HTTP {}", r.status())),
        },
        Ok(r) => {
            let v: serde_json::Value = r.json().await.unwrap_or(serde_json::Value::Null);
            // 官方插件取 response.data.data;防御性解析,字段缺失给 None
            let data = v.get("data").unwrap_or(&v);
            let num = |k: &str| data.get(k).and_then(|x| x.as_f64());
            QuotaSnapshot {
                total_quota: num("total_quota"),
                used_quota: num("used_quota"),
                is_star: data.get("is_star").and_then(|x| x.as_str()).map(String::from),
                fetched_at: snapshot_at,
                error: None,
            }
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelInfo {
    pub id: String,
    pub context_window: u64,
    pub max_tokens: Option<u64>,
    pub supports_images: bool,
    pub supports_computer_use: bool,
    /// 每次调用 Credit 消耗;-1/缺失 = Auto(按实际路由计费)
    pub credit_consumption: Option<f64>,
}

/// 上游模型列表(带 Credit 消耗字段)
async fn fetch_gateway_models(base_url: &str, access_token: &str) -> Result<Vec<ModelInfo>, String> {
    let url = format!("{}/ai-gateway/api/v1/models", base_url.trim_end_matches('/'));
    let r = upstream_client()
        .get(&url)
        .header("Authorization", format!("Bearer {access_token}"))
        .header("X-Request-ID", uuid::Uuid::new_v4().to_string())
        .send()
        .await
        .map_err(|e| format!("请求失败: {e}"))?;
    if !r.status().is_success() {
        return Err(format!("HTTP {}", r.status()));
    }
    let v: serde_json::Value = r.json().await.map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    if let Some(arr) = v.get("data").and_then(|d| d.as_array()) {
        for m in arr {
            let Some(id) = m.get("id").and_then(|x| x.as_str()) else { continue };
            if id.is_empty() {
                continue;
            }
            out.push(ModelInfo {
                id: id.to_string(),
                context_window: m.get("contextWindow").and_then(|x| x.as_u64()).unwrap_or(128_000),
                max_tokens: m.get("maxTokens").and_then(|x| x.as_u64()),
                supports_images: m.get("supportsImages").and_then(|x| x.as_bool()).unwrap_or(false),
                supports_computer_use: m.get("supportsComputerUse").and_then(|x| x.as_bool()).unwrap_or(false),
                credit_consumption: m.get("creditConsumption").and_then(|x| x.as_f64()),
            });
        }
    }
    Ok(out)
}

/// 本地 /v1/models(服务运行时的兜底来源)
async fn fetch_local_models(port: u16, key: &str) -> Result<Vec<ModelInfo>, String> {
    let url = format!("{}/models", local_endpoint(port));
    let client = reqwest::Client::builder()
        .no_proxy()
        .timeout(Duration::from_secs(8))
        .build()
        .map_err(|e| e.to_string())?;
    let r = client
        .get(&url)
        .header("Authorization", format!("Bearer {key}"))
        .send()
        .await
        .map_err(|e| format!("请求失败: {e}"))?;
    if !r.status().is_success() {
        return Err(format!("HTTP {}", r.status()));
    }
    let v: serde_json::Value = r.json().await.map_err(|e| e.to_string())?;
    Ok(crate::parse::parse_local_models(&v)
        .into_iter()
        .map(|m| ModelInfo {
            id: m.id,
            context_window: m.context_length,
            max_tokens: None,
            supports_images: false,
            supports_computer_use: false,
            credit_consumption: None,
        })
        .collect())
}

/// 模型列表:优先上游(带消耗字段),失败回退本地
pub async fn load_models(app: &AppHandle) -> Result<Vec<ModelInfo>, String> {
    let cfg = crate::router_proc::read_router_config();
    let token = cfg.as_ref().and_then(|c| c.access_token.clone());
    let base_from_cfg = cfg.as_ref().and_then(|c| c.base_url.clone());
    let Some(token) = token else {
        return Err("尚未登录 CoStrict".into());
    };
    let base = match base_from_cfg {
        Some(b) => b,
        None => app.state::<AppState>().settings.lock().unwrap().upstream_base_url.clone(),
    };
    match fetch_gateway_models(&base, &token).await {
        Ok(list) if !list.is_empty() => Ok(list),
        Ok(_) | Err(_) => {
            // 回退本地 /v1/models
            let (key, _) = crate::state::read_local_key(app);
            let port = app.state::<AppState>().settings.lock().unwrap().port;
            match key {
                Some(k) if crate::router_proc::is_service_running(port).await => fetch_local_models(port, &k).await,
                _ => Err("本地服务未运行,无法获取模型列表".into()),
            }
        }
    }
}

/// 额度轮询:登录态存在时每 15s 拉一次并推送 hub:quota 事件
pub fn spawn_quota_poller(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let mut tick = tokio::time::interval(Duration::from_secs(15));
        tokio::time::sleep(Duration::from_secs(2)).await; // 等自愈先跑
        loop {
            tick.tick().await;
            let Some(cfg) = crate::router_proc::read_router_config() else {
                continue;
            };
            let Some(token) = cfg.access_token.clone() else { continue };
            let base = match cfg.base_url.clone() {
                Some(b) => b,
                None => app.state::<AppState>().settings.lock().unwrap().upstream_base_url.clone(),
            };
            let snapshot = fetch_quota(&base, &token).await;
            let _ = app.emit("hub:quota", &snapshot);
        }
    });
}

/// 供前端手动刷新
pub async fn quota_now(app: AppHandle) -> QuotaSnapshot {
    let cfg = crate::router_proc::read_router_config();
    let base = match cfg.as_ref().and_then(|c| c.base_url.clone()) {
        Some(b) => b,
        None => app.state::<AppState>().settings.lock().unwrap().upstream_base_url.clone(),
    };
    let Some(token) = cfg.and_then(|c| c.access_token) else {
        return QuotaSnapshot {
            total_quota: None,
            used_quota: None,
            is_star: None,
            fetched_at: Utc::now(),
            error: Some("尚未登录 CoStrict".into()),
        };
    };
    let s = fetch_quota(&base, &token).await;
    let _ = app.emit("hub:quota", &s);
    s
}
