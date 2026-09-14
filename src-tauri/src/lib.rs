mod binmgmt;
mod commands;
mod parse;
mod paths;
mod quota;
mod router_proc;
mod state;
mod tray;
mod usage;

use state::AppState;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            tray::show_main_window(app);
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .manage(AppState {
            settings: std::sync::Mutex::new(state::Settings::default()),
            login_child: std::sync::Arc::new(tokio::sync::Mutex::new(None)),
            login_cancelled: std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false)),
            service_lock: std::sync::Arc::new(tokio::sync::Mutex::new(())),
        })
        .on_window_event(|window, event| {
            // 常驻工具:关闭窗口 = 隐藏到托盘,退出走托盘菜单
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .setup(|app| {
            let handle = app.handle().clone();
            // 设置先于任何使用方加载
            {
                let st = handle.state::<AppState>();
                let settings = state::load_settings(&handle);
                *st.settings.lock().unwrap() = settings;
            }
            tray::setup_tray(&handle).map_err(|e| format!("托盘初始化失败: {e}"))?;
            // 内置资源有而托管目录没有 → 静默安装
            if paths::resolve_router_binary(&handle).is_none() {
                binmgmt::install_from_resource(&handle);
            }
            router_proc::self_heal(handle.clone());
            quota::spawn_quota_poller(handle.clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_status,
            commands::start_login,
            commands::cancel_login,
            commands::start_service,
            commands::stop_service,
            commands::restart_service,
            commands::get_key,
            commands::reset_key,
            commands::clear_key,
            commands::get_quota,
            commands::get_models,
            commands::get_usage,
            commands::get_settings,
            commands::save_settings,
            commands::codex_catalog,
            commands::test_model,
            commands::get_binary_info,
            commands::download_binary,
            commands::open_app_path,
        ])
        .run(tauri::generate_context!())
        .expect("error while running CoStrict Hub");
}
