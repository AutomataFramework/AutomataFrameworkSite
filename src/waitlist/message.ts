// The one email the waitlist sends: "is this you?", with a link to confirm and a link to leave.

export const SENDER = 'hello@automataframework.com'

export interface Email {
  to: string
  subject: string
  text: string
  html: string
  headers: Record<string, string>
}

const escapeHtml = (text: string): string =>
  text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')

export function confirmation(to: string, origin: string, confirmToken: string, leaveToken: string): Email {
  const confirmUrl = `${origin}/waitlist/confirm/?t=${confirmToken}`
  const leaveUrl = `${origin}/waitlist/leave/?t=${leaveToken}`
  const why = `Someone, probably you, typed ${to} on automataframework.com.`
  return {
    to,
    subject: 'Confirm your place on the Automata list',
    text: [
      'Hello,',
      '',
      'Tap this link to join the Automata list:',
      confirmUrl,
      '',
      "We'll only write with news about Automata Framework.",
      '',
      `${why} If it wasn't you, ignore this email and we'll forget the address within a week.`,
      '',
      'To leave the list at any time:',
      leaveUrl,
    ].join('\n'),
    html: `<!doctype html>
<html lang="en"><body style="margin:0;padding:32px 24px;background:#112f2c;color:#fbe6a0;font:18px/1.5 system-ui,sans-serif">
<p>Hello,</p>
<p>Tap the button to join the Automata list.</p>
<p><a href="${escapeHtml(confirmUrl)}" style="display:inline-block;padding:14px 24px;border-radius:999px;background:#e2b540;color:#112f2c;font-weight:600;text-decoration:none">Yes, add me</a></p>
<p>We'll only write with news about Automata Framework.</p>
<p style="color:#b5af7d">${escapeHtml(why)} If it wasn't you, ignore this email and we'll forget the address within a week.</p>
<p style="color:#b5af7d"><a href="${escapeHtml(leaveUrl)}" style="color:#e2b540">Leave the list</a></p>
</body></html>`,
    // A mail app's own "unsubscribe" button, in one tap (RFC 8058).
    headers: {
      'List-Unsubscribe': `<${origin}/api/waitlist/leave?t=${leaveToken}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  }
}
