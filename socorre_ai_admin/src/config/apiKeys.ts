// Configurações de APIs externas
export const API_KEYS = {
  GOOGLE_MAPS: process.env.REACT_APP_GOOGLE_MAPS_API_KEY || 'AIzaSyBk7X3z7Q8v9w2X1y6Z4a5b6c7d8e9f0g1',
  // Adicionar outras APIs conforme necessário
};

export const API_ENDPOINTS = {
  GOOGLE_GEOCODING: 'https://maps.googleapis.com/maps/api/geocode/json',
  VIA_CEP: 'https://viacep.com.br/ws',
};
