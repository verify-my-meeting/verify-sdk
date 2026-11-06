/**
 * @verifymymeeting/sdk
 *
 * Typed client for the VerifyMyMeeting REST API, protocol types, and
 * browser-safe proof verification (RFC 8785 canonicalization, RFC 6962
 * Merkle trees, inclusion receipts, Ed25519 signatures).
 */
export const SDK_VERSION = '0.3.0'

export {
  buildAuthorizeUrl,
  createClient,
  createPkcePair,
  createState,
} from './client'
export type {
  ClientOptions,
  FetchLike,
  RateLimitInfo,
  VmmClient,
} from './client'
export { VmmApiError } from './errors'
export * from './types'
export * from './proofs/index'
