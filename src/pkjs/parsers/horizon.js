function normalizeAzimuth(azimuth) {
  var result = azimuth % 360;
  if (result < 0) {
    result += 360;
  }
  return result;
}

function parseHorizon(text) {
  var lines = text.split(/\r?\n/);
  var points = [];

  for (var i = 0; i < lines.length; i += 1) {
    var line = lines[i].trim();
    if (!line || line.charAt(0) === "#") {
      continue;
    }

    var parts = line.split(/\s+/);
    if (parts.length < 2) {
      continue;
    }

    var azimuth = parseFloat(parts[0]);
    var elevation = parseFloat(parts[1]);

    if (isNaN(azimuth) || isNaN(elevation)) {
      continue;
    }

    points.push({
      azimuth: normalizeAzimuth(azimuth),
      elevation: elevation
    });
  }

  points.sort(function(a, b) {
    return a.azimuth - b.azimuth;
  });

  return points;
}

function getMaxElevation(points) {
  var maxElevation = 0;
  for (var i = 0; i < points.length; i += 1) {
    if (points[i].elevation > maxElevation) {
      maxElevation = points[i].elevation;
    }
  }
  return maxElevation > 0 ? maxElevation : 1;
}

function interpolateElevation(points, targetAzimuth) {
  if (!points.length) {
    return 0;
  }

  var az = normalizeAzimuth(targetAzimuth);

  for (var i = 0; i < points.length - 1; i += 1) {
    var current = points[i];
    var next = points[i + 1];

    if (az >= current.azimuth && az <= next.azimuth) {
      var range = next.azimuth - current.azimuth;
      if (range <= 0) {
        return current.elevation;
      }
      var t = (az - current.azimuth) / range;
      return current.elevation + (next.elevation - current.elevation) * t;
    }
  }

  var last = points[points.length - 1];
  var first = points[0];
  var wrappedAz = az;
  if (wrappedAz < last.azimuth) {
    wrappedAz += 360;
  }

  var wrappedFirstAz = first.azimuth + 360;
  var wrappedRange = wrappedFirstAz - last.azimuth;
  if (wrappedRange <= 0) {
    return last.elevation;
  }

  var wrappedT = (wrappedAz - last.azimuth) / wrappedRange;
  return last.elevation + (first.elevation - last.elevation) * wrappedT;
}

function buildFullHorizonData(points, resolution) {
  var maxElevationDeg = getMaxElevation(points);
  var data = [];

  for (var deg = 0; deg < 360; deg += resolution) {
    var elevation = interpolateElevation(points, deg);
    var normalized = Math.round(
      Math.max(0, Math.min(255, (elevation / maxElevationDeg) * 255))
    );
    data.push(normalized);
  }

  return data;
}

module.exports = {
  parseHorizon: parseHorizon,
  buildFullHorizonData: buildFullHorizonData,
  normalizeAzimuth: normalizeAzimuth
};
