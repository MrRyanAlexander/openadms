// Where a photograph's files are kept in the object store (ARCHITECTURE §11; spec/THREAT-MODEL.md
// T-25; BACKLOG 2.6.4, C65, C136; ADR-101, 480, 481). **The server makes the place, and no phone
// ever names one** (OWASP ASVS V5: a stored file's name is never a caller's): it is made once,
// from the photograph's own id and its project's, when its record is saved, and written on the
// record, never changed after (the database's `photo_refuse_file_edit`).
//
// `projects/<project>/photos/<photograph>`, and the depth file beside it, where one comes, at the
// same place with `.depth` after it. A project's files share a prefix, so they can be moved to
// a cheaper tier, or gathered for a client package, a project at a time; no two photographs
// share a place, since none share an id. Every place passes `MediaStore`'s own form (lower-case
// segments, each beginning with a letter or a digit): a UUID is written in lower case.
export interface PhotoPlaces {
  readonly objectKey: string;
  readonly depthObjectKey: string | null;
}

export function photoPlaces(projectId: string, photoId: string, depthFile: boolean): PhotoPlaces {
  const at = `projects/${projectId.toLowerCase()}/photos/${photoId.toLowerCase()}`;
  return { objectKey: at, depthObjectKey: depthFile ? `${at}.depth` : null };
}
