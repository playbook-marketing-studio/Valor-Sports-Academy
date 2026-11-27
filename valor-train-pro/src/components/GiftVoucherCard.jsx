import React, { forwardRef } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { goodThrough } from '@/lib/gifts';

// Fixed colors (not theme tokens): this card is also saved as an image, so it looks the same in light or dark mode.
const RED = '#D2223A';
const INK = '#0a0a0a';
const CREAM = '#F1E9D6';

/**
 * The gift voucher a giver screenshots, saves or texts (Omar 11/27/2026). One phone screen tall.
 * The QR opens app.../gift/CODE, where the family signs in and picks their athlete.
 */
const GiftVoucherCard = forwardRef(function GiftVoucherCard({ gift, url }, ref) {
  return (
    <div ref={ref} style={{ background: INK, color: CREAM, borderRadius: 24, padding: 6, width: '100%', maxWidth: 380, margin: '0 auto', boxSizing: 'border-box' }}>
      <div style={{ border: `2px solid ${RED}`, borderRadius: 19, padding: '22px 20px 20px', textAlign: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
          <img src="/images/logo-emblem.png" alt="" style={{ width: 44, height: 44, objectFit: 'contain' }} crossOrigin="anonymous" />
          <div style={{ textAlign: 'left', lineHeight: 1 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 26, letterSpacing: '.02em' }}>Valor</div>
            <div style={{ fontWeight: 700, fontSize: 9, letterSpacing: '.34em', color: '#ff7484', marginTop: 3 }}>SPORTS ACADEMY</div>
          </div>
        </div>
        <div style={{ marginTop: 18, fontWeight: 800, fontSize: 12, letterSpacing: '.28em', color: RED }}>A GIFT FOR {(gift.to_name || 'you').toUpperCase()}</div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 58, lineHeight: 0.95, marginTop: 8, textTransform: 'uppercase' }}>
          {gift.classes ? `${gift.classes} classes` : gift.item_name}
        </div>
        <div style={{ fontSize: 14, marginTop: 6, opacity: 0.85 }}>at Valor Sports Academy</div>
        {gift.note && <div style={{ fontSize: 14, fontStyle: 'italic', marginTop: 12 }}>"{gift.note}"</div>}
        <div style={{ fontSize: 13, marginTop: 10, opacity: 0.85 }}>From {gift.from_name}{gift.expires_at ? ` · Good through ${goodThrough(gift.expires_at)}` : ''}</div>
        <div style={{ display: 'inline-block', background: '#fff', padding: 10, borderRadius: 14, marginTop: 16 }}>
          <QRCodeCanvas value={url} size={150} level="M" />
        </div>
        <div style={{ fontWeight: 800, fontSize: 11, letterSpacing: '.24em', marginTop: 12, opacity: 0.7 }}>GIFT CODE</div>
        <div style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 28, fontWeight: 700, letterSpacing: '.12em', marginTop: 2 }}>{gift.code}</div>
        <div style={{ fontSize: 12, marginTop: 12, lineHeight: 1.45, opacity: 0.85 }}>
          Scan the code or go to <span style={{ fontWeight: 700 }}>app.valorsportsacademywa.com/gift</span>, sign in, and pick your athlete. Then just show up to any class.
        </div>
      </div>
    </div>
  );
});

export default GiftVoucherCard;
