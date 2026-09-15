"""Build synced clips: iPhone video + DJI mic audio (iPhone audio fills any uncovered head/tail).
Track 1 = synced mix, track 2 = original iPhone audio. Video stream is copied, no re-encode."""
import json, os, subprocess, sys, wave
import numpy as np

S = os.path.dirname(os.path.abspath(__file__))
ROOT = "/Users/macuser/Documents/Claude/Projects/playbook/valor-sports-academy/Videos/2026-09-08-day-one"
OUT = ROOT + "/09-synced"
FOLDERS = {"01": "01-corey-interview-seated-rack", "02": "02-randy-interview-dumbbell-rack-and-red-wall", "03": "03-michael-interview-standing-turf", "04": "04-three-coaches"}
SR = 8000

def load(p):
    with wave.open(p) as w:
        return np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float64)

def fine_env(x, hop=8):  # 1 ms envelope
    n = len(x) // hop
    e = np.abs(x[: n * hop]).reshape(n, hop).mean(axis=1)
    e = np.log1p(e); e -= np.convolve(e, np.ones(400) / 400, mode="same")
    return e

def refine(iph_wav, dji_wav, off_s, win_ms=40):
    """refine offset to 1 ms using fine envelopes around the coarse offset."""
    a = fine_env(load(iph_wav)); b = fine_env(load(dji_wav))
    k0 = int(round(off_s * 1000)); best = (-1e9, k0)
    for k in range(k0 - win_ms, k0 + win_ms + 1):
        s, e = max(k, 0), min(k + len(a), len(b))
        if e - s < 500: continue
        aa = a[s - k : e - k]; bb = b[s:e]
        c = np.dot(aa - aa.mean(), bb - bb.mean()) / (np.linalg.norm(aa - aa.mean()) * np.linalg.norm(bb - bb.mean()) + 1e-9)
        if c > best[0]: best = (c, k)
    return best[1] / 1000.0, best[0]

matches = json.load(open(S + "/matches.json"))
only = set(sys.argv[1:])
report = []
for r in matches:
    name = r["iphone"]; folder = FOLDERS[r["folder"]]; base = name[3:]
    if only and base not in only: continue
    src = f"{ROOT}/{folder}/{base}.MOV"
    dst_dir = f"{OUT}/{folder}"; os.makedirs(dst_dir, exist_ok=True)
    if not r["candidates"] or r["candidates"][0]["coverage"] == 0:
        report.append(dict(iphone=base, folder=folder, dji=None, note="no DJI take overlaps; iPhone audio only")); continue
    c = r["candidates"][0]; dji = c["dji"]; dur = r["dur_s"]
    off, cc = refine(f"{S}/iphone/{name}.wav", f"{S}/dji/{dji}.wav", c["offset_s"])
    dji_path = f"{ROOT}/08-dji/{dji}.MP4"
    cov_s, cov_e = max(0.0, -off), min(dur, c["dji_len_s"] if "dji_len_s" in c else 1e9)
    # dji clip length from wav
    with wave.open(f"{S}/dji/{dji}.wav") as w: dlen = w.getnframes() / SR
    cov_e = min(dur, dlen - off)
    fmt = "aformat=sample_rates=48000:channel_layouts=stereo"
    segs = []; n = 0; fc = []
    if cov_s > 0.02:
        fc.append(f"[0:a:0]atrim=0:{cov_s:.3f},asetpts=PTS-STARTPTS,{fmt}[s{n}]"); segs.append(f"[s{n}]"); n += 1
    fc.append(f"[1:a:0]atrim={max(off,0):.3f}:{off + cov_e:.3f},asetpts=PTS-STARTPTS,{fmt}[s{n}]"); segs.append(f"[s{n}]"); n += 1
    if dur - cov_e > 0.02:
        fc.append(f"[0:a:0]atrim={cov_e:.3f}:{dur:.3f},asetpts=PTS-STARTPTS,{fmt}[s{n}]"); segs.append(f"[s{n}]"); n += 1
    fc.append("".join(segs) + f"concat=n={n}:v=0:a=1[mix]")
    dst = f"{dst_dir}/{base}-synced.mov"
    cmd = ["ffmpeg", "-v", "error", "-y", "-i", src, "-i", dji_path, "-filter_complex", ";".join(fc),
           "-map", "0:v:0", "-map", "[mix]", "-map", "0:a:0", "-c:v", "copy", "-c:a:0", "aac", "-b:a:0", "256k", "-c:a:1", "copy",
           "-metadata:s:a:0", "title=DJI mic (synced)", "-metadata:s:a:1", "title=iPhone original", "-movflags", "+faststart", "-shortest", dst]
    subprocess.run(cmd, check=True)
    rep = dict(iphone=base, folder=folder, dji=dji + ".MP4", dji_offset_s=round(off, 3), refine_corr=round(cc, 3), coverage=c["coverage"],
               covered_s=[round(cov_s, 2), round(cov_e, 2)], out=os.path.relpath(dst, ROOT))
    report.append(rep); print(json.dumps(rep))

json.dump(report, open(f"{OUT}/sync-map.json", "w"), indent=1)
