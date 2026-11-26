#!/usr/bin/env node
// Validate Backing Track Finder tracks.json against SCHEMA.md
const fs = require('fs');
const file = process.argv[2] || __dirname + '/tracks.json';
const T = JSON.parse(fs.readFileSync(file, 'utf8'));
const OMIT = new Set(['guitar','bass','drums','piano','vocals','none']);
const KIND = new Set(['backing track','drone','play-along','looper']);
const FIELDS = ['id','title','channel','channel_id','url','duration_s','year','omitted_instruments','target_instruments','styles','key','tempo_bpm','progression','scale','kind','tags'];
const errs = []; const seen = new Set();
const isStrArr = a => Array.isArray(a) && a.every(x => typeof x === 'string');
const nullOr = (v, t) => v === null || typeof v === t;
if (!Array.isArray(T)) { console.error('tracks.json must be an array'); process.exit(1); }
T.forEach((t, i) => {
  const e = m => errs.push(`#${i} ${t && t.id}: ${m}`);
  for (const f of FIELDS) if (!(f in t)) e('missing ' + f);
  for (const k of Object.keys(t)) if (!FIELDS.includes(k)) e('unknown field ' + k);
  if (!/^[A-Za-z0-9_-]{11}$/.test(t.id)) e('bad id');
  if (seen.has(t.id)) e('duplicate id'); seen.add(t.id);
  if (t.url !== `https://www.youtube.com/watch?v=${t.id}`) e('bad url');
  if (typeof t.title !== 'string' || !t.title) e('bad title');
  if (typeof t.channel !== 'string' || !/^UC[A-Za-z0-9_-]{22}$/.test(t.channel_id)) e('bad channel');
  if (!Number.isInteger(t.duration_s) || t.duration_s < 60 || t.duration_s > 14400) e('bad duration_s');
  if (!(t.year === null || (Number.isInteger(t.year) && t.year >= 2005 && t.year <= 2030))) e('bad year');
  if (!isStrArr(t.omitted_instruments) || !t.omitted_instruments.length || !t.omitted_instruments.every(x => OMIT.has(x))) e('bad omitted_instruments');
  if (t.omitted_instruments.includes('none') && t.omitted_instruments.length > 1) e('none mixed with instruments');
  if (!isStrArr(t.target_instruments) || !t.target_instruments.length) e('bad target_instruments');
  if (!isStrArr(t.styles) || !isStrArr(t.tags)) e('bad styles/tags');
  if (!nullOr(t.key, 'string') || !nullOr(t.progression, 'string') || !nullOr(t.scale, 'string')) e('bad key/progression/scale');
  if (t.key !== null && !/^[A-G](#|b)?( major| minor)?$/.test(t.key)) e('bad key format ' + t.key);
  if (!(t.tempo_bpm === null || (Number.isInteger(t.tempo_bpm) && t.tempo_bpm >= 30 && t.tempo_bpm <= 300))) e('bad tempo_bpm');
  if (!KIND.has(t.kind)) e('bad kind');
});
if (errs.length) { console.error(errs.slice(0, 50).join('\n')); console.error(`${errs.length} errors`); process.exit(1); }
console.log(`OK: ${T.length} tracks, ${new Set(T.map(t => t.channel_id)).size} channels`);
