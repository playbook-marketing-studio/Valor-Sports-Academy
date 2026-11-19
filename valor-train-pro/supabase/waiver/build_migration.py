"""Writes the waiver migration from the .txt so the stored text is exactly the file (run once per new version)."""
import hashlib, pathlib, sys
here = pathlib.Path(__file__).parent
version = sys.argv[1] if len(sys.argv) > 1 else "2026-10-27"
body = (here / f"valor-waiver-{version}.txt").read_text().strip() + "\n"
assert "$wv$" not in body
note = (
    "Copied word for word from Michael's email \"Waiver\" (10/27/2026 7:28pm). Two lines in sections 3 and 4 came "
    "through mixed together in the paste. The highlighted words are our best guess at the original; waiting on Michael "
    "to confirm or send the original file. As pasted: \"...arise from this AgT LIMITED TO ANY CLAIMS THAT VALOR WAS "
    "NEGLIGENT...\" and \"4. ENTIRE AGREEMENT; SEVERABILITY; MODIFICATION; WAIVER GOVERNING LAW; VENUEreement or from "
    "any activity of Participant in, with or for Valor, INCLUDING BUT NO; ATTORNEYS' FEES AND COSTS\". Typos left as "
    "written: tothe, ormay, intials, resective."
)
print(f"-- body sha256 (with [[ ]] review marks): {hashlib.sha256(body.encode()).hexdigest()}", file=sys.stderr)
sql = f"""
insert into public.waiver_texts (version, title, body, status, review_note)
values ('{version}', 'Express Assumption of Risk, Release, Covenant Not to Sue and Indemnity', $wv${body}$wv$, 'draft', $wv${note}$wv$)
on conflict (version) do nothing;
"""
sys.stdout.write(sql)
