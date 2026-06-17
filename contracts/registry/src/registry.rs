use odra::casper_types::U512;
use odra::prelude::*;

/// What kind of service a listing provides.
#[odra::odra_type]
pub enum Category {
    PriceData,
    Compute,
    Compliance,
    Document,
    Other
}

/// An API listed on the AgentPay marketplace.
#[odra::odra_type]
pub struct Listing {
    pub listing_id: u64,
    pub provider_wallet: Address,
    pub name: String,
    pub description: String,
    pub endpoint_url: String,
    pub price_per_call: U512,
    pub category: Category,
    pub rate_limit_per_second: u32,
    pub is_active: bool,
    pub created_at: u64
}

#[odra::odra_error]
pub enum Error {
    NotProviderOwner = 1,
    ListingNotFound = 2
}

#[odra::event]
pub struct ListingCreated {
    pub listing_id: u64,
    pub provider_wallet: Address,
    pub name: String
}

#[odra::event]
pub struct ListingUpdated {
    pub listing_id: u64
}

#[odra::event]
pub struct ListingDeactivated {
    pub listing_id: u64
}

/// The marketplace's on-chain database of API listings.
#[odra::module]
pub struct Registry {
    listings: Mapping<u64, Listing>,
    provider_listings: Mapping<Address, Vec<u64>>,
    listing_count: Sequence<u64>
}

#[odra::module]
impl Registry {
    /// Registers a new listing. The caller's wallet becomes the provider_wallet.
    pub fn register_listing(
        &mut self,
        name: String,
        description: String,
        endpoint_url: String,
        price_per_call: U512,
        category: Category,
        rate_limit_per_second: u32
    ) -> u64 {
        let provider_wallet = self.env().caller();
        let listing_id = self.listing_count.next_value();
        let created_at = self.env().get_block_time();

        let listing = Listing {
            listing_id,
            provider_wallet,
            name: name.clone(),
            description,
            endpoint_url,
            price_per_call,
            category,
            rate_limit_per_second,
            is_active: true,
            created_at
        };
        self.listings.set(&listing_id, listing);

        let mut ids = self.provider_listings.get_or_default(&provider_wallet);
        ids.push(listing_id);
        self.provider_listings.set(&provider_wallet, ids);

        self.env().emit_event(ListingCreated {
            listing_id,
            provider_wallet,
            name
        });

        listing_id
    }

    /// Updates a listing. Only the original provider wallet may call this.
    pub fn update_listing(
        &mut self,
        listing_id: u64,
        name: String,
        description: String,
        endpoint_url: String,
        price_per_call: U512,
        category: Category,
        rate_limit_per_second: u32
    ) {
        let mut listing = self.get_listing_or_revert(listing_id);
        self.assert_owner(&listing);

        listing.name = name;
        listing.description = description;
        listing.endpoint_url = endpoint_url;
        listing.price_per_call = price_per_call;
        listing.category = category;
        listing.rate_limit_per_second = rate_limit_per_second;
        self.listings.set(&listing_id, listing);

        self.env().emit_event(ListingUpdated { listing_id });
    }

    /// Deactivates a listing. The record stays on-chain for reputation history,
    /// but no longer appears in active searches. Only the provider wallet may call this.
    pub fn deactivate_listing(&mut self, listing_id: u64) {
        let mut listing = self.get_listing_or_revert(listing_id);
        self.assert_owner(&listing);

        listing.is_active = false;
        self.listings.set(&listing_id, listing);

        self.env().emit_event(ListingDeactivated { listing_id });
    }

    /// Returns the full listing, reverting if it doesn't exist.
    pub fn get_listing(&self, listing_id: u64) -> Listing {
        self.get_listing_or_revert(listing_id)
    }

    /// Returns paginated active listings, optionally filtered by category.
    /// This is what the MCP server calls to populate agent searches.
    pub fn get_active_listings(
        &self,
        category: Option<Category>,
        offset: u64,
        limit: u64
    ) -> Vec<Listing> {
        let total = self.listing_count.get_current_value();
        let mut matches: Vec<Listing> = Vec::new();
        let mut skipped = 0u64;
        let mut id = 0u64;

        while id < total && (matches.len() as u64) < limit {
            if let Some(listing) = self.listings.get(&id) {
                let category_matches = match &category {
                    Some(wanted) => &listing.category == wanted,
                    None => true
                };
                if listing.is_active && category_matches {
                    if skipped < offset {
                        skipped += 1;
                    } else {
                        matches.push(listing);
                    }
                }
            }
            id += 1;
        }

        matches
    }

    /// Returns all listings (active or not) for a given provider wallet.
    pub fn get_listings_by_provider(&self, wallet_address: Address) -> Vec<Listing> {
        self.provider_listings
            .get_or_default(&wallet_address)
            .iter()
            .filter_map(|id| self.listings.get(id))
            .collect()
    }
}

impl Registry {
    fn get_listing_or_revert(&self, listing_id: u64) -> Listing {
        match self.listings.get(&listing_id) {
            Some(listing) => listing,
            None => self.env().revert(Error::ListingNotFound)
        }
    }

    fn assert_owner(&self, listing: &Listing) {
        if self.env().caller() != listing.provider_wallet {
            self.env().revert(Error::NotProviderOwner);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{Category, Registry};
    use odra::casper_types::U512;
    use odra::host::{Deployer, NoArgs};

    fn sample_args() -> (String, String, String, U512, Category, u32) {
        (
            "CSPR/USD Price Feed".to_string(),
            "Real-time CSPR to USD exchange rate".to_string(),
            "http://localhost:3010/price".to_string(),
            U512::from(500_000u64),
            Category::PriceData,
            10u32
        )
    }

    #[test]
    fn register_and_get_listing() {
        let env = odra_test::env();
        let mut contract = Registry::deploy(&env, NoArgs);
        let provider = env.get_account(0);
        env.set_caller(provider);

        let (name, description, endpoint_url, price, category, rate_limit) = sample_args();
        let listing_id = contract.register_listing(
            name.clone(),
            description,
            endpoint_url,
            price,
            category,
            rate_limit
        );

        let listing = contract.get_listing(listing_id);
        assert_eq!(listing.listing_id, listing_id);
        assert_eq!(listing.name, name);
        assert_eq!(listing.provider_wallet, provider);
        assert!(listing.is_active);
    }

    #[test]
    fn update_listing_by_owner_succeeds() {
        let env = odra_test::env();
        let mut contract = Registry::deploy(&env, NoArgs);
        env.set_caller(env.get_account(0));

        let (name, description, endpoint_url, price, category, rate_limit) = sample_args();
        let listing_id =
            contract.register_listing(name, description, endpoint_url, price, category, rate_limit);

        contract.update_listing(
            listing_id,
            "Updated Price Feed".to_string(),
            "Updated description".to_string(),
            "http://localhost:3010/v2/price".to_string(),
            U512::from(750_000u64),
            Category::PriceData,
            20u32
        );

        let listing = contract.get_listing(listing_id);
        assert_eq!(listing.name, "Updated Price Feed");
        assert_eq!(listing.price_per_call, U512::from(750_000u64));
        assert_eq!(listing.rate_limit_per_second, 20u32);
    }

    #[test]
    fn update_listing_by_non_owner_fails() {
        let env = odra_test::env();
        let mut contract = Registry::deploy(&env, NoArgs);
        env.set_caller(env.get_account(0));

        let (name, description, endpoint_url, price, category, rate_limit) = sample_args();
        let listing_id =
            contract.register_listing(name, description, endpoint_url, price, category, rate_limit);

        env.set_caller(env.get_account(1));
        let result = contract.try_update_listing(
            listing_id,
            "Hijacked".to_string(),
            "Hijacked description".to_string(),
            "http://evil.example/price".to_string(),
            U512::from(1u64),
            Category::PriceData,
            1u32
        );

        assert!(result.is_err());
    }

    #[test]
    fn deactivate_listing_by_owner_succeeds() {
        let env = odra_test::env();
        let mut contract = Registry::deploy(&env, NoArgs);
        env.set_caller(env.get_account(0));

        let (name, description, endpoint_url, price, category, rate_limit) = sample_args();
        let listing_id =
            contract.register_listing(name, description, endpoint_url, price, category, rate_limit);

        contract.deactivate_listing(listing_id);

        let listing = contract.get_listing(listing_id);
        assert!(!listing.is_active);
    }

    #[test]
    fn deactivate_listing_by_non_owner_fails() {
        let env = odra_test::env();
        let mut contract = Registry::deploy(&env, NoArgs);
        env.set_caller(env.get_account(0));

        let (name, description, endpoint_url, price, category, rate_limit) = sample_args();
        let listing_id =
            contract.register_listing(name, description, endpoint_url, price, category, rate_limit);

        env.set_caller(env.get_account(1));
        let result = contract.try_deactivate_listing(listing_id);

        assert!(result.is_err());
    }

    #[test]
    fn get_active_listings_filters_inactive_and_category() {
        let env = odra_test::env();
        let mut contract = Registry::deploy(&env, NoArgs);
        env.set_caller(env.get_account(0));

        let price_feed_id = contract.register_listing(
            "Price Feed".to_string(),
            "desc".to_string(),
            "http://localhost:3010/price".to_string(),
            U512::from(500_000u64),
            Category::PriceData,
            10
        );
        let summarizer_id = contract.register_listing(
            "Summarizer".to_string(),
            "desc".to_string(),
            "http://localhost:3012/summarize".to_string(),
            U512::from(1_000_000u64),
            Category::Compute,
            5
        );
        let deactivated_id = contract.register_listing(
            "Old Feed".to_string(),
            "desc".to_string(),
            "http://localhost:3013/old".to_string(),
            U512::from(100_000u64),
            Category::PriceData,
            10
        );
        contract.deactivate_listing(deactivated_id);

        let all_active = contract.get_active_listings(None, 0, 10);
        assert_eq!(all_active.len(), 2);
        assert!(all_active.iter().any(|l| l.listing_id == price_feed_id));
        assert!(all_active.iter().any(|l| l.listing_id == summarizer_id));
        assert!(!all_active.iter().any(|l| l.listing_id == deactivated_id));

        let price_data_only = contract.get_active_listings(Some(Category::PriceData), 0, 10);
        assert_eq!(price_data_only.len(), 1);
        assert_eq!(price_data_only[0].listing_id, price_feed_id);
    }

    #[test]
    fn get_listings_by_provider_returns_only_that_providers_listings() {
        let env = odra_test::env();
        let mut contract = Registry::deploy(&env, NoArgs);
        let provider_a = env.get_account(0);
        let provider_b = env.get_account(1);

        env.set_caller(provider_a);
        let (name, description, endpoint_url, price, category, rate_limit) = sample_args();
        let listing_a =
            contract.register_listing(name, description, endpoint_url, price, category, rate_limit);

        env.set_caller(provider_b);
        let (name, description, endpoint_url, price, category, rate_limit) = sample_args();
        contract.register_listing(name, description, endpoint_url, price, category, rate_limit);

        let provider_a_listings = contract.get_listings_by_provider(provider_a);
        assert_eq!(provider_a_listings.len(), 1);
        assert_eq!(provider_a_listings[0].listing_id, listing_a);
    }
}
