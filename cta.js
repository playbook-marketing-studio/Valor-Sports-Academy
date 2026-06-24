/* Injected on every page:
   1) a sticky mobile action bar (call + free assessment)
   2) a persistent floating Contact button (call / text / email / message) */
(function () {
  var TEL = '+15099874612', NUM = '509-987-4612', MAIL = 'valorsportsacademywa@gmail.com';

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
})();
