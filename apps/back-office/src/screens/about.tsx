// About, from the Help menu (the user, 2026-10-22): the name the firm gives its ADMS, and that it is
// built on Open ADMS, at which version; the licence it is shared under, and where its source is
// (kept visible, though Apache-2.0 does not require it).
import { ScreenTitle } from '@open-adms/look';

import { builtOn } from '../brand.tsx';
import { say, words } from '../words.ts';

export function About({
  name,
  version,
}: {
  readonly name: string;
  readonly version: string | null;
}) {
  const said = words.about;
  return (
    <main data-screen="about" className="page page-narrow" id="content">
      <ScreenTitle>{say(said.title, { name })}</ScreenTitle>
      <p>{version === null ? said.builtOnOpenAdms : say(said.builtOn, { version })}</p>
      <p>{said.what}</p>
      <p className="quiet">{said.licence}</p>
      <p>
        <a className="link" href={builtOn.source} rel="noreferrer">
          {said.source}
        </a>
      </p>
    </main>
  );
}
