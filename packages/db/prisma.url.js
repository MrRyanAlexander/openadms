// A login's URL as Prisma's own engine reads it (KD-78; ADR-517). Every login asks TLS alone in
// the words libpq and node-postgres use: `sslmode=verify-full`, the server's certificate and name
// checked against the root `sslrootcert` names. Prisma's schema engine (the migrations, the shadow
// database) reads other words for the same check, and takes a mode it doesn't know as `prefer`,
// which would fall back to plain: so the URL is handed to it as `sslmode=require`, the same root
// as `sslcert`, and `sslaccept=strict`, which refuses a certificate not of that root or not of
// the address reached. The Prisma client (the seed, the services) reads the URL as it is written,
// through node-postgres.
// @ts-check
import { URL } from 'node:url';

/** @param {string} written */
export function schemaEngineUrl(written) {
  const url = new URL(written);
  if (url.searchParams.getAll('sslmode').join() !== 'verify-full') return written;
  const root = url.searchParams.get('sslrootcert');
  url.searchParams.delete('sslrootcert');
  url.searchParams.set('sslmode', 'require');
  if (root !== null) url.searchParams.set('sslcert', root);
  url.searchParams.set('sslaccept', 'strict');
  return url.toString();
}
