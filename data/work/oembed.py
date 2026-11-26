import json,time,threading,requests
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
OUT=Path("oembed.jsonl"); done={}
if OUT.exists():
    for l in OUT.open():
        d=json.loads(l); done[d["id"]]=d
ids=[t["id"] for t in json.load(open("tracks_raw.json")) if t["id"] not in done or done[t["id"]]["status"] not in (200,401,403,404,400)]
print("todo",len(ids),flush=True)
loc=threading.local()
def chk(v):
    for a in range(5):
        s=getattr(loc,"s",None)
        if s is None: s=loc.s=requests.Session(); s.headers["User-Agent"]="Mozilla/5.0"
        try:
            r=s.get("https://www.youtube.com/oembed",params={"format":"json","url":f"https://www.youtube.com/watch?v={v}"},timeout=15)
        except Exception:
            loc.s=None; time.sleep(1+a); continue
        if r.status_code==429: time.sleep(5*(a+1)); continue
        if r.status_code==200:
            j=r.json(); return {"id":v,"status":200,"author":j.get("author_name"),"author_url":j.get("author_url")}
        return {"id":v,"status":r.status_code}
    return {"id":v,"status":-1}
with ThreadPoolExecutor(16) as ex, OUT.open("a") as f:
    for i,r in enumerate(ex.map(chk,ids)):
        f.write(json.dumps(r,ensure_ascii=False)+"\n")
        if i%5000==0: print(i,flush=True)
print("done",flush=True)
