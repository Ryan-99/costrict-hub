//! 用量统计:解析 router --debug 日志里的 chat metrics 行,按天聚合。
//! 数据源按优先级:hub 指定的日志(服务由 hub 拉起)→ router 默认位置(外部拉起的历史),
//! 合并后按 (ts,id) 去重。解析失败静默降级,不影响代理功能。

use chrono::{Duration, Local, NaiveDateTime};
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use tauri::AppHandle;

use crate::parse::{parse_chat_metrics_line, RequestRecord};
use crate::paths;

/// 读文件尾部最多 max_bytes(日志可能很大,只关心近期)
fn read_tail(path: &std::path::Path, max_bytes: u64) -> String {
    let Ok(meta) = std::fs::metadata(path) else {
        return String::new();
    };
    let size = meta.len();
    let Ok(mut f) = std::fs::File::open(path) else {
        return String::new();
    };
    use std::io::{Read, Seek, SeekFrom};
    let skip = size.saturating_sub(max_bytes);
    if f.seek(SeekFrom::Start(skip)).is_err() {
        return String::new();
    }
    let mut buf = Vec::with_capacity(max_bytes.min(4 * 1024 * 1024) as usize);
    if f.read_to_end(&mut buf).is_err() {
        return String::new();
    }
    // 跳过半截首行
    let mut s = String::from_utf8_lossy(&buf).into_owned();
    if skip > 0 {
        if let Some(pos) = s.find('\n') {
            s.drain(..=pos);
        }
    }
    s
}

fn collect_candidates(app: &AppHandle) -> Vec<std::path::PathBuf> {
    let mut out = vec![paths::hub_router_log(app)];
    out.extend(paths::router_default_logs());
    out
}

pub fn collect_records(app: &AppHandle, days: u32) -> Vec<RequestRecord> {
    let today = Local::now().date_naive();
    let cutoff = today - Duration::days(days.saturating_sub(1) as i64);
    let mut seen: HashSet<(String, String)> = HashSet::new();
    let mut records = Vec::new();
    for path in collect_candidates(app) {
        let text = read_tail(&path, 4 * 1024 * 1024);
        for line in text.lines() {
            let Some(r) = parse_chat_metrics_line(line) else { continue };
            if r.day.is_empty() {
                continue;
            }
            let Ok(day) = NaiveDateTime::parse_from_str(&format!("{} 00:00:00", r.day), "%Y-%m-%d %H:%M:%S")
                .map(|d| d.date())
            else {
                continue;
            };
            if day < cutoff {
                continue;
            }
            let key = (r.ts.clone(), r.id.clone());
            if !seen.insert(key) {
                continue;
            }
            records.push(r);
        }
    }
    records.sort_by(|a, b| a.ts.cmp(&b.ts));
    records
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DayStat {
    pub day: String,
    pub calls: u64,
    pub prompt_tokens: u64,
    pub completion_tokens: u64,
    pub total_tokens: u64,
    pub error_calls: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageReport {
    pub daily: Vec<DayStat>,
    pub recent: Vec<RequestRecord>,
    pub total_calls: u64,
    pub total_tokens: u64,
}

pub fn build_report(records: Vec<RequestRecord>) -> UsageReport {
    let mut by_day: HashMap<String, DayStat> = HashMap::new();
    for r in &records {
        let e = by_day.entry(r.day.clone()).or_insert_with(|| DayStat {
            day: r.day.clone(),
            calls: 0,
            prompt_tokens: 0,
            completion_tokens: 0,
            total_tokens: 0,
            error_calls: 0,
        });
        e.calls += 1;
        e.prompt_tokens += r.prompt_tokens;
        e.completion_tokens += r.completion_tokens;
        e.total_tokens += r.total_tokens;
        if r.status >= 400 {
            e.error_calls += 1;
        }
    }
    let mut daily: Vec<DayStat> = by_day.into_values().collect();
    daily.sort_by(|a, b| a.day.cmp(&b.day));
    let total_calls = daily.iter().map(|d| d.calls).sum();
    let total_tokens = daily.iter().map(|d| d.total_tokens).sum();
    let mut recent = records;
    if recent.len() > 100 {
        recent = recent.split_off(recent.len() - 100);
    }
    recent.reverse(); // 最新在前
    UsageReport { daily, recent, total_calls, total_tokens }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn report_aggregates() {
        let mk = |day: &str, status: u32, tokens: u64| RequestRecord {
            ts: format!("{day} 10:00:00"),
            day: day.to_string(),
            id: format!("id-{day}-{status}-{tokens}"),
            model: "m".into(),
            stream: false,
            status,
            messages: 1,
            tools: 0,
            request_bytes: 0,
            response_bytes: 0,
            duration_ms: 1.0,
            prompt_tokens: tokens,
            completion_tokens: tokens,
            total_tokens: tokens * 2,
        };
        let report = build_report(vec![mk("2026-09-13", 200, 10), mk("2026-09-14", 200, 20), mk("2026-09-14", 500, 1)]);
        assert_eq!(report.daily.len(), 2);
        let today = report.daily.iter().find(|d| d.day == "2026-09-14").unwrap();
        assert_eq!(today.calls, 2);
        assert_eq!(today.error_calls, 1);
        assert_eq!(report.total_tokens, 62);
        assert_eq!(report.recent.len(), 3);
    }
}
