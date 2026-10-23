// The local stack's object store, for a test of what the API keeps there (ADR-480). Two
// identities, each read in this process and never printed: the API's own, as the installer
// wrote it into the API's settings, and the stack's administrator, from infra/local/.env, who
// alone can see every version of an object and take a test's objects away again.
import { existsSync, readFileSync } from 'node:fs';
import { Agent } from 'node:https';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectVersionsCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { NodeHttpHandler } from '@smithy/node-http-handler';

import type { MediaStoreSettings } from '../../src/media/media-store.ts';
import { testSettings } from './database.ts';
import { shippedPolicy } from './process.ts';

const stackEnv = fileURLToPath(new URL('../../../../infra/local/.env', import.meta.url));

// The store as the installation's API is told of it, with the release's time limit.
export function installationMedia(): MediaStoreSettings {
  return {
    ...testSettings().media,
    timeoutMs: shippedPolicy.mediaStoreAnswerSeconds * 1000,
  };
}

// The vendor's client itself, under one identity: for what `MediaStore` has no call for.
export function storeAs(
  media: MediaStoreSettings,
  identity: { accessKey: string; secretKey: string },
): S3Client {
  return new S3Client({
    endpoint: media.url,
    region: media.region,
    forcePathStyle: true,
    credentials: { accessKeyId: identity.accessKey, secretAccessKey: identity.secretKey },
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
    requestHandler: new NodeHttpHandler({
      httpsAgent: new Agent({
        ca: media.caFile === null ? undefined : readFileSync(media.caFile),
        // A name under .localhost is this machine (RFC 6761); not every resolver knows.
        lookup: (_hostname, options, callback) => {
          if (options.all === true) callback(null, [{ address: '127.0.0.1', family: 4 }]);
          else callback(null, '127.0.0.1', 4);
        },
      }),
      requestTimeout: media.timeoutMs,
      throwOnRequestTimeout: true,
    }),
  });
}

export function asTheApi(media: MediaStoreSettings): S3Client {
  return storeAs(media, media);
}

export function asTheStacksAdministrator(media: MediaStoreSettings): S3Client {
  const needs = 'The object store’s tests need the local stack: run `pnpm ready`';
  if (!existsSync(stackEnv)) throw new Error(`${needs} (infra/local/.env is missing).`);
  const env = parseEnv(readFileSync(stackEnv, 'utf8'));
  const accessKey = env['S3_ACCESS_KEY'];
  const secretKey = env['S3_SECRET_KEY'];
  if (accessKey === undefined || secretKey === undefined) {
    throw new Error(`${needs} (infra/local/.env names no administrator of the object store).`);
  }
  return storeAs(media, { accessKey, secretKey });
}

export interface KeptVersion {
  readonly key: string;
  readonly versionId: string;
  readonly latest: boolean;
  readonly bytes: number;
}

// Every version kept under a prefix, delete markers aside, as the administrator sees them.
export async function versionsUnder(
  administrator: S3Client,
  media: MediaStoreSettings,
  prefix: string,
): Promise<KeptVersion[]> {
  const listed = await administrator.send(
    new ListObjectVersionsCommand({ Bucket: media.bucket, Prefix: prefix }),
  );
  return (listed.Versions ?? []).map((version) => ({
    key: version.Key ?? '',
    versionId: version.VersionId ?? '',
    latest: version.IsLatest === true,
    bytes: version.Size ?? 0,
  }));
}

// How many marks of a delete stand under a prefix: in a bucket that keeps versions, a delete
// leaves one.
export async function deleteMarksUnder(
  administrator: S3Client,
  media: MediaStoreSettings,
  prefix: string,
): Promise<number> {
  const listed = await administrator.send(
    new ListObjectVersionsCommand({ Bucket: media.bucket, Prefix: prefix }),
  );
  return (listed.DeleteMarkers ?? []).length;
}

// One version's bytes, as text.
export async function versionRead(
  administrator: S3Client,
  media: MediaStoreSettings,
  version: KeptVersion,
): Promise<string> {
  const answer = await administrator.send(
    new GetObjectCommand({ Bucket: media.bucket, Key: version.key, VersionId: version.versionId }),
  );
  return (await answer.Body?.transformToString()) ?? '';
}

// Takes a test's own objects away again, every version: the dev stack's store is left as it
// was. Only the administrator can; the API's identity deletes nothing.
export async function tidied(
  administrator: S3Client,
  media: MediaStoreSettings,
  prefix: string,
): Promise<void> {
  const listed = await administrator.send(
    new ListObjectVersionsCommand({ Bucket: media.bucket, Prefix: prefix }),
  );
  for (const entry of [...(listed.Versions ?? []), ...(listed.DeleteMarkers ?? [])]) {
    await administrator.send(
      new DeleteObjectCommand({
        Bucket: media.bucket,
        Key: entry.Key ?? '',
        VersionId: entry.VersionId ?? '',
      }),
    );
  }
}
