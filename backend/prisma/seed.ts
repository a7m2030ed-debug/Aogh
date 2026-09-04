import { PrismaClient } from '@prisma/client';
import { vehicleMakes } from './seed-data/vehicles';
import { partCategories } from './seed-data/parts';

const prisma = new PrismaClient();

async function seedVehicles() {
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

// Canonical parts taxonomy (docs/project-brief.md flags this as the
// single most important seed — see prisma/seed-data/parts.ts). Category
// tree is find-or-create the same way makes/models are: PartCategory has
// no unique constraint on (parentId, nameEn), so this is manual, not a
// native Prisma upsert.
async function seedParts() {
  for (const category of partCategories) {
    const existingTop = await prisma.partCategory.findFirst({
      where: { parentId: null, nameEn: category.nameEn },
    });
    const savedTop =
      existingTop ??
      (await prisma.partCategory.create({
        data: { nameEn: category.nameEn, nameAr: category.nameAr },
      }));

    for (const sub of category.subcategories) {
      const existingSub = await prisma.partCategory.findFirst({
        where: { parentId: savedTop.id, nameEn: sub.nameEn },
      });
      const savedSub =
        existingSub ??
        (await prisma.partCategory.create({
          data: { parentId: savedTop.id, nameEn: sub.nameEn, nameAr: sub.nameAr },
        }));

      for (const part of sub.parts) {
        const existingPart = await prisma.canonicalPart.findFirst({
          where: { categoryId: savedSub.id, canonicalNameEn: part.nameEn },
        });
        if (!existingPart) {
          await prisma.canonicalPart.create({
            data: {
              categoryId: savedSub.id,
              canonicalNameEn: part.nameEn,
              canonicalNameAr: part.nameAr,
              synonyms: part.synonyms ?? [],
            },
          });
        }
      }
    }
  }

  const categoryCount = await prisma.partCategory.count();
  const partCount = await prisma.canonicalPart.count();
  // eslint-disable-next-line no-console
  console.log(`Seeded ${categoryCount} part categories, ${partCount} canonical parts.`);
}

async function main() {
  await seedVehicles();
  await seedParts();
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
