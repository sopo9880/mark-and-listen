#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use std::{io::{BufRead, BufReader}, process::{Child, Command, Stdio}, sync::{Mutex, mpsc}, time::Duration};
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};
#[cfg(windows)] use std::os::windows::process::CommandExt;
struct Backend(Mutex<Child>);
fn main() {
 let app=tauri::Builder::default().setup(|app| {
  let resources=app.path().resource_dir()?;
  let mut command=Command::new(resources.join("runtime/node.exe"));
  command.arg(resources.join("app/src/beta-server.mjs"))
   .env("PORT","4175").env_remove("NODE_OPTIONS").env_remove("NODE_PATH")
   .stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::null());
  #[cfg(windows)] command.creation_flags(0x08000000);
  let mut child=command.spawn()?;
  let stdout=child.stdout.take().ok_or("Backend stdout unavailable")?;
  let (tx,rx)=mpsc::channel();
  std::thread::spawn(move || {for line in BufReader::new(stdout).lines(){match line{Ok(line) if line=="MARK_READY:4175"=>{let _=tx.send(true);},Ok(_)=>{},Err(_)=>break}}});
  if rx.recv_timeout(Duration::from_secs(30)).is_err(){let _=child.kill();let _=child.wait();return Err("Local backend could not start; port 4175 may be occupied".into());}
  app.manage(Backend(Mutex::new(child)));
  let origin="http://127.0.0.1:4175";
  WebviewWindowBuilder::new(app,"main",WebviewUrl::External(origin.parse()?))
   .title("Mark & Listen 0.1.0.0 Beta").inner_size(1320.0,900.0).min_inner_size(850.0,600.0)
   .on_navigation(|url|url.scheme()=="http"&&url.host_str()==Some("127.0.0.1")&&url.port()==Some(4175))
   .build()?;
  Ok(())
 }).build(tauri::generate_context!()).expect("Mark & Listen initialization failed");
 app.run(|app,event| {if matches!(event,tauri::RunEvent::Exit){if let Some(backend)=app.try_state::<Backend>(){if let Ok(mut child)=backend.0.lock(){let _=child.kill();let _=child.wait();}}}});
}
