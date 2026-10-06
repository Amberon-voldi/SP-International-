# SP International Pvt Ltd — website

Static brochure site for **SP International Pvt Ltd** (motto: *Trade Beyond Borders*). The public pages lead with turmeric, red chilli powder, and cumin. More spices and brass / art-metal décor are in the on-request list on the products page (`products.html#brass`).

Preferred public domain: **spinternationalpvtltd.com**
A `CNAME` file is included for GitHub Pages. DNS must still be pointed at GitHub Pages by the domain owner — this file does not mean that step is already done.

## Open locally

From this folder:

```bash
python3 -m http.server 8080
```

Then open http://localhost:8080

You can also open `index.html` directly in a browser. The default quotation routes prepare email/WhatsApp drafts and do not need a backend. Configured on-site submission requires serving the website over HTTPS and connecting an approved service.

## Spice showcase and motion

The four pages share a navy/gold editorial design with a spice still-life hero, larger product photographs, clearly visible enquiry actions and responsive layouts. The new stock photography is locally hosted with responsive WebP/JPEG variants; sources and reuse terms are documented in [`assets/media/CREDITS.md`](assets/media/CREDITS.md). Stock images are illustrative—not evidence of SP's suppliers or inventory.

`js/motion.js` progressively adds floating spice details, a moving decorative spice strip, subtle desktop parallax, a scroll-progress indicator and staggered cinematic scroll reveals with depth, blur-to-sharp transitions and a subtle card sheen. **Pause motion** controls stop continuous motion and reveal all content. The site respects `prefers-reduced-motion`, suspends animation in background tabs, and remains readable when JavaScript or IntersectionObserver is unavailable. Quote controls are never hidden behind a scroll-reveal effect.

## Buyer quotation flow

- Home/catalogue cards offer **product-specific WhatsApp messages directly**, with no website form or contact typing required.
- The written-quote link preserves the selected product. Its form requires only **product, delivery country and email**.
- Name, company, phone, quantity and specifications are optional and shown in the form by default. Quantity defaults to kg; buyers can choose tonnes.
- The form's quick WhatsApp action requires only a product—even if the written-quote fields are incomplete.
- Buyers can review/copy the enquiry, including a manual-copy fallback when clipboard access is blocked.
- **Opening a draft does not send an enquiry.** With the default empty service configuration, the written route opens an email draft and the buyer must press Send in their app. The site does not save that draft or collect leads automatically.
- Mobile pages have persistent quote/WhatsApp shortcuts. Direct contact links remain available without JavaScript.

## Connecting on-site quotation delivery

`js/quote-config.js` deliberately ships with an **empty endpoint**. No external account was registered, provider selected, inbox activated or real lead delivered as part of this change. This repository remains deployable to GitHub Pages without a backend.

To enable a direct on-site submit:

1. Connect an owner-approved HTTPS form endpoint and configure its receiving inbox/lead handling, origin permissions, spam protection and retention policy.
2. Ensure it accepts a CORS-enabled JSON POST with the fields documented in `js/quote-config.js` and returns **2xx JSON `{ "received": true }` only after accepting the request**. An arbitrary Formspree or other provider URL may need an adapter to this contract; do not assume it works without verification.
3. Put only the **public form URL** in `SP_QUOTE_CONFIG.endpoint`. Never put API keys, passwords or service credentials in client-side files.
4. Publish the actual provider/privacy details before enabling it for buyers, and verify that a real authorized enquiry is received by the desk.

When connected, the UI shows **Send quote request**, prevents duplicate submits while pending/after acknowledgement, and preserves email/WhatsApp/copy fallbacks on network, service or timeout errors. Receipt is shown only after service acknowledgement—not merely when a button is clicked. Service acknowledgement alone is not proof of inbox delivery. The checks use a local fixture, not the business's live inbox.

## Checks

No build step, package installation, or test dependency is required. JavaScript syntax and whitespace checks:

```bash
node --check js/main.js
node --check js/motion.js
node --check js/quote-config.js
git diff --check
```

The browser smoke checks require **Node 22+ and Google Chrome**:

```bash
node --test tests/quotation-smoke.mjs
```

The default Chrome path is the macOS application. On another platform, set `CHROME_PATH` to the browser executable. Optional screenshots can be saved outside the repository:

```bash
SCREENSHOT_DIR=/tmp/sp-site-check node --test tests/quotation-smoke.mjs
```

The checks start their own local server and isolated headless browser, then clean them up. They exercise responsive layouts, local links/images, contextual WhatsApp links, product preselection, compact-form validation, optional buying details, draft/copy fallbacks, motion/reduced-motion behavior and no-JavaScript visibility. Configured submissions are tested only against a loopback fixture, including acknowledgement, duplicate protection, errors and timeout recovery. WhatsApp navigation is blocked; test enquiries are never delivered externally. The checks do not prove production email delivery, WhatsApp delivery, search rankings or live-domain availability.

## Quotation-flow research

See [`docs/quotation-flow-research.md`](docs/quotation-flow-research.md) for the 10-site Indian spice supplier benchmark, source pages, observed form requirements, and recommended low-friction WhatsApp / on-site quotation flows. Research findings are not conversion-rate evidence. The redesign implements contextual WhatsApp messages and compact written enquiries; actual on-site receipt still needs the owner-connected endpoint described above.

## Reach: owner follow-up

The site includes product-focused metadata, business structured data, useful buyer guidance, `robots.txt` and a sitemap. These help search engines understand the pages but do not guarantee traffic or quotation volume.

1. Verify that the preferred domain serves all pages over HTTPS in GitHub Pages and DNS settings.
2. Verify the domain in Google Search Console and Bing Webmaster Tools, then submit `https://spinternationalpvtltd.com/sitemap.xml`.
3. Use consistent company/contact details in genuine owner-controlled business and trade profiles.
4. Measure qualified enquiries actually received by the desk, not just draft opens. Automatic lead storage or submission analytics requires a separately configured service and an appropriate privacy policy.

## GitHub Pages (XashVenom/SP-International-)

1. Put the contents of this folder at the **root** of https://github.com/XashVenom/SP-International- on the default branch (`main`).
2. In the repo: **Settings → Pages**.
3. Source: **Deploy from a branch** → `main` → `/ (root)` → Save.
4. After the first deploy, the site is served from GitHub Pages on that repository.
5. Custom domain: in Pages, enter `spinternationalpvtltd.com`. The `CNAME` file in this folder matches that name. Point the domain DNS at GitHub Pages when you are ready; do not assume it is already live.

No build step. No cart. No bundled server-side form handler; an optional owner-connected HTTPS quotation service is configurable.

## Pages

- `index.html` — Home
- `products.html` — Hero products + on-request spice list
- `about.html` — Merchant trader, Sikandrabad, Uttar Pradesh
- `contact.html` — Quote form, email, WhatsApp

## Contact (on the site)

- Email: info@spinternationalpvtltd.com
- WhatsApp: +91 9286492989
- Location: Sikandrabad, Uttar Pradesh
