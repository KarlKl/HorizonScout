var Clay = require("@rebble/clay");

var config = require("./config");
var clayConfig = require("./clay-config");

var sampleHorizonText = require("./testdata/horizon_sample");
var sampleGazetteerText = require("./testdata/gazetteer_sample");

var getCurrentPosition = require("./services/geolocation").getCurrentPosition;
var api = require("./services/peakfinderApi");
var sendHorizonData = require("./services/watchMessaging").sendHorizonData;
var sendPeaksData = require("./services/watchMessaging").sendPeaksData;
var getSettings = require("./services/settings").getSettings;
var buildWatchSettingsPayload = require("./services/settings").buildWatchSettingsPayload;
var cache = require("./services/cache");

var parseHorizon = require("./parsers/horizon").parseHorizon;
var buildFullHorizonData = require("./parsers/horizon").buildFullHorizonData;
var parseGazetteer = require("./parsers/gazetteer").parseGazetteer;
var encodePeaks = require("./parsers/gazetteer").encodePeaks;

var clay = new Clay(clayConfig, null, { autoHandleEvents: false });

function buildWatchPayloads(horizonText, gazetteerText) {
  var horizonPoints = parseHorizon(horizonText);
  var horizonData = buildFullHorizonData(horizonPoints, config.HORIZON_RESOLUTION);

  var peaks = parseGazetteer(gazetteerText);
  var encodedPeaks = encodePeaks(peaks);

  return {
    horizonData: horizonData,
    encodedPeaks: encodedPeaks,
    meta: {
      horizonPointCount: horizonPoints.length,
      peakCount: peaks.length
    }
  };
}

function sendDisplaySettingsToWatch(settings) {
  return new Promise(function(resolve, reject) {
    Pebble.sendAppMessage(buildWatchSettingsPayload(settings), resolve, function(err) {
      reject(new Error(JSON.stringify(err)));
    });
  });
}

function sendToWatch(payloads, settings) {
  return sendDisplaySettingsToWatch(settings)
    .then(function() {
      return sendHorizonData(payloads.horizonData);
    })
    .then(function() {
      return sendPeaksData(payloads.encodedPeaks);
    });
}

function loadSampleAndSend(reason, settings) {
  var payloads = buildWatchPayloads(sampleHorizonText, sampleGazetteerText);
  return sendToWatch(payloads, settings).then(function() {
    console.log(
      "Using sample data (" + reason + ") horizon=" +
      payloads.meta.horizonPointCount + " peaks=" + payloads.meta.peakCount
    );
  });
}

function fetchRealDataAndSend(settings) {
  return getCurrentPosition()
    .then(function(position) {
      var language = settings.language || config.DEFAULT_LANGUAGE;
      
      // Check if we have cached API data for this location + language
      var cachedData = cache.getCachedApiData(position.lat, position.lng, language);
      if (cachedData) {
        // Use cached data
        return {
          horizonText: cachedData.horizonText,
          gazetteerText: cachedData.gazetteerText,
          isCached: true
        };
      }

      // Not cached, fetch from API
      return api.requestExportCreation(position.lat, position.lng)
        .then(function(exportResponse) {
          var downloadUrl = api.buildDownloadUrl(exportResponse);
          return api.fetchZipAndExtract(downloadUrl)
            .then(function(filesMap) {
              return api.resolveNeededTexts(filesMap, language);
            });
        })
        .then(function(texts) {
          // Cache the newly fetched data
          var peaks = require("./parsers/gazetteer").parseGazetteer(texts.gazetteerText);
          cache.setCachedApiData(position.lat, position.lng, language, texts.horizonText, texts.gazetteerText, peaks.length);
          return {
            horizonText: texts.horizonText,
            gazetteerText: texts.gazetteerText,
            isCached: false,
            position: position
          };
        });
    })
    .then(function(data) {
      var payloads = buildWatchPayloads(data.horizonText, data.gazetteerText);
      return sendToWatch(payloads, settings).then(function() {
        var cacheLabel = data.isCached ? " [CACHED]" : "";
        console.log(
          "Using real API data" + cacheLabel + " horizon=" + payloads.meta.horizonPointCount +
          " peaks=" + payloads.meta.peakCount +
          " lang=" + (settings.language || config.DEFAULT_LANGUAGE)
        );
      });
    });
}

function refreshDataPipeline(settings) {
  // return loadSampleAndSend("TESTING", settings);
  return fetchRealDataAndSend(settings).catch(function(error) {
    console.log("Real data failed: " + error.message);
    return loadSampleAndSend(error.message, settings);
  });
}

Pebble.addEventListener("showConfiguration", function() {
  Pebble.openURL(clay.generateUrl());
});

Pebble.addEventListener("webviewclosed", function(e) {
  if (!e || !e.response) {
    return;
  }

  try {
    clay.getSettings(e.response, false);
  } catch (error) {
    console.log("Clay response parse failed: " + error.message);
    return;
  }

  var oldSettings = getSettings();
  var newSettings = getSettings();

  // Invalidate API data cache if language changed (gazetteer will be different)
  if (oldSettings.language !== newSettings.language) {
    console.log("Language changed from " + oldSettings.language + " to " + newSettings.language + ", invalidating API cache");
    cache.invalidateApiDataCache();
  }

  refreshDataPipeline(newSettings).catch(function(refreshError) {
    console.log("Refresh after settings failed: " + refreshError.message);
  });
});


Pebble.addEventListener("appmessage", function (e) {
  console.log("AppMessage received: " + JSON.stringify(e));
  var payload = e.payload || {};
  if (payload.command === config.COMMAND_REQUEST_UPDATE) {
    var settings = getSettings();
    refreshDataPipeline(settings).catch(function(sampleError) {
      console.log("Sample fallback failed: " + sampleError.message);
    });
  }
});

Pebble.addEventListener("ready", function() {
  var settings = getSettings();
  console.log("PKJS ready: fetching real data pipeline with settings");

  refreshDataPipeline(settings).catch(function(sampleError) {
    console.log("Sample fallback failed: " + sampleError.message);
  });
});
