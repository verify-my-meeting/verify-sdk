import type { ApiErrorBody } from './types.js'

/** A non-2xx response from the ProofOfMeetProtocol API. */
export class PompApiError extends Error {
  readonly status: number
  readonly code: string
  readonly details: unknown
  readonly requestId: string | null

  constructor(input: {
    status: number
    code: string
    message: string
    details?: unknown
    requestId?: string | null
  }) {
    super(input.message)
    this.name = 'PompApiError'
    this.status = input.status
    this.code = input.code
    this.details = input.details
    this.requestId = input.requestId ?? null
  }

  static async fromResponse(response: Response): Promise<PompApiError> {
    let body: ApiErrorBody | null = null
    try {
      body = (await response.json()) as ApiErrorBody
    } catch {
      body = null
    }
    return new PompApiError({
      status: response.status,
      code: body?.error.code ?? `http_${response.status}`,
      message: body?.error.message ?? response.statusText ?? 'Request failed',
      details: body?.error.details,
      requestId: response.headers.get('x-request-id'),
    })
  }
}
