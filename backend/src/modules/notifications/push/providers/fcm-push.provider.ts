import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { PushProvider } from '../push-provider.interface';

// Real push delivery. Activate with PUSH_PROVIDER=fcm + FCM_PROJECT_ID /
// FCM_CLIENT_EMAIL / FCM_PRIVATE_KEY in .env (a Firebase service account,
// downloaded from a Firebase project the client creates and owns — see
// backend/README.md). Nothing here works without that project existing;
// this class is only the plumbing for once it does.
//
// Firebase init is lazy (on first send(), not in the constructor):
// NestJS instantiates every provider listed in a module regardless of
// which one a factory ends up selecting (notifications.module.ts picks
// between this and NoopPushProvider based on config) — an eager
// initializeApp() here would throw on every boot whenever FCM_* isn't
// set, even for installs that only ever use the no-op provider.
@Injectable()
export class FcmPushProvider implements PushProvider {
  private readonly logger = new Logger(FcmPushProvider.name);

  constructor(private readonly config: ConfigService) {}

  private ensureInitialized() {
    if (getApps().length > 0) return;
    initializeApp({
      credential: cert({
        projectId: this.config.get<string>('push.fcmProjectId'),
        clientEmail: this.config.get<string>('push.fcmClientEmail'),
        // .env stores literal "\n" in the PEM string; FCM needs real newlines.
        privateKey: this.config.get<string>('push.fcmPrivateKey')?.replace(/\\n/g, '\n'),
      }),
    });
  }

  async send(deviceToken: string, title: string, body: string, data?: Record<string, string>): Promise<void> {
    try {
      this.ensureInitialized();
      await getMessaging().send({
        token: deviceToken,
        notification: { title, body },
        data,
      });
    } catch (error) {
      // A dead/expired device token is routine (uninstalled app, token
      // rotated) — log and move on, never let a push failure surface as
      // an error on the feature that triggered it (spec sections 21-23,
      // 32-34 all fire notifications as a side effect, not the main act).
      this.logger.warn(`FCM send failed for token ${deviceToken}: ${(error as Error).message}`);
    }
  }
}
