# Beta preparation tool

The default run is read-only. Explicit `--apply` creates a frozen snapshot with the campaign CLOSED and admissions paused. This tool does not enroll anyone.

See [the rollout guide](../../docs/operations/beta-rollout.md) for required connection environment variables, provenance checks, timing, recovery, and publication steps. Copy `config.example.json` outside the repository and replace every placeholder. Keep UID lists and credentials outside version control.

```sh
npm ci --prefix scripts/beta
node scripts/beta/prepare.mjs --config /secure/beta/config.json --uids /secure/beta/share-uids.txt
npm test --prefix scripts/beta
```

Mongo integration tests require an explicit `BETA_TEST_MONGO_URI` pointing to an isolated test replica set. Tests create and remove only their own randomly named `beta_test_*` databases.
