//! CLI tool to deploy and interact with the AgentPay Reputation contract.

use reputation::reputation::Reputation;
use odra::host::{HostEnv, NoArgs};
use odra_cli::{deploy::DeployScript, DeployedContractsContainer, DeployerExt, OdraCli};

/// Deploys the `Reputation` contract and adds it to the container.
pub struct ReputationDeployScript;

impl DeployScript for ReputationDeployScript {
    fn deploy(
        &self,
        env: &HostEnv,
        container: &mut DeployedContractsContainer
    ) -> Result<(), odra_cli::deploy::Error> {
        let _reputation = Reputation::load_or_deploy(
            &env,
            NoArgs,
            container,
            350_000_000_000 // Adjust gas limit as needed
        )?;

        Ok(())
    }
}

/// Main function to run the CLI tool.
pub fn main() {
    OdraCli::new()
        .about("CLI tool for the AgentPay reputation smart contract")
        .deploy(ReputationDeployScript)
        .contract::<Reputation>()
        .build()
        .run();
}
