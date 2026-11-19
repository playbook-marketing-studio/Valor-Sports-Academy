import React, { useState } from 'react';
import { FileSignature, Loader2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { callFn } from '@/api/supabaseClient';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ROLE_LABEL, SignWaiverForm, WaiverText, fmtDate, fmtSigned } from './Waiver';
import { useMyWaivers } from '@/components/RequireWaiver';

/** A signed copy: who, when, how, then the exact text they signed. Staff also see IP and device. */
export function WaiverCopyDialog({ signatureId, onClose, staff = false }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  React.useEffect(() => {
    if (!signatureId) return;
    setD(null); setErr('');
    callFn('waiver', { body: { action: 'copy', signature_id: signatureId } }).then(setD).catch((e) => setErr(e.message));
  }, [signatureId]);
  const s = d?.signature;
  return (
    <Dialog open={!!signatureId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
        <DialogHeader><DialogTitle>Signed waiver{s ? `: ${s.athlete_name}` : ''}</DialogTitle></DialogHeader>
        {err && <p className="text-sm text-destructive">{err}</p>}
        {!d && !err && <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>}
        {s && (
          <div className="space-y-4">
            <div className="grid gap-1 rounded-xl border border-border p-3 text-sm">
              <p><b>Athlete:</b> {s.athlete_name}</p>
              <p><b>Signed by:</b> {s.signer_name} ({ROLE_LABEL[s.signer_role] || s.signer_role})</p>
              <p><b>When:</b> {fmtSigned(s.signed_at)} Pacific</p>
              <p><b>How:</b> {s.method === 'app' ? 'In the app, signed in' : 'Private sign link'}{s.signer_email ? ` · ${s.signer_email}` : ''}</p>
              {staff && <p className="text-xs text-muted-foreground">IP {s.ip || 'n/a'} · {s.user_agent || 'device n/a'}</p>}
              <p className="text-xs text-muted-foreground">Version {s.version} · text fingerprint {String(s.body_sha256).slice(0, 12)} · record {String(s.id).slice(0, 8)}{s.emailed_at ? ` · copy emailed ${fmtDate(s.emailed_at)}` : ''}</p>
            </div>
            {d.waiver && <div className="rounded-xl border border-border p-4"><WaiverText waiver={d.waiver} /></div>}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Account page line per athlete: signed (view copy) or not (sign now). Hidden until the waiver is switched on. */
export function AthleteWaiverRow({ athleteId }) {
  const { data } = useMyWaivers();
  const qc = useQueryClient();
  const [copy, setCopy] = useState(null);
  const [signing, setSigning] = useState(false);
  const a = data?.waiver ? (data.athletes || []).find((x) => x.id === athleteId) : null;
  if (!a) return null;
  return (
    <div className="space-y-2">
      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground"><FileSignature className="h-3.5 w-3.5" /> Waiver</p>
      <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-sm">
        {a.signature
          ? <><span>Signed {fmtDate(a.signature.signed_at)} by {a.signature.signer_name}</span><Button variant="outline" size="sm" onClick={() => setCopy(a.signature.id)}>View copy</Button></>
          : <><span className="text-warning">Not signed yet</span><Button size="sm" onClick={() => setSigning(true)}>Sign now</Button></>}
      </div>
      <WaiverCopyDialog signatureId={copy} onClose={() => setCopy(null)} />
      <Dialog open={signing} onOpenChange={setSigning}>
        <DialogContent className="max-h-[92vh] max-w-xl overflow-y-auto">
          <DialogHeader><DialogTitle>Sign {a.first_name}'s waiver</DialogTitle></DialogHeader>
          <SignWaiverForm waiver={data.waiver} athlete={a} onSign={async (p) => {
            await callFn('waiver', { body: { action: 'sign', athlete_id: a.id, ...p } });
            await qc.invalidateQueries({ queryKey: ['waiver-mine'] });
            setSigning(false);
          }} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
