#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{
    io::{self, BufRead, BufReader},
    process::{Child, Command, Stdio},
    sync::{mpsc, Mutex},
    time::Duration,
};
#[cfg(windows)]
use std::os::windows::process::CommandExt;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent,
};

struct Backend(Mutex<Child>);

impl Drop for Backend {
    fn drop(&mut self) {
        if let Ok(child) = self.0.get_mut() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

/// Brings the main window back from the tray (or from behind other windows).
fn show_main(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn main() {
    let result = tauri::Builder::default()
        // A second launch (e.g. from the Start menu while the app sits in the tray) only reopens the window.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| show_main(app)))
        // Closing the window keeps Mark & Listen running in the tray; "종료" in the tray menu quits.
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .setup(|app| {
            let resources = app.path().resource_dir()?;
            #[cfg(windows)]
            let runtime = resources.join("runtime/node.exe");
            #[cfg(not(windows))]
            let runtime = resources.join("runtime/node");
            let entry = "app/src/main.mjs";
            for file in [&runtime, &resources.join(entry)] {
                if !file.is_file() {
                    return Err(io::Error::new(
                        io::ErrorKind::NotFound,
                        format!("Installed resource missing: {}", file.display()),
                    ).into());
                }
            }
            let mut command = Command::new(runtime);
            command.current_dir(&resources).arg(entry)
                .env("PORT", "4175").env("MARK_LISTEN_PARENT_PIPE", "1")
                .env_remove("NODE_OPTIONS").env_remove("NODE_PATH")
                .stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::inherit());
            #[cfg(windows)]
            command.creation_flags(0x08000000);
            let mut child = command.spawn()
                .map_err(|err| io::Error::other(format!("Could not launch installed Node: {err}")))?;
            let stdout = child.stdout.take().ok_or("Backend stdout unavailable")?;
            let backend = Backend(Mutex::new(child));
            let (tx, rx) = mpsc::channel();
            let app_handle = app.handle().clone();
            std::thread::spawn(move || {
                for line in BufReader::new(stdout).lines().map_while(Result::ok) {
                    if let Some(port) = line.strip_prefix("MARK_READY:").and_then(|p| p.parse::<u16>().ok()) {
                        let _ = tx.send(port);
                    } else if line == "MARK_INSTALL_READY" {
                        app_handle.exit(0);
                    }
                }
            });
            let port = rx.recv_timeout(Duration::from_secs(30))
                .map_err(|err| io::Error::other(format!("Installed backend did not signal readiness: {err}")))?;

            let origin = format!("http://127.0.0.1:{port}");
            WebviewWindowBuilder::new(app, "main", WebviewUrl::External(origin.parse()?))
                .title("Mark & Listen")
                .inner_size(1320.0, 900.0).min_inner_size(850.0, 600.0)
                .on_navigation(move |url| url.scheme() == "http" && url.host_str() == Some("127.0.0.1") && url.port() == Some(port))
                .build()
                .map_err(|err| io::Error::other(format!("Could not open the WebView2 window: {err}")))?;
            app.manage(backend);

            let open = MenuItem::with_id(app, "open", "Mark & Listen 열기", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "종료", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open, &quit])?;
            let mut tray = TrayIconBuilder::with_id("main")
                .tooltip("Mark & Listen")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "open" => show_main(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                        show_main(tray.app_handle());
                    }
                });
            if let Some(icon) = app.default_window_icon() {
                tray = tray.icon(icon.clone());
            }
            tray.build(app)?;
            Ok(())
        })
        .build(tauri::generate_context!());

    let app = match result {
        Ok(app) => app,
        Err(error) => {
            eprintln!("Mark & Listen initialization failed: {error}");
            std::process::exit(1);
        }
    };
    app.run(|app, event| {
        // macOS: clicking the Dock icon brings back the window that closing only hid.
        #[cfg(target_os = "macos")]
        if let tauri::RunEvent::Reopen { .. } = event {
            show_main(app);
        }
        if matches!(event, tauri::RunEvent::Exit) {
            if let Some(backend) = app.try_state::<Backend>() {
                if let Ok(mut child) = backend.0.lock() {
                    let _ = child.kill();
                    let _ = child.wait();
                }
            }
        }
    });
}
