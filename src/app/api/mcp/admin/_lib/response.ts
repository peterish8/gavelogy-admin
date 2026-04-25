import { NextResponse } from 'next/server'

export type ApiErrorCode =
  | 'BAD_REQUEST'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'PAYLOAD_TOO_LARGE'
  | 'INTERNAL_ERROR'

export class ApiError extends Error {
  status: number
  code: ApiErrorCode

  constructor(status: number, code: ApiErrorCode, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

export function noStoreHeaders(): Record<string, string> {
  return { 'Cache-Control': 'no-store' }
}

export function jsonSuccess(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: noStoreHeaders() })
}

export function jsonError(status: number, code: ApiErrorCode, message: string, details?: unknown) {
  const payload: Record<string, unknown> = { error: { code, message } }
  if (details !== undefined) payload.error_details = details
  return NextResponse.json(payload, { status, headers: noStoreHeaders() })
}

export function fromUnknownError(error: unknown) {
  if (error instanceof ApiError) {
    return jsonError(error.status, error.code, error.message)
  }

  const message = error instanceof Error ? error.message : 'Internal server error'

  if (message.toLowerCase().includes('not found')) {
    return jsonError(404, 'NOT_FOUND', message)
  }

  if (message.toLowerCase().includes('invalid')) {
    return jsonError(400, 'BAD_REQUEST', message)
  }

  if (message.toLowerCase().includes('unauthorized')) {
    return jsonError(401, 'UNAUTHORIZED', message)
  }

  return jsonError(500, 'INTERNAL_ERROR', message)
}
