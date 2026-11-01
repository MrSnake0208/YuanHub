#!/usr/bin/env bash

set -euo pipefail

api_base_url="${API_BASE_URL:-http://127.0.0.1:8080}"
api_base_url="${api_base_url%/}"

if [[ -z "${INVENTORY_API_TOKEN:-}" ]]; then
    echo "INVENTORY_API_TOKEN is required" >&2
    exit 1
fi
for tool in curl jq; do
    if ! command -v "$tool" >/dev/null 2>&1; then
        echo "$tool is required" >&2
        exit 1
    fi
done

tmp_dir="$(mktemp -d)"
trap 'rm -rf -- "$tmp_dir"' EXIT

expect_status() {
    local expected="$1"
    local actual="$2"
    local body_file="$3"
    local label="$4"
    if [[ "$actual" != "$expected" ]]; then
        echo "$label: expected HTTP $expected, got $actual" >&2
        jq . "$body_file" >&2 2>/dev/null || sed -n '1,80p' "$body_file" >&2
        exit 1
    fi
}

expect_json() {
    local body_file="$1"
    local filter="$2"
    local label="$3"
    if ! jq -e "$filter" "$body_file" >/dev/null; then
        echo "$label: JSON assertion failed: $filter" >&2
        jq . "$body_file" >&2
        exit 1
    fi
}

api_request() {
    local method="$1"
    local path="$2"
    local body_file="$3"
    local request_file="${4:-}"
    local curl_args=(
        --silent
        --show-error
        --output "$body_file"
        --write-out '%{http_code}'
        --request "$method"
        --header "Authorization: Bearer ${INVENTORY_API_TOKEN}"
    )
    if [[ -n "$request_file" ]]; then
        curl_args+=(--header 'Content-Type: application/json' --data-binary "@$request_file")
    fi
    curl "${curl_args[@]}" "$api_base_url$path"
}

current_count() {
    local body_file="$1"
    jq --arg item_id "$item_id" \
        '([.data[]? | select(.entity_type == "item") | .entries[$item_id].count] | first) // 0' \
        "$body_file"
}

account_body="$tmp_dir/account.json"
account_status="$(api_request GET "/open-api/inventory/account" "$account_body")"
expect_status 200 "$account_status" "$account_body" "token account"
expect_json "$account_body" '.status_code == 200 and (.data.id | type == "string")' "token account"
inventory_account_id="$(jq -er '.data.id' "$account_body")"

catalog_body="$tmp_dir/catalog.json"
catalog_status="$(curl --silent --show-error --output "$catalog_body" --write-out '%{http_code}' \
    "$api_base_url/v1/inventory/catalog")"
expect_status 200 "$catalog_status" "$catalog_body" "catalog"
expect_json "$catalog_body" '.status_code == 200 and (.data.entities | length > 0)' "catalog"

item_id="$(jq -er '[.data.entities[] | select(.entity_type == "item") | .id][0]' "$catalog_body")"
item_name="$(jq -er --arg item_id "$item_id" \
    '[.data.entities[] | select(.entity_type == "item" and .id == $item_id) | .name][0]' "$catalog_body")"
catalog_version="$(jq -er '.data.catalog_version' "$catalog_body")"
record_id="local-smoke-$(date -u +%Y%m%dT%H%M%S%N)-$$"
now="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

before_body="$tmp_dir/current-before.json"
before_status="$(api_request GET "/open-api/inventory/current?entity_type=item" "$before_body")"
expect_status 200 "$before_status" "$before_body" "current before import"
expect_json "$before_body" '.status_code == 200 and (.data | type == "array")' "current before import"
before_count="$(current_count "$before_body")"
expected_count="$((before_count + 1))"

request_body="$tmp_dir/import.json"
jq -n \
    --arg exported_at "$now" \
    --arg catalog_version "$catalog_version" \
    --arg record_id "$record_id" \
    --arg effective_at "$now" \
    --arg item_id "$item_id" \
    --arg item_name "$item_name" \
    --arg account_id "$inventory_account_id" \
    '{
        format: "myshare-inventory-exchange",
        version: 2,
        exported_at: $exported_at,
        producer: {platform: "backendv3-local-smoke", version: "1"},
        catalog_version: $catalog_version,
        records: [{
            account_id: $account_id,
            record_id: $record_id,
            record_type: "reward_delta",
            entity_type: "item",
            acquisition_channel: "local-smoke",
            effective_at: $effective_at,
            entries: [{id: $item_id, name: $item_name, count: 1}]
        }]
    }' >"$request_body"

first_body="$tmp_dir/import-first.json"
first_status="$(api_request POST /open-api/inventory/import "$first_body" "$request_body")"
expect_status 200 "$first_status" "$first_body" "first import"
expect_json "$first_body" '.status_code == 200 and .data.accepted == 1 and .data.duplicates == 0' "first import"

after_first_body="$tmp_dir/current-after-first.json"
after_first_status="$(api_request GET "/open-api/inventory/current?entity_type=item" "$after_first_body")"
expect_status 200 "$after_first_status" "$after_first_body" "current after first import"
after_first_count="$(current_count "$after_first_body")"
if [[ "$after_first_count" -ne "$expected_count" ]]; then
    echo "first import: expected item count $expected_count, got $after_first_count" >&2
    exit 1
fi

duplicate_body="$tmp_dir/import-duplicate.json"
duplicate_status="$(api_request POST /open-api/inventory/import "$duplicate_body" "$request_body")"
expect_status 200 "$duplicate_status" "$duplicate_body" "duplicate import"
expect_json "$duplicate_body" '.status_code == 200 and .data.accepted == 0 and .data.duplicates == 1' "duplicate import"

after_duplicate_body="$tmp_dir/current-after-duplicate.json"
after_duplicate_status="$(api_request GET "/open-api/inventory/current?entity_type=item" "$after_duplicate_body")"
expect_status 200 "$after_duplicate_status" "$after_duplicate_body" "current after duplicate"
after_duplicate_count="$(current_count "$after_duplicate_body")"
if [[ "$after_duplicate_count" -ne "$after_first_count" ]]; then
    echo "duplicate import changed item count from $after_first_count to $after_duplicate_count" >&2
    exit 1
fi

conflict_request="$tmp_dir/import-conflict.json"
jq '(.records[0].entries[0].count) = 2' "$request_body" >"$conflict_request"
conflict_body="$tmp_dir/import-conflict-response.json"
conflict_status="$(api_request POST /open-api/inventory/import "$conflict_body" "$conflict_request")"
expect_status 409 "$conflict_status" "$conflict_body" "conflicting import"
expect_json "$conflict_body" ".error.code == \"record_conflict\" and .error.record_id == \"$record_id\"" "conflicting import"

export_body="$tmp_dir/export.json"
export_status="$(api_request GET "/open-api/inventory/export" "$export_body")"
expect_status 200 "$export_status" "$export_body" "inventory export"
expect_json "$export_body" \
    '.format == "myshare-inventory-exchange" and .version == 2 and (.accounts | length == 1) and (.records | length > 0) and (has("status_code") | not)' \
    "inventory export"

roundtrip_body="$tmp_dir/import-roundtrip.json"
roundtrip_status="$(api_request POST /open-api/inventory/import "$roundtrip_body" "$export_body")"
expect_status 200 "$roundtrip_status" "$roundtrip_body" "export round-trip import"
expect_json "$roundtrip_body" '.status_code == 200 and .data.accepted >= 1' "export round-trip import"

echo "Inventory smoke test passed for local record $record_id."
