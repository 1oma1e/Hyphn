use sha2::{Digest, Sha256};

fn main() {
    // The SHA-256 of the webcam and OBS DLLs this app ships (ADR-0022): the
    // admin install checks each copy against them, so a DLL swapped in the
    // user's folder is never registered. Absent DLLs = no « Installer ».
    for (file, var) in [("native/hyphn_vcam.dll", "HYPHN_VCAM_SHA256"), ("native/hyphn-obs.dll", "HYPHN_OBS_SHA256")] {
        println!("cargo:rerun-if-changed={file}");
        let hash = std::fs::read(file).map(|b| {
            Sha256::digest(&b).iter().map(|x| format!("{x:02X}")).collect::<String>()
        });
        println!("cargo:rustc-env={var}={}", hash.unwrap_or_default());
    }
    tauri_build::build()
}
