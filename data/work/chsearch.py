import json,subprocess,urllib.parse
from concurrent.futures import ThreadPoolExecutor
Q=["GuitarBackingTrack","Sweet Backing Tracks","Jamey Aebersold","jazz play along","drone notes practice","tanpura drone","tuning drone","practice drones","grateful dead jam tracks","dead jam tracks","jam band backing tracks","bass backing tracks","bassless tracks","drumless tracks","piano backing tracks","keyboard backing tracks","metal backing tracks","jazz backing tracks","ii V I","blues backing tracks","funk backing tracks","reggae backing tracks","country backing tracks","gospel backing tracks","neo soul backing tracks","latin backing tracks","fusion backing tracks","looper jam","vamp tracks","backing tracks","jam tracks","drone music practice","shruti box","electronic tanpura"]
def run(q):
    url="https://www.youtube.com/results?sp=EgIQAg%253D%253D&search_query="+urllib.parse.quote_plus(q)
    p=subprocess.run(["/home/box/.local/bin/yt-dlp","--flat-playlist","--no-warnings","--playlist-end","15","--print-json",url],capture_output=True,text=True,timeout=120)
    out=[]
    for l in p.stdout.splitlines():
        try: d=json.loads(l)
        except: continue
        out.append({"q":q,"channel_id":d.get("channel_id"),"name":d.get("title"),"followers":d.get("channel_follower_count")})
    return out
with ThreadPoolExecutor(8) as ex: res=sum(ex.map(run,Q),[])
json.dump(res,open("chsearch.json","w"),ensure_ascii=False)
c=json.load(open("channels_candidates.json"))
for r in res:
    if r["channel_id"] not in c: print(r["q"],"|",r["name"],r["followers"],r["channel_id"])
