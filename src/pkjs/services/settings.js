const config = require("../config");

var DEFAULT_SETTINGS = {
  showHeader: true,
  showCardinals: true,
  showPeaks: true,
  horizonWindowDeg: config.DEFAULT_HORIZON_WINDOW_DEG,
  language: "en"
};

function readClaySettings() {
  try {
    return JSON.parse(localStorage.getItem("clay-settings") || "{}");
  } catch (error) {
    console.log("Failed to read clay-settings: " + error.message);
    return {};
  }
}

function normalizeBoolean(value, fallback) {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value !== 0;
  }
  if (typeof value === "string") {
    return value === "true" || value === "1";
  }
  return fallback;
}

function clampInteger(value, min, max, fallback) {
  var numericValue = parseInt(value, 10);

  if (isNaN(numericValue)) {
    numericValue = fallback;
  }

  if (numericValue < min) {
    return min;
  }

  if (numericValue > max) {
    return max;
  }

  return numericValue;
}

function getSettings() {
  var stored = readClaySettings();

  return {
    showHeader: normalizeBoolean(stored.showHeader, DEFAULT_SETTINGS.showHeader),
    showCardinals: normalizeBoolean(stored.showCardinals, DEFAULT_SETTINGS.showCardinals),
    showPeaks: normalizeBoolean(stored.showPeaks, DEFAULT_SETTINGS.showPeaks),
    horizonWindowDeg: clampInteger(
      stored.horizonWindowDeg,
      config.MIN_HORIZON_WINDOW_DEG,
      config.MAX_HORIZON_WINDOW_DEG,
      DEFAULT_SETTINGS.horizonWindowDeg
    ),
    language: stored.language || DEFAULT_SETTINGS.language
  };
}

function buildWatchSettingsPayload(settings) {
  return {
    command: config.COMMAND_SETTINGS_DATA,
    showHeader: settings.showHeader ? 1 : 0,
    showCardinals: settings.showCardinals ? 1 : 0,
    showPeaks: settings.showPeaks ? 1 : 0,
    horizonWindowDeg: clampInteger(
      settings.horizonWindowDeg,
      config.MIN_HORIZON_WINDOW_DEG,
      config.MAX_HORIZON_WINDOW_DEG,
      DEFAULT_SETTINGS.horizonWindowDeg
    )
  };
}

module.exports = {
  DEFAULT_SETTINGS: DEFAULT_SETTINGS,
  getSettings: getSettings,
  buildWatchSettingsPayload: buildWatchSettingsPayload
};
