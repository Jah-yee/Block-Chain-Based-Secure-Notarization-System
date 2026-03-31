# ISSUE-003: SSR Hydration Mismatch (Next.js)

## Description
The Web App (Next.js) uses Server-Side Rendering (SSR). If the Server-Side render uses the build-time `.env` IP but the Client-Side hydrator fetches a different runtime IP from the API, React will throw a Hydration Mismatch error.

## Impact
- Flash of Unstyled Content (FOUC).
- Broken interactive elements on the home page.
- Performance degradation.

## Proposed Resolution
- Isolate all Configuration logic to a `ClientConfigProvider`.
- Use a `useEffect` hook to pulse the Backend API for config **after** the first render.
- Ensure no "Server Actions" or SSR components rely on the dynamic IP; they should use internal service-to-service communication only.
