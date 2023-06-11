use std::cell::RefCell;
use std::rc::Rc;
use std::{convert::Infallible, io::Write};

use cli_args::CLI_ARGS;
use colored::Colorize;
use rand::thread_rng;
use rand::SeedableRng;
use rustyline::error::ReadlineError;
use tokenizers::Tokenizer;
use wiz_rs::{
    ConstantTokenBias, InferenceError, InferenceParameters, InferenceSessionParameters,
    InferenceSnapshot, ModelKVMemoryType, TokenBias, EOD_TOKEN_ID,
};

mod cli_args;

fn repl_mode(
    model: &wiz_rs::Model,
    vocab: &Tokenizer,
    params: &InferenceParameters,
    session_params: &InferenceSessionParameters,
) {
    let mut rl = rustyline::DefaultEditor::new().unwrap();
    let mut session = model.start_session(*session_params);

    loop {
        let readline = rl.readline(">> ");
        match readline {
            Ok(line) => {
                let prompt = format!("<|USER|>{line}<|ASSISTANT|>");
                let mut rng = thread_rng();

                let mut sp = spinners::Spinner::new(spinners::Spinners::Dots2, "".to_string());
                if let Err(InferenceError::ContextFull) =
                    session.feed_prompt::<Infallible>(model, vocab, params, &prompt, |_| Ok(()))
                {
                    log::error!("Prompt exceeds context window length.")
                };
                sp.stop();

                let text: RefCell<String> = RefCell::new("".to_string());

                let res = session.inference_with_prompt::<Infallible>(
                    model,
                    vocab,
                    params,
                    "",
                    CLI_ARGS.num_predict,
                    &mut rng,
                    |tk| {
                        //if tk.to_string().replace("\n", "") == "" {
                        //   return Ok(());
                        //}
                        print!("{tk}");
                        let mut text = text.borrow_mut();
                        *text += &format!("{tk}");
                        std::io::stdout().flush().unwrap();
                        Ok(())
                    },
                );
                // Remove the line again
                // print!("\r\x1b[K");

                if let Err(InferenceError::ContextFull) = res {
                    log::error!("Reply exceeds context window l gth");
                }

                let text = text.into_inner().trim().to_string();

                println!("");
            }
            Err(ReadlineError::Eof) | Err(ReadlineError::Interrupted) => {
                break;
            }
            Err(err) => {
                log::error!("{err}");
            }
        }
    }
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
            if text.ends_with('\n') {
                return Some(-1.0);
            }

            let response_index = text.find("### Response:").unwrap_or(0);

            let n_newlines = text[response_index..]
                .chars()
                .filter(|c| *c == '\n')
                .count();

            if n_newlines < 4 {
                Some(-1.0)
            } else {
                None
            }
        }
    }
}

fn main() {
    env_logger::builder()
        .filter_level(log::LevelFilter::Info)
        .parse_default_env()
        .init();

    let args = &*CLI_ARGS;

    let inference_params = InferenceParameters {
        n_threads: args.num_threads as i32,
        n_batch: args.batch_size,
        top_k: args.top_k,
        top_p: args.top_p,
        repeat_penalty: args.repeat_penalty,
        temp: args.temp,
        bias_tokens: Box::new(args.token_bias.clone().unwrap_or_else(|| {
            if args.ignore_eos {
                ConstantTokenBias::new(vec![(EOD_TOKEN_ID, -1.0)])
            } else {
                ConstantTokenBias::default()
            }
        })),
    };
    let inference_session_params = {
        let mem_typ = if args.float16 {
            ModelKVMemoryType::Float16
        } else {
            ModelKVMemoryType::Float32
        };
        InferenceSessionParameters {
            memory_k_type: mem_typ,
            memory_v_type: mem_typ,
            last_n_size: args.repeat_last_n,
        }
    };

    let prompt = if let Some(path) = &args.prompt_file {
        match std::fs::read_to_string(path) {
            Ok(mut prompt) => {
                // Strip off the last character if it's exactly newline. Also strip off a single
                // carriage return if it's there. Since String must be valid UTF-8 it should be
                // guaranteed that looking at the string as bytes here is safe: UTF-8 non-ASCII
                // bytes will always the high bit set.
                if matches!(prompt.as_bytes().last(), Some(b'\n')) {
                    prompt.pop();
                }
                if matches!(prompt.as_bytes().last(), Some(b'\r')) {
                    prompt.pop();
                }
                prompt
            }
            Err(err) => {
                log::error!("Could not read prompt file at {path}. Error {err}");
                std::process::exit(1);
            }
        }
    } else if let Some(prompt) = &args.prompt {
        prompt.clone()
    } else if args.repl {
        "".into()
    } else {
        log::error!("No prompt or prompt file was provided. See --help");
        std::process::exit(1);
    };

    let (mut model, vocab) =
        wiz_rs::Model::load(&args.model_path, args.num_ctx_tokens as i32, |progress| {
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

    let mut rng = if let Some(seed) = CLI_ARGS.seed {
        rand::rngs::StdRng::seed_from_u64(seed)
    } else {
        rand::rngs::StdRng::from_entropy()
    };

    let mut session = if let Some(restore_path) = &args.restore_prompt {
        let snapshot = InferenceSnapshot::load_from_disk(restore_path);
        match snapshot.and_then(|snapshot| model.session_from_snapshot(snapshot)) {
            Ok(session) => {
                log::info!("Restored cached memory from {restore_path}");
                session
            }
            Err(err) => {
                log::error!("{err}");
                std::process::exit(1);
            }
        }
    } else {
        model.start_session(inference_session_params)
    };

    if args.repl {
        repl_mode(&model, &vocab, &inference_params, &inference_session_params);
    } else if let Some(cache_path) = &args.cache_prompt {
        let text: Rc<RefCell<String>> = Rc::new(RefCell::new("".to_string()));

        let new_inference_params: InferenceParameters = InferenceParameters {
            bias_tokens: Box::new(CustomTokenBias::new(text.clone())),
            ..inference_params
        };

        log::info!("Starting inference with prompt: {prompt}");

        let res = session.feed_prompt::<Infallible>(
            &model,
            &vocab,
            &new_inference_params,
            &prompt,
            |t| {
                print!("{t}");
                std::io::stdout().flush().unwrap();

                {
                    let mut text = text.borrow_mut();
                    *text += &format!("{t}");
                }

                Ok(())
            },
        );

        println!();

        match res {
            Ok(_) => (),
            Err(InferenceError::ContextFull) => {
                log::warn!(
                    "Context is not large enough to fit the prompt. Saving intermediate state."
                );
            }
            Err(wiz_rs::InferenceError::TokenizationFailed) => {
                log::error!("Failed to tokenize initial prompt. Exiting.");
                return;
            }
            Err(wiz_rs::InferenceError::UserCallback(_)) => unreachable!("cannot fail"),
        }

        // Write the memory to the cache file
        // SAFETY: no other model functions used inside the block
        unsafe {
            let memory = session.get_snapshot();
            match memory.write_to_disk(cache_path) {
                Ok(_) => {
                    log::info!("Successfully written prompt cache to {cache_path}");
                }
                Err(err) => {
                    eprintln!("Could not restore prompt. Error: {err}");
                    std::process::exit(1);
                }
            }
        }
    } else {
        let text: Rc<RefCell<String>> = Rc::new(RefCell::new("".to_string()));

        let new_inference_params: InferenceParameters = InferenceParameters {
            bias_tokens: Box::new(CustomTokenBias::new(text.clone())),
            ..inference_params
        };
        let res = session.inference_with_prompt::<Infallible>(
            &model,
            &vocab,
            &new_inference_params,
            &prompt,
            args.num_predict,
            &mut rng,
            |t| {
                print!("{}", t.to_string().yellow().bold());
                std::io::stdout().flush().unwrap();

                {
                    let mut text = text.borrow_mut();
                    *text += &format!("{t}");
                }

                Ok(())
            },
        );
        println!();

        match res {
            Ok(stats) => {
                println!("{}", stats);
            }
            Err(wiz_rs::InferenceError::ContextFull) => {
                log::warn!("Context window full, stopping inference.")
            }
            Err(wiz_rs::InferenceError::TokenizationFailed) => {
                log::error!("Failed to tokenize initial prompt.");
            }
            Err(wiz_rs::InferenceError::UserCallback(_)) => unreachable!("cannot fail"),
        }
    }
}
