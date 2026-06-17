//! CLI tool to deploy and interact with the AgentPay Payment contract.

use payment::payment::{Payment, PaymentInitArgs};
use odra::host::HostEnv;
use odra::prelude::Address;
use odra_cli::{deploy::DeployScript, DeployedContractsContainer, DeployerExt, OdraCli};
use std::str::FromStr;

/// Deploys the `Payment` contract and adds it to the container.
///
/// Requires PAYMENT_TREASURY_WALLET and PAYMENT_REPUTATION_CONTRACT env vars,
/// since the contract's constructor needs the treasury wallet and the
/// already-deployed Reputation contract's address.
pub struct PaymentDeployScript;

impl DeployScript for PaymentDeployScript {
    fn deploy(
        &self,
        env: &HostEnv,
        container: &mut DeployedContractsContainer
    ) -> Result<(), odra_cli::deploy::Error> {
        let treasury_wallet = Address::from_str(
            &std::env::var("PAYMENT_TREASURY_WALLET")
                .expect("PAYMENT_TREASURY_WALLET env var required")
        )
        .expect("invalid PAYMENT_TREASURY_WALLET address");

        let reputation_contract = Address::from_str(
            &std::env::var("PAYMENT_REPUTATION_CONTRACT")
                .expect("PAYMENT_REPUTATION_CONTRACT env var required")
        )
        .expect("invalid PAYMENT_REPUTATION_CONTRACT address");

        let _payment = Payment::load_or_deploy(
            &env,
            PaymentInitArgs {
                treasury_wallet,
                reputation_contract
            },
            container,
            350_000_000_000 // Adjust gas limit as needed
        )?;

        Ok(())
    }
}

/// Main function to run the CLI tool.
pub fn main() {
    OdraCli::new()
        .about("CLI tool for the AgentPay payment smart contract")
        .deploy(PaymentDeployScript)
        .contract::<Payment>()
        .build()
        .run();
}
