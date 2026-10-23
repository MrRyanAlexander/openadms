// How to sign in to the back office after `pnpm start`, beside the field app's sign-ins. The first
// admin's password is the one the person typed at the question: it is never kept or printed here.
export function backOfficeSignIn(httpsPort: string | undefined, email: string): string[] {
  const at = httpsPort === undefined || httpsPort === '443' ? '' : `:${httpsPort}`;
  return [
    '',
    'Sign in to the back office (and the viewer portal):',
    `  address   https://office.adms.localhost${at}`,
    `  email     ${email}`,
    '  password  the password you just set',
  ];
}
