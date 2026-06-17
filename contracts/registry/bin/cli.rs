//! CLI tool to deploy and interact with the AgentPay Registry contract.

use registry::registry::Registry;
use odra::host::{HostEnv, NoArgs};
use odra_cli::{deploy::DeployScript, DeployedContractsContainer, DeployerExt, OdraCli};

/// Deploys the `Registry` contract and adds it to the container.
pub struct RegistryDeployScript;

impl DeployScript for RegistryDeployScript {
    fn deploy(
        &self,
        env: &HostEnv,
        container: &mut DeployedContractsContainer
    ) -> Result<(), odra_cli::deploy::Error> {
        let _registry = Registry::load_or_deploy(
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
        .about("CLI tool for the AgentPay registry smart contract")
        .deploy(RegistryDeployScript)
        .contract::<Registry>()
        .build()
        .run();
}
