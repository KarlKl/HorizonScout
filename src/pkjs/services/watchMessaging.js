var config = require("../config");

function sendAppMessage(payload) {
  return new Promise(function(resolve, reject) {
    Pebble.sendAppMessage(payload, resolve, function(err) {
      reject(new Error(JSON.stringify(err)));
    });
  });
}

function sendHorizonData(horizonData) {
  var payload = {
    command: config.COMMAND_HORIZON_DATA,
    horizonData: Array.from(new Uint8Array(horizonData))
  };
  return sendAppMessage(payload);
}

function sendPeaksData(encodedPeaks) {
  var payload = {
    command: config.COMMAND_PEAKS_DATA,
    peaksData: encodedPeaks
  };
  return sendAppMessage(payload);
}

module.exports = {
  sendHorizonData: sendHorizonData,
  sendPeaksData: sendPeaksData
};
