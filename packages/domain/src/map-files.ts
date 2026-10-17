// What a map's file may be (ARCHITECTURE §3 "Project boundary and zones", §6 "Uploads"; OWASP
// ASVS 5.0 V5; ADR-135, 141, 311, 485): what ArcGIS Pro and QGIS export, told by the file's own
// first bytes and never by a name or a type anybody says. A zipped shapefile (its `.shp`, `.shx`,
// `.dbf`, `.prj`, and any GeoJSON or KML files beside them, a KMZ among them), a GeoJSON file, or
// a KML file, what Google Earth exports (the user, ADR-523; ADR-527 (14)). An Esri layer fetched
// by the server is kept as a GeoJSON file.
export const mapFileTypes = [
  'application/zip',
  'application/geo+json',
  'application/vnd.google-earth.kml+xml',
] as const;

export type MapFileType = (typeof mapFileTypes)[number];

// How many of a file's first bytes are looked at to tell its kind: a GeoJSON file may begin
// with a byte-order mark and some white space before its first brace.
export const mapFileSignatureBytes = 64;

// A zip file's first entry: its local file header's signature.
const zipSignature = [0x50, 0x4b, 0x03, 0x04] as const;
const byteOrderMark = [0xef, 0xbb, 0xbf] as const;
// JSON's and XML's white space: space, tab, line feed, carriage return.
const whiteSpace = new Set([0x20, 0x09, 0x0a, 0x0d]);
const openingBrace = 0x7b;
// How a KML file opens: its XML declaration `<?xml`, or its root element `<kml` (KML 2.2, OGC
// 07-147r2), as bytes.
const xmlDeclaration = [0x3c, 0x3f, 0x78, 0x6d, 0x6c] as const;
const kmlRoot = [0x3c, 0x6b, 0x6d, 0x6c] as const;

const startsWith = (bytes: Uint8Array, signature: readonly number[], at = 0): boolean =>
  signature.every((byte, index) => bytes[at + index] === byte);

// The kind of map file a file is, by its first bytes; none where it is none of them, or fewer
// bytes than tell one were given. A GeoJSON file is told only as JSON that opens an object, and a
// KML file only as XML that opens with its declaration or its `kml` root: what either holds is
// read when it is read (an XML file whose root isn't `kml` is no KML then).
export function mapFileTypeOf(start: Uint8Array): MapFileType | null {
  if (startsWith(start, zipSignature)) return 'application/zip';
  let at = startsWith(start, byteOrderMark) ? byteOrderMark.length : 0;
  while (at < start.length && whiteSpace.has(start[at] ?? 0)) at += 1;
  if (start[at] === openingBrace) return 'application/geo+json';
  if (startsWith(start, xmlDeclaration, at) || startsWith(start, kmlRoot, at)) {
    return 'application/vnd.google-earth.kml+xml';
  }
  return null;
}
