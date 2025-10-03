#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use roguegrid9::run;

fn main() {
    run();
}
