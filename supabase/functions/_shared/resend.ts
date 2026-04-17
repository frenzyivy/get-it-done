// Resend wrapper. Thin — the SDK would work too but direct fetch keeps the
// Edge Function bundle small.
// Docs: https://resend.com/docs/api-reference/emails/send-email

interface EmailMessage {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail(msg: EmailMessage): Promise<void> {
  const key = Deno.env.get('RESEND_API_KEY');
  const from = Deno.env.get('RESEND_FROM') ?? 'Get-it-done <notifications@getitdone.app>';
  if (!key) {
    console.warn('RESEND_API_KEY not set — skipping email');
    return;
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to: msg.to, subject: msg.subject, html: msg.html }),
  });
  if (!res.ok) {
    const text = await res.text();
    console.error('Resend failed', res.status, text);
  }
}
