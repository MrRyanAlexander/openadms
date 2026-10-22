// A photograph of a record (ARCHITECTURE §11, §14): its file read from the API with the session's
// cookies, as bytes, and shown from those bytes (`blob:`, the page's policy's one way in for an
// image); never opened as a page of the API's. Shown small, and larger on asking; its words say what
// it shows and when it was taken.
import { photographFileEndpoint } from '@open-adms/contracts';
import { Button } from '@open-adms/look';
import { useEffect, useState } from 'react';

import { useApi } from '../reading.tsx';
import { words } from '../words.ts';

export function Photo({ photoId, label }: { readonly photoId: string; readonly label: string }) {
  const api = useApi();
  const [url, setUrl] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const [large, setLarge] = useState(false);
  useEffect(() => {
    let shown = true;
    let made: string | null = null;
    void api.file(photographFileEndpoint, { params: { photoId, file: 'photo' } }).then((read) => {
      if (!shown) return;
      if (read.kind !== 'file') {
        setMissing(true);
        return;
      }
      made = URL.createObjectURL(read.blob);
      setUrl(made);
    });
    return () => {
      shown = false;
      if (made !== null) URL.revokeObjectURL(made);
    };
  }, [api, photoId]);
  return (
    <figure className={large ? 'photo photo-large' : 'photo'}>
      {url === null ? (
        <p className="quiet">{missing ? words.photos.missing : words.common.loading}</p>
      ) : (
        <img src={url} alt={label} />
      )}
      <figcaption>
        <span>{label}</span>
        {url === null ? null : (
          <Button
            onPress={() => {
              setLarge((was) => !was);
            }}
          >
            {large ? words.photos.smaller : words.photos.larger}
          </Button>
        )}
      </figcaption>
    </figure>
  );
}
