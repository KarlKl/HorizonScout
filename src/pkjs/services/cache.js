/**
 * Cache service: manages geolocation and API data caching to reduce server load.
 * Caches are stored in localStorage with timestamps for TTL validation.
 */

/**
 * Cache keys in localStorage
 */
var CACHE_KEYS = {
  GEOLOCATION: "cache_geolocation",
  API_DATA: "cache_api_data",
};

/**
 * Cache TTLs (milliseconds)
 */
var CACHE_TTL = {
  GEOLOCATION: 30 * 60 * 1000, // 30 minutes
  API_DATA: 60 * 60 * 1000, // 1 hour
};

/**
 * Get cached geolocation if still valid.
 * @returns {Object|null} { lat, lng, timestamp } or null if expired/missing
 */
function getCachedGeolocation() {
  try {
    var cached = JSON.parse(
      localStorage.getItem(CACHE_KEYS.GEOLOCATION) || "null"
    );
    if (!cached || !cached.timestamp) {
      return null;
    }

    var age = Date.now() - cached.timestamp;
    if (age > CACHE_TTL.GEOLOCATION) {
      console.log(
        "Geolocation cache expired (age=" + Math.round(age / 1000) + "s)"
      );
      return null;
    }

    console.log(
      "Using cached geolocation (age=" + Math.round(age / 1000) + "s)"
    );
    return cached;
  } catch (e) {
    return null;
  }
}

/**
 * Store geolocation in cache.
 * @param {Object} position { lat, lng }
 */
function setCachedGeolocation(position) {
  try {
    var data = {
      lat: position.lat,
      lng: position.lng,
      timestamp: Date.now(),
    };
    localStorage.setItem(CACHE_KEYS.GEOLOCATION, JSON.stringify(data));
    console.log("Cached geolocation");
  } catch (e) {
    console.log("Failed to cache geolocation: " + e.message);
  }
}

/**
 * Build a cache key for API data: hash of location + language.
 * Rounds location to 2 decimal places (~1km precision) to group nearby requests.
 * @param {number} lat
 * @param {number} lng
 * @param {string} language
 * @returns {string} cache key
 */
function buildApiCacheKey(lat, lng, language) {
  var roundedLat = Math.round(lat * 100) / 100;
  var roundedLng = Math.round(lng * 100) / 100;
  return (
    "api_" +
    roundedLat.toFixed(2) +
    "_" +
    roundedLng.toFixed(2) +
    "_" +
    language
  );
}

/**
 * Get cached API data (horizon + peaks) if still valid.
 * @param {number} lat
 * @param {number} lng
 * @param {string} language
 * @returns {Object|null} { horizonText, gazetteerText, timestamp } or null if expired/missing
 */
function getCachedApiData(lat, lng, language) {
  try {
    var key = buildApiCacheKey(lat, lng, language);
    var cached = JSON.parse(localStorage.getItem(key) || "null");
    if (!cached || !cached.timestamp) {
      return null;
    }

    var age = Date.now() - cached.timestamp;
    if (age > CACHE_TTL.API_DATA) {
      console.log(
        "API data cache expired for " +
          key +
          " (age=" +
          Math.round(age / 1000) +
          "s)"
      );
      return null;
    }

    console.log(
      "Using cached API data for " +
        key +
        " (age=" +
        Math.round(age / 1000) +
        "s, peaks=" +
        cached.peakCount +
        ")"
    );
    return cached;
  } catch (e) {
    return null;
  }
}

/**
 * Store API data in cache.
 * @param {number} lat
 * @param {number} lng
 * @param {string} language
 * @param {string} horizonText
 * @param {string} gazetteerText
 * @param {number} peakCount (for logging)
 */
function setCachedApiData(
  lat,
  lng,
  language,
  horizonText,
  gazetteerText,
  peakCount
) {
  try {
    var key = buildApiCacheKey(lat, lng, language);
    var data = {
      horizonText: horizonText,
      gazetteerText: gazetteerText,
      peakCount: peakCount,
      timestamp: Date.now(),
    };
    localStorage.setItem(key, JSON.stringify(data));
    console.log("Cached API data for " + key);
  } catch (e) {
    console.log("Failed to cache API data: " + e.message);
  }
}

/**
 * Invalidate all cached API data (e.g., when language changes).
 * Preserves geolocation cache.
 */
function invalidateApiDataCache() {
  try {
    var keysToDelete = [];
    for (var i = 0; i < localStorage.length; i++) {
      var key = localStorage.key(i);
      if (key && key.indexOf("api_") === 0) {
        keysToDelete.push(key);
      }
    }
    keysToDelete.forEach(function (key) {
      localStorage.removeItem(key);
    });
    console.log(
      "Invalidated " + keysToDelete.length + " API data cache entries"
    );
  } catch (e) {
    console.log("Failed to invalidate API cache: " + e.message);
  }
}

/**
 * Clear all caches (for debugging).
 */
function clearAllCaches() {
  try {
    localStorage.removeItem(CACHE_KEYS.GEOLOCATION);
    invalidateApiDataCache();
    console.log("Cleared all caches");
  } catch (e) {
    console.log("Failed to clear caches: " + e.message);
  }
}

module.exports = {
  getCachedGeolocation: getCachedGeolocation,
  setCachedGeolocation: setCachedGeolocation,
  getCachedApiData: getCachedApiData,
  setCachedApiData: setCachedApiData,
  invalidateApiDataCache: invalidateApiDataCache,
  clearAllCaches: clearAllCaches,
};
