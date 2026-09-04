// Central place to read every external-service knob mentioned in the spec
// (section 7.6): push notifications, SMS/OTP, object storage, AI vision.
// No maps/geocoding provider — the client opted out; distance search
// (common/geo/haversine.ts) still works off plain lat/lng, which the
// mobile app is expected to read from the device's own GPS permission,
// not a paid maps SDK. Nothing here talks to those services yet — modules
// that need one read it from here so swapping a provider later is a
// one-file change.

export default () => ({
  port: parseInt(process.env.PORT ?? '3000', 10),
  databaseUrl: process.env.DATABASE_URL,
  jwt: {
    secret: process.env.JWT_SECRET ?? 'dev-secret-change-me',
    expiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
  },
  otp: {
    // Client decision: no paid maps/geocoding provider, and SMS is only
    // ever used for this OTP step — never for order/chat notifications
    // (those go through the notifications module + push, below).
    provider: process.env.OTP_PROVIDER ?? 'mock',
  },
  push: {
    provider: process.env.PUSH_PROVIDER ?? 'fcm',
    credentialsPath: process.env.PUSH_CREDENTIALS_PATH,
  },
  storage: {
    provider: process.env.STORAGE_PROVIDER ?? 's3-compatible',
    bucket: process.env.STORAGE_BUCKET,
    region: process.env.STORAGE_REGION,
    endpoint: process.env.STORAGE_ENDPOINT,
    accessKeyId: process.env.STORAGE_ACCESS_KEY_ID,
    secretAccessKey: process.env.STORAGE_SECRET_ACCESS_KEY,
  },
  aiVision: {
    provider: process.env.AI_VISION_PROVIDER ?? 'mock',
    apiKey: process.env.AI_VISION_API_KEY,
  },
});
