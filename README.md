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

You can also open `index.html` directly in a browser. The quote form drafts a mailto message and does not need a backend.

## GitHub Pages (XashVenom/SP-International-)

1. Put the contents of this folder at the **root** of https://github.com/XashVenom/SP-International- on the default branch (`main`).
2. In the repo: **Settings → Pages**.
3. Source: **Deploy from a branch** → `main` → `/ (root)` → Save.
4. After the first deploy, the site is served from GitHub Pages on that repository.
5. Custom domain: in Pages, enter `spinternationalpvtltd.com`. The `CNAME` file in this folder matches that name. Point the domain DNS at GitHub Pages when you are ready; do not assume it is already live.

No build step. No cart. No server-side form handler.

## Pages

- `index.html` — Home
- `products.html` — Hero products + on-request spice list
- `about.html` — Merchant trader, Sikandrabad, Uttar Pradesh
- `contact.html` — Quote form, email, WhatsApp

## Contact (on the site)

- Email: info@spinternationalpvtltd.com
- WhatsApp: +91 9286492989
- Location: Sikandrabad, Uttar Pradesh
