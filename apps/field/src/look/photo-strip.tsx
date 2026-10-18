// The photo strip (ADR-561 (6)): the photos a record holds so far, how many it may hold, and the
// way to take another, from the camera only (ADR-101). How many a record takes is the rules'
// (the screen passes it); taking one and showing it is task 3.6.1's, so each photo here is shown
// by its place in the strip.
import { words, counted, say } from '../words.ts';
import { Button } from './button.tsx';
import { Camera } from './icons.tsx';

export function PhotoStrip({
  photos,
  atMost,
  onTake,
}: {
  readonly photos: readonly string[];
  readonly atMost: number;
  readonly onTake: () => void;
}) {
  const full = photos.length >= atMost;
  return (
    <div className="photo-strip">
      <p>{counted(words.look.photos.count, photos.length, { max: atMost })}</p>
      {photos.length === 0 ? null : (
        <ul className="photo-strip-photos">
          {photos.map((key, place) => (
            <li key={key} className="photo">
              <Camera />
              <span>{say(words.look.photos.photo, { number: place + 1 })}</span>
            </li>
          ))}
        </ul>
      )}
      {full ? <p className="quiet">{words.look.photos.full}</p> : null}
      <Button wide icon={<Camera />} isDisabled={full} onPress={onTake}>
        {words.look.photos.take}
      </Button>
    </div>
  );
}
