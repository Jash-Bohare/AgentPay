use odra::casper_types::U512;
use odra::prelude::*;
use odra::ContractRef;

#[odra::odra_type]
pub struct TxRecord {
    pub tx_id: u64,
    pub listing_id: u64,
    pub agent_wallet: Address,
    pub provider_wallet: Address,
    pub gross_amount: U512,
    pub protocol_fee: U512,
    pub net_amount: U512,
    pub timestamp: u64,
    pub success: bool
}

#[odra::odra_error]
pub enum Error {
    NotFacilitator = 1,
    NotTreasury = 2,
    TransactionNotFound = 3,
    NotInitialized = 4
}

#[odra::event]
pub struct TransactionSettled {
    pub tx_id: u64,
    pub listing_id: u64,
    pub agent_wallet: Address,
    pub provider_wallet: Address,
    pub gross_amount: U512,
    pub protocol_fee: U512,
    pub net_amount: U512
}

/// The Reputation contract's interface, called cross-contract after every
/// settled transaction. Reputation is deployed independently; this trait
/// only describes the entry point Payment needs to call on it.
#[odra::external_contract]
pub trait Reputation {
    fn record_transaction(
        &mut self,
        listing_id: u64,
        agent_wallet: Address,
        provider_wallet: Address,
        amount: U512,
        success: bool
    );
}

/// Records on-chain settlement of x402 payments and collects the protocol fee.
/// The actual CSPR transfer happens at the HTTP/x402 layer; this contract's
/// job is bookkeeping: fee calculation, transaction history, and driving the
/// Reputation contract's score updates.
#[odra::module]
pub struct Payment {
    protocol_fee_bps: Var<u32>,
    treasury_wallet: Var<Address>,
    /// The AgentPay backend wallet, the only address allowed to settle transactions.
    facilitator: Var<Address>,
    total_volume: Var<U512>,
    total_fees_collected: Var<U512>,
    tx_count: Var<u64>,
    transactions: Mapping<u64, TxRecord>,
    agent_transactions: Mapping<Address, Vec<u64>>,
    provider_transactions: Mapping<Address, Vec<u64>>,
    reputation_contract: Var<Address>
}

#[odra::module]
impl Payment {
    pub fn init(&mut self, treasury_wallet: Address, reputation_contract: Address) {
        self.treasury_wallet.set(treasury_wallet);
        self.facilitator.set(self.env().caller());
        self.protocol_fee_bps.set(50u32);
        self.reputation_contract.set(reputation_contract);
    }

    /// Rotates the backend wallet allowed to call settle_transaction. Treasury-only.
    pub fn set_facilitator(&mut self, new_facilitator: Address) {
        self.assert_treasury();
        self.facilitator.set(new_facilitator);
    }

    /// Adjusts the protocol fee, in basis points. Treasury-only.
    pub fn update_fee(&mut self, new_fee_bps: u32) {
        self.assert_treasury();
        self.protocol_fee_bps.set(new_fee_bps);
    }

    /// Called by the AgentPay backend after x402 payment verification.
    /// Calculates the protocol fee, records a TxRecord, updates running
    /// totals, and calls record_transaction on the Reputation contract.
    pub fn settle_transaction(
        &mut self,
        listing_id: u64,
        agent_wallet: Address,
        provider_wallet: Address,
        gross_amount: U512
    ) -> u64 {
        self.assert_facilitator();

        let fee_bps = self.protocol_fee_bps.get_or_default();
        let protocol_fee = gross_amount * U512::from(fee_bps) / U512::from(10_000u64);
        let net_amount = gross_amount - protocol_fee;

        let tx_id = self.tx_count.get_or_default();
        self.tx_count.set(tx_id + 1);

        let record = TxRecord {
            tx_id,
            listing_id,
            agent_wallet,
            provider_wallet,
            gross_amount,
            protocol_fee,
            net_amount,
            timestamp: self.env().get_block_time(),
            success: true
        };
        self.transactions.set(&tx_id, record);

        let mut agent_txs = self.agent_transactions.get_or_default(&agent_wallet);
        agent_txs.push(tx_id);
        self.agent_transactions.set(&agent_wallet, agent_txs);

        let mut provider_txs = self.provider_transactions.get_or_default(&provider_wallet);
        provider_txs.push(tx_id);
        self.provider_transactions.set(&provider_wallet, provider_txs);

        self.total_volume.set(self.total_volume.get_or_default() + gross_amount);
        self.total_fees_collected
            .set(self.total_fees_collected.get_or_default() + protocol_fee);

        let reputation_address = self.assert_reputation_contract();
        ReputationContractRef::new(self.env(), reputation_address).record_transaction(
            listing_id,
            agent_wallet,
            provider_wallet,
            gross_amount,
            true
        );

        self.env().emit_event(TransactionSettled {
            tx_id,
            listing_id,
            agent_wallet,
            provider_wallet,
            gross_amount,
            protocol_fee,
            net_amount
        });

        tx_id
    }

    pub fn get_transaction(&self, tx_id: u64) -> TxRecord {
        match self.transactions.get(&tx_id) {
            Some(record) => record,
            None => self.env().revert(Error::TransactionNotFound)
        }
    }

    pub fn get_transactions_by_agent(
        &self,
        wallet_address: Address,
        offset: u64,
        limit: u64
    ) -> Vec<TxRecord> {
        self.agent_transactions
            .get_or_default(&wallet_address)
            .into_iter()
            .skip(offset as usize)
            .take(limit as usize)
            .filter_map(|tx_id| self.transactions.get(&tx_id))
            .collect()
    }

    pub fn get_transactions_by_provider(
        &self,
        wallet_address: Address,
        offset: u64,
        limit: u64
    ) -> Vec<TxRecord> {
        self.provider_transactions
            .get_or_default(&wallet_address)
            .into_iter()
            .skip(offset as usize)
            .take(limit as usize)
            .filter_map(|tx_id| self.transactions.get(&tx_id))
            .collect()
    }

    pub fn get_total_volume(&self) -> U512 {
        self.total_volume.get_or_default()
    }

    pub fn get_total_fees_collected(&self) -> U512 {
        self.total_fees_collected.get_or_default()
    }
}

impl Payment {
    fn assert_facilitator(&self) {
        let caller = self.env().caller();
        match self.facilitator.get() {
            Some(f) if f == caller => {}
            _ => self.env().revert(Error::NotFacilitator)
        }
    }

    fn assert_treasury(&self) {
        let caller = self.env().caller();
        match self.treasury_wallet.get() {
            Some(t) if t == caller => {}
            _ => self.env().revert(Error::NotTreasury)
        }
    }

    fn assert_reputation_contract(&self) -> Address {
        match self.reputation_contract.get() {
            Some(addr) => addr,
            None => self.env().revert(Error::NotInitialized)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{Payment, PaymentHostRef, TxRecord};
    use odra::casper_types::U512;
    use odra::host::{Deployer, HostRef, NoArgs};
    use reputation::reputation::{Reputation, ReputationHostRef};

    fn deploy_payment(env: &odra::host::HostEnv) -> (PaymentHostRef, ReputationHostRef) {
        let treasury = env.get_account(0);
        let mut reputation = Reputation::deploy(env, NoArgs);

        env.set_caller(treasury);
        let payment = Payment::deploy(
            env,
            super::PaymentInitArgs {
                treasury_wallet: treasury,
                reputation_contract: reputation.contract_address()
            }
        );

        env.set_caller(treasury);
        reputation.set_authorized_caller(payment.contract_address());

        (payment, reputation)
    }

    #[test]
    fn settle_transaction_calculates_half_percent_fee() {
        let env = odra_test::env();
        let (mut payment, _reputation) = deploy_payment(&env);
        let treasury = env.get_account(0);
        let agent = env.get_account(1);
        let provider = env.get_account(2);

        env.set_caller(treasury);
        let tx_id = payment.settle_transaction(1, agent, provider, U512::from(1_000_000u64));

        let record: TxRecord = payment.get_transaction(tx_id);
        assert_eq!(record.gross_amount, U512::from(1_000_000u64));
        assert_eq!(record.protocol_fee, U512::from(5_000u64)); // 0.5% of 1,000,000
        assert_eq!(record.net_amount, U512::from(995_000u64));
        assert!(record.success);
    }

    #[test]
    fn settle_transaction_updates_totals_and_history() {
        let env = odra_test::env();
        let (mut payment, _reputation) = deploy_payment(&env);
        let treasury = env.get_account(0);
        let agent = env.get_account(1);
        let provider = env.get_account(2);

        env.set_caller(treasury);
        payment.settle_transaction(1, agent, provider, U512::from(1_000_000u64));
        payment.settle_transaction(2, agent, provider, U512::from(2_000_000u64));

        assert_eq!(payment.get_total_volume(), U512::from(3_000_000u64));
        assert_eq!(payment.get_total_fees_collected(), U512::from(15_000u64));

        let agent_history = payment.get_transactions_by_agent(agent, 0, 10);
        assert_eq!(agent_history.len(), 2);

        let provider_history = payment.get_transactions_by_provider(provider, 0, 10);
        assert_eq!(provider_history.len(), 2);
    }

    #[test]
    fn settle_transaction_drives_reputation_contract() {
        let env = odra_test::env();
        let (mut payment, reputation) = deploy_payment(&env);
        let treasury = env.get_account(0);
        let agent = env.get_account(1);
        let provider = env.get_account(2);

        env.set_caller(treasury);
        payment.settle_transaction(1, agent, provider, U512::from(1_000_000u64));

        let provider_score = reputation.get_provider_score(provider);
        assert_eq!(provider_score.total_calls_served, 1);
        assert_eq!(provider_score.total_cspr_earned, U512::from(1_000_000u64));

        let agent_score = reputation.get_agent_score(agent);
        assert_eq!(agent_score.total_calls_made, 1);
    }

    #[test]
    fn settle_transaction_from_non_facilitator_fails() {
        let env = odra_test::env();
        let (mut payment, _reputation) = deploy_payment(&env);
        let agent = env.get_account(1);
        let provider = env.get_account(2);

        env.set_caller(env.get_account(3));
        let result =
            payment.try_settle_transaction(1, agent, provider, U512::from(1_000_000u64));
        assert!(result.is_err());
    }

    #[test]
    fn update_fee_from_non_treasury_fails() {
        let env = odra_test::env();
        let (mut payment, _reputation) = deploy_payment(&env);

        env.set_caller(env.get_account(1));
        let result = payment.try_update_fee(100);
        assert!(result.is_err());
    }

    #[test]
    fn update_fee_changes_subsequent_calculations() {
        let env = odra_test::env();
        let (mut payment, _reputation) = deploy_payment(&env);
        let treasury = env.get_account(0);
        let agent = env.get_account(1);
        let provider = env.get_account(2);

        env.set_caller(treasury);
        payment.update_fee(100); // 1%
        let tx_id = payment.settle_transaction(1, agent, provider, U512::from(1_000_000u64));

        let record: TxRecord = payment.get_transaction(tx_id);
        assert_eq!(record.protocol_fee, U512::from(10_000u64));
    }

    #[test]
    fn get_transaction_for_unknown_id_fails() {
        let env = odra_test::env();
        let (payment, _reputation) = deploy_payment(&env);

        let result = payment.try_get_transaction(999);
        assert!(result.is_err());
    }
}
