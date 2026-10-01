/** Decoding of imported text files whose encoding is unknown. */

export type TextEncodingName = 'utf-8' | 'utf-16le' | 'utf-16be' | 'windows-1252';

export interface DecodedText {
  text: string;
  encoding: TextEncodingName;
  bom: boolean;
}

/**
 * Detects the encoding: a byte order mark decides (UTF-8, UTF-16 LE/BE – e.g. Excel's
 * "Unicode Text"); without one the bytes are read as UTF-8 if they are valid UTF-8, otherwise
 * as Windows-1252 (older Excel CSV files). The BOM is not part of the returned text.
 */
export function decodeText(bytes: Uint8Array): DecodedText {
  const [b0, b1, b2] = bytes;
  if (b0 === 0xef && b1 === 0xbb && b2 === 0xbf) {
    return {
      text: new TextDecoder('utf-8').decode(bytes.subarray(3)),
      encoding: 'utf-8',
      bom: true,
    };
  }
  if (b0 === 0xff && b1 === 0xfe) {
    return {
      text: new TextDecoder('utf-16le').decode(bytes.subarray(2)),
      encoding: 'utf-16le',
      bom: true,
    };
  }
  if (b0 === 0xfe && b1 === 0xff) {
    return {
      text: new TextDecoder('utf-16be').decode(bytes.subarray(2)),
      encoding: 'utf-16be',
      bom: true,
    };
  }
  try {
    return {
      text: new TextDecoder('utf-8', { fatal: true }).decode(bytes),
      encoding: 'utf-8',
      bom: false,
    };
  } catch {
    return {
      text: new TextDecoder('windows-1252').decode(bytes),
      encoding: 'windows-1252',
      bom: false,
    };
  }
}
