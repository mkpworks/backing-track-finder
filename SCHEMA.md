# Backing Track Finder data schema (v1)

`data/tracks.json` is the catalog, a bare array of track objects. `data/facets.json` maps each facet value to a count. `data/channels.json` lists channels; `review_flag` is a string when a channel is under review and `null` otherwise. `data/dataset.json` records the research build (`btf-data-v1`).

An empty `tracks` array is valid. Do not infer a year, key, tempo, or progression the title did not state; use `null`.

## Files

- `tracks.json` — sample wrapper or a bare array of track objects.
- `facets.json` — optional vocabulary. When a list in this file is non-empty, track values for that field must use it. When the list is missing or empty, the field stays open and the page builds the filter from the tracks.

The Pages build writes `data/catalog.json` and `data/version.json`. Those files are the stable data API. Do not edit them by hand. The build removes `tracks.json` from the published site. The page and `embed.js` fetch `data/version.json` (cache-busting query, `cache: "no-store"`) and then `data/catalog.json?v=<generated_at>`.

`data/version.json`:

```json
{ "version": "1", "generated_at": "2026-11-26T00:00:00.000Z", "tracks": 15, "sample": true, "sharded": false }
```

`data/catalog.json` (version `"1"`):

| Field | Meaning |
| --- | --- |
| `version` | Schema version. Currently `"1"`. |
| `generated_at` | ISO-8601 timestamp from the build. Cache key only. |
| `packing` | `"rows"` when tracks are packed into parallel dictionaries. |
| `sample` | `true` while the source file is the sample catalog. |
| `facets` | The same object as `data/facets.json`, or `{}` when that file is absent. |
| `rows` | Packed tracks, present when the catalog is small enough to ship in one file. |
| `shards` | Present instead of `rows` when the catalog has at least 400 tracks. Each entry is `{ "slug", "file", "count" }`. `file` is `data/shards/<slug>.json` and that file is `{ "rows": [ ... ] }` using the dictionaries in `catalog.json`. A track is filed under its first style. The page loads every shard, the active style first. |

Item fields below are the unpacked shape. Do not depend on key order. Unknown fields on a track are ignored.

### Packed row

`rows[i]` is an array:

| Index | Field |
| --- | --- |
| 0 | `id` |
| 1 | `title` |
| 2 | Index into `channels`, which is `[channel_id, channel]` |
| 3 | `year`, or `null` |
| 4 | `duration_s` |
| 5 | Indexes into `omitted` |
| 6 | Indexes into `targets` |
| 7 | Indexes into `styles` |
| 8 | Index into `keys`, or `-1` when null |
| 9 | `tempo_bpm`, or `null` |
| 10 | Index into `progressions`, or `-1` |
| 11 | Index into `scales`, or `-1` |
| 12 | Index into `kinds` |
| 13 | Indexes into `tags` |

`url` is rebuilt as `https://www.youtube.com/watch?v=<id>`. The trainer link is not stored; it is always `https://ytmusictrainer.com/?video_id=<id>`.

## Track fields

Required on every track:

| Field | Meaning |
| --- | --- |
| `id` | 11-character YouTube video id. Unique across the catalog. |
| `title` | Video title. |
| `channel` | YouTube channel name. Clicking it in the finder fills the search. |
| `channel_id` | YouTube channel id, `UC` plus 22 characters. |
| `url` | A YouTube URL whose video id is `id`. `watch`, `youtu.be`, `embed`, and `shorts` URLs are accepted. |
| `duration_s` | Running time in seconds, from 60 through 14400. |
| `year` | Upload year from 2005 through 2030, or `null`. Relative YouTube dates can be off by a year. |
| `omitted_instruments` | Non-empty array. Each value is `guitar`, `bass`, `drums`, `piano`, `vocals`, or `none`. `none` means the title does not name a missing part, and it is the only entry. |
| `target_instruments` | Non-empty array. `guitar`, `bass`, `drums`, `piano`, `vocals`, `saxophone`, `trumpet`, and the other instruments in `facets.json`, or `any` when the title does not name one. |
| `styles` | Array of style names from the title, such as `heavy metal`, `grateful dead`, `jazz`, `blues`, `funk`, or `rock`. May be empty. A track can have more than one. |
| `key` | `A minor`, `Eb major`, or a bare root such as `E`. `null` when not stated. |
| `tempo_bpm` | Integer beats per minute from 30 through 300, or `null`. |
| `progression` | `ii-V-I`, `minor ii-V-i`, `12-bar blues`, `rhythm changes`, `Coltrane changes`, `modal vamp`, a literal chord list such as `Am - G - F - E`, or `null`. |
| `scale` | Short name such as `Mixolydian` or `Minor pentatonic`, or `null`. |
| `kind` | `backing track`, `drone`, `play-along`, or `looper`. |
| `tags` | Array of short tags. May be empty. |

The practice-instrument filter matches a track when that instrument is omitted or targeted. `any` does not match a specific instrument. `Piano/Keys` is the `piano` token. The quick chips **Bass (bassless)** and **Drums (drumless)** match omitted `bass` and omitted `drums` only. **Jazz ii-V-I** matches style `jazz` and progression `ii-V-I` (dash and case ignored). **Heavy metal** and **Grateful Dead** match those style strings. **Drones** matches kind `drone`.

Channels with a `review_flag` are omitted from search, filters, and the channel menu until **Include channels under review** is on.

Clicking a channel name fills the search. Clicking a style sets the style filter.

## Facets

```json
{
  "practice_instruments": ["guitar", "bass", "drums", "piano"],
  "omitted_instruments": ["guitar", "bass", "drums", "piano", "vocals", "none"],
  "styles": ["Jazz", "Blues"],
  "kinds": ["backing track", "drone", "play-along", "looper"],
  "progressions": ["ii-V-I", "12-bar blues"],
  "keys": [],
  "labels": { "practice_instruments": { "piano": "Piano/Keys" } },
  "notes": { "kinds": { "drone": "A held pitch for intonation practice." } }
}
```

`kind` and `omitted_instruments` are closed sets. `target_instruments` accepts the instrument names in the schema, including `any`. `styles`, `progressions`, and `keys` are open strings. `facets.json` lists the values that get a menu entry, in count order. A rarer progression still matches search and can be selected from a track chip.

## Sharding

Catalogs with fewer than 400 tracks ship as one `catalog.json`. At 400 tracks the build leaves `rows` out and writes `data/shards/<style>.json`, splitting a style into chunks of 2,500 tracks (`jazz`, `jazz-2`, …). Tracks with no style use `unsorted`. The manifest stays small: facets, the channel dictionary, `review_channel_ids`, and the shard list. The browser downloads the manifest, then the shards six at a time, and searches as they arrive. The Pages build uses that cutoff.

## Validation

```bash
node scripts/validate-data.js
node scripts/check-catalog.js
```

`validate-data.js` checks ids, URLs, the closed kind and instrument sets, nulls on the optional musical fields, and membership in any non-empty facet list. The Pages workflow runs the same checks before it deploys.
