# Licences

Every asset this app ships, and what it obliges us to do.

The app sends nothing anywhere. There is no CDN, no analytics, no telemetry
and no account — the privacy promise on the Adatvédelem card is the reason
the fonts and the icon sets are self-hosted rather than fetched from a
third party. Everything below is served from this app's own origin.

## Icon sets

Three sets are selectable in **Beállítások → Ikonok és emoji**. None of them
downloads anything: the first two ship no artwork at all, and the third's
artwork is inlined into the JavaScript bundle, so choosing it costs no request
and cannot fail to load.

| Set | Format | Download | Licence | Obligation |
|---|---|---|---|---|
| Lucide | inline SVG in the JS bundle | 0 B | ISC | notice |
| Rendszer emoji | the device's own glyphs | 0 B | *n/a* | none — not our file |
| Fluent 3D | SVG inlined into the JS bundle | 0 B | MIT | notice |

The bundle grows by about 80 kB gzipped because of the third row. That is the
deliberate price of "no download when you pick a set", and it is charged once
on first load rather than at the moment the user reaches for the thing they
came to change.

### Lucide — ISC

<https://github.com/lucide-icons/lucide> · © Lucide Contributors
Copyright (c) for the Lucide project. Permission to use, copy, modify and/or
distribute this software for any purpose with or without fee is hereby
granted. The software is provided "as is" and the author disclaims all
warranties.

Vendored into `src/lib/icons.tsx` as path data. ISC asks only that the notice
accompany copies, which this file and the source header do.

### Rendszer emoji — not our file

No artwork is shipped. The characters are drawn by the operating system's own
emoji font, so the licence is the device manufacturer's and there is nothing
for us to redistribute or attribute. This row exists so the list is complete,
not because there is a licence to state.

### Fluent 3D — MIT

<https://github.com/microsoft/fluentui-emoji> · © Microsoft Corporation
Upstream package `fluentui-emoji` 1.3.0, `icons/modern/` style. The 38 pieces
the app draws are inlined verbatim into `src/lib/iconsets/fluent-artwork.ts`
by `bun scripts/vendor-fluent-artwork.ts`; the XML prolog and inter-element
whitespace are stripped, and nothing else is changed.

MIT permits use, modification and redistribution with the copyright and
licence notice included. The notice is this section. Because MIT is the only
thing that applies to the artwork — there is no second, stricter licence hiding
behind it — no in-app attribution is required, and the licence list inside
**Beállítások → Ikonok és emoji** exists for the user's information rather than
to discharge an obligation.

### Twemoji — withdrawn

<https://github.com/twitter/twemoji> · Copyright 2019 Twitter, Inc and other contributors
Upstream revision `v14.0.2`, `assets/svg/`. **No longer shipped.** The files
and their licence texts are removed, and the set is no longer offered.

The reason is worth recording, because it was not obvious at first: the MIT
licence in that repository covers its *code*, and the SVG files are artwork
under **CC-BY 4.0**. Redistributing them obliges us to credit the author, which
is a real obligation and one this app was willing to meet — the reason the
licence list inside the app exists at all. It was not worth taking on for a
second 3D set that Fluent already covers, and Fluent is MIT with no strings
attached.

A user who had selected Twemoji is moved to Fluent rather than reset, because
they chose a 3D look and the honest successor of a 3D set is another 3D set;
dropping the setting would have put them back on the pre-Batch-7 appearance
with no explanation. The move is announced once, in the app's own words.

Nothing is owed by the removal. Redistribution rights under CC-BY 4.0 are
granted, not required, so shipping the artwork created the obligation and
stopping creates none.

## Typefaces

Four families for the interface plus one handwriting face, selectable in
**Beállítások → Betűtípus**. Inter is the default rather than merely the
recommendation: a user who stored the old `system` value is moved to it once,
which is a visible change to their app and a deliberate one. All self-hosted, all under the SIL Open Font
License 1.1, in `public/fonts/`.

| Family | Kind | Files | Licence |
|---|---|---|---|
| Inter | UI, sans (the default) | `inter-latin.woff2`, `inter-latin-ext.woff2` | OFL 1.1 |
| Montserrat | UI, sans | `montserrat-latin.woff2`, `montserrat-latin-ext.woff2` | OFL 1.1 |
| Roboto | UI, sans | `roboto-latin.woff2`, `roboto-latin-ext.woff2` | OFL 1.1 |
| Playfair Display | UI, serif | `playfair-display-latin.woff2`, `playfair-display-latin-ext.woff2` | OFL 1.1 |
| Lora | UI, serif | `lora-latin.woff2`, `lora-latin-ext.woff2` | OFL 1.1 |
| Quicksand | UI, rounded | `quicksand-latin.woff2`, `quicksand-latin-ext.woff2` | OFL 1.1 |
| Saira Condensed | UI, condensed | `saira-condensed-400-latin.woff2`, `saira-condensed-400-latin-ext.woff2`, `saira-condensed-700-latin.woff2`, `saira-condensed-700-latin-ext.woff2` | OFL 1.1 |
| JetBrains Mono | UI, monospace | `jetbrains-mono-latin.woff2`, `jetbrains-mono-latin-ext.woff2` | OFL 1.1 |
| Dancing Script | the user's own notes only | `dancing-script-latin.woff2`, `dancing-script-latin-ext.woff2` | OFL 1.1 |

Verbatim licence texts ship alongside the binaries in `public/fonts/`, one per
family, named after the family slug: `OFL-inter.txt`, `OFL-montserrat.txt`,
`OFL-roboto.txt`, `OFL-playfair-display.txt`, `OFL-lora.txt`,
`OFL-quicksand.txt`, `OFL-saira-condensed.txt`, `OFL-jetbrains-mono.txt` and
`OFL-dancing-script.txt`.

### Why five kinds of typeface

Batch 7f added these five because a user reported that Inter, Montserrat and
Roboto looked nearly identical. They do: all three are neutral grotesques, and a
list of names asks the reader to already know a difference they cannot see. The
picker is therefore grouped by kind — Sans, Serif, Rounded, Condensed, Mono —
so the choice has a shape. Saira Condensed is the substitute for Oswald, which
was measured and rejected: Google's `latin-ext` cut of Oswald carries eight
characters from Latin Extended-A (`ĂăĐđĨĩŨũ`) and **neither ő nor ű**, so a
Hungarian app cannot use it.

### Roboto is OFL, not Apache

Roboto was distributed under Apache 2.0 for many years and is widely described
that way. Google relicensed it to the SIL Open Font License, and the
`apache/roboto` directory in `google/fonts` no longer exists — only `ofl/roboto`
does. That is why every row above says OFL 1.1 and why there is no
`LICENSE-Apache` text in `public/fonts/`: shipping an Apache 2.0 notice for
Roboto would be shipping a licence the current release is not under.

### Saira Condensed is not a variable font

Saira Condensed has no variable version upstream, only static cuts, so it ships
as four files rather than two and each file carries its own weight. This app's
stylesheet asks for 600 and 800, which it does not ship. The Bold cut is
therefore registered for the whole 700–800 band, so those weights resolve to a
real cut instead of to a synthesised one, which would look heavier than the
equivalent heading in the other families.

### The `latin-ext` subsets are not optional — and a declared range is not proof

Hungarian needs ő and ű, and a Latin-only subset would render exactly those two
letters in a fallback face — a visible half-and-half mixture in the app's own
language.

This section used to end "all five families were checked for both characters
before they were added", and that was false. **Lato was offered for months
while being unable to render ő or ű.** The registry declared
`U+0100-02BA` for its `latin-ext` file, which is *true* — ő (U+0151) and ű
(U+0171) are both inside that range. The file did not keep the declaration:
Google's `latin-ext` subset of Lato is the Central-European cut
(`ĄąĆćĘęŁłŃńŚśŠšŸŹźŻżŽžƒˇˉ˝`) and omits both, while the upstream font has them.
Every existing test checked the claim; nothing checked the bytes.

`src/lib/font-cmap.ts` now reads the real character map out of each woff2 —
Brotli, table directory, `cmap` — and `tests/batch7f.test.ts` asserts both
characters are present, and that the `latin` files genuinely lack them so the
subset split means something. A family that cannot spell Hungarian can no longer
enter the registry.

### Dancing Script is scoped, not global

A script face applied to buttons, menu labels or form fields is measurably
harder to read, and this app's premise is that it is large-type and easy to
read. It is therefore a separate control, and it changes the face of exactly
three things: the rendered note, and the two fields a note is typed into. The
relationship is enforced structurally rather than by convention — the
handwriting face is a different settings field with a different type, so
`fontFamily: "dancing-script"` is not even a valid value.

OFL 1.1 requires the licence and copyright notice to accompany the fonts, and
prohibits selling them on their own and using the reserved font names. Both
are satisfied; the names are used only to identify the fonts.

### Retired families

Batch 5 offered Manrope and Plus Jakarta Sans. Both are withdrawn: their
binaries and licence texts are no longer shipped. A user who had selected one
is moved to Inter rather than being reset, so a deliberate choice keeps
working. No OFL obligation is created by the removal — redistribution rights
are granted, not required.

**Lato joins them in Batch 7f**, for the reason above: the shipped `latin-ext`
subsets cannot render ő or ű, and there is no pinned gstatic URL that serves a
Lato which can. It is not withdrawn for looking dated — the typeface is fine,
the file the app had was not. It comes back in the batch that subsets the
families, and it comes back because it will then be a family this app can
verify rather than one it has to take on trust. A user who had selected Lato is
moved to Inter and told why, once.

## Not included

- **Noto 3D** (OFL 1.1) — measured, then dropped. 7.5 MB for 23 of 36 glyphs,
  and 8 were missing, including two that are `DEFAULT_ACTIVITIES`. A set that
  cannot draw half the icons it is offered would silently fall back on them.
- **3dicons** (CC0) — an object-icon set, not an emoji set. It has no 🧘 💧 🩺
  or 🚶, so coverage of the glyphs this app draws is effectively zero.
- **Flaticon** — excluded by decision: attribution and payment terms.
- **Twemoji** (CC-BY 4.0 graphics) — offered, then withdrawn. See its own
  section above for the reason.

## Regenerating

`bun scripts/vendor-fluent-artwork.ts` re-fetches every Fluent stem the two
registries name — the content glyphs in `src/lib/iconsets.ts` and the four nav
rows in `src/lib/nav-icons.ts` — from the pinned upstream release, and writes
`src/lib/iconsets/fluent-artwork.ts`. The stems are derived from the
registries rather than listed, so the module cannot disagree with what the app
asks to draw; the upstream version is pinned in the script rather than tracked
from a moving tag; and a response that is not a complete, drawable `<svg>` is
refused rather than written, so a 404 page cannot be committed as artwork.

There is no `public/iconsets/` directory to keep in step any more, which is
the point: the artwork is the module now, and the test compares the module
against the registries rather than a directory against a list of URLs.

`bun scripts/vendor-fonts.ts` does the same for `public/fonts/`: it writes
exactly the filenames `src/lib/fonts.ts` requests, from pinned gstatic URLs
that carry their own version segment, verifies each is real woff2 of the size
the registry promises, fetches the OFL texts, and removes any file the registry
no longer asks for. Batch 5's fonts were hand-copied with nothing to catch a
typo; this is what makes swapping four of the five families safe.

Upstream revisions are pinned rather than tracked from `main`, because `main`
can change under us and a mood journal's icons should not.
