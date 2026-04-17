// Expo Push API wrapper. Accepts a batch so we don't hammer the endpoint
// one-at-a-time from send-notifications.
// Docs: https://docs.expo.dev/push-notifications/sending-notifications/

interface ExpoMessage {
  to: string;
  title: string;
  body?: string;
  data?: Record<string, unknown>;
  sound?: 'default';
}

export async function sendExpoPush(messages: ExpoMessage[]): Promise<void> {
  if (messages.length === 0) return;
  const res = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'accept-encoding': 'gzip, deflate',
      'content-type': 'application/json',
    },
    body: JSON.stringify(messages),
  });
  if (!res.ok) {
    const text = await res.text();
    console.error('Expo push failed', res.status, text);
  }
}
