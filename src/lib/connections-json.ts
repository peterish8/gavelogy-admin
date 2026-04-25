const CONNECTIONS_JSON_MARKER_RE = /---\s*CONNECTIONS_JSON\s*---/i

export function hasConnectionsJsonMarker(raw: string): boolean {
  return CONNECTIONS_JSON_MARKER_RE.test(raw)
}

export function splitConnectionsPayload(raw: string): { formatted: string; jsonPart: string | null } {
  const match = CONNECTIONS_JSON_MARKER_RE.exec(raw)
  if (!match || typeof match.index !== 'number') {
    return { formatted: raw.trim(), jsonPart: null }
  }

  const formatted = raw.slice(0, match.index).trim()
  const jsonPart = raw.slice(match.index + match[0].length).trim()
  return { formatted, jsonPart }
}

export function stripConnectionsTail(raw: string): string {
  return splitConnectionsPayload(raw).formatted
}

function stripCodeFences(value: string): string {
  return value
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
}

function extractFirstJsonArray(value: string): string | null {
  const start = value.indexOf('[')
  if (start === -1) return null

  let depth = 0
  let inString = false
  let escaped = false

  for (let i = start; i < value.length; i += 1) {
    const ch = value[i]

    if (inString) {
      if (escaped) {
        escaped = false
        continue
      }
      if (ch === '\\') {
        escaped = true
        continue
      }
      if (ch === '"') {
        inString = false
      }
      continue
    }

    if (ch === '"') {
      inString = true
      continue
    }
    if (ch === '[') {
      depth += 1
      continue
    }
    if (ch === ']') {
      depth -= 1
      if (depth === 0) {
        return value.slice(start, i + 1)
      }
    }
  }

  return null
}

export function parseConnectionsJsonPart(jsonPart: string | null): any[] {
  if (!jsonPart) return []

  const cleaned = stripCodeFences(jsonPart)
  const candidate = extractFirstJsonArray(cleaned) ?? cleaned

  try {
    const parsed = JSON.parse(candidate)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

