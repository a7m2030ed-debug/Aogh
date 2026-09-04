import { Controller, Get, NotFoundException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Single source of truth: backend/legal/*.md. Served as plain text so the
// mobile app (or any future admin web dashboard) always shows whatever is
// currently on disk — editing the .md file is the entire "publish a policy
// update" workflow, no redeploy of app copy needed for wording changes.
const LEGAL_DIR = join(__dirname, '..', '..', '..', 'legal');

@ApiTags('legal')
@Controller('legal')
export class LegalController {
  @Get('privacy-policy')
  privacyPolicy() {
    return { content: this.read('privacy-policy-ar.md') };
  }

  @Get('terms-of-use')
  termsOfUse() {
    return { content: this.read('terms-of-use-ar.md') };
  }

  private read(fileName: string): string {
    try {
      return readFileSync(join(LEGAL_DIR, fileName), 'utf-8');
    } catch {
      throw new NotFoundException(`Legal document not found: ${fileName}`);
    }
  }
}
