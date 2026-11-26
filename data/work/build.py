#!/usr/bin/env python3
"""Build BTF v1 dataset from fetched channel upload lists."""
import json,glob,re,datetime,collections
R=lambda p:re.compile(p,re.I)
BT=R(r"backing ?track|jam ?track|\bjam\b|drum ?less|bass ?less|guitar ?less|\bno (bass|drums?|guitar|piano|keys|keyboards?)\b|without (bass|drums?|guitar|piano|keys)|play[- ]?a?[- ]?long|\bdrones?\b|tanpura|tambura|shruti|\bvamp\b|practice track|for drummers|\bminus (bass|drums?|guitar|piano)\b|groove track|\bloop(s|er)?\b|jam session")
EXCL=R(r"\blesson|tutorial|how to\b|\btips?\b|review|\bdemo\b|unbox|\btabs?\b|\bcover\b|reaction|interview|vlog|#shorts?|\bshorts?\b|\btuner\b|preview|teaser|trailer|now available|patreon|sample pack|giveaway|karaoke|isolated|\bstems?\b|removed|acapella|a cappella|mashup|mash-up|\bai\b|a\.i\.|suno|udio|playthrough|play through|\blive\b|\bsolo over\b|soloing over|jamming over|playing over|\bimprov(isation|ising|ising|ised)? (over|on)\b|\bvs\.?\b|\bq ?& ?a\b|podcast|livestream|stream|announcement|channel trailer|giveaway|contest|challenge|\btest\b|\bunplugged\b|drone (footage|flight|shot|video)|fpv|dji|\bcourse\b|masterclass|explained|\bfree download\b(?!.*backing)|instagram|tiktok|cancion completa|members[- ]only|for (pro )?members|member exclusive|exclusive for")
AICH=R(r"lalal|moises|demucs|spleeter|stem separation|ai stem|\bai[- ]generated|\bai music|generated (with|by|using) ai|artificial intelligence|\bsuno\b|\budio\b|ai[- ]?(created|made|composed)|made with ai")
DRONE_MUSIC=R(r"tanpura|tambura|shruti|\b(cello|string|organ|synth|violin|viola|harmonium|sitar|pad|bagpipe|bass|vocal|choir|tone|note|pitch|root)\b.*drone|drone.*\b(note|key|tone|pitch|practice|intonation|cello|strings?|[A-G](#|b|♯|♭)?\b|sa\b|for (violin|cello|singing|vocal|practice|improvis)|hz)|\b[A-G](#|b|♯|♭)? (drone|tanpura)")
NOTE=r"[A-G](?:#|b|♯|♭)?"
def norm_note(n): return n.replace("♯","#").replace("♭","b")
KEYPATS=[
 (R(r"\b(?:in|key(?: of)?:?|key)\s+("+NOTE+r")\s*(major|minor|maj|min|m)(?![a-z0-9])"),"full"),
 (R(r"\(\s*("+NOTE+r")\s*(major|minor|maj|min|m)?\s*\)"),"paren"),
 (R(r"(?<![A-Za-z0-9'])("+NOTE+r")\s*(major|minor)\b"),"full"),
 (R(r"\b(?:in|key(?: of)?:?)\s+("+NOTE+r")(?![a-z0-9#♯♭])"),"root"),
 (R(r"(?<![A-Za-z0-9'])("+NOTE+r")(m)(?![a-z0-9#])"),"full"),
]
MODES=["dorian","phrygian dominant","phrygian","lydian dominant","lydian","mixolydian","locrian","aeolian","ionian","harmonic minor","melodic minor","hungarian minor","double harmonic","whole tone","diminished","pentatonic","blues scale","hijaz","hirajoshi","altered"]
def parse_key(t):
    for p,kind in KEYPATS:
        m=p.search(t)
        if not m: continue
        root=m.group(1); 
        # case-sensitivity guard: note letter must be uppercase in title
        if not root[0].isupper(): continue
        if root=="A" and kind=="root" and re.search(r"\bin a (minute|row|new|way|nutshell|day|week)",t,re.I): continue
        root=norm_note(root)
        q=(m.group(2) if m.lastindex and m.lastindex>=2 else None) or ""
        ql=q.lower()
        if ql in("minor","min") or q=="m": return f"{root} minor"
        if ql in("major","maj"): return f"{root} major"
        if kind=="paren" and not q: return root
        if kind=="root":
            mm=re.search(re.escape(m.group(1))+r"\s+("+"|".join(MODES)+")",t,re.I)
            return root
        return root
    return None
DK1=re.compile(r"(?i:drone|tanpura|tambura|shruti|scale|\bsa\b|note)\s*(?i:in|of|key|note|:|=|-)?\s*([A-G])(\s?(?:#|b|♯|♭)|\s(?i:sharp|flat))?(?![a-zA-Z0-9])")
DK2=re.compile(r"(?<![A-Za-z])([A-G])(\s?(?:#|b|♯|♭)|\s(?i:sharp|flat))?\s*(?:-\s*)?(?i:drone|tanpura|tambura|scale|pure tone|tone)\b")
def drone_key(t):
    for p in (DK1,DK2):
        for m in p.finditer(t):
            if p is DK2 and m.group(1)=="A" and m.start()==0: continue
            acc=(m.group(2) or "").strip().lower()
            acc={"#":"#","♯":"#","sharp":"#","b":"b","♭":"b","flat":"b"}.get(acc,"")
            return m.group(1)+acc
    return None
def parse_scale(t,key):
    tl=t.lower()
    for mo in MODES:
        if mo in tl:
            m=re.search("("+NOTE+r")\s+"+mo,t)
            if m and m.group(1)[0].isupper(): return f"{norm_note(m.group(1))} {mo}"
            if key: return f"{key.split()[0]} {mo}"
            return mo
    return None
BPM=R(r"(\d{2,3})\s*-?\s*bpm|bpm\s*:?\s*(\d{2,3})")
PROG=[(R(r"minor\s+(ii|2)\s*[- –/]?\s*(v|5)\s*[- –/]?\s*(i|1)\b"),"minor ii-V-i"),
 (R(r"\b(ii|2)m?7?\s*[- –/]?\s*(v|5)7?\s*[- –/]?\s*(i|1)(maj7?)?\b|\b251\b"),"ii-V-I"),
 (R(r"\b(iii|3)\s*[- –]\s*(vi|6)\s*[- –]\s*(ii|2)\s*[- –]\s*(v|5)\b"),"iii-vi-ii-V"),
 (R(r"\b(i|1)\s*[- –]\s*(vi|6)\s*[- –]\s*(ii|2)\s*[- –]\s*(v|5)\b"),"I-vi-ii-V"),
 (R(r"\b12[- ]?bars?\b"),"12-bar blues"),(R(r"\b8[- ]?bars? blues"),"8-bar blues"),(R(r"\b16[- ]?bars? blues"),"16-bar blues"),
 (R(r"\b(i|1)\s*[- –]\s*(iv|4)\s*[- –]\s*(v|5)\b"),"I-IV-V"),
 (R(r"\b(i|1)\s*[- –]\s*(v|5)\s*[- –]\s*(vi|6)\s*[- –]\s*(iv|4)\b"),"I-V-vi-IV"),
 (R(r"\b(vi|6)\s*[- –]\s*(iv|4)\s*[- –]\s*(i|1)\s*[- –]\s*(v|5)\b"),"vi-IV-I-V"),
 (R(r"\b(i|1)\s*[- –]\s*(bvii|b7)\s*[- –]\s*(iv|4)\b"),"I-bVII-IV"),
 (R(r"\b(i|1)\s*[- –]\s*(bvi|b6)\s*[- –]\s*(bvii|b7)\b"),"i-bVI-bVII"),
 (R(r"rhythm changes"),"rhythm changes"),(R(r"coltrane changes|giant steps"),"Coltrane changes"),
 (R(r"andalusian"),"Andalusian cadence"),(R(r"\b(one|1|single)[- ]chord\b"),"one-chord vamp"),(R(r"\b(two|2)[- ]chord\b"),"two-chord vamp"),
 (R(r"\bmodal\b"),"modal vamp")]
CHORD=r"[A-G](?:#|b)?(?:maj7|maj9|m7b5|m7|m9|m6|m|7|9|6|dim7|dim|sus2|sus4|add9|11|13)?"
CHSEQ=re.compile(r"(?<![\w#])("+CHORD+r")(?:\s*[-–|/,>]\s*|\s+)("+CHORD+r")(?:\s*[-–|/,>]\s*|\s+)("+CHORD+r")((?:(?:\s*[-–|/,>]\s*|\s+)"+CHORD+r")*)(?![\w#])")
def parse_prog(t):
    for p,v in PROG:
        if p.search(t): return v
    m=CHSEQ.search(t)
    if m:
        s=m.group(0).strip(); toks=re.split(r"\s*[-–|/,>]\s*|\s+",s)
        if len(toks)>=3 and len(set(toks))>=2 and not all(x in("A",) for x in toks): return " - ".join(toks)
    return None
STY=[("heavy metal",r"\bmetal|thrash|djent|doom\b|metalcore|deathcore|\bshred\b|neoclassical|neo-classical|malmsteen|iron maiden|metallica|pantera|megadeth|slayer|dio\b|judas priest|black sabbath|sabbath"),
 ("grateful dead",r"grateful dead|\bthe dead\b|dead style|jerry garcia|garcia style|dark star|eyes of the world|scarlet begonias|fire on the mountain|china cat|franklin'?s tower|shakedown street|estimated prophet|playing in the band|help on the way|slipknot!|terrapin station|uncle john'?s band|sugar magnolia|dead (&|and) co(mpany)?\b"),
 ("jam band",r"jam band|jamband|phish|allman|widespread panic|grateful dead|dead (&|and) co(mpany)?\b|string cheese|goose\b|moe\.|jerry garcia"),
 ("jazz",r"jazz|bebop|be-bop|\bswing\b|ii[- ]?v[- ]?i|\b251\b|standard|real book|aebersold|bossa|rhythm changes|coltrane|giant steps|autumn leaves|blue bossa|all the things you are|so what|take five|summertime|misty|satin doll|footprints|cantaloupe|stella by|night and day|fly me to the moon"),
 ("blues",r"blues|shuffle|\bsrv\b|stevie ray|b\.?b\.? king|clapton|bonamassa|gary moore|texas|chicago|delta"),
 ("funk",r"funk|funky|james brown|prince style"),("soul",r"\bsoul\b|motown|stax"),("neo-soul",r"neo[- ]?soul|d'?angelo|erykah"),("r&b",r"r ?& ?b|rnb|\br'n'b"),
 ("gospel",r"gospel|worship|praise|church"),("country",r"country|chicken pick|nashville|honky|western swing|telecaster twang|outlaw"),("bluegrass",r"bluegrass"),
 ("reggae",r"reggae|dub\b|roots rock|one drop|rocksteady"),("ska",r"\bska\b"),("latin",r"latin|bossa|salsa|samba|rumba|cumbia|tango|cha[- ]cha|mambo|son cubano|santana|afro[- ]cuban|bolero|merengue|bachata|reggaeton|raggaeton"),
 ("flamenco",r"flamenco|rumba flamenca|bulerias|gipsy kings|gypsy kings"),("fusion",r"fusion"),("rock",r"\brock\b|rock ?n'? ?roll|hendrix|zeppelin|pink floyd|gilmour|ac/?dc|guns|slash|van halen|eric johnson|satriani|vai\b|mayer"),
 ("hard rock",r"hard rock|heavy rock|stoner|80'?s rock|glam"),("classic rock",r"classic rock|70'?s rock|60'?s rock"),("prog rock",r"prog(ressive)? rock|\bprog\b"),("southern rock",r"southern rock"),
 ("pop",r"\bpop\b|pop[- ]rock|synthwave|synth[- ]?pop|new wave|80'?s pop"),("ballad",r"ballad"),("acoustic",r"acoustic"),("folk",r"\bfolk|singer[- ]songwriter|americana"),("celtic",r"celtic|irish|\bjig\b|\breel\b|scottish"),
 ("rockabilly",r"rockabilly|psychobilly"),("surf",r"\bsurf"),("punk",r"punk"),("grunge",r"grunge"),("indie",r"\bindie|alternative|\balt[- ]rock|shoegaze"),("ambient",r"ambient|atmospheric|ethereal|cinematic|soundscape"),
 ("lofi",r"lo-?fi|chillhop"),("hip hop",r"hip[- ]?hop|boom bap|trap\b|rap\b"),("disco",r"disco"),("smooth jazz",r"smooth jazz"),("gypsy jazz",r"gypsy jazz|gipsy jazz|manouche|django"),
 ("afrobeat",r"afro ?beat|afrobeats|highlife"),("middle eastern",r"middle eastern|arabic|oriental|hijaz|maqam|persian|turkish"),("indian classical",r"tanpura|tambura|raga|raag|shruti|carnatic|hindustani|riyaz"),
 ("electronic",r"electronic|edm|techno|house music|synthwave|dubstep"),("rockabilly",r"rockabilly"),("cinematic",r"cinematic|epic|film score|soundtrack style"),("chill",r"\bchill|relaxing|mellow|smooth\b")]
STY=[(n,R(p)) for n,p in STY]
TGT=[("guitar",r"guitar|shred|\bgtr\b"),("bass",r"\bbass(ist)?s?\b(?!\s*(?:&|and)\s*drums)|for bass|bass player"),("drums",r"for drum|drummer|drum ?less|no drums|without drums|minus drums|drum practice|for drums"),("piano",r"piano|keys\b|keyboard|organ|rhodes|synth player"),
 ("saxophone",r"\bsax|saxophone|alto|tenor"),("trumpet",r"trumpet|horn player"),("violin",r"violin|fiddle"),("cello",r"cello"),("vocals",r"vocal|singing|singer|sing along|voice"),("harmonica",r"harmonica|harp blues"),("ukulele",r"ukulele|uke\b"),("mandolin",r"mandolin"),("banjo",r"banjo"),("flute",r"flute"),("clarinet",r"clarinet"),("trombone",r"trombone")]
TGT=[(n,R(p)) for n,p in TGT]
OMIT=[("drums",R(r"(backing|jam) track for drum\b|drum ?less|no drums?\b|without drums?|minus drums?|drums? removed|for drummers|(backing|jam) track for drums|drum backing track|tracks? for drums")),
 ("bass",R(r"bass ?less|no bass\b|without bass|minus bass|(backing|jam) tracks? for bass|(?<!drum and )(?<!drums and )(?<!drum & )(?<!drum n )bass (backing|jam) track|bass play[- ]?along|for bass(ists| players?)?\b")),
 ("guitar",R(r"guitar ?less|no guitars?\b|without guitars?|minus guitar|guitar (backing|jam) track|(backing|jam) tracks? for guitar|guitar play[- ]?along|for guitar(ists)?\b")),
 ("piano",R(r"no (piano|keys|keyboards?)\b|without (piano|keys|keyboards?)|minus (piano|keys)|(piano|keyboard|keys) (backing|jam) track|(backing|jam) tracks? for (piano|keys|keyboard)|for (piano|keyboard|keys) players?|piano play[- ]?along")),
 ("vocals",R(r"no vocals|without vocals|instrumental version|minus vocals|for (singers|vocalists)"))]
def year(ts):
    return datetime.datetime.fromtimestamp(ts,datetime.UTC).year if ts else None
def classify(t,chname,chdesc):
    tl=t.lower(); ctx=(chname+" ").lower()
    if re.search(r"tanpura|tambura|shruti|\bdrones?\b",tl) and DRONE_MUSIC.search(t): kind="drone"
    elif re.search(r"play[- ]?a?[- ]?long",tl): kind="play-along"
    elif re.search(r"\bloop(s|er)?\b|\blooper",tl): kind="looper"
    else: kind="backing track"
    omitted=[n for n,p in OMIT if p.search(t)]
    tg=[n for n,p in TGT if p.search(t)]
    for n in omitted:
        if n not in tg: tg.append(n)
    if "bass" in tg and re.search(r"bass\s*(&|and)\s*drums",tl) and "bass" not in omitted: tg.remove("bass")
    if not tg:
        for n,p in TGT:
            if p.search(ctx): tg.append(n); break
    if not tg: tg=["any"]
    if kind=="drone": tg=sorted(set(tg)-{"guitar"}) or ["any"]  # drones are instrument-agnostic unless stated
    styles=[]
    for n,p in STY:
        if p.search(t) and n not in styles: styles.append(n)
    if kind=="drone" and "drone" not in styles: styles.insert(0,"drone")
    if not omitted: omitted=["none"]
    return kind,omitted,tg,styles
def is_bt(t):
    if not BT.search(t): return False
    if EXCL.search(t) and not re.search(r"for improvis",t,re.I): return False
    if re.search(r"\bdrones?\b",t,re.I) and not re.search(r"backing|jam|play",t,re.I) and not DRONE_MUSIC.search(t): return False
    if re.search(r"\bjam\b",t,re.I) and not re.search(r"(?i:backing|jam ?tracks?|jam session|bpm|groove|vamp|\bjam (in|with|for)\b)|\b(?i:in|key)\s+"+NOTE+r"\b",t): return False
    return True
SONGRIP=R(r"\((drum ?less|no drums|bass ?less|no bass|no guitar|without (drums|bass|guitar))\)\s*$|\b(original|official) (song|audio|version)\b")
JAZZY={"jazz","grateful dead","jam band","bluegrass","celtic","gypsy jazz"}
def songish(t,styles):
    if re.search(r"style|jam\b|groove|vamp|original|\bin [A-G]",t,re.I): return False
    if re.search(r"\s[-–]\s",t) and not styles: return True
    if re.search(r"\(.*(drums?|guitar|bass|vocals?|piano|keys)( backing track| only| less)?\)\s*$",t,re.I): return True
    return False
MANUAL_REJECT={"Davide Severino":"trumpet performances over standards, not backing tracks","Yasuhiro Fujii":"sax solo performances/transcriptions","Drumless Worship":"drumless edits of commercial worship songs","Metal Backing Tracks":"song backing tracks; prior account removed for copyright","gradgr1984":"covers","Drumless tracks channel":"drumless edits of commercial songs","Free Drumless Songs":"Rock Band/Guitar Hero stem rips","jeremy Yanzi":"drum covers","Rufus Page DRUMLESS TRACKS":"Lalal.ai stem separation","isoBack Tracks":"isolated stems of commercial songs","Best Songs Backing Tracks":"commercial song karaoke-style tracks","JOTTALU BATERA":"drumless edits of commercial songs","DrumlessOJam":"drumless edits of commercial songs","DrumLess":"drumless edits of commercial songs","Drumless Tracks":"drumless edits of commercial songs","ViolinDoctor":"lessons/performances","Piano Backing Tracks":"commercial song piano covers","Piano Karaoke":"karaoke","Ukulele Underground":"instructor play-alongs of commercial songs","Tommytoughknuckles":"backing tracks cut from Grateful Dead live recordings","Joanne Cooper Play Along Videos":"play-along videos over original commercial recordings","Rock Blues Guitar Backing Tracks Jam":"likely AI/mass-generated: new 2025 channel posting ~4 tracks/day, undisclosed","Worship Backing Studio":"likely AI/mass-generated: new 2025 channel posting ~2 tracks/day, undisclosed","C Drone Official":"a band named C Drone, not drone tracks","Tommy":"song stem edits","LiveLooperApp":"app demos","Ancient Sounds":"sample-pack promos","Fiddlerman":"mostly lessons","Drums":"unclear owner","RS Backing Tracks":"song backing tracks of commercial recordings","♪ JJ-BASSless (ツ)":"bass removed from commercial recordings","Playin’ with the Band Jam Tracks":"guitar removed from live concert recordings","Your Key Karaoke":"karaoke-sourced song tracks","Music Minded, Music Hearted":"karaoke-sourced song tracks (same owner as Your Key Karaoke)","Musically Yours, Arnie":"karaoke-sourced song tracks (same owner as Your Key Karaoke)","Guitar Backing Track|UCYSN7Ce8v4uxjVJw2L9P0hA":"x"}
def main():
    chans={}; tracks={}; stats=collections.Counter(); rejected_ch={}
    for f in sorted(glob.glob("videos/*.json")):
        d=json.load(open(f))
        if "entries" not in d: stats["ch_error"]+=1; continue
        name=d.get("channel") or ""; desc=d.get("description") or ""
        if name.endswith("- Topic"): continue
        if AICH.search(desc) or AICH.search(name): rejected_ch[d["channel_id"]]=(name,"AI disclosed in channel description"); continue
        n_bt=0; keep=[]
        for e in d["entries"]:
            t=(e.get("title") or "").strip(); dur=e.get("duration")
            if not t or not e.get("id") or not dur: continue
            if not is_bt(t): continue
            if dur<60 or dur>4*3600: stats["dur_reject"]+=1; continue
            if SONGRIP.search(t): stats["songrip_reject"]+=1; continue
            if name=="Free Drumless Tracks" and not re.match(r"(FDT|FREE Drumless Tracks)",t): continue
            keep.append(e)
        if len(keep)<3: continue
        cls=[(e,)+classify(e["title"],name,desc) for e in keep]
        sh=sum(songish(x[0]["title"],x[4]) for x in cls)/len(cls)
        if sh>=0.6 or name in MANUAL_REJECT:
            rejected_ch[d["channel_id"]]=(name,MANUAL_REJECT.get(name) or f"song-specific stem/rip channel ({sh:.0%} song titles)"); continue
        keep=[e for e,k,om,tg,st in cls if not (songish(e["title"],st) and not (set(st)&JAZZY or k=="play-along"))]
        if len(keep)<3: continue
        chans[d["channel_id"]]={"channel":name,"channel_id":d["channel_id"],"followers":d.get("followers"),"n":0,"description":desc[:300]}
        for e in keep:
            t=e["title"]; vid=e["id"]
            if vid in tracks: continue
            kind,om,tg,st=classify(t,name,desc)
            key=parse_key(t); m=BPM.search(t)
            bpm=int(m.group(1) or m.group(2)) if m else None
            if bpm and not (30<=bpm<=300): bpm=None
            if kind=="drone" and not key: key=drone_key(t)
            prog=parse_prog(t); sc=parse_scale(t,key)
            if kind=="drone": prog=None
            tags=[]
            tl=t.lower()
            for w,tag in [("shuffle","shuffle"),("slow","slow"),("fast","fast"),("groove","groove"),("ballad","ballad"),("acoustic","acoustic"),("drop d","drop D tuning"),("drop c","drop C tuning"),("7 string","7-string"),("8 string","8-string"),("waltz","3/4 waltz"),("6/8","6/8"),("7/8","odd time"),("5/4","odd time"),("half time","half-time"),("half-time","half-time"),("all keys","all keys"),("every key","all keys"),("12 keys","all keys"),("hz","tuning reference"),("432","432 Hz"),("bass & drums","bass & drums only"),("bass and drums","bass & drums only"),("drums only","drums only"),("bass only","bass only"),("click","click"),("metronome","click/metronome"),("style","artist-style"),("tuning","tuning")]:
                if w in tl and tag not in tags: tags.append(tag)
            if "guitar" in om: tags.append("no lead guitar")
            tracks[vid]={"id":vid,"title":t,"channel":name,"channel_id":d["channel_id"],"url":f"https://www.youtube.com/watch?v={vid}","duration_s":int(e["duration"]),"year":year(e.get("timestamp")),
              "omitted_instruments":om,"target_instruments":tg,"styles":st,"key":key,"tempo_bpm":bpm,"progression":prog,"scale":sc,"kind":kind,"tags":tags}
            chans[d["channel_id"]]["n"]+=1
    json.dump(list(tracks.values()),open("tracks_raw.json","w"),ensure_ascii=False)
    json.dump(chans,open("channels_kept.json","w"),ensure_ascii=False,indent=0)
    json.dump(rejected_ch,open("channels_rejected_ai.json","w"),ensure_ascii=False,indent=0)
    print(len(tracks),len(chans),dict(stats),len(rejected_ch))
main()
