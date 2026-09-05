/**
 * Valorant store / loadout / daily market (Adım 6 — stub).
 *
 * Intentionally empty of live Store endpoints for Adım 4 ship.
 * Structure kept so Companion can mount a "coming soon" card and later
 * wire PD storefront + loadout presets without reshaping friends/party.
 *
 * Planned (not implemented yet):
 * - GET current bundle / featured set
 * - Daily store offers (skin change / rotation)
 * - Loadout presets (agents, skins, sprays)
 *
 * Uses the same live Riot session (access + entitlement) as Adım 2–4.
 * Never accepts or logs Riot passwords.
 */

function storeCapabilities() {
  return {
    implemented: false,
    adim: 6,
    features: {
      dailyStore: false,
      currentBundle: false,
      loadoutPresets: false,
      skinChange: false,
    },
    note: "Adım 6 — daily store / bundle / loadout. Not shipped in Adım 4.",
  };
}

module.exports = {
  storeCapabilities,
};
