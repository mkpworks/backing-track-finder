import json,subprocess,sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
V=Path("videos")
ch=json.load(open(sys.argv[1]))
def job(cid):
    out=V/f"{cid}.json"
    if out.exists(): return
    try:
        p=subprocess.run(["/home/box/.local/bin/yt-dlp","-J","--flat-playlist","--no-warnings","--extractor-args","youtubetab:approximate_date","--playlist-end","1500",f"https://www.youtube.com/channel/{cid}/videos"],capture_output=True,text=True,timeout=900)
        d=json.loads(p.stdout)
        assert isinstance(d,dict)
    except Exception as e:
        out.write_text(json.dumps({"error":str(e)[:200]})); return
    r={"channel_id":cid,"channel":d.get("channel") or d.get("uploader"),"description":d.get("description"),"followers":d.get("channel_follower_count"),"tags":d.get("tags"),
       "entries":[{k:e.get(k) for k in ("id","title","duration","view_count","upload_date","timestamp")} for e in d.get("entries") or []]}
    out.write_text(json.dumps(r,ensure_ascii=False))
with ThreadPoolExecutor(4) as ex: list(ex.map(job,list(ch)))
print("done")
