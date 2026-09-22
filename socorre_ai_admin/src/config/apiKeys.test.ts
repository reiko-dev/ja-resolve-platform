import * as fs from 'fs';
import * as path from 'path';
import { API_KEYS, resolveGoogleMapsApiKey } from './apiKeys';

describe('apiKeys', () => {
  it('never falls back to a hardcoded Google Maps key', () => {
    expect(API_KEYS.GOOGLE_MAPS).not.toMatch(/^AIza/);
  });

  it('resolves the key from REACT_APP_GOOGLE_MAPS_API_KEY and is empty otherwise', () => {
    expect(
      resolveGoogleMapsApiKey({ REACT_APP_GOOGLE_MAPS_API_KEY: 'test-maps-key' } as NodeJS.ProcessEnv)
    ).toBe('test-maps-key');
    expect(resolveGoogleMapsApiKey({} as NodeJS.ProcessEnv)).toBe('');
  });

  it('contains no Google API key literal in source', () => {
    const source = fs.readFileSync(path.join(__dirname, 'apiKeys.ts'), 'utf8');
    expect(source).not.toMatch(/AIza[0-9A-Za-z_-]{35}/);
  });
});
