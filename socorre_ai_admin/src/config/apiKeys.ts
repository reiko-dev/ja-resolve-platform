// Configurações de APIs externas
export function resolveGoogleMapsApiKey(env: NodeJS.ProcessEnv = process.env): string {
  const value = env.REACT_APP_GOOGLE_MAPS_API_KEY;
  return typeof value === 'string' ? value.trim() : '';
}

export const API_KEYS = {
  GOOGLE_MAPS: resolveGoogleMapsApiKey(),
  // Adicionar outras APIs conforme necessário
};

export const API_ENDPOINTS = {
  GOOGLE_GEOCODING: 'https://maps.googleapis.com/maps/api/geocode/json',
  VIA_CEP: 'https://viacep.com.br/ws',
};
