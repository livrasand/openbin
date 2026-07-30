import webpush from 'web-push';

export function initWebPush(): void {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || 'mailto:spaces@openbin.livrasand.com';
  if (publicKey && privateKey) {
    webpush.setVapidDetails(subject, publicKey, privateKey);
  }
}

export function getVapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY || null;
}

export function isWebPushConfigured(): boolean {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

initWebPush();

export async function sendPushNotification(
  endpoint: string,
  p256dh: string,
  auth: string,
  payload: string
): Promise<void> {
  if (!isWebPushConfigured()) return;
  try {
    await webpush.sendNotification(
      { endpoint, keys: { p256dh, auth } },
      payload,
      { TTL: 60 }
    );
  } catch (error) {
    console.error('Push notification failed:', error);
    throw error;
  }
}
