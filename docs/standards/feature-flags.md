# Frontend Feature Flags

## Source of truth

All deferred frontend features are registered in `src/config/features.js`.
Each feature has a stable camelCase key. Future deferred features must use an
explicit boolean value and default to `false`.

`operatorGrowthTracking` opens the growth-planning tab on `/operator` in both development and production. The planning panel displays a persistent notice that it contains many Bugs and results need checking.

Use the exported key and reader in application code:

```js
import { FEATURE_KEYS, isFeatureEnabled } from '@/config/features.js'

const enabled = isFeatureEnabled(FEATURE_KEYS.OPERATOR_GROWTH_TRACKING)
```

The registry derives the development-only demo boundary with
`import.meta.env?.DEV === true`; the optional access keeps native Node tests
safe when Vite has not injected `import.meta.env`. Do not duplicate feature
names, boolean values, or comment-out instructions in individual pages and
components. Unknown keys are disabled by default.

## Integration rules

`achievementArchive` and `bondArchive` are enabled in development and production,
but their navigation and routes require `archive:access`. SUPER_ADMIN has this
permission automatically; other users need the ARCHIVE_USER role, granted in
`/admin/roles`. PLATFORM_ADMIN alone does not grant access. Catalog management
also requires the existing catalog-write permission. The backend enforces the
same access boundary, including catalog reads and admin endpoints.

Automatic operator panels require `operator_panel:use` (OPERATOR_PANEL_USER or
SUPER_ADMIN). Unauthorized users retain manual/observed values and do not request
automatic panels. Public BOX views also omit automatic results for unauthorized
viewers. These two usage roles do not grant administrative capability or Beta
bypass; existing Beta/account ownership requirements still apply. Deploy the
paired backend authorization changes before the enabled frontend.

`starCompletion` is a public feature with the explicit boolean value `true` in
both ordinary Vite development and production builds. The real completion workflow
requires no separate environment variable, user setting, URL parameter or demo.
API routing continues to use `VITE_API_BASE`, `YUANHUB_DEV_API_TARGET` and the
existing tunnel configuration without a completion-specific transport restriction.
For local integration, configure a local Backend target and use Vite's same-origin
proxy; enabling the feature does not select or change the API target.
The existing completion context, command, revision checks and receipt recovery remain authoritative.
The release workflow supplies the official API base through `YUANHUB_FRONTEND_API_BASE`.
Deploy a compatible Backend containing all three completion endpoints and the MongoDB
transaction/receipt implementation before releasing the enabled frontend. Backend
deployment readiness must be confirmed separately; a frontend build does not prove it.

`tutorials` is disabled in both ordinary development and production builds.
Only `VITE_TUTORIALS_ENABLED=true` explicitly enables it. All tutorial mounts,
controllers and tutorial persistence follow the derived `TUTORIALS_ENABLED`
export. Business UI and ordinary help remain available. See
[tutorial maintenance](../tutorials.md) for coverage, local opt-in and recovery checks.

`operatorDiscarded` is explicitly `false` in both development and production
until the paired MaaYuan version can read `discarded`. While disabled, single
and batch menus offer only 养成中/已毕业/养老中, filters default/reset to 全部,
and the discarded group, overview count and help are hidden. The public share
filter also offers only the original statuses. Existing discarded/unknown
values remain readable, including in shares and exports, and can be restored
to an original status without deleting growth data or favorites.

The frontend API wrapper rejects discarded annotation writes and backups
containing discarded before preview/import requests. Local discarded cache
migration is deferred with the cached value preserved and no completed marker,
so migration can resume after reopening. Old-state and note-only writes remain
available. Backend APIs and the four-value v3 schema remain compatible; this
switch does not sanitize existing cloud values, block direct API clients, or
change already-loaded old frontend builds.

After MaaYuan compatibility is released, set only
`[FEATURE_KEYS.OPERATOR_DISCARDED]` to `true`, update the default-off registry
assertions, verify the affected tests and rebuild/deploy the frontend. Focused
checks for the current default-off release:

```bash
node --test test/features.test.js test/operatorAnnotations.test.js test/operatorGrowthApi.test.js
npm run test:behavior -- behavior/operatorDiscardedGroup.spec.js behavior/operatorSharePage.spec.js
```

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

Growth planning, recruitment and calendar use explicit `true` values in all builds. The star-completion demo remains DEV-only and tutorials require explicit opt-in. Release switches are build-time values; changes require rebuilding and deploying the frontend.

The flag only controls frontend visibility and interaction. It is not an
authentication, authorization, or data-protection boundary; backend APIs and
backup compatibility must be changed separately if a feature later needs to be
strictly unavailable.

`recruitmentArchive` controls `/recruitment` and both navigation entries and is explicitly `true`. The route requires authentication and the shared `requiresBeta` gate. Its workspace no longer polls independent recruitment access. `/admin/recruitment-access` redirects to `/manage`; the retired access settings and historical grants do not control current access. Public catalog GET remains public; private recruitment requests and shared account endpoints are protected by backend Beta policy.

`activityCalendar` is explicitly `true`. `/calendar` and both suggestion routes require authentication and shared Beta eligibility, without admin testing restrictions. Navigation exposes the feature entrance; routing and backend policy enforce access. Today summaries, subscriptions and private items work for ordinary eligible users. Management and suggestion review retain `activity_calendar:write`. Feature-disabled pages remain lazy and prevent API initialization. See [activity calendar](../activity-calendar.md).
