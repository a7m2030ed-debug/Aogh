import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class VehiclesService {
  constructor(private readonly prisma: PrismaService) {}

  findMakes() {
    return this.prisma.vehicleMake.findMany({ include: { models: true } });
  }

  findModelsByMake(makeId: string) {
    return this.prisma.vehicleModel.findMany({ where: { makeId } });
  }
}
