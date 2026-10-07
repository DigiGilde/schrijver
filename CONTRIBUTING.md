# Contributing

## Run

```sh
npm install
cp .env.example .env
SCHRIJVER_FAKE_FORGE=1 SCHRIJVER_TEST_SESSION='{"sub":"dev","name":"Dev Gebruiker","email":"dev@example.org","emailVerified":true,"organisation":null,"exp":9999999999999}' npm run dev
```

The fake forge and the test session are ignored when `NODE_ENV` is `production`. See the [README](README.md) for details.

## Test

```sh
npm test            # unit tests (Vitest), including the round-trip corpus
npm run check       # svelte-check
npm run lint        # prettier --check
npm run test:e2e    # Playwright against the fake forge
```

Keep test output free of warnings.

## Conventions

- Language: the UI is Dutch; code, comments, documentation, commits, branches and pull requests are English. Route paths mirror the Dutch UI (`/instellingen`, `/sites`) and stay Dutch, also when English prose quotes them.
- No em dash or en dash anywhere (code, documentation, UI). Use a hyphen or rewrite the sentence. The exception is `LICENSE`, which is the verbatim EUPL-1.2 text.
- Comments only for a non-obvious constraint or gotcha, not to explain a change.
- Conventional commits: `feat:`, `fix:`, `test:`, `docs:`, `chore:`. One sharp line in the subject.
- No AI attribution lines in commits or pull requests.
- Keep changes surgical: no refactors or formatting changes outside the task.
- Delete files with `trash`, not `rm`. Container files are `Containerfile` and `compose.yml` (Podman).
- Secrets only via the environment; never log them, page content or e-mail addresses.
- Accessibility: every screen works with the keyboard, every form control is labelled, images need alt text, Mermaid needs `accDescr`.
- Design system: use `@nldd/design-system` components and attributes as documented; do not invent attribute names. The version is pinned exactly.
- Markdown in, Markdown out: opening and saving a page without edits must not change a byte. Any normalisation needs a test change.

## Review and branches

- Every change goes through a pull request with one approving review; nobody pushes to `main`. CI (lint, svelte-check, unit and e2e tests, pa11y) must pass.
- Branch names are `type/short-description`, with the type taken from the conventional commit types: `feat/`, `fix/`, `docs/`, `test/`, `chore/`.
- Be kind: see the [Code of Conduct](CODE_OF_CONDUCT.md).

## Licence headers

Files carry no SPDX headers or licence notice. The repository has one licence (EUPL-1.2, see [LICENSE](LICENSE) and [NOTICE](NOTICE)) and a per-file header would add noise to every file without changing the terms.

## Documentation

Documentation is part of the work. Update the files in [docs/](docs) when behaviour or configuration changes, and add a decision record in [docs/decisions](docs/decisions) for choices that are hard to reverse.
