import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { PresignUploadDto } from './dto/presign-upload.dto';

const UPLOAD_URL_TTL_SECONDS = 5 * 60;

const EXTENSION_BY_CONTENT_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'application/pdf': 'pdf',
};

// Answers "does the photo → AI recognition → dealer confirms → publish
// flow need storage?" — yes: the photo has to persist past the AI call so
// every future customer browsing the listing can see it (spec sections
// 15, 20). This issues a short-lived presigned PUT URL so the mobile app
// uploads the file straight to the bucket (no giant multipart body
// through the API server), then hands back the permanent public URL the
// same photo will be shown at everywhere — including the AI-recognition
// call, which already expects a URL (see modules/ai/ai-vision.interface.ts).
@Injectable()
export class MediaService {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicBaseUrl: string;

  constructor(private readonly config: ConfigService) {
    this.bucket = this.config.get<string>('storage.bucket') ?? '';
    this.publicBaseUrl = (this.config.get<string>('storage.publicBaseUrl') ?? '').replace(/\/$/, '');
    this.client = new S3Client({
      region: this.config.get<string>('storage.region') ?? 'auto',
      endpoint: this.config.get<string>('storage.endpoint'),
      credentials: {
        accessKeyId: this.config.get<string>('storage.accessKeyId') ?? '',
        secretAccessKey: this.config.get<string>('storage.secretAccessKey') ?? '',
      },
      // Required by most non-AWS S3-compatible providers (R2, MinIO);
      // harmless against real AWS S3.
      forcePathStyle: true,
    });
  }

  async presignUpload(dto: PresignUploadDto) {
    const extension = EXTENSION_BY_CONTENT_TYPE[dto.contentType] ?? 'bin';
    const key = `${dto.category}/${randomUUID()}.${extension}`;

    const uploadUrl = await getSignedUrl(
      this.client,
      new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: dto.contentType }),
      { expiresIn: UPLOAD_URL_TTL_SECONDS },
    );

    return {
      uploadUrl,
      publicUrl: `${this.publicBaseUrl}/${key}`,
      key,
      expiresInSeconds: UPLOAD_URL_TTL_SECONDS,
    };
  }
}
