import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeHtml, isSafeUrl, htmlToText } from '../admin/js/lib/sanitize.js';

test('laat nette opmaak staan', () => {
  const html = '<h2>Kop</h2><p>Tekst met <strong>vet</strong>, <em>schuin</em> en <a href="https://example.com">link</a>.</p><ul><li>een</li></ul>';
  assert.equal(sanitizeHtml(html), '<h2>Kop</h2><p>Tekst met <strong>vet</strong>, <em>schuin</em> en <a href="https://example.com" rel="noopener">link</a>.</p><ul><li>een</li></ul>');
});

test('verwijdert scripts, styles en iframes inclusief inhoud', () => {
  const out = sanitizeHtml('<p>a</p><script>alert(1)</script><style>p{}</style><iframe src="x">y</iframe><SCRIPT type="x">alert(2)</SCRIPT ><p>b</p>');
  assert.equal(out, '<p>a</p><p>b</p>');
});

test('verwijdert event-handlers en style/class', () => {
  const out = sanitizeHtml('<p onclick="alert(1)" style="color:red" class="x">hoi</p><img src="/media/a.jpg" onerror="alert(1)" alt="x">');
  assert.equal(out, '<p>hoi</p><img src="/media/a.jpg" alt="x">');
});

test('blokkeert gevaarlijke links', () => {
  for (const bad of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', ' javascript:alert(1)', 'java\tscript:alert(1)', 'javascript&colon;alert(1)', '&#106;avascript:alert(1)', 'data:text/html,<script>', 'vbscript:x']) {
    const out = sanitizeHtml(`<a href="${bad}">x</a>`);
    assert.ok(!/href/.test(out), `link niet geblokkeerd: ${bad} -> ${out}`);
    assert.equal(isSafeUrl(bad), false, bad);
  }
  assert.equal(sanitizeHtml('<img src="javascript:alert(1)">'), '');
});

test('staat veilige links toe', () => {
  for (const ok of ['https://a.nl', 'http://a.nl', 'mailto:a@b.nl', 'tel:+31612345678', '/over-ons/', '#kop', 'pagina.html']) {
    assert.equal(isSafeUrl(ok), true, ok);
  }
});

test('zet tags om en pakt onbekende tags uit', () => {
  assert.equal(sanitizeHtml('<b>a</b><i>b</i><h1>c</h1><span>d</span><font>e</font>'), '<strong>a</strong><em>b</em><h2>c</h2>de');
  assert.equal(sanitizeHtml('<div>regel</div>'), '<p>regel</p>');
});

test('sluit open tags en negeert losse sluittags', () => {
  assert.equal(sanitizeHtml('<p><strong>open'), '<p><strong>open</strong></p>');
  assert.equal(sanitizeHtml('tekst</em></p>'), 'tekst');
});

test('maakt losse < en > veilig en laat entiteiten heel', () => {
  assert.equal(sanitizeHtml('<p>1 < 2 & 3 > 2 &amp; &euro;</p>'), '<p>1 &lt; 2 &amp; 3 &gt; 2 &amp; &euro;</p>');
  assert.equal(sanitizeHtml('<p>a <scr<script>ipt>alert(1)</p>'), '<p>a ipt&gt;alert(1)</p>');
});

test('attributen met aanhalingstekens kunnen niet uitbreken', () => {
  const out = sanitizeHtml(`<a href='https://a.nl/"onmouseover="alert(1)'>x</a>`);
  assert.equal(out, '<a href="https://a.nl/&quot;onmouseover=&quot;alert(1)" rel="noopener">x</a>');
  const out2 = sanitizeHtml('<img src="/a.jpg" alt="x > y" title="t">');
  assert.equal(out2, '<img src="/a.jpg" alt="x &gt; y" title="t">');
});

test('commentaar en svg worden verwijderd', () => {
  assert.equal(sanitizeHtml('<p>a<!-- <script>x</script> -->b</p><svg><script>alert(1)</script></svg>'), '<p>ab</p>');
});

test('lege alinea\'s worden opgeruimd', () => {
  assert.equal(sanitizeHtml('<p><br></p><p>tekst</p><p> </p>'), '<p>tekst</p>');
});

test('htmlToText', () => {
  assert.equal(htmlToText('<p>Hallo&nbsp;<b>wereld</b></p><p>Twee</p>'), 'Hallo wereld Twee');
});
