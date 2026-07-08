#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::Deserialize;
use std::{thread, time::Duration};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AutoTurnPayload {
  path: Vec<GridPoint>,
  rows: u32,
  cols: u32,
  overlay: Option<OverlayPayload>,
}

#[derive(Debug, Deserialize)]
struct GridPoint {
  r: f64,
  c: f64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OverlayPayload {
  path_screen_points: Vec<ScreenPoint>,
}

#[derive(Debug, Deserialize, Clone)]
struct ScreenPoint {
  x: f64,
  y: f64,
}

#[tauri::command]
fn play_auto_turn_path(payload: AutoTurnPayload) -> Result<(), String> {
  let _grid_shape = (payload.rows, payload.cols);
  let _path_len = payload.path.len();
  let screen_points = payload
    .overlay
    .as_ref()
    .map(|overlay| overlay.path_screen_points.as_slice())
    .ok_or_else(|| "找不到透明格線的螢幕座標。".to_string())?;

  if screen_points.len() < 2 {
    return Err("目前沒有足夠的轉珠路徑。".to_string());
  }

  drag_screen_path(screen_points)
}

#[cfg(target_os = "windows")]
fn drag_screen_path(points: &[ScreenPoint]) -> Result<(), String> {
  use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
    mouse_event, MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP,
  };
  use windows_sys::Win32::UI::WindowsAndMessaging::SetCursorPos;

  unsafe fn move_cursor(x: i32, y: i32) -> Result<(), String> {
    if SetCursorPos(x, y) == 0 {
      Err("移動滑鼠游標失敗。".to_string())
    } else {
      Ok(())
    }
  }

  unsafe fn mouse_down() {
    mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0);
  }

  unsafe fn mouse_up() {
    mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, 0);
  }

  let first = point_to_i32(&points[0])?;

  unsafe {
    move_cursor(first.0, first.1)?;
    thread::sleep(Duration::from_millis(65));
    mouse_down();
  }

  let mut result = Ok(());

  for pair in points.windows(2) {
    let from = &pair[0];
    let to = &pair[1];
    let dx = to.x - from.x;
    let dy = to.y - from.y;
    let distance = (dx * dx + dy * dy).sqrt();
    let steps = ((distance / 9.0).ceil() as usize).clamp(8, 28);

    for step in 1..=steps {
      let t = step as f64 / steps as f64;
      let point = ScreenPoint {
        x: from.x + dx * t,
        y: from.y + dy * t,
      };

      match point_to_i32(&point).and_then(|(x, y)| unsafe { move_cursor(x, y) }) {
        Ok(()) => thread::sleep(Duration::from_millis(9)),
        Err(err) => {
          result = Err(err);
          break;
        }
      }
    }

    if result.is_err() {
      break;
    }
  }

  thread::sleep(Duration::from_millis(45));
  unsafe {
    mouse_up();
  }

  result
}

#[cfg(not(target_os = "windows"))]
fn drag_screen_path(_points: &[ScreenPoint]) -> Result<(), String> {
  Err("目前自動轉珠滑鼠控制先支援 Windows 桌面版。".to_string())
}

fn point_to_i32(point: &ScreenPoint) -> Result<(i32, i32), String> {
  Ok((round_to_i32(point.x)?, round_to_i32(point.y)?))
}

fn round_to_i32(value: f64) -> Result<i32, String> {
  if !value.is_finite() {
    return Err("路徑座標不是有效數值。".to_string());
  }

  let rounded = value.round();
  if rounded < i32::MIN as f64 || rounded > i32::MAX as f64 {
    return Err("路徑座標超出螢幕範圍。".to_string());
  }

  Ok(rounded as i32)
}

fn main() {
  tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![play_auto_turn_path])
    .run(tauri::generate_context!())
    .expect("error while running ComboAuto");
}
