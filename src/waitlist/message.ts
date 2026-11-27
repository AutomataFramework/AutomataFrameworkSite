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

// Built for mail apps, not browsers: tables for layout, every style inline, the site's colours with its fonts first and
// the device's after them (most mail apps load no font files), and a button any app draws. The address is left out of the
// HTML, because mail apps turn it into a bright blue link; the words version keeps it.
const TITLE = "'Fraunces',Georgia,'Times New Roman',serif"
const LABEL = "'Onest',-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"

const html = (confirmUrl: string, leaveUrl: string): string => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark"><title>Confirm your place</title></head>
<body style="margin:0;padding:0;background:#112f2c">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">One tap and you are in.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#112f2c" style="background:#112f2c">
<tr><td align="center" style="padding:48px 20px 56px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px">
<tr><td style="padding:0 0 28px;border-bottom:1px solid #1f3a33;font:600 26px/1 ${TITLE};color:#fbe6a0">automata</td></tr>
<tr><td style="padding:44px 0 0;font:500 36px/1.15 ${TITLE};color:#fbe6a0">One tap and you\u2019re in.</td></tr>
<tr><td style="padding:18px 0 0;font:400 18px/1.55 ${LABEL};color:#b5af7d">Press the button to keep your place on the Automata list. We\u2019ll write when there is something to show, and only then.</td></tr>
<tr><td style="padding:32px 0 0"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td bgcolor="#e2b540" style="background:#e2b540;border-radius:2px"><a href="${confirmUrl}" style="display:inline-block;padding:17px 30px;font:600 17px/1 ${LABEL};color:#112f2c;text-decoration:none;border-radius:2px">Yes, add me</a></td>
</tr></table></td></tr>
<tr><td style="padding:36px 0 0;font:400 15px/1.55 ${LABEL};color:#b5af7d">Someone, probably you, typed this address on automataframework.com. If it wasn\u2019t you, ignore this email and we\u2019ll forget the address within a week.</td></tr>
<tr><td style="padding:44px 0 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-top:1px solid #1f3a33;padding:20px 0 0;font:400 14px/1.6 ${LABEL};color:#b5af7d">Team Automata<br><a href="${leaveUrl}" style="color:#e2b540;text-decoration:underline">Leave the list</a></td></tr></table></td></tr>
</table>
</td></tr></table>
</body></html>`

export function confirmation(to: string, origin: string, confirmToken: string, leaveToken: string): Email {
  const confirmUrl = `${origin}/waitlist/confirm/?t=${confirmToken}`
  const leaveUrl = `${origin}/waitlist/leave/?t=${leaveToken}`
  const why = `Someone, probably you, typed ${to} on automataframework.com.`
  return {
    to,
    subject: 'Confirm your place on the Automata list',
    text: [
      'One tap and you are in.',
      '',
      'Open this link to keep your place on the Automata list:',
      confirmUrl,
      '',
      "We'll write when there is something to show, and only then.",
      '',
      `${why} If it wasn't you, ignore this email and we'll forget the address within a week.`,
      '',
      'Team Automata',
      '',
      'To leave the list at any time:',
      leaveUrl,
    ].join('\n'),
    html: html(escapeHtml(confirmUrl), escapeHtml(leaveUrl)),
    // A mail app's own "unsubscribe" button, in one tap (RFC 8058).
    headers: {
      'List-Unsubscribe': `<${origin}/api/waitlist/leave?t=${leaveToken}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  }
}
