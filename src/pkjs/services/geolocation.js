var cache = require("./cache");

function getCurrentPosition() {
  return new Promise(function(resolve, reject) {
    // Check cache first
    var cached = cache.getCachedGeolocation();
    if (cached) {
      resolve({
        lat: cached.lat,
        lng: cached.lng
      });
      return;
    }

    if (!navigator.geolocation) {
      reject(new Error("Geolocation not available"));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      function(position) {
        var pos = {
          lat: position.coords.latitude,
          lng: position.coords.longitude
        };
        // TESTING: Override geolocation with hardcoded location (Ötscher, Austria)
        // pos = { lat: 47.861700, lng: 15.202550 };
        console.log("Geolocation success: lat=" + pos.lat + " lng=" + pos.lng);
        cache.setCachedGeolocation(pos);
        resolve(pos);
      },
      function(error) {
        reject(new Error("Geolocation failed: " + error.code));
      },
      {
        enableHighAccuracy: false,
        timeout: 15000,
        maximumAge: 60000
      }
    );
  });
}

module.exports = {
  getCurrentPosition: getCurrentPosition
};
