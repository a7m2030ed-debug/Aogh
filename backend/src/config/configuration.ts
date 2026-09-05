// Central place to read every external-service knob: push notifications,
// SMS/OTP, object storage. Modules that need one read it from here, so
// swapping a provider later is a one-file change.

const DEV_JWT_SECRET = 'dev-secret-change-me';

// The default secret is a convenience for local dev and a full account
// takeover anywhere else: anyone who knows it can mint a token for any
// user, including an ADMIN. Refusing to boot is the only safe response —
// a warning in a log nobody reads is how this ships to production.
function resolveJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (process.env.NODE_ENV === 'production' && (!secret || secret === DEV_JWT_SECRET)) {
    throw new Error(
      'JWT_SECRET must be set to a real random value in production. ' +
        'Generate one with: openssl rand -base64 48',
    );
  }
  return secret ?? DEV_JWT_SECRET;
}

export default () => ({
  port: parseInt(process.env.PORT ?? '3000', 10),
  databaseUrl: process.env.DATABASE_URL,
  jwt: {
    secret: resolveJwtSecret(),
    expiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
  },
  otp: {
    // Client decision: no paid maps/geocoding provider, and SMS is only
    // ever used for this OTP step — never for order/chat notifications
    // (those go through the notifications module + push, below).
    // "mock" | "taqnyat" (Saudi gateway — fastest path to sending to +966
    // numbers, since local sender-name registration is part of their
    // onboarding) | "twilio" (international).
    provider: process.env.OTP_PROVIDER ?? 'mock',
    taqnyatToken: process.env.TAQNYAT_TOKEN,
    taqnyatSender: process.env.TAQNYAT_SENDER,
    twilioAccountSid: process.env.TWILIO_ACCOUNT_SID,
    twilioAuthToken: process.env.TWILIO_AUTH_TOKEN,
    twilioFromNumber: process.env.TWILIO_FROM_NUMBER,
  },
  push: {
    // "none" ships an in-app-only NotificationsService (no external
    // delivery) — the client asked why push wasn't wired: it needs a
    // Firebase project (or another push gateway) created under the
    // client's own account, the same blocker as the SMS provider used to
    // be. See modules/notifications/push and backend/README.md.
    provider: process.env.PUSH_PROVIDER ?? 'none',
    fcmProjectId: process.env.FCM_PROJECT_ID,
    fcmClientEmail: process.env.FCM_CLIENT_EMAIL,
    fcmPrivateKey: process.env.FCM_PRIVATE_KEY,
  },
  storage: {
    // Any S3-compatible provider works (AWS S3, Cloudflare R2, MinIO for
    // local dev) — see src/modules/media. publicBaseUrl is what listing/
    // document URLs are built from after upload (a CDN domain, or the
    // bucket's own public endpoint); it's separate from `endpoint`
    // because the upload endpoint and the public read URL are often
    // different hosts (e.g. R2's private S3 endpoint vs. its public
    // r2.dev/custom domain).
    provider: process.env.STORAGE_PROVIDER ?? 's3-compatible',
    bucket: process.env.STORAGE_BUCKET,
    region: process.env.STORAGE_REGION ?? 'auto',
    endpoint: process.env.STORAGE_ENDPOINT,
    publicBaseUrl: process.env.STORAGE_PUBLIC_BASE_URL,
    accessKeyId: process.env.STORAGE_ACCESS_KEY_ID,
    secretAccessKey: process.env.STORAGE_SECRET_ACCESS_KEY,
  },
});
