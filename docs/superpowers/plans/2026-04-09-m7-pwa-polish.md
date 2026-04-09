# M7 — PWA Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make HomeworkAI installable as a standalone PWA on Android Chrome (install prompt) and iOS Safari (Add to Home Screen), with offline shell caching via service worker.

**Architecture:** Single frontend track only — no backend changes. Enriches `vite.config.ts` PWA setup (already partially configured), generates icons, adds iOS meta tags to `index.html`, and creates an `InstallPrompt` component.

**Tech Stack:** vite-plugin-pwa (already installed), Workbox, sharp (for icon generation), React, Tailwind CSS.

**Spec:** `docs/superpowers/specs/2026-04-09-m7-pwa-polish-design.md`

---

## File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `packages/web/public/icons/icon-192.png` | 192×192 app icon |
| Create | `packages/web/public/icons/icon-512.png` | 512×512 app icon |
| Modify | `packages/web/index.html` | iOS meta tags, apple-touch-icon, theme-color |
| Modify | `packages/web/vite.config.ts` | Complete PWA manifest, Workbox NetworkFirst for /api/ |
| Create | `packages/web/src/components/InstallPrompt.tsx` | beforeinstallprompt banner |
| Modify | `packages/web/src/App.tsx` | Mount InstallPrompt |

---

## FRONTEND TRACK (single track)

---

### Task 1: Generate PWA icons

**Files:**
- Create: `packages/web/public/icons/icon-192.png`
- Create: `packages/web/public/icons/icon-512.png`

- [ ] **Step 1: Check if icons already exist**

```bash
ls packages/web/public/icons/ 2>/dev/null && echo "exists" || echo "missing"
```

If both PNG files exist and are valid images, skip to Task 2.

- [ ] **Step 2: Create icon generation script**

Create `packages/web/scripts/generate-icons.mjs` (temporary script, deleted after use):

```javascript
import sharp from 'sharp';
import { mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const iconsDir = join(__dirname, '..', 'public', 'icons');
mkdirSync(iconsDir, { recursive: true });

// Create a simple indigo circle with white "H" lettermark as SVG
function makeSvg(size) {
  const pad = Math.round(size * 0.15);
  const fontSize = Math.round(size * 0.55);
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${Math.round(size * 0.22)}" fill="#4f46e5"/>
  <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle"
        font-family="Arial,sans-serif" font-size="${fontSize}" font-weight="bold" fill="white">H</text>
</svg>`);
}

await sharp(makeSvg(192)).png().toFile(join(iconsDir, 'icon-192.png'));
await sharp(makeSvg(512)).png().toFile(join(iconsDir, 'icon-512.png'));

console.log('Icons generated: icon-192.png, icon-512.png');
```

- [ ] **Step 3: Run the script**

```bash
cd packages/web && node scripts/generate-icons.mjs
```

Expected output: `Icons generated: icon-192.png, icon-512.png`

- [ ] **Step 4: Verify icons exist**

```bash
ls -lh packages/web/public/icons/
```

Expected: two PNG files, each > 1KB.

- [ ] **Step 5: Delete the generation script (not needed in repo)**

```bash
rm packages/web/scripts/generate-icons.mjs && rmdir packages/web/scripts 2>/dev/null || true
```

- [ ] **Step 6: Commit icons**

```bash
git add packages/web/public/icons/
git commit -m "feat(m7): add PWA app icons (192×192 and 512×512)"
```

---

### Task 2: Add iOS meta tags to index.html

**Files:**
- Modify: `packages/web/index.html`

- [ ] **Step 1: Read current index.html**

```bash
cat packages/web/index.html
```

- [ ] **Step 2: Add iOS meta tags inside `<head>`**

In `packages/web/index.html`, add these lines inside `<head>` before the closing `</head>` tag:

```html
    <meta name="theme-color" content="#4f46e5" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <meta name="apple-mobile-web-app-title" content="HomeworkAI" />
    <link rel="apple-touch-icon" href="/icons/icon-192.png" />
```

- [ ] **Step 3: Commit**

```bash
git add packages/web/index.html
git commit -m "feat(m7): add iOS PWA meta tags and apple-touch-icon"
```

---

### Task 3: Complete vite.config.ts PWA configuration

**Files:**
- Modify: `packages/web/vite.config.ts`

The current vite.config.ts already has `VitePWA` with basic config. Replace the entire `VitePWA(...)` call with the enriched version:

- [ ] **Step 1: Update vite.config.ts**

In `packages/web/vite.config.ts`, replace the `VitePWA({...})` plugin configuration with:

```typescript
    VitePWA({
      registerType: 'autoUpdate',
      devOptions: { enabled: false }, // no service worker in dev
      includeAssets: ['icons/*.png'],
      manifest: {
        name: 'HomeworkAI',
        short_name: 'HomeworkAI',
        description: 'AI-powered homework checker for Singapore primary school students',
        display: 'standalone',
        start_url: '/',
        background_color: '#ffffff',
        theme_color: '#4f46e5',
        categories: ['education'],
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api/, /^\/uploads/],
        runtimeCaching: [
          {
            urlPattern: /^\/api\//,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              networkTimeoutSeconds: 5,
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
      },
    }),
```

- [ ] **Step 2: Verify build succeeds**

```bash
npm run build --workspace=packages/web 2>&1 | tail -10
```

Expected: build completes without errors; `packages/web/dist/` contains `sw.js` and `manifest.webmanifest`.

- [ ] **Step 3: Commit**

```bash
git add packages/web/vite.config.ts
git commit -m "feat(m7): complete PWA manifest and Workbox NetworkFirst config"
```

---

### Task 4: Create InstallPrompt component

**Files:**
- Create: `packages/web/src/components/InstallPrompt.tsx`
- Modify: `packages/web/src/App.tsx`

- [ ] **Step 1: Create InstallPrompt.tsx**

Create `packages/web/src/components/InstallPrompt.tsx`:

```typescript
import { useState, useEffect } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISSED_KEY = 'pwa-install-dismissed';

export function InstallPrompt() {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISSED_KEY) === 'true');

  useEffect(() => {
    function handler(e: Event) {
      e.preventDefault();
      setPromptEvent(e as BeforeInstallPromptEvent);
    }
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  if (!promptEvent || dismissed) return null;

  async function handleInstall() {
    if (!promptEvent) return;
    await promptEvent.prompt();
    const { outcome } = await promptEvent.userChoice;
    if (outcome === 'accepted' || outcome === 'dismissed') {
      setDismissed(true);
      localStorage.setItem(DISMISSED_KEY, 'true');
    }
  }

  function handleDismiss() {
    setDismissed(true);
    localStorage.setItem(DISMISSED_KEY, 'true');
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-indigo-600 text-white p-4 flex items-center justify-between gap-3 z-50 safe-area-inset-bottom">
      <div>
        <p className="font-semibold text-sm">Install HomeworkAI</p>
        <p className="text-xs text-indigo-200">Add to your home screen for quick access</p>
      </div>
      <div className="flex gap-2 shrink-0">
        <button
          onClick={handleInstall}
          className="bg-white text-indigo-600 text-sm font-semibold px-3 py-1.5 rounded-lg"
        >
          Install
        </button>
        <button onClick={handleDismiss} className="text-indigo-200 text-sm px-2" aria-label="Dismiss">
          ×
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Mount InstallPrompt in App.tsx**

In `packages/web/src/App.tsx`:

```typescript
import { InstallPrompt } from './components/InstallPrompt';
// Inside the return, at the very end before closing </AuthProvider>:
<InstallPrompt />
```

- [ ] **Step 3: Run web tests — expect PASS**

```bash
npm test --workspace=packages/web 2>&1 | grep -E "(PASS|FAIL)"
```

Expected: all PASS (InstallPrompt uses browser APIs not present in jsdom, but the component is not yet tested so no new failures).

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/components/InstallPrompt.tsx packages/web/src/App.tsx
git commit -m "feat(m7): InstallPrompt banner using beforeinstallprompt event"
```

---

## Smoke Test in Chrome

- [ ] Run: `npm run build --workspace=packages/web && npm run preview --workspace=packages/web`
- [ ] Open `http://localhost:4173` in Chrome
- [ ] Open DevTools → Application → Manifest → confirm name, icons, display: standalone appear correctly
- [ ] DevTools → Application → Service Workers → confirm service worker is registered
- [ ] Reload the page → service worker status shows "activated and is running"
- [ ] In Chrome address bar, click the install icon (circle with down arrow) → install the app
- [ ] Confirm app opens as standalone window (no browser chrome)
- [ ] In Chrome DevTools → Offline checkbox → reload → app shell loads (no blank page)
- [ ] Try navigating to `/dashboard` offline → app shell renders (API calls show error gracefully)
- [ ] On iOS Safari (or Simulator): open `http://<your-local-ip>:4173` → Share → "Add to Home Screen" → confirm icon appears
