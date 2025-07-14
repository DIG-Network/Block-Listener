use crate::{
    error::{GeneratorParserError, Result},
    types::{GeneratorBlockInfo, ParsedGenerator, GeneratorAnalysis, BlockHeightInfo, ParsedBlock, CoinInfo},
};
use tracing::info;
use clvmr::{Allocator, serde::node_from_bytes};
use chia_protocol::{FullBlock, Bytes32};
use chia_traits::streamable::Streamable;
use sha2::{Sha256, Digest};

/// Block parser that extracts generator information from FullBlock structures
pub struct BlockParser {
    // We don't need ConsensusConstants for now
}

impl BlockParser {
    pub fn new() -> Self {
        Self {}
    }
    
    /// Parse a FullBlock directly instead of bytes
    pub fn parse_full_block(&self, block: &FullBlock) -> Result<ParsedBlock> {
        info!("Parsing FullBlock at height {}", block.reward_chain_block.height);
        
        // Extract basic block information
        let height = block.reward_chain_block.height;
        let weight = block.reward_chain_block.weight;
        let timestamp = block.foliage_transaction_block
            .as_ref()
            .map(|ftb| ftb.timestamp as u32);
        
        // Calculate header hash by serializing the foliage
        let header_hash = {
            let foliage_bytes = block.foliage.to_bytes()
                .map_err(|e| GeneratorParserError::InvalidBlockFormat(format!("Failed to serialize foliage: {}", e)))?;
            let mut hasher = Sha256::new();
            hasher.update(&foliage_bytes);
            hex::encode(hasher.finalize())
        };
        
        // Check if block has transactions generator
        let has_transactions_generator = block.transactions_generator.is_some();
        let generator_size = block.transactions_generator.as_ref().map(|g| g.len() as u32);
        let generator_bytecode = block.transactions_generator.as_ref().map(|g| hex::encode(g));
        
        // Extract generator info
        let generator_info = if let Some(gen) = &block.transactions_generator {
            Some(GeneratorBlockInfo {
                prev_header_hash: block.foliage.prev_block_hash,
                transactions_generator: Some(gen.clone().into()),
                transactions_generator_ref_list: block.transactions_generator_ref_list.clone(),
            })
        } else {
            None
        };
        
        // Process reward claims
        let mut coin_additions = Vec::new();
        if let Some(tx_info) = &block.transactions_info {
            for claim in &tx_info.reward_claims_incorporated {
                coin_additions.push(CoinInfo::new(
                    claim.parent_coin_info,
                    claim.puzzle_hash,
                    claim.amount,
                ));
            }
        }
        
        // Process generator to extract coins if present
        let (coin_removals, coin_spends, coin_creations) = if let Some(generator) = &block.transactions_generator {
            self.process_generator_for_coins(
                generator,
                &block.transactions_generator_ref_list,
                height,
            )?
        } else {
            (Vec::new(), Vec::new(), Vec::new())
        };
        
        // Add coin creations to additions
        coin_additions.extend(coin_creations.clone());
        
        Ok(ParsedBlock {
            height,
            weight: weight.to_string(),
            header_hash,
            timestamp,
            coin_additions,
            coin_removals,
            coin_spends,
            coin_creations,
            has_transactions_generator,
            generator_size,
            generator_bytecode,
            generator_info,
        })
    }
    
    /// Process generator using chia_rs to extract coins
    fn process_generator_for_coins(
        &self, 
        generator_bytes: &[u8],
        _block_refs: &[u32],
        _height: u32,
    ) -> Result<(Vec<CoinInfo>, Vec<crate::types::CoinSpendInfo>, Vec<CoinInfo>)> {
        info!("Processing generator for coins");
        
        // For now, we'll return empty results
        // TODO: Implement proper generator execution using run_block_generator2
        // This requires:
        // 1. Block references (previous generators)
        // 2. Max cost calculation
        // 3. Proper error handling
        
        // Placeholder implementation
        if generator_bytes.is_empty() {
            return Ok((Vec::new(), Vec::new(), Vec::new()));
        }
        
        // Try to parse the generator as CLVM
        let mut allocator = Allocator::new();
        match node_from_bytes(&mut allocator, generator_bytes) {
            Ok(_generator_node) => {
                // TODO: Actually execute the generator with run_block_generator2
                // For now, return empty results
                info!("Generator parsed successfully, but execution not yet implemented");
                Ok((Vec::new(), Vec::new(), Vec::new()))
            }
            Err(e) => {
                info!("Failed to parse generator: {}", e);
                Ok((Vec::new(), Vec::new(), Vec::new()))
            }
        }
    }

    /// Parse a full block from bytes (for backwards compatibility)
    pub fn parse_full_block_from_bytes(&self, block_bytes: &[u8]) -> Result<ParsedBlock> {
        // Deserialize bytes to FullBlock
        let block = FullBlock::from_bytes(block_bytes)
            .map_err(|e| GeneratorParserError::InvalidBlockFormat(format!("Failed to deserialize FullBlock: {}", e)))?;
        
        self.parse_full_block(&block)
    }
    
    /// Extract generator block info from a FullBlock
    pub fn parse_block_info(&self, block: &FullBlock) -> Result<GeneratorBlockInfo> {
        Ok(GeneratorBlockInfo {
            prev_header_hash: block.foliage.prev_block_hash,
            transactions_generator: block.transactions_generator.as_ref().map(|g| g.clone().into()),
            transactions_generator_ref_list: block.transactions_generator_ref_list.clone(),
        })
    }
    
    /// Extract just the generator from a FullBlock
    pub fn extract_generator_from_block(&self, block: &FullBlock) -> Result<Option<Vec<u8>>> {
        Ok(block.transactions_generator.as_ref().map(|g| g.to_vec()))
    }
    
    /// Get block height and transaction status from a FullBlock
    pub fn get_height_and_tx_status_from_block(&self, block: &FullBlock) -> Result<BlockHeightInfo> {
        Ok(BlockHeightInfo {
            height: block.reward_chain_block.height,
            is_transaction_block: block.foliage_transaction_block.is_some(),
        })
    }
    
    /// Parse generator from hex string
    pub fn parse_generator_from_hex(&self, generator_hex: &str) -> Result<ParsedGenerator> {
        let generator_bytes = hex::decode(generator_hex)
            .map_err(|e| GeneratorParserError::HexDecodingError(e))?;
        self.parse_generator_from_bytes(&generator_bytes)
    }
    
    /// Parse generator from bytes
    pub fn parse_generator_from_bytes(&self, generator_bytes: &[u8]) -> Result<ParsedGenerator> {
        let analysis = self.analyze_generator(generator_bytes)?;
        
        Ok(ParsedGenerator {
            block_info: GeneratorBlockInfo {
                prev_header_hash: Bytes32::default(),
                transactions_generator: Some(generator_bytes.to_vec()),
                transactions_generator_ref_list: Vec::new(),
            },
            generator_hex: Some(hex::encode(generator_bytes)),
            analysis,
        })
    }
    
    /// Analyze generator bytecode
    pub fn analyze_generator(&self, generator_bytes: &[u8]) -> Result<GeneratorAnalysis> {
        let size_bytes = generator_bytes.len();
        let is_empty = size_bytes == 0;
        
        // Check for CLVM patterns
        let contains_clvm_patterns = generator_bytes.windows(2)
            .any(|w| matches!(w, [0xff, _] | [_, 0xff]));
        
        // Check for coin patterns (CREATE_COIN opcode)
        let contains_coin_patterns = generator_bytes.windows(1)
            .any(|w| w[0] == 0x33);
        
        let entropy = self.calculate_entropy(generator_bytes);
        
        Ok(GeneratorAnalysis {
            size_bytes,
            is_empty,
            contains_clvm_patterns,
            contains_coin_patterns,
            entropy,
        })
    }
    
    /// Calculate Shannon entropy of data
    fn calculate_entropy(&self, data: &[u8]) -> f64 {
        if data.is_empty() {
            return 0.0;
        }
        
        let mut freq = [0u32; 256];
        for &byte in data {
            freq[byte as usize] += 1;
        }
        
        let len = data.len() as f64;
        freq.iter()
            .filter(|&&count| count > 0)
            .map(|&count| {
                let p = count as f64 / len;
                -p * p.log2()
            })
            .sum()
    }
}

impl Default for BlockParser {
    fn default() -> Self {
        Self::new()
    }
} 