/* Sticky mobile call-to-action bar — injected on every page.
   Visible only on small screens (CSS handles the breakpoint). */
(function () {
  if (document.getElementById('mcta')) return;
  var bar = document.createElement('div');
  bar.id = 'mcta';
  bar.className = 'mcta';
  bar.setAttribute('aria-label', 'Quick actions');
  bar.innerHTML =
    '<a href="tel:+15099874612" class="mcta__btn mcta__call" aria-label="Call Valor Sports Academy">' +
      '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg> Call' +
    '</a>' +
    '<a href="/assessment" class="mcta__btn mcta__book">Free Assessment</a>';
  document.body.appendChild(bar);
})();
