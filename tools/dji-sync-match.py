import glob, json, os, wave, sys, subprocess, datetime
import numpy as np

S = os.path.dirname(os.path.abspath(__file__))
ROOT = "/Users/macuser/Documents/Claude/Projects/playbook/valor-sports-academy/Videos/2026-09-08-day-one"
SR = 8000
HOP = 80  # 8kHz -> 100 Hz envelope (10 ms)
CLOCK_TOL = 2.5
CLOCK_SHIFT = 80.0  # iPhone clock runs 80.0 s behind the DJI clock (measured from 30 strong matches)  # seconds of allowed disagreement between the two cameras' clocks

def ctime(path):
    out = subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format_tags=creation_time,com.apple.quicktime.creationdate:format=duration", "-of", "json", path]).decode()
    j = json.loads(out)["format"]
    tags = j.get("tags", {})
    t = tags.get("com.apple.quicktime.creationdate") or tags.get("creation_time")
    dt = datetime.datetime.fromisoformat(t.replace("Z", "+00:00"))
    return dt.timestamp(), float(j["duration"])

def load(p):
    with wave.open(p) as w:
        x = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32)
    return x

def bandpass(x):
    # crude speech-band emphasis via FFT mask 300-3000 Hz
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    X[(f < 300) | (f > 3000)] = 0
    return np.fft.irfft(X, len(x))

def envelope(x):
    x = bandpass(x)
    n = len(x) // HOP
    e = np.sqrt((x[: n * HOP] ** 2).reshape(n, HOP).mean(axis=1))
    e = np.log1p(e)
    # remove slow trend (2 s moving average)
    k = 200
    trend = np.convolve(e, np.ones(k) / k, mode="same")
    e = e - trend
    return e.astype(np.float64)

def ncc(a, b, lo, hi):
    """normalized cross-correlation of a inside b for start offsets in [lo,hi] (env samples)."""
    la = len(a); a0 = a - a.mean(); na = np.linalg.norm(a0) + 1e-9
    best = (-9, 0); scores = []
    lo = max(lo, -la + 100); hi = min(hi, len(b) - 100)
    if hi < lo: return None
    # FFT-based dot products for all lags, then normalize per lag with local energy
    n = la + len(b) - 1
    N = 1 << (n - 1).bit_length()
    dots = np.fft.irfft(np.fft.rfft(b, N) * np.conj(np.fft.rfft(a0, N)), N)[: len(b)]  # dots[k] = sum a0[i]*b[k+i]
    # local energy of b windows via cumulative sums (approximate mean removal ignored; envelopes are ~zero-mean)
    cs = np.concatenate([[0], np.cumsum(b ** 2)])
    ks = np.arange(lo, hi + 1)
    out = np.empty(len(ks))
    for j, k in enumerate(ks):
        s, e = max(k, 0), min(k + la, len(b))
        if e - s < 100: out[j] = -9; continue
        eb = np.sqrt(cs[e] - cs[s]) + 1e-9
        out[j] = dots[k] / (na * eb) if k >= 0 else np.dot(a0[-k:-k + (e - s)], b[s:e]) / (na * eb)
    i = int(np.argmax(out))
    z = (out[i] - np.median(out)) / (np.std(out) + 1e-9)
    return int(ks[i]), float(out[i]), float(z)

dji_files = sorted(glob.glob(ROOT + "/08-dji/*.MP4"))
iph_files = []
for d in ["01-corey-interview-seated-rack", "02-randy-interview-dumbbell-rack-and-red-wall", "03-michael-interview-standing-turf", "04-three-coaches"]:
    iph_files += sorted(glob.glob(f"{ROOT}/{d}/*.MOV"))

dji = {}
for p in dji_files:
    b = os.path.basename(p)[:-4]; st, du = ctime(p)
    dji[b] = dict(start=st, dur=du, env=envelope(load(f"{S}/dji/{b}.wav")))
iph = {}
for p in iph_files:
    b = os.path.basename(p)[:-4]; d = os.path.basename(os.path.dirname(p))[:2]; st, du = ctime(p)
    iph[f"{d}_{b}"] = dict(start=st, dur=du, env=envelope(load(f"{S}/iphone/{d}_{b}.wav")), folder=d)

print(f"{len(dji)} dji, {len(iph)} iphone", file=sys.stderr)
fmt = lambda t: datetime.datetime.fromtimestamp(t).strftime("%H:%M:%S")

results = []
for name, a in iph.items():
    cands = []
    for dname, b in dji.items():
        # predicted start of iphone clip inside dji clip, from device clocks
        pred = a["start"] - b["start"] + CLOCK_SHIFT
        # require some overlap allowing CLOCK_TOL
        if pred + a["dur"] < -CLOCK_TOL or pred > b["dur"] + CLOCK_TOL:
            continue
        r = ncc(a["env"], b["env"], int((pred - CLOCK_TOL) * 100), int((pred + CLOCK_TOL) * 100))
        if r is None: continue
        k, score, z = r
        off = k / 100
        cov_start = max(0.0, -off); cov_end = min(a["dur"], b["dur"] - off)
        cands.append(dict(dji=dname, offset_s=round(off, 2), score=round(score, 3), z=round(z, 1), clock_diff_s=round(off - pred, 2), cover_s=[round(cov_start,2), round(cov_end,2)], coverage=round(max(0, cov_end - cov_start) / a["dur"], 2)))
    cands.sort(key=lambda c: -c["score"])
    row = dict(iphone=name, folder=a["folder"], start=fmt(a["start"]), dur_s=round(a["dur"], 1), candidates=cands[:3])
    results.append(row)
    if cands:
        c = cands[0]
        others = [x for x in cands[1:] if x['coverage'] > 0]
        print(f"{name:14s} {fmt(a['start'])} {a['dur']:6.1f}s -> {c['dji'][-9:-2]} @ {c['offset_s']:8.2f}s ncc={c['score']:.3f} cover {int(c['coverage']*100):3d}% {c['cover_s']}" + (f"  +{[x['dji'][-9:-2]+' '+str(x['cover_s']) for x in others]}" if others else ""))
    else:
        print(f"{name:14s} {fmt(a['start'])} {a['dur']:6.1f}s -> NO DJI TAKE OVERLAPS")

json.dump(results, open(S + "/matches.json", "w"), indent=1)
