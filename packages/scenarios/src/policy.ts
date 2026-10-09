// The release's policy values, the built-in defaults (invariant 16; ADR-303): read by the API,
// where the setup service that creates a project takes them (apps/api's policy.ts; C53, ADR-316).
// A story's firm changes nothing in them, so every story's new project starts with what a release
// ships.
export { builtInPolicy } from '@open-adms/api';
