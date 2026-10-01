import { z } from 'zod';

/*
 * The CSP forbids eval: zod must not even probe for it (Chrome reports the caught
 * `new Function` probe as a CSP violation). Object schemas run the probe when they are
 * created, so this must run before any module defines one: it is imported first in main.tsx
 * and bundled into zod's own vendor chunk (vite.config.ts), which loads before app chunks.
 */
z.config({ jitless: true });
