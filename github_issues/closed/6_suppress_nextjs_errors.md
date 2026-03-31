---
title: "[P3] Suppress Silent Next.js Errors (`_error.js` Missing)"
labels: ["priority: P3", "category: logging-monitoring", "bug", "enhancement"]
---

**Category:** Logging & Monitoring / Frontend
**Priority:** P3 - Optimization / clean-up

### Description
Spammed PM2 logs repeatedly write: `Cannot find module '/home/ubuntu/Web-App/.next/server/pages/_error.js'`. Next.js requires a customized `_error` routing fallback for unhandled application states. Without it, standard `404` or `500` HTTP requests fail to render appropriately on the frontend, blinding monitoring infrastructure with spam and offering horrible user-experiences.

### Acceptance Criteria
- Explicit custom exception handling route components (`pages/_error.js` or Next 13 `app/error.js`) exist inside the `Web-App`.
- Application correctly responds dynamically substituting `Cannot find module ...` PM2 noise for clean stack traces. 
- Build is regenerated and PM2 logs verify zero module loading drops.

### Technical Tasks
1. Implement minimal `_error.js` boundary page in Next.js structure.
2. Build via `npm run build` or the configured builder pipeline.
3. Reload PM2 process.

### Risks
None. Purely additive optimization.

### Dependencies
- **Issue #5** (Background loop fixes stop noise so frontend logs are readable).
