// Composites the Shellgrounds wordmark over generated art.
// The art comes from an image model; the TEXT does not. A model that misspells
// a wordmark ships that misspelling forever, and brand colours drift by a few
// percent every generation. So the lettering is laid down here, in the
// product's own typeface and its own hex values.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const [,, artPath, outPath, variant = 'dark'] = process.argv;
const art = 'data:image/png;base64,' + fs.readFileSync(artPath).toString('base64');

const T = variant === 'dark'
  ? { ground: '#1a1a1a', ink: '#d4b483', sub: '#8a8578', cursor: '#4ade80', scrim: '26,26,26' }
  : { ground: '#f5f1e8', ink: '#6b5636', sub: '#7a7266', cursor: '#149063', scrim: '245,241,232' };

const html = `<!doctype html><html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;800&display=swap" rel="stylesheet">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { width:2400px; height:600px; background:${T.ground}; overflow:hidden; }
  .banner { position:relative; width:2400px; height:600px; }
  .art {
    /* The element is sized to where the art actually renders, so the fade
       below lands on the art's real right edge rather than 400px past it. */
    position:absolute; left:0; top:0; width:48%; height:100%;
    /* contain, not cover: the art is 16:9 and the banner is 4:1, so cover
       crops the snail's top and bottom off. contain fits it by height and
       leaves it sitting in the left 44%, which is where it belongs anyway. */
    object-fit:contain; object-position:left center;
    /* The generated ground is never exactly the token value, so the art's right
       edge leaves a visible tonal seam against the page. Fade it out instead of
       trying to match a colour a model chose. */
    -webkit-mask-image:linear-gradient(90deg, #000 0%, #000 55%, transparent 97%);
    mask-image:linear-gradient(90deg, #000 0%, #000 55%, transparent 97%);
    /* Light variant: invert the dark art, then MULTIPLY it over the warm
       ground. Invert alone leaves a cool near-white that reads as a grey panel
       stuck on a cream page; multiply lets the inverted ground vanish into
       whatever colour is behind it, seam and all. */
    ${variant === 'light'
      ? 'filter: invert(1) hue-rotate(180deg) saturate(1.1); mix-blend-mode: multiply;'
      : ''}
  }
  /* A scrim under the type, so contrast is guaranteed rather than hoped for:
     the art has thin rules running through the space the wordmark occupies. */
  .scrim {
    position:absolute; inset:0;
    background:linear-gradient(90deg,
      rgba(${T.scrim},0) 0%, rgba(${T.scrim},0) 40%,
      rgba(${T.scrim},0.55) 50%, rgba(${T.scrim},0.72) 100%);
  }
  .type {
    position:absolute; left:47%; top:50%; transform:translateY(-50%);
    font-family:'JetBrains Mono', monospace; color:${T.ink};
  }
  h1 {
    font-size:118px; font-weight:800; letter-spacing:-0.045em; line-height:1;
    display:flex; align-items:center; gap:22px;
  }
  .cursor {
    display:inline-block; width:34px; height:92px; border-radius:7px;
    background:${T.cursor};
  }
  p {
    margin-top:28px; font-size:40px; font-weight:400; color:${T.sub};
    letter-spacing:-0.01em;
  }
</style></head><body>
  <div class="banner">
    <img class="art" src="${art}" alt="">
    <div class="scrim"></div>
    <div class="type">
      <h1>Shellgrounds<span class="cursor"></span></h1>
      <p>Learn the command line, one find at a time.</p>
    </div>
  </div>
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 2400, height: 600 }, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(400);
fs.mkdirSync(path.dirname(outPath), { recursive: true });
await page.screenshot({ path: outPath });
await browser.close();
console.log('  wrote', outPath, `(${Math.round(fs.statSync(outPath).size/1024)} KB, ${variant})`);
