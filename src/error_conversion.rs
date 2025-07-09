use chia_listener_core::ChiaError;
use napi::{Error, Status};

impl From<ChiaError> for Error {
    fn from(err: ChiaError) -> Self {
        Error::new(Status::GenericFailure, err.to_string())
    }
}