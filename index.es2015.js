"use strict";

var url = require("url");
var punycode = require("punycode");
var queryString = require("query-string");
var prependHttp = require("prepend-http");
var sortKeys = require("sort-keys");

var DEFAULT_PORTS = {
  "http:": 80,
  "https:": 443,
  "ftp:": 21
};

// Protocols that always contain a `//`` bit
var slashedProtocol = {
  http: true,
  https: true,
  ftp: true,
  gopher: true,
  file: true,
  "http:": true,
  "https:": true,
  "ftp:": true,
  "gopher:": true,
  "file:": true
};

function testParameter(name, filters) {
  return filters.some(function(filter) {
    return filter instanceof RegExp ? filter.test(name) : filter === name;
  });
}

module.exports = function(str, opts) {
  opts = Object.assign(
    {
      normalizeProtocol: true,
      normalizeHttps: false,
      stripFragment: true,
      stripWWW: true,
      removeQueryParameters: [/^utm_\w+/i],
      removeTrailingSlash: true,
      removeDirectoryIndex: false,
      sortQueryParameters: true
    },
    opts
  );

  if (typeof str !== "string") {
    throw new TypeError("Expected a string");
  }

  var hasRelativeProtocol = str.startsWith("//");

  // Prepend protocol
  str = prependHttp(str.trim()).replace(/^\/\//, "http://");

  var urlObj = url.parse(str);

  if (opts.normalizeHttps && urlObj.protocol === "https:") {
    urlObj.protocol = "http:";
  }

  if (!urlObj.hostname && !urlObj.pathname) {
    throw new Error("Invalid URL");
  }

  // Prevent these from being used by `url.format`
  delete urlObj.host;
  delete urlObj.query;

  // Remove fragment
  if (opts.stripFragment) {
    delete urlObj.hash;
  }

  // Remove default port
  var port = DEFAULT_PORTS[urlObj.protocol];
  if (Number(urlObj.port) === port) {
    delete urlObj.port;
  }

  // Remove duplicate slashes
  if (urlObj.pathname) {
    urlObj.pathname = urlObj.pathname.replace(/\/{2,}/g, "/");
  }

  // Decode URI octets
  if (urlObj.pathname) {
    urlObj.pathname = decodeURI(urlObj.pathname);
  }

  // Remove directory index
  if (opts.removeDirectoryIndex === true) {
    opts.removeDirectoryIndex = [/^index\.[a-z]+$/];
  }

  if (
    Array.isArray(opts.removeDirectoryIndex) &&
    opts.removeDirectoryIndex.length > 0
  ) {
    var pathComponents = urlObj.pathname.split("/");
    var lastComponent = pathComponents[pathComponents.length - 1];

    if (testParameter(lastComponent, opts.removeDirectoryIndex)) {
      pathComponents = pathComponents.slice(0, pathComponents.length - 1);
      urlObj.pathname = pathComponents.slice(1).join("/") + "/";
    }
  }

  // Resolve relative paths, but only for slashed protocols
  if (slashedProtocol[urlObj.protocol]) {
    var domain = urlObj.protocol + "//" + urlObj.hostname;
    var relative = url.resolve(domain, urlObj.pathname);
    urlObj.pathname = relative.replace(domain, "");
  }

  if (urlObj.hostname) {
    // IDN to Unicode
    urlObj.hostname = punycode.toUnicode(urlObj.hostname).toLowerCase();

    // Remove trailing dot
    urlObj.hostname = urlObj.hostname.replace(/\.$/, "");

    // Remove `www.`
    if (opts.stripWWW) {
      urlObj.hostname = urlObj.hostname.replace(/^www\./, "");
    }
  }

  // Remove URL with empty query string
  if (urlObj.search === "?") {
    delete urlObj.search;
  }

  var queryParameters = queryString.parse(urlObj.search);

  // Remove query unwanted parameters
  if (Array.isArray(opts.removeQueryParameters)) {
    for (var key in queryParameters) {
      if (testParameter(key, opts.removeQueryParameters)) {
        delete queryParameters[key];
      }
    }
  }

  // Sort query parameters
  if (opts.sortQueryParameters) {
    urlObj.search = queryString.stringify(sortKeys(queryParameters));
  }

  // Decode query parameters
  if (urlObj.search !== null) {
    urlObj.search = decodeURIComponent(urlObj.search);
  }

  // Take advantage of many of the Node `url` normalizations
  str = url.format(urlObj);

  // Remove ending `/`
  if (opts.removeTrailingSlash || urlObj.pathname === "/") {
    str = str.replace(/\/$/, "");
  }

  // Restore relative protocol, if applicable
  if (hasRelativeProtocol && !opts.normalizeProtocol) {
    str = str.replace(/^http:\/\//, "//");
  }

  return str;
};
