mod ggml;

use std::{
    collections::{HashMap, VecDeque},
    fmt::Display,
    io::{BufRead, Read, Seek, SeekFrom},
    mem::size_of,
    path::{Path, PathBuf},
    str::FromStr,
    time,
};

use thiserror::Error;

use partial_sort::PartialSort;
use tokenizers::{models::unigram::Unigram, ModelWrapper, Tokenizer};

pub const EOD_TOKEN_ID: TokenId = 1; // Hardcoded (for now?)

#[derive(Debug, Default, PartialEq, Eq, PartialOrd, Ord)]
pub struct Hyperparameters {
    d_model: i32,
    max_seq_len: i32,
    n_heads: i32,
    n_layers: i32,
    n_vocab: i32,
    ftype: ggml::Type,
}

struct Layer {
    // pre normalization
    ln_1_weight: ggml::Tensor,

    // attention
    attn_wqkv_weight: ggml::Tensor,
    attn_out_proj_weight: ggml::Tensor,

    // post normalization
    ln_2_weight: ggml::Tensor,

    // ff
    mlp_up_weight: ggml::Tensor,
    mlp_down_weight: ggml::Tensor,
}

/// The weights for the LLaMA model. All the mutable state is split into a
/// separate struct `InferenceSession`.
pub struct Model {
    hparams: Hyperparameters,

    // word embedding
    wte_weight: ggml::Tensor,

    // final normalization
    ln_f_weight: ggml::Tensor,

    layers: Vec<Layer>,

    // Must be kept alive for the model
    _context: ggml::Context,
    tensors: HashMap<String, ggml::Tensor>,
}

/// An inference session represents the state of the text generation. This holds
/// the full context window, as long as several additional parameters used
/// during sampling.
pub struct InferenceSession {
    // Must be kept alive for the model
    _session_ctx: ggml::Context,

    // Parameters for the session.
    params: InferenceSessionParameters,

    memory_k: ggml::Tensor,
    memory_v: ggml::Tensor,

    /// How many tokens have been fed into the model's working memory so far.
    n_past: usize,

    /// How much memory is required per token for the temporary context used
    /// during inference.
    mem_per_token: usize,

    /// Stores the last N tokens (N is given at construction) to penalize
    /// repetitions during sampling.
    last_n_tokens: VecDeque<TokenId>,

    /// The logits that were last predicted by the network. Zeroed out otherwise.
    last_logits: Vec<f32>,
}

// Allowed types for the model memory K/V tensors.
#[repr(i32)]
#[derive(Clone, Copy, Debug, PartialEq, serde::Serialize, serde::Deserialize)]
pub enum ModelKVMemoryType {
    Float16,
    Float32,
}

impl From<ModelKVMemoryType> for i32 {
    fn from(value: ModelKVMemoryType) -> Self {
        match value {
            ModelKVMemoryType::Float16 => ggml::TYPE_F16,
            ModelKVMemoryType::Float32 => ggml::TYPE_F32,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, serde::Serialize, serde::Deserialize)]
// Parameters for an inference session.
pub struct InferenceSessionParameters {
    pub last_n_size: usize,
    pub memory_k_type: ModelKVMemoryType,
    pub memory_v_type: ModelKVMemoryType,
}

impl Default for InferenceSessionParameters {
    fn default() -> Self {
        Self {
            last_n_size: 512,
            memory_k_type: ModelKVMemoryType::Float32,
            memory_v_type: ModelKVMemoryType::Float32,
        }
    }
}

/// The parameters that drive text generation.
pub struct InferenceParameters {
    pub n_threads: i32,
    pub n_batch: usize,
    pub top_k: usize,
    pub top_p: f32,
    pub repeat_penalty: f32,
    pub temp: f32,
    pub bias_tokens: TokenBias,
}

impl Default for InferenceParameters {
    fn default() -> Self {
        Self {
            n_threads: 4,
            n_batch: 1,
            top_k: 1,
            top_p: 0.95,
            repeat_penalty: 0.0,
            temp: 0.1,
            bias_tokens: TokenBias::default(),
        }
    }
}

pub struct InferenceStats {
    pub feed_prompt_duration: std::time::Duration,
    pub prompt_tokens: usize,
    pub predict_duration: std::time::Duration,
    pub predict_tokens: usize,
}

impl Default for InferenceStats {
    fn default() -> Self {
        Self {
            feed_prompt_duration: std::time::Duration::from_secs(0),
            prompt_tokens: 0,
            predict_duration: std::time::Duration::from_secs(0),
            predict_tokens: 0,
        }
    }
}

impl Display for InferenceStats {
    fn fmt(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
        write!(
            f,
            "feed_prompt_duration: {}ms\nprompt_tokens: {}\npredict_duration: {}ms\npredict_tokens: {}\nper_token_duration: {:.3}ms",
            self.feed_prompt_duration.as_millis(),
            self.prompt_tokens,
            self.predict_duration.as_millis(),
            self.predict_tokens,
            (self.predict_duration.as_millis() as f64) / (self.predict_tokens as f64),
        )
    }
}

type TokenId = u32;

#[derive(serde::Serialize)]
/// A serializable snapshot of the inference process. Can be saved to disk.
/// Useful for prompt caching.
pub struct InferenceSnapshotRef<'a> {
    /// How many tokens have been stored in the memory so far.
    pub npast: usize,
    // Parameters associated with the saved inference session.
    pub session_params: InferenceSessionParameters,
    /// The contents of the 'key' memory tensor
    pub memory_k: &'a [u8],
    /// The contents of the 'value' memory tensor
    pub memory_v: &'a [u8],
    /// The last n tokens that were predicted during generation
    pub last_n_tokens: VecDeque<TokenId>,
    /// The vector of logits that was produced after the last inference
    pub logits: Vec<f32>,
}

/// A serializable snapshot of the inference process. Can be restored by calling
/// `Model::restore_from_snapshot`. Useful for prompt caching.
#[derive(serde::Deserialize)]
pub struct InferenceSnapshot {
    /// How many tokens have been stored in the memory so far.
    pub npast: usize,
    // Parameters associated with the saved inference session.
    pub session_params: InferenceSessionParameters,
    /// The contents of the 'key' memory tensor
    pub memory_k: Vec<u8>,
    /// The contents of the 'value' memory tensor
    pub memory_v: Vec<u8>,
    /// The last n tokens that were predicted during generation
    pub last_n_tokens: VecDeque<TokenId>,
    /// The vector of logits that was produced after the last inference
    pub last_logits: Vec<f32>,
}

#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub enum OutputToken {
    Token(String),
    EndOfText,
}
impl Display for OutputToken {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "{}",
            match self {
                OutputToken::Token(t) => t,
                OutputToken::EndOfText => "",
            }
        )
    }
}

#[derive(Default, Clone, Debug, PartialEq)]
pub struct TokenBias(Vec<(TokenId, f32)>);

impl TokenBias {
    pub fn new(mut v: Vec<(TokenId, f32)>) -> Self {
        v.sort_by_cached_key(|(tid, _)| *tid);
        v.dedup_by_key(|(tid, _)| *tid);
        Self(v)
    }

    pub fn get(&self, tid: TokenId) -> Option<f32> {
        self.0
            .binary_search_by_key(&tid, |(tid, _)| *tid)
            .map(|idx| self.0[idx].1)
            .ok()
    }
}

impl FromStr for TokenBias {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        let x = s
            .split(',')
            .map(|kv| {
                let (k, v) = kv
                    .trim()
                    .split_once('=')
                    .ok_or_else(|| "Missing '=' in bias item".to_owned())?;
                let tid: TokenId = k
                    .trim()
                    .parse()
                    .map_err(|e: std::num::ParseIntError| e.to_string())?;
                let bias: f32 = v
                    .trim()
                    .parse()
                    .map_err(|e: std::num::ParseFloatError| e.to_string())?;
                Result::<_, String>::Ok((tid, bias))
            })
            .collect::<Result<_, _>>()?;
        Ok(TokenBias::new(x))
    }
}

impl std::fmt::Display for TokenBias {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{:?}", self.0)
    }
}

/// Each variant represents a step within the process of loading the model.
/// These can be used to report progress to the user.
#[derive(Clone, PartialEq, Eq, PartialOrd, Ord, Debug)]
pub enum LoadProgress<'a> {
    HyperparametersLoaded(&'a Hyperparameters),
    BadToken {
        index: usize,
    },
    ContextSize {
        bytes: usize,
    },
    MemorySize {
        bytes: usize,
        n_mem: usize,
    },
    PartLoading {
        file: &'a Path,
        current_part: usize,
        total_parts: usize,
    },
    PartTensorLoaded {
        file: &'a Path,
        current_tensor: usize,
        tensor_count: usize,
    },
    PartLoaded {
        file: &'a Path,
        byte_size: usize,
        tensor_count: usize,
    },
}

#[derive(Error, Debug)]
pub enum LoadError {
    #[error("could not open file {path:?}")]
    OpenFileFailed {
        source: std::io::Error,
        path: PathBuf,
    },
    #[error("no parent path for {path:?}")]
    NoParentPath { path: PathBuf },
    #[error("unable to read exactly {bytes} bytes")]
    ReadExactFailed {
        source: std::io::Error,
        bytes: usize,
    },
    #[error("non-specific I/O error")]
    IO(#[from] std::io::Error),

    #[error("could not convert bytes to a UTF-8 string")]
    InvalidUtf8(#[from] std::string::FromUtf8Error),
    #[error("invalid integer conversion")]
    InvalidIntegerConversion(#[from] std::num::TryFromIntError),

    #[error("unversioned magic number, regenerate your ggml models")]
    UnversionedMagic,
    #[error("invalid magic number for {path:?}")]
    InvalidMagic { path: PathBuf },
    #[error("invalid file format version {value}")]
    InvalidFormatVersion { value: u32 },
    #[error("invalid value {value} for `f16` in hyperparameters")]
    HyperparametersF16Invalid { value: i32 },
    #[error("unknown tensor `{tensor_name}` in {path:?}")]
    UnknownTensor { tensor_name: String, path: PathBuf },
    #[error("the tensor `{tensor_name}` has the wrong size in {path:?}")]
    TensorWrongSize { tensor_name: String, path: PathBuf },
    #[error("invalid ftype {ftype} in {path:?}")]
    InvalidFtype { ftype: i32, path: PathBuf },
}

#[derive(Error, Debug)]
pub enum SnapshotError {
    #[error("I/O error while writing model memory")]
    IO(#[from] std::io::Error),
    #[error("error during snapshot serialization")]
    Serialization(#[from] bincode::Error),
    #[error("could not write memory due to size mismatch (self={self_size}, input={input_size})")]
    MemorySizeMismatch { self_size: usize, input_size: usize },
}

#[derive(Error, Debug)]
pub enum InferenceError {
    #[error("an invalid token was encountered during tokenization")]
    TokenizationFailed,
    #[error("the context window is full")]
    ContextFull,
    #[error("the user-specified callback returned an error")]
    UserCallback(Box<dyn std::error::Error>),
}

/// NOTE: The original code relies in promotion rules and automatic cast between
/// int to float. What we do instead is use this macro to convert every term of
/// the multiplication to f64, which should have enough precision bits to hold
/// the final value, then cast to usize. I have observed a discrepancy between
/// the ctx_size found using this code, and the one in llama.cpp. The number for
/// rust ends up being slightly lower, but no "out of memory" errors are
/// reported by ggml.
macro_rules! mulf {
    ($term:expr, $($terms:expr),*) => {
        (($term as f64) $(* ($terms as f64))*) as u64
    };
}

impl Model {
    pub fn load(
        path: impl AsRef<Path>,
        n_ctx: i32,
        load_progress_callback: impl Fn(LoadProgress),
    ) -> Result<(Model, Tokenizer), LoadError> {
        use std::fs::File;
        use std::io::BufReader;

        let main_path = path.as_ref();

        let mut reader =
            BufReader::new(
                File::open(main_path).map_err(|e| LoadError::OpenFileFailed {
                    source: e,
                    path: main_path.to_owned(),
                })?,
            );

        fn read_bytes<const N: usize>(reader: &mut impl BufRead) -> Result<[u8; N], LoadError> {
            let mut bytes = [0u8; N];
            reader
                .read_exact(&mut bytes)
                .map_err(|e| LoadError::ReadExactFailed {
                    source: e,
                    bytes: N,
                })?;
            Ok(bytes)
        }

        fn read_i32(reader: &mut impl BufRead) -> Result<i32, LoadError> {
            Ok(i32::from_le_bytes(read_bytes::<4>(reader)?))
        }

        fn read_f32(reader: &mut impl BufRead) -> Result<f32, LoadError> {
            Ok(f32::from_le_bytes(read_bytes::<4>(reader)?))
        }

        /// Helper function. Reads a string from the buffer and returns it.
        fn read_string(reader: &mut BufReader<File>, len: usize) -> Result<String, LoadError> {
            let mut buf = vec![0; len];
            reader
                .read_exact(&mut buf)
                .map_err(|e| LoadError::ReadExactFailed {
                    source: e,
                    bytes: buf.len(),
                })?;
            let s = String::from_utf8(buf)?;
            Ok(s)
        }

        // Verify magic
        _ = read_i32(&mut reader)?;

        // =================
        // Load hyper params
        // =================

        // NOTE: Field order matters! Data is laid out in the file exactly
        // in this order.
        let hparams = Hyperparameters {
            d_model: read_i32(&mut reader)?,
            max_seq_len: read_i32(&mut reader)?,
            n_heads: read_i32(&mut reader)?,
            n_layers: read_i32(&mut reader)?,
            n_vocab: read_i32(&mut reader)?,
            ftype: read_i32(&mut reader)?,
        };

        println!("Hyperparameters: {:?}", hparams);

        load_progress_callback(LoadProgress::HyperparametersLoaded(&hparams));

        // ===============
        // Load vocabulary
        // ===============
        let ws_string = String::from_utf8(vec![226, 150, 129]).unwrap();
        let vocab = {
            let mut vocab: Vec<(String, f64)> = Vec::with_capacity(hparams.n_vocab as usize);
            for i in 0..hparams.n_vocab {
                let len = read_i32(&mut reader)?;
                if let Ok(word) = read_string(&mut reader, len as usize) {
                    let score = read_f32(&mut reader)?;
                    let word = word.replace(&ws_string, " ");
                    vocab.push((word, score as f64));
                } else {
                    load_progress_callback(LoadProgress::BadToken {
                        index: i.try_into()?,
                    });
                    vocab.push(("<unk>".to_owned(), 0.0));
                }
            }

            let tokenizer: Tokenizer = Tokenizer::new(Into::<ModelWrapper>::into(
                Unigram::from(vocab, Some(0)).unwrap(),
            ));

            tokenizer
        };

        // for the big tensors, we have the option to store the data in 16-bit
        // floats or quantized in order to save memory and also to speed up the
        // computation
        let wtype = match hparams.ftype {
            0 => ggml::TYPE_F32,
            1 => ggml::TYPE_F16,
            2 => ggml::TYPE_Q4_0,
            3 => ggml::TYPE_Q4_1,
            invalid => return Err(LoadError::HyperparametersF16Invalid { value: invalid }),
        };

        let n_embd = hparams.d_model;
        let n_layer = hparams.n_layers;
        let n_vocab = hparams.n_vocab;

        let ctx_size = {
            // Use 64-bit math to prevent overflow.
            let n_embd = n_embd as u64;
            let n_layer = n_layer as u64;
            let n_vocab = n_vocab as u64;

            let mut ctx_size: u64 = 0;

            // wte
            ctx_size += mulf!(n_embd, n_vocab, ggml::type_sizef(wtype));

            {
                // ln_1_weight
                ctx_size += mulf!(n_layer, n_embd, ggml::type_sizef(ggml::TYPE_F32));
                // attn_Wqkv_weight
                ctx_size += mulf!(n_layer, n_embd, n_embd, 3, ggml::type_sizef(wtype));

                // attn_out_proj_weight
                ctx_size += mulf!(n_layer, n_embd, n_embd, ggml::type_sizef(wtype));
                // ln_2_weight
                ctx_size += mulf!(n_layer, n_embd, ggml::type_sizef(wtype));

                // mlp_up_weight
                ctx_size += mulf!(n_layer, 4, n_embd, n_embd, ggml::type_sizef(wtype));
                // mlp_down_weight
                ctx_size += mulf!(n_layer, n_embd, n_embd, 4, ggml::type_sizef(wtype));
            }

            ctx_size += mulf!(n_ctx, n_layer, n_embd, ggml::type_sizef(ggml::TYPE_F32)); // memory_k
            ctx_size += mulf!(n_ctx, n_layer, n_embd, ggml::type_sizef(ggml::TYPE_F32)); // memory_v

            ctx_size += (6 + 16 * n_layer) * 256; // object overhead

            load_progress_callback(LoadProgress::ContextSize {
                bytes: ctx_size.try_into()?,
            });

            ctx_size
        };

        // Initialize the context
        let context = ggml::Context::init(ctx_size as usize);

        let model = {
            let mut tensors = HashMap::new();

            let wte_weight = context.new_tensor_2d(wtype, n_embd, n_vocab);
            let ln_f_weight = context.new_tensor_1d(ggml::TYPE_F32, n_embd);

            // map by name
            tensors.insert("transformer.wte.weight".to_owned(), wte_weight.share());
            println!("wte shape: {:?}", (wtype, n_embd, n_vocab));
            tensors.insert("transformer.ln_f.weight".to_owned(), ln_f_weight.share());

            let mut layers = Vec::new();
            for i in 0..n_layer {
                let layer = Layer {
                    ln_1_weight: context.new_tensor_1d(ggml::TYPE_F32, n_embd),
                    attn_wqkv_weight: context.new_tensor_2d(wtype, n_embd, 3 * n_embd),
                    attn_out_proj_weight: context.new_tensor_2d(wtype, n_embd, n_embd),
                    ln_2_weight: context.new_tensor_1d(ggml::TYPE_F32, n_embd),
                    mlp_up_weight: context.new_tensor_2d(wtype, n_embd, 4 * n_embd),
                    mlp_down_weight: context.new_tensor_2d(wtype, 4 * n_embd, n_embd),
                };

                // map by name
                // Layernorms
                tensors.insert(
                    format!("transformer.blocks.{i}.ln_1.weight"),
                    layer.ln_1_weight.share(),
                );
                tensors.insert(
                    format!("transformer.blocks.{i}.attn.Wqkv.weight"),
                    layer.attn_wqkv_weight.share(),
                );
                tensors.insert(
                    format!("transformer.blocks.{i}.attn.out_proj.weight"),
                    layer.attn_out_proj_weight.share(),
                );
                tensors.insert(
                    format!("transformer.blocks.{i}.ln_2.weight"),
                    layer.ln_2_weight.share(),
                );
                tensors.insert(
                    format!("transformer.blocks.{i}.mlp.mlp_up.weight"),
                    layer.mlp_up_weight.share(),
                );
                tensors.insert(
                    format!("transformer.blocks.{i}.mlp.mlp_down.weight"),
                    layer.mlp_down_weight.share(),
                );

                layers.push(layer);
            }

            Model {
                hparams,
                ln_f_weight,
                wte_weight,
                layers,
                tensors,
                _context: context,
            }
        };

        // Close the file, but keep its offset. That way we know how to skip the
        // metadata when loading the parts.
        let file_offset = reader.stream_position()?;
        drop(reader);

        let paths = {
            let main_filename = main_path.file_name().and_then(|p| p.to_str());

            let mut paths: Vec<PathBuf> =
                std::fs::read_dir(main_path.parent().ok_or_else(|| LoadError::NoParentPath {
                    path: main_path.to_owned(),
                })?)?
                .filter_map(Result::ok)
                .map(|de| de.path())
                .filter(|p| {
                    p.file_name()
                        .and_then(|p| p.to_str())
                        .zip(main_filename)
                        .map(|(part_filename, main_filename)| {
                            part_filename.starts_with(main_filename)
                        })
                        .unwrap_or(false)
                })
                .collect();
            paths.sort();
            paths
        };

        let n_parts = paths.len();

        for (i, part_path) in paths.into_iter().enumerate() {
            let part_id = i;

            load_progress_callback(LoadProgress::PartLoading {
                file: &part_path,
                current_part: i + 1,
                total_parts: n_parts,
            });

            let mut part_reader = BufReader::new(File::open(&part_path)?);

            // Skip metadata
            part_reader.seek(SeekFrom::Start(file_offset))?;

            let mut total_size = 0;
            let mut n_tensors = 0;

            // Load weights
            loop {
                // NOTE: Implementation from #![feature(buf_read_has_data_left)]
                let is_eof = part_reader.fill_buf().map(|b| b.is_empty())?;

                if is_eof {
                    break;
                }

                let n_dims = read_i32(&mut part_reader)?;
                let length = read_i32(&mut part_reader)?;
                let ftype = read_i32(&mut part_reader)?;

                let mut nelements = 1;
                let mut ne = [1i64, 1i64];
                for i in 0..n_dims {
                    ne[i as usize] = read_i32(&mut part_reader)? as i64;
                    nelements *= ne[i as usize];
                }

                let tensor_name = read_string(&mut part_reader, length as usize)?;

                let Some(tensor) = model.tensors.get(&tensor_name)
                    else {
                        return Err(LoadError::UnknownTensor { tensor_name, path: part_path });
                    };

                // split_type = 0: split by columns
                // split_type = 1: split by rows
                //
                // split_type = 0:
                // regex:
                //   - tok_embeddings.*
                //   - layers.*.attention.wo.weight
                //   - layers.*.feed_forward.w2.weight

                // split_type = 1:
                // regex:
                //   - output.*
                //   - layers.*.attention.wq.weight
                //   - layers.*.attention.wk.weight
                //   - layers.*.attention.wv.weight
                //   - layers.*.feed_forward.w1.weight
                //   - layers.*.feed_forward.w3.weight
                #[allow(clippy::if_same_then_else)]
                let split_type = 0;

                if n_dims == 1 {
                    if tensor.nelements() != nelements {
                        return Err(LoadError::TensorWrongSize {
                            tensor_name,
                            path: part_path,
                        });
                    }
                } else if tensor.nelements() / i64::try_from(n_parts)? != nelements {
                    return Err(LoadError::TensorWrongSize {
                        tensor_name,
                        path: part_path,
                    });
                }

                if n_dims == 1 {
                    if tensor.get_ne()[0] != ne[0] || tensor.get_ne()[1] != ne[1] {
                        return Err(LoadError::TensorWrongSize {
                            tensor_name,
                            path: part_path,
                        });
                    }
                } else if split_type == 0 {
                    if tensor.get_ne()[0] / i64::try_from(n_parts)? != ne[0]
                        || tensor.get_ne()[1] != ne[1]
                    {
                        return Err(LoadError::TensorWrongSize {
                            tensor_name,
                            path: part_path,
                        });
                    }
                } else if tensor.get_ne()[0] != ne[0]
                    || tensor.get_ne()[1] / i64::try_from(n_parts)? != ne[1]
                {
                    return Err(LoadError::TensorWrongSize {
                        tensor_name,
                        path: part_path,
                    });
                }

                let bpe = match ftype {
                    0 => ggml::type_size(ggml::TYPE_F32),
                    1 => ggml::type_size(ggml::TYPE_F16),
                    2 => {
                        assert_eq!(ne[0] % 64, 0);
                        ggml::type_size(ggml::TYPE_Q4_0)
                    }
                    3 => {
                        assert_eq!(ne[0] % 64, 0);
                        ggml::type_size(ggml::TYPE_Q4_1)
                    }
                    _ => {
                        return Err(LoadError::InvalidFtype {
                            ftype,
                            path: part_path,
                        })
                    }
                };

                if n_dims == 1 || n_parts == 1 {
                    if (nelements as usize * bpe) / ggml::blck_size(tensor.get_type()) as usize
                        != tensor.nbytes()
                    {
                        return Err(LoadError::TensorWrongSize {
                            tensor_name,
                            path: part_path,
                        });
                    }

                    let data = tensor.data();

                    if part_id == 0 {
                        // SAFETY: yolo, same as original code
                        let slice = unsafe {
                            std::slice::from_raw_parts_mut(data as *mut u8, tensor.nbytes())
                        };
                        part_reader.read_exact(slice)?;
                    } else {
                        part_reader.seek(SeekFrom::Current(tensor.nbytes() as i64))?;
                    }

                    total_size += tensor.nbytes();
                } else {
                    if (nelements as usize * bpe) / ggml::blck_size(tensor.get_type()) as usize
                        != tensor.nbytes() / n_parts
                    {
                        return Err(LoadError::TensorWrongSize {
                            tensor_name,
                            path: part_path,
                        });
                    }

                    if split_type == 0 {
                        let np0 = ne[0];
                        let row_size = (tensor.get_ne()[0]
                            / (ggml::blck_size(tensor.get_type()) as i64))
                            as usize
                            * ggml::type_size(tensor.get_type());

                        assert_eq!(row_size, tensor.get_nb()[1]);

                        for i1 in 0..ne[1] {
                            let offset_row = i1 as usize * row_size;
                            let offset = offset_row
                                + ((part_id * np0 as usize)
                                    / ggml::blck_size(tensor.get_type()) as usize)
                                    * ggml::type_size(tensor.get_type());
                            // SAFETY: yolo, same as original code
                            unsafe {
                                let ptr = tensor.data().add(offset);
                                let slice = std::slice::from_raw_parts_mut(
                                    ptr as *mut u8,
                                    row_size / n_parts,
                                );
                                part_reader.read_exact(slice)?;
                            }
                        }
                    } else {
                        let np1 = ne[1];
                        let row_size = (tensor.get_ne()[0]
                            / (ggml::blck_size(tensor.get_type()) as i64))
                            as usize
                            * ggml::type_size(tensor.get_type());

                        for i1 in 0..ne[1] {
                            let offset_row = (i1 as usize + part_id * np1 as usize) * row_size;
                            // SAFETY: yolo, same as original code
                            unsafe {
                                let ptr = tensor.data().add(offset_row);
                                let slice =
                                    std::slice::from_raw_parts_mut(ptr as *mut u8, row_size);
                                part_reader.read_exact(slice)?;
                            }
                        }
                    }

                    total_size += tensor.nbytes() / n_parts;
                }

                n_tensors += 1;
                load_progress_callback(LoadProgress::PartTensorLoaded {
                    file: &part_path,
                    current_tensor: n_tensors.try_into()?,
                    tensor_count: model.tensors.len(),
                });
            }

            load_progress_callback(LoadProgress::PartLoaded {
                file: &part_path,
                byte_size: total_size,
                tensor_count: n_tensors.try_into()?,
            });
        }

        Ok((model, vocab))
    }

    /// Starts a new `InferenceSession` for this model.
    pub fn start_session(&self, params: InferenceSessionParameters) -> InferenceSession {
        let Hyperparameters {
            max_seq_len: n_ctx,
            d_model: n_embd,
            n_layers: n_layer,

            n_vocab,
            ..
        } = self.hparams;

        let ctx_size = {
            let mut ctx_size = 0;
            ctx_size += mulf!(
                n_ctx,
                n_layer,
                n_embd,
                ggml::type_sizef(params.memory_k_type.into())
            ); // memory_k
            ctx_size += mulf!(
                n_ctx,
                n_layer,
                n_embd,
                ggml::type_sizef(params.memory_v_type.into())
            ); // memory_v
            ctx_size += (5 + 10 * n_layer as u64) * 256; // object overhead
            ctx_size
        };

        let session_ctx = ggml::Context::init(ctx_size as usize);

        // Initialize key + value memory tensors
        let n_mem = n_layer * n_ctx;
        let n_elements = n_embd * n_mem;
        let memory_k = session_ctx.new_tensor_1d(params.memory_k_type.into(), n_elements);
        let memory_v = session_ctx.new_tensor_1d(params.memory_v_type.into(), n_elements);

        InferenceSession {
            _session_ctx: session_ctx,
            params,
            memory_k,
            memory_v,
            n_past: 0,
            mem_per_token: 0,
            last_n_tokens: VecDeque::from(vec![0; params.last_n_size]),
            last_logits: vec![0.0; n_vocab as usize],
        }
    }

    pub fn sample_top_p_top_k(
        &self,
        session: &InferenceSession,
        params: &InferenceParameters,
        rng: &mut impl rand::Rng,
    ) -> TokenId {
        let logits = &session.last_logits;
        let n_logits = logits.len();
        let mut logits_id = Vec::<(f32, TokenId)>::with_capacity(n_logits);

        {
            let scale = 1.0 / params.temp;
            for (i, &logit) in logits.iter().enumerate() {
                let tid = i as TokenId;

                // repetition penalty from CTRL paper (https://arxiv.org/abs/1909.05858)
                // credit https://github.com/facebookresearch/llama/compare/main...shawwn:llama:main
                let val = logit * scale;
                logits_id.push((val, tid));
            }
        }

        // find the top K tokens
        logits_id.partial_sort(params.top_k, |a, b| {
            // Sort descending
            b.0.total_cmp(&a.0)
        });
        logits_id.truncate(params.top_k);

        //println!("top_k: {:?}", logits_id);

        logits_id[0].1
    }

    /// Evaluates the transformer.
    pub fn evaluate(
        &self,
        session: &mut InferenceSession,
        n_threads: i32,
        input_tokens: &[TokenId],
    ) {
        let n = input_tokens.len();
        let n_past = session.n_past as i32;

        let Hyperparameters {
            n_vocab,
            max_seq_len: n_ctx,
            d_model: n_embd,
            n_heads: n_head,
            n_layers: n_layer,
            ..
        } = self.hparams;

        // For the first run, we need to guess a maximum buffer size so we can measure
        // the actual memory consumption of the temporary ggml context.
        let mut buf_size = 1024 * 1024 * 1024;
        if session.mem_per_token > 0 && session.mem_per_token * n > buf_size {
            // add 10% to account for ggml object overhead
            buf_size = (1.1f64 * session.mem_per_token as f64 * n as f64) as usize;
        };
        let ctx0 = ggml::Context::init(buf_size);

        let mut gf = ggml::ComputationGraph::new(n_threads);

        let embd = ctx0.new_tensor_1d(ggml::TYPE_I32, n as i32);
        unsafe { embd.write_data(bytemuck::cast_slice(input_tokens)) };

        let mut input_layer = ctx0.op_get_rows(&self.wte_weight, &embd);

        for il in 0..n_layer as usize {
            let mut current: ggml::Tensor;

            // a = self.ln_1(x)
            {
                current = ctx0.op_norm(&input_layer);

                // cur = attention_norm * cur
                current = ctx0.op_mul(
                    &ctx0.op_repeat(&self.layers[il].ln_1_weight, &current),
                    &current,
                )
            }

            // self-attention
            //  b, _, past_key_value = self.attn(a, past_key_value=past_key_value,
            //  attn_bias=attn_bias, attention_mask=attention_mask,
            //  is_causal=is_causal)
            {
                // weight
                current = ctx0.op_mul_mat(&self.layers[il].attn_wqkv_weight, &current);

                // Add bias
                let q_current = ctx0.op_view_2d(
                    &current,
                    n_embd,
                    n.try_into().unwrap(),
                    current.get_nb()[1],
                    0 * size_of::<f32>() * (n_embd as usize),
                );
                let k_current = ctx0.op_view_2d(
                    &current,
                    n_embd,
                    n.try_into().unwrap(),
                    current.get_nb()[1],
                    1 * size_of::<f32>() * (n_embd as usize),
                );
                let v_current = ctx0.op_view_2d(
                    &current,
                    n_embd,
                    n.try_into().unwrap(),
                    current.get_nb()[1],
                    2 * size_of::<f32>() * (n_embd as usize),
                );

                // store key and value to memory
                {
                    let k = ctx0.op_view_1d(
                        &session.memory_k,
                        n as i32 * n_embd,
                        (session.memory_k.element_size() * n_embd as usize)
                            * (il * n_ctx as usize + n_past as usize),
                    );

                    let v = ctx0.op_view_1d(
                        &session.memory_v,
                        n as i32 * n_embd,
                        (session.memory_v.element_size() * n_embd as usize)
                            * (il * n_ctx as usize + n_past as usize),
                    );

                    gf.build_forward_expand(&ctx0.op_cpy(&k_current, &k));
                    gf.build_forward_expand(&ctx0.op_cpy(&v_current, &v));
                }
                // Q = Qcur.contiguous().view(n_embd/n_head, n_head, N).permute(0, 2, 1,
                // 3) [64, N, 12]
                let q = ctx0.op_permute(
                    &ctx0.op_cpy(
                        &q_current,
                        &ctx0.new_tensor_3d(ggml::TYPE_F32, n_embd / n_head, n_head, n as i32),
                    ),
                    0,
                    2,
                    1,
                    3,
                );

                // K = Kmem.view(n_embd/n_head, n_head, n_past + N).permute(0, 2, 1, 3)
                let k = ctx0.op_permute(
                    &ctx0.op_reshape_3d(
                        &ctx0.op_view_1d(
                            &session.memory_k,
                            (n_past + n as i32) * n_embd,
                            il * n_ctx as usize * session.memory_k.element_size() * n_embd as usize,
                        ),
                        n_embd / n_head,
                        n_head,
                        n_past + n as i32,
                    ),
                    0,
                    2,
                    1,
                    3,
                );

                // K * Q
                let k_q = ctx0.op_mul_mat(&k, &q);

                // KQ_scaled = KQ / sqrt(n_embd/n_head)
                let k_q_scaled = ctx0.op_scale(
                    &k_q,
                    &ctx0.new_f32(1.0 / f32::sqrt(n_embd as f32 / n_head as f32)),
                );

                let k_q_scaled_alibi = ctx0.op_alibi(&k_q_scaled, n_past, n_head, 8.0);

                // KQ_masked = mask_past(KQ_scaled)
                let k_q_masked = ctx0.op_diag_mask_inf(&k_q_scaled_alibi, n_past);

                // KQ = soft_max(KQ_masked)
                let k_q_soft_max = ctx0.op_soft_max(&k_q_masked);

                // V_trans = Vmem.view(n_embd/n_head, n_head, n_past + N).permute(1, 2, 0, 3).contiguous()
                let v_transposed = ctx0.op_cpy(
                    &ctx0.op_permute(
                        &ctx0.op_reshape_3d(
                            &ctx0.op_view_1d(
                                &session.memory_v,
                                (n_past + n as i32) * n_embd,
                                il * n_ctx as usize
                                    * session.memory_v.element_size()
                                    * n_embd as usize,
                            ),
                            n_embd / n_head,
                            n_head,
                            n_past + n as i32,
                        ),
                        1,
                        2,
                        0,
                        3,
                    ),
                    &ctx0.new_tensor_3d(
                        session.memory_v.get_type(),
                        n_past + n as i32,
                        n_embd / n_head,
                        n_head,
                    ),
                );

                // KQV = transpose(V) * KQ_soft_max
                let k_q_v = ctx0.op_mul_mat(&v_transposed, &k_q_soft_max);

                // KQV_merged = KQV.permute(0, 2, 1, 3)
                let k_q_v_merged = ctx0.op_permute(&k_q_v, 0, 2, 1, 3);

                // cur = KQV_merged.contiguous().view(n_embd, N)
                current = ctx0.op_cpy(
                    &k_q_v_merged,
                    &ctx0.new_tensor_2d(ggml::TYPE_F32, n_embd, n as i32),
                );

                // projection (first weight)
                current = ctx0.op_mul_mat(&self.layers[il].attn_out_proj_weight, &current);
            }

            input_layer = ctx0.op_add(&input_layer, &current);

            // m = self.ln_2(x)
            {
                current = ctx0.op_norm(&input_layer);

                current = ctx0.op_mul(
                    &ctx0.op_repeat(&self.layers[il].ln_2_weight, &current),
                    &current,
                );
            }

            // n = self.mlp(m)
            {
                current = ctx0.op_mul_mat(&self.layers[il].mlp_up_weight, &current);

                // GELU
                current = ctx0.op_gelu(&current);

                current = ctx0.op_mul_mat(&self.layers[il].mlp_down_weight, &current);
            }

            // x = x + n
            input_layer = ctx0.op_add(&input_layer, &current);
        }

        // norm
        {
            input_layer = ctx0.op_norm(&input_layer);

            // inpL = ln_f_g*inpL
            input_layer = ctx0.op_mul(
                &ctx0.op_repeat(&self.ln_f_weight, &input_layer),
                &input_layer,
            );
        }

        // output embedding weight tied to input embedding
        {
            input_layer = ctx0.op_mul_mat(&self.wte_weight, &input_layer);
        }

        // logits -> probs
        // inpL = ctx0.op_soft_max(&inpL);

        // run the computation
        gf.build_forward_expand(&input_layer);
        ctx0.graph_compute(&mut gf);

        // return result for just the last token
        // SAFETY: yolo
        assert_eq!(session.last_logits.len(), n_vocab as usize);
        unsafe {
            input_layer.read_data(
                n_vocab as usize * (n - 1) * std::mem::size_of::<f32>(),
                bytemuck::cast_slice_mut(&mut session.last_logits),
            )
        };

        // Adjust the required memory per token if we didn't know that already
        if session.mem_per_token == 0 {
            session.mem_per_token = ctx0.used_mem() / n;
        }

        // Adjust n_past to new length.
        session.n_past += input_tokens.len();
    }

    pub fn tokenize(
        &self,
        tokenizer: &Tokenizer,
        text: &str,
        _bos: bool,
    ) -> Result<Vec<TokenId>, InferenceError> {
        Ok(tokenizer.encode(text, true).unwrap().get_ids().to_vec())
    }

    /// Sets the state of the model, from a previously obtained InferenceSnapshot
    pub fn session_from_snapshot(
        &mut self,
        snapshot: InferenceSnapshot,
    ) -> Result<InferenceSession, SnapshotError> {
        let mut session = self.start_session(InferenceSessionParameters {
            last_n_size: snapshot.last_n_tokens.len(),
            ..snapshot.session_params
        });

        if session.memory_k.nbytes() != snapshot.memory_k.len()
            || session.memory_v.nbytes() != snapshot.memory_v.len()
        {
            return Err(SnapshotError::MemorySizeMismatch {
                self_size: session.memory_k.nbytes() + session.memory_v.nbytes(),
                input_size: snapshot.memory_k.len() + snapshot.memory_v.len(),
            });
        }

        // SAFETY: We have exclusive access to Session, which means no one else
        // should be touching the context's memory. We can write to it because
        // we already checked the size.
        unsafe {
            session.memory_k.write_data(&snapshot.memory_k);
            session.memory_v.write_data(&snapshot.memory_v);
        }

        session.n_past = snapshot.npast;
        session.last_n_tokens = snapshot.last_n_tokens;
        session.last_logits = snapshot.last_logits;

        Ok(session)
    }
}

impl InferenceSession {
    pub fn feed_prompt<E: std::error::Error + 'static>(
        &mut self,
        model: &Model,
        tokenizer: &Tokenizer,
        params: &InferenceParameters,
        prompt: &str,
        callback: impl Fn(OutputToken) -> Result<(), E>,
    ) -> Result<(), InferenceError> {
        let beginning_of_sentence = self.n_past == 0;
        let prompt_tokens = model.tokenize(tokenizer, prompt, beginning_of_sentence)?;

        if self.n_past + prompt_tokens.len() >= model.hparams.max_seq_len as usize {
            return Err(InferenceError::ContextFull);
        }

        for batch in prompt_tokens.chunks(8) {
            model.evaluate(self, params.n_threads, batch);
            for &tk in batch {
                // NOTE: No string ever tokenizes to the end of sentence. So we
                // can just return the id here.
                if let Err(e) = callback(OutputToken::Token(
                    tokenizer.decode(vec![tk], true).unwrap(),
                )) {
                    return Err(InferenceError::UserCallback(Box::new(e)));
                }

                // Update the last_n_tokens list
                self.last_n_tokens.push_front(tk);
            }
        }

        Ok(())
    }

    pub fn infer_next_token(
        &mut self,
        model: &Model,
        tokenizer: &Tokenizer,
        params: &InferenceParameters,
        rng: &mut impl rand::Rng,
    ) -> Result<OutputToken, InferenceError> {
        if self.n_past + 1 >= model.hparams.max_seq_len as usize {
            return Err(InferenceError::ContextFull);
        }

        // First, sample the next token, using the stored last_logits;
        let next_token = model.sample_top_p_top_k(self, params, rng);

        // Update the last_n_tokens list
        self.last_n_tokens.push_front(next_token);

        // Then, evaluate the network again to compute the new last_logits
        model.evaluate(self, params.n_threads, &[next_token]);

        // Return the next token
        Ok(if next_token as TokenId == EOD_TOKEN_ID {
            OutputToken::EndOfText
        } else {
            OutputToken::Token(tokenizer.decode(vec![next_token], true).unwrap().to_owned())
        })
    }

    // todo: see if we can reduce the arguments here somehow - consolidate model and vocab maybe?
    #[allow(clippy::too_many_arguments)]
    pub fn inference_with_prompt<E: std::error::Error + 'static>(
        &mut self,
        model: &Model,
        tokenizer: &Tokenizer,
        params: &InferenceParameters,
        prompt: &str,
        maximum_token_count: Option<usize>,
        rng: &mut impl rand::Rng,
        callback: impl Fn(OutputToken) -> Result<(), E>,
    ) -> Result<InferenceStats, InferenceError> {
        let mut stats = InferenceStats::default();

        let start_at = time::SystemTime::now();

        // Feed the initial prompt through the transformer, to update its
        // context window with new data.
        if prompt.len() > 0 {
            self.feed_prompt(model, tokenizer, params, prompt, |tk| callback(tk))?;
        }
        stats.feed_prompt_duration = start_at.elapsed().unwrap();
        stats.prompt_tokens = self.n_past;

        // After the prompt is consumed, sample tokens by repeatedly calling
        // `infer_next_token`. We generate tokens until the model returns an
        // EndOfText token, or we run out of space in the context window,
        // or we reach the specified limit.
        let mut tokens_processed = 0;
        while self.n_past < model.hparams.max_seq_len as usize
            && maximum_token_count
                .map(|l| tokens_processed < l)
                .unwrap_or(true)
        {
            let tk = self.infer_next_token(model, tokenizer, params, rng)?;
            if let Err(e) = callback(tk.clone()) {
                return Err(InferenceError::UserCallback(Box::new(e)));
            }

            tokens_processed += 1;

            match tk {
                OutputToken::Token(x) => match x.as_str() {
                    "<|USER|>" => break,
                    _ => {}
                },
                OutputToken::EndOfText => break,
                _ => {}
            }
        }
        stats.predict_duration = start_at.elapsed().unwrap();
        stats.predict_tokens = self.n_past;

        Ok(stats)
    }

    /// Obtains a serializable snapshot of the current inference status. This
    /// can be used to cache the state of the model and store them into a file.
    ///
    /// # Safety
    ///
    /// This function provides raw access to the underlying memory owned by the
    /// ggml context. While the provided `InferenceSnapshotRef` object is alive,
    /// no other methods for this model object should be called.
    pub unsafe fn get_snapshot(&mut self) -> InferenceSnapshotRef<'_> {
        use core::slice;
        let memory_k = unsafe {
            slice::from_raw_parts(self.memory_k.data() as *mut u8, self.memory_k.nbytes())
        };
        let memory_v = unsafe {
            slice::from_raw_parts(self.memory_v.data() as *mut u8, self.memory_v.nbytes())
        };

        InferenceSnapshotRef {
            npast: self.n_past,
            session_params: self.params,
            memory_k,
            memory_v,
            last_n_tokens: self.last_n_tokens.clone(),
            logits: self.last_logits.clone(),
        }
    }
}

impl<'a> InferenceSnapshotRef<'a> {
    pub fn write(&self, writer: &mut impl std::io::Write) -> Result<(), SnapshotError> {
        Ok(bincode::serialize_into(writer, &self)?)
    }

    pub fn write_to_disk(&self, path: impl AsRef<Path>) -> Result<(), SnapshotError> {
        use std::fs::File;
        use std::io::BufWriter;

        let path = path.as_ref();
        let mut writer = BufWriter::new(File::create(path)?);

        self.write(&mut writer)
    }
}

impl InferenceSnapshot {
    pub fn read(reader: &mut impl std::io::Read) -> Result<Self, SnapshotError> {
        Ok(bincode::deserialize_from(reader)?)
    }

    pub fn load_from_disk(path: impl AsRef<Path>) -> Result<Self, SnapshotError> {
        use std::fs::File;
        use std::io::BufReader;

        let path = path.as_ref();
        let mut reader = BufReader::new(File::open(path)?);

        Self::read(&mut reader)
    }
}
