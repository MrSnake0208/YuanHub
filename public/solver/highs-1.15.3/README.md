# HiGHS WebAssembly runtime

Vendored from the MIT-licensed [`highs@1.15.3`](https://www.npmjs.com/package/highs/v/1.15.3) package, maintained at [lovasoa/highs-js](https://github.com/lovasoa/highs-js). Files are unmodified: `build/highs.mjs`, `build/highs.wasm`, and `LICENSE`.

Package integrity: `sha512-5rzjBlAkqRxr7FOv+iZjxF8nNfKsEt8uOaP3S6gls6yRf4+Jv4BqBIE3iPFsgfOHutQBMNxRE9jWhxRAM7Oycw==`.

The planner loads these local assets only when the user starts an exact solve. No CDN, external service, build-time download, or parent workspace is required. Solver work runs in a terminable module Worker. The PWA does not precache this runtime.

To update, inspect the upstream license/API, download a pinned npm release with `npm pack highs@<version> --ignore-scripts`, replace this versioned directory, update the loader URL and `EXACT_SOLVER_VERSION`, and rerun the exact planner and browser tests.
