// Stand-in for frontend/src/components/planner/devMock.js (web dev tool behind
// /plan?mock=1). Shared api/planner.js imports it lazily, only when
// import.meta.env.DEV is true, which is always false in the app (src/shims/env.ts).
// Redirected here so Metro never bundles web component folders.
export async function mockPlan(): Promise<never> {
  throw new Error('The planner mock is web-only.')
}
