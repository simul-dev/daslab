# DAS Lab — multi-demo local workflow

The homepage and the two independent browser-only demos are assembled into one `dist/`.
Neither demo needs a Node server, SSR, authentication or a remote simulation API at runtime.

## Local commands

Run from this repository root (Node >=22.13 and the pinned pnpm version).

```powershell
pnpm install --frozen-lockfile
pnpm dev:home
pnpm dev:demo
pnpm dev:pump
```

Run only the server you need, or use separate terminals:

| Command | Local entry |
| --- | --- |
| `pnpm dev:home` | `http://127.0.0.1:4173/demo.html` (homepage source only) |
| `pnpm dev:demo` | `http://127.0.0.1:5173/demo/logistics/fulfillment/` |
| `pnpm dev:pump` | `http://127.0.0.1:5174/demo/manufacturing/pump-assembly/` |

The homepage source server does not compile demo links. Use the assembled preview to test navigation across the whole site:

```powershell
pnpm check
pnpm preview
```

Stop `dev:home` before preview: both use port 4173.
`check` runs both simulation test suites, both TypeScript/Vite builds, site assembly, and generated asset/link checks.
`pnpm build` still builds the deployable site without running tests; `pnpm test:pump` is the quick pump-only test command.

## Generated deployment output

```text
dist/
  index.html / index_en.html
  resource.html / resource_en.html
  demo.html / demo_en.html
  CNAME
  static/
  demo/
    logistics/fulfillment/index.html + assets/
    manufacturing/pump-assembly/index.html + assets/
```

Both demo public folders are also copied into their corresponding URL roots (favicon and logo).

Final local preview URLs:

- `http://127.0.0.1:4173/demo.html#manufacturing`
- `http://127.0.0.1:4173/demo.html?lang=en#manufacturing`
- `http://127.0.0.1:4173/demo/manufacturing/pump-assembly/`
- `http://127.0.0.1:4173/demo/logistics/fulfillment/`

For the existing manual deployment, run `pnpm check` and publish **the contents of root `dist/`** as the website root, including `static/`, `demo/` and `CNAME`.
Do not upload only the root source HTML files: that omits the compiled demos.
Do not put the entire output under a public `/dist/` URL.
The existing Pages workflow continues to build and upload this same root `dist/` artifact; its deployment settings were not changed for the pump demo.

`dist/` and each demo's local `dist/` are generated and ignored by Git.
If a separate manual publishing repository requires committed built files, copy the contents of `dist/` to that repository's established publishing root; do not commit build output to this source repository by accident.
No push or remote deployment is part of local validation.

## Adding the next independent demo

1. Add `demos/<demo-name>/` with its own package.json, Vite config and source.
2. Use its complete public base path in Vite; public assets use `import.meta.env.BASE_URL`.
3. Register `source` and `base` in `scripts/demo-manifest.mjs`.
4. Add both Korean and English text to the matching industry section in `demo.html`; `demo_en.html` is the existing English redirect.
5. Add a root development convenience command, refresh the workspace lockfile, and run `pnpm check`.
6. Check direct navigation and refresh at the complete base path in `pnpm preview`.

The workspace glob builds/tests all `demos/*` packages; assembly uses the explicit manifest and validates public paths before replacing generated output.
The static-output verifier expects each demo's entry script, favicon and DAS Lab logo under its own base.
