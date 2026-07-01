/* Injected on every page:
   1) a sticky mobile action bar (call + free assessment)
   2) a persistent floating Contact button (call / text / email / message) */
(function () {
  var TEL = '+15099874612', NUM = '509-987-4612', MAIL = 'valorsportsacademywa@gmail.com';
  var GIVEAWAY_LIVE = false; // flip to true once the giveaway is approved (re-shows banner + nav link)

  // ---- sticky mobile bar (CSS shows it only under 820px) ----
  if (!document.getElementById('mcta')) {
    var bar = document.createElement('div');
    bar.id = 'mcta'; bar.className = 'mcta'; bar.setAttribute('aria-label', 'Quick actions');
    bar.innerHTML =
      '<a href="tel:' + TEL + '" class="mcta__btn mcta__call" aria-label="Call Valor Sports Academy">' +
        '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg> Call' +
      '</a>' +
      '<a href="/assessment" class="mcta__btn mcta__book">Free Assessment</a>';
    document.body.appendChild(bar);
  }

  // ---- floating Contact button ----
  if (!document.getElementById('fabWrap')) {
    var wrap = document.createElement('div');
    wrap.className = 'fab-wrap'; wrap.id = 'fabWrap';
    wrap.innerHTML =
      '<div class="fab-menu" id="fabMenu" role="menu">' +
        '<a role="menuitem" href="tel:' + TEL + '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg><span>Call us<small>' + NUM + '</small></span></a>' +
        '<a role="menuitem" href="sms:' + TEL + '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg><span>Text us<small>' + NUM + '</small></span></a>' +
        '<a role="menuitem" href="/contact"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M9 13h6M9 17h6"/></svg><span>Send a message</span></a>' +
      '</div>' +
      '<button class="fab" id="fabBtn" aria-expanded="false" aria-label="Contact us">' +
        '<span class="fab-ico-open"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></span>' +
        '<span class="fab-ico-close"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M18 6 6 18M6 6l12 12"/></svg></span>' +
        '<span class="fab-label">Contact</span>' +
      '</button>';
    document.body.appendChild(wrap);

    var btn = document.getElementById('fabBtn');
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      var open = wrap.classList.toggle('open');
      btn.setAttribute('aria-expanded', open);
    });
    document.addEventListener('click', function (e) { if (!wrap.contains(e.target)) { wrap.classList.remove('open'); btn.setAttribute('aria-expanded', 'false'); } });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { wrap.classList.remove('open'); btn.setAttribute('aria-expanded', 'false'); } });
  }

  // ---- slide-down giveaway promo (shows on first entry, then remembers dismissal) ----
  (function () {
    if (!GIVEAWAY_LIVE) return;
    var EXCLUDE = ['/giveaway', '/giveaway-thank-you', '/thank-you', '/getting-started'];
    var path = location.pathname.replace(/\/+$/, '') || '/';
    if (EXCLUDE.indexOf(path) !== -1) return;
    try { if (localStorage.getItem('valor_gv_promo') === 'dismissed') return; } catch (e) {}
    if (document.getElementById('gvPromo')) return;

    var p = document.createElement('div');
    p.id = 'gvPromo'; p.className = 'gv-promo';
    p.setAttribute('role', 'region'); p.setAttribute('aria-label', 'Giveaway announcement');
    p.innerHTML =
      '<div class="gv-promo__in">' +
        '<div class="gv-promo__center">' +
          '<div class="gv-promo__line">' +
            '<span class="gv-promo__badge">New</span>' +
            '<span class="gv-promo__title">Win a Summer of Valor</span>' +
          '</div>' +
          '<a class="gv-promo__sub" href="/giveaway">A free week of camp, a 1-on-1 assessment, and two personal training sessions ' +
            '<span class="gv-promo__arrow"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"><path d="M5 12h14M13 6l6 6-6 6"/></svg></span>' +
          '</a>' +
        '</div>' +
        '<a class="gv-promo__pic" href="/giveaway" aria-label="Enter the giveaway"><img src="/images/giveaway-hero.webp" alt="" onerror="this.parentNode.remove()"></a>' +
        '<button class="gv-promo__x" id="gvPromoX" aria-label="Dismiss giveaway banner"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M18 6 6 18M6 6l12 12"/></svg></button>' +
      '</div>';
    document.body.insertBefore(p, document.body.firstChild);

    // double rAF so the max-height transition fires from 0
    requestAnimationFrame(function () { requestAnimationFrame(function () { p.classList.add('gv-promo--in'); }); });

    var remember = function () { try { localStorage.setItem('valor_gv_promo', 'dismissed'); } catch (e) {} };
    document.getElementById('gvPromoX').addEventListener('click', function () {
      remember();
      p.classList.remove('gv-promo--in');
      setTimeout(function () { if (p.parentNode) p.parentNode.removeChild(p); }, 600);
    });
    [].forEach.call(p.querySelectorAll('a[href="/giveaway"]'), function (a) { a.addEventListener('click', remember); });
  })();

  // ---- always-on Giveaway link in the nav (skip on the giveaway page itself) ----
  (function () {
    if (!GIVEAWAY_LIVE) return;
    if ((location.pathname.replace(/\/+$/, '') || '/') === '/giveaway') return;
    var nav = document.querySelector('header .nav');
    if (nav && !nav.querySelector('a[href="/giveaway"]')) {
      var a = document.createElement('a');
      a.href = '/giveaway'; a.className = 'nav-gv'; a.textContent = 'Giveaway';
      nav.appendChild(a);
    }
    var menu = document.querySelector('header .header__menu');
    if (menu && !menu.querySelector('a[href="/giveaway"]')) {
      var m = document.createElement('a');
      m.href = '/giveaway'; m.className = 'menu-gv'; m.textContent = 'Enter our Giveaway';
      menu.appendChild(m);
    }
  })();

  // ---- nav: Programs hover dropdown + Reviews link ----
  (function () {
    var nav = document.querySelector('header .nav');
    if (nav) {
      if (!nav.querySelector('a[href="/testimonials"]')) {
        var contact = nav.querySelector('a[href="/contact"]');
        var r = document.createElement('a'); r.href = '/testimonials'; r.textContent = 'Reviews';
        if (contact) nav.insertBefore(r, contact); else nav.appendChild(r);
      }
      var p = nav.querySelector('a[href="/programs"]');
      if (p && p.parentNode === nav) {
        var wrap = document.createElement('span'); wrap.className = 'nav__has';
        nav.insertBefore(wrap, p); wrap.appendChild(p);
        var dd = document.createElement('div'); dd.className = 'nav__menu';
        dd.innerHTML =
          '<a href="/programs">All programs &amp; camps</a>' +
          '<a href="/youth-football-training">Youth Football</a>' +
          '<a href="/sports-training">Sports Training</a>' +
          '<a href="/personal-training">Personal Training</a>';
        wrap.appendChild(dd);
      }
    }
    var mm = document.querySelector('header .header__menu');
    if (mm && !mm.querySelector('a[href="/testimonials"]')) {
      var contactM = mm.querySelector('a[href="/contact"]');
      var rm = document.createElement('a'); rm.href = '/testimonials'; rm.textContent = 'Reviews';
      if (contactM) mm.insertBefore(rm, contactM.nextSibling); else mm.appendChild(rm);
    }
  })();

  /* ---- Lead attribution: capture where visitors come from (utm / gclid /
     referrer / landing page), persist across pages so it survives the walk to
     the contact form, and expose helpers the form beacons use. ---- */
  (function () {
    try {
      var PARAMS = ['utm_source','utm_medium','utm_campaign','utm_term','utm_content','gclid','fbclid'];
      var qs = new URLSearchParams(location.search);
      var touch = {}, hasParams = false;
      PARAMS.forEach(function (k) { var v = qs.get(k); if (v) { touch[k] = v.slice(0, 200); hasParams = true; } });
      var ref = document.referrer || '';
      var internal = ref && ref.indexOf(location.hostname) !== -1;
      var external = ref && !internal;

      var store = {};
      try { store = JSON.parse(localStorage.getItem('pb_attr') || '{}'); } catch (_) {}

      if (hasParams || external) {
        var snap = Object.assign({}, touch, {
          referrer: external ? ref.slice(0, 300) : '',
          landing_page: location.pathname
        });
        if (!store.first) store.first = snap;   // first-touch: set once
        store.last = snap;                       // last-touch: always freshest
        localStorage.setItem('pb_attr', JSON.stringify(store));
      }
    } catch (_) {}
  })();

  // Best available attribution (last-touch, falling back to first-touch).
  window.__pbAttr = function () {
    try { var s = JSON.parse(localStorage.getItem('pb_attr') || '{}'); return s.last || s.first || {}; }
    catch (_) { return {}; }
  };
  // Copy attribution into a form's hidden inputs so Netlify Forms captures it.
  window.__pbFillForm = function (form) {
    var a = window.__pbAttr();
    ['utm_source','utm_medium','utm_campaign','utm_term','utm_content','gclid','fbclid','referrer','landing_page']
      .forEach(function (k) {
        var el = form.querySelector('input[name="' + k + '"]');
        if (el && a[k]) el.value = a[k];
      });
  };
})();
