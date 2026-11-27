// The headers every answer a Pages Function makes carries. Cloudflare applies `public/_headers` only to static files,
// so the functions set the same safety rules themselves; a test keeps the two equal.

export const SAFETY: Readonly<Record<string, string>> = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Content-Security-Policy':
    "default-src 'self'; script-src 'none'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'none'; frame-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
}

/** For the waitlist's pages and answers: their addresses can carry a token, so nothing keeps, passes on or lists them. */
export const PRIVATE: Readonly<Record<string, string>> = {
  'Cache-Control': 'no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex',
}

/** The response with the safety headers and the private ones set. */
export function guarded(response: Response): Response {
  const out = new Response(response.body, response)
  for (const [name, value] of Object.entries({ ...SAFETY, ...PRIVATE })) out.headers.set(name, value)
  return out
}

/** A redirect a browser follows with a GET (after a form post), to one of the site's own pages. */
export const seeOther = (path: string): Response =>
  guarded(new Response(null, { status: 303, headers: { Location: path } }))
