use chia_protocol::{Handshake, NodeType, ProtocolMessageTypes};

pub fn create_handshake(network_id: String) -> Handshake {
    Handshake {
        network_id: network_id.clone(),
        protocol_version: "0.0.35".to_string(),
        software_version: "chia-block-listener-rust".to_string(),
        server_port: 8444,
        node_type: NodeType::FullNode,
        capabilities: vec![
            (ProtocolMessageTypes::RequestBlock as u16, "1"),
            (ProtocolMessageTypes::RespondBlock as u16, "1"),
            (ProtocolMessageTypes::RejectBlock as u16, "1"),
            (ProtocolMessageTypes::RequestBlocks as u16, "1"),
            (ProtocolMessageTypes::RespondBlocks as u16, "1"),
            (ProtocolMessageTypes::RejectBlocks as u16, "1"),
            (ProtocolMessageTypes::NewPeak as u16, "1"),
            (ProtocolMessageTypes::RequestProofOfWeight as u16, "1"),
            (ProtocolMessageTypes::RespondProofOfWeight as u16, "1"),
            (ProtocolMessageTypes::RequestCompactVDF as u16, "1"),
            (ProtocolMessageTypes::RespondCompactVDF as u16, "1"),
            (ProtocolMessageTypes::NewCompactVDF as u16, "1"),
            (ProtocolMessageTypes::RequestPeers as u16, "1"),
            (ProtocolMessageTypes::RespondPeers as u16, "1"),
        ]
        .into_iter()
        .map(|(msg_type, version)| (msg_type, version.to_string()))
        .collect(),
    }
}