module.exports = {
  COMMAND_HORIZON_DATA: 1,
  COMMAND_PEAKS_DATA: 2,
  COMMAND_SETTINGS_DATA: 3,
  COMMAND_REQUEST_UPDATE: 4,
  DEFAULT_HORIZON_WINDOW_DEG: 100,
  MIN_HORIZON_WINDOW_DEG: 30,
  MAX_HORIZON_WINDOW_DEG: 360,
  HORIZON_WINDOW_STEP_DEG: 10,
  HORIZON_RESOLUTION: 1,
  EXPORT_BASE_URL: "https://service.peakfinder.com/export",
  SERVICE_BASE_URL: "https://service.peakfinder.com",
  EXPORT_QUERY: {
    outputformat: "stellarium",
    fov: "full",
    outputtype: "silhouettes",
    imagesizeformat: "512",
    unit: "metric",
    style: "dark"
  },
  ZIP_POLLING: {
    initialDelayMs: 2000,
    retryDelayMs: 1500,
    maxAttempts: 5
  },
  DEFAULT_LANGUAGE: "en"
};
