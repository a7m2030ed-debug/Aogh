import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter } from 'node:events';

/**
 * In-process event bus so modules stay decoupled (a module publishes an
 * event and never calls another module's service directly). Backed by
 * Node's EventEmitter for the MVP; the publish/subscribe shape here is
 * intentionally the same one Redis Streams/RabbitMQ would expose, so
 * swapping the implementation later doesn't change any calling module.
 */
@Injectable()
export class EventBusService {
  private readonly logger = new Logger(EventBusService.name);
  private readonly emitter = new EventEmitter();

  publish<T = unknown>(eventName: string, payload: T): void {
    this.logger.debug(`event published: ${eventName}`);
    this.emitter.emit(eventName, payload);
  }

  subscribe<T = unknown>(eventName: string, handler: (payload: T) => void): void {
    this.emitter.on(eventName, handler);
  }
}
