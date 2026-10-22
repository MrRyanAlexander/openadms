// An address that names no screen of the back office.
import { ScreenTitle } from '@open-adms/look';
import { Link } from 'react-aria-components';

import { words } from '../words.ts';

export function NotFound() {
  return (
    <main data-screen="not-found" className="page" id="content">
      <ScreenTitle>{words.notFound.title}</ScreenTitle>
      <p>{words.common.notFound}</p>
      <p>
        <Link className="link" href="/">
          {words.shell.links.projects}
        </Link>
      </p>
    </main>
  );
}
