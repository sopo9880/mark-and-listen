#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{
    io::{self, BufRead, BufReader},
    process::{Child, Command, Stdio},
    sync::{mpsc, Mutex},
    time::Duration,
};
#[cfg(windows)]
use std::os::windows::process::CommandExt;
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

struct Backend(Mutex<Child>);

impl Drop for Backend {
    fn drop(&mut self) {
        if let Ok(child) = self.0.get_mut() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

fn main() {
    let result = tauri::Builder::default()
        .setup(|app| {
            let resources = app.path().resource_dir()?;
            let runtime = resources.join("runtime/node.exe");
            let entry = "app/src/start-beta.mjs";
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
            std::thread::spawn(move || {
                for line in BufReader::new(stdout).lines().map_while(Result::ok) {
                    if line == "MARK_READY:4175" {
                        let _ = tx.send(());
                    }
                }
            });
            rx.recv_timeout(Duration::from_secs(30))
                .map_err(|err| io::Error::other(format!("Installed backend did not signal readiness: {err}")))?;

            WebviewWindowBuilder::new(app, "main", WebviewUrl::External("http://127.0.0.1:4175".parse()?))
                .title("Mark & Listen 0.1.0.0 Beta")
                .inner_size(1320.0, 900.0).min_inner_size(850.0, 600.0)
                .on_navigation(|url| url.scheme() == "http" && url.host_str() == Some("127.0.0.1") && url.port() == Some(4175))
                .build()
                .map_err(|err| io::Error::other(format!("Could not open the WebView2 window: {err}")))?;
            app.manage(backend);
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
