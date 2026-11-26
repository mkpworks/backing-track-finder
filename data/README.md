# Catalog data

`tracks.json` is the researched v1 catalog: 82,021 public YouTube backing tracks from 519 channels. `channels.json` lists those channels. `review_flag` is set on 14 channels (4,891 tracks) that post at high volume and do not disclose whether the music is AI. The finder hides those tracks until **Include channels under review** is turned on.

`rejected_channels.json` records channels left out of the catalog, with the reason. `facets.json` is the filter vocabulary and the counts behind it. `dataset.json` is the research build stamp (`btf-data-v1`, 2026-11-26).

`work/` holds the scripts that assembled this file. The site does not publish `tracks.json` or `work/`. Pages serves the packed `catalog.json`, `version.json`, `catalog.csv`, and `data/shards/`.

Field rules are in `SCHEMA.md` at the repository root. Check the file with:

```bash
node scripts/validate-data.js
node scripts/validate-tracks.js data/tracks.json
```
