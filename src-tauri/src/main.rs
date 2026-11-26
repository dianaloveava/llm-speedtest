// LLM SpeedTest desktop shell.
//
// The whole app is the front-end in dist/. This process exists for one reason:
// HTTP goes through reqwest here, not through the webview, so there is no
// browser origin and therefore no CORS, no preflight and no localhost/127.0.0.1
// trap. Bytes are streamed to the front-end as they arrive so first-token
// latency and output speed stay honest.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::collections::HashMap;
use std::time::Duration;

use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use tauri::ipc::Channel;
use tauri::State;
use tokio::sync::{oneshot, Mutex};

#[derive(Default)]
struct AppState {
    /// In-flight request id → cancellation sender.
    cancel: Mutex<HashMap<u64, oneshot::Sender<()>>>,
}

#[derive(Deserialize)]
struct HttpRequest {
    url: String,
    method: String,
    #[serde(default)]
    headers: Vec<(String, String)>,
    #[serde(default)]
    body: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(tag = "type", rename_all = "lowercase")]
enum StreamEvent {
    Start {
        status: u16,
        headers: Vec<(String, String)>,
    },
    Chunk {
        data: Vec<u8>,
    },
    End,
    Error {
        message: String,
    },
}

/// Headers the client must own; forwarding them would corrupt the request.
fn skip_header(name: &str) -> bool {
    matches!(
        name,
        "host"
            | "content-length"
            | "accept-encoding"
            | "connection"
            | "keep-alive"
            | "proxy-authenticate"
            | "proxy-authorization"
            | "te"
            | "trailer"
            | "transfer-encoding"
            | "upgrade"
            | "origin"
            | "referer"
            | "cookie"
    ) || name.starts_with("sec-")
}

#[tauri::command]
async fn http_stream(
    id: u64,
    req: HttpRequest,
    on_event: Channel<StreamEvent>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let (cancel_tx, mut cancel_rx) = oneshot::channel();
    state.cancel.lock().await.insert(id, cancel_tx);

    let result = stream_request(req, &on_event, &mut cancel_rx).await;

    state.cancel.lock().await.remove(&id);

    match result {
        Ok(()) => {
            let _ = on_event.send(StreamEvent::End);
            Ok(())
        }
        Err(message) => {
            let _ = on_event.send(StreamEvent::Error { message });
            Ok(())
        }
    }
}

async fn stream_request(
    req: HttpRequest,
    on_event: &Channel<StreamEvent>,
    cancel_rx: &mut oneshot::Receiver<()>,
) -> Result<(), String> {
    let client = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(30))
        .timeout(Duration::from_secs(900))
        .build()
        .map_err(|err| format!("HTTP client error: {err}"))?;

    let method = reqwest::Method::from_bytes(req.method.as_bytes())
        .map_err(|_| format!("Unsupported method: {}", req.method))?;

    let mut builder = client.request(method, &req.url);
    for (name, value) in &req.headers {
        if skip_header(name.to_ascii_lowercase().as_str()) {
            continue;
        }
        builder = builder.header(name, value);
    }
    if let Some(body) = req.body {
        builder = builder.body(body);
    }

    let response = match builder.send().await {
        Ok(response) => response,
        Err(err) => return Err(describe_reqwest_error(&err)),
    };

    let status = response.status().as_u16();
    let headers: Vec<(String, String)> = response
        .headers()
        .iter()
        .filter_map(|(name, value)| {
            let lower = name.as_str().to_ascii_lowercase();
            if matches!(
                lower.as_str(),
                "content-length" | "transfer-encoding" | "connection" | "keep-alive" | "content-encoding"
            ) {
                return None;
            }
            value
                .to_str()
                .ok()
                .map(|value| (name.as_str().to_string(), value.to_string()))
        })
        .collect();

    on_event
        .send(StreamEvent::Start { status, headers })
        .map_err(|err| format!("IPC error: {err}"))?;

    let mut stream = response.bytes_stream();
    loop {
        tokio::select! {
            _ = &mut *cancel_rx => break,
            next = stream.next() => match next {
                Some(Ok(bytes)) => {
                    on_event
                        .send(StreamEvent::Chunk { data: bytes.to_vec() })
                        .map_err(|err| format!("IPC error: {err}"))?;
                }
                Some(Err(err)) => return Err(describe_reqwest_error(&err)),
                None => break,
            },
        }
    }

    Ok(())
}

fn describe_reqwest_error(err: &reqwest::Error) -> String {
    if err.is_timeout() {
        format!("Request timed out: {err}")
    } else if err.is_connect() {
        format!("Network error: cannot connect — {err}")
    } else if err.is_decode() {
        format!("Network error: malformed response — {err}")
    } else {
        format!("Network error: {err}")
    }
}

#[tauri::command]
async fn http_cancel(id: u64, state: State<'_, AppState>) -> Result<(), String> {
    if let Some(tx) = state.cancel.lock().await.remove(&id) {
        let _ = tx.send(());
    }
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![http_stream, http_cancel])
        .run(tauri::generate_context!())
        .expect("error while running LLM SpeedTest");
}
