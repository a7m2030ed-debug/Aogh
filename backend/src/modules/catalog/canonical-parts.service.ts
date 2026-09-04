import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateCanonicalPartDto } from './dto/create-canonical-part.dto';

@Injectable()
export class CanonicalPartsService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateCanonicalPartDto) {
    return this.prisma.canonicalPart.create({
      data: {
        categoryId: dto.categoryId,
        canonicalNameAr: dto.canonicalNameAr,
        canonicalNameEn: dto.canonicalNameEn,
        synonyms: dto.synonyms ?? [],
        oemNumbers: dto.oemNumbers ?? [],
      },
    });
  }

  findAll() {
    return this.prisma.canonicalPart.findMany({ include: { category: true } });
  }

  // Bulk import target for the "استيراد جماعي للمخزون" recommendation
  // (review section 5, item 2) — the seed data step is a CSV of rows like
  // canonicalNameAr,canonicalNameEn,synonyms,oemNumbers,categoryId.
  async bulkUpsertByEnglishName(
    rows: CreateCanonicalPartDto[],
  ): Promise<{ created: number }> {
    let created = 0;
    for (const row of rows) {
      const existing = await this.prisma.canonicalPart.findFirst({
        where: { canonicalNameEn: row.canonicalNameEn },
      });
      if (existing) continue;
      await this.create(row);
      created += 1;
    }
    return { created };
  }
}
