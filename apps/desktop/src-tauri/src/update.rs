//! Updates from the GitHub Releases (ADR-0040): the window asks at launch,
//! the user clicks « Installer », the signed setup is downloaded, checked
//! against the public key of `tauri.conf.json`, installed, and Hyphn restarts.

use serde::Serialize;
use tauri::{AppHandle, Emitter};
use tauri_plugin_updater::{Update, UpdaterExt};

#[derive(Serialize)]
pub struct Available {
    version: String,
    notes: Option<String>,
}

async fn newer(app: &AppHandle) -> Result<Option<Update>, String> {
    let updater = app.updater().map_err(|e| e.to_string())?;
    updater.check().await.map_err(|e| e.to_string())
}

/// The newer version on GitHub, if there is one.
#[tauri::command]
pub async fn update_check(app: AppHandle) -> Result<Option<Available>, String> {
    Ok(newer(&app).await?.map(|u| Available { version: u.version, notes: u.body }))
}

/// Downloads and installs the newer version. Progress goes out as
/// `update_progress` events (bytes so far, total if known). On Windows the
/// setup closes Hyphn itself; elsewhere it restarts here.
#[tauri::command]
pub async fn update_install(app: AppHandle) -> Result<(), String> {
    let update = newer(&app).await?.ok_or("Hyphn est déjà à jour.")?;
    let mut done: u64 = 0;
    update
        .download_and_install(
            |chunk, total| {
                done += chunk as u64;
                let _ = app.emit("update_progress", (done, total));
            },
            || {},
        )
        .await
        .map_err(|e| e.to_string())?;
    app.restart()
}
