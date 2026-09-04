import { Injectable, Logger } from '@nestjs/common';
import { PushProvider } from '../push-provider.interface';

@Injectable()
export class NoopPushProvider implements PushProvider {
  private readonly logger = new Logger(NoopPushProvider.name);

  async send(deviceToken: string, title: string): Promise<void> {
    this.logger.debug(`(no push provider configured) would send "${title}" to ${deviceToken}`);
  }
}
