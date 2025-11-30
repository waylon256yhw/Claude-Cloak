import { randomUUID, randomBytes } from 'node:crypto'

export function generateFakeUserId(): string {
  const hexPart = randomBytes(32).toString('hex')
  const uuid = randomUUID()
  return `user_${hexPart}_account__session_${uuid}`
}

export function isValidUserId(userId: string): boolean {
  const pattern = /^user_[a-fA-F0-9]{64}_account__session_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  return pattern.test(userId)
}
