# Valor Sports Academy — Go-Live Guide

The site is a finished static build (this `valor-sports-academy` folder). It can be hosted as-is. Nothing needs to be rebuilt.

---

## Recommended setup: GitHub repo + auto-deploy

This path keeps the exact design and SEO, deploys automatically, and lets the site be edited later through Claude.

1. **Put the folder in a GitHub repo** (free account at github.com). Push the `valor-sports-academy` folder as a new repo.
2. **Connect the repo to Netlify or Cloudflare Pages** (both free). They detect the repo and deploy it. Build command: none. Publish directory: the repo root (or the folder).
3. **Every change pushed to the repo redeploys the live site automatically.**

### Simpler one-off alternative (no repo)
Go to **app.netlify.com/drop** and drag the whole folder onto the page. It's live instantly on a temporary `*.netlify.app` address. Make a free account to keep it. (You lose the auto-deploy + Claude-editing benefits, so the repo path above is better long term.)

---

## Connect the domain (keep it at Wix, just point it)

The domain `valorsportsacademywa.com` is registered at Wix. You don't have to move it.

1. In Netlify/Cloudflare: add the custom domain `valorsportsacademywa.com`. It gives you exact DNS records (or nameservers).
2. In the Wix domain settings: add those DNS records.
3. Wait for propagation (minutes to a few hours). HTTPS is issued automatically.

Note: pointing the domain to the new host means the old Wix site stops showing at that address. The Wix plan/domain stay paid; only what the address displays changes.

---

## Editing the site later with Claude

Once it's in a GitHub repo:

- Point **Cowork** (or Claude Code) at the repo folder and ask in plain English: "change the camp price," "swap the hero photo," "update the hours." Claude edits, commits, and the host redeploys.
- To let Valor self-edit, add them as a **collaborator** on the repo. They use their own Claude the same way.
- Best for content changes (text, prices, photos, schedule). Large redesigns still want a code-savvy hand.

---

## Contact form

Already wired for **Netlify Forms** (no backend needed). When hosted on Netlify, submissions appear in the dashboard under **Forms** — turn on email notifications to `valorsportsacademywa@gmail.com`. If you host on Cloudflare instead, the form needs a different handler (Formspree or similar); tell me and I'll switch it.

---

## Before running ads / the giveaway

Meta Pixel and Google tag aren't in yet. Send me the IDs and I'll paste the snippets into every page. (Reminder from the Wix research: these are normal here, no platform restrictions like Wix had.)

---

## One thing to harden later: images

The coach photos and logo currently load from Valor's Wix CDN. They keep working while the Wix plan is active, but to be fully independent of Wix, download the originals and I'll bundle them into the repo so the site owns its own assets.

---

## SEO finish (do after launch)

- Verify the domain in **Google Search Console**.
- Submit the sitemap: `valorsportsacademywa.com/sitemap.xml`.
- Confirm the **Google Business Profile** matches the site's name, address, phone, and hours exactly (big lever for local ranking).
