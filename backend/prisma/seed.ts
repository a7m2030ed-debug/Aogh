import { PrismaClient } from '@prisma/client';
import { vehicleMakes } from './seed-data/vehicles';

const prisma = new PrismaClient();

async function main() {
  for (const make of vehicleMakes) {
    // VehicleMake has no unique constraint on nameEn (only `id`), so this
    // is a manual find-or-create rather than a native Prisma upsert.
    const existingMake = await prisma.vehicleMake.findFirst({ where: { nameEn: make.nameEn } });
    const savedMake =
      existingMake ??
      (await prisma.vehicleMake.create({ data: { nameEn: make.nameEn, nameAr: make.nameAr } }));

    for (const model of make.models) {
      const existing = await prisma.vehicleModel.findFirst({
        where: { makeId: savedMake.id, nameEn: model.nameEn },
      });
      const savedModel =
        existing ??
        (await prisma.vehicleModel.create({
          data: { makeId: savedMake.id, nameEn: model.nameEn, nameAr: model.nameAr },
        }));

      const trimExists = await prisma.vehicleTrim.findFirst({
        where: { modelId: savedModel.id },
      });
      if (!trimExists) {
        await prisma.vehicleTrim.create({
          data: {
            modelId: savedModel.id,
            yearFrom: model.yearFrom ?? 1995,
            yearTo: model.yearTo ?? 2026,
          },
        });
      }
    }
  }

  const makeCount = await prisma.vehicleMake.count();
  const modelCount = await prisma.vehicleModel.count();
  // eslint-disable-next-line no-console
  console.log(`Seeded ${makeCount} makes, ${modelCount} models.`);
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
