# Valor Sports Academy

Marketing website for Valor Sports Academy — youth football training, all-sport athletic training, and adult personal training in Richland, WA.

Built and maintained by Playbook Marketing Studio.

## What this is

A static site (plain HTML + CSS, no build step). It can be hosted on any static host and edited directly.

## Structure

| File | Page |
|------|------|
| `index.html` | Home |
| `coaches.html` | Meet the Coaches |
| `programs.html` | Programs & Summer Camps |
| `contact.html` | Contact / Free Assessment |
| `styles.css` | Shared styles (the whole design system) |
| `sitemap.xml`, `robots.txt` | SEO |
| `getting-started.html` | Internal client kickoff sheet (not linked from the public nav) |
| `GO-LIVE.md` | Deployment + domain + editing guide |

## Deploy

Connect this repo to Netlify or Cloudflare Pages (free). No build command; publish directory is the repo root. Every push to `main` redeploys automatically. Full steps in `GO-LIVE.md`.

## Editing

Point Claude (Cowork or Claude Code) at this folder and describe the change in plain English. Commit and push, and the live site updates. Best for content edits — text, prices, photos, schedule.

## Notes

- Contact form is wired for Netlify Forms.
- Coach photos and logo currently load from Valor's Wix CDN; swap to self-hosted assets to be fully independent of Wix.
- No secrets belong in this repo. Deploy tokens live in the hosting provider, never in the code.
