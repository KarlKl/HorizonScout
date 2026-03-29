var normalizeAzimuth = require("./horizon").normalizeAzimuth;

function parseGazetteer(text) {
  var lines = text.split(/\r?\n/);
  var parsed = [];

  for (var i = 0; i < lines.length; i += 1) {
    var line = lines[i].trim();
    if (!line || line.charAt(0) === "#") {
      continue;
    }

    var parts = line.split("|");
    if (parts.length < 5) {
      continue;
    }

    var azimuth = parseFloat(parts[0].trim());
    var name = parts[4].trim();

    if (isNaN(azimuth) || !name) {
      continue;
    }

    parsed.push({
      azimuth: normalizeAzimuth(azimuth),
      name: name
    });
  }

  return parsed;
}

function encodePeaks(peaksList) {
  var lines = [];
  for (var i = 0; i < peaksList.length; i += 1) {
    var az = Math.round(peaksList[i].azimuth * 100) / 100;
    lines.push(az + "|" + peaksList[i].name);
  }
  return lines.join("\n");
}

module.exports = {
  parseGazetteer: parseGazetteer,
  encodePeaks: encodePeaks
};
