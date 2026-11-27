import React, { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import html2canvas from 'html2canvas';
import { CheckCircle2, Download, Loader2, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/use-toast';
import GiftVoucherCard from '@/components/GiftVoucherCard';
import { giftFn } from '@/lib/gifts';
import { VALOR_EMAIL } from '@/lib/valor';

/**
 * The voucher, where Stripe sends the giver after paying (and Account → Gifts you bought, any time later).
 * fn gift confirms the payment with Stripe, so this also works if the webhook is slow.
 */
export default function GiftVoucher() {
  const { id } = useParams();
  const [gift, setGift] = useState(null);
  const [err, setErr] = useState('');
  const [tries, setTries] = useState(0);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState('');
  const card = useRef(null);

  useEffect(() => {
    let stop = false;
    giftFn({ action: 'voucher', id }).then((r) => { if (!stop) { setGift(r.gift); if (r.gift.to_email) setEmail(r.gift.to_email); } }).catch((e) => !stop && setErr(e.message));
    return () => { stop = true; };
  }, [id, tries]);
  // right after Stripe the payment can take a few seconds to settle
  useEffect(() => {
    if (gift?.status !== 'pending' || tries > 10) return undefined;
    const t = setTimeout(() => setTries((n) => n + 1), 2500);
    return () => clearTimeout(t);
  }, [gift?.status, tries]);

  const url = gift?.code ? `${window.location.origin}/gift/${gift.code}` : '';

  const saveImage = async () => {
    setBusy('save');
    try {
      const canvas = await html2canvas(card.current, { backgroundColor: null, scale: 3, useCORS: true });
      const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
      const file = new File([blob], `valor-gift-${gift.code}.png`, { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        try { await navigator.share({ files: [file], title: 'Valor gift' }); return; } catch (e) { if (e?.name === 'AbortError') return; }
      }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = file.name; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    } catch {
      toast({ title: 'Could not save the image', description: 'Take a screenshot instead. The voucher fits on one screen.' });
    } finally { setBusy(''); }
  };

  const sendEmail = async (e) => {
    e.preventDefault();
    setBusy('email');
    try {
      const r = await giftFn({ action: 'email', id, to_email: email });
      setGift(r.gift);
      toast({ title: 'Sent', description: `The gift is on its way to ${email}.` });
    } catch (e2) {
      toast({ title: 'Could not send it', description: e2.message });
    } finally { setBusy(''); }
  };

  if (err) return <div className="rounded-xl border border-border bg-card p-5 text-sm">{err}. Questions? Email {VALOR_EMAIL}.</div>;
  if (!gift || (gift.status === 'pending' && tries <= 10)) {
    return <div className="flex flex-col items-center gap-3 py-16 text-sm text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin" /> Finishing up your payment…</div>;
  }
  if (gift.status === 'pending' || gift.status === 'canceled') {
    return (
      <div className="space-y-3 rounded-xl border border-border bg-card p-5">
        <h1 className="font-display text-3xl">{gift.status === 'canceled' ? 'Payment not finished' : 'Still waiting on the payment'}</h1>
        <p className="text-sm text-muted-foreground">{gift.status === 'canceled' ? 'Nothing was charged.' : 'Give it a minute and open this page again from your Account.'} Questions? Email {VALOR_EMAIL}.</p>
        <Button asChild><Link to="/gift/buy">Try again</Link></Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <div className="flex items-start gap-3">
        <CheckCircle2 className="mt-1 h-6 w-6 shrink-0 text-success" />
        <div>
          <h1 className="font-display text-3xl">{gift.status === 'claimed' ? 'This gift was used' : 'Your gift is ready'}</h1>
          <p className="text-sm text-muted-foreground">{gift.status === 'claimed' ? 'The family already added these classes to their athlete.' : 'Save it, screenshot it, or text it to them. They scan it or enter the code in the app.'}</p>
        </div>
      </div>
      <GiftVoucherCard ref={card} gift={gift} url={url} />
      {gift.status === 'paid' && (
        <div className="space-y-4">
          <Button className="w-full gap-2" onClick={saveImage} disabled={!!busy}><Download className="h-4 w-4" /> {busy === 'save' ? 'One moment…' : 'Save image'}</Button>
          <form onSubmit={sendEmail} className="space-y-2 rounded-xl border border-border bg-card p-4">
            <p className="flex items-center gap-2 text-sm font-semibold"><Mail className="h-4 w-4" /> {gift.emailed_at ? `Emailed to ${gift.to_email}` : 'Or email it to them'}</p>
            <div className="flex gap-2">
              <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="their email" />
              <Button type="submit" variant="outline" disabled={!!busy || !email.trim()}>{busy === 'email' ? 'Sending…' : gift.emailed_at ? 'Send again' : 'Send'}</Button>
            </div>
          </form>
          <p className="text-xs text-muted-foreground">Lost it? This voucher stays in your Account under Gifts you bought.</p>
        </div>
      )}
      <Button asChild variant="outline" className="w-full"><Link to="/">Back to Home</Link></Button>
    </div>
  );
}
