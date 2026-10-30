import 'server-only';

export type SyncResult = { synced: boolean; skipped?: boolean; reason?: string };

export type SubscriberSync = {
  email: string | null;
  phone: string | null;
  name: string | null;
  consentEmail: boolean;
  consentWhatsapp: boolean;
  /** When they agreed, used as MailerLite's opt-in timestamp. */
  consentAt: Date;
};

/** MailerLite wants `yyyy-MM-dd HH:mm:ss`, not ISO 8601. */
function mailerliteDate(value: Date): string {
  return value.toISOString().slice(0, 19).replace('T', ' ');
}

/**
 * The channel-to-group mapping. The website sends `crm_lists` of
 * `news-list-email` and `news-list-whatsapp`; these two variables say which
 * MailerLite group each one is. Either may be unset, in which case the
 * subscriber is created without that group rather than rejected.
 */
function groupsFor(subscriber: SubscriberSync): string[] {
  const groups = [
    subscriber.consentEmail ? process.env.MAILERLITE_GROUP_EMAIL?.trim() : null,
    subscriber.consentWhatsapp ? process.env.MAILERLITE_GROUP_WHATSAPP?.trim() : null,
  ];
  return [...new Set(groups.filter((id): id is string => Boolean(id)))];
}

/**
 * Upsert a subscriber into MailerLite.
 *
 * Our own table is the durable record; this is the copy the marketing team
 * sends from. It never throws, and the caller records the outcome so a failed
 * sync is visible and can be retried rather than silently losing someone.
 */
export async function syncSubscriber(subscriber: SubscriberSync): Promise<SyncResult> {
  try {
    return await push(subscriber);
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Unknown error calling MailerLite.';
    return { synced: false, reason };
  }
}

async function push(subscriber: SubscriberSync): Promise<SyncResult> {
  const key = process.env.MAILERLITE_API_KEY?.trim();
  if (!key) return { synced: false, skipped: true, reason: 'MAILERLITE_API_KEY is not set.' };

  // MailerLite is keyed on email. Someone who chose WhatsApp only has no email
  // to sync, and that is not a failure: our table still holds their consent.
  if (!subscriber.email) {
    return { synced: false, skipped: true, reason: 'WhatsApp-only subscriber, nothing to sync.' };
  }

  // Only `name` is sent by default. A `fields` key that does not exist in the
  // account is rejected outright, and MailerLite's default field list is not
  // documented, so the phone field is named explicitly or left out.
  const phoneField = process.env.MAILERLITE_PHONE_FIELD?.trim();
  const fields: Record<string, string> = {};
  if (subscriber.name) fields.name = subscriber.name;
  if (phoneField && subscriber.phone) fields[phoneField] = subscriber.phone;

  const groups = groupsFor(subscriber);

  const response = await fetch('https://connect.mailerlite.com/api/subscribers', {
    method: 'POST',
    signal: AbortSignal.timeout(10_000),
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      email: subscriber.email,
      status: 'active',
      ...(Object.keys(fields).length > 0 ? { fields } : {}),
      ...(groups.length > 0 ? { groups } : {}),
      opted_in_at: mailerliteDate(subscriber.consentAt),
      // Deliberately absent: `resubscribe: true` would overturn an opt-out
      // made in MailerLite itself. Nothing an unauthenticated form receives
      // is good enough evidence to do that.
      resubscribe: false,
    }),
  });

  // 201 for a new subscriber, 200 when the email was already known.
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    return {
      synced: false,
      reason: `MailerLite returned ${response.status}${detail ? `: ${detail.slice(0, 300)}` : ''}.`,
    };
  }
  return { synced: true };
}
