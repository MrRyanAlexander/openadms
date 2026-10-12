// The object store the API keeps files in, and the API's identity at it (ARCHITECTURE §6
// "Uploads", §11; acceptance file 10, AC-10-49; THREAT-MODEL T-25; ADR-101, 263, 479, 480). These
// ask the local stack's own object store over HTTPS through Caddy, as the installation's API is
// told of it: they need `pnpm ready`. A test's objects are taken away again by the stack's
// administrator, the one identity that can.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  CreateBucketCommand,
  DeleteBucketCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetBucketVersioningCommand,
  ListBucketsCommand,
  ListObjectsV2Command,
  ListObjectVersionsCommand,
  PutBucketPolicyCommand,
  PutBucketVersioningCommand,
  PutObjectCommand,
  type S3Client,
} from '@aws-sdk/client-s3';

import {
  MediaStore,
  MediaStoreProblem,
  type MediaStoreSettings,
} from '../src/media/media-store.ts';
import {
  asTheApi,
  asTheStacksAdministrator,
  deleteMarksUnder,
  installationMedia,
  tidied,
  versionRead,
  versionsUnder,
} from './support/media.ts';

// This run's own corner of the bucket.
const prefix = `tests/media-store/${randomUUID()}`;
const bytesOf = (text: string): Buffer => Buffer.from(text, 'utf8');
const jpeg = 'image/jpeg';

let media: MediaStoreSettings;
let store: MediaStore;
let api: S3Client;
let administrator: S3Client;

// What the store answered a call it should have refused: its status, or "allowed".
async function answered(asked: Promise<unknown>): Promise<number | 'allowed'> {
  try {
    await asked;
    return 'allowed';
  } catch (error) {
    const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
    if (status === undefined) throw error;
    return status;
  }
}

async function problemOf(asked: Promise<unknown>): Promise<MediaStoreProblem> {
  try {
    await asked;
  } catch (problem) {
    if (problem instanceof MediaStoreProblem) return problem;
    throw problem;
  }
  throw new Error('The object store answered.');
}

// Nobody listens there: a store that gives no answer.
const nowhere = { host: '127.0.0.1', port: 1 };

beforeAll(() => {
  media = installationMedia();
  store = new MediaStore(media);
  api = asTheApi(media);
  administrator = asTheStacksAdministrator(media);
});

afterAll(async () => {
  await tidied(administrator, media, prefix);
  store.close();
  api.destroy();
  administrator.destroy();
});

describe('the object store the API keeps files in', () => {
  it('AC-10-49: a file is kept as one object and read back as the bytes that were stored', async () => {
    const key = `${prefix}/kept-once`;
    // Not text: every byte value, so nothing was read as characters on the way.
    const bytes = Buffer.from(Array.from({ length: 256 }, (_, value) => value));
    expect(await store.sizeOf(key)).toBeNull();
    expect(await store.read(key, 1024)).toBeNull();

    expect(await store.keep(key, bytes, jpeg)).toBe('KEPT');

    expect(await store.sizeOf(key)).toBe(256);
    const read = await store.read(key, 1024);
    expect(read?.bytes.equals(bytes)).toBe(true);
    expect(read?.contentType).toBe(jpeg);
    expect(await versionsUnder(administrator, media, key)).toEqual([
      { key, versionId: expect.any(String) as string, latest: true, bytes: 256 },
    ]);
  });

  it('AC-10-49: a second file under a key already kept changes nothing: the first stands, alone', async () => {
    const key = `${prefix}/never-overwritten`;
    expect(await store.keep(key, bytesOf('the file taken at the curb'), jpeg)).toBe('KEPT');

    expect(await store.keep(key, bytesOf('another file'), 'image/png')).toBe('ALREADY_THERE');

    const read = await store.read(key, 1024);
    expect(read?.bytes.toString('utf8')).toBe('the file taken at the curb');
    expect(read?.contentType).toBe(jpeg);
    expect(await versionsUnder(administrator, media, key)).toHaveLength(1);
  });

  it('AC-10-49: the identity the API uses can delete no object and no bucket, make no bucket, list nothing and change no bucket’s settings', async () => {
    const key = `${prefix}/cannot-be-deleted`;
    expect(await store.keep(key, bytesOf('evidence'), jpeg)).toBe('KEPT');
    const [version] = await versionsUnder(administrator, media, key);
    const Bucket = media.bucket;

    expect(await answered(api.send(new DeleteObjectCommand({ Bucket, Key: key })))).toBe(403);
    expect(
      await answered(
        api.send(new DeleteObjectCommand({ Bucket, Key: key, VersionId: version?.versionId })),
      ),
    ).toBe(403);
    // A delete of several at once is answered key by key.
    const several = await api.send(
      new DeleteObjectsCommand({ Bucket, Delete: { Objects: [{ Key: key }] } }),
    );
    expect(several.Deleted ?? []).toEqual([]);
    expect((several.Errors ?? []).map((refused) => [refused.Key, refused.Code])).toEqual([
      [key, 'AccessDenied'],
    ]);
    expect(await answered(api.send(new DeleteBucketCommand({ Bucket })))).toBe(403);
    expect(
      await answered(api.send(new CreateBucketCommand({ Bucket: 'adms-media-another' }))),
    ).toBe(403);
    // Asked which buckets there are, it is shown none.
    expect((await api.send(new ListBucketsCommand({}))).Buckets ?? []).toEqual([]);
    expect(await answered(api.send(new ListObjectsV2Command({ Bucket })))).toBe(403);
    expect(await answered(api.send(new ListObjectVersionsCommand({ Bucket })))).toBe(403);
    expect(
      await answered(
        api.send(
          new PutBucketVersioningCommand({
            Bucket,
            VersioningConfiguration: { Status: 'Suspended' },
          }),
        ),
      ),
    ).toBe(403);
    expect(
      await answered(
        api.send(
          new PutBucketPolicyCommand({
            Bucket,
            Policy: JSON.stringify({
              Version: '2012-10-17',
              Statement: [{ Effect: 'Allow', Principal: '*', Action: 's3:*', Resource: '*' }],
            }),
          }),
        ),
      ),
    ).toBe(403);
    // Nor a file anywhere but its one bucket.
    expect(
      await answered(
        api.send(
          new PutObjectCommand({ Bucket: 'adms-media-another', Key: key, Body: bytesOf('x') }),
        ),
      ),
    ).toBe(403);

    // And the file is as it was: one version, and no mark that it was deleted.
    expect((await store.read(key, 1024))?.bytes.toString('utf8')).toBe('evidence');
    expect(await versionsUnder(administrator, media, key)).toHaveLength(1);
    expect(await deleteMarksUnder(administrator, media, key)).toBe(0);
  });

  it('AC-10-49: the bucket keeps every version, so a put the API never makes, over a key already kept, loses nothing', async () => {
    const versioning = await administrator.send(
      new GetBucketVersioningCommand({ Bucket: media.bucket }),
    );
    expect(versioning.Status).toBe('Enabled');

    const key = `${prefix}/kept-under-a-later-put`;
    expect(await store.keep(key, bytesOf('first'), jpeg)).toBe('KEPT');
    // The vendor's client under the API's identity, with no condition: what `MediaStore` never
    // sends. The store takes it, and still holds the first file whole.
    await api.send(
      new PutObjectCommand({ Bucket: media.bucket, Key: key, Body: bytesOf('later') }),
    );

    const versions = await versionsUnder(administrator, media, key);
    expect(versions).toHaveLength(2);
    const texts = await Promise.all(
      versions.map((version) => versionRead(administrator, media, version)),
    );
    expect(texts.sort()).toEqual(['first', 'later']);
  });

  it('is asked by its own name, or at the proxy’s own address under that name, its certificate checked either way', async () => {
    const port = Number(new URL(media.url).port === '' ? '443' : new URL(media.url).port);
    const key = `${prefix}/asked-at-the-proxy`;
    const atTheProxy = new MediaStore({ ...media, at: { host: '127.0.0.1', port } });
    expect(await atTheProxy.keep(key, bytesOf('through the proxy'), jpeg)).toBe('KEPT');
    expect((await store.read(key, 1024))?.bytes.toString('utf8')).toBe('through the proxy');
    atTheProxy.close();

    // The stack's certificate authority is nobody's but the stack's: checked against the
    // machine's own, the store is not who it says it is, and nothing is sent.
    const unchecked = new MediaStore({ ...media, caFile: null, timeoutMs: 5000 });
    const problem = await problemOf(unchecked.keep(`${prefix}/never-sent`, bytesOf('x'), jpeg));
    expect(problem.message).toMatch(
      /^The object store gave no answer to a put( \([A-Za-z]+\))?\.$/,
    );
    expect(await store.sizeOf(`${prefix}/never-sent`)).toBeNull();
    unchecked.close();

    expect(() => new MediaStore({ ...media, url: media.url.replace('https:', 'http:') })).toThrow(
      'The object store is asked over HTTPS only.',
    );
    expect(() => new MediaStore({ ...media, at: { host: 'caddy', port: 443 } })).toThrow(
      'Where the object store is is an IP address and a port.',
    );
  });

  it('holds a key and a file’s type to their form before anything is asked', async () => {
    // A store that would give no answer: a refusal that isn't `MediaStoreProblem` was made
    // before any request.
    const unreachable = new MediaStore({ ...media, at: nowhere, timeoutMs: 2000 });
    const notOne = 'A file’s place in the object store isn’t one.';
    for (const key of [
      '',
      '/projects/a',
      'projects//a',
      'projects/a/',
      '../a',
      'projects/../a',
      'projects/.hidden',
      'Projects/a',
      'projects/a b',
      'projects/a?versionId=1',
      'projects/a#b',
      'projects/a\\b',
      'projects/a%2f..',
      `projects/${'a'.repeat(512)}`,
    ]) {
      await expect(unreachable.keep(key, bytesOf('x'), jpeg)).rejects.toThrow(notOne);
      await expect(unreachable.sizeOf(key)).rejects.toThrow(notOne);
      await expect(unreachable.read(key, 1)).rejects.toThrow(notOne);
    }
    for (const type of [
      '',
      'jpeg',
      'image/',
      'IMAGE/JPEG',
      'image/jpeg; charset=x',
      'a/b\r\nx: y',
    ]) {
      await expect(unreachable.keep(`${prefix}/typed`, bytesOf('x'), type)).rejects.toThrow(
        'A file’s type is a bare media type.',
      );
    }
    // A key that is one does reach the store, which here gives no answer.
    const problem = await problemOf(unreachable.keep(`${prefix}/typed`, bytesOf('x'), jpeg));
    expect(problem.message).toMatch(
      /^The object store gave no answer to a put( \([A-Za-z]+\))?\.$/,
    );
    unreachable.close();
  });

  it('a refusal by the store says what was asked and its status, never the key, the bucket or the identity', async () => {
    const wrong = ['not', 'the', 'identity', 'the', 'stack', 'made'].join('-');
    const stranger = new MediaStore({ ...media, secretKey: wrong });
    const key = `${prefix}/a-strangers-file`;

    const put = await problemOf(stranger.keep(key, bytesOf('x'), jpeg));
    const size = await problemOf(stranger.sizeOf(key));
    const read = await problemOf(stranger.read(key, 1));

    expect(put.message).toBe('The object store answered 403 to a put.');
    expect(size.message).toBe('The object store answered 403 to a question of size.');
    expect(read.message).toBe('The object store answered 403 to a read.');
    for (const problem of [put, size, read]) {
      const told = `${problem.message} ${problem.stack ?? ''} ${JSON.stringify(problem)}`;
      for (const never of [key, media.bucket, media.accessKey, media.secretKey, wrong]) {
        expect(told).not.toContain(never);
      }
      expect(problem.cause).toBeUndefined();
    }
    expect(await store.sizeOf(key)).toBeNull();
    stranger.close();
  });

  it('a file larger than the caller will take is not read, and the next question is still answered', async () => {
    const key = `${prefix}/larger-than-asked`;
    expect(await store.keep(key, bytesOf('twelve bytes'), jpeg)).toBe('KEPT');

    const problem = await problemOf(store.read(key, 11));

    expect(problem.message).toBe('The object store holds a larger file than was asked for.');
    expect((await store.read(key, 12))?.bytes.toString('utf8')).toBe('twelve bytes');
  });
});
