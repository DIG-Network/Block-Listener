use crate::{
    error::{GeneratorParserError, Result},
    types::{GeneratorBlockInfo, ParsedGenerator, GeneratorAnalysis, BlockHeightInfo, ParsedBlock, CoinInfo, CoinSpendInfo},
};
use tracing::info;
use clvmr::{
    Allocator, NodePtr,
    serde::{node_from_bytes_backrefs, node_to_bytes},
    chia_dialect::ChiaDialect,
    run_program::run_program,
    op_utils::u64_from_bytes,
};
use chia_protocol::{FullBlock, Bytes32};
use chia_traits::streamable::Streamable;
use chia_consensus::{
    run_block_generator::{run_block_generator2, setup_generator_args},
    allocator::make_allocator,
    consensus_constants::{ConsensusConstants, TEST_CONSTANTS},
    flags::DONT_VALIDATE_SIGNATURE,
    conditions::SpendBundleConditions,
    validation_error::{atom, first, next, rest, ErrorCode},
};
use chia_bls::Signature;
use clvm_utils::tree_hash;
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
        let header_hash = self.calculate_header_hash(&block.foliage)?;
        
        // Check if block has transactions generator
        let has_transactions_generator = block.transactions_generator.is_some();
        let generator_size = block.transactions_generator.as_ref().map(|g| g.len() as u32);
        let generator_bytecode = block.transactions_generator.as_ref().map(|g| hex::encode(g));
        
        // Extract generator info
        let generator_info = block.transactions_generator.as_ref().map(|gen| {
            GeneratorBlockInfo {
                prev_header_hash: block.foliage.prev_block_hash,
                transactions_generator: Some(gen.clone().into()),
                transactions_generator_ref_list: block.transactions_generator_ref_list.clone(),
            }
        });
        
        // Process reward claims
        let mut coin_additions = self.extract_reward_claims(block);
        
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
    
    /// Calculate header hash from foliage
    fn calculate_header_hash(&self, foliage: &chia_protocol::Foliage) -> Result<String> {
        let foliage_bytes = foliage.to_bytes()
            .map_err(|e| GeneratorParserError::InvalidBlockFormat(
                format!("Failed to serialize foliage: {}", e)
            ))?;
        let mut hasher = Sha256::new();
        hasher.update(&foliage_bytes);
        Ok(hex::encode(hasher.finalize()))
    }
    
    /// Extract reward claims from block
    fn extract_reward_claims(&self, block: &FullBlock) -> Vec<CoinInfo> {
        match &block.transactions_info {
            Some(tx_info) => {
                tx_info.reward_claims_incorporated
                    .iter()
                    .map(|claim| CoinInfo::new(
                        claim.parent_coin_info,
                        claim.puzzle_hash,
                        claim.amount,
                    ))
                    .collect()
            }
            None => Vec::new()
        }
    }
    
    /// Process generator using chia-consensus to execute CLVM and extract coins
    fn process_generator_for_coins(
        &self, 
        generator_bytes: &[u8],
        _block_refs: &[u32],
        _height: u32,
    ) -> Result<(Vec<CoinInfo>, Vec<CoinSpendInfo>, Vec<CoinInfo>)> {
        info!("Processing generator for coins using CLVM execution");
        
        if generator_bytes.is_empty() {
            return Ok((Vec::new(), Vec::new(), Vec::new()));
        }
        
        // Create allocator for CLVM execution
        let mut allocator = make_allocator(clvmr::LIMIT_HEAP);
        
        // TODO: Fetch actual block references for compressed blocks
        // For now, use empty references
        let generator_refs: Vec<&[u8]> = Vec::new();
        
        // Use test constants (similar to mainnet)
        let constants = TEST_CONSTANTS;
        let max_cost = constants.max_block_cost_clvm;
        let flags = DONT_VALIDATE_SIGNATURE;
        let signature = Signature::default();
        
        // Parse generator node
        let generator_node = match node_from_bytes_backrefs(&mut allocator, generator_bytes) {
            Ok(node) => node,
            Err(e) => {
                info!("Failed to parse generator: {:?}", e);
                return Ok((Vec::new(), Vec::new(), Vec::new()));
            }
        };
        
        // Setup arguments
        let args = match setup_generator_args(&mut allocator, &generator_refs) {
            Ok(args) => args,
            Err(e) => {
                info!("Failed to setup generator args: {:?}", e);
                return Ok((Vec::new(), Vec::new(), Vec::new()));
            }
        };
        
        // Run the generator to get the list of coin spends
        let generator_output = match self.run_generator(&mut allocator, generator_node, args, max_cost, flags) {
            Ok(output) => output,
            Err(e) => {
                info!("Failed to run generator: {:?}", e);
                return Ok((Vec::new(), Vec::new(), Vec::new()));
            }
        };
        
        // Also run block generator2 to get spend conditions (for CREATE_COIN)
        let spend_bundle_conditions = self.get_spend_bundle_conditions(
            &mut allocator,
            generator_bytes,
            &generator_refs,
            max_cost,
            flags,
            &signature,
            &constants
        );
        
        // Extract coin spends from generator output
        self.extract_coin_spends_from_output(
            &mut allocator,
            generator_output,
            &spend_bundle_conditions
        )
    }
    
    /// Run the generator program
    fn run_generator(
        &self,
        allocator: &mut Allocator,
        generator_node: NodePtr,
        args: NodePtr,
        max_cost: u64,
        flags: u32,
    ) -> Result<NodePtr> {
        let dialect = ChiaDialect::new(flags);
        let reduction = run_program(allocator, &dialect, generator_node, args, max_cost)
            .map_err(|e| GeneratorParserError::ClvmExecutionError(format!("{:?}", e)))?;
        Ok(reduction.1) // Get the result NodePtr
    }
    
    /// Get spend bundle conditions from generator
    fn get_spend_bundle_conditions(
        &self,
        allocator: &mut Allocator,
        generator_bytes: &[u8],
        generator_refs: &Vec<&[u8]>,
        max_cost: u64,
        flags: u32,
        signature: &Signature,
        constants: &ConsensusConstants,
    ) -> SpendBundleConditions {
        match run_block_generator2(
            allocator,
            generator_bytes,
            generator_refs.clone(),
            max_cost,
            flags,
            signature,
            None, // No BLS cache
            constants,
        ) {
            Ok(conditions) => conditions,
            Err(e) => {
                info!("Failed to execute generator with run_block_generator2: {:?}", e);
                SpendBundleConditions::default()
            }
        }
    }
    
    /// Extract coin spends from generator output
    fn extract_coin_spends_from_output(
        &self,
        allocator: &mut Allocator,
        generator_output: NodePtr,
        spend_bundle_conditions: &SpendBundleConditions,
    ) -> Result<(Vec<CoinInfo>, Vec<CoinSpendInfo>, Vec<CoinInfo>)> {
        let mut coin_spends = Vec::new();
        let mut coins_created = Vec::new();
        let mut coins_spent = Vec::new();
        
        // Parse the generator output to extract coin spends
        let Ok(spends_list) = first(allocator, generator_output) else {
            return Ok((coins_spent, coin_spends, coins_created));
        };
        
        let mut iter = spends_list;
        let mut spend_index = 0;
        
        while let Ok(Some((coin_spend, next_iter))) = next(allocator, iter) {
            iter = next_iter;
            
            if let Some(spend_info) = self.parse_single_coin_spend(
                allocator,
                coin_spend,
                spend_index,
                spend_bundle_conditions
            ) {
                coins_spent.push(spend_info.coin.clone());
                
                // Add created coins
                for created_coin in &spend_info.created_coins {
                    coins_created.push(created_coin.clone());
                }
                
                coin_spends.push(spend_info);
                spend_index += 1;
            }
        }
        
        info!("CLVM execution extracted {} spends, {} coins created", 
              coin_spends.len(), coins_created.len());
        
        Ok((coins_spent, coin_spends, coins_created))
    }
    
    /// Parse a single coin spend from the generator output
    fn parse_single_coin_spend(
        &self,
        allocator: &mut Allocator,
        coin_spend: NodePtr,
        spend_index: usize,
        spend_bundle_conditions: &SpendBundleConditions,
    ) -> Option<CoinSpendInfo> {
        // Extract parent coin info
        let parent_bytes = self.extract_parent_coin_info(allocator, coin_spend)?;
        let mut parent_arr = [0u8; 32];
        parent_arr.copy_from_slice(&parent_bytes);
        let parent_coin_info = Bytes32::new(parent_arr);
        
        // Extract puzzle, amount, and solution
        let rest1 = rest(allocator, coin_spend).ok()?;
        let puzzle = first(allocator, rest1).ok()?;
        
        let rest2 = rest(allocator, rest1).ok()?;
        let amount_node = first(allocator, rest2).ok()?;
        let amount_atom = atom(allocator, amount_node, ErrorCode::InvalidCoinAmount).ok()?;
        let amount = u64_from_bytes(amount_atom.as_ref());
        
        let rest3 = rest(allocator, rest2).ok()?;
        let solution = first(allocator, rest3).ok()?;
        
        // Calculate puzzle hash
        let puzzle_hash_vec = tree_hash(allocator, puzzle);
        let mut puzzle_hash_arr = [0u8; 32];
        puzzle_hash_arr.copy_from_slice(&puzzle_hash_vec);
        let puzzle_hash = Bytes32::new(puzzle_hash_arr);
        
        // Create coin info
        let coin_info = CoinInfo {
            parent_coin_info: hex::encode(&parent_coin_info),
            puzzle_hash: hex::encode(&puzzle_hash),
            amount,
        };
        
        // Serialize puzzle reveal and solution
        let puzzle_reveal = node_to_bytes(allocator, puzzle).ok()?;
        let solution_bytes = node_to_bytes(allocator, solution).ok()?;
        
        // Get created coins from conditions
        let created_coins = self.extract_created_coins(spend_index, spend_bundle_conditions);
        
        Some(CoinSpendInfo {
            coin: coin_info,
            puzzle_reveal,
            solution: solution_bytes,
            real_data: true,
            parsing_method: "clvm_execution".to_string(),
            offset: 0,
            created_coins,
        })
    }
    
    /// Extract parent coin info from a coin spend node
    fn extract_parent_coin_info(&self, allocator: &mut Allocator, coin_spend: NodePtr) -> Option<Vec<u8>> {
        let first_node = first(allocator, coin_spend).ok()?;
        let parent_atom = atom(allocator, first_node, ErrorCode::InvalidParentId).ok()?;
        let parent_bytes = parent_atom.as_ref();
        
        if parent_bytes.len() == 32 {
            Some(parent_bytes.to_vec())
        } else {
            None
        }
    }
    
    /// Extract created coins from spend bundle conditions
    fn extract_created_coins(
        &self,
        spend_index: usize,
        spend_bundle_conditions: &SpendBundleConditions
    ) -> Vec<CoinInfo> {
        if spend_index >= spend_bundle_conditions.spends.len() {
            return Vec::new();
        }
        
        let spend_cond = &spend_bundle_conditions.spends[spend_index];
        spend_cond.create_coin
            .iter()
            .map(|new_coin| CoinInfo {
                parent_coin_info: hex::encode(spend_cond.coin_id.as_ref()),
                puzzle_hash: hex::encode(&new_coin.puzzle_hash),
                amount: new_coin.amount,
            })
            .collect()
    }

    /// Parse a full block from bytes (for backwards compatibility)
    pub fn parse_full_block_from_bytes(&self, block_bytes: &[u8]) -> Result<ParsedBlock> {
        // Deserialize bytes to FullBlock
        let block = FullBlock::from_bytes(block_bytes)
            .map_err(|e| GeneratorParserError::InvalidBlockFormat(
                format!("Failed to deserialize FullBlock: {}", e)
            ))?;
        
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