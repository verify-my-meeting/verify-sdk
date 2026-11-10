/**
 * The vCon endpoints of the ProofOfMeetProtocol API through the SDK client:
 * export a workspace as a signed vCon and read it, verify an export
 * against the service JWK Set, and import a vCon. The SDK itself carries
 * no vCon types (this package depends on it, not the other way round), so
 * these helpers are where the typed document meets the typed client.
 */
import type { Jwks, PompClient } from '@proofofmeet/sdk'

import { resolverFromJwks, unsignedFrom, verifyVcon } from './jws.js'
import type { VerifyResult } from './jws.js'
import type { SignedVcon, Vcon } from './types.js'

export type ExportVconOptions = {
  /** Sequence number or commit hash; the head commit by default. */
  commit?: string | number
}

export type ExportedVcon = {
  /** The JWS General JSON Serialization as served, for storing or verifying. */
  signed: SignedVcon
  /** The payload, read without verifying; call `verifyExport` to verify. */
  vcon: Vcon
}

/**
 * Fetch the owner-level vCon of a workspace (`GET /workspaces/:id/vcon`)
 * in its signed form and decode the payload.
 */
export async function exportVcon(
  client: PompClient,
  workspaceId: string,
  options: ExportVconOptions = {},
): Promise<ExportedVcon> {
  const signed = (await client.vcon.export(workspaceId, {
    commit: options.commit,
    form: 'signed',
  })) as SignedVcon
  return { signed, vcon: await unsignedFrom(signed) }
}

export type VerifyExportOptions = {
  /** A JWK Set already in hand, e.g. from `client.vcon.jwks()`. */
  jwks?: Jwks | { keys: Array<JsonWebKey & { kid?: string }> }
  /** Where to fetch the JWK Set, e.g. `https://proofofmeet.com/.well-known/jwks.json`. */
  jwksUrl?: string | URL
  fetch?: (input: string | URL, init?: RequestInit) => Promise<Response>
}

/**
 * Verify a signed export against the service keys: every signature whose
 * `kid` is in the set must verify and the `uuid` header must match the
 * payload. Pass `jwks` or `jwksUrl` (fetched with `fetch`, the global by
 * default). The result carries the decoded vCon when `ok`.
 */
export async function verifyExport(
  signed: SignedVcon,
  options: VerifyExportOptions,
): Promise<VerifyResult> {
  let jwks = options.jwks
  if (!jwks) {
    if (!options.jwksUrl) {
      throw new TypeError('verifyExport needs jwks or jwksUrl.')
    }
    const fetchImpl = options.fetch ?? ((input, init) => fetch(input, init))
    const response = await fetchImpl(options.jwksUrl, {
      headers: { accept: 'application/json' },
    })
    if (!response.ok) {
      return {
        ok: false,
        reason: `jwks: HTTP ${response.status} from ${String(options.jwksUrl)}`,
      }
    }
    jwks = (await response.json()) as Jwks
  }
  if (!jwks || !Array.isArray(jwks.keys)) {
    return { ok: false, reason: 'jwks: not a JWK Set' }
  }
  return verifyVcon(signed, resolverFromJwks(jwks))
}

export type ImportVconInput = {
  /** The unsigned form, or the signed form (its signature is checked server side). */
  vcon: Vcon | SignedVcon
  /** Commit onto this workspace instead of creating one from the document. */
  workspaceId?: string
  message?: string
}

/**
 * Import a vCon (`POST /vcon/import`). Without `workspaceId` a workspace is
 * created from the document (title from `subject`); with it, the parties
 * and documents are committed onto that workspace. Unknown `critical`
 * tokens are refused with `unsupported_extension`.
 */
export function importVcon(client: PompClient, input: ImportVconInput) {
  return client.vcon.import({
    vcon: input.vcon,
    workspaceId: input.workspaceId,
    message: input.message,
  })
}
