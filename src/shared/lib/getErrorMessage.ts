import axios from 'axios'

interface FrappeErrorPayload {
  message?: string
  _server_messages?: string
}

const parseServerMessage = (serverMessages?: string): string | null => {
  if (!serverMessages) {
    return null
  }

  try {
    const parsed = JSON.parse(serverMessages) as string[]
    const firstMessage = parsed[0]

    if (!firstMessage) {
      return null
    }

    try {
      const structuredMessage = JSON.parse(firstMessage) as { message?: string }
      return structuredMessage.message?.replace(/<[^>]+>/g, '').trim() || null
    } catch {
      return firstMessage
    }
  } catch {
    return null
  }
}

export const getErrorMessage = (error: unknown, fallback: string): string => {
  if (axios.isAxiosError(error)) {
    const payload = error.response?.data as FrappeErrorPayload | undefined
    const message =
      parseServerMessage(payload?._server_messages) || payload?.message || error.message

    if (error.code === 'ERR_NETWORK') {
      return 'Unable to reach the ERPNext server right now.'
    }

    return message || fallback
  }

  return fallback
}
