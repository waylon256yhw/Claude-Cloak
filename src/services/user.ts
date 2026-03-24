import { randomUUID, randomBytes } from 'node:crypto'

export function generateFakeUserId(): string {
  const deviceId = randomBytes(32).toString('hex')
  const sessionId = randomUUID()
  return JSON.stringify({ device_id: deviceId, account_uuid: '', session_id: sessionId })
}

export function isValidUserId(userId: string): boolean {
  try {
    const parsed = JSON.parse(userId)
    return typeof parsed.device_id === 'string' && typeof parsed.session_id === 'string'
  } catch {
    return /^user_[a-fA-F0-9]{64}_account_/.test(userId)
  }
}
