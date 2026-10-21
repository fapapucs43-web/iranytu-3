# Deployment verification — `main` at `e008a05`

The record of one deploy and the evidence that production is running it.
Written because "it deployed" and "production is running this build" are
different claims, and only the second one matters.

## What was deployed

| | |
| --- | --- |
| Commit | `e008a0575fcfba527422697ba36383383b9c68b7` |
| Merge | PR #25, parents `531d0ab` + `8d98e0f` |
| Domain | `https://iranytu2.freebuff.app` |
| State | `active`, 52 files, no warnings, no unresolved build errors |
| Install command | `npm ci` |
| Build command | `npm run build` |
| Config check | `deployable: true`, `problems: []` |

Local `main` and `origin/main` were both `e008a05` before the deploy, and the
working tree carried nothing but untracked scratch.

## The proof: sha256 and `cmp`, not a status code

Every asset fetched with `Accept-Encoding: identity` so the bytes compared are
the bytes served, not a gzip stream a proxy chose to substitute.

| File | Bytes | sha256 |
| --- | --- | --- |
| `assets/index-Bl_rIanE.js` | 495 698 | `0cb6863badf7c08a384bacee3d6224e51dddc72dea15a70dae33085d0f3e31f2` |
| `assets/index-rekgrbBj.css` | 49 839 | `4479d3d36aaaaaeb861a11a2acf5eaf4684f120e52b79bba7aae9197be847d1e` |
| `sw.js` | 7 204 | `da2896061c54c05c323ca3aea76a22e4e959ee0384d4dfb15767b56d83f25b64` |
| `index.html` | 902 | `fcfddf176eac2c2c8f14b08c0249e6d2c27ef20b3872aa62eb082642457fb9e7` |

All four `cmp`-identical to the local `dist/`. Then the stronger check: **all
52 files** fetched and compared, **0 differ**.

## Why a 200 was never accepted as proof

This host serves the SPA shell for any path that does not exist, so a 200 is
the *expected* response for garbage. Three negative controls, each returning
the 902-byte shell:

| Path | Status | Bytes |
| --- | --- | --- |
| `/assets/nonexistent-9f2b4c.js` | 200 | 902 |
| `/assets/index-CfFvm26w.js` (a bundle from three deploys ago) | 200 | 902 |
| `/totally/bogus/path.txt` | 200 | 902 |

That is also how the previous build is shown to be *gone*: the old bundle name
now falls through to the shell instead of returning JavaScript.

## Content probes

The new palette is in the served bundle exactly once each, and every
superseded value is absent:

| Present (1 each) | Absent (0 each) |
| --- | --- |
| `746453` warm `--ink-soft` | `7a6a58` |
| `af531e` warm `--brand` | `b3541e` |
| `b88a04` warm `--accent` | `c99700` |
| `af4637` warm `--danger` | `c04a3a` |
| `bd3065` vibrant `--danger` | `d6336c` |

Hungarian reader-facing strings present: `Meditációk`, `Belső`, `Hangulat`,
`Beállítások`. `index.html` references `index-Bl_rIanE.js` and
`index-rekgrbBj.css`, so the shell points at the build that is actually
served.

## No key material in the bundle

| Probe | Hits |
| --- | --- |
| `OPENAI_API_KEY` | 0 |
| `api_key` | 0 |
| `BEGIN PRIVATE KEY` | 0 |
| `BEGIN RSA` | 0 |
| `passphrase` | 0 |
| `recoveryWords` | 0 |
| `sharedKey` | 0 |
| `dataKey` | 0 |
| `sk-[A-Za-z0-9]{16,}` | 0 |

`sk-` appears **once**, at byte 463043, and it is worth recording rather than
dismissing. In context:

```js
{id:"food-ai-key",type:"password",placeholder:"sk-…",value:a,onChange:...}
```

It is a placeholder on a `type="password"` input, telling the reader what
shape their OpenAI key takes. No key-shaped string exists in the bundle. The
single `exportKey` occurrence is `wrapKey`'s
`crypto.subtle.exportKey("raw", key)` in `src/lib/backupCrypto.ts` — code,
not key bytes.

## Reproducing this

```bash
bun run build
freebuff-deploy check      # its own command
freebuff-deploy start      # its own command
freebuff-deploy status     # its own command, poll until active

B=https://iranytu2.freebuff.app
while IFS= read -r f; do rel="${f#dist/}"
  curl -sS -o "/tmp/p/$rel" -H 'Accept-Encoding: identity' "$B/$rel"
  cmp -s "$f" "/tmp/p/$rel" || echo "DIFFERS: $rel"
done < <(find dist -type f | sort)
```

`freebuff-deploy` and `freebuff-preview` are Freebuff-managed: each runs as its
own command, never chained, never in a pipeline.