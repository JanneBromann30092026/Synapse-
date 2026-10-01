import { describe, expect, it } from 'vitest';
import { decodeText } from './textDecode';

const bytes = (...values: number[]) => new Uint8Array(values);

describe('decodeText', () => {
  it('reads UTF-8 with and without BOM', () => {
    const utf8 = new TextEncoder().encode('Größe;ä');
    expect(decodeText(utf8)).toEqual({ text: 'Größe;ä', encoding: 'utf-8', bom: false });
    expect(decodeText(new Uint8Array([0xef, 0xbb, 0xbf, ...utf8]))).toEqual({
      text: 'Größe;ä',
      encoding: 'utf-8',
      bom: true,
    });
  });

  it('reads UTF-16 with BOM (Excel "Unicode Text")', () => {
    expect(decodeText(bytes(0xff, 0xfe, 0x61, 0x00, 0x09, 0x00, 0xe4, 0x00))).toMatchObject({
      text: 'a\tä',
      encoding: 'utf-16le',
    });
    expect(decodeText(bytes(0xfe, 0xff, 0x00, 0x61))).toMatchObject({
      text: 'a',
      encoding: 'utf-16be',
    });
  });

  it('falls back to Windows-1252 for invalid UTF-8', () => {
    // "Größe" in Windows-1252: ö = 0xF6, ß = 0xDF (not valid UTF-8).
    expect(decodeText(bytes(0x47, 0x72, 0xf6, 0xdf, 0x65))).toEqual({
      text: 'Größe',
      encoding: 'windows-1252',
      bom: false,
    });
  });
});
