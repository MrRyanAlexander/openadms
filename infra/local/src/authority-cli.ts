// An installation's own root and its services' certificates, for a firm's server (the user,
// 2026-10-23; infra/server/compose.yaml): the local stack's authority (certificates.ts), made in a
// folder of the caller's, under a root named for the installation, for the services named. The
// installer's server mode runs it inside its container, as the installer runs this package's
// helper (index.ts): every hop on the server is over TLS from this root, as on the local stack.
//   node infra/local/src/authority-cli.ts <folder> <service>…
// Prints what it made as one line of JSON ({"root":"made"|"kept","leaves":[…]}); never a key.
// Node 24 runs this file as-is (type stripping), so it uses erasable TypeScript only.
import { stackLeaves, StackAuthority } from './certificates.ts';

const [folder, ...services] = process.argv.slice(2);
const leaves = stackLeaves.filter((leaf) => services.includes(leaf.name));
if (folder === undefined || services.length === 0 || leaves.length !== services.length) {
  console.error(
    `Usage: node infra/local/src/authority-cli.ts <folder> <service>… (of ${stackLeaves.map(({ name }) => name).join(', ')})`,
  );
  process.exitCode = 2;
} else {
  const made = new StackAuthority(folder, leaves, {
    name: 'Open ADMS installation root',
    organization: 'Open ADMS',
  }).ensure();
  console.log(JSON.stringify(made));
}
