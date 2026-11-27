# Backing Track Finder

A static catalog of practice backing tracks on YouTube. Tracks can be searched and filtered by the instrument you want to play, style, key, tempo, progression, kind, channel, and duration. Search matches the channel, title, style, key, progression, scale, kind, and tags, ignoring case and accents.

Choosing a channel name fills the search. Choosing a style sets the style filter.

The catalog is data v1: **82,021 tracks** from **519 channels**, checked against YouTube on 2026-11-26. See `data/README.md`. Fourteen channels (4,891 tracks) stay hidden until **Include channels under review** is turned on.

Published with GitHub Pages at <https://mkpworks.github.io/backing-track-finder/>.

This project follows the same layout as [YT Music Lesson Finder](https://github.com/mkpworks/Yt-music-lesson-finder): JSON in `data/`, a packed `catalog.json`, a validator, a behavior check, a CSV export, an `embed.js` bundle, and a GitHub Actions Pages workflow.

## Preview locally

From the repository root:

```bash
python3 -m http.server 8000
```

Open <http://localhost:8000>. The page loads JSON with `fetch`, so opening `index.html` directly from disk will not work.

`data/catalog.json` is already built from the sample file. Rebuild it the way Pages does:

```bash
node scripts/export-csv.js
node scripts/build-catalog.js
node scripts/build-embed.js
```

`embed.js` is a build output and is gitignored. The Pages build also rewrites `data/catalog.csv`, `data/catalog.json`, and `data/version.json` into the published site. It does not publish `data/tracks.json`.

## Add a track

Append an object to `data/tracks.json`. Styles, keys, and progressions come from `data/facets.json` for the filter menus. A progression that is only a one-off chord list still searches, and it appears in the progression menu when you filter to it.

```json
{
  "id": "xxxxxxxxxxx",
  "title": "Track title",
  "channel": "Channel name",
  "channel_id": "UCxxxxxxxxxxxxxxxxxxxxxx",
  "url": "https://www.youtube.com/watch?v=xxxxxxxxxxx",
  "duration_s": 300,
  "year": 2024,
  "omitted_instruments": ["guitar"],
  "target_instruments": ["guitar"],
  "styles": ["Jazz"],
  "key": "C",
  "tempo_bpm": 120,
  "progression": "ii-V-I",
  "scale": "Major",
  "kind": "backing track",
  "tags": ["swing"]
}
```

- `id` is the 11-character YouTube id and has to be unique.
- `year`, `key`, `tempo_bpm`, `progression`, and `scale` are `null` when they are not stated.
- `omitted_instruments` uses `guitar`, `bass`, `drums`, `piano`, `vocals`, or `none`. `none` means the arrangement does not drop an instrument, and it is the only entry.
- `kind` is `backing track`, `drone`, `play-along`, or `looper`.
- The practice filter matches tracks that omit that instrument or list it as a target. Piano/Keys is `piano`.

See `SCHEMA.md` for the full field list, the packed catalog, and sharding.

## Filters

Quick chips sit above the dropdowns:

| Chip | Matches |
| --- | --- |
| Guitar | guitar omitted or targeted |
| Bass (bassless) | bass omitted |
| Drums (drumless) | drums omitted |
| Piano | piano omitted or targeted |
| Heavy metal | style `heavy metal` |
| Grateful Dead | style `grateful dead` |
| Jazz ii-V-I | style `jazz` and progression `ii-V-I` |
| Drones | kind `drone` |

Style, key, progression, and kind come from the data. Practice instrument, style, key, progression, kind, and channel menus are alphabetical (case-insensitive, so Funk comes before Triads, and numeric, so 8-bar comes before 12-bar). `All`, `Any`, and `All instruments` stay first. Tempo is a min/max range in BPM; a track with no tempo drops out of a range. Duration buckets stay in length order: under 3 minutes, 3–6, 6–10, 10–20, and over 20. The Sort by menu stays in its listed order.

Channels and the tracks inside a channel are paged 12 at a time.

## Spreadsheet

**Download this list**, in the toolbar, saves the tracks that match the current search and filters. The rows follow the current sort.

The Pages build also writes `data/catalog.csv`, the full catalog in channel order, as UTF-8 with a byte-order mark. The footer link **Download full spreadsheet** points at that file.

```bash
node scripts/export-csv.js
```

Columns are the track fields, plus duration as `h:mm:ss` and `ytmusictrainer_url`. Every row links to YouTube and to YT Trainer. The trainer base URL lives in `YT_TRAINER_BASE` in `js/catalog.js`.

## Embedding and data API

This contract is stable. The schema version is `"1"`. A later version will bump that string when the catalog shape changes. `generated_at` changes on every deploy and is only a cache key.

Other sites load the finder from this repository. They do not copy the catalog.

```html
<div id="backing-track-finder"></div>
<script src="https://mkpworks.github.io/backing-track-finder/embed.js" defer></script>
```

Stable JSON:

- <https://mkpworks.github.io/backing-track-finder/data/version.json>
- <https://mkpworks.github.io/backing-track-finder/data/catalog.json>
- <https://mkpworks.github.io/backing-track-finder/data/catalog.csv>

`embed.js` is published at the site root. It mounts `#backing-track-finder` and any element with `data-backing-track-finder`. The same call is `BackingTrackFinder.mount(element, options)`.

| Attribute or option | Values | Default |
| --- | --- | --- |
| `data-theme` / `theme` | `light` or `dark` | Follows `prefers-color-scheme` |
| `data-accent` / `accent` | `#rgb` or `#rrggbb` | The finder gold |
| `data-height` / `height` | CSS length, or a number of pixels | Natural height |
| `data-channel` / `channel` | Channel id or channel name | No channel filter |
| `data-practice` / `practice` | `guitar`, `bass`, `drums`, or `piano` (`data-instrument` is the same) | No practice filter |
| `data-style` / `style` | A style string | No style filter |
| `data-key` / `key` | A key string | No key filter |
| `data-progression` / `progression` | A progression string | No progression filter |
| `data-kind` / `kind` | `backing track`, `drone`, `play-along`, or `looper` | No kind filter |
| `data-omitted` / `omitted` | An omitted-instrument token | No omitted filter |
| `data-duration` / `duration` | `under-3`, `3-6`, `6-10`, `10-20`, or `over-20` | No duration filter |
| `data-tempo-min` / `tempoMin` | BPM | No minimum |
| `data-tempo-max` / `tempoMax` | BPM | No maximum |
| `data-quick` / `quick` | `guitar`, `bass`, `drums`, `piano`, `metal`, `dead`, `twofive`, or `drones` | No quick chip |

The widget renders in a shadow root, so its CSS does not leak in or out. Search, filters, sort, channel groups, and the track cards are the same finder as this site. A thumbnail plays inline from `youtube-nocookie.com`. **View on YouTube** opens in a new tab. **Open on YT Trainer** points at `https://ytmusictrainer.com/?video_id=<id>`. It opens in a new tab, and in the same tab when the page hosting the finder is `ytmusictrainer.com` or a subdomain such as `www`. Any other link to that site follows the same rule. **Download this list** exports the filtered rows. A **Powered by Backing Track Finder** link points back here.

`embed-demo.html` on this site shows the snippet and a live embed. Build `embed.js` before opening that page locally.

GitHub Pages sends `Access-Control-Allow-Origin: *` on these JSON files, which is what a page on another origin needs in order to `fetch` them.

Catalogs of 400 tracks or more are split into `data/shards/<style>.json`, at most 2,500 tracks per file. This catalog is 67 shards. `catalog.json` stays the small manifest (facets, channel dictionary, review channel ids, and the shard list). `embed.js` fetches that file from the stable URL, then loads the shards six at a time. Smaller catalogs keep every row in `catalog.json`.

## Check the data

```bash
node scripts/validate-data.js
node scripts/check-catalog.js
```

Validation requires unique YouTube ids, the required track fields, the closed kind and instrument sets, and facet membership when a facet list is non-empty. The Pages workflow runs the same checks before it deploys.

## Deploy

Pushes to `main` run `.github/workflows/pages.yml`, which checks the data, builds the catalog, CSV, and `embed.js`, and deploys with `actions/configure-pages`, `actions/upload-pages-artifact`, and `actions/deploy-pages`. The workflow also runs on `workflow_dispatch`. Pull requests run the same check and build, and skip `actions/configure-pages`, because that action looks up the Pages site and fails until the source above is set.

The repository owner has to set **Settings → Pages → Build and deployment → Source** to **GitHub Actions** before the first deploy can succeed.
