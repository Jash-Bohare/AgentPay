#!/usr/bin/env bash
# Builds an Odra contract's wasm for Casper deployment.
#
# Why this exists: Casper's wasm runtime doesn't support the "bulk-memory"
# wasm feature that Rust 1.87+ (LLVM 20+) enables by default for
# wasm32-unknown-unknown. Passing -C target-cpu=mvp (set in each contract's
# .cargo/config.toml) only fixes our own crate's codegen - the precompiled
# std/core shipped by rustup already has bulk-memory baked in. We must
# rebuild std from source for the mvp target via `-Z build-std`, which on
# nightly cargo only activates through the CARGO_UNSTABLE_BUILD_STD env var
# (config.toml's [unstable] table alone does NOT activate it - verified
# empirically, not just per docs).
#
# Usage: ./build-wasm.sh <contract-dir>   e.g. ./build-wasm.sh registry

set -euo pipefail
CONTRACT_DIR="$1"
cd "$(dirname "$0")/$CONTRACT_DIR"
CARGO_UNSTABLE_BUILD_STD=panic_abort,std cargo odra build
