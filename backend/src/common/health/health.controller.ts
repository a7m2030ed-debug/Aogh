import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';

// What a hosting platform polls to decide whether this instance is
// serving. It checks the database too, on purpose: a process that is up
// but can't reach Postgres serves errors on every real request, and a
// health check that only proves "node is running" would call that
// healthy and route traffic to it.
@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check() {
    await this.prisma.$queryRaw`SELECT 1`;
    return { status: 'ok' };
  }
}
