# Frontend Feature Flags

## Source of truth

All deferred frontend features are registered in `src/config/features.js`.
Each feature has a stable camelCase key. Future deferred features must use an
explicit boolean value and default to `false`.

The initial `operatorGrowthTracking` flag controls the growth-tracking tab on
the `/operator` page. It is enabled only while Vite reports development mode
(`npm run dev`) and is disabled in production builds and deployments.

Use the exported key and reader in application code:

```js
import { FEATURE_KEYS, isFeatureEnabled } from '@/config/features.js'

const enabled = isFeatureEnabled(FEATURE_KEYS.OPERATOR_GROWTH_TRACKING)
```

The registry derives the current development-only value with
`import.meta.env?.DEV === true`; the optional access keeps native Node tests
safe when Vite has not injected `import.meta.env`. Do not duplicate feature
names, boolean values, or comment-out instructions in individual pages and
components. Unknown keys are disabled by default.

## Integration rules

- A standalone feature route declares `meta.feature` and may declare
  `meta.featureFallback`; the router redirects disabled routes to the fallback
  or `/cart`.
- A page-level feature must guard every user entry point, the content panel,
  and the state transition that selects the feature. Guarding only a button is
  not sufficient.
- Keep lazy components lazy. A disabled feature should not render its async
  component or run its initialization code.
- Do not put these flags in `localStorage`, user permissions, or remote
  configuration for an all-user build-time release switch.

## Development and production behavior

The current flag has an intentional environment boundary:

```text
npm run dev    # import.meta.env.DEV = true  -> operatorGrowthTracking = true
npm run build  # import.meta.env.DEV = false -> operatorGrowthTracking = false
npm test
```

Vite resolves `import.meta.env.DEV` at build time, so production deployments
must be built with `npm run build`. Future flags may be opened or rolled back
only by changing their own explicit boolean in `src/config/features.js`, then
running `npm test`, `npm run build`, and deploying the new static assets.

The flag only controls frontend visibility and interaction. It is not an
authentication, authorization, or data-protection boundary; backend APIs and
backup compatibility must be changed separately if a feature later needs to be
strictly unavailable.

`recruitmentArchive` controls the `/recruitment` route and both navigation entries. The delivered local MVP uses the explicit boolean `true` so users can review it directly; development and production builds both follow this value. It does not imply deployment. Before publishing, complete the pending user verification and decide whether to keep it open or set only `[FEATURE_KEYS.RECRUITMENT_ARCHIVE]` to `false` in `src/config/features.js`. The page requires login and independent recruitment access (`meta.requiresRecruitmentAccess`), managed at `/admin/recruitment-access`; it does not require global beta access. The backend independently protects private recruitment endpoints.

`activityCalendar` controls `/calendar`, `/calendar/admin`, both public navigation entries, and the activity calendar tool in the content-maintenance group. Batch 03/04 uses the explicit boolean `true` for local/manual acceptance; this also applies to production builds and does not imply deployment. To close it, change only `[FEATURE_KEYS.ACTIVITY_CALENDAR]` to `false`. Both routes remain lazy and declare `meta.feature`; the pages also prevent API initialization while disabled. The public calendar requires no login or beta access. Management independently requires authentication and `activity_calendar:write`. See [activity calendar](../activity-calendar.md) for behavior and focused verification.
