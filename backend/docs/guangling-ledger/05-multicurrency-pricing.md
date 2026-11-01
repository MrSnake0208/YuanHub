# Personal pricing extension (2026-10-22)

This addendum supersedes the legacy game-bound price restriction when `pricing` and an explicit price pair are supplied. Existing endpoints, ownership checks, quota, private storage collection and legacy fields remain in place.

## Request and detail response

`pricing` is optional for legacy clients. New clients always send:

```json
{
  "currency": "JPY",
  "rates": { "USD": 7, "HKD": 0.9, "JPY": 0.05 },
  "discount_percent": 95,
  "custom_only": true
}
```

Rates above are synthetic examples, not market data. Rates express CNY per unit of the foreign currency; CNY is always 1 and must not be supplied in the rates map. Supported currencies are CNY, USD, HKD, JPY. Discount must be finite and in `(0,100]`. Foreign rates must be finite, at most 1e6 and positive, except legacy USD source rate zero remains supported. A target-currency divisor must be positive. Only selected source currencies and the target require rates; valid unused rates may be stored. A supplied legacy USD `exchange_rate` fallback is materialized into pricing rates so ru plans also round-trip correctly.

Custom packages and cart item snapshots additionally accept paired `price_amount` / `price_currency` and `discount_eligible` (default true). The explicit pair takes precedence over the legacy price fields. Both fields must be present together; amounts must be finite in `[0,1e9]`. When absent, the existing game's `price_usd` or `price_cny` is required. Explicit prices and discount exclusions require `pricing`.

New-format custom packages retain distinct same-name records; IDs remain server-assigned and cart references are remapped. Selected custom snapshots use the normalized custom definition to ensure summary and frontend reload agree. Legacy name deduplication remains unchanged. Public catalog records are not edited or extended by this API.

## Calculation and summaries

`CNY subtotal = source price × quantity × applicable discount × source rate`.
`display total = summed CNY subtotals / display currency rate`.
Discount changes spend, not points/draws. Sum unrounded values; round for presentation only (two decimals for CNY/USD/HKD, zero for JPY; per-draw cost two). `summary.total_cny` retains its meaning; `summary.total_amount` and `summary.currency` carry the display total. For legacy summaries `total_amount` may be null and currency defaults to CNY.

## Compatibility and rollout

Missing `pricing` denotes legacy storage and preserves legacy arithmetic. No bulk data migration is required. GET detail returns pricing; list returns the extended summary. The frontend must preserve pricing and generic price fields through guest upload, save-as, overwrite and rename's GET → full PUT path.

PUT to a plan already containing pricing without sending pricing returns a business conflict (409) with a refresh message, preventing old clients from silently erasing new settings. Owner lookup precedes this check; other users continue to receive the same not-found response. Deploy the compatible backend before exposing the frontend. Rolling back the frontend leaves new records protected but requires the new frontend again to edit them correctly.

## Focused validation

`LedgerPricingServiceTest` covers snake-case request binding, mixed HKD/JPY prices, exclusions, new-format name preservation, canonical snapshot/summary consistency, USD fallback persistence, rejected invalid inputs, old-client write protection and ownership. Existing ledger service/MVC tests preserve legacy behavior. Frontend Node pricing tests and cart component tests cover guest/cloud/rename/export flows. No development Mongo/Redis or live browser is needed for these checks.
