# Repository instructions

Before changing this repository, read [agent.md](agent.md), then the relevant sections of [readme.md](readme.md) and [plan.md](plan.md).

Preserve the financial approval rules, owner/role isolation, exact minor-unit allocations, legacy data compatibility, and separation of estimates from posted transactions. The files describe both existing behavior and future work; do not treat planned functions as implemented.

Use the pinned pnpm lockfile. Validate changes with TypeScript, meaningful regression tests, and a production build as appropriate. Never commit credentials, production data, database dumps, runtime state, or generated caches. Do not deploy a GitHub copy as a public server trusting user-supplied identity headers.
