//! 纯函数:子进程输出解析 / URL 白名单 / 日志行解析。
//! 移植自 pi-gui costrict-service.ts 的已验证逻辑,离线可测。

use regex::Regex;
use serde::Serialize;
use std::sync::OnceLock;

/// CoStrict 相关地址的可信主机:深信服域或本机。
/// 登录 URL / base-url 只信任这些,防止子进程输出被诱导成钓鱼链接(沿用 pi-gui CS-6)。
pub fn is_allowed_costrict_url(raw: &str) -> bool {
    let Ok(u) = url::Url::parse(raw) else {
        return false;
    };
    if u.scheme() != "https" && u.scheme() != "http" {
        return false;
    }
    let Some(host) = u.host_str() else {
        return false;
    };
    let h = host.to_ascii_lowercase();
    h == "localhost" || h == "127.0.0.1" || h.ends_with(".sangfor.com") || h == "sangfor.com"
}

/// 从 login 输出提取登录链接(排除本地服务地址,且只信任深信服域)
pub fn extract_login_url(text: &str) -> Option<String> {
    static RE: OnceLock<Regex> = OnceLock::new();
    let re = RE.get_or_init(|| Regex::new(r#"https?://[^\s'"]+"#).unwrap());
    re.find_iter(text)
        .map(|m| m.as_str())
        .find(|u| is_allowed_costrict_url(u) && !u.contains("127.0.0.1") && !u.contains("localhost"))
        .map(|s| s.to_string())
}

/// 捕获一次性显示的本地 API Key(router 配置只存 hash,丢了只能 key reset)
pub fn extract_api_key(text: &str) -> Option<String> {
    static RE: OnceLock<Regex> = OnceLock::new();
    let re = RE.get_or_init(|| Regex::new(r"sk-costrict-[A-Za-z0-9_-]+").unwrap());
    re.find(text).map(|m| m.as_str().to_string())
}

fn strip_ansi(line: &str) -> String {
    static RE: OnceLock<Regex> = OnceLock::new();
    let re = RE.get_or_init(|| Regex::new(r"\x1b\[[0-9;]*m").unwrap());
    re.replace_all(line, "").into_owned()
}

/// 单条代理请求记录(来自 router --debug 的 chat metrics 日志行)
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RequestRecord {
    /// 日志时间戳原文 "2026/09/14 12:00:00"(解析失败为空)
    pub ts: String,
    /// 本地日期 "2026-09-14",按天聚合用
    pub day: String,
    pub id: String,
    pub model: String,
    pub stream: bool,
    pub status: u32,
    pub messages: u32,
    pub tools: u32,
    pub request_bytes: u64,
    pub response_bytes: u64,
    pub duration_ms: f64,
    pub prompt_tokens: u64,
    pub completion_tokens: u64,
    pub total_tokens: u64,
}

/// 解析 router chat metrics 日志行(中英双语,ANSI 色码,log.LstdFlags 时间戳前缀)。
/// 解析失败返回 None,调用方静默跳过。
pub fn parse_chat_metrics_line(raw_line: &str) -> Option<RequestRecord> {
    let line = strip_ansi(raw_line);
    // 只匹配真正的指标行;启动横幅("chat metrics will be logged")不带 id=,不会误入
    if !line.contains("chat metrics id=") && !line.contains("对话指标 id=") {
        return None;
    }
    let field = |labels: &[&str]| -> Option<String> {
        for label in labels {
            if let Some(pos) = line.find(label) {
                let rest = &line[pos + label.len()..];
                let end = rest
                    .find(char::is_whitespace)
                    .unwrap_or(rest.len());
                let v = &rest[..end];
                if !v.is_empty() {
                    return Some(v.to_string());
                }
            }
        }
        None
    };
    let num = |labels: &[&str]| -> u64 { field(labels).and_then(|v| v.parse().ok()).unwrap_or(0) };

    // 时间戳前缀(可能缺失)
    static TS_RE: OnceLock<Regex> = OnceLock::new();
    let ts_re = TS_RE.get_or_init(|| Regex::new(r"^(\d{4}/\d{2}/\d{2} \d{2}:\d{2}:\d{2})").unwrap());
    let (ts, day) = match ts_re.captures(&line) {
        Some(c) => {
            let raw = c[1].to_string();
            let day = chrono::NaiveDateTime::parse_from_str(&raw, "%Y/%m/%d %H:%M:%S")
                .map(|d| d.format("%Y-%m-%d").to_string())
                .unwrap_or_default();
            (raw, day)
        }
        None => (String::new(), String::new()),
    };

    // usage 到行尾(三个 =数字 组),取前三个:prompt / completion / total
    static NUM_RE: OnceLock<Regex> = OnceLock::new();
    let num_re = NUM_RE.get_or_init(|| Regex::new(r"=(\d+)").unwrap());
    let usage_pos = line.find("usage=").or_else(|| line.find("token="));
    let (prompt_tokens, completion_tokens, total_tokens) = match usage_pos {
        Some(pos) => {
            let nums: Vec<u64> = num_re
                .captures_iter(&line[pos..])
                .map(|c| c[1].parse().unwrap_or(0))
                .collect();
            (
                nums.first().copied().unwrap_or(0),
                nums.get(1).copied().unwrap_or(0),
                nums.get(2).copied().unwrap_or(0),
            )
        }
        None => (0, 0, 0),
    };

    Some(RequestRecord {
        day,
        id: field(&["id="]).unwrap_or_default(),
        model: field(&["model=", "模型="]).unwrap_or_else(|| "unknown".into()),
        stream: field(&["stream=", "流式="]).as_deref() == Some("true"),
        status: num(&["status=", "状态="]) as u32,
        messages: num(&["messages=", "消息数="]) as u32,
        tools: num(&["tools=", "工具数="]) as u32,
        request_bytes: num(&["request_bytes=", "请求字节="]),
        response_bytes: num(&["response_bytes=", "响应字节="]),
        duration_ms: field(&["duration=", "总耗时="])
            .and_then(|v| parse_go_duration_ms(&v))
            .unwrap_or(0.0),
        prompt_tokens,
        completion_tokens,
        total_tokens,
        ts,
    })
}

/// Go duration 字符串 → 毫秒("1.5s" / "120ms" / "2m10s" / "1h2m3.5s")
pub fn parse_go_duration_ms(s: &str) -> Option<f64> {
    let s = s.trim();
    if s.is_empty() || s == "-" {
        return None;
    }
    let mut total_ms = 0.0f64;
    let mut num = String::new();
    let mut chars = s.chars().peekable();
    let mut matched = false;
    while let Some(c) = chars.next() {
        if c.is_ascii_digit() || c == '.' {
            num.push(c);
            continue;
        }
        let value: f64 = num.parse().ok()?;
        num.clear();
        let unit: String = if c == 'µ' || c == 'μ' {
            // µs:再吃一个 's'
            let _ = chars.next();
            "us".to_string()
        } else {
            let mut u = c.to_string();
            while let Some(&n) = chars.peek() {
                if n.is_alphabetic() {
                    u.push(n);
                    chars.next();
                } else {
                    break;
                }
            }
            u
        };
        let ms = match unit.as_str() {
            "ns" => value / 1_000_000.0,
            "us" => value / 1_000.0,
            "ms" => value,
            "s" => value * 1000.0,
            "m" => value * 60_000.0,
            "h" => value * 3_600_000.0,
            _ => return None,
        };
        total_ms += ms;
        matched = true;
    }
    if matched {
        Some(total_ms)
    } else {
        None
    }
}

/// 本地 /v1/models 响应 → 模型列表
#[derive(Debug, Clone, Serialize)]
pub struct LocalModel {
    pub id: String,
    pub context_length: u64,
}

pub fn parse_local_models(json: &serde_json::Value) -> Vec<LocalModel> {
    let mut out = Vec::new();
    if let Some(arr) = json.get("data").and_then(|d| d.as_array()) {
        for m in arr {
            let Some(id) = m.get("id").and_then(|v| v.as_str()) else {
                continue;
            };
            if id.is_empty() {
                continue;
            }
            out.push(LocalModel {
                id: id.to_string(),
                context_length: m
                    .get("context_length")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(128_000),
            });
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn allowed_url() {
        assert!(is_allowed_costrict_url("https://zgsm.sangfor.com/oidc-auth?state=x"));
        assert!(is_allowed_costrict_url("http://localhost:14567/healthz"));
        assert!(!is_allowed_costrict_url("https://evil.example.com/oidc"));
        assert!(!is_allowed_costrict_url("javascript:alert(1)"));
        assert!(!is_allowed_costrict_url("not a url"));
    }

    #[test]
    fn login_url_extraction() {
        let out = "some noise\n登录链接: https://zgsm.sangfor.com/oidc-auth?state=abc\nalso http://127.0.0.1:14567/healthz\n";
        assert_eq!(
            extract_login_url(out).as_deref(),
            Some("https://zgsm.sangfor.com/oidc-auth?state=abc")
        );
        assert_eq!(extract_login_url("no url here"), None);
    }

    #[test]
    fn api_key_extraction() {
        assert_eq!(
            extract_api_key("key: sk-costrict-AbC123_-xyz valid").as_deref(),
            Some("sk-costrict-AbC123_-xyz")
        );
        assert_eq!(extract_api_key("nothing"), None);
    }

    #[test]
    fn metrics_line_en() {
        let line = "2026/09/14 10:00:00 \x1b[36m✨ [DEBUG]\x1b[0m chat metrics id=req-1 model=GLM-4.6 stream=true status=200 messages=5 tools=2 max_tokens=- temperature=- top_p=- request_bytes=1234 response_bytes=5678 headers_latency=10ms ttfb=250ms duration=1.25s usage=prompt=100 completion=50 total=150 tps=40.0 copy_error=-";
        let r = parse_chat_metrics_line(line).unwrap();
        assert_eq!(r.model, "GLM-4.6");
        assert!(r.stream);
        assert_eq!(r.status, 200);
        assert_eq!(r.request_bytes, 1234);
        assert!((r.duration_ms - 1250.0).abs() < 0.01);
        assert_eq!(r.prompt_tokens, 100);
        assert_eq!(r.completion_tokens, 50);
        assert_eq!(r.total_tokens, 150);
        assert_eq!(r.day, "2026-09-14");
    }

    #[test]
    fn metrics_line_zh() {
        let line = "2026/09/14 10:00:00 ✨ [DEBUG] 对话指标 id=req-2 模型=Tencent-kimi-k2.6 流式=false 状态=200 消息数=3 工具数=0 max_tokens=- temperature=- top_p=- 请求字节=100 响应字节=200 响应头耗时=5ms 首字节耗时=5ms 总耗时=120ms token=输入=10 输出=5 总计=15 生成速度=- 复制错误=-";
        let r = parse_chat_metrics_line(line).unwrap();
        assert_eq!(r.model, "Tencent-kimi-k2.6");
        assert!(!r.stream);
        assert_eq!(r.total_tokens, 15);
        assert!((r.duration_ms - 120.0).abs() < 0.01);
    }

    #[test]
    fn metrics_line_non_metrics() {
        assert!(parse_chat_metrics_line("2026/09/14 10:00:00 ✨ [INFO] started").is_none());
    }

    #[test]
    fn go_duration() {
        assert!((parse_go_duration_ms("1.5s").unwrap() - 1500.0).abs() < 0.01);
        assert!((parse_go_duration_ms("120ms").unwrap() - 120.0).abs() < 0.01);
        assert!((parse_go_duration_ms("2m10s").unwrap() - 130_000.0).abs() < 0.01);
        assert!((parse_go_duration_ms("500µs").unwrap() - 0.5).abs() < 0.01);
        assert!(parse_go_duration_ms("-").is_none());
    }
}
