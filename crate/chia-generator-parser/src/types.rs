use serde::{Deserialize, Serialize};
use std::fmt;

// Re-export proper Chia types  
pub use chia_protocol::{Coin, Bytes32};

// Basic numeric types - use standard Rust types for simplicity
pub type uint32 = u32;
pub type uint64 = u64;
pub type uint128 = u128;

// SerializedProgram placeholder - use Vec<u8> for now
pub type SerializedProgram = Vec<u8>;

/// Block height reference  
pub type BlockHeight = uint32;

/// Hash type (32 bytes) - using proper chia type
pub type Hash32 = Bytes32;

/// Comprehensive parsed block information including all coin data
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParsedBlock {
    /// Block height
    pub height: uint32,
    
    /// Block weight
    pub weight: String,
    
    /// Block header hash (hex string for serialization)
    pub header_hash: String,
    
    /// Block timestamp (optional)
    pub timestamp: Option<uint32>,
    
    /// Coin additions (new coins created)
    pub coin_additions: Vec<CoinInfo>,
    
    /// Coin removals (coins spent)
    pub coin_removals: Vec<CoinInfo>,
    
    /// Detailed coin spends (if generator present)
    pub coin_spends: Vec<CoinSpendInfo>,
    
    /// Coins created by spends (if generator present)
    pub coin_creations: Vec<CoinInfo>,
    
    /// Whether block has transactions generator
    pub has_transactions_generator: bool,
    
    /// Generator size in bytes
    pub generator_size: Option<uint32>,
    
    /// Generator bytecode as hex
    pub generator_bytecode: Option<String>,
    
    /// Generator block info (if present)
    pub generator_info: Option<GeneratorBlockInfo>,
}

/// Basic coin information (serializable version)
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CoinInfo {
    /// Parent coin info (32 bytes as hex)
    pub parent_coin_info: String,
    
    /// Puzzle hash (32 bytes as hex)
    pub puzzle_hash: String,
    
    /// Amount in mojos
    pub amount: uint64,
}

impl CoinInfo {
    pub fn new(parent_coin_info: Hash32, puzzle_hash: Hash32, amount: uint64) -> Self {
        Self {
            parent_coin_info: hex::encode(parent_coin_info),
            puzzle_hash: hex::encode(puzzle_hash),
            amount,
        }
    }
    
    /// Create from raw bytes
    pub fn from_bytes(parent_coin_info: &[u8], puzzle_hash: &[u8], amount: uint64) -> Self {
        Self {
            parent_coin_info: hex::encode(parent_coin_info),
            puzzle_hash: hex::encode(puzzle_hash),
            amount,
        }
    }
}

/// Detailed coin spend information extracted from generator
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CoinSpendInfo {
    pub coin: CoinInfo,
    pub puzzle_reveal: Vec<u8>,
    pub solution: Vec<u8>,
    pub real_data: bool,
    pub parsing_method: String,
    pub offset: u32,
    pub created_coins: Vec<CoinInfo>,
}

impl CoinSpendInfo {
    pub fn new(
        coin: CoinInfo,
        puzzle_reveal: Vec<u8>,
        solution: Vec<u8>,
        real_data: bool,
        parsing_method: String,
        offset: uint32,
        created_coins: Vec<CoinInfo>,
    ) -> Self {
        Self {
            coin,
            puzzle_reveal,
            solution,
            real_data,
            parsing_method,
            offset,
            created_coins,
        }
    }
}

/// Generator block information (internal representation with Bytes32)
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GeneratorBlockInfo {
    /// Previous block header hash
    pub prev_header_hash: Hash32,
    
    /// The transactions generator program (CLVM bytecode)
    pub transactions_generator: Option<SerializedProgram>,
    
    /// List of block heights that this generator references
    pub transactions_generator_ref_list: Vec<BlockHeight>,
}

impl GeneratorBlockInfo {
    pub fn new(
        prev_header_hash: Hash32,
        transactions_generator: Option<SerializedProgram>,
        transactions_generator_ref_list: Vec<BlockHeight>,
    ) -> Self {
        Self {
            prev_header_hash,
            transactions_generator,
            transactions_generator_ref_list,
        }
    }
    
    pub fn has_generator(&self) -> bool {
        self.transactions_generator.is_some()
    }
    
    pub fn generator_size(&self) -> usize {
        self.transactions_generator
            .as_ref()
            .map(|g| g.len())
            .unwrap_or(0)
    }
    
    pub fn ref_list_size(&self) -> usize {
        self.transactions_generator_ref_list.len()
    }
}

impl fmt::Display for GeneratorBlockInfo {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "GeneratorBlockInfo {{ prev_header_hash: {}, has_generator: {}, ref_list_size: {} }}",
            hex::encode(self.prev_header_hash),
            self.has_generator(),
            self.ref_list_size()
        )
    }
}

// Custom Serialize/Deserialize for GeneratorBlockInfo
impl Serialize for GeneratorBlockInfo {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        use serde::ser::SerializeStruct;
        let mut state = serializer.serialize_struct("GeneratorBlockInfo", 3)?;
        state.serialize_field("prev_header_hash", &hex::encode(self.prev_header_hash))?;
        state.serialize_field("transactions_generator", &self.transactions_generator)?;
        state.serialize_field("transactions_generator_ref_list", &self.transactions_generator_ref_list)?;
        state.end()
    }
}

impl<'de> Deserialize<'de> for GeneratorBlockInfo {
    fn deserialize<D>(_deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        // Not needed for our use case, but required by trait
        unimplemented!("Deserialization not implemented for GeneratorBlockInfo")
    }
}

/// Parsed generator information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParsedGenerator {
    /// The generator block information
    pub block_info: GeneratorBlockInfo,
    
    /// Raw generator bytecode as hex string
    pub generator_hex: Option<String>,
    
    /// Analysis information
    pub analysis: GeneratorAnalysis,
}

/// Analysis of generator content
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GeneratorAnalysis {
    /// Size of the generator in bytes
    pub size_bytes: usize,
    
    /// Whether the generator is empty
    pub is_empty: bool,
    
    /// Whether it contains CLVM patterns
    pub contains_clvm_patterns: bool,
    
    /// Whether it contains coin patterns
    pub contains_coin_patterns: bool,
    
    /// Entropy of the bytecode
    pub entropy: f64,
}

/// Block height and transaction status
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BlockHeightInfo {
    /// Block height
    pub height: uint32,
    
    /// Whether this is a transaction block
    pub is_transaction_block: bool,
}

impl BlockHeightInfo {
    pub fn new(height: uint32, is_transaction_block: bool) -> Self {
        Self {
            height,
            is_transaction_block,
        }
    }
} 