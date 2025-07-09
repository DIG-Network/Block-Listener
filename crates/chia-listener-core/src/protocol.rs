use serde::{Deserialize, Serialize};
use sha2::{Sha256, Digest};
use chia_protocol::{Bytes32, ProtocolMessageTypes};


pub const MAINNET_GENESIS_CHALLENGE: &str = "ccd5bb71183532bff220ba46c268991a3ff07eb358e8255a65c30a2dce0e5fbb";
pub const TESTNET11_GENESIS_CHALLENGE: &str = "37a90eb5185a9c4439a91ddc98bbadce7b4feba060d50116a067de66bf236615";

pub const DNS_INTRODUCERS: &[&str] = &[
    "dns-introducer.chia.net:8444",
    "chia.ctrlaltdel.ch:8444",
    "seeder.dexie.space:8444",
    "chia.hoffmang.com:8444",
];

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Handshake {
    pub network_id: String,
    pub protocol_version: String,
    pub software_version: String,
    pub server_port: u16,
    pub node_type: u8,
    pub capabilities: Vec<(u16, String)>,
}

impl Handshake {
    pub fn new(network_id: String, port: u16) -> Self {
        Self {
            network_id,
            protocol_version: "0.0.36".to_string(),
            software_version: "2.4.0".to_string(),
            server_port: port,
            node_type: 1, // FULL_NODE
            capabilities: vec![],
        }
    }
}

#[derive(Debug, Clone)]
pub struct Message {
    pub msg_type: ProtocolMessageTypes,
    pub id: Option<u16>,
    pub data: Vec<u8>,
}

impl Message {
    pub fn new(msg_type: ProtocolMessageTypes, id: Option<u16>, data: Vec<u8>) -> Self {
        Self { msg_type, id, data }
    }

    pub fn to_bytes(&self) -> Result<Vec<u8>, std::io::Error> {
        let mut bytes = Vec::new();
        
        // Write message type
        bytes.push(self.msg_type as u8);
        
        // Write optional ID
        if let Some(id) = self.id {
            bytes.push(1); // Has ID
            bytes.extend_from_slice(&id.to_be_bytes());
        } else {
            bytes.push(0); // No ID
        }
        
        // Write data
        bytes.extend_from_slice(&self.data);
        
        Ok(bytes)
    }

    pub fn from_bytes(bytes: &[u8]) -> Result<Self, std::io::Error> {
        if bytes.len() < 2 {
            return Err(std::io::Error::new(
                std::io::ErrorKind::InvalidData,
                "Message too short",
            ));
        }

        // In newer versions, we might need to handle this differently
        // For now, we'll use a match statement
        let msg_type = match bytes[0] {
            1 => ProtocolMessageTypes::Handshake,
            3 => ProtocolMessageTypes::NewPeak,
            4 => ProtocolMessageTypes::NewTransaction,
            5 => ProtocolMessageTypes::RequestBlock,
            6 => ProtocolMessageTypes::RespondBlock,
            _ => return Err(std::io::Error::new(
                std::io::ErrorKind::InvalidData,
                format!("Unknown message type: {}", bytes[0]),
            )),
        };

        let (id, data_start) = if bytes[1] == 1 {
            // Has ID
            if bytes.len() < 4 {
                return Err(std::io::Error::new(
                    std::io::ErrorKind::InvalidData,
                    "Message too short for ID",
                ));
            }
            let id = u16::from_be_bytes([bytes[2], bytes[3]]);
            (Some(id), 4)
        } else {
            (None, 2)
        };

        let data = bytes[data_start..].to_vec();

        Ok(Self { msg_type, id, data })
    }
}

pub fn calculate_node_id(cert_der: &[u8]) -> Result<Bytes32, std::io::Error> {
    let mut hasher = Sha256::new();
    hasher.update(cert_der);
    let result = hasher.finalize();
    
    let mut bytes = [0u8; 32];
    bytes.copy_from_slice(&result);
    Ok(Bytes32::new(bytes))
}