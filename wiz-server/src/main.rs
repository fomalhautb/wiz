use axum::{extract::Query, routing::get, Extension, Router};
use rand::{rngs::ThreadRng, SeedableRng};
use std::{
    collections::HashMap,
    convert::Infallible,
    io::Write,
    net::SocketAddr,
    sync::{Arc, Mutex},
};
use tokenizers::{Model, Tokenizer};
use wiz_rs::{
    ConstantTokenBias, InferenceError, InferenceParameters, InferenceSessionParameters,
    InferenceSnapshot, ModelKVMemoryType,
};

struct AppState {
    model: Mutex<wiz_rs::Model>,
    vocab: Tokenizer,
    rng: rand::rngs::StdRng,
    snapshot: InferenceSnapshot,
}

#[tokio::main]
async fn main() {
    let model_path = "/Users/lmoeller/github/Replit-v1-CodeInstruct-3B-fp16/ggml-model-q4-0.bin";

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

    let rng = rand::rngs::StdRng::from_entropy();

    let snapshot = InferenceSnapshot::load_from_disk("convert_to_command.bin");

    let shared_state = Arc::new(Mutex::new(AppState {
        model: Mutex::new(model),
        vocab: vocab,
        rng: rng,
        snapshot: snapshot.unwrap(),
    }));
    let addr = SocketAddr::from(([0, 0, 0, 0], 8085));

    let app = Router::new()
        .route("/api", get(handler))
        .layer(Extension(shared_state));

    println!("Listening on http://{}", addr);

    // run our application with hyper
    axum::Server::bind(&addr)
        .serve(app.into_make_service())
        .await
        .unwrap();
}

const PROMPT_TEMPLATE: &str = "{input}\n\n### Response:\n```bash\n";

fn generate_prompt(input: &str) -> String {
    PROMPT_TEMPLATE.replace("{input}", input)
}

async fn handler(
    Extension(state): Extension<Arc<Mutex<AppState>>>,
    Query(query): Query<HashMap<String, String>>,
) -> String {
    let q = query.get("q").unwrap();

    let inference_params = InferenceParameters {
        n_threads: 4 as i32,
        n_batch: 8,
        top_k: 1,
        top_p: 1.0,
        repeat_penalty: 0.00001,
        temp: 1.0,
        bias_tokens: Box::new(ConstantTokenBias::default()),
    };

    let app_state = state.lock().unwrap();
    let model = &mut app_state.model.lock().unwrap();
    let vocab = &app_state.vocab;
    let mut rng = ThreadRng::default();

    let mut session = {
        println!("Loading cached memory from disk...");

        match model.session_from_snapshot(app_state.snapshot.clone()) {
            Ok(session) => {
                log::info!("Restored cached memory from");
                session
            }
            Err(err) => {
                log::error!("{err}");
                std::process::exit(1);
            }
        }
    };

    let prompt = generate_prompt(q);

    println!("Starting inference with prompt: {prompt}");

    let generated_text = Arc::new(Mutex::new(String::new()));
    let res = session.inference_with_prompt::<Infallible>(
        &model,
        &vocab,
        &inference_params,
        &prompt,
        None,
        &mut rng,
        |t| {
            print!("{t}");
            std::io::stdout().flush().unwrap();

            let mut generated_text = generated_text.lock().unwrap();
            generated_text.push_str(format!("{}", t).as_str());

            Ok(())
        },
    );

    match res {
        Ok(_) => {
            log::info!("Inference completed successfully.");
        }
        Err(InferenceError::ContextFull) => {
            log::warn!("Context is not large enough to fit the prompt. Saving intermediate state.");
        }
        Err(wiz_rs::InferenceError::TokenizationFailed) => {
            log::error!("Failed to tokenize initial prompt. Exiting.");
            return "Failed to tokenize initial prompt. Exiting.".to_string();
        }
        Err(wiz_rs::InferenceError::UserCallback(_)) => unreachable!("cannot fail"),
    }

    let generated_text = generated_text.lock().unwrap();
    let lines = generated_text.lines().collect::<Vec<_>>();

    for (i, line) in lines.iter().enumerate() {
        println!("{}: {}", i, line);
    }

    let bash_command = lines[4].trim();
    let explanation = if lines.len() > 6 {
        lines[6..].join("\n").trim().to_string()
    } else {
        "".to_string()
    };

    format!("{}\n{}", bash_command, explanation)
}
