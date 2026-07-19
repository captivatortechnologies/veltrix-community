// @veltrix/shared — shared TypeScript contracts for Veltrix Community Edition.
//
// These types are the source of truth shared between the server, the client,
// and the app SDK. Server and client currently consume them via deep relative
// imports (e.g. `../../../../shared/types/app`); this barrel is an additive
// convenience so the same types can also be imported by package name
// (`@veltrix/shared`). Both resolve to the same declarations.

export * from './types/api'
export * from './types/app'
export * from './types/pipeline'
