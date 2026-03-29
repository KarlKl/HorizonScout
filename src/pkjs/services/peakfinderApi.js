// Polyfill for JSZip
if (typeof setImmediate === 'undefined') {
    window.setImmediate = function(callback) {
        return setTimeout(callback, 0);
    };
    window.clearImmediate = function(handle) {
        return clearTimeout(handle);
    };
}

var JSZip = require("jszip");

var config = require("../config");
var parseLandscapeIni = require("../parsers/landscapeIni").parseLandscapeIni;
var requestJson = require("./http").requestJson;
var requestArrayBuffer = require("./http").requestArrayBuffer;

function buildQuery(params) {
  return Object.keys(params)
    .map(function(key) {
      return encodeURIComponent(key) + "=" + encodeURIComponent(params[key]);
    })
    .join("&");
}

function buildExportCreationUrl(lat, lng) {
  var query = {
    lat: lat.toFixed(5),
    lng: lng.toFixed(5)
  };

  Object.keys(config.EXPORT_QUERY).forEach(function(key) {
    query[key] = config.EXPORT_QUERY[key];
  });

  return config.EXPORT_BASE_URL + "?" + buildQuery(query);
}

function requestExportCreation(lat, lng) {
  var url = buildExportCreationUrl(lat, lng);
  return requestJson(url);
}

function buildDownloadUrl(exportResponse) {
  if (!exportResponse || !exportResponse.path || !exportResponse.filename) {
    throw new Error("Export response missing path/filename");
  }

  return config.SERVICE_BASE_URL + "/" + exportResponse.path + exportResponse.filename;
}

function unzipToTextMap(arrayBuffer) {
  return JSZip.loadAsync(arrayBuffer).then(function(zip) {
    var fileNames = Object.keys(zip.files).filter(function(name) {
      return !zip.files[name].dir;
    });

    var tasks = fileNames.map(function(name) {
      return zip.files[name].async("string").then(function(content) {
        return { name: name, content: content };
      });
    });

    
    return Promise.all(tasks).then(function(entries) {
      var map = {};
      entries.forEach(function(entry) {
        map[entry.name] = entry.content;
      });
      return map;
    });
  });
}

function pickLandscapeIni(filesMap) {
  var keys = Object.keys(filesMap);
  for (var i = 0; i < keys.length; i += 1) {
    if (keys[i].toLowerCase().endsWith("landscape.ini")) {
      return keys[i];
    }
  }
  return null;
}

function pickGazetteer(filesMap, preferredLanguage) {
  var keys = Object.keys(filesMap);
  var preferred = "gazetteer." + preferredLanguage + ".utf8";

  for (var i = 0; i < keys.length; i += 1) {
    if (keys[i].toLowerCase().endsWith(preferred.toLowerCase())) {
      return keys[i];
    }
  }

  for (var j = 0; j < keys.length; j += 1) {
    if (keys[j].toLowerCase().endsWith("gazetteer.en.utf8")) {
      return keys[j];
    }
  }

  for (var k = 0; k < keys.length; k += 1) {
    if (/gazetteer\..+\.utf8$/i.test(keys[k])) {
      return keys[k];
    }
  }

  return null;
}

function resolveNeededTexts(filesMap, preferredLanguage) {
  var landscapeKey = pickLandscapeIni(filesMap);
  if (!landscapeKey) {
    throw new Error("landscape.ini missing in downloaded zip");
  }

  var landscape = parseLandscapeIni(filesMap[landscapeKey]);
  if (!landscape.polygonalHorizonList) {
    throw new Error("polygonal_horizon_list missing in landscape.ini");
  }

  var landscapeDir = landscapeKey.split("/");
  landscapeDir.pop();
  var baseDir = landscapeDir.length ? landscapeDir.join("/") + "/" : "";
  var horizonKey = baseDir + landscape.polygonalHorizonList;

  if (!filesMap[horizonKey]) {
    horizonKey = landscape.polygonalHorizonList;
  }

  if (!filesMap[horizonKey]) {
    throw new Error("horizon file not found: " + landscape.polygonalHorizonList);
  }

  var gazetteerKey = pickGazetteer(filesMap, preferredLanguage || config.DEFAULT_LANGUAGE);
  if (!gazetteerKey) {
    throw new Error("gazetteer file not found in zip");
  }

  return {
    horizonText: filesMap[horizonKey],
    gazetteerText: filesMap[gazetteerKey],
    meta: {
      landscapeKey: landscapeKey,
      horizonKey: horizonKey,
      gazetteerKey: gazetteerKey
    }
  };
}

function fetchZipAndExtract(downloadUrl) {
  var polling = config.ZIP_POLLING || {};
  var initialDelayMs = polling.initialDelayMs || 0;
  var retryDelayMs = polling.retryDelayMs || 1000;
  var maxAttempts = polling.maxAttempts || 20;

  function sleep(ms) {
    return new Promise(function(resolve) {
      setTimeout(resolve, ms);
    });
  }

  function attemptDownload(attempt) {
    return requestArrayBuffer(downloadUrl).catch(function(error) {
      if (error && error.status === 404 && attempt < maxAttempts) {
        console.log(
          "ZIP not ready yet (404), retry " +
          attempt + "/" + maxAttempts + " in " + retryDelayMs + "ms"
        );
        return sleep(retryDelayMs).then(function() {
          return attemptDownload(attempt + 1);
        });
      }
      throw error;
    });
  }

  return sleep(initialDelayMs)
    .then(function() {
      return attemptDownload(1);
    })
    .then(unzipToTextMap);
}

module.exports = {
  buildExportCreationUrl: buildExportCreationUrl,
  requestExportCreation: requestExportCreation,
  buildDownloadUrl: buildDownloadUrl,
  fetchZipAndExtract: fetchZipAndExtract,
  resolveNeededTexts: resolveNeededTexts,
  // for testing, expose unzipToTextMap as well:
  unzipToTextMap: unzipToTextMap
};
