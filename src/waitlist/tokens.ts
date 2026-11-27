// The secrets in the email's links. Only their hashes are stored, so a copy of the database confirms or removes nobody.

/** 32 random bytes, written in base64url so it sits in a link as it is. */
export function newToken(): string {
  return base64url(crypto.getRandomValues(new Uint8Array(32)))
}

function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '')
}

/** SHA-256 of the token, in hex. */
export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

/** HMAC-SHA-256 of the message under the secret, in base64url: the same input always gives the same token. */
export async function hmac(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(message)))
  return base64url(signature)
}
