/**
 * Google-compatible encoded polyline codec (test-only).
 *
 * Implements the documented algorithm of the Google Maps Platform encoded
 * polyline format: points in `latitude,longitude` order, each coordinate
 * multiplied by 1e5 and rounded, zig-zag encoded, split into 5-bit chunks and
 * offset by 63 into printable ASCII. It is the SAME format the Google Routes
 * adapter requests (`polylineEncoding: 'ENCODED_POLYLINE'`) and the contract
 * declares as `encoded_polyline`; it is a codec, not a geometry authority.
 *
 * The runtime NEVER encodes or decodes geometry: it serves exactly the string
 * the RouteProvider returned. This helper exists so suites can prove the ORDER
 * the runtime asked the provider for (first point = pickup, last = destination)
 * without trusting a canned fixture string.
 */
'use strict';

/** Scratch buffer of 5-bit chunks for one signed value. */
function encodeSignedValue(value) {
  // Zig-zag: a negative value is complemented after the shift so small
  // magnitudes stay short on the wire.
  let encodedValue = value < 0 ? ~(value << 1) : value << 1;

  let output = '';
  while (encodedValue >= 0x20) {
    // Continuation bit 0x20 + the low five bits, shifted into printable range.
    output += String.fromCharCode((0x20 | (encodedValue & 0x1f)) + 63);
    encodedValue >>= 5;
  }
  output += String.fromCharCode(encodedValue + 63);
  return output;
}

/**
 * Encode `[[latitude, longitude], ...]` into a Google-compatible polyline.
 *
 * @param {Array<[number, number]>} points
 * @returns {string}
 */
function encodePolyline(points) {
  if (!Array.isArray(points)) throw new TypeError('encodePolyline expects an array of [latitude, longitude] pairs');

  let previousLatitude = 0;
  let previousLongitude = 0;
  let encoded = '';

  for (const point of points) {
    if (!Array.isArray(point) || point.length !== 2
      || !Number.isFinite(point[0]) || !Number.isFinite(point[1])) {
      throw new TypeError('encodePolyline expects finite [latitude, longitude] pairs');
    }
    const latitude = Math.round(point[0] * 1e5);
    const longitude = Math.round(point[1] * 1e5);
    encoded += encodeSignedValue(latitude - previousLatitude);
    encoded += encodeSignedValue(longitude - previousLongitude);
    previousLatitude = latitude;
    previousLongitude = longitude;
  }

  return encoded;
}

/** Decode one signed value starting at `index`; returns `{ value, nextIndex }`. */
function decodeSignedValue(encoded, index) {
  let result = 0;
  let shift = 0;
  let byte = 0;
  let cursor = index;

  do {
    byte = encoded.charCodeAt(cursor) - 63;
    cursor += 1;
    if (byte < 0) throw new Error('decodePolyline: truncated or malformed polyline');
    result |= (byte & 0x1f) << shift;
    shift += 5;
  } while (byte >= 0x20);

  const value = (result & 1) ? ~(result >> 1) : (result >> 1);
  return { value, nextIndex: cursor };
}

/**
 * Decode a Google-compatible polyline into
 * `[{ latitude, longitude }, ...]`, in the order the encoder wrote them.
 *
 * @param {string} encoded
 * @returns {Array<{ latitude: number, longitude: number }>}
 */
function decodePolyline(encoded) {
  if (typeof encoded !== 'string') throw new TypeError('decodePolyline expects a string');

  const points = [];
  let latitude = 0;
  let longitude = 0;
  let index = 0;

  while (index < encoded.length) {
    const decodedLatitude = decodeSignedValue(encoded, index);
    latitude += decodedLatitude.value;
    index = decodedLatitude.nextIndex;

    const decodedLongitude = decodeSignedValue(encoded, index);
    longitude += decodedLongitude.value;
    index = decodedLongitude.nextIndex;

    points.push({ latitude: latitude / 1e5, longitude: longitude / 1e5 });
  }

  return points;
}

module.exports = { encodePolyline, decodePolyline };
