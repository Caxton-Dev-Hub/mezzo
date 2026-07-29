import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Readable } from 'node:stream';
import { StorageProvider } from './storage-provider.interface';
import { EvidenceObjectNotFoundError } from '../errors/evidence-object-not-found.error';

@Injectable()
export class S3StorageProvider implements StorageProvider, OnModuleInit {
  private readonly logger = new Logger(S3StorageProvider.name);
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly presignExpirySeconds: number;

  constructor(configService: ConfigService) {
    this.bucket = configService.getOrThrow<string>('S3_BUCKET');
    this.presignExpirySeconds = configService.getOrThrow<number>('S3_PRESIGN_EXPIRY_SECONDS');
    this.client = new S3Client({
      region: configService.getOrThrow<string>('S3_REGION'),
      endpoint: configService.getOrThrow<string>('S3_ENDPOINT'),
      forcePathStyle: configService.getOrThrow<boolean>('S3_FORCE_PATH_STYLE'),
      credentials: {
        accessKeyId: configService.getOrThrow<string>('S3_ACCESS_KEY_ID'),
        secretAccessKey: configService.getOrThrow<string>('S3_SECRET_ACCESS_KEY'),
      },
    });
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
    } catch (error) {
      const code = error instanceof S3ServiceException ? error.name : undefined;
      if (code !== 'BucketAlreadyOwnedByYou' && code !== 'BucketAlreadyExists') {
        this.logger.warn(`Could not ensure evidence bucket "${this.bucket}" exists: ${String(error)}`);
      }
    }
  }

  getPresignedUploadUrl(key: string, contentType: string): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
    });
    return getSignedUrl(this.client, command, { expiresIn: this.presignExpirySeconds });
  }

  getPresignedDownloadUrl(key: string): Promise<string> {
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    return getSignedUrl(this.client, command, { expiresIn: this.presignExpirySeconds });
  }

  async getObject(key: string): Promise<Buffer> {
    try {
      const response = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      const stream = response.Body as Readable;
      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array));
      }
      return Buffer.concat(chunks);
    } catch (error) {
      if (error instanceof S3ServiceException && error.name === 'NoSuchKey') {
        throw new EvidenceObjectNotFoundError();
      }
      throw error;
    }
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}
