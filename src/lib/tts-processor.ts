import type { Node as ProseMirrorNode } from 'prosemirror-model'

export interface TTSToken {
  index: number
  text: string
  textStart: number
  textEnd: number
  pmFrom: number
  pmTo: number
}

export interface TTSSnapshot {
  fullText: string
  tokens: TTSToken[]
  versionKey: string
}

const CONNECTIONS_JSON_MARKER_RE = /---\s*CONNECTIONS_JSON\s*---/i

export function buildTTSSnapshotFromDoc(doc: ProseMirrorNode): TTSSnapshot {
  let fullText = ''
  const tokens: TTSToken[] = []
  let currentToken: Omit<TTSToken, 'index'> | null = null
  let sawTextBlock = false

  const isEmojiChar = (char: string) => /[\p{Extended_Pictographic}\u200D\uFE0F]/u.test(char)

  const flushCurrentToken = () => {
    if (!currentToken) return
    tokens.push({
      index: tokens.length,
      text: currentToken.text,
      textStart: currentToken.textStart,
      textEnd: currentToken.textEnd,
      pmFrom: currentToken.pmFrom,
      pmTo: currentToken.pmTo,
    })
    currentToken = null
  }

  const pushChar = (char: string, pmFrom?: number, pmTo?: number) => {
    const textPos = fullText.length
    fullText += char

    if (/\S/.test(char) && typeof pmFrom === 'number' && typeof pmTo === 'number') {
      if (!currentToken) {
        currentToken = {
          text: char,
          textStart: textPos,
          textEnd: textPos + 1,
          pmFrom,
          pmTo,
        }
        return
      }

      currentToken.text += char
      currentToken.textEnd = textPos + 1
      currentToken.pmTo = pmTo
      return
    }

    flushCurrentToken()
  }

  const pushSpacer = () => {
    flushCurrentToken()
    if (!fullText || /\s$/.test(fullText)) return
    fullText += ' '
  }

  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true

    if (sawTextBlock) {
      pushChar('\n')
    }
    sawTextBlock = true

    node.descendants((child, childPos) => {
      if (child.isText) {
        const text = child.text || ''
        const absoluteStart = pos + 1 + childPos

        for (let i = 0; i < text.length; i += 1) {
          const char = text[i]
          if (isEmojiChar(char)) {
            pushSpacer()
            continue
          }
          pushChar(char, absoluteStart + i, absoluteStart + i + 1)
        }
        return false
      }

      if (child.type.name === 'hardBreak') {
        pushChar('\n')
        return false
      }

      return true
    })

    pushChar(' ')
    fullText = fullText.slice(0, -1)
    return false
  })

  flushCurrentToken()

  const markerMatch = CONNECTIONS_JSON_MARKER_RE.exec(fullText)
  if (markerMatch && typeof markerMatch.index === 'number') {
    const markerIndex = markerMatch.index
    fullText = fullText.slice(0, markerIndex).trimEnd()

    const trimmedTokens: TTSToken[] = []
    for (const token of tokens) {
      if (token.textStart >= markerIndex) break
      if (token.textEnd <= markerIndex) {
        trimmedTokens.push({
          ...token,
          index: trimmedTokens.length,
        })
        continue
      }

      const keepChars = Math.max(0, markerIndex - token.textStart)
      if (keepChars <= 0) break

      trimmedTokens.push({
        ...token,
        text: token.text.slice(0, keepChars),
        textEnd: markerIndex,
        index: trimmedTokens.length,
      })
      break
    }

    tokens.length = 0
    tokens.push(...trimmedTokens)
  }

  return {
    fullText,
    tokens,
    versionKey: JSON.stringify({
      fullText,
      tokenCount: tokens.length,
      firstPmFrom: tokens[0]?.pmFrom ?? -1,
      lastPmTo: tokens[tokens.length - 1]?.pmTo ?? -1,
    }),
  }
}

export function findTokenIndexByTextOffset(snapshot: TTSSnapshot, textOffset: number): number {
  const { tokens } = snapshot
  if (tokens.length === 0) return -1
  if (textOffset <= tokens[0].textStart) return 0

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i]
    if (textOffset < token.textEnd) return i

    const nextToken = tokens[i + 1]
    if (nextToken && textOffset < nextToken.textStart) {
      return i + 1
    }
  }

  return tokens.length - 1
}

export function findTokenIndexByPmPos(snapshot: TTSSnapshot, pmPos: number): number {
  const { tokens } = snapshot
  if (tokens.length === 0) return -1
  if (pmPos <= tokens[0].pmFrom) return 0

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i]
    if (pmPos < token.pmTo) return i

    const nextToken = tokens[i + 1]
    if (nextToken && pmPos < nextToken.pmFrom) {
      return i
    }
  }

  return tokens.length - 1
}

export function getSeekTextOffsetForPmPos(snapshot: TTSSnapshot, pmPos: number): number {
  const tokenIndex = findTokenIndexByPmPos(snapshot, pmPos)
  if (tokenIndex === -1) return 0
  return snapshot.tokens[tokenIndex].textStart
}
