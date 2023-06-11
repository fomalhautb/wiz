use axum::{
    response::{sse::Event, Sse},
    routing::post,
    Extension, Json, Router,
};
use futures_core::stream::Stream;
use rand::rngs::ThreadRng;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    cell::RefCell,
    convert::Infallible,
    error::Error,
    io,
    net::SocketAddr,
    path::PathBuf,
    rc::Rc,
    sync::{Arc, Mutex},
};
use tokenizers::Tokenizer;
use tokio::task::spawn_blocking;
use wiz_rs::{
    InferenceError, InferenceParameters, InferenceSessionParameters, InferenceSnapshot,
    OutputToken, TokenBias, EOD_TOKEN_ID,
};

struct AppState {
    inference_tx: flume::Sender<InferenceRequest>,
}

// Resolve to ~/.wiz
fn get_wiz_home_dir() -> Result<PathBuf, Box<dyn Error>> {
    let mut home_dir = dirs::home_dir().ok_or("Could not find home directory")?;
    home_dir.push(".wiz");
    Ok(home_dir)
}

fn load_model() -> Result<(wiz_rs::Model, Tokenizer), Box<dyn Error>> {
    let model_path = get_wiz_home_dir()?.join("model.bin");
    let (model, vocab) = wiz_rs::Model::load(&model_path, 512 as i32, |progress| {
        use wiz_rs::LoadProgress;
        match progress {
            LoadProgress::HyperparametersLoaded(hparams) => {
                log::debug!("Loaded HyperParams {hparams:#?}")
            }
            LoadProgress::BadToken { index } => {
                log::info!("Warning: Bad token in vocab at index {index}")
            }
            LoadProgress::ContextSize { bytes } => log::info!(
                "ggml ctx size = {:.2} MB\n",
                bytes as f64 / (1024.0 * 1024.0)
            ),
            LoadProgress::MemorySize { bytes, n_mem } => log::info!(
                "Memory size: {} MB {}",
                bytes as f32 / 1024.0 / 1024.0,
                n_mem
            ),
            LoadProgress::PartLoading {
                file,
                current_part,
                total_parts,
            } => log::info!(
                "Loading model part {}/{} from '{}'\n",
                current_part,
                total_parts,
                file.to_string_lossy(),
            ),
            LoadProgress::PartTensorLoaded {
                current_tensor,
                tensor_count,
                ..
            } => {
                if current_tensor % 8 == 0 {
                    log::info!("Loaded tensor {current_tensor}/{tensor_count}");
                }
            }
            LoadProgress::PartLoaded {
                file,
                byte_size,
                tensor_count,
            } => {
                log::info!("Loading of '{}' complete", file.to_string_lossy());
                log::info!(
                    "Model size = {:.2} MB / num tensors = {}",
                    byte_size as f64 / 1024.0 / 1024.0,
                    tensor_count
                );
            }
        }
    })
    .expect("Could not load model");

    log::info!("Model fully loaded!");

    Ok((model, vocab))
}

#[derive(Debug)]
enum InferenceResult {
    Token(String),
    Error(String),
}

struct InferenceRequest {
    query: String,
    response_sender: flume::Sender<InferenceResult>,
}

const PROMPT_PREFIX: &str = "### Instruction:\nConvert to bash command, provide detailed explanation in a second paragraph\n\n### Input:\n";

const PROMPT_TEMPLATE: &str = "{input}\n\n### Response:\n```bash\n";

fn generate_prompt(input: &str) -> String {
    PROMPT_TEMPLATE.replace("{input}", input)
}

fn load_prompt_snapshot(
    prompt_prefix: &str,
    model: &wiz_rs::Model,
    vocab: &Tokenizer,
) -> Result<InferenceSnapshot, Box<dyn Error>> {
    // Check if prompt snapshot exists at ~/.wiz/snapshots/{hash}.bin
    let mut prompt_hasher = Sha256::new();
    prompt_hasher.update(prompt_prefix.as_bytes());
    let prompt_hash = prompt_hasher.finalize();
    let prompt_hash_hex = &format!("{:x}", prompt_hash)[0..8];

    let path = get_wiz_home_dir()?
        .join("snapshots")
        .join(format!("{}.bin", prompt_hash_hex));

    if path.exists() {
        return Ok(InferenceSnapshot::load_from_disk(path).map_err(|err| {
            io::Error::new(
                io::ErrorKind::Other,
                format!("Could not load prompt snapshot: {err}"),
            )
        })?);
    }

    // If not, generate it
    let mut session = model.start_session(InferenceSessionParameters {
        memory_k_type: wiz_rs::ModelKVMemoryType::Float16,
        memory_v_type: wiz_rs::ModelKVMemoryType::Float16,
        ..Default::default()
    });

    let res = session.feed_prompt::<Infallible>(
        model,
        vocab,
        &InferenceParameters {
            ..Default::default()
        },
        prompt_prefix,
        |_| Ok(()),
    );

    if res.err().is_some() {
        eprintln!("Could not generate prompt snapshot");
        std::process::exit(1);
    }

    // Create parent directories if they don't exist
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();

    unsafe {
        let snapshot_ref = session.get_snapshot();
        match snapshot_ref.write_to_disk(&path) {
            Ok(_) => {
                log::info!(
                    "Successfully written prompt cache to {}",
                    path.to_string_lossy()
                );
            }
            Err(err) => {
                eprintln!("Could not restore prompt. Error: {err}");
                std::process::exit(1);
            }
        }
    }
    Ok(InferenceSnapshot::load_from_disk(path).map_err(|err| {
        io::Error::new(
            io::ErrorKind::Other,
            format!("Could not load prompt snapshot: {err}"),
        )
    })?)
}

#[derive(Default, Clone, Debug, PartialEq)]
pub struct CustomTokenBias(Rc<RefCell<String>>);

impl CustomTokenBias {
    pub fn new(bias: Rc<RefCell<String>>) -> Self {
        Self(bias)
    }
}

impl TokenBias for CustomTokenBias {
    fn get(&self, tid: u32) -> Option<f32> {
        if tid != EOD_TOKEN_ID {
            None
        } else {
            // If less than 2 newlines, prevent eod token
            let text = self.0.borrow();
            let code_end_index = text.find("```\n");

            // Need at least another token after the code block
            if code_end_index.is_none() || code_end_index.unwrap() + 4 >= text.len() {
                Some(-1.0)
            } else {
                None
            }
        }
    }
}

fn inference_worker(
    rx: flume::Receiver<InferenceRequest>,
    mut model: wiz_rs::Model,
    vocab: Tokenizer,
    snapshot: InferenceSnapshot,
) {
    while let Ok(req) = rx.recv() {
        let text: Rc<RefCell<String>> = Rc::new(RefCell::new("".to_string()));
        let inference_params = InferenceParameters {
            n_threads: 4 as i32,
            n_batch: 8,
            top_k: 1,
            top_p: 1.0,
            repeat_penalty: 0.00001,
            temp: 1.0,
            bias_tokens: Box::new(CustomTokenBias::new(text.clone())),
        };

        let mut rng = ThreadRng::default();

        let mut session = {
            match model.session_from_snapshot(snapshot.clone()) {
                Ok(session) => {
                    log::info!("Restored cached memory from snapshot");
                    session
                }
                Err(err) => {
                    log::error!("{err}");
                    std::process::exit(1);
                }
            }
        };

        let prompt = generate_prompt(&req.query);

        log::info!("Starting inference with query: {}", &req.query);

        let res = session.inference_with_prompt::<Infallible>(
            &model,
            &vocab,
            &inference_params,
            &prompt,
            None,
            &mut rng,
            |t| {
                {
                    let mut text = text.borrow_mut();
                    *text += &format!("{t}");
                }

                match t {
                    OutputToken::Token(_, false) => {
                        return Ok(());
                    }
                    _ => {}
                }

                _ = req
                    .response_sender
                    .send(InferenceResult::Token(t.to_string()));

                Ok(())
            },
        );

        match res {
            Ok(_) => {
                log::info!("Inference completed successfully");
            }
            Err(InferenceError::ContextFull) => {
                log::warn!("Context is not large enough to fit the prompt.");

                req.response_sender
                    .send(InferenceResult::Error(
                        "Context is not large enough to fit the prompt.".to_string(),
                    ))
                    .unwrap();
            }
            Err(wiz_rs::InferenceError::TokenizationFailed) => {
                log::error!("Failed to tokenize initial prompt.");

                req.response_sender
                    .send(InferenceResult::Error(
                        "Failed to tokenize initial prompt.".to_string(),
                    ))
                    .unwrap();
            }

            Err(wiz_rs::InferenceError::UserCallback(_)) => unreachable!("cannot fail"),
        }
    }
}

#[tokio::main]
async fn main() {
    env_logger::builder()
        .filter_level(log::LevelFilter::Info)
        .parse_default_env()
        .init();

    let (req_tx, req_rx) = flume::unbounded::<InferenceRequest>();
    let (model, vocab) = load_model().unwrap();
    let snapshot = load_prompt_snapshot(PROMPT_PREFIX, &model, &vocab).unwrap();
    let _inference_join_handle = spawn_blocking(move || {
        inference_worker(req_rx, model, vocab, snapshot);
    });

    let shared_state = Arc::new(Mutex::new(AppState {
        inference_tx: req_tx,
    }));
    let addr = SocketAddr::from(([127, 0, 0, 1], 8085));

    let app = Router::new()
        .route("/api/completions", post(sse_handler))
        .layer(Extension(shared_state));

    log::info!("Listening on http://{}", addr);

    // run our application with hyper
    axum::Server::bind(&addr)
        .serve(app.into_make_service())
        .await
        .unwrap();
}

// serde
#[derive(Serialize)]
struct SSECompletionMessage {
    text: String,
    r#type: String,
}

#[derive(Deserialize)]
struct CompletionRequest {
    query: String,
}

async fn sse_handler(
    Extension(state): Extension<Arc<Mutex<AppState>>>,
    Json(payload): Json<CompletionRequest>,
) -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    let query = payload.query;

    let mut saw_triple_backtick = false;

    let stream = async_stream::stream! {
        let (tx, rx) = flume::unbounded::<InferenceResult>();
        match state.lock().unwrap().inference_tx.send(InferenceRequest {
            query: query.to_string(),
            response_sender: tx,
        }) {
            Ok(_) => {

            }
            Err(_) => {
                log::error!("Could not send inference request");
                return;
            }
        }

        loop {
            let res = rx.recv();

            match res {
                Ok(InferenceResult::Token(t)) => {
                    if t == "```" {
                        if saw_triple_backtick {
                            break;
                        } else {
                            saw_triple_backtick = true;
                        }
                        continue;
                    }

                    let msg = SSECompletionMessage {
                        text: t,
                        r#type: if saw_triple_backtick {
                            "explanation".to_string()
                        } else {
                            "command".to_string()
                        },
                    };
                    yield Ok(Event::default().data(serde_json::to_string(&msg).unwrap()));
                }
                Ok(InferenceResult::Error(e)) => {
                    let msg = SSECompletionMessage {
                        text: e,
                        r#type: "error".to_string(),
                    };
                    yield Ok(Event::default().data(serde_json::to_string(&msg).unwrap()));
                }
                Err(_) => {
                    break;
                }
            }

        }
    };

    Sse::new(stream)
}
