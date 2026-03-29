function parseLandscapeIni(text) {
  var result = {
    polygonalHorizonList: null
  };

  var lines = text.split(/\r?\n/);
  for (var i = 0; i < lines.length; i += 1) {
    var line = lines[i].trim();
    if (!line || line.charAt(0) === "#" || line.charAt(0) === ";") {
      continue;
    }

    var eqIndex = line.indexOf("=");
    if (eqIndex < 0) {
      continue;
    }

    var key = line.slice(0, eqIndex).trim();
    var value = line.slice(eqIndex + 1).trim();

    if (key === "polygonal_horizon_list") {
      result.polygonalHorizonList = value;
    }
  }

  return result;
}

module.exports = {
  parseLandscapeIni: parseLandscapeIni
};
