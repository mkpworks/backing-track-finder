import json,collections,datetime
O={}
for l in open("oembed.jsonl"):
    x=json.loads(l); O[x["id"]]=x
T=[t for t in json.load(open("tracks_raw.json")) if O.get(t["id"],{}).get("status")==200]
dropped=sum(1 for t in json.load(open("tracks_raw.json")) if O.get(t["id"],{}).get("status")!=200)
FIELDS=["id","title","channel","channel_id","url","duration_s","year","omitted_instruments","target_instruments","styles","key","tempo_bpm","progression","scale","kind","tags"]
import re
for t in T:
    for f in ("key","scale"):
        if t[f]: t[f]=re.sub(r"^([A-G])B\b",r"\1b",t[f])
T=[{k:t[k] for k in FIELDS} for t in T]
T.sort(key=lambda t:(t["channel"].lower(),t["title"].lower()))
C=json.load(open("channels_kept.json"))
cnt=collections.Counter(t["channel_id"] for t in T)
import time
now=time.time()
def flag(cid):
    d=json.load(open(f"videos/{cid}.json")); ts=sorted(e["timestamp"] for e in d["entries"] if e.get("timestamp"))
    y=[t for t in ts if now-t<365*86400]; first=datetime.date.fromtimestamp(ts[0]).year if ts else None
    r=len(y)/365
    return f"new high-volume channel (first upload {first}, ~{r:.1f} uploads/day); no AI disclosure found, but unverified" if first and first>=2024 and len(d["entries"])<1500 and r>=0.5 else None
chans=[{"channel_id":cid,"channel":C[cid]["channel"],"url":f"https://www.youtube.com/channel/{cid}","followers":C[cid]["followers"],"tracks":n,"about":(C[cid]["description"] or "")[:200],"review_flag":flag(cid)} for cid,n in cnt.most_common()]
rej=json.load(open("channels_rejected_ai.json"))
rejl=[{"channel_id":k,"channel":v[0],"reason":v[1]} for k,v in rej.items()]
F=collections.Counter
facets={"kind":F(t["kind"] for t in T),"omitted_instruments":F(o for t in T for o in t["omitted_instruments"]),"target_instruments":F(o for t in T for o in t["target_instruments"]),
 "styles":F(o for t in T for o in t["styles"]),"key":F(t["key"] for t in T if t["key"]),"progression":F(t["progression"] for t in T if t["progression"]),"scale":F(t["scale"] for t in T if t["scale"]),"tags":F(o for t in T for o in t["tags"])}
facets={k:dict(v.most_common()) for k,v in facets.items()}
facets["progression"]={k:v for k,v in facets["progression"].items() if v>=5}
facets["scale"]={k:v for k,v in facets["scale"].items() if v>=5}
D="/workspace/btf-data-v1/"
json.dump(T,open(D+"tracks.json","w"),ensure_ascii=False,separators=(",",":"))
json.dump(chans,open(D+"channels.json","w"),ensure_ascii=False,indent=1)
json.dump(rejl,open(D+"rejected_channels.json","w"),ensure_ascii=False,indent=1)
json.dump(facets,open(D+"facets.json","w"),ensure_ascii=False,indent=1)
json.dump({"version":"btf-data-v1","generated":datetime.date.today().isoformat(),"tracks":len(T),"channels":len(chans),"embed_disabled_dropped":dropped},open(D+"version.json","w"),indent=1)
print(len(T),len(chans),dropped)
