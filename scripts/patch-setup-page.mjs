/**
 * Add the draggable AutoLL-3 bookmarklet button to the inherited setup page.
 *
 * index.html is copied from the pinned AutoLL-2 installer and branded before
 * this runs. The button's href is not written here: the page's own script,
 * the one that fills `.bm-code`, sets it from the same string.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const path = 'dist/index.html';
let html = readFileSync(path, 'utf8');

if (html.includes('bm-drag')) {
  console.error(`${path} already has a drag button`);
  process.exit(1);
}

const button = `<p class="bm-install-button"><a class="button bm-drag" draggable="true" href="#" title="Drag this onto the Favorites or Bookmarks bar">AutoLL-3</a></p>`;

const instruction =
  'Show the Favorites/Bookmarks bar (Safari: View &gt; Show Favorites Bar), drag the AutoLL-3 button onto it, then sign in at disneyworld.disney.go.com and click it.';

function once(haystack, needle, replacement, label) {
  const at = haystack.indexOf(needle);
  if (at < 0) {
    console.error(`${path} is missing ${label}`);
    process.exit(1);
  }
  if (haystack.indexOf(needle, at + needle.length) !== -1) {
    console.error(`${path} has more than one ${label}`);
    process.exit(1);
  }
  return (
    haystack.slice(0, at) + replacement + haystack.slice(at + needle.length)
  );
}

html = once(
  html,
  `  .noscroll {
    overflow: hidden;
  }
</style>`,
  `  .noscroll {
    overflow: hidden;
  }

  .bm-install-button {
    margin: 0.4em 0 0.2em;
    text-align: center;
  }
</style>`,
  'the setup page style block'
);

html = once(
  html,
  '    <h2>What is AutoLL-3?</h2>',
  `    <div class="notice bm-install">
      <p><strong>On a computer.</strong> ${instruction}</p>
      ${button}
    </div>

    <h2>What is AutoLL-3?</h2>`,
  'the top of the setup page'
);

const safariAt = html.indexOf('id="safari-bookmarklet"');
const safariEnd = html.indexOf('</details>', safariAt);
if (safariAt < 0 || safariEnd < 0) {
  console.error(`${path} is missing the Safari bookmarklet section`);
  process.exit(1);
}
const creating = '<h3>Creating the bookmarklet</h3>';
const section = html.slice(safariAt, safariEnd);
const creatingAt = section.indexOf(creating);
if (creatingAt < 0) {
  console.error(`${path} Safari section has no copy-the-code steps`);
  process.exit(1);
}
const safariNext =
  section.slice(0, creatingAt) +
  `<h3>On a computer</h3>
        <p>${instruction}</p>
        ${button}
        <p>On iPhone, copy the code instead:</p>
        ` +
  section.slice(creatingAt);
html = html.slice(0, safariAt) + safariNext + html.slice(safariEnd);

html = once(
  html,
  `  document.querySelectorAll('.bm-code').forEach(code => {
    code.textContent = 'javascript:' + encodeURIComponent(scriptText);
  });`,
  `  const bookmarklet = 'javascript:' + encodeURIComponent(scriptText);
  document.querySelectorAll('.bm-code').forEach(code => {
    code.textContent = bookmarklet;
  });
  document.querySelectorAll('a.bm-drag').forEach(link => {
    link.setAttribute('href', bookmarklet);
  });`,
  'the bookmarklet filler script'
);

writeFileSync(path, html);
console.log('setup page: drag button shares the .bm-code bookmarklet');
