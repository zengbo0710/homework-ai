# M7 — PWA Polish Spec

> Full design reference: [master spec §Section 8](./2026-04-09-m3-m9-ai-records-practice-reports-pwa-deploy-design.md#section-8-m7--pwa-polish)

## Goal

Make HomeworkAI installable as a PWA on iOS Safari and Android Chrome: complete manifest, service worker with offline shell caching, and an install prompt banner.

## What's Already Done

- `vite-plugin-pwa` installed in `packages/web/package.json`
- Basic VitePWA config in `vite.config.ts` (manifest, icons config, workbox glob patterns)
- PWA icons referenced but icon files may not exist yet (`public/icons/icon-192.png`, `public/icons/icon-512.png`)

## Files Changed

| Action | Path | Purpose |
|--------|------|---------|
| Verify/Create | `packages/web/public/icons/icon-192.png` | 192×192 app icon |
| Verify/Create | `packages/web/public/icons/icon-512.png` | 512×512 app icon |
| Modify | `packages/web/index.html` | Add iOS meta tags (`apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style`, `apple-touch-icon`, `theme-color`) |
| Modify | `packages/web/vite.config.ts` | Enrich PWA manifest (description, categories, screenshots); confirm Workbox NetworkFirst for `/api/` |
| Create | `packages/web/src/components/InstallPrompt.tsx` | Dismissible install banner using `beforeinstallprompt` event |
| Modify | `packages/web/src/App.tsx` | Mount `<InstallPrompt />` inside the app shell |

## Key Decisions

- **Icons**: Generate two simple SVG-based PNG icons (indigo background, white "H" lettermark). Use sharp or canvas in a one-off script, or use a pre-generated PNG
- **iOS**: iOS does not fire `beforeinstallprompt`; the install banner is Android/Chrome only. iOS users are guided via a "Share → Add to Home Screen" tooltip shown on first visit (static UI hint, not event-based)
- **Offline strategy**: Cache-first for app shell assets (JS/CSS/HTML); NetworkFirst with 5s timeout for `/api/*`. On API timeout offline, show a graceful "No internet connection" message
- **InstallPrompt**: Stores `pwa-install-dismissed` in localStorage; does not show again once dismissed. Shows as a bottom banner with "Install App" and "×" buttons
- **No service worker in dev**: Vite PWA plugin only registers the service worker in `vite build` output; dev server uses `mode: 'development'` bypass

## Out of Scope

- Web Push notifications
- Background sync for offline submission queuing
- Custom splash screens (iOS uses icon + background color automatically)

## Done Criteria

- [ ] `npm run build && npm run preview` → Lighthouse PWA score ≥ 90
- [ ] Chrome DevTools → Application → Manifest shows correct name, icons, display: standalone
- [ ] Chrome address bar shows "Install" icon; clicking installs app to desktop
- [ ] App opens in standalone mode (no browser chrome) after install
- [ ] Navigating to `/` offline shows app shell (not blank page)
- [ ] API calls offline show graceful error, not crash
- [ ] iOS: visiting in Safari → Share sheet → "Add to Home Screen" works; app icon appears
