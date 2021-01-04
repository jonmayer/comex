#![feature(proc_macro_hygiene, decl_macro)]
extern crate config;
use config::{Config, ConfigError, Environment, File};
use serde::Deserialize;
use std::env;

#[derive(Debug, Deserialize)]
pub struct Metadata {
    pub title: Option<String>,
    pub description: Option<String>,
    pub right_to_left: Option<bool>,
}

impl Metadata {
    pub fn new(path: &str) -> Result<Self, ConfigError> {
        let mut s = Config::new();
        s.merge(File::with_name(path).required(false))?;
        return s.try_into();
    }
}
