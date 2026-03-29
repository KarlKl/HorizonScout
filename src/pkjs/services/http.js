function request(method, url, options) {
  options = options || {};

  function makeHttpError(status, requestUrl) {
    var error = new Error("HTTP " + status + " for " + requestUrl);
    error.status = status;
    error.url = requestUrl;
    return error;
  }

  function makeNetworkError(requestUrl) {
    var error = new Error("Network request failed for " + requestUrl);
    error.status = 0;
    error.url = requestUrl;
    return error;
  }

  return new Promise(function(resolve, reject) {
    var xhr = new XMLHttpRequest();
    xhr.open(method, url, true);

    if (options.responseType) {
      xhr.responseType = options.responseType;
    }

    if (options.headers) {
      Object.keys(options.headers).forEach(function(key) {
        xhr.setRequestHeader(key, options.headers[key]);
      });
    }

    xhr.onload = function() {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(xhr);
      } else {
        reject(makeHttpError(xhr.status, url));
      }
    };

    xhr.onerror = function() {
      reject(makeNetworkError(url));
    };

    xhr.send(options.body || null);
  });
}

function requestJson(url) {
  return request("GET", url).then(function(xhr) {
    return JSON.parse(xhr.responseText);
  });
}

function requestArrayBuffer(url) {
  return request("GET", url, { responseType: "arraybuffer" }).then(function(xhr) {
    return xhr.response;
  });
}

module.exports = {
  requestJson: requestJson,
  requestArrayBuffer: requestArrayBuffer
};
