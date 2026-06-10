// Single place that bridges the app's `@/` source tree to the generated Convex
// API (which lives in `convex/_generated`, outside `src/`). Import `api` from
// here so the relative path lives in exactly one file.
export { api } from "../../convex/_generated/api";
