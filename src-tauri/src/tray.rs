//! 托盘常驻:显示窗口 / 启停服务 / 退出。关闭窗口 = 最小化到托盘(常驻工具惯例)。

use std::sync::OnceLock;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, Wry};

static SERVICE_ITEM: OnceLock<MenuItem<Wry>> = OnceLock::new();

pub fn setup_tray(app: &AppHandle) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "显示主窗口", true, None::<&str>)?;
    let toggle = MenuItem::with_id(app, "toggle", "停止服务", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "退出(停止服务)", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &toggle, &quit])?;
    let _ = SERVICE_ITEM.set(toggle);

    let mut tray = TrayIconBuilder::with_id("main-tray")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .tooltip("CoStrict Hub")
        .on_menu_event(|app, event| {
            let app = app.clone();
            tauri::async_runtime::spawn(async move {
                match event.id().as_ref() {
                    "show" => show_main_window(&app),
                    "quit" => quit_app(&app).await,
                    "toggle" => toggle_service(&app).await,
                    _ => {}
                }
            });
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: tauri::tray::MouseButton::Left, button_state: tauri::tray::MouseButtonState::Up, .. } = event {
                show_main_window(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;
    Ok(())
}

pub fn show_main_window(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.unminimize();
        let _ = win.set_focus();
    }
}

async fn toggle_service(app: &AppHandle) {
    let port = app.state::<crate::state::AppState>().settings.lock().unwrap().port;
    if crate::router_proc::is_service_running(port).await {
        let _ = crate::router_proc::stop_service(app.clone()).await;
        set_service_item_text("启动服务");
    } else {
        let _ = crate::router_proc::start_service(app.clone()).await;
        set_service_item_text("停止服务");
    }
}

fn set_service_item_text(text: &str) {
    if let Some(item) = SERVICE_ITEM.get() {
        let _ = item.set_text(text);
    }
}

pub async fn quit_app(app: &AppHandle) {
    let stop_on_exit = app
        .state::<crate::state::AppState>()
        .settings
        .lock()
        .unwrap()
        .stop_service_on_exit;
    if stop_on_exit {
        let port = app.state::<crate::state::AppState>().settings.lock().unwrap().port;
        if crate::router_proc::is_service_running(port).await {
            let _ = crate::router_proc::stop_service(app.clone()).await;
        }
    }
    app.exit(0);
}
