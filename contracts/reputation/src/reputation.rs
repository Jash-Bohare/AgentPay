use odra::casper_types::U512;
use odra::prelude::*;

/// Reputation tier, derived from call volume and success rate.
#[odra::odra_type]
pub enum Tier {
    New,
    Established,
    Trusted,
    Elite
}

#[odra::odra_type]
pub struct ProviderScore {
    pub total_calls_served: u64,
    pub successful_calls: u64,
    pub failed_calls: u64,
    pub total_cspr_earned: U512,
    pub uptime_score: u8,
    pub accuracy_score: u8,
    pub reputation_tier: Tier,
    pub last_updated: u64
}

impl Default for ProviderScore {
    fn default() -> Self {
        ProviderScore {
            total_calls_served: 0,
            successful_calls: 0,
            failed_calls: 0,
            total_cspr_earned: U512::from(0u64),
            uptime_score: 100,
            accuracy_score: 100,
            reputation_tier: Tier::New,
            last_updated: 0
        }
    }
}

#[odra::odra_type]
pub struct AgentScore {
    pub total_calls_made: u64,
    pub total_cspr_spent: U512,
    pub failed_payments: u64,
    pub reputation_tier: Tier,
    pub first_seen: u64,
    pub last_active: u64
}

impl Default for AgentScore {
    fn default() -> Self {
        AgentScore {
            total_calls_made: 0,
            total_cspr_spent: U512::from(0u64),
            failed_payments: 0,
            reputation_tier: Tier::New,
            first_seen: 0,
            last_active: 0
        }
    }
}

#[odra::odra_error]
pub enum Error {
    NotOwner = 1,
    NotAuthorizedCaller = 2
}

#[odra::event]
pub struct ProviderScoreUpdated {
    pub listing_id: u64,
    pub provider_wallet: Address,
    pub total_calls_served: u64,
    pub reputation_tier: Tier
}

#[odra::event]
pub struct AgentScoreUpdated {
    pub listing_id: u64,
    pub agent_wallet: Address,
    pub total_calls_made: u64,
    pub reputation_tier: Tier
}

/// Tracks the on-chain reputation of both providers and agents.
#[odra::module]
pub struct Reputation {
    provider_scores: Mapping<Address, ProviderScore>,
    agent_scores: Mapping<Address, AgentScore>,
    /// The Payment contract address. Only it may call record_transaction.
    authorized_caller: Var<Address>,
    /// The deployer, allowed to set the authorized caller.
    owner: Var<Address>
}

#[odra::module]
impl Reputation {
    pub fn init(&mut self) {
        self.owner.set(self.env().caller());
    }

    /// Sets the Payment contract as the only address allowed to call
    /// record_transaction. Callable once by the owner after deployment.
    pub fn set_authorized_caller(&mut self, caller: Address) {
        self.assert_owner();
        self.authorized_caller.set(caller);
    }

    /// Called by the Payment contract after every settled transaction.
    /// Updates both the provider score and agent score atomically.
    pub fn record_transaction(
        &mut self,
        listing_id: u64,
        agent_wallet: Address,
        provider_wallet: Address,
        amount: U512,
        success: bool
    ) {
        self.assert_authorized_caller();
        let now = self.env().get_block_time();

        let mut provider_score = self.provider_scores.get_or_default(&provider_wallet);
        provider_score.total_calls_served += 1;
        if success {
            provider_score.successful_calls += 1;
            provider_score.total_cspr_earned += amount;
        } else {
            provider_score.failed_calls += 1;
        }
        provider_score.reputation_tier =
            tier_for(provider_score.total_calls_served, provider_score.successful_calls);
        provider_score.last_updated = now;
        self.provider_scores.set(&provider_wallet, provider_score.clone());

        let mut agent_score = self.agent_scores.get_or_default(&agent_wallet);
        if agent_score.total_calls_made == 0 {
            agent_score.first_seen = now;
        }
        agent_score.total_calls_made += 1;
        if success {
            agent_score.total_cspr_spent += amount;
        } else {
            agent_score.failed_payments += 1;
        }
        let agent_successful_calls = agent_score.total_calls_made - agent_score.failed_payments;
        agent_score.reputation_tier = tier_for(agent_score.total_calls_made, agent_successful_calls);
        agent_score.last_active = now;
        self.agent_scores.set(&agent_wallet, agent_score.clone());

        self.env().emit_event(ProviderScoreUpdated {
            listing_id,
            provider_wallet,
            total_calls_served: provider_score.total_calls_served,
            reputation_tier: provider_score.reputation_tier
        });
        self.env().emit_event(AgentScoreUpdated {
            listing_id,
            agent_wallet,
            total_calls_made: agent_score.total_calls_made,
            reputation_tier: agent_score.reputation_tier
        });
    }

    pub fn get_provider_score(&self, wallet_address: Address) -> ProviderScore {
        self.provider_scores.get_or_default(&wallet_address)
    }

    pub fn get_agent_score(&self, wallet_address: Address) -> AgentScore {
        self.agent_scores.get_or_default(&wallet_address)
    }
}

impl Reputation {
    fn assert_owner(&self) {
        let caller = self.env().caller();
        match self.owner.get() {
            Some(owner) if owner == caller => {}
            _ => self.env().revert(Error::NotOwner)
        }
    }

    fn assert_authorized_caller(&self) {
        let caller = self.env().caller();
        match self.authorized_caller.get() {
            Some(authorized) if authorized == caller => {}
            _ => self.env().revert(Error::NotAuthorizedCaller)
        }
    }
}

/// Tier thresholds by total call count: New = 0-99, Established = 100-999,
/// Trusted = 1000-9999, Elite = 10000+. Capped down a notch if the success
/// rate falls below 50%.
fn tier_for(total_calls: u64, successful_calls: u64) -> Tier {
    if total_calls == 0 {
        return Tier::New;
    }

    let base = if total_calls >= 10_000 {
        Tier::Elite
    } else if total_calls >= 1_000 {
        Tier::Trusted
    } else if total_calls >= 100 {
        Tier::Established
    } else {
        Tier::New
    };

    let success_rate_ok = successful_calls.saturating_mul(100) / total_calls >= 50;
    if success_rate_ok {
        base
    } else {
        downgrade(base)
    }
}

fn downgrade(tier: Tier) -> Tier {
    match tier {
        Tier::Elite => Tier::Trusted,
        Tier::Trusted => Tier::Established,
        Tier::Established => Tier::New,
        Tier::New => Tier::New
    }
}

#[cfg(test)]
mod tests {
    use super::{Reputation, Tier};
    use odra::casper_types::U512;
    use odra::host::{Deployer, NoArgs};

    #[test]
    fn record_transaction_updates_both_scores() {
        let env = odra_test::env();
        let mut contract = Reputation::deploy(&env, NoArgs);
        let payment_contract = env.get_account(0);
        let agent = env.get_account(1);
        let provider = env.get_account(2);

        env.set_caller(env.get_account(0));
        contract.set_authorized_caller(payment_contract);

        env.set_caller(payment_contract);
        contract.record_transaction(1, agent, provider, U512::from(500_000u64), true);

        let provider_score = contract.get_provider_score(provider);
        assert_eq!(provider_score.total_calls_served, 1);
        assert_eq!(provider_score.successful_calls, 1);
        assert_eq!(provider_score.failed_calls, 0);
        assert_eq!(provider_score.total_cspr_earned, U512::from(500_000u64));

        let agent_score = contract.get_agent_score(agent);
        assert_eq!(agent_score.total_calls_made, 1);
        assert_eq!(agent_score.total_cspr_spent, U512::from(500_000u64));
        assert_eq!(agent_score.failed_payments, 0);
    }

    #[test]
    fn record_transaction_tracks_failures() {
        let env = odra_test::env();
        let mut contract = Reputation::deploy(&env, NoArgs);
        let payment_contract = env.get_account(0);
        let agent = env.get_account(1);
        let provider = env.get_account(2);

        env.set_caller(env.get_account(0));
        contract.set_authorized_caller(payment_contract);

        env.set_caller(payment_contract);
        contract.record_transaction(1, agent, provider, U512::from(500_000u64), false);

        let provider_score = contract.get_provider_score(provider);
        assert_eq!(provider_score.total_calls_served, 1);
        assert_eq!(provider_score.successful_calls, 0);
        assert_eq!(provider_score.failed_calls, 1);
        assert_eq!(provider_score.total_cspr_earned, U512::from(0u64));

        let agent_score = contract.get_agent_score(agent);
        assert_eq!(agent_score.failed_payments, 1);
    }

    #[test]
    fn record_transaction_from_unauthorized_caller_fails() {
        let env = odra_test::env();
        let mut contract = Reputation::deploy(&env, NoArgs);
        let agent = env.get_account(1);
        let provider = env.get_account(2);

        // No authorized caller set yet - anyone calling should fail.
        env.set_caller(env.get_account(3));
        let result = contract.try_record_transaction(1, agent, provider, U512::from(1u64), true);
        assert!(result.is_err());

        // Set an authorized caller, then try calling from a different address.
        env.set_caller(env.get_account(0));
        contract.set_authorized_caller(env.get_account(0));

        env.set_caller(env.get_account(3));
        let result = contract.try_record_transaction(1, agent, provider, U512::from(1u64), true);
        assert!(result.is_err());
    }

    #[test]
    fn set_authorized_caller_from_non_owner_fails() {
        let env = odra_test::env();
        let mut contract = Reputation::deploy(&env, NoArgs);

        env.set_caller(env.get_account(1));
        let result = contract.try_set_authorized_caller(env.get_account(1));
        assert!(result.is_err());
    }

    #[test]
    fn reputation_tier_thresholds() {
        let env = odra_test::env();
        let mut contract = Reputation::deploy(&env, NoArgs);
        let payment_contract = env.get_account(0);
        let agent = env.get_account(1);
        let provider = env.get_account(2);

        env.set_caller(env.get_account(0));
        contract.set_authorized_caller(payment_contract);
        env.set_caller(payment_contract);

        // 0 calls -> New
        assert_eq!(contract.get_provider_score(provider).reputation_tier, Tier::New);

        // 1..99 calls -> still New
        for _ in 0..99 {
            contract.record_transaction(1, agent, provider, U512::from(1u64), true);
        }
        assert_eq!(contract.get_provider_score(provider).total_calls_served, 99);
        assert_eq!(contract.get_provider_score(provider).reputation_tier, Tier::New);

        // 100th call -> Established
        contract.record_transaction(1, agent, provider, U512::from(1u64), true);
        assert_eq!(contract.get_provider_score(provider).total_calls_served, 100);
        assert_eq!(contract.get_provider_score(provider).reputation_tier, Tier::Established);

        // Up to 999 calls -> still Established
        for _ in 0..899 {
            contract.record_transaction(1, agent, provider, U512::from(1u64), true);
        }
        assert_eq!(contract.get_provider_score(provider).total_calls_served, 999);
        assert_eq!(contract.get_provider_score(provider).reputation_tier, Tier::Established);

        // 1000th call -> Trusted
        contract.record_transaction(1, agent, provider, U512::from(1u64), true);
        assert_eq!(contract.get_provider_score(provider).total_calls_served, 1000);
        assert_eq!(contract.get_provider_score(provider).reputation_tier, Tier::Trusted);

        // Up to 9999 calls -> still Trusted
        for _ in 0..8999 {
            contract.record_transaction(1, agent, provider, U512::from(1u64), true);
        }
        assert_eq!(contract.get_provider_score(provider).total_calls_served, 9999);
        assert_eq!(contract.get_provider_score(provider).reputation_tier, Tier::Trusted);

        // 10000th call -> Elite
        contract.record_transaction(1, agent, provider, U512::from(1u64), true);
        assert_eq!(contract.get_provider_score(provider).total_calls_served, 10000);
        assert_eq!(contract.get_provider_score(provider).reputation_tier, Tier::Elite);
    }

    #[test]
    fn low_success_rate_downgrades_tier() {
        let env = odra_test::env();
        let mut contract = Reputation::deploy(&env, NoArgs);
        let payment_contract = env.get_account(0);
        let agent = env.get_account(1);
        let provider = env.get_account(2);

        env.set_caller(env.get_account(0));
        contract.set_authorized_caller(payment_contract);
        env.set_caller(payment_contract);

        // 100 calls, all failed -> would be Established by volume, but
        // 0% success rate should downgrade it to New.
        for _ in 0..100 {
            contract.record_transaction(1, agent, provider, U512::from(1u64), false);
        }
        assert_eq!(contract.get_provider_score(provider).reputation_tier, Tier::New);
    }
}
