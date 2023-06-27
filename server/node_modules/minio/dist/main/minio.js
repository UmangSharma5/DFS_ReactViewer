"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
var _exportNames = {
  Client: true,
  CopyConditions: true,
  PostPolicy: true
};
var fs = _interopRequireWildcard(require("fs"), true);
var path = _interopRequireWildcard(require("path"), true);
var Stream = _interopRequireWildcard(require("stream"), true);
var _async = require("async");
var _blockStream = require("block-stream2");
var _lodash = require("lodash");
var querystring = _interopRequireWildcard(require("query-string"), true);
var _webEncoding = require("web-encoding");
var _xml = require("xml");
var _xml2js = require("xml2js");
var errors = _interopRequireWildcard(require("./errors.js"), true);
var _extensions = require("./extensions.js");
var _helpers = require("./helpers.js");
Object.keys(_helpers).forEach(function (key) {
  if (key === "default" || key === "__esModule") return;
  if (Object.prototype.hasOwnProperty.call(_exportNames, key)) return;
  if (key in exports && exports[key] === _helpers[key]) return;
  exports[key] = _helpers[key];
});
var _client = require("./internal/client.js");
var _copyConditions = require("./internal/copy-conditions.js");
exports.CopyConditions = _copyConditions.CopyConditions;
var _helper = require("./internal/helper.js");
var _postPolicy = require("./internal/post-policy.js");
exports.PostPolicy = _postPolicy.PostPolicy;
var _type = require("./internal/type.js");
var _notification = require("./notification.js");
Object.keys(_notification).forEach(function (key) {
  if (key === "default" || key === "__esModule") return;
  if (Object.prototype.hasOwnProperty.call(_exportNames, key)) return;
  if (key in exports && exports[key] === _notification[key]) return;
  exports[key] = _notification[key];
});
var _objectUploader = require("./object-uploader.js");
var _promisify = require("./promisify.js");
var _signing = require("./signing.js");
var transformers = _interopRequireWildcard(require("./transformers.js"), true);
var _xmlParsers = require("./xml-parsers.js");
function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }
function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }
/*
 * MinIO Javascript Library for Amazon S3 Compatible Cloud Storage, (C) 2015 MinIO, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

class Client extends _client.TypedClient {
  // Set application specific information.
  //
  // Generates User-Agent in the following style.
  //
  //       MinIO (OS; ARCH) LIB/VER APP/VER
  //
  // __Arguments__
  // * `appName` _string_ - Application name.
  // * `appVersion` _string_ - Application version.
  setAppInfo(appName, appVersion) {
    if (!(0, _helper.isString)(appName)) {
      throw new TypeError(`Invalid appName: ${appName}`);
    }
    if (appName.trim() === '') {
      throw new errors.InvalidArgumentError('Input appName cannot be empty.');
    }
    if (!(0, _helper.isString)(appVersion)) {
      throw new TypeError(`Invalid appVersion: ${appVersion}`);
    }
    if (appVersion.trim() === '') {
      throw new errors.InvalidArgumentError('Input appVersion cannot be empty.');
    }
    this.userAgent = `${this.userAgent} ${appName}/${appVersion}`;
  }

  // Calculate part size given the object size. Part size will be atleast this.partSize
  calculatePartSize(size) {
    if (!(0, _helper.isNumber)(size)) {
      throw new TypeError('size should be of type "number"');
    }
    if (size > this.maxObjectSize) {
      throw new TypeError(`size should not be more than ${this.maxObjectSize}`);
    }
    if (this.overRidePartSize) {
      return this.partSize;
    }
    var partSize = this.partSize;
    for (;;) {
      // while(true) {...} throws linting error.
      // If partSize is big enough to accomodate the object size, then use it.
      if (partSize * 10000 > size) {
        return partSize;
      }
      // Try part sizes as 64MB, 80MB, 96MB etc.
      partSize += 16 * 1024 * 1024;
    }
  }

  // log the request, response, error
  logHTTP(reqOptions, response, err) {
    // if no logstreamer available return.
    if (!this.logStream) {
      return;
    }
    if (!(0, _helper.isObject)(reqOptions)) {
      throw new TypeError('reqOptions should be of type "object"');
    }
    if (response && !(0, _helper.isReadableStream)(response)) {
      throw new TypeError('response should be of type "Stream"');
    }
    if (err && !(err instanceof Error)) {
      throw new TypeError('err should be of type "Error"');
    }
    var logHeaders = headers => {
      _lodash.forEach(headers, (v, k) => {
        if (k == 'authorization') {
          var redacter = new RegExp('Signature=([0-9a-f]+)');
          v = v.replace(redacter, 'Signature=**REDACTED**');
        }
        this.logStream.write(`${k}: ${v}\n`);
      });
      this.logStream.write('\n');
    };
    this.logStream.write(`REQUEST: ${reqOptions.method} ${reqOptions.path}\n`);
    logHeaders(reqOptions.headers);
    if (response) {
      this.logStream.write(`RESPONSE: ${response.statusCode}\n`);
      logHeaders(response.headers);
    }
    if (err) {
      this.logStream.write('ERROR BODY:\n');
      var errJSON = JSON.stringify(err, null, '\t');
      this.logStream.write(`${errJSON}\n`);
    }
  }

  // Enable tracing
  traceOn(stream) {
    if (!stream) {
      stream = process.stdout;
    }
    this.logStream = stream;
  }

  // Disable tracing
  traceOff() {
    this.logStream = null;
  }

  // makeRequest is the primitive used by the apis for making S3 requests.
  // payload can be empty string in case of no payload.
  // statusCode is the expected statusCode. If response.statusCode does not match
  // we parse the XML error and call the callback with the error message.
  // A valid region is passed by the calls - listBuckets, makeBucket and
  // getBucketRegion.
  makeRequest(options, payload, statusCodes, region, returnResponse, cb) {
    if (!(0, _helper.isObject)(options)) {
      throw new TypeError('options should be of type "object"');
    }
    if (!(0, _helper.isString)(payload) && !(0, _helper.isObject)(payload)) {
      // Buffer is of type 'object'
      throw new TypeError('payload should be of type "string" or "Buffer"');
    }
    statusCodes.forEach(statusCode => {
      if (!(0, _helper.isNumber)(statusCode)) {
        throw new TypeError('statusCode should be of type "number"');
      }
    });
    if (!(0, _helper.isString)(region)) {
      throw new TypeError('region should be of type "string"');
    }
    if (!(0, _helper.isBoolean)(returnResponse)) {
      throw new TypeError('returnResponse should be of type "boolean"');
    }
    if (!(0, _helper.isFunction)(cb)) {
      throw new TypeError('callback should be of type "function"');
    }
    if (!options.headers) {
      options.headers = {};
    }
    if (options.method === 'POST' || options.method === 'PUT' || options.method === 'DELETE') {
      options.headers['content-length'] = payload.length;
    }
    var sha256sum = '';
    if (this.enableSHA256) {
      sha256sum = (0, _helper.toSha256)(payload);
    }
    var stream = (0, _helper.readableStream)(payload);
    this.makeRequestStream(options, stream, sha256sum, statusCodes, region, returnResponse, cb);
  }

  // makeRequestStream will be used directly instead of makeRequest in case the payload
  // is available as a stream. for ex. putObject
  makeRequestStream(options, stream, sha256sum, statusCodes, region, returnResponse, cb) {
    if (!(0, _helper.isObject)(options)) {
      throw new TypeError('options should be of type "object"');
    }
    if (!(0, _helper.isReadableStream)(stream)) {
      throw new errors.InvalidArgumentError('stream should be a readable Stream');
    }
    if (!(0, _helper.isString)(sha256sum)) {
      throw new TypeError('sha256sum should be of type "string"');
    }
    statusCodes.forEach(statusCode => {
      if (!(0, _helper.isNumber)(statusCode)) {
        throw new TypeError('statusCode should be of type "number"');
      }
    });
    if (!(0, _helper.isString)(region)) {
      throw new TypeError('region should be of type "string"');
    }
    if (!(0, _helper.isBoolean)(returnResponse)) {
      throw new TypeError('returnResponse should be of type "boolean"');
    }
    if (!(0, _helper.isFunction)(cb)) {
      throw new TypeError('callback should be of type "function"');
    }

    // sha256sum will be empty for anonymous or https requests
    if (!this.enableSHA256 && sha256sum.length !== 0) {
      throw new errors.InvalidArgumentError(`sha256sum expected to be empty for anonymous or https requests`);
    }
    // sha256sum should be valid for non-anonymous http requests.
    if (this.enableSHA256 && sha256sum.length !== 64) {
      throw new errors.InvalidArgumentError(`Invalid sha256sum : ${sha256sum}`);
    }
    var _makeRequest = (e, region) => {
      if (e) {
        return cb(e);
      }
      options.region = region;
      var reqOptions = this.getRequestOptions(options);
      if (!this.anonymous) {
        // For non-anonymous https requests sha256sum is 'UNSIGNED-PAYLOAD' for signature calculation.
        if (!this.enableSHA256) {
          sha256sum = 'UNSIGNED-PAYLOAD';
        }
        let date = new Date();
        reqOptions.headers['x-amz-date'] = (0, _helper.makeDateLong)(date);
        reqOptions.headers['x-amz-content-sha256'] = sha256sum;
        if (this.sessionToken) {
          reqOptions.headers['x-amz-security-token'] = this.sessionToken;
        }
        this.checkAndRefreshCreds();
        var authorization = (0, _signing.signV4)(reqOptions, this.accessKey, this.secretKey, region, date, sha256sum);
        reqOptions.headers.authorization = authorization;
      }
      var req = this.transport.request(reqOptions, response => {
        if (!statusCodes.includes(response.statusCode)) {
          // For an incorrect region, S3 server always sends back 400.
          // But we will do cache invalidation for all errors so that,
          // in future, if AWS S3 decides to send a different status code or
          // XML error code we will still work fine.
          delete this.regionMap[options.bucketName];
          var errorTransformer = transformers.getErrorTransformer(response);
          (0, _helper.pipesetup)(response, errorTransformer).on('error', e => {
            this.logHTTP(reqOptions, response, e);
            cb(e);
          });
          return;
        }
        this.logHTTP(reqOptions, response);
        if (returnResponse) {
          return cb(null, response);
        }
        // We drain the socket so that the connection gets closed. Note that this
        // is not expensive as the socket will not have any data.
        response.on('data', () => {});
        cb(null);
      });
      let pipe = (0, _helper.pipesetup)(stream, req);
      pipe.on('error', e => {
        this.logHTTP(reqOptions, null, e);
        cb(e);
      });
    };
    if (region) {
      return _makeRequest(null, region);
    }
    this.getBucketRegion(options.bucketName, _makeRequest);
  }

  // gets the region of the bucket
  getBucketRegion(bucketName, cb) {
    if (!(0, _helper.isValidBucketName)(bucketName)) {
      throw new errors.InvalidBucketNameError(`Invalid bucket name : ${bucketName}`);
    }
    if (!(0, _helper.isFunction)(cb)) {
      throw new TypeError('cb should be of type "function"');
    }

    // Region is set with constructor, return the region right here.
    if (this.region) {
      return cb(null, this.region);
    }
    if (this.regionMap[bucketName]) {
      return cb(null, this.regionMap[bucketName]);
    }
    var extractRegion = response => {
      var transformer = transformers.getBucketRegionTransformer();
      var region = _helpers.DEFAULT_REGION;
      (0, _helper.pipesetup)(response, transformer).on('error', cb).on('data', data => {
        if (data) {
          region = data;
        }
      }).on('end', () => {
        this.regionMap[bucketName] = region;
        cb(null, region);
      });
    };
    var method = 'GET';
    var query = 'location';

    // `getBucketLocation` behaves differently in following ways for
    // different environments.
    //
    // - For nodejs env we default to path style requests.
    // - For browser env path style requests on buckets yields CORS
    //   error. To circumvent this problem we make a virtual host
    //   style request signed with 'us-east-1'. This request fails
    //   with an error 'AuthorizationHeaderMalformed', additionally
    //   the error XML also provides Region of the bucket. To validate
    //   this region is proper we retry the same request with the newly
    //   obtained region.
    var pathStyle = this.pathStyle && typeof window === 'undefined';
    this.makeRequest({
      method,
      bucketName,
      query,
      pathStyle
    }, '', [200], _helpers.DEFAULT_REGION, true, (e, response) => {
      if (e) {
        if (e.name === 'AuthorizationHeaderMalformed') {
          var region = e.Region;
          if (!region) {
            return cb(e);
          }
          this.makeRequest({
            method,
            bucketName,
            query
          }, '', [200], region, true, (e, response) => {
            if (e) {
              return cb(e);
            }
            extractRegion(response);
          });
          return;
        }
        return cb(e);
      }
      extractRegion(response);
    });
  }

  // Creates the bucket `bucketName`.
  //
  // __Arguments__
  // * `bucketName` _string_ - Name of the bucket
  // * `region` _string_ - region valid values are _us-west-1_, _us-west-2_,  _eu-west-1_, _eu-central-1_, _ap-southeast-1_, _ap-northeast-1_, _ap-southeast-2_, _sa-east-1_.
  // * `makeOpts` _object_ - Options to create a bucket. e.g {ObjectLocking:true} (Optional)
  // * `callback(err)` _function_ - callback function with `err` as the error argument. `err` is null if the bucket is successfully created.
  makeBucket(bucketName, region, makeOpts = {}, cb) {
    if (!(0, _helper.isValidBucketName)(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName);
    }
    // Backward Compatibility
    if ((0, _helper.isObject)(region)) {
      cb = makeOpts;
      makeOpts = region;
      region = '';
    }
    if ((0, _helper.isFunction)(region)) {
      cb = region;
      region = '';
      makeOpts = {};
    }
    if ((0, _helper.isFunction)(makeOpts)) {
      cb = makeOpts;
      makeOpts = {};
    }
    if (!(0, _helper.isString)(region)) {
      throw new TypeError('region should be of type "string"');
    }
    if (!(0, _helper.isObject)(makeOpts)) {
      throw new TypeError('makeOpts should be of type "object"');
    }
    if (!(0, _helper.isFunction)(cb)) {
      throw new TypeError('callback should be of type "function"');
    }
    var payload = '';

    // Region already set in constructor, validate if
    // caller requested bucket location is same.
    if (region && this.region) {
      if (region !== this.region) {
        throw new errors.InvalidArgumentError(`Configured region ${this.region}, requested ${region}`);
      }
    }
    // sending makeBucket request with XML containing 'us-east-1' fails. For
    // default region server expects the request without body
    if (region && region !== _helpers.DEFAULT_REGION) {
      var createBucketConfiguration = [];
      createBucketConfiguration.push({
        _attr: {
          xmlns: 'http://s3.amazonaws.com/doc/2006-03-01/'
        }
      });
      createBucketConfiguration.push({
        LocationConstraint: region
      });
      var payloadObject = {
        CreateBucketConfiguration: createBucketConfiguration
      };
      payload = _xml(payloadObject);
    }
    var method = 'PUT';
    var headers = {};
    if (makeOpts.ObjectLocking) {
      headers['x-amz-bucket-object-lock-enabled'] = true;
    }
    if (!region) {
      region = _helpers.DEFAULT_REGION;
    }
    const processWithRetry = err => {
      if (err && (region === '' || region === _helpers.DEFAULT_REGION)) {
        if (err.code === 'AuthorizationHeaderMalformed' && err.region !== '') {
          // Retry with region returned as part of error
          this.makeRequest({
            method,
            bucketName,
            headers
          }, payload, [200], err.region, false, cb);
        } else {
          return cb && cb(err);
        }
      }
      return cb && cb(err);
    };
    this.makeRequest({
      method,
      bucketName,
      headers
    }, payload, [200], region, false, processWithRetry);
  }

  // List of buckets created.
  //
  // __Arguments__
  // * `callback(err, buckets)` _function_ - callback function with error as the first argument. `buckets` is an array of bucket information
  //
  // `buckets` array element:
  // * `bucket.name` _string_ : bucket name
  // * `bucket.creationDate` _Date_: date when bucket was created
  listBuckets(cb) {
    if (!(0, _helper.isFunction)(cb)) {
      throw new TypeError('callback should be of type "function"');
    }
    var method = 'GET';
    this.makeRequest({
      method
    }, '', [200], _helpers.DEFAULT_REGION, true, (e, response) => {
      if (e) {
        return cb(e);
      }
      var transformer = transformers.getListBucketTransformer();
      var buckets;
      (0, _helper.pipesetup)(response, transformer).on('data', result => buckets = result).on('error', e => cb(e)).on('end', () => cb(null, buckets));
    });
  }

  // Returns a stream that emits objects that are partially uploaded.
  //
  // __Arguments__
  // * `bucketName` _string_: name of the bucket
  // * `prefix` _string_: prefix of the object names that are partially uploaded (optional, default `''`)
  // * `recursive` _bool_: directory style listing when false, recursive listing when true (optional, default `false`)
  //
  // __Return Value__
  // * `stream` _Stream_ : emits objects of the format:
  //   * `object.key` _string_: name of the object
  //   * `object.uploadId` _string_: upload ID of the object
  //   * `object.size` _Integer_: size of the partially uploaded object
  listIncompleteUploads(bucket, prefix, recursive) {
    if (prefix === undefined) {
      prefix = '';
    }
    if (recursive === undefined) {
      recursive = false;
    }
    if (!(0, _helper.isValidBucketName)(bucket)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucket);
    }
    if (!(0, _helper.isValidPrefix)(prefix)) {
      throw new errors.InvalidPrefixError(`Invalid prefix : ${prefix}`);
    }
    if (!(0, _helper.isBoolean)(recursive)) {
      throw new TypeError('recursive should be of type "boolean"');
    }
    var delimiter = recursive ? '' : '/';
    var keyMarker = '';
    var uploadIdMarker = '';
    var uploads = [];
    var ended = false;
    var readStream = Stream.Readable({
      objectMode: true
    });
    readStream._read = () => {
      // push one upload info per _read()
      if (uploads.length) {
        return readStream.push(uploads.shift());
      }
      if (ended) {
        return readStream.push(null);
      }
      this.listIncompleteUploadsQuery(bucket, prefix, keyMarker, uploadIdMarker, delimiter).on('error', e => readStream.emit('error', e)).on('data', result => {
        result.prefixes.forEach(prefix => uploads.push(prefix));
        _async.eachSeries(result.uploads, (upload, cb) => {
          // for each incomplete upload add the sizes of its uploaded parts
          this.listParts(bucket, upload.key, upload.uploadId, (err, parts) => {
            if (err) {
              return cb(err);
            }
            upload.size = parts.reduce((acc, item) => acc + item.size, 0);
            uploads.push(upload);
            cb();
          });
        }, err => {
          if (err) {
            readStream.emit('error', err);
            return;
          }
          if (result.isTruncated) {
            keyMarker = result.nextKeyMarker;
            uploadIdMarker = result.nextUploadIdMarker;
          } else {
            ended = true;
          }
          readStream._read();
        });
      });
    };
    return readStream;
  }

  // To check if a bucket already exists.
  //
  // __Arguments__
  // * `bucketName` _string_ : name of the bucket
  // * `callback(err)` _function_ : `err` is `null` if the bucket exists
  bucketExists(bucketName, cb) {
    if (!(0, _helper.isValidBucketName)(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName);
    }
    if (!(0, _helper.isFunction)(cb)) {
      throw new TypeError('callback should be of type "function"');
    }
    var method = 'HEAD';
    this.makeRequest({
      method,
      bucketName
    }, '', [200], '', false, err => {
      if (err) {
        if (err.code == 'NoSuchBucket' || err.code == 'NotFound') {
          return cb(null, false);
        }
        return cb(err);
      }
      cb(null, true);
    });
  }

  // Remove a bucket.
  //
  // __Arguments__
  // * `bucketName` _string_ : name of the bucket
  // * `callback(err)` _function_ : `err` is `null` if the bucket is removed successfully.
  removeBucket(bucketName, cb) {
    if (!(0, _helper.isValidBucketName)(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName);
    }
    if (!(0, _helper.isFunction)(cb)) {
      throw new TypeError('callback should be of type "function"');
    }
    var method = 'DELETE';
    this.makeRequest({
      method,
      bucketName
    }, '', [204], '', false, e => {
      // If the bucket was successfully removed, remove the region map entry.
      if (!e) {
        delete this.regionMap[bucketName];
      }
      cb(e);
    });
  }

  // Remove the partially uploaded object.
  //
  // __Arguments__
  // * `bucketName` _string_: name of the bucket
  // * `objectName` _string_: name of the object
  // * `callback(err)` _function_: callback function is called with non `null` value in case of error
  removeIncompleteUpload(bucketName, objectName, cb) {
    if (!(0, _helper.isValidBucketName)(bucketName)) {
      throw new errors.IsValidBucketNameError('Invalid bucket name: ' + bucketName);
    }
    if (!(0, _helper.isValidObjectName)(objectName)) {
      throw new errors.InvalidObjectNameError(`Invalid object name: ${objectName}`);
    }
    if (!(0, _helper.isFunction)(cb)) {
      throw new TypeError('callback should be of type "function"');
    }
    var removeUploadId;
    _async.during(cb => {
      this.findUploadId(bucketName, objectName, (e, uploadId) => {
        if (e) {
          return cb(e);
        }
        removeUploadId = uploadId;
        cb(null, uploadId);
      });
    }, cb => {
      var method = 'DELETE';
      var query = `uploadId=${removeUploadId}`;
      this.makeRequest({
        method,
        bucketName,
        objectName,
        query
      }, '', [204], '', false, e => cb(e));
    }, cb);
  }

  // Callback is called with `error` in case of error or `null` in case of success
  //
  // __Arguments__
  // * `bucketName` _string_: name of the bucket
  // * `objectName` _string_: name of the object
  // * `filePath` _string_: path to which the object data will be written to
  // * `getOpts` _object_: Version of the object in the form `{versionId:'my-uuid'}`. Default is `{}`. (optional)
  // * `callback(err)` _function_: callback is called with `err` in case of error.
  fGetObject(bucketName, objectName, filePath, getOpts = {}, cb) {
    // Input validation.
    if (!(0, _helper.isValidBucketName)(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName);
    }
    if (!(0, _helper.isValidObjectName)(objectName)) {
      throw new errors.InvalidObjectNameError(`Invalid object name: ${objectName}`);
    }
    if (!(0, _helper.isString)(filePath)) {
      throw new TypeError('filePath should be of type "string"');
    }
    // Backward Compatibility
    if ((0, _helper.isFunction)(getOpts)) {
      cb = getOpts;
      getOpts = {};
    }
    if (!(0, _helper.isFunction)(cb)) {
      throw new TypeError('callback should be of type "function"');
    }

    // Internal data.
    var partFile;
    var partFileStream;
    var objStat;

    // Rename wrapper.
    var rename = err => {
      if (err) {
        return cb(err);
      }
      fs.rename(partFile, filePath, cb);
    };
    _async.waterfall([cb => this.statObject(bucketName, objectName, getOpts, cb), (result, cb) => {
      objStat = result;
      // Create any missing top level directories.
      fs.mkdir(path.dirname(filePath), {
        recursive: true
      }, err => cb(err));
    }, cb => {
      partFile = `${filePath}.${objStat.etag}.part.minio`;
      fs.stat(partFile, (e, stats) => {
        var offset = 0;
        if (e) {
          partFileStream = fs.createWriteStream(partFile, {
            flags: 'w'
          });
        } else {
          if (objStat.size === stats.size) {
            return rename();
          }
          offset = stats.size;
          partFileStream = fs.createWriteStream(partFile, {
            flags: 'a'
          });
        }
        this.getPartialObject(bucketName, objectName, offset, 0, getOpts, cb);
      });
    }, (downloadStream, cb) => {
      (0, _helper.pipesetup)(downloadStream, partFileStream).on('error', e => cb(e)).on('finish', cb);
    }, cb => fs.stat(partFile, cb), (stats, cb) => {
      if (stats.size === objStat.size) {
        return cb();
      }
      cb(new Error('Size mismatch between downloaded file and the object'));
    }], rename);
  }

  // Callback is called with readable stream of the object content.
  //
  // __Arguments__
  // * `bucketName` _string_: name of the bucket
  // * `objectName` _string_: name of the object
  // * `getOpts` _object_: Version of the object in the form `{versionId:'my-uuid'}`. Default is `{}`. (optional)
  // * `callback(err, stream)` _function_: callback is called with `err` in case of error. `stream` is the object content stream
  getObject(bucketName, objectName, getOpts = {}, cb) {
    if (!(0, _helper.isValidBucketName)(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName);
    }
    if (!(0, _helper.isValidObjectName)(objectName)) {
      throw new errors.InvalidObjectNameError(`Invalid object name: ${objectName}`);
    }
    // Backward Compatibility
    if ((0, _helper.isFunction)(getOpts)) {
      cb = getOpts;
      getOpts = {};
    }
    if (!(0, _helper.isFunction)(cb)) {
      throw new TypeError('callback should be of type "function"');
    }
    this.getPartialObject(bucketName, objectName, 0, 0, getOpts, cb);
  }

  // Callback is called with readable stream of the partial object content.
  //
  // __Arguments__
  // * `bucketName` _string_: name of the bucket
  // * `objectName` _string_: name of the object
  // * `offset` _number_: offset of the object from where the stream will start
  // * `length` _number_: length of the object that will be read in the stream (optional, if not specified we read the rest of the file from the offset)
  // * `getOpts` _object_: Version of the object in the form `{versionId:'my-uuid'}`. Default is `{}`. (optional)
  // * `callback(err, stream)` _function_: callback is called with `err` in case of error. `stream` is the object content stream
  getPartialObject(bucketName, objectName, offset, length, getOpts = {}, cb) {
    if ((0, _helper.isFunction)(length)) {
      cb = length;
      length = 0;
    }
    if (!(0, _helper.isValidBucketName)(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName);
    }
    if (!(0, _helper.isValidObjectName)(objectName)) {
      throw new errors.InvalidObjectNameError(`Invalid object name: ${objectName}`);
    }
    if (!(0, _helper.isNumber)(offset)) {
      throw new TypeError('offset should be of type "number"');
    }
    if (!(0, _helper.isNumber)(length)) {
      throw new TypeError('length should be of type "number"');
    }
    // Backward Compatibility
    if ((0, _helper.isFunction)(getOpts)) {
      cb = getOpts;
      getOpts = {};
    }
    if (!(0, _helper.isFunction)(cb)) {
      throw new TypeError('callback should be of type "function"');
    }
    var range = '';
    if (offset || length) {
      if (offset) {
        range = `bytes=${+offset}-`;
      } else {
        range = 'bytes=0-';
        offset = 0;
      }
      if (length) {
        range += `${+length + offset - 1}`;
      }
    }
    var headers = {};
    if (range !== '') {
      headers.range = range;
    }
    var expectedStatusCodes = [200];
    if (range) {
      expectedStatusCodes.push(206);
    }
    var method = 'GET';
    var query = querystring.stringify(getOpts);
    this.makeRequest({
      method,
      bucketName,
      objectName,
      headers,
      query
    }, '', expectedStatusCodes, '', true, cb);
  }

  // Uploads the object using contents from a file
  //
  // __Arguments__
  // * `bucketName` _string_: name of the bucket
  // * `objectName` _string_: name of the object
  // * `filePath` _string_: file path of the file to be uploaded
  // * `metaData` _Javascript Object_: metaData assosciated with the object
  // * `callback(err, objInfo)` _function_: non null `err` indicates error, `objInfo` _object_ which contains versionId and etag.
  fPutObject(bucketName, objectName, filePath, metaData, callback) {
    if (!(0, _helper.isValidBucketName)(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName);
    }
    if (!(0, _helper.isValidObjectName)(objectName)) {
      throw new errors.InvalidObjectNameError(`Invalid object name: ${objectName}`);
    }
    if (!(0, _helper.isString)(filePath)) {
      throw new TypeError('filePath should be of type "string"');
    }
    if ((0, _helper.isFunction)(metaData)) {
      callback = metaData;
      metaData = {}; // Set metaData empty if no metaData provided.
    }

    if (!(0, _helper.isObject)(metaData)) {
      throw new TypeError('metaData should be of type "object"');
    }

    // Inserts correct `content-type` attribute based on metaData and filePath
    metaData = (0, _helper.insertContentType)(metaData, filePath);

    // Updates metaData to have the correct prefix if needed
    metaData = (0, _helper.prependXAMZMeta)(metaData);
    var size;
    var partSize;
    _async.waterfall([cb => fs.stat(filePath, cb), (stats, cb) => {
      size = stats.size;
      var stream;
      var cbTriggered = false;
      var origCb = cb;
      cb = function () {
        if (cbTriggered) {
          return;
        }
        cbTriggered = true;
        if (stream) {
          stream.destroy();
        }
        return origCb.apply(this, arguments);
      };
      if (size > this.maxObjectSize) {
        return cb(new Error(`${filePath} size : ${stats.size}, max allowed size : 5TB`));
      }
      if (size <= this.partSize) {
        // simple PUT request, no multipart
        var multipart = false;
        var uploader = this.getUploader(bucketName, objectName, metaData, multipart);
        var hash = transformers.getHashSummer(this.enableSHA256);
        var start = 0;
        var end = size - 1;
        var autoClose = true;
        if (size === 0) {
          end = 0;
        }
        var options = {
          start,
          end,
          autoClose
        };
        (0, _helper.pipesetup)(fs.createReadStream(filePath, options), hash).on('data', data => {
          var md5sum = data.md5sum;
          var sha256sum = data.sha256sum;
          stream = fs.createReadStream(filePath, options);
          uploader(stream, size, sha256sum, md5sum, (err, objInfo) => {
            callback(err, objInfo);
            cb(true);
          });
        }).on('error', e => cb(e));
        return;
      }
      this.findUploadId(bucketName, objectName, cb);
    }, (uploadId, cb) => {
      // if there was a previous incomplete upload, fetch all its uploaded parts info
      if (uploadId) {
        return this.listParts(bucketName, objectName, uploadId, (e, etags) => cb(e, uploadId, etags));
      }
      // there was no previous upload, initiate a new one
      this.initiateNewMultipartUpload(bucketName, objectName, metaData, (e, uploadId) => cb(e, uploadId, []));
    }, (uploadId, etags, cb) => {
      partSize = this.calculatePartSize(size);
      var multipart = true;
      var uploader = this.getUploader(bucketName, objectName, metaData, multipart);

      // convert array to object to make things easy
      var parts = etags.reduce(function (acc, item) {
        if (!acc[item.part]) {
          acc[item.part] = item;
        }
        return acc;
      }, {});
      var partsDone = [];
      var partNumber = 1;
      var uploadedSize = 0;
      _async.whilst(cb => {
        cb(null, uploadedSize < size);
      }, cb => {
        var stream;
        var cbTriggered = false;
        var origCb = cb;
        cb = function () {
          if (cbTriggered) {
            return;
          }
          cbTriggered = true;
          if (stream) {
            stream.destroy();
          }
          return origCb.apply(this, arguments);
        };
        var part = parts[partNumber];
        var hash = transformers.getHashSummer(this.enableSHA256);
        var length = partSize;
        if (length > size - uploadedSize) {
          length = size - uploadedSize;
        }
        var start = uploadedSize;
        var end = uploadedSize + length - 1;
        var autoClose = true;
        var options = {
          autoClose,
          start,
          end
        };
        // verify md5sum of each part
        (0, _helper.pipesetup)(fs.createReadStream(filePath, options), hash).on('data', data => {
          var md5sumHex = Buffer.from(data.md5sum, 'base64').toString('hex');
          if (part && md5sumHex === part.etag) {
            // md5 matches, chunk already uploaded
            partsDone.push({
              part: partNumber,
              etag: part.etag
            });
            partNumber++;
            uploadedSize += length;
            return cb();
          }
          // part is not uploaded yet, or md5 mismatch
          stream = fs.createReadStream(filePath, options);
          uploader(uploadId, partNumber, stream, length, data.sha256sum, data.md5sum, (e, objInfo) => {
            if (e) {
              return cb(e);
            }
            partsDone.push({
              part: partNumber,
              etag: objInfo.etag
            });
            partNumber++;
            uploadedSize += length;
            return cb();
          });
        }).on('error', e => cb(e));
      }, e => {
        if (e) {
          return cb(e);
        }
        cb(null, partsDone, uploadId);
      });
    },
    // all parts uploaded, complete the multipart upload
    (etags, uploadId, cb) => this.completeMultipartUpload(bucketName, objectName, uploadId, etags, cb)], (err, ...rest) => {
      if (err === true) {
        return;
      }
      callback(err, ...rest);
    });
  }

  // Uploads the object.
  //
  // Uploading a stream
  // __Arguments__
  // * `bucketName` _string_: name of the bucket
  // * `objectName` _string_: name of the object
  // * `stream` _Stream_: Readable stream
  // * `size` _number_: size of the object (optional)
  // * `callback(err, etag)` _function_: non null `err` indicates error, `etag` _string_ is the etag of the object uploaded.
  //
  // Uploading "Buffer" or "string"
  // __Arguments__
  // * `bucketName` _string_: name of the bucket
  // * `objectName` _string_: name of the object
  // * `string or Buffer` _string_ or _Buffer_: string or buffer
  // * `callback(err, objInfo)` _function_: `err` is `null` in case of success and `info` will have the following object details:
  //   * `etag` _string_: etag of the object
  //   * `versionId` _string_: versionId of the object
  putObject(bucketName, objectName, stream, size, metaData, callback) {
    if (!(0, _helper.isValidBucketName)(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName);
    }
    if (!(0, _helper.isValidObjectName)(objectName)) {
      throw new errors.InvalidObjectNameError(`Invalid object name: ${objectName}`);
    }

    // We'll need to shift arguments to the left because of size and metaData.
    if ((0, _helper.isFunction)(size)) {
      callback = size;
      metaData = {};
    } else if ((0, _helper.isFunction)(metaData)) {
      callback = metaData;
      metaData = {};
    }

    // We'll need to shift arguments to the left because of metaData
    // and size being optional.
    if ((0, _helper.isObject)(size)) {
      metaData = size;
    }

    // Ensures Metadata has appropriate prefix for A3 API
    metaData = (0, _helper.prependXAMZMeta)(metaData);
    if (typeof stream === 'string' || stream instanceof Buffer) {
      // Adapts the non-stream interface into a stream.
      size = stream.length;
      stream = (0, _helper.readableStream)(stream);
    } else if (!(0, _helper.isReadableStream)(stream)) {
      throw new TypeError('third argument should be of type "stream.Readable" or "Buffer" or "string"');
    }
    if (!(0, _helper.isFunction)(callback)) {
      throw new TypeError('callback should be of type "function"');
    }
    if ((0, _helper.isNumber)(size) && size < 0) {
      throw new errors.InvalidArgumentError(`size cannot be negative, given size: ${size}`);
    }

    // Get the part size and forward that to the BlockStream. Default to the
    // largest block size possible if necessary.
    if (!(0, _helper.isNumber)(size)) {
      size = this.maxObjectSize;
    }
    size = this.calculatePartSize(size);

    // s3 requires that all non-end chunks be at least `this.partSize`,
    // so we chunk the stream until we hit either that size or the end before
    // we flush it to s3.
    let chunker = new _blockStream({
      size,
      zeroPadding: false
    });

    // This is a Writable stream that can be written to in order to upload
    // to the specified bucket and object automatically.
    let uploader = new _objectUploader.ObjectUploader(this, bucketName, objectName, size, metaData, callback);
    // stream => chunker => uploader
    (0, _helper.pipesetup)(stream, chunker, uploader);
  }

  // Copy the object.
  //
  // __Arguments__
  // * `bucketName` _string_: name of the bucket
  // * `objectName` _string_: name of the object
  // * `srcObject` _string_: path of the source object to be copied
  // * `conditions` _CopyConditions_: copy conditions that needs to be satisfied (optional, default `null`)
  // * `callback(err, {etag, lastModified})` _function_: non null `err` indicates error, `etag` _string_ and `listModifed` _Date_ are respectively the etag and the last modified date of the newly copied object
  copyObjectV1(arg1, arg2, arg3, arg4, arg5) {
    var bucketName = arg1;
    var objectName = arg2;
    var srcObject = arg3;
    var conditions, cb;
    if (typeof arg4 == 'function' && arg5 === undefined) {
      conditions = null;
      cb = arg4;
    } else {
      conditions = arg4;
      cb = arg5;
    }
    if (!(0, _helper.isValidBucketName)(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName);
    }
    if (!(0, _helper.isValidObjectName)(objectName)) {
      throw new errors.InvalidObjectNameError(`Invalid object name: ${objectName}`);
    }
    if (!(0, _helper.isString)(srcObject)) {
      throw new TypeError('srcObject should be of type "string"');
    }
    if (srcObject === '') {
      throw new errors.InvalidPrefixError(`Empty source prefix`);
    }
    if (conditions !== null && !(conditions instanceof _copyConditions.CopyConditions)) {
      throw new TypeError('conditions should be of type "CopyConditions"');
    }
    var headers = {};
    headers['x-amz-copy-source'] = (0, _helper.uriResourceEscape)(srcObject);
    if (conditions !== null) {
      if (conditions.modified !== '') {
        headers['x-amz-copy-source-if-modified-since'] = conditions.modified;
      }
      if (conditions.unmodified !== '') {
        headers['x-amz-copy-source-if-unmodified-since'] = conditions.unmodified;
      }
      if (conditions.matchETag !== '') {
        headers['x-amz-copy-source-if-match'] = conditions.matchETag;
      }
      if (conditions.matchEtagExcept !== '') {
        headers['x-amz-copy-source-if-none-match'] = conditions.matchETagExcept;
      }
    }
    var method = 'PUT';
    this.makeRequest({
      method,
      bucketName,
      objectName,
      headers
    }, '', [200], '', true, (e, response) => {
      if (e) {
        return cb(e);
      }
      var transformer = transformers.getCopyObjectTransformer();
      (0, _helper.pipesetup)(response, transformer).on('error', e => cb(e)).on('data', data => cb(null, data));
    });
  }

  /**
   * Internal Method to perform copy of an object.
   * @param sourceConfig __object__   instance of CopySourceOptions @link ./helpers/CopySourceOptions
   * @param destConfig  __object__   instance of CopyDestinationOptions @link ./helpers/CopyDestinationOptions
   * @param cb __function__ called with null if there is an error
   * @returns Promise if no callack is passed.
   */
  copyObjectV2(sourceConfig, destConfig, cb) {
    if (!(sourceConfig instanceof _helpers.CopySourceOptions)) {
      throw new errors.InvalidArgumentError('sourceConfig should of type CopySourceOptions ');
    }
    if (!(destConfig instanceof _helpers.CopyDestinationOptions)) {
      throw new errors.InvalidArgumentError('destConfig should of type CopyDestinationOptions ');
    }
    if (!destConfig.validate()) {
      return false;
    }
    if (!destConfig.validate()) {
      return false;
    }
    if (!(0, _helper.isFunction)(cb)) {
      throw new TypeError('callback should be of type "function"');
    }
    const headers = Object.assign({}, sourceConfig.getHeaders(), destConfig.getHeaders());
    const bucketName = destConfig.Bucket;
    const objectName = destConfig.Object;
    const method = 'PUT';
    this.makeRequest({
      method,
      bucketName,
      objectName,
      headers
    }, '', [200], '', true, (e, response) => {
      if (e) {
        return cb(e);
      }
      const transformer = transformers.getCopyObjectTransformer();
      (0, _helper.pipesetup)(response, transformer).on('error', e => cb(e)).on('data', data => {
        const resHeaders = response.headers;
        const copyObjResponse = {
          Bucket: destConfig.Bucket,
          Key: destConfig.Object,
          LastModified: data.LastModified,
          MetaData: (0, _helper.extractMetadata)(resHeaders),
          VersionId: (0, _helper.getVersionId)(resHeaders),
          SourceVersionId: (0, _helper.getSourceVersionId)(resHeaders),
          Etag: (0, _helper.sanitizeETag)(resHeaders.etag),
          Size: +resHeaders['content-length']
        };
        return cb(null, copyObjResponse);
      });
    });
  }

  // Backward compatibility for Copy Object API.
  copyObject(...allArgs) {
    if (allArgs[0] instanceof _helpers.CopySourceOptions && allArgs[1] instanceof _helpers.CopyDestinationOptions) {
      return this.copyObjectV2(...arguments);
    }
    return this.copyObjectV1(...arguments);
  }

  // list a batch of objects
  listObjectsQuery(bucketName, prefix, marker, listQueryOpts = {}) {
    if (!(0, _helper.isValidBucketName)(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName);
    }
    if (!(0, _helper.isString)(prefix)) {
      throw new TypeError('prefix should be of type "string"');
    }
    if (!(0, _helper.isString)(marker)) {
      throw new TypeError('marker should be of type "string"');
    }
    let {
      Delimiter,
      MaxKeys,
      IncludeVersion
    } = listQueryOpts;
    if (!(0, _helper.isObject)(listQueryOpts)) {
      throw new TypeError('listQueryOpts should be of type "object"');
    }
    if (!(0, _helper.isString)(Delimiter)) {
      throw new TypeError('Delimiter should be of type "string"');
    }
    if (!(0, _helper.isNumber)(MaxKeys)) {
      throw new TypeError('MaxKeys should be of type "number"');
    }
    const queries = [];
    // escape every value in query string, except maxKeys
    queries.push(`prefix=${(0, _helper.uriEscape)(prefix)}`);
    queries.push(`delimiter=${(0, _helper.uriEscape)(Delimiter)}`);
    queries.push(`encoding-type=url`);
    if (IncludeVersion) {
      queries.push(`versions`);
    }
    if (marker) {
      marker = (0, _helper.uriEscape)(marker);
      if (IncludeVersion) {
        queries.push(`key-marker=${marker}`);
      } else {
        queries.push(`marker=${marker}`);
      }
    }

    // no need to escape maxKeys
    if (MaxKeys) {
      if (MaxKeys >= 1000) {
        MaxKeys = 1000;
      }
      queries.push(`max-keys=${MaxKeys}`);
    }
    queries.sort();
    var query = '';
    if (queries.length > 0) {
      query = `${queries.join('&')}`;
    }
    var method = 'GET';
    var transformer = transformers.getListObjectsTransformer();
    this.makeRequest({
      method,
      bucketName,
      query
    }, '', [200], '', true, (e, response) => {
      if (e) {
        return transformer.emit('error', e);
      }
      (0, _helper.pipesetup)(response, transformer);
    });
    return transformer;
  }

  // List the objects in the bucket.
  //
  // __Arguments__
  // * `bucketName` _string_: name of the bucket
  // * `prefix` _string_: the prefix of the objects that should be listed (optional, default `''`)
  // * `recursive` _bool_: `true` indicates recursive style listing and `false` indicates directory style listing delimited by '/'. (optional, default `false`)
  // * `listOpts _object_: query params to list object with below keys
  // *    listOpts.MaxKeys _int_ maximum number of keys to return
  // *    listOpts.IncludeVersion  _bool_ true|false to include versions.
  // __Return Value__
  // * `stream` _Stream_: stream emitting the objects in the bucket, the object is of the format:
  // * `obj.name` _string_: name of the object
  // * `obj.prefix` _string_: name of the object prefix
  // * `obj.size` _number_: size of the object
  // * `obj.etag` _string_: etag of the object
  // * `obj.lastModified` _Date_: modified time stamp
  // * `obj.isDeleteMarker` _boolean_: true if it is a delete marker
  // * `obj.versionId` _string_: versionId of the object
  listObjects(bucketName, prefix, recursive, listOpts = {}) {
    if (prefix === undefined) {
      prefix = '';
    }
    if (recursive === undefined) {
      recursive = false;
    }
    if (!(0, _helper.isValidBucketName)(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName);
    }
    if (!(0, _helper.isValidPrefix)(prefix)) {
      throw new errors.InvalidPrefixError(`Invalid prefix : ${prefix}`);
    }
    if (!(0, _helper.isString)(prefix)) {
      throw new TypeError('prefix should be of type "string"');
    }
    if (!(0, _helper.isBoolean)(recursive)) {
      throw new TypeError('recursive should be of type "boolean"');
    }
    if (!(0, _helper.isObject)(listOpts)) {
      throw new TypeError('listOpts should be of type "object"');
    }
    var marker = '';
    const listQueryOpts = {
      Delimiter: recursive ? '' : '/',
      // if recursive is false set delimiter to '/'
      MaxKeys: 1000,
      IncludeVersion: listOpts.IncludeVersion
    };
    var objects = [];
    var ended = false;
    var readStream = Stream.Readable({
      objectMode: true
    });
    readStream._read = () => {
      // push one object per _read()
      if (objects.length) {
        readStream.push(objects.shift());
        return;
      }
      if (ended) {
        return readStream.push(null);
      }
      // if there are no objects to push do query for the next batch of objects
      this.listObjectsQuery(bucketName, prefix, marker, listQueryOpts).on('error', e => readStream.emit('error', e)).on('data', result => {
        if (result.isTruncated) {
          marker = result.nextMarker || result.versionIdMarker;
        } else {
          ended = true;
        }
        objects = result.objects;
        readStream._read();
      });
    };
    return readStream;
  }

  // listObjectsV2Query - (List Objects V2) - List some or all (up to 1000) of the objects in a bucket.
  //
  // You can use the request parameters as selection criteria to return a subset of the objects in a bucket.
  // request parameters :-
  // * `bucketName` _string_: name of the bucket
  // * `prefix` _string_: Limits the response to keys that begin with the specified prefix.
  // * `continuation-token` _string_: Used to continue iterating over a set of objects.
  // * `delimiter` _string_: A delimiter is a character you use to group keys.
  // * `max-keys` _number_: Sets the maximum number of keys returned in the response body.
  // * `start-after` _string_: Specifies the key to start after when listing objects in a bucket.
  listObjectsV2Query(bucketName, prefix, continuationToken, delimiter, maxKeys, startAfter) {
    if (!(0, _helper.isValidBucketName)(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName);
    }
    if (!(0, _helper.isString)(prefix)) {
      throw new TypeError('prefix should be of type "string"');
    }
    if (!(0, _helper.isString)(continuationToken)) {
      throw new TypeError('continuationToken should be of type "string"');
    }
    if (!(0, _helper.isString)(delimiter)) {
      throw new TypeError('delimiter should be of type "string"');
    }
    if (!(0, _helper.isNumber)(maxKeys)) {
      throw new TypeError('maxKeys should be of type "number"');
    }
    if (!(0, _helper.isString)(startAfter)) {
      throw new TypeError('startAfter should be of type "string"');
    }
    var queries = [];

    // Call for listing objects v2 API
    queries.push(`list-type=2`);
    queries.push(`encoding-type=url`);

    // escape every value in query string, except maxKeys
    queries.push(`prefix=${(0, _helper.uriEscape)(prefix)}`);
    queries.push(`delimiter=${(0, _helper.uriEscape)(delimiter)}`);
    if (continuationToken) {
      continuationToken = (0, _helper.uriEscape)(continuationToken);
      queries.push(`continuation-token=${continuationToken}`);
    }
    // Set start-after
    if (startAfter) {
      startAfter = (0, _helper.uriEscape)(startAfter);
      queries.push(`start-after=${startAfter}`);
    }
    // no need to escape maxKeys
    if (maxKeys) {
      if (maxKeys >= 1000) {
        maxKeys = 1000;
      }
      queries.push(`max-keys=${maxKeys}`);
    }
    queries.sort();
    var query = '';
    if (queries.length > 0) {
      query = `${queries.join('&')}`;
    }
    var method = 'GET';
    var transformer = transformers.getListObjectsV2Transformer();
    this.makeRequest({
      method,
      bucketName,
      query
    }, '', [200], '', true, (e, response) => {
      if (e) {
        return transformer.emit('error', e);
      }
      (0, _helper.pipesetup)(response, transformer);
    });
    return transformer;
  }

  // List the objects in the bucket using S3 ListObjects V2
  //
  // __Arguments__
  // * `bucketName` _string_: name of the bucket
  // * `prefix` _string_: the prefix of the objects that should be listed (optional, default `''`)
  // * `recursive` _bool_: `true` indicates recursive style listing and `false` indicates directory style listing delimited by '/'. (optional, default `false`)
  // * `startAfter` _string_: Specifies the key to start after when listing objects in a bucket. (optional, default `''`)
  //
  // __Return Value__
  // * `stream` _Stream_: stream emitting the objects in the bucket, the object is of the format:
  //   * `obj.name` _string_: name of the object
  //   * `obj.prefix` _string_: name of the object prefix
  //   * `obj.size` _number_: size of the object
  //   * `obj.etag` _string_: etag of the object
  //   * `obj.lastModified` _Date_: modified time stamp
  listObjectsV2(bucketName, prefix, recursive, startAfter) {
    if (prefix === undefined) {
      prefix = '';
    }
    if (recursive === undefined) {
      recursive = false;
    }
    if (startAfter === undefined) {
      startAfter = '';
    }
    if (!(0, _helper.isValidBucketName)(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName);
    }
    if (!(0, _helper.isValidPrefix)(prefix)) {
      throw new errors.InvalidPrefixError(`Invalid prefix : ${prefix}`);
    }
    if (!(0, _helper.isString)(prefix)) {
      throw new TypeError('prefix should be of type "string"');
    }
    if (!(0, _helper.isBoolean)(recursive)) {
      throw new TypeError('recursive should be of type "boolean"');
    }
    if (!(0, _helper.isString)(startAfter)) {
      throw new TypeError('startAfter should be of type "string"');
    }
    // if recursive is false set delimiter to '/'
    var delimiter = recursive ? '' : '/';
    var continuationToken = '';
    var objects = [];
    var ended = false;
    var readStream = Stream.Readable({
      objectMode: true
    });
    readStream._read = () => {
      // push one object per _read()
      if (objects.length) {
        readStream.push(objects.shift());
        return;
      }
      if (ended) {
        return readStream.push(null);
      }
      // if there are no objects to push do query for the next batch of objects
      this.listObjectsV2Query(bucketName, prefix, continuationToken, delimiter, 1000, startAfter).on('error', e => readStream.emit('error', e)).on('data', result => {
        if (result.isTruncated) {
          continuationToken = result.nextContinuationToken;
        } else {
          ended = true;
        }
        objects = result.objects;
        readStream._read();
      });
    };
    return readStream;
  }

  // Stat information of the object.
  //
  // __Arguments__
  // * `bucketName` _string_: name of the bucket
  // * `objectName` _string_: name of the object
  // * `statOpts`  _object_ : Version of the object in the form `{versionId:'my-uuid'}`. Default is `{}`. (optional).
  // * `callback(err, stat)` _function_: `err` is not `null` in case of error, `stat` contains the object information:
  //   * `stat.size` _number_: size of the object
  //   * `stat.etag` _string_: etag of the object
  //   * `stat.metaData` _string_: MetaData of the object
  //   * `stat.lastModified` _Date_: modified time stamp
  //   * `stat.versionId` _string_: version id of the object if available
  statObject(bucketName, objectName, statOpts = {}, cb) {
    if (!(0, _helper.isValidBucketName)(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName);
    }
    if (!(0, _helper.isValidObjectName)(objectName)) {
      throw new errors.InvalidObjectNameError(`Invalid object name: ${objectName}`);
    }
    // backward compatibility
    if ((0, _helper.isFunction)(statOpts)) {
      cb = statOpts;
      statOpts = {};
    }
    if (!(0, _helper.isObject)(statOpts)) {
      throw new errors.InvalidArgumentError('statOpts should be of type "object"');
    }
    if (!(0, _helper.isFunction)(cb)) {
      throw new TypeError('callback should be of type "function"');
    }
    var query = querystring.stringify(statOpts);
    var method = 'HEAD';
    this.makeRequest({
      method,
      bucketName,
      objectName,
      query
    }, '', [200], '', true, (e, response) => {
      if (e) {
        return cb(e);
      }

      // We drain the socket so that the connection gets closed. Note that this
      // is not expensive as the socket will not have any data.
      response.on('data', () => {});
      const result = {
        size: +response.headers['content-length'],
        metaData: (0, _helper.extractMetadata)(response.headers),
        lastModified: new Date(response.headers['last-modified']),
        versionId: (0, _helper.getVersionId)(response.headers),
        etag: (0, _helper.sanitizeETag)(response.headers.etag)
      };
      cb(null, result);
    });
  }

  // Remove the specified object.
  //
  // __Arguments__
  // * `bucketName` _string_: name of the bucket
  // * `objectName` _string_: name of the object
  // * `removeOpts` _object_: Version of the object in the form `{versionId:'my-uuid', governanceBypass:true|false, forceDelete:true|false}`. Default is `{}`. (optional)
  // * `callback(err)` _function_: callback function is called with non `null` value in case of error
  removeObject(bucketName, objectName, removeOpts = {}, cb) {
    if (!(0, _helper.isValidBucketName)(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName);
    }
    if (!(0, _helper.isValidObjectName)(objectName)) {
      throw new errors.InvalidObjectNameError(`Invalid object name: ${objectName}`);
    }
    // backward compatibility
    if ((0, _helper.isFunction)(removeOpts)) {
      cb = removeOpts;
      removeOpts = {};
    }
    if (!(0, _helper.isObject)(removeOpts)) {
      throw new errors.InvalidArgumentError('removeOpts should be of type "object"');
    }
    if (!(0, _helper.isFunction)(cb)) {
      throw new TypeError('callback should be of type "function"');
    }
    const method = 'DELETE';
    const queryParams = {};
    if (removeOpts.versionId) {
      queryParams.versionId = `${removeOpts.versionId}`;
    }
    const headers = {};
    if (removeOpts.governanceBypass) {
      headers['X-Amz-Bypass-Governance-Retention'] = true;
    }
    if (removeOpts.forceDelete) {
      headers['x-minio-force-delete'] = true;
    }
    const query = querystring.stringify(queryParams);
    let requestOptions = {
      method,
      bucketName,
      objectName,
      headers
    };
    if (query) {
      requestOptions['query'] = query;
    }
    this.makeRequest(requestOptions, '', [200, 204], '', false, cb);
  }

  // Remove all the objects residing in the objectsList.
  //
  // __Arguments__
  // * `bucketName` _string_: name of the bucket
  // * `objectsList` _array_: array of objects of one of the following:
  // *         List of Object names as array of strings which are object keys:  ['objectname1','objectname2']
  // *         List of Object name and versionId as an object:  [{name:"objectname",versionId:"my-version-id"}]

  removeObjects(bucketName, objectsList, cb) {
    if (!(0, _helper.isValidBucketName)(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName);
    }
    if (!Array.isArray(objectsList)) {
      throw new errors.InvalidArgumentError('objectsList should be a list');
    }
    if (!(0, _helper.isFunction)(cb)) {
      throw new TypeError('callback should be of type "function"');
    }
    const maxEntries = 1000;
    const query = 'delete';
    const method = 'POST';
    let result = objectsList.reduce((result, entry) => {
      result.list.push(entry);
      if (result.list.length === maxEntries) {
        result.listOfList.push(result.list);
        result.list = [];
      }
      return result;
    }, {
      listOfList: [],
      list: []
    });
    if (result.list.length > 0) {
      result.listOfList.push(result.list);
    }
    const encoder = new _webEncoding.TextEncoder();
    const batchResults = [];
    _async.eachSeries(result.listOfList, (list, batchCb) => {
      var objects = [];
      list.forEach(function (value) {
        if ((0, _helper.isObject)(value)) {
          objects.push({
            Key: value.name,
            VersionId: value.versionId
          });
        } else {
          objects.push({
            Key: value
          });
        }
      });
      let deleteObjects = {
        Delete: {
          Quiet: true,
          Object: objects
        }
      };
      const builder = new _xml2js.Builder({
        headless: true
      });
      let payload = builder.buildObject(deleteObjects);
      payload = encoder.encode(payload);
      const headers = {};
      headers['Content-MD5'] = (0, _helper.toMd5)(payload);
      let removeObjectsResult;
      this.makeRequest({
        method,
        bucketName,
        query,
        headers
      }, payload, [200], '', true, (e, response) => {
        if (e) {
          return batchCb(e);
        }
        (0, _helper.pipesetup)(response, transformers.removeObjectsTransformer()).on('data', data => {
          removeObjectsResult = data;
        }).on('error', e => {
          return batchCb(e, null);
        }).on('end', () => {
          batchResults.push(removeObjectsResult);
          return batchCb(null, removeObjectsResult);
        });
      });
    }, () => {
      cb(null, _lodash.flatten(batchResults));
    });
  }

  // Get the policy on a bucket or an object prefix.
  //
  // __Arguments__
  // * `bucketName` _string_: name of the bucket
  // * `callback(err, policy)` _function_: callback function
  getBucketPolicy(bucketName, cb) {
    // Validate arguments.
    if (!(0, _helper.isValidBucketName)(bucketName)) {
      throw new errors.InvalidBucketNameError(`Invalid bucket name: ${bucketName}`);
    }
    if (!(0, _helper.isFunction)(cb)) {
      throw new TypeError('callback should be of type "function"');
    }
    let method = 'GET';
    let query = 'policy';
    this.makeRequest({
      method,
      bucketName,
      query
    }, '', [200], '', true, (e, response) => {
      if (e) {
        return cb(e);
      }
      let policy = Buffer.from('');
      (0, _helper.pipesetup)(response, transformers.getConcater()).on('data', data => policy = data).on('error', cb).on('end', () => {
        cb(null, policy.toString());
      });
    });
  }

  // Set the policy on a bucket or an object prefix.
  //
  // __Arguments__
  // * `bucketName` _string_: name of the bucket
  // * `bucketPolicy` _string_: bucket policy (JSON stringify'ed)
  // * `callback(err)` _function_: callback function
  setBucketPolicy(bucketName, policy, cb) {
    // Validate arguments.
    if (!(0, _helper.isValidBucketName)(bucketName)) {
      throw new errors.InvalidBucketNameError(`Invalid bucket name: ${bucketName}`);
    }
    if (!(0, _helper.isString)(policy)) {
      throw new errors.InvalidBucketPolicyError(`Invalid bucket policy: ${policy} - must be "string"`);
    }
    if (!(0, _helper.isFunction)(cb)) {
      throw new TypeError('callback should be of type "function"');
    }
    let method = 'DELETE';
    let query = 'policy';
    if (policy) {
      method = 'PUT';
    }
    this.makeRequest({
      method,
      bucketName,
      query
    }, policy, [204], '', false, cb);
  }

  // Generate a generic presigned URL which can be
  // used for HTTP methods GET, PUT, HEAD and DELETE
  //
  // __Arguments__
  // * `method` _string_: name of the HTTP method
  // * `bucketName` _string_: name of the bucket
  // * `objectName` _string_: name of the object
  // * `expiry` _number_: expiry in seconds (optional, default 7 days)
  // * `reqParams` _object_: request parameters (optional) e.g {versionId:"10fa9946-3f64-4137-a58f-888065c0732e"}
  // * `requestDate` _Date_: A date object, the url will be issued at (optional)
  presignedUrl(method, bucketName, objectName, expires, reqParams, requestDate, cb) {
    if (this.anonymous) {
      throw new errors.AnonymousRequestError('Presigned ' + method + ' url cannot be generated for anonymous requests');
    }
    if ((0, _helper.isFunction)(requestDate)) {
      cb = requestDate;
      requestDate = new Date();
    }
    if ((0, _helper.isFunction)(reqParams)) {
      cb = reqParams;
      reqParams = {};
      requestDate = new Date();
    }
    if ((0, _helper.isFunction)(expires)) {
      cb = expires;
      reqParams = {};
      expires = 24 * 60 * 60 * 7; // 7 days in seconds
      requestDate = new Date();
    }
    if (!(0, _helper.isNumber)(expires)) {
      throw new TypeError('expires should be of type "number"');
    }
    if (!(0, _helper.isObject)(reqParams)) {
      throw new TypeError('reqParams should be of type "object"');
    }
    if (!(0, _helper.isValidDate)(requestDate)) {
      throw new TypeError('requestDate should be of type "Date" and valid');
    }
    if (!(0, _helper.isFunction)(cb)) {
      throw new TypeError('callback should be of type "function"');
    }
    var query = querystring.stringify(reqParams);
    this.getBucketRegion(bucketName, (e, region) => {
      if (e) {
        return cb(e);
      }
      // This statement is added to ensure that we send error through
      // callback on presign failure.
      var url;
      var reqOptions = this.getRequestOptions({
        method,
        region,
        bucketName,
        objectName,
        query
      });
      this.checkAndRefreshCreds();
      try {
        url = (0, _signing.presignSignatureV4)(reqOptions, this.accessKey, this.secretKey, this.sessionToken, region, requestDate, expires);
      } catch (pe) {
        return cb(pe);
      }
      cb(null, url);
    });
  }

  // Generate a presigned URL for GET
  //
  // __Arguments__
  // * `bucketName` _string_: name of the bucket
  // * `objectName` _string_: name of the object
  // * `expiry` _number_: expiry in seconds (optional, default 7 days)
  // * `respHeaders` _object_: response headers to override or request params for query (optional) e.g {versionId:"10fa9946-3f64-4137-a58f-888065c0732e"}
  // * `requestDate` _Date_: A date object, the url will be issued at (optional)
  presignedGetObject(bucketName, objectName, expires, respHeaders, requestDate, cb) {
    if (!(0, _helper.isValidBucketName)(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName);
    }
    if (!(0, _helper.isValidObjectName)(objectName)) {
      throw new errors.InvalidObjectNameError(`Invalid object name: ${objectName}`);
    }
    if ((0, _helper.isFunction)(respHeaders)) {
      cb = respHeaders;
      respHeaders = {};
      requestDate = new Date();
    }
    var validRespHeaders = ['response-content-type', 'response-content-language', 'response-expires', 'response-cache-control', 'response-content-disposition', 'response-content-encoding'];
    validRespHeaders.forEach(header => {
      if (respHeaders !== undefined && respHeaders[header] !== undefined && !(0, _helper.isString)(respHeaders[header])) {
        throw new TypeError(`response header ${header} should be of type "string"`);
      }
    });
    return this.presignedUrl('GET', bucketName, objectName, expires, respHeaders, requestDate, cb);
  }

  // Generate a presigned URL for PUT. Using this URL, the browser can upload to S3 only with the specified object name.
  //
  // __Arguments__
  // * `bucketName` _string_: name of the bucket
  // * `objectName` _string_: name of the object
  // * `expiry` _number_: expiry in seconds (optional, default 7 days)
  presignedPutObject(bucketName, objectName, expires, cb) {
    if (!(0, _helper.isValidBucketName)(bucketName)) {
      throw new errors.InvalidBucketNameError(`Invalid bucket name: ${bucketName}`);
    }
    if (!(0, _helper.isValidObjectName)(objectName)) {
      throw new errors.InvalidObjectNameError(`Invalid object name: ${objectName}`);
    }
    return this.presignedUrl('PUT', bucketName, objectName, expires, cb);
  }

  // return PostPolicy object
  newPostPolicy() {
    return new _postPolicy.PostPolicy();
  }

  // presignedPostPolicy can be used in situations where we want more control on the upload than what
  // presignedPutObject() provides. i.e Using presignedPostPolicy we will be able to put policy restrictions
  // on the object's `name` `bucket` `expiry` `Content-Type` `Content-Disposition` `metaData`
  presignedPostPolicy(postPolicy, cb) {
    if (this.anonymous) {
      throw new errors.AnonymousRequestError('Presigned POST policy cannot be generated for anonymous requests');
    }
    if (!(0, _helper.isObject)(postPolicy)) {
      throw new TypeError('postPolicy should be of type "object"');
    }
    if (!(0, _helper.isFunction)(cb)) {
      throw new TypeError('cb should be of type "function"');
    }
    this.getBucketRegion(postPolicy.formData.bucket, (e, region) => {
      if (e) {
        return cb(e);
      }
      var date = new Date();
      var dateStr = (0, _helper.makeDateLong)(date);
      this.checkAndRefreshCreds();
      if (!postPolicy.policy.expiration) {
        // 'expiration' is mandatory field for S3.
        // Set default expiration date of 7 days.
        var expires = new Date();
        expires.setSeconds(24 * 60 * 60 * 7);
        postPolicy.setExpires(expires);
      }
      postPolicy.policy.conditions.push(['eq', '$x-amz-date', dateStr]);
      postPolicy.formData['x-amz-date'] = dateStr;
      postPolicy.policy.conditions.push(['eq', '$x-amz-algorithm', 'AWS4-HMAC-SHA256']);
      postPolicy.formData['x-amz-algorithm'] = 'AWS4-HMAC-SHA256';
      postPolicy.policy.conditions.push(['eq', '$x-amz-credential', this.accessKey + '/' + (0, _helper.getScope)(region, date)]);
      postPolicy.formData['x-amz-credential'] = this.accessKey + '/' + (0, _helper.getScope)(region, date);
      if (this.sessionToken) {
        postPolicy.policy.conditions.push(['eq', '$x-amz-security-token', this.sessionToken]);
        postPolicy.formData['x-amz-security-token'] = this.sessionToken;
      }
      var policyBase64 = Buffer.from(JSON.stringify(postPolicy.policy)).toString('base64');
      postPolicy.formData.policy = policyBase64;
      var signature = (0, _signing.postPresignSignatureV4)(region, date, this.secretKey, policyBase64);
      postPolicy.formData['x-amz-signature'] = signature;
      var opts = {};
      opts.region = region;
      opts.bucketName = postPolicy.formData.bucket;
      var reqOptions = this.getRequestOptions(opts);
      var portStr = this.port == 80 || this.port === 443 ? '' : `:${this.port.toString()}`;
      var urlStr = `${reqOptions.protocol}//${reqOptions.host}${portStr}${reqOptions.path}`;
      cb(null, {
        postURL: urlStr,
        formData: postPolicy.formData
      });
    });
  }

  // Calls implemented below are related to multipart.

  // Initiate a new multipart upload.
  initiateNewMultipartUpload(bucketName, objectName, metaData, cb) {
    if (!(0, _helper.isValidBucketName)(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName);
    }
    if (!(0, _helper.isValidObjectName)(objectName)) {
      throw new errors.InvalidObjectNameError(`Invalid object name: ${objectName}`);
    }
    if (!(0, _helper.isObject)(metaData)) {
      throw new errors.InvalidObjectNameError('contentType should be of type "object"');
    }
    var method = 'POST';
    let headers = Object.assign({}, metaData);
    var query = 'uploads';
    this.makeRequest({
      method,
      bucketName,
      objectName,
      query,
      headers
    }, '', [200], '', true, (e, response) => {
      if (e) {
        return cb(e);
      }
      var transformer = transformers.getInitiateMultipartTransformer();
      (0, _helper.pipesetup)(response, transformer).on('error', e => cb(e)).on('data', uploadId => cb(null, uploadId));
    });
  }

  // Complete the multipart upload. After all the parts are uploaded issuing
  // this call will aggregate the parts on the server into a single object.
  completeMultipartUpload(bucketName, objectName, uploadId, etags, cb) {
    if (!(0, _helper.isValidBucketName)(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName);
    }
    if (!(0, _helper.isValidObjectName)(objectName)) {
      throw new errors.InvalidObjectNameError(`Invalid object name: ${objectName}`);
    }
    if (!(0, _helper.isString)(uploadId)) {
      throw new TypeError('uploadId should be of type "string"');
    }
    if (!(0, _helper.isObject)(etags)) {
      throw new TypeError('etags should be of type "Array"');
    }
    if (!(0, _helper.isFunction)(cb)) {
      throw new TypeError('cb should be of type "function"');
    }
    if (!uploadId) {
      throw new errors.InvalidArgumentError('uploadId cannot be empty');
    }
    var method = 'POST';
    var query = `uploadId=${(0, _helper.uriEscape)(uploadId)}`;
    var parts = [];
    etags.forEach(element => {
      parts.push({
        Part: [{
          PartNumber: element.part
        }, {
          ETag: element.etag
        }]
      });
    });
    var payloadObject = {
      CompleteMultipartUpload: parts
    };
    var payload = _xml(payloadObject);
    this.makeRequest({
      method,
      bucketName,
      objectName,
      query
    }, payload, [200], '', true, (e, response) => {
      if (e) {
        return cb(e);
      }
      var transformer = transformers.getCompleteMultipartTransformer();
      (0, _helper.pipesetup)(response, transformer).on('error', e => cb(e)).on('data', result => {
        if (result.errCode) {
          // Multipart Complete API returns an error XML after a 200 http status
          cb(new errors.S3Error(result.errMessage));
        } else {
          const completeMultipartResult = {
            etag: result.etag,
            versionId: (0, _helper.getVersionId)(response.headers)
          };
          cb(null, completeMultipartResult);
        }
      });
    });
  }

  // Get part-info of all parts of an incomplete upload specified by uploadId.
  listParts(bucketName, objectName, uploadId, cb) {
    if (!(0, _helper.isValidBucketName)(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName);
    }
    if (!(0, _helper.isValidObjectName)(objectName)) {
      throw new errors.InvalidObjectNameError(`Invalid object name: ${objectName}`);
    }
    if (!(0, _helper.isString)(uploadId)) {
      throw new TypeError('uploadId should be of type "string"');
    }
    if (!uploadId) {
      throw new errors.InvalidArgumentError('uploadId cannot be empty');
    }
    var parts = [];
    var listNext = marker => {
      this.listPartsQuery(bucketName, objectName, uploadId, marker, (e, result) => {
        if (e) {
          cb(e);
          return;
        }
        parts = parts.concat(result.parts);
        if (result.isTruncated) {
          listNext(result.marker);
          return;
        }
        cb(null, parts);
      });
    };
    listNext(0);
  }

  // Called by listParts to fetch a batch of part-info
  listPartsQuery(bucketName, objectName, uploadId, marker, cb) {
    if (!(0, _helper.isValidBucketName)(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName);
    }
    if (!(0, _helper.isValidObjectName)(objectName)) {
      throw new errors.InvalidObjectNameError(`Invalid object name: ${objectName}`);
    }
    if (!(0, _helper.isString)(uploadId)) {
      throw new TypeError('uploadId should be of type "string"');
    }
    if (!(0, _helper.isNumber)(marker)) {
      throw new TypeError('marker should be of type "number"');
    }
    if (!(0, _helper.isFunction)(cb)) {
      throw new TypeError('callback should be of type "function"');
    }
    if (!uploadId) {
      throw new errors.InvalidArgumentError('uploadId cannot be empty');
    }
    var query = '';
    if (marker && marker !== 0) {
      query += `part-number-marker=${marker}&`;
    }
    query += `uploadId=${(0, _helper.uriEscape)(uploadId)}`;
    var method = 'GET';
    this.makeRequest({
      method,
      bucketName,
      objectName,
      query
    }, '', [200], '', true, (e, response) => {
      if (e) {
        return cb(e);
      }
      var transformer = transformers.getListPartsTransformer();
      (0, _helper.pipesetup)(response, transformer).on('error', e => cb(e)).on('data', data => cb(null, data));
    });
  }

  // Called by listIncompleteUploads to fetch a batch of incomplete uploads.
  listIncompleteUploadsQuery(bucketName, prefix, keyMarker, uploadIdMarker, delimiter) {
    if (!(0, _helper.isValidBucketName)(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName);
    }
    if (!(0, _helper.isString)(prefix)) {
      throw new TypeError('prefix should be of type "string"');
    }
    if (!(0, _helper.isString)(keyMarker)) {
      throw new TypeError('keyMarker should be of type "string"');
    }
    if (!(0, _helper.isString)(uploadIdMarker)) {
      throw new TypeError('uploadIdMarker should be of type "string"');
    }
    if (!(0, _helper.isString)(delimiter)) {
      throw new TypeError('delimiter should be of type "string"');
    }
    var queries = [];
    queries.push(`prefix=${(0, _helper.uriEscape)(prefix)}`);
    queries.push(`delimiter=${(0, _helper.uriEscape)(delimiter)}`);
    if (keyMarker) {
      keyMarker = (0, _helper.uriEscape)(keyMarker);
      queries.push(`key-marker=${keyMarker}`);
    }
    if (uploadIdMarker) {
      queries.push(`upload-id-marker=${uploadIdMarker}`);
    }
    var maxUploads = 1000;
    queries.push(`max-uploads=${maxUploads}`);
    queries.sort();
    queries.unshift('uploads');
    var query = '';
    if (queries.length > 0) {
      query = `${queries.join('&')}`;
    }
    var method = 'GET';
    var transformer = transformers.getListMultipartTransformer();
    this.makeRequest({
      method,
      bucketName,
      query
    }, '', [200], '', true, (e, response) => {
      if (e) {
        return transformer.emit('error', e);
      }
      (0, _helper.pipesetup)(response, transformer);
    });
    return transformer;
  }

  // Find uploadId of an incomplete upload.
  findUploadId(bucketName, objectName, cb) {
    if (!(0, _helper.isValidBucketName)(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName);
    }
    if (!(0, _helper.isValidObjectName)(objectName)) {
      throw new errors.InvalidObjectNameError(`Invalid object name: ${objectName}`);
    }
    if (!(0, _helper.isFunction)(cb)) {
      throw new TypeError('cb should be of type "function"');
    }
    var latestUpload;
    var listNext = (keyMarker, uploadIdMarker) => {
      this.listIncompleteUploadsQuery(bucketName, objectName, keyMarker, uploadIdMarker, '').on('error', e => cb(e)).on('data', result => {
        result.uploads.forEach(upload => {
          if (upload.key === objectName) {
            if (!latestUpload || upload.initiated.getTime() > latestUpload.initiated.getTime()) {
              latestUpload = upload;
              return;
            }
          }
        });
        if (result.isTruncated) {
          listNext(result.nextKeyMarker, result.nextUploadIdMarker);
          return;
        }
        if (latestUpload) {
          return cb(null, latestUpload.uploadId);
        }
        cb(null, undefined);
      });
    };
    listNext('', '');
  }

  // Returns a function that can be used for uploading objects.
  // If multipart === true, it returns function that is used to upload
  // a part of the multipart.
  getUploader(bucketName, objectName, metaData, multipart) {
    if (!(0, _helper.isValidBucketName)(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName);
    }
    if (!(0, _helper.isValidObjectName)(objectName)) {
      throw new errors.InvalidObjectNameError(`Invalid object name: ${objectName}`);
    }
    if (!(0, _helper.isBoolean)(multipart)) {
      throw new TypeError('multipart should be of type "boolean"');
    }
    if (!(0, _helper.isObject)(metaData)) {
      throw new TypeError('metadata should be of type "object"');
    }
    var validate = (stream, length, sha256sum, md5sum, cb) => {
      if (!(0, _helper.isReadableStream)(stream)) {
        throw new TypeError('stream should be of type "Stream"');
      }
      if (!(0, _helper.isNumber)(length)) {
        throw new TypeError('length should be of type "number"');
      }
      if (!(0, _helper.isString)(sha256sum)) {
        throw new TypeError('sha256sum should be of type "string"');
      }
      if (!(0, _helper.isString)(md5sum)) {
        throw new TypeError('md5sum should be of type "string"');
      }
      if (!(0, _helper.isFunction)(cb)) {
        throw new TypeError('callback should be of type "function"');
      }
    };
    var simpleUploader = (...args) => {
      validate(...args);
      var query = '';
      upload(query, ...args);
    };
    var multipartUploader = (uploadId, partNumber, ...rest) => {
      if (!(0, _helper.isString)(uploadId)) {
        throw new TypeError('uploadId should be of type "string"');
      }
      if (!(0, _helper.isNumber)(partNumber)) {
        throw new TypeError('partNumber should be of type "number"');
      }
      if (!uploadId) {
        throw new errors.InvalidArgumentError('Empty uploadId');
      }
      if (!partNumber) {
        throw new errors.InvalidArgumentError('partNumber cannot be 0');
      }
      validate(...rest);
      var query = `partNumber=${partNumber}&uploadId=${(0, _helper.uriEscape)(uploadId)}`;
      upload(query, ...rest);
    };
    var upload = (query, stream, length, sha256sum, md5sum, cb) => {
      var method = 'PUT';
      let headers = {
        'Content-Length': length
      };
      if (!multipart) {
        headers = Object.assign({}, metaData, headers);
      }
      if (!this.enableSHA256) {
        headers['Content-MD5'] = md5sum;
      }
      this.makeRequestStream({
        method,
        bucketName,
        objectName,
        query,
        headers
      }, stream, sha256sum, [200], '', true, (e, response) => {
        if (e) {
          return cb(e);
        }
        const result = {
          etag: (0, _helper.sanitizeETag)(response.headers.etag),
          versionId: (0, _helper.getVersionId)(response.headers)
        };
        // Ignore the 'data' event so that the stream closes. (nodejs stream requirement)
        response.on('data', () => {});
        cb(null, result);
      });
    };
    if (multipart) {
      return multipartUploader;
    }
    return simpleUploader;
  }

  // Remove all the notification configurations in the S3 provider
  setBucketNotification(bucketName, config, cb) {
    if (!(0, _helper.isValidBucketName)(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName);
    }
    if (!(0, _helper.isObject)(config)) {
      throw new TypeError('notification config should be of type "Object"');
    }
    if (!(0, _helper.isFunction)(cb)) {
      throw new TypeError('callback should be of type "function"');
    }
    var method = 'PUT';
    var query = 'notification';
    var builder = new _xml2js.Builder({
      rootName: 'NotificationConfiguration',
      renderOpts: {
        pretty: false
      },
      headless: true
    });
    var payload = builder.buildObject(config);
    this.makeRequest({
      method,
      bucketName,
      query
    }, payload, [200], '', false, cb);
  }
  removeAllBucketNotification(bucketName, cb) {
    this.setBucketNotification(bucketName, new _notification.NotificationConfig(), cb);
  }

  // Return the list of notification configurations stored
  // in the S3 provider
  getBucketNotification(bucketName, cb) {
    if (!(0, _helper.isValidBucketName)(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName);
    }
    if (!(0, _helper.isFunction)(cb)) {
      throw new TypeError('callback should be of type "function"');
    }
    var method = 'GET';
    var query = 'notification';
    this.makeRequest({
      method,
      bucketName,
      query
    }, '', [200], '', true, (e, response) => {
      if (e) {
        return cb(e);
      }
      var transformer = transformers.getBucketNotificationTransformer();
      var bucketNotification;
      (0, _helper.pipesetup)(response, transformer).on('data', result => bucketNotification = result).on('error', e => cb(e)).on('end', () => cb(null, bucketNotification));
    });
  }

  // Listens for bucket notifications. Returns an EventEmitter.
  listenBucketNotification(bucketName, prefix, suffix, events) {
    if (!(0, _helper.isValidBucketName)(bucketName)) {
      throw new errors.InvalidBucketNameError(`Invalid bucket name: ${bucketName}`);
    }
    if (!(0, _helper.isString)(prefix)) {
      throw new TypeError('prefix must be of type string');
    }
    if (!(0, _helper.isString)(suffix)) {
      throw new TypeError('suffix must be of type string');
    }
    if (!Array.isArray(events)) {
      throw new TypeError('events must be of type Array');
    }
    let listener = new _notification.NotificationPoller(this, bucketName, prefix, suffix, events);
    listener.start();
    return listener;
  }
  getBucketVersioning(bucketName, cb) {
    if (!(0, _helper.isValidBucketName)(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName);
    }
    if (!(0, _helper.isFunction)(cb)) {
      throw new errors.InvalidArgumentError('callback should be of type "function"');
    }
    var method = 'GET';
    var query = 'versioning';
    this.makeRequest({
      method,
      bucketName,
      query
    }, '', [200], '', true, (e, response) => {
      if (e) {
        return cb(e);
      }
      let versionConfig = Buffer.from('');
      (0, _helper.pipesetup)(response, transformers.bucketVersioningTransformer()).on('data', data => {
        versionConfig = data;
      }).on('error', cb).on('end', () => {
        cb(null, versionConfig);
      });
    });
  }
  setBucketVersioning(bucketName, versionConfig, cb) {
    if (!(0, _helper.isValidBucketName)(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName);
    }
    if (!Object.keys(versionConfig).length) {
      throw new errors.InvalidArgumentError('versionConfig should be of type "object"');
    }
    if (!(0, _helper.isFunction)(cb)) {
      throw new TypeError('callback should be of type "function"');
    }
    var method = 'PUT';
    var query = 'versioning';
    var builder = new _xml2js.Builder({
      rootName: 'VersioningConfiguration',
      renderOpts: {
        pretty: false
      },
      headless: true
    });
    var payload = builder.buildObject(versionConfig);
    this.makeRequest({
      method,
      bucketName,
      query
    }, payload, [200], '', false, cb);
  }

  /** To set Tags on a bucket or object based on the params
   *  __Arguments__
   * taggingParams _object_ Which contains the following properties
   *  bucketName _string_,
   *  objectName _string_ (Optional),
   *  tags _object_ of the form {'<tag-key-1>':'<tag-value-1>','<tag-key-2>':'<tag-value-2>'}
   *  putOpts _object_ (Optional) e.g {versionId:"my-object-version-id"},
   *  cb(error)` _function_ - callback function with `err` as the error argument. `err` is null if the operation is successful.
   */
  setTagging(taggingParams) {
    const {
      bucketName,
      objectName,
      tags,
      putOpts = {},
      cb
    } = taggingParams;
    const method = 'PUT';
    let query = 'tagging';
    if (putOpts && putOpts.versionId) {
      query = `${query}&versionId=${putOpts.versionId}`;
    }
    const tagsList = [];
    for (const [key, value] of Object.entries(tags)) {
      tagsList.push({
        Key: key,
        Value: value
      });
    }
    const taggingConfig = {
      Tagging: {
        TagSet: {
          Tag: tagsList
        }
      }
    };
    const encoder = new _webEncoding.TextEncoder();
    const headers = {};
    const builder = new _xml2js.Builder({
      headless: true,
      renderOpts: {
        pretty: false
      }
    });
    let payload = builder.buildObject(taggingConfig);
    payload = encoder.encode(payload);
    headers['Content-MD5'] = (0, _helper.toMd5)(payload);
    const requestOptions = {
      method,
      bucketName,
      query,
      headers
    };
    if (objectName) {
      requestOptions['objectName'] = objectName;
    }
    headers['Content-MD5'] = (0, _helper.toMd5)(payload);
    this.makeRequest(requestOptions, payload, [200], '', false, cb);
  }

  /** Set Tags on a Bucket
   * __Arguments__
   * bucketName _string_
   * tags _object_ of the form {'<tag-key-1>':'<tag-value-1>','<tag-key-2>':'<tag-value-2>'}
   * `cb(error)` _function_ - callback function with `err` as the error argument. `err` is null if the operation is successful.
   */
  setBucketTagging(bucketName, tags, cb) {
    if (!(0, _helper.isValidBucketName)(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName);
    }
    if (!(0, _helper.isObject)(tags)) {
      throw new errors.InvalidArgumentError('tags should be of type "object"');
    }
    if (Object.keys(tags).length > 10) {
      throw new errors.InvalidArgumentError('maximum tags allowed is 10"');
    }
    if (!(0, _helper.isFunction)(cb)) {
      throw new errors.InvalidArgumentError('callback should be of type "function"');
    }
    return this.setTagging({
      bucketName,
      tags,
      cb
    });
  }

  /** Set Tags on an Object
   * __Arguments__
   * bucketName _string_
   * objectName _string_
   *  * tags _object_ of the form {'<tag-key-1>':'<tag-value-1>','<tag-key-2>':'<tag-value-2>'}
   *  putOpts _object_ (Optional) e.g {versionId:"my-object-version-id"},
   * `cb(error)` _function_ - callback function with `err` as the error argument. `err` is null if the operation is successful.
   */
  setObjectTagging(bucketName, objectName, tags, putOpts = {}, cb) {
    if (!(0, _helper.isValidBucketName)(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName);
    }
    if (!(0, _helper.isValidObjectName)(objectName)) {
      throw new errors.InvalidBucketNameError('Invalid object name: ' + objectName);
    }
    if ((0, _helper.isFunction)(putOpts)) {
      cb = putOpts;
      putOpts = {};
    }
    if (!(0, _helper.isObject)(tags)) {
      throw new errors.InvalidArgumentError('tags should be of type "object"');
    }
    if (Object.keys(tags).length > 10) {
      throw new errors.InvalidArgumentError('Maximum tags allowed is 10"');
    }
    if (!(0, _helper.isFunction)(cb)) {
      throw new TypeError('callback should be of type "function"');
    }
    return this.setTagging({
      bucketName,
      objectName,
      tags,
      putOpts,
      cb
    });
  }

  /** Remove Tags on an Bucket/Object based on params
   * __Arguments__
   * bucketName _string_
   * objectName _string_ (optional)
   * removeOpts _object_ (Optional) e.g {versionId:"my-object-version-id"},
   * `cb(error)` _function_ - callback function with `err` as the error argument. `err` is null if the operation is successful.
   */
  removeTagging({
    bucketName,
    objectName,
    removeOpts,
    cb
  }) {
    const method = 'DELETE';
    let query = 'tagging';
    if (removeOpts && Object.keys(removeOpts).length && removeOpts.versionId) {
      query = `${query}&versionId=${removeOpts.versionId}`;
    }
    const requestOptions = {
      method,
      bucketName,
      objectName,
      query
    };
    if (objectName) {
      requestOptions['objectName'] = objectName;
    }
    this.makeRequest(requestOptions, '', [200, 204], '', true, cb);
  }

  /** Remove Tags associated with a bucket
   *  __Arguments__
   * bucketName _string_
   * `cb(error)` _function_ - callback function with `err` as the error argument. `err` is null if the operation is successful.
   */
  removeBucketTagging(bucketName, cb) {
    if (!(0, _helper.isValidBucketName)(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName);
    }
    if (!(0, _helper.isFunction)(cb)) {
      throw new TypeError('callback should be of type "function"');
    }
    return this.removeTagging({
      bucketName,
      cb
    });
  }

  /** Remove tags associated with an object
   * __Arguments__
   * bucketName _string_
   * objectName _string_
   * removeOpts _object_ (Optional) e.g. {VersionID:"my-object-version-id"}
   * `cb(error)` _function_ - callback function with `err` as the error argument. `err` is null if the operation is successful.
   */
  removeObjectTagging(bucketName, objectName, removeOpts, cb) {
    if (!(0, _helper.isValidBucketName)(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName);
    }
    if (!(0, _helper.isValidObjectName)(objectName)) {
      throw new errors.InvalidBucketNameError('Invalid object name: ' + objectName);
    }
    if ((0, _helper.isFunction)(removeOpts)) {
      cb = removeOpts;
      removeOpts = {};
    }
    if (removeOpts && Object.keys(removeOpts).length && !(0, _helper.isObject)(removeOpts)) {
      throw new errors.InvalidArgumentError('removeOpts should be of type "object"');
    }
    if (!(0, _helper.isFunction)(cb)) {
      throw new TypeError('callback should be of type "function"');
    }
    return this.removeTagging({
      bucketName,
      objectName,
      removeOpts,
      cb
    });
  }

  /** Get Tags associated with a Bucket
   *  __Arguments__
   * bucketName _string_
   * `cb(error, tags)` _function_ - callback function with `err` as the error argument. `err` is null if the operation is successful.
   */
  getBucketTagging(bucketName, cb) {
    const method = 'GET';
    const query = 'tagging';
    const requestOptions = {
      method,
      bucketName,
      query
    };
    this.makeRequest(requestOptions, '', [200], '', true, (e, response) => {
      var transformer = transformers.getTagsTransformer();
      if (e) {
        return cb(e);
      }
      let tagsList;
      (0, _helper.pipesetup)(response, transformer).on('data', result => tagsList = result).on('error', e => cb(e)).on('end', () => cb(null, tagsList));
    });
  }

  /** Get the tags associated with a bucket OR an object
   * bucketName _string_
   * objectName _string_ (Optional)
   * getOpts _object_ (Optional) e.g {versionId:"my-object-version-id"}
   * `cb(error, tags)` _function_ - callback function with `err` as the error argument. `err` is null if the operation is successful.
   */
  getObjectTagging(bucketName, objectName, getOpts = {}, cb = () => false) {
    const method = 'GET';
    let query = 'tagging';
    if (!(0, _helper.isValidBucketName)(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName);
    }
    if (!(0, _helper.isValidObjectName)(objectName)) {
      throw new errors.InvalidBucketNameError('Invalid object name: ' + objectName);
    }
    if ((0, _helper.isFunction)(getOpts)) {
      cb = getOpts;
      getOpts = {};
    }
    if (!(0, _helper.isObject)(getOpts)) {
      throw new errors.InvalidArgumentError('getOpts should be of type "object"');
    }
    if (!(0, _helper.isFunction)(cb)) {
      throw new TypeError('callback should be of type "function"');
    }
    if (getOpts && getOpts.versionId) {
      query = `${query}&versionId=${getOpts.versionId}`;
    }
    const requestOptions = {
      method,
      bucketName,
      query
    };
    if (objectName) {
      requestOptions['objectName'] = objectName;
    }
    this.makeRequest(requestOptions, '', [200], '', true, (e, response) => {
      const transformer = transformers.getTagsTransformer();
      if (e) {
        return cb(e);
      }
      let tagsList;
      (0, _helper.pipesetup)(response, transformer).on('data', result => tagsList = result).on('error', e => cb(e)).on('end', () => cb(null, tagsList));
    });
  }

  /**
   * Apply lifecycle configuration on a bucket.
   * bucketName _string_
   * policyConfig _object_ a valid policy configuration object.
   * `cb(error)` _function_ - callback function with `err` as the error argument. `err` is null if the operation is successful.
   */
  applyBucketLifecycle(bucketName, policyConfig, cb) {
    const method = 'PUT';
    const query = 'lifecycle';
    const encoder = new _webEncoding.TextEncoder();
    const headers = {};
    const builder = new _xml2js.Builder({
      rootName: 'LifecycleConfiguration',
      headless: true,
      renderOpts: {
        pretty: false
      }
    });
    let payload = builder.buildObject(policyConfig);
    payload = encoder.encode(payload);
    const requestOptions = {
      method,
      bucketName,
      query,
      headers
    };
    headers['Content-MD5'] = (0, _helper.toMd5)(payload);
    this.makeRequest(requestOptions, payload, [200], '', false, cb);
  }

  /** Remove lifecycle configuration of a bucket.
   * bucketName _string_
   * `cb(error)` _function_ - callback function with `err` as the error argument. `err` is null if the operation is successful.
   */
  removeBucketLifecycle(bucketName, cb) {
    if (!(0, _helper.isValidBucketName)(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName);
    }
    const method = 'DELETE';
    const query = 'lifecycle';
    this.makeRequest({
      method,
      bucketName,
      query
    }, '', [204], '', false, cb);
  }

  /** Set/Override lifecycle configuration on a bucket. if the configuration is empty, it removes the configuration.
   * bucketName _string_
   * lifeCycleConfig _object_ one of the following values: (null or '') to remove the lifecycle configuration. or a valid lifecycle configuration
   * `cb(error)` _function_ - callback function with `err` as the error argument. `err` is null if the operation is successful.
   */
  setBucketLifecycle(bucketName, lifeCycleConfig = null, cb) {
    if (!(0, _helper.isValidBucketName)(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName);
    }
    if (_lodash.isEmpty(lifeCycleConfig)) {
      this.removeBucketLifecycle(bucketName, cb);
    } else {
      this.applyBucketLifecycle(bucketName, lifeCycleConfig, cb);
    }
  }

  /** Get lifecycle configuration on a bucket.
   * bucketName _string_
   * `cb(config)` _function_ - callback function with lifecycle configuration as the error argument.
   */
  getBucketLifecycle(bucketName, cb) {
    if (!(0, _helper.isValidBucketName)(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName);
    }
    const method = 'GET';
    const query = 'lifecycle';
    const requestOptions = {
      method,
      bucketName,
      query
    };
    this.makeRequest(requestOptions, '', [200], '', true, (e, response) => {
      const transformer = transformers.lifecycleTransformer();
      if (e) {
        return cb(e);
      }
      let lifecycleConfig;
      (0, _helper.pipesetup)(response, transformer).on('data', result => lifecycleConfig = result).on('error', e => cb(e)).on('end', () => cb(null, lifecycleConfig));
    });
  }
  setObjectLockConfig(bucketName, lockConfigOpts = {}, cb) {
    const retentionModes = [_type.RETENTION_MODES.COMPLIANCE, _type.RETENTION_MODES.GOVERNANCE];
    const validUnits = [_type.RETENTION_VALIDITY_UNITS.DAYS, _type.RETENTION_VALIDITY_UNITS.YEARS];
    if (!(0, _helper.isValidBucketName)(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName);
    }
    if (lockConfigOpts.mode && !retentionModes.includes(lockConfigOpts.mode)) {
      throw new TypeError(`lockConfigOpts.mode should be one of ${retentionModes}`);
    }
    if (lockConfigOpts.unit && !validUnits.includes(lockConfigOpts.unit)) {
      throw new TypeError(`lockConfigOpts.unit should be one of ${validUnits}`);
    }
    if (lockConfigOpts.validity && !(0, _helper.isNumber)(lockConfigOpts.validity)) {
      throw new TypeError(`lockConfigOpts.validity should be a number`);
    }
    const method = 'PUT';
    const query = 'object-lock';
    let config = {
      ObjectLockEnabled: 'Enabled'
    };
    const configKeys = Object.keys(lockConfigOpts);
    // Check if keys are present and all keys are present.
    if (configKeys.length > 0) {
      if (_lodash.difference(configKeys, ['unit', 'mode', 'validity']).length !== 0) {
        throw new TypeError(`lockConfigOpts.mode,lockConfigOpts.unit,lockConfigOpts.validity all the properties should be specified.`);
      } else {
        config.Rule = {
          DefaultRetention: {}
        };
        if (lockConfigOpts.mode) {
          config.Rule.DefaultRetention.Mode = lockConfigOpts.mode;
        }
        if (lockConfigOpts.unit === _type.RETENTION_VALIDITY_UNITS.DAYS) {
          config.Rule.DefaultRetention.Days = lockConfigOpts.validity;
        } else if (lockConfigOpts.unit === _type.RETENTION_VALIDITY_UNITS.YEARS) {
          config.Rule.DefaultRetention.Years = lockConfigOpts.validity;
        }
      }
    }
    const builder = new _xml2js.Builder({
      rootName: 'ObjectLockConfiguration',
      renderOpts: {
        pretty: false
      },
      headless: true
    });
    const payload = builder.buildObject(config);
    const headers = {};
    headers['Content-MD5'] = (0, _helper.toMd5)(payload);
    this.makeRequest({
      method,
      bucketName,
      query,
      headers
    }, payload, [200], '', false, cb);
  }
  getObjectLockConfig(bucketName, cb) {
    if (!(0, _helper.isValidBucketName)(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName);
    }
    if (!(0, _helper.isFunction)(cb)) {
      throw new errors.InvalidArgumentError('callback should be of type "function"');
    }
    const method = 'GET';
    const query = 'object-lock';
    this.makeRequest({
      method,
      bucketName,
      query
    }, '', [200], '', true, (e, response) => {
      if (e) {
        return cb(e);
      }
      let objectLockConfig = Buffer.from('');
      (0, _helper.pipesetup)(response, transformers.objectLockTransformer()).on('data', data => {
        objectLockConfig = data;
      }).on('error', cb).on('end', () => {
        cb(null, objectLockConfig);
      });
    });
  }
  putObjectRetention(bucketName, objectName, retentionOpts = {}, cb) {
    if (!(0, _helper.isValidBucketName)(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName);
    }
    if (!(0, _helper.isValidObjectName)(objectName)) {
      throw new errors.InvalidObjectNameError(`Invalid object name: ${objectName}`);
    }
    if (!(0, _helper.isObject)(retentionOpts)) {
      throw new errors.InvalidArgumentError('retentionOpts should be of type "object"');
    } else {
      if (retentionOpts.governanceBypass && !(0, _helper.isBoolean)(retentionOpts.governanceBypass)) {
        throw new errors.InvalidArgumentError('Invalid value for governanceBypass', retentionOpts.governanceBypass);
      }
      if (retentionOpts.mode && ![_type.RETENTION_MODES.COMPLIANCE, _type.RETENTION_MODES.GOVERNANCE].includes(retentionOpts.mode)) {
        throw new errors.InvalidArgumentError('Invalid object retention mode ', retentionOpts.mode);
      }
      if (retentionOpts.retainUntilDate && !(0, _helper.isString)(retentionOpts.retainUntilDate)) {
        throw new errors.InvalidArgumentError('Invalid value for retainUntilDate', retentionOpts.retainUntilDate);
      }
      if (retentionOpts.versionId && !(0, _helper.isString)(retentionOpts.versionId)) {
        throw new errors.InvalidArgumentError('Invalid value for versionId', retentionOpts.versionId);
      }
    }
    if (!(0, _helper.isFunction)(cb)) {
      throw new TypeError('callback should be of type "function"');
    }
    const method = 'PUT';
    let query = 'retention';
    const headers = {};
    if (retentionOpts.governanceBypass) {
      headers['X-Amz-Bypass-Governance-Retention'] = true;
    }
    const builder = new _xml2js.Builder({
      rootName: 'Retention',
      renderOpts: {
        pretty: false
      },
      headless: true
    });
    const params = {};
    if (retentionOpts.mode) {
      params.Mode = retentionOpts.mode;
    }
    if (retentionOpts.retainUntilDate) {
      params.RetainUntilDate = retentionOpts.retainUntilDate;
    }
    if (retentionOpts.versionId) {
      query += `&versionId=${retentionOpts.versionId}`;
    }
    let payload = builder.buildObject(params);
    headers['Content-MD5'] = (0, _helper.toMd5)(payload);
    this.makeRequest({
      method,
      bucketName,
      objectName,
      query,
      headers
    }, payload, [200, 204], '', false, cb);
  }
  getObjectRetention(bucketName, objectName, getOpts, cb) {
    if (!(0, _helper.isValidBucketName)(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName);
    }
    if (!(0, _helper.isValidObjectName)(objectName)) {
      throw new errors.InvalidObjectNameError(`Invalid object name: ${objectName}`);
    }
    if (!(0, _helper.isObject)(getOpts)) {
      throw new errors.InvalidArgumentError('callback should be of type "object"');
    } else if (getOpts.versionId && !(0, _helper.isString)(getOpts.versionId)) {
      throw new errors.InvalidArgumentError('VersionID should be of type "string"');
    }
    if (cb && !(0, _helper.isFunction)(cb)) {
      throw new errors.InvalidArgumentError('callback should be of type "function"');
    }
    const method = 'GET';
    let query = 'retention';
    if (getOpts.versionId) {
      query += `&versionId=${getOpts.versionId}`;
    }
    this.makeRequest({
      method,
      bucketName,
      objectName,
      query
    }, '', [200], '', true, (e, response) => {
      if (e) {
        return cb(e);
      }
      let retentionConfig = Buffer.from('');
      (0, _helper.pipesetup)(response, transformers.objectRetentionTransformer()).on('data', data => {
        retentionConfig = data;
      }).on('error', cb).on('end', () => {
        cb(null, retentionConfig);
      });
    });
  }
  setBucketEncryption(bucketName, encryptionConfig, cb) {
    if (!(0, _helper.isValidBucketName)(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName);
    }
    if ((0, _helper.isFunction)(encryptionConfig)) {
      cb = encryptionConfig;
      encryptionConfig = null;
    }
    if (!_lodash.isEmpty(encryptionConfig) && encryptionConfig.Rule.length > 1) {
      throw new errors.InvalidArgumentError('Invalid Rule length. Only one rule is allowed.: ' + encryptionConfig.Rule);
    }
    if (cb && !(0, _helper.isFunction)(cb)) {
      throw new TypeError('callback should be of type "function"');
    }
    let encryptionObj = encryptionConfig;
    if (_lodash.isEmpty(encryptionConfig)) {
      encryptionObj = {
        // Default MinIO Server Supported Rule
        Rule: [{
          ApplyServerSideEncryptionByDefault: {
            SSEAlgorithm: 'AES256'
          }
        }]
      };
    }
    let method = 'PUT';
    let query = 'encryption';
    let builder = new _xml2js.Builder({
      rootName: 'ServerSideEncryptionConfiguration',
      renderOpts: {
        pretty: false
      },
      headless: true
    });
    let payload = builder.buildObject(encryptionObj);
    const headers = {};
    headers['Content-MD5'] = (0, _helper.toMd5)(payload);
    this.makeRequest({
      method,
      bucketName,
      query,
      headers
    }, payload, [200], '', false, cb);
  }
  getBucketEncryption(bucketName, cb) {
    if (!(0, _helper.isValidBucketName)(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName);
    }
    if (!(0, _helper.isFunction)(cb)) {
      throw new errors.InvalidArgumentError('callback should be of type "function"');
    }
    const method = 'GET';
    const query = 'encryption';
    this.makeRequest({
      method,
      bucketName,
      query
    }, '', [200], '', true, (e, response) => {
      if (e) {
        return cb(e);
      }
      let bucketEncConfig = Buffer.from('');
      (0, _helper.pipesetup)(response, transformers.bucketEncryptionTransformer()).on('data', data => {
        bucketEncConfig = data;
      }).on('error', cb).on('end', () => {
        cb(null, bucketEncConfig);
      });
    });
  }
  removeBucketEncryption(bucketName, cb) {
    if (!(0, _helper.isValidBucketName)(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName);
    }
    if (!(0, _helper.isFunction)(cb)) {
      throw new errors.InvalidArgumentError('callback should be of type "function"');
    }
    const method = 'DELETE';
    const query = 'encryption';
    this.makeRequest({
      method,
      bucketName,
      query
    }, '', [204], '', false, cb);
  }
  setBucketReplication(bucketName, replicationConfig = {}, cb) {
    if (!(0, _helper.isValidBucketName)(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName);
    }
    if (!(0, _helper.isObject)(replicationConfig)) {
      throw new errors.InvalidArgumentError('replicationConfig should be of type "object"');
    } else {
      if (_lodash.isEmpty(replicationConfig.role)) {
        throw new errors.InvalidArgumentError('Role cannot be empty');
      } else if (replicationConfig.role && !(0, _helper.isString)(replicationConfig.role)) {
        throw new errors.InvalidArgumentError('Invalid value for role', replicationConfig.role);
      }
      if (_lodash.isEmpty(replicationConfig.rules)) {
        throw new errors.InvalidArgumentError('Minimum one replication rule must be specified');
      }
    }
    if (!(0, _helper.isFunction)(cb)) {
      throw new TypeError('callback should be of type "function"');
    }
    const method = 'PUT';
    let query = 'replication';
    const headers = {};
    const replicationParamsConfig = {
      ReplicationConfiguration: {
        Role: replicationConfig.role,
        Rule: replicationConfig.rules
      }
    };
    const builder = new _xml2js.Builder({
      renderOpts: {
        pretty: false
      },
      headless: true
    });
    let payload = builder.buildObject(replicationParamsConfig);
    headers['Content-MD5'] = (0, _helper.toMd5)(payload);
    this.makeRequest({
      method,
      bucketName,
      query,
      headers
    }, payload, [200], '', false, cb);
  }
  getBucketReplication(bucketName, cb) {
    if (!(0, _helper.isValidBucketName)(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName);
    }
    if (!(0, _helper.isFunction)(cb)) {
      throw new errors.InvalidArgumentError('callback should be of type "function"');
    }
    const method = 'GET';
    const query = 'replication';
    this.makeRequest({
      method,
      bucketName,
      query
    }, '', [200], '', true, (e, response) => {
      if (e) {
        return cb(e);
      }
      let replicationConfig = Buffer.from('');
      (0, _helper.pipesetup)(response, transformers.replicationConfigTransformer()).on('data', data => {
        replicationConfig = data;
      }).on('error', cb).on('end', () => {
        cb(null, replicationConfig);
      });
    });
  }
  removeBucketReplication(bucketName, cb) {
    if (!(0, _helper.isValidBucketName)(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName);
    }
    const method = 'DELETE';
    const query = 'replication';
    this.makeRequest({
      method,
      bucketName,
      query
    }, '', [200, 204], '', false, cb);
  }
  getObjectLegalHold(bucketName, objectName, getOpts = {}, cb) {
    if (!(0, _helper.isValidBucketName)(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName);
    }
    if (!(0, _helper.isValidObjectName)(objectName)) {
      throw new errors.InvalidObjectNameError(`Invalid object name: ${objectName}`);
    }
    if ((0, _helper.isFunction)(getOpts)) {
      cb = getOpts;
      getOpts = {};
    }
    if (!(0, _helper.isObject)(getOpts)) {
      throw new TypeError('getOpts should be of type "Object"');
    } else if (Object.keys(getOpts).length > 0 && getOpts.versionId && !(0, _helper.isString)(getOpts.versionId)) {
      throw new TypeError('versionId should be of type string.:', getOpts.versionId);
    }
    if (!(0, _helper.isFunction)(cb)) {
      throw new errors.InvalidArgumentError('callback should be of type "function"');
    }
    const method = 'GET';
    let query = 'legal-hold';
    if (getOpts.versionId) {
      query += `&versionId=${getOpts.versionId}`;
    }
    this.makeRequest({
      method,
      bucketName,
      objectName,
      query
    }, '', [200], '', true, (e, response) => {
      if (e) {
        return cb(e);
      }
      let legalHoldConfig = Buffer.from('');
      (0, _helper.pipesetup)(response, transformers.objectLegalHoldTransformer()).on('data', data => {
        legalHoldConfig = data;
      }).on('error', cb).on('end', () => {
        cb(null, legalHoldConfig);
      });
    });
  }
  setObjectLegalHold(bucketName, objectName, setOpts = {}, cb) {
    if (!(0, _helper.isValidBucketName)(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName);
    }
    if (!(0, _helper.isValidObjectName)(objectName)) {
      throw new errors.InvalidObjectNameError(`Invalid object name: ${objectName}`);
    }
    const defaultOpts = {
      status: _type.LEGAL_HOLD_STATUS.ENABLED
    };
    if ((0, _helper.isFunction)(setOpts)) {
      cb = setOpts;
      setOpts = defaultOpts;
    }
    if (!(0, _helper.isObject)(setOpts)) {
      throw new TypeError('setOpts should be of type "Object"');
    } else {
      if (![_type.LEGAL_HOLD_STATUS.ENABLED, _type.LEGAL_HOLD_STATUS.DISABLED].includes(setOpts.status)) {
        throw new TypeError('Invalid status: ' + setOpts.status);
      }
      if (setOpts.versionId && !setOpts.versionId.length) {
        throw new TypeError('versionId should be of type string.:' + setOpts.versionId);
      }
    }
    if (!(0, _helper.isFunction)(cb)) {
      throw new errors.InvalidArgumentError('callback should be of type "function"');
    }
    if (_lodash.isEmpty(setOpts)) {
      setOpts = {
        defaultOpts
      };
    }
    const method = 'PUT';
    let query = 'legal-hold';
    if (setOpts.versionId) {
      query += `&versionId=${setOpts.versionId}`;
    }
    let config = {
      Status: setOpts.status
    };
    const builder = new _xml2js.Builder({
      rootName: 'LegalHold',
      renderOpts: {
        pretty: false
      },
      headless: true
    });
    const payload = builder.buildObject(config);
    const headers = {};
    headers['Content-MD5'] = (0, _helper.toMd5)(payload);
    this.makeRequest({
      method,
      bucketName,
      objectName,
      query,
      headers
    }, payload, [200], '', false, cb);
  }

  /**
   * Internal Method to abort a multipart upload request in case of any errors.
   * @param bucketName __string__ Bucket Name
   * @param objectName __string__ Object Name
   * @param uploadId __string__ id of a multipart upload to cancel during compose object sequence.
   * @param cb __function__ callback function
   */
  abortMultipartUpload(bucketName, objectName, uploadId, cb) {
    const method = 'DELETE';
    let query = `uploadId=${uploadId}`;
    const requestOptions = {
      method,
      bucketName,
      objectName: objectName,
      query
    };
    this.makeRequest(requestOptions, '', [204], '', false, cb);
  }

  /**
   * Internal method to upload a part during compose object.
   * @param partConfig __object__ contains the following.
   *    bucketName __string__
   *    objectName __string__
   *    uploadID __string__
   *    partNumber __number__
   *    headers __object__
   * @param cb called with null incase of error.
   */
  uploadPartCopy(partConfig, cb) {
    const {
      bucketName,
      objectName,
      uploadID,
      partNumber,
      headers
    } = partConfig;
    const method = 'PUT';
    let query = `uploadId=${uploadID}&partNumber=${partNumber}`;
    const requestOptions = {
      method,
      bucketName,
      objectName: objectName,
      query,
      headers
    };
    return this.makeRequest(requestOptions, '', [200], '', true, (e, response) => {
      let partCopyResult = Buffer.from('');
      if (e) {
        return cb(e);
      }
      (0, _helper.pipesetup)(response, transformers.uploadPartTransformer()).on('data', data => {
        partCopyResult = data;
      }).on('error', cb).on('end', () => {
        let uploadPartCopyRes = {
          etag: (0, _helper.sanitizeETag)(partCopyResult.ETag),
          key: objectName,
          part: partNumber
        };
        cb(null, uploadPartCopyRes);
      });
    });
  }
  composeObject(destObjConfig = {}, sourceObjList = [], cb) {
    const me = this; // many async flows. so store the ref.
    const sourceFilesLength = sourceObjList.length;
    if (!Array.isArray(sourceObjList)) {
      throw new errors.InvalidArgumentError('sourceConfig should an array of CopySourceOptions ');
    }
    if (!(destObjConfig instanceof _helpers.CopyDestinationOptions)) {
      throw new errors.InvalidArgumentError('destConfig should of type CopyDestinationOptions ');
    }
    if (sourceFilesLength < 1 || sourceFilesLength > _helper.PART_CONSTRAINTS.MAX_PARTS_COUNT) {
      throw new errors.InvalidArgumentError(`"There must be as least one and up to ${_helper.PART_CONSTRAINTS.MAX_PARTS_COUNT} source objects.`);
    }
    if (!(0, _helper.isFunction)(cb)) {
      throw new TypeError('callback should be of type "function"');
    }
    for (let i = 0; i < sourceFilesLength; i++) {
      if (!sourceObjList[i].validate()) {
        return false;
      }
    }
    if (!destObjConfig.validate()) {
      return false;
    }
    const getStatOptions = srcConfig => {
      let statOpts = {};
      if (!_lodash.isEmpty(srcConfig.VersionID)) {
        statOpts = {
          versionId: srcConfig.VersionID
        };
      }
      return statOpts;
    };
    const srcObjectSizes = [];
    let totalSize = 0;
    let totalParts = 0;
    const sourceObjStats = sourceObjList.map(srcItem => me.statObject(srcItem.Bucket, srcItem.Object, getStatOptions(srcItem)));
    return Promise.all(sourceObjStats).then(srcObjectInfos => {
      const validatedStats = srcObjectInfos.map((resItemStat, index) => {
        const srcConfig = sourceObjList[index];
        let srcCopySize = resItemStat.size;
        // Check if a segment is specified, and if so, is the
        // segment within object bounds?
        if (srcConfig.MatchRange) {
          // Since range is specified,
          //    0 <= src.srcStart <= src.srcEnd
          // so only invalid case to check is:
          const srcStart = srcConfig.Start;
          const srcEnd = srcConfig.End;
          if (srcEnd >= srcCopySize || srcStart < 0) {
            throw new errors.InvalidArgumentError(`CopySrcOptions ${index} has invalid segment-to-copy [${srcStart}, ${srcEnd}] (size is ${srcCopySize})`);
          }
          srcCopySize = srcEnd - srcStart + 1;
        }

        // Only the last source may be less than `absMinPartSize`
        if (srcCopySize < _helper.PART_CONSTRAINTS.ABS_MIN_PART_SIZE && index < sourceFilesLength - 1) {
          throw new errors.InvalidArgumentError(`CopySrcOptions ${index} is too small (${srcCopySize}) and it is not the last part.`);
        }

        // Is data to copy too large?
        totalSize += srcCopySize;
        if (totalSize > _helper.PART_CONSTRAINTS.MAX_MULTIPART_PUT_OBJECT_SIZE) {
          throw new errors.InvalidArgumentError(`Cannot compose an object of size ${totalSize} (> 5TiB)`);
        }

        // record source size
        srcObjectSizes[index] = srcCopySize;

        // calculate parts needed for current source
        totalParts += (0, _helper.partsRequired)(srcCopySize);
        // Do we need more parts than we are allowed?
        if (totalParts > _helper.PART_CONSTRAINTS.MAX_PARTS_COUNT) {
          throw new errors.InvalidArgumentError(`Your proposed compose object requires more than ${_helper.PART_CONSTRAINTS.MAX_PARTS_COUNT} parts`);
        }
        return resItemStat;
      });
      if (totalParts === 1 && totalSize <= _helper.PART_CONSTRAINTS.MAX_PART_SIZE || totalSize === 0) {
        return this.copyObject(sourceObjList[0], destObjConfig, cb); // use copyObjectV2
      }

      // preserve etag to avoid modification of object while copying.
      for (let i = 0; i < sourceFilesLength; i++) {
        sourceObjList[i].MatchETag = validatedStats[i].etag;
      }
      const splitPartSizeList = validatedStats.map((resItemStat, idx) => {
        const calSize = (0, _helper.calculateEvenSplits)(srcObjectSizes[idx], sourceObjList[idx]);
        return calSize;
      });
      function getUploadPartConfigList(uploadId) {
        const uploadPartConfigList = [];
        splitPartSizeList.forEach((splitSize, splitIndex) => {
          const {
            startIndex: startIdx,
            endIndex: endIdx,
            objInfo: objConfig
          } = splitSize;
          let partIndex = splitIndex + 1; // part index starts from 1.
          const totalUploads = Array.from(startIdx);
          const headers = sourceObjList[splitIndex].getHeaders();
          totalUploads.forEach((splitStart, upldCtrIdx) => {
            let splitEnd = endIdx[upldCtrIdx];
            const sourceObj = `${objConfig.Bucket}/${objConfig.Object}`;
            headers['x-amz-copy-source'] = `${sourceObj}`;
            headers['x-amz-copy-source-range'] = `bytes=${splitStart}-${splitEnd}`;
            const uploadPartConfig = {
              bucketName: destObjConfig.Bucket,
              objectName: destObjConfig.Object,
              uploadID: uploadId,
              partNumber: partIndex,
              headers: headers,
              sourceObj: sourceObj
            };
            uploadPartConfigList.push(uploadPartConfig);
          });
        });
        return uploadPartConfigList;
      }
      const performUploadParts = uploadId => {
        const uploadList = getUploadPartConfigList(uploadId);
        _async.map(uploadList, me.uploadPartCopy.bind(me), (err, res) => {
          if (err) {
            return this.abortMultipartUpload(destObjConfig.Bucket, destObjConfig.Object, uploadId, cb);
          }
          const partsDone = res.map(partCopy => ({
            etag: partCopy.etag,
            part: partCopy.part
          }));
          return me.completeMultipartUpload(destObjConfig.Bucket, destObjConfig.Object, uploadId, partsDone, cb);
        });
      };
      const newUploadHeaders = destObjConfig.getHeaders();
      me.initiateNewMultipartUpload(destObjConfig.Bucket, destObjConfig.Object, newUploadHeaders, (err, uploadId) => {
        if (err) {
          return cb(err, null);
        }
        performUploadParts(uploadId);
      });
    }).catch(error => {
      cb(error, null);
    });
  }
  selectObjectContent(bucketName, objectName, selectOpts = {}, cb) {
    if (!(0, _helper.isValidBucketName)(bucketName)) {
      throw new errors.InvalidBucketNameError(`Invalid bucket name: ${bucketName}`);
    }
    if (!(0, _helper.isValidObjectName)(objectName)) {
      throw new errors.InvalidObjectNameError(`Invalid object name: ${objectName}`);
    }
    if (!_lodash.isEmpty(selectOpts)) {
      if (!(0, _helper.isString)(selectOpts.expression)) {
        throw new TypeError('sqlExpression should be of type "string"');
      }
      if (!_lodash.isEmpty(selectOpts.inputSerialization)) {
        if (!(0, _helper.isObject)(selectOpts.inputSerialization)) {
          throw new TypeError('inputSerialization should be of type "object"');
        }
      } else {
        throw new TypeError('inputSerialization is required');
      }
      if (!_lodash.isEmpty(selectOpts.outputSerialization)) {
        if (!(0, _helper.isObject)(selectOpts.outputSerialization)) {
          throw new TypeError('outputSerialization should be of type "object"');
        }
      } else {
        throw new TypeError('outputSerialization is required');
      }
    } else {
      throw new TypeError('valid select configuration is required');
    }
    if (!(0, _helper.isFunction)(cb)) {
      throw new TypeError('callback should be of type "function"');
    }
    const method = 'POST';
    let query = `select`;
    query += '&select-type=2';
    const config = [{
      Expression: selectOpts.expression
    }, {
      ExpressionType: selectOpts.expressionType || 'SQL'
    }, {
      InputSerialization: [selectOpts.inputSerialization]
    }, {
      OutputSerialization: [selectOpts.outputSerialization]
    }];

    // Optional
    if (selectOpts.requestProgress) {
      config.push({
        RequestProgress: selectOpts.requestProgress
      });
    }
    // Optional
    if (selectOpts.scanRange) {
      config.push({
        ScanRange: selectOpts.scanRange
      });
    }
    const builder = new _xml2js.Builder({
      rootName: 'SelectObjectContentRequest',
      renderOpts: {
        pretty: false
      },
      headless: true
    });
    const payload = builder.buildObject(config);
    this.makeRequest({
      method,
      bucketName,
      objectName,
      query
    }, payload, [200], '', true, (e, response) => {
      if (e) {
        return cb(e);
      }
      let selectResult;
      (0, _helper.pipesetup)(response, transformers.selectObjectContentTransformer()).on('data', data => {
        selectResult = (0, _xmlParsers.parseSelectObjectContentResponse)(data);
      }).on('error', cb).on('end', () => {
        cb(null, selectResult);
      });
    });
  }
  get extensions() {
    if (!this.clientExtensions) {
      this.clientExtensions = new _extensions.extensions(this);
    }
    return this.clientExtensions;
  }
}

// Promisify various public-facing APIs on the Client module.
exports.Client = Client;
Client.prototype.makeBucket = (0, _promisify.promisify)(Client.prototype.makeBucket);
Client.prototype.listBuckets = (0, _promisify.promisify)(Client.prototype.listBuckets);
Client.prototype.bucketExists = (0, _promisify.promisify)(Client.prototype.bucketExists);
Client.prototype.removeBucket = (0, _promisify.promisify)(Client.prototype.removeBucket);
Client.prototype.getObject = (0, _promisify.promisify)(Client.prototype.getObject);
Client.prototype.getPartialObject = (0, _promisify.promisify)(Client.prototype.getPartialObject);
Client.prototype.fGetObject = (0, _promisify.promisify)(Client.prototype.fGetObject);
Client.prototype.putObject = (0, _promisify.promisify)(Client.prototype.putObject);
Client.prototype.fPutObject = (0, _promisify.promisify)(Client.prototype.fPutObject);
Client.prototype.copyObject = (0, _promisify.promisify)(Client.prototype.copyObject);
Client.prototype.statObject = (0, _promisify.promisify)(Client.prototype.statObject);
Client.prototype.removeObject = (0, _promisify.promisify)(Client.prototype.removeObject);
Client.prototype.removeObjects = (0, _promisify.promisify)(Client.prototype.removeObjects);
Client.prototype.presignedUrl = (0, _promisify.promisify)(Client.prototype.presignedUrl);
Client.prototype.presignedGetObject = (0, _promisify.promisify)(Client.prototype.presignedGetObject);
Client.prototype.presignedPutObject = (0, _promisify.promisify)(Client.prototype.presignedPutObject);
Client.prototype.presignedPostPolicy = (0, _promisify.promisify)(Client.prototype.presignedPostPolicy);
Client.prototype.getBucketNotification = (0, _promisify.promisify)(Client.prototype.getBucketNotification);
Client.prototype.setBucketNotification = (0, _promisify.promisify)(Client.prototype.setBucketNotification);
Client.prototype.removeAllBucketNotification = (0, _promisify.promisify)(Client.prototype.removeAllBucketNotification);
Client.prototype.getBucketPolicy = (0, _promisify.promisify)(Client.prototype.getBucketPolicy);
Client.prototype.setBucketPolicy = (0, _promisify.promisify)(Client.prototype.setBucketPolicy);
Client.prototype.removeIncompleteUpload = (0, _promisify.promisify)(Client.prototype.removeIncompleteUpload);
Client.prototype.getBucketVersioning = (0, _promisify.promisify)(Client.prototype.getBucketVersioning);
Client.prototype.setBucketVersioning = (0, _promisify.promisify)(Client.prototype.setBucketVersioning);
Client.prototype.setBucketTagging = (0, _promisify.promisify)(Client.prototype.setBucketTagging);
Client.prototype.removeBucketTagging = (0, _promisify.promisify)(Client.prototype.removeBucketTagging);
Client.prototype.getBucketTagging = (0, _promisify.promisify)(Client.prototype.getBucketTagging);
Client.prototype.setObjectTagging = (0, _promisify.promisify)(Client.prototype.setObjectTagging);
Client.prototype.removeObjectTagging = (0, _promisify.promisify)(Client.prototype.removeObjectTagging);
Client.prototype.getObjectTagging = (0, _promisify.promisify)(Client.prototype.getObjectTagging);
Client.prototype.setBucketLifecycle = (0, _promisify.promisify)(Client.prototype.setBucketLifecycle);
Client.prototype.getBucketLifecycle = (0, _promisify.promisify)(Client.prototype.getBucketLifecycle);
Client.prototype.removeBucketLifecycle = (0, _promisify.promisify)(Client.prototype.removeBucketLifecycle);
Client.prototype.setObjectLockConfig = (0, _promisify.promisify)(Client.prototype.setObjectLockConfig);
Client.prototype.getObjectLockConfig = (0, _promisify.promisify)(Client.prototype.getObjectLockConfig);
Client.prototype.putObjectRetention = (0, _promisify.promisify)(Client.prototype.putObjectRetention);
Client.prototype.getObjectRetention = (0, _promisify.promisify)(Client.prototype.getObjectRetention);
Client.prototype.setBucketEncryption = (0, _promisify.promisify)(Client.prototype.setBucketEncryption);
Client.prototype.getBucketEncryption = (0, _promisify.promisify)(Client.prototype.getBucketEncryption);
Client.prototype.removeBucketEncryption = (0, _promisify.promisify)(Client.prototype.removeBucketEncryption);
Client.prototype.setBucketReplication = (0, _promisify.promisify)(Client.prototype.setBucketReplication);
Client.prototype.getBucketReplication = (0, _promisify.promisify)(Client.prototype.getBucketReplication);
Client.prototype.removeBucketReplication = (0, _promisify.promisify)(Client.prototype.removeBucketReplication);
Client.prototype.setObjectLegalHold = (0, _promisify.promisify)(Client.prototype.setObjectLegalHold);
Client.prototype.getObjectLegalHold = (0, _promisify.promisify)(Client.prototype.getObjectLegalHold);
Client.prototype.composeObject = (0, _promisify.promisify)(Client.prototype.composeObject);
Client.prototype.selectObjectContent = (0, _promisify.promisify)(Client.prototype.selectObjectContent);
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJmcyIsIl9pbnRlcm9wUmVxdWlyZVdpbGRjYXJkIiwicmVxdWlyZSIsInBhdGgiLCJTdHJlYW0iLCJfYXN5bmMiLCJfYmxvY2tTdHJlYW0iLCJfbG9kYXNoIiwicXVlcnlzdHJpbmciLCJfd2ViRW5jb2RpbmciLCJfeG1sIiwiX3htbDJqcyIsImVycm9ycyIsIl9leHRlbnNpb25zIiwiX2hlbHBlcnMiLCJPYmplY3QiLCJrZXlzIiwiZm9yRWFjaCIsImtleSIsInByb3RvdHlwZSIsImhhc093blByb3BlcnR5IiwiY2FsbCIsIl9leHBvcnROYW1lcyIsImV4cG9ydHMiLCJfY2xpZW50IiwiX2NvcHlDb25kaXRpb25zIiwiQ29weUNvbmRpdGlvbnMiLCJfaGVscGVyIiwiX3Bvc3RQb2xpY3kiLCJQb3N0UG9saWN5IiwiX3R5cGUiLCJfbm90aWZpY2F0aW9uIiwiX29iamVjdFVwbG9hZGVyIiwiX3Byb21pc2lmeSIsIl9zaWduaW5nIiwidHJhbnNmb3JtZXJzIiwiX3htbFBhcnNlcnMiLCJfZ2V0UmVxdWlyZVdpbGRjYXJkQ2FjaGUiLCJub2RlSW50ZXJvcCIsIldlYWtNYXAiLCJjYWNoZUJhYmVsSW50ZXJvcCIsImNhY2hlTm9kZUludGVyb3AiLCJvYmoiLCJfX2VzTW9kdWxlIiwiZGVmYXVsdCIsImNhY2hlIiwiaGFzIiwiZ2V0IiwibmV3T2JqIiwiaGFzUHJvcGVydHlEZXNjcmlwdG9yIiwiZGVmaW5lUHJvcGVydHkiLCJnZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3IiLCJkZXNjIiwic2V0IiwiQ2xpZW50IiwiVHlwZWRDbGllbnQiLCJzZXRBcHBJbmZvIiwiYXBwTmFtZSIsImFwcFZlcnNpb24iLCJpc1N0cmluZyIsIlR5cGVFcnJvciIsInRyaW0iLCJJbnZhbGlkQXJndW1lbnRFcnJvciIsInVzZXJBZ2VudCIsImNhbGN1bGF0ZVBhcnRTaXplIiwic2l6ZSIsImlzTnVtYmVyIiwibWF4T2JqZWN0U2l6ZSIsIm92ZXJSaWRlUGFydFNpemUiLCJwYXJ0U2l6ZSIsImxvZ0hUVFAiLCJyZXFPcHRpb25zIiwicmVzcG9uc2UiLCJlcnIiLCJsb2dTdHJlYW0iLCJpc09iamVjdCIsImlzUmVhZGFibGVTdHJlYW0iLCJFcnJvciIsImxvZ0hlYWRlcnMiLCJoZWFkZXJzIiwiXyIsInYiLCJrIiwicmVkYWN0ZXIiLCJSZWdFeHAiLCJyZXBsYWNlIiwid3JpdGUiLCJtZXRob2QiLCJzdGF0dXNDb2RlIiwiZXJySlNPTiIsIkpTT04iLCJzdHJpbmdpZnkiLCJ0cmFjZU9uIiwic3RyZWFtIiwicHJvY2VzcyIsInN0ZG91dCIsInRyYWNlT2ZmIiwibWFrZVJlcXVlc3QiLCJvcHRpb25zIiwicGF5bG9hZCIsInN0YXR1c0NvZGVzIiwicmVnaW9uIiwicmV0dXJuUmVzcG9uc2UiLCJjYiIsImlzQm9vbGVhbiIsImlzRnVuY3Rpb24iLCJsZW5ndGgiLCJzaGEyNTZzdW0iLCJlbmFibGVTSEEyNTYiLCJ0b1NoYTI1NiIsInJlYWRhYmxlU3RyZWFtIiwibWFrZVJlcXVlc3RTdHJlYW0iLCJfbWFrZVJlcXVlc3QiLCJlIiwiZ2V0UmVxdWVzdE9wdGlvbnMiLCJhbm9ueW1vdXMiLCJkYXRlIiwiRGF0ZSIsIm1ha2VEYXRlTG9uZyIsInNlc3Npb25Ub2tlbiIsImNoZWNrQW5kUmVmcmVzaENyZWRzIiwiYXV0aG9yaXphdGlvbiIsInNpZ25WNCIsImFjY2Vzc0tleSIsInNlY3JldEtleSIsInJlcSIsInRyYW5zcG9ydCIsInJlcXVlc3QiLCJpbmNsdWRlcyIsInJlZ2lvbk1hcCIsImJ1Y2tldE5hbWUiLCJlcnJvclRyYW5zZm9ybWVyIiwiZ2V0RXJyb3JUcmFuc2Zvcm1lciIsInBpcGVzZXR1cCIsIm9uIiwicGlwZSIsImdldEJ1Y2tldFJlZ2lvbiIsImlzVmFsaWRCdWNrZXROYW1lIiwiSW52YWxpZEJ1Y2tldE5hbWVFcnJvciIsImV4dHJhY3RSZWdpb24iLCJ0cmFuc2Zvcm1lciIsImdldEJ1Y2tldFJlZ2lvblRyYW5zZm9ybWVyIiwiREVGQVVMVF9SRUdJT04iLCJkYXRhIiwicXVlcnkiLCJwYXRoU3R5bGUiLCJ3aW5kb3ciLCJuYW1lIiwiUmVnaW9uIiwibWFrZUJ1Y2tldCIsIm1ha2VPcHRzIiwiY3JlYXRlQnVja2V0Q29uZmlndXJhdGlvbiIsInB1c2giLCJfYXR0ciIsInhtbG5zIiwiTG9jYXRpb25Db25zdHJhaW50IiwicGF5bG9hZE9iamVjdCIsIkNyZWF0ZUJ1Y2tldENvbmZpZ3VyYXRpb24iLCJYbWwiLCJPYmplY3RMb2NraW5nIiwicHJvY2Vzc1dpdGhSZXRyeSIsImNvZGUiLCJsaXN0QnVja2V0cyIsImdldExpc3RCdWNrZXRUcmFuc2Zvcm1lciIsImJ1Y2tldHMiLCJyZXN1bHQiLCJsaXN0SW5jb21wbGV0ZVVwbG9hZHMiLCJidWNrZXQiLCJwcmVmaXgiLCJyZWN1cnNpdmUiLCJ1bmRlZmluZWQiLCJpc1ZhbGlkUHJlZml4IiwiSW52YWxpZFByZWZpeEVycm9yIiwiZGVsaW1pdGVyIiwia2V5TWFya2VyIiwidXBsb2FkSWRNYXJrZXIiLCJ1cGxvYWRzIiwiZW5kZWQiLCJyZWFkU3RyZWFtIiwiUmVhZGFibGUiLCJvYmplY3RNb2RlIiwiX3JlYWQiLCJzaGlmdCIsImxpc3RJbmNvbXBsZXRlVXBsb2Fkc1F1ZXJ5IiwiZW1pdCIsInByZWZpeGVzIiwiYXN5bmMiLCJlYWNoU2VyaWVzIiwidXBsb2FkIiwibGlzdFBhcnRzIiwidXBsb2FkSWQiLCJwYXJ0cyIsInJlZHVjZSIsImFjYyIsIml0ZW0iLCJpc1RydW5jYXRlZCIsIm5leHRLZXlNYXJrZXIiLCJuZXh0VXBsb2FkSWRNYXJrZXIiLCJidWNrZXRFeGlzdHMiLCJyZW1vdmVCdWNrZXQiLCJyZW1vdmVJbmNvbXBsZXRlVXBsb2FkIiwib2JqZWN0TmFtZSIsIklzVmFsaWRCdWNrZXROYW1lRXJyb3IiLCJpc1ZhbGlkT2JqZWN0TmFtZSIsIkludmFsaWRPYmplY3ROYW1lRXJyb3IiLCJyZW1vdmVVcGxvYWRJZCIsImR1cmluZyIsImZpbmRVcGxvYWRJZCIsImZHZXRPYmplY3QiLCJmaWxlUGF0aCIsImdldE9wdHMiLCJwYXJ0RmlsZSIsInBhcnRGaWxlU3RyZWFtIiwib2JqU3RhdCIsInJlbmFtZSIsIndhdGVyZmFsbCIsInN0YXRPYmplY3QiLCJta2RpciIsImRpcm5hbWUiLCJldGFnIiwic3RhdCIsInN0YXRzIiwib2Zmc2V0IiwiY3JlYXRlV3JpdGVTdHJlYW0iLCJmbGFncyIsImdldFBhcnRpYWxPYmplY3QiLCJkb3dubG9hZFN0cmVhbSIsImdldE9iamVjdCIsInJhbmdlIiwiZXhwZWN0ZWRTdGF0dXNDb2RlcyIsImZQdXRPYmplY3QiLCJtZXRhRGF0YSIsImNhbGxiYWNrIiwiaW5zZXJ0Q29udGVudFR5cGUiLCJwcmVwZW5kWEFNWk1ldGEiLCJjYlRyaWdnZXJlZCIsIm9yaWdDYiIsImRlc3Ryb3kiLCJhcHBseSIsImFyZ3VtZW50cyIsIm11bHRpcGFydCIsInVwbG9hZGVyIiwiZ2V0VXBsb2FkZXIiLCJoYXNoIiwiZ2V0SGFzaFN1bW1lciIsInN0YXJ0IiwiZW5kIiwiYXV0b0Nsb3NlIiwiY3JlYXRlUmVhZFN0cmVhbSIsIm1kNXN1bSIsIm9iakluZm8iLCJldGFncyIsImluaXRpYXRlTmV3TXVsdGlwYXJ0VXBsb2FkIiwicGFydCIsInBhcnRzRG9uZSIsInBhcnROdW1iZXIiLCJ1cGxvYWRlZFNpemUiLCJ3aGlsc3QiLCJtZDVzdW1IZXgiLCJCdWZmZXIiLCJmcm9tIiwidG9TdHJpbmciLCJjb21wbGV0ZU11bHRpcGFydFVwbG9hZCIsInJlc3QiLCJwdXRPYmplY3QiLCJjaHVua2VyIiwiQmxvY2tTdHJlYW0yIiwiemVyb1BhZGRpbmciLCJPYmplY3RVcGxvYWRlciIsImNvcHlPYmplY3RWMSIsImFyZzEiLCJhcmcyIiwiYXJnMyIsImFyZzQiLCJhcmc1Iiwic3JjT2JqZWN0IiwiY29uZGl0aW9ucyIsInVyaVJlc291cmNlRXNjYXBlIiwibW9kaWZpZWQiLCJ1bm1vZGlmaWVkIiwibWF0Y2hFVGFnIiwibWF0Y2hFdGFnRXhjZXB0IiwibWF0Y2hFVGFnRXhjZXB0IiwiZ2V0Q29weU9iamVjdFRyYW5zZm9ybWVyIiwiY29weU9iamVjdFYyIiwic291cmNlQ29uZmlnIiwiZGVzdENvbmZpZyIsIkNvcHlTb3VyY2VPcHRpb25zIiwiQ29weURlc3RpbmF0aW9uT3B0aW9ucyIsInZhbGlkYXRlIiwiYXNzaWduIiwiZ2V0SGVhZGVycyIsIkJ1Y2tldCIsInJlc0hlYWRlcnMiLCJjb3B5T2JqUmVzcG9uc2UiLCJLZXkiLCJMYXN0TW9kaWZpZWQiLCJNZXRhRGF0YSIsImV4dHJhY3RNZXRhZGF0YSIsIlZlcnNpb25JZCIsImdldFZlcnNpb25JZCIsIlNvdXJjZVZlcnNpb25JZCIsImdldFNvdXJjZVZlcnNpb25JZCIsIkV0YWciLCJzYW5pdGl6ZUVUYWciLCJTaXplIiwiY29weU9iamVjdCIsImFsbEFyZ3MiLCJsaXN0T2JqZWN0c1F1ZXJ5IiwibWFya2VyIiwibGlzdFF1ZXJ5T3B0cyIsIkRlbGltaXRlciIsIk1heEtleXMiLCJJbmNsdWRlVmVyc2lvbiIsInF1ZXJpZXMiLCJ1cmlFc2NhcGUiLCJzb3J0Iiwiam9pbiIsImdldExpc3RPYmplY3RzVHJhbnNmb3JtZXIiLCJsaXN0T2JqZWN0cyIsImxpc3RPcHRzIiwib2JqZWN0cyIsIm5leHRNYXJrZXIiLCJ2ZXJzaW9uSWRNYXJrZXIiLCJsaXN0T2JqZWN0c1YyUXVlcnkiLCJjb250aW51YXRpb25Ub2tlbiIsIm1heEtleXMiLCJzdGFydEFmdGVyIiwiZ2V0TGlzdE9iamVjdHNWMlRyYW5zZm9ybWVyIiwibGlzdE9iamVjdHNWMiIsIm5leHRDb250aW51YXRpb25Ub2tlbiIsInN0YXRPcHRzIiwibGFzdE1vZGlmaWVkIiwidmVyc2lvbklkIiwicmVtb3ZlT2JqZWN0IiwicmVtb3ZlT3B0cyIsInF1ZXJ5UGFyYW1zIiwiZ292ZXJuYW5jZUJ5cGFzcyIsImZvcmNlRGVsZXRlIiwicmVxdWVzdE9wdGlvbnMiLCJyZW1vdmVPYmplY3RzIiwib2JqZWN0c0xpc3QiLCJBcnJheSIsImlzQXJyYXkiLCJtYXhFbnRyaWVzIiwiZW50cnkiLCJsaXN0IiwibGlzdE9mTGlzdCIsImVuY29kZXIiLCJUZXh0RW5jb2RlciIsImJhdGNoUmVzdWx0cyIsImJhdGNoQ2IiLCJ2YWx1ZSIsImRlbGV0ZU9iamVjdHMiLCJEZWxldGUiLCJRdWlldCIsImJ1aWxkZXIiLCJ4bWwyanMiLCJCdWlsZGVyIiwiaGVhZGxlc3MiLCJidWlsZE9iamVjdCIsImVuY29kZSIsInRvTWQ1IiwicmVtb3ZlT2JqZWN0c1Jlc3VsdCIsInJlbW92ZU9iamVjdHNUcmFuc2Zvcm1lciIsImZsYXR0ZW4iLCJnZXRCdWNrZXRQb2xpY3kiLCJwb2xpY3kiLCJnZXRDb25jYXRlciIsInNldEJ1Y2tldFBvbGljeSIsIkludmFsaWRCdWNrZXRQb2xpY3lFcnJvciIsInByZXNpZ25lZFVybCIsImV4cGlyZXMiLCJyZXFQYXJhbXMiLCJyZXF1ZXN0RGF0ZSIsIkFub255bW91c1JlcXVlc3RFcnJvciIsImlzVmFsaWREYXRlIiwidXJsIiwicHJlc2lnblNpZ25hdHVyZVY0IiwicGUiLCJwcmVzaWduZWRHZXRPYmplY3QiLCJyZXNwSGVhZGVycyIsInZhbGlkUmVzcEhlYWRlcnMiLCJoZWFkZXIiLCJwcmVzaWduZWRQdXRPYmplY3QiLCJuZXdQb3N0UG9saWN5IiwicHJlc2lnbmVkUG9zdFBvbGljeSIsInBvc3RQb2xpY3kiLCJmb3JtRGF0YSIsImRhdGVTdHIiLCJleHBpcmF0aW9uIiwic2V0U2Vjb25kcyIsInNldEV4cGlyZXMiLCJnZXRTY29wZSIsInBvbGljeUJhc2U2NCIsInNpZ25hdHVyZSIsInBvc3RQcmVzaWduU2lnbmF0dXJlVjQiLCJvcHRzIiwicG9ydFN0ciIsInBvcnQiLCJ1cmxTdHIiLCJwcm90b2NvbCIsImhvc3QiLCJwb3N0VVJMIiwiZ2V0SW5pdGlhdGVNdWx0aXBhcnRUcmFuc2Zvcm1lciIsImVsZW1lbnQiLCJQYXJ0IiwiUGFydE51bWJlciIsIkVUYWciLCJDb21wbGV0ZU11bHRpcGFydFVwbG9hZCIsImdldENvbXBsZXRlTXVsdGlwYXJ0VHJhbnNmb3JtZXIiLCJlcnJDb2RlIiwiUzNFcnJvciIsImVyck1lc3NhZ2UiLCJjb21wbGV0ZU11bHRpcGFydFJlc3VsdCIsImxpc3ROZXh0IiwibGlzdFBhcnRzUXVlcnkiLCJjb25jYXQiLCJnZXRMaXN0UGFydHNUcmFuc2Zvcm1lciIsIm1heFVwbG9hZHMiLCJ1bnNoaWZ0IiwiZ2V0TGlzdE11bHRpcGFydFRyYW5zZm9ybWVyIiwibGF0ZXN0VXBsb2FkIiwiaW5pdGlhdGVkIiwiZ2V0VGltZSIsInNpbXBsZVVwbG9hZGVyIiwiYXJncyIsIm11bHRpcGFydFVwbG9hZGVyIiwic2V0QnVja2V0Tm90aWZpY2F0aW9uIiwiY29uZmlnIiwicm9vdE5hbWUiLCJyZW5kZXJPcHRzIiwicHJldHR5IiwicmVtb3ZlQWxsQnVja2V0Tm90aWZpY2F0aW9uIiwiTm90aWZpY2F0aW9uQ29uZmlnIiwiZ2V0QnVja2V0Tm90aWZpY2F0aW9uIiwiZ2V0QnVja2V0Tm90aWZpY2F0aW9uVHJhbnNmb3JtZXIiLCJidWNrZXROb3RpZmljYXRpb24iLCJsaXN0ZW5CdWNrZXROb3RpZmljYXRpb24iLCJzdWZmaXgiLCJldmVudHMiLCJsaXN0ZW5lciIsIk5vdGlmaWNhdGlvblBvbGxlciIsImdldEJ1Y2tldFZlcnNpb25pbmciLCJ2ZXJzaW9uQ29uZmlnIiwiYnVja2V0VmVyc2lvbmluZ1RyYW5zZm9ybWVyIiwic2V0QnVja2V0VmVyc2lvbmluZyIsInNldFRhZ2dpbmciLCJ0YWdnaW5nUGFyYW1zIiwidGFncyIsInB1dE9wdHMiLCJ0YWdzTGlzdCIsImVudHJpZXMiLCJWYWx1ZSIsInRhZ2dpbmdDb25maWciLCJUYWdnaW5nIiwiVGFnU2V0IiwiVGFnIiwic2V0QnVja2V0VGFnZ2luZyIsInNldE9iamVjdFRhZ2dpbmciLCJyZW1vdmVUYWdnaW5nIiwicmVtb3ZlQnVja2V0VGFnZ2luZyIsInJlbW92ZU9iamVjdFRhZ2dpbmciLCJnZXRCdWNrZXRUYWdnaW5nIiwiZ2V0VGFnc1RyYW5zZm9ybWVyIiwiZ2V0T2JqZWN0VGFnZ2luZyIsImFwcGx5QnVja2V0TGlmZWN5Y2xlIiwicG9saWN5Q29uZmlnIiwicmVtb3ZlQnVja2V0TGlmZWN5Y2xlIiwic2V0QnVja2V0TGlmZWN5Y2xlIiwibGlmZUN5Y2xlQ29uZmlnIiwiaXNFbXB0eSIsImdldEJ1Y2tldExpZmVjeWNsZSIsImxpZmVjeWNsZVRyYW5zZm9ybWVyIiwibGlmZWN5Y2xlQ29uZmlnIiwic2V0T2JqZWN0TG9ja0NvbmZpZyIsImxvY2tDb25maWdPcHRzIiwicmV0ZW50aW9uTW9kZXMiLCJSRVRFTlRJT05fTU9ERVMiLCJDT01QTElBTkNFIiwiR09WRVJOQU5DRSIsInZhbGlkVW5pdHMiLCJSRVRFTlRJT05fVkFMSURJVFlfVU5JVFMiLCJEQVlTIiwiWUVBUlMiLCJtb2RlIiwidW5pdCIsInZhbGlkaXR5IiwiT2JqZWN0TG9ja0VuYWJsZWQiLCJjb25maWdLZXlzIiwiZGlmZmVyZW5jZSIsIlJ1bGUiLCJEZWZhdWx0UmV0ZW50aW9uIiwiTW9kZSIsIkRheXMiLCJZZWFycyIsImdldE9iamVjdExvY2tDb25maWciLCJvYmplY3RMb2NrQ29uZmlnIiwib2JqZWN0TG9ja1RyYW5zZm9ybWVyIiwicHV0T2JqZWN0UmV0ZW50aW9uIiwicmV0ZW50aW9uT3B0cyIsInJldGFpblVudGlsRGF0ZSIsInBhcmFtcyIsIlJldGFpblVudGlsRGF0ZSIsImdldE9iamVjdFJldGVudGlvbiIsInJldGVudGlvbkNvbmZpZyIsIm9iamVjdFJldGVudGlvblRyYW5zZm9ybWVyIiwic2V0QnVja2V0RW5jcnlwdGlvbiIsImVuY3J5cHRpb25Db25maWciLCJlbmNyeXB0aW9uT2JqIiwiQXBwbHlTZXJ2ZXJTaWRlRW5jcnlwdGlvbkJ5RGVmYXVsdCIsIlNTRUFsZ29yaXRobSIsImdldEJ1Y2tldEVuY3J5cHRpb24iLCJidWNrZXRFbmNDb25maWciLCJidWNrZXRFbmNyeXB0aW9uVHJhbnNmb3JtZXIiLCJyZW1vdmVCdWNrZXRFbmNyeXB0aW9uIiwic2V0QnVja2V0UmVwbGljYXRpb24iLCJyZXBsaWNhdGlvbkNvbmZpZyIsInJvbGUiLCJydWxlcyIsInJlcGxpY2F0aW9uUGFyYW1zQ29uZmlnIiwiUmVwbGljYXRpb25Db25maWd1cmF0aW9uIiwiUm9sZSIsImdldEJ1Y2tldFJlcGxpY2F0aW9uIiwicmVwbGljYXRpb25Db25maWdUcmFuc2Zvcm1lciIsInJlbW92ZUJ1Y2tldFJlcGxpY2F0aW9uIiwiZ2V0T2JqZWN0TGVnYWxIb2xkIiwibGVnYWxIb2xkQ29uZmlnIiwib2JqZWN0TGVnYWxIb2xkVHJhbnNmb3JtZXIiLCJzZXRPYmplY3RMZWdhbEhvbGQiLCJzZXRPcHRzIiwiZGVmYXVsdE9wdHMiLCJzdGF0dXMiLCJMRUdBTF9IT0xEX1NUQVRVUyIsIkVOQUJMRUQiLCJESVNBQkxFRCIsIlN0YXR1cyIsImFib3J0TXVsdGlwYXJ0VXBsb2FkIiwidXBsb2FkUGFydENvcHkiLCJwYXJ0Q29uZmlnIiwidXBsb2FkSUQiLCJwYXJ0Q29weVJlc3VsdCIsInVwbG9hZFBhcnRUcmFuc2Zvcm1lciIsInVwbG9hZFBhcnRDb3B5UmVzIiwiY29tcG9zZU9iamVjdCIsImRlc3RPYmpDb25maWciLCJzb3VyY2VPYmpMaXN0IiwibWUiLCJzb3VyY2VGaWxlc0xlbmd0aCIsIlBBUlRfQ09OU1RSQUlOVFMiLCJNQVhfUEFSVFNfQ09VTlQiLCJpIiwiZ2V0U3RhdE9wdGlvbnMiLCJzcmNDb25maWciLCJWZXJzaW9uSUQiLCJzcmNPYmplY3RTaXplcyIsInRvdGFsU2l6ZSIsInRvdGFsUGFydHMiLCJzb3VyY2VPYmpTdGF0cyIsIm1hcCIsInNyY0l0ZW0iLCJQcm9taXNlIiwiYWxsIiwidGhlbiIsInNyY09iamVjdEluZm9zIiwidmFsaWRhdGVkU3RhdHMiLCJyZXNJdGVtU3RhdCIsImluZGV4Iiwic3JjQ29weVNpemUiLCJNYXRjaFJhbmdlIiwic3JjU3RhcnQiLCJTdGFydCIsInNyY0VuZCIsIkVuZCIsIkFCU19NSU5fUEFSVF9TSVpFIiwiTUFYX01VTFRJUEFSVF9QVVRfT0JKRUNUX1NJWkUiLCJwYXJ0c1JlcXVpcmVkIiwiTUFYX1BBUlRfU0laRSIsIk1hdGNoRVRhZyIsInNwbGl0UGFydFNpemVMaXN0IiwiaWR4IiwiY2FsU2l6ZSIsImNhbGN1bGF0ZUV2ZW5TcGxpdHMiLCJnZXRVcGxvYWRQYXJ0Q29uZmlnTGlzdCIsInVwbG9hZFBhcnRDb25maWdMaXN0Iiwic3BsaXRTaXplIiwic3BsaXRJbmRleCIsInN0YXJ0SW5kZXgiLCJzdGFydElkeCIsImVuZEluZGV4IiwiZW5kSWR4Iiwib2JqQ29uZmlnIiwicGFydEluZGV4IiwidG90YWxVcGxvYWRzIiwic3BsaXRTdGFydCIsInVwbGRDdHJJZHgiLCJzcGxpdEVuZCIsInNvdXJjZU9iaiIsInVwbG9hZFBhcnRDb25maWciLCJwZXJmb3JtVXBsb2FkUGFydHMiLCJ1cGxvYWRMaXN0IiwiYmluZCIsInJlcyIsInBhcnRDb3B5IiwibmV3VXBsb2FkSGVhZGVycyIsImNhdGNoIiwiZXJyb3IiLCJzZWxlY3RPYmplY3RDb250ZW50Iiwic2VsZWN0T3B0cyIsImV4cHJlc3Npb24iLCJpbnB1dFNlcmlhbGl6YXRpb24iLCJvdXRwdXRTZXJpYWxpemF0aW9uIiwiRXhwcmVzc2lvbiIsIkV4cHJlc3Npb25UeXBlIiwiZXhwcmVzc2lvblR5cGUiLCJJbnB1dFNlcmlhbGl6YXRpb24iLCJPdXRwdXRTZXJpYWxpemF0aW9uIiwicmVxdWVzdFByb2dyZXNzIiwiUmVxdWVzdFByb2dyZXNzIiwic2NhblJhbmdlIiwiU2NhblJhbmdlIiwic2VsZWN0UmVzdWx0Iiwic2VsZWN0T2JqZWN0Q29udGVudFRyYW5zZm9ybWVyIiwicGFyc2VTZWxlY3RPYmplY3RDb250ZW50UmVzcG9uc2UiLCJleHRlbnNpb25zIiwiY2xpZW50RXh0ZW5zaW9ucyIsInByb21pc2lmeSJdLCJzb3VyY2VzIjpbIm1pbmlvLmpzIl0sInNvdXJjZXNDb250ZW50IjpbIi8qXG4gKiBNaW5JTyBKYXZhc2NyaXB0IExpYnJhcnkgZm9yIEFtYXpvbiBTMyBDb21wYXRpYmxlIENsb3VkIFN0b3JhZ2UsIChDKSAyMDE1IE1pbklPLCBJbmMuXG4gKlxuICogTGljZW5zZWQgdW5kZXIgdGhlIEFwYWNoZSBMaWNlbnNlLCBWZXJzaW9uIDIuMCAodGhlIFwiTGljZW5zZVwiKTtcbiAqIHlvdSBtYXkgbm90IHVzZSB0aGlzIGZpbGUgZXhjZXB0IGluIGNvbXBsaWFuY2Ugd2l0aCB0aGUgTGljZW5zZS5cbiAqIFlvdSBtYXkgb2J0YWluIGEgY29weSBvZiB0aGUgTGljZW5zZSBhdFxuICpcbiAqICAgICBodHRwOi8vd3d3LmFwYWNoZS5vcmcvbGljZW5zZXMvTElDRU5TRS0yLjBcbiAqXG4gKiBVbmxlc3MgcmVxdWlyZWQgYnkgYXBwbGljYWJsZSBsYXcgb3IgYWdyZWVkIHRvIGluIHdyaXRpbmcsIHNvZnR3YXJlXG4gKiBkaXN0cmlidXRlZCB1bmRlciB0aGUgTGljZW5zZSBpcyBkaXN0cmlidXRlZCBvbiBhbiBcIkFTIElTXCIgQkFTSVMsXG4gKiBXSVRIT1VUIFdBUlJBTlRJRVMgT1IgQ09ORElUSU9OUyBPRiBBTlkgS0lORCwgZWl0aGVyIGV4cHJlc3Mgb3IgaW1wbGllZC5cbiAqIFNlZSB0aGUgTGljZW5zZSBmb3IgdGhlIHNwZWNpZmljIGxhbmd1YWdlIGdvdmVybmluZyBwZXJtaXNzaW9ucyBhbmRcbiAqIGxpbWl0YXRpb25zIHVuZGVyIHRoZSBMaWNlbnNlLlxuICovXG5cbmltcG9ydCAqIGFzIGZzIGZyb20gJ25vZGU6ZnMnXG5pbXBvcnQgKiBhcyBwYXRoIGZyb20gJ25vZGU6cGF0aCdcbmltcG9ydCAqIGFzIFN0cmVhbSBmcm9tICdub2RlOnN0cmVhbSdcblxuaW1wb3J0IGFzeW5jIGZyb20gJ2FzeW5jJ1xuaW1wb3J0IEJsb2NrU3RyZWFtMiBmcm9tICdibG9jay1zdHJlYW0yJ1xuaW1wb3J0IF8gZnJvbSAnbG9kYXNoJ1xuaW1wb3J0ICogYXMgcXVlcnlzdHJpbmcgZnJvbSAncXVlcnktc3RyaW5nJ1xuaW1wb3J0IHsgVGV4dEVuY29kZXIgfSBmcm9tICd3ZWItZW5jb2RpbmcnXG5pbXBvcnQgWG1sIGZyb20gJ3htbCdcbmltcG9ydCB4bWwyanMgZnJvbSAneG1sMmpzJ1xuXG5pbXBvcnQgKiBhcyBlcnJvcnMgZnJvbSAnLi9lcnJvcnMudHMnXG5pbXBvcnQgeyBleHRlbnNpb25zIH0gZnJvbSAnLi9leHRlbnNpb25zLmpzJ1xuaW1wb3J0IHsgQ29weURlc3RpbmF0aW9uT3B0aW9ucywgQ29weVNvdXJjZU9wdGlvbnMsIERFRkFVTFRfUkVHSU9OIH0gZnJvbSAnLi9oZWxwZXJzLnRzJ1xuaW1wb3J0IHsgVHlwZWRDbGllbnQgfSBmcm9tICcuL2ludGVybmFsL2NsaWVudC50cydcbmltcG9ydCB7IENvcHlDb25kaXRpb25zIH0gZnJvbSAnLi9pbnRlcm5hbC9jb3B5LWNvbmRpdGlvbnMudHMnXG5pbXBvcnQge1xuICBjYWxjdWxhdGVFdmVuU3BsaXRzLFxuICBleHRyYWN0TWV0YWRhdGEsXG4gIGdldFNjb3BlLFxuICBnZXRTb3VyY2VWZXJzaW9uSWQsXG4gIGdldFZlcnNpb25JZCxcbiAgaW5zZXJ0Q29udGVudFR5cGUsXG4gIGlzQm9vbGVhbixcbiAgaXNGdW5jdGlvbixcbiAgaXNOdW1iZXIsXG4gIGlzT2JqZWN0LFxuICBpc1JlYWRhYmxlU3RyZWFtLFxuICBpc1N0cmluZyxcbiAgaXNWYWxpZEJ1Y2tldE5hbWUsXG4gIGlzVmFsaWREYXRlLFxuICBpc1ZhbGlkT2JqZWN0TmFtZSxcbiAgaXNWYWxpZFByZWZpeCxcbiAgbWFrZURhdGVMb25nLFxuICBQQVJUX0NPTlNUUkFJTlRTLFxuICBwYXJ0c1JlcXVpcmVkLFxuICBwaXBlc2V0dXAsXG4gIHByZXBlbmRYQU1aTWV0YSxcbiAgcmVhZGFibGVTdHJlYW0sXG4gIHNhbml0aXplRVRhZyxcbiAgdG9NZDUsXG4gIHRvU2hhMjU2LFxuICB1cmlFc2NhcGUsXG4gIHVyaVJlc291cmNlRXNjYXBlLFxufSBmcm9tICcuL2ludGVybmFsL2hlbHBlci50cydcbmltcG9ydCB7IFBvc3RQb2xpY3kgfSBmcm9tICcuL2ludGVybmFsL3Bvc3QtcG9saWN5LnRzJ1xuaW1wb3J0IHsgTEVHQUxfSE9MRF9TVEFUVVMsIFJFVEVOVElPTl9NT0RFUywgUkVURU5USU9OX1ZBTElESVRZX1VOSVRTIH0gZnJvbSAnLi9pbnRlcm5hbC90eXBlLnRzJ1xuaW1wb3J0IHsgTm90aWZpY2F0aW9uQ29uZmlnLCBOb3RpZmljYXRpb25Qb2xsZXIgfSBmcm9tICcuL25vdGlmaWNhdGlvbi5qcydcbmltcG9ydCB7IE9iamVjdFVwbG9hZGVyIH0gZnJvbSAnLi9vYmplY3QtdXBsb2FkZXIuanMnXG5pbXBvcnQgeyBwcm9taXNpZnkgfSBmcm9tICcuL3Byb21pc2lmeS5qcydcbmltcG9ydCB7IHBvc3RQcmVzaWduU2lnbmF0dXJlVjQsIHByZXNpZ25TaWduYXR1cmVWNCwgc2lnblY0IH0gZnJvbSAnLi9zaWduaW5nLnRzJ1xuaW1wb3J0ICogYXMgdHJhbnNmb3JtZXJzIGZyb20gJy4vdHJhbnNmb3JtZXJzLmpzJ1xuaW1wb3J0IHsgcGFyc2VTZWxlY3RPYmplY3RDb250ZW50UmVzcG9uc2UgfSBmcm9tICcuL3htbC1wYXJzZXJzLmpzJ1xuXG5leHBvcnQgKiBmcm9tICcuL2hlbHBlcnMudHMnXG5leHBvcnQgKiBmcm9tICcuL25vdGlmaWNhdGlvbi5qcydcbmV4cG9ydCB7IENvcHlDb25kaXRpb25zLCBQb3N0UG9saWN5IH1cblxuZXhwb3J0IGNsYXNzIENsaWVudCBleHRlbmRzIFR5cGVkQ2xpZW50IHtcbiAgLy8gU2V0IGFwcGxpY2F0aW9uIHNwZWNpZmljIGluZm9ybWF0aW9uLlxuICAvL1xuICAvLyBHZW5lcmF0ZXMgVXNlci1BZ2VudCBpbiB0aGUgZm9sbG93aW5nIHN0eWxlLlxuICAvL1xuICAvLyAgICAgICBNaW5JTyAoT1M7IEFSQ0gpIExJQi9WRVIgQVBQL1ZFUlxuICAvL1xuICAvLyBfX0FyZ3VtZW50c19fXG4gIC8vICogYGFwcE5hbWVgIF9zdHJpbmdfIC0gQXBwbGljYXRpb24gbmFtZS5cbiAgLy8gKiBgYXBwVmVyc2lvbmAgX3N0cmluZ18gLSBBcHBsaWNhdGlvbiB2ZXJzaW9uLlxuICBzZXRBcHBJbmZvKGFwcE5hbWUsIGFwcFZlcnNpb24pIHtcbiAgICBpZiAoIWlzU3RyaW5nKGFwcE5hbWUpKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKGBJbnZhbGlkIGFwcE5hbWU6ICR7YXBwTmFtZX1gKVxuICAgIH1cbiAgICBpZiAoYXBwTmFtZS50cmltKCkgPT09ICcnKSB7XG4gICAgICB0aHJvdyBuZXcgZXJyb3JzLkludmFsaWRBcmd1bWVudEVycm9yKCdJbnB1dCBhcHBOYW1lIGNhbm5vdCBiZSBlbXB0eS4nKVxuICAgIH1cbiAgICBpZiAoIWlzU3RyaW5nKGFwcFZlcnNpb24pKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKGBJbnZhbGlkIGFwcFZlcnNpb246ICR7YXBwVmVyc2lvbn1gKVxuICAgIH1cbiAgICBpZiAoYXBwVmVyc2lvbi50cmltKCkgPT09ICcnKSB7XG4gICAgICB0aHJvdyBuZXcgZXJyb3JzLkludmFsaWRBcmd1bWVudEVycm9yKCdJbnB1dCBhcHBWZXJzaW9uIGNhbm5vdCBiZSBlbXB0eS4nKVxuICAgIH1cbiAgICB0aGlzLnVzZXJBZ2VudCA9IGAke3RoaXMudXNlckFnZW50fSAke2FwcE5hbWV9LyR7YXBwVmVyc2lvbn1gXG4gIH1cblxuICAvLyBDYWxjdWxhdGUgcGFydCBzaXplIGdpdmVuIHRoZSBvYmplY3Qgc2l6ZS4gUGFydCBzaXplIHdpbGwgYmUgYXRsZWFzdCB0aGlzLnBhcnRTaXplXG4gIGNhbGN1bGF0ZVBhcnRTaXplKHNpemUpIHtcbiAgICBpZiAoIWlzTnVtYmVyKHNpemUpKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdzaXplIHNob3VsZCBiZSBvZiB0eXBlIFwibnVtYmVyXCInKVxuICAgIH1cbiAgICBpZiAoc2l6ZSA+IHRoaXMubWF4T2JqZWN0U2l6ZSkge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcihgc2l6ZSBzaG91bGQgbm90IGJlIG1vcmUgdGhhbiAke3RoaXMubWF4T2JqZWN0U2l6ZX1gKVxuICAgIH1cbiAgICBpZiAodGhpcy5vdmVyUmlkZVBhcnRTaXplKSB7XG4gICAgICByZXR1cm4gdGhpcy5wYXJ0U2l6ZVxuICAgIH1cbiAgICB2YXIgcGFydFNpemUgPSB0aGlzLnBhcnRTaXplXG4gICAgZm9yICg7Oykge1xuICAgICAgLy8gd2hpbGUodHJ1ZSkgey4uLn0gdGhyb3dzIGxpbnRpbmcgZXJyb3IuXG4gICAgICAvLyBJZiBwYXJ0U2l6ZSBpcyBiaWcgZW5vdWdoIHRvIGFjY29tb2RhdGUgdGhlIG9iamVjdCBzaXplLCB0aGVuIHVzZSBpdC5cbiAgICAgIGlmIChwYXJ0U2l6ZSAqIDEwMDAwID4gc2l6ZSkge1xuICAgICAgICByZXR1cm4gcGFydFNpemVcbiAgICAgIH1cbiAgICAgIC8vIFRyeSBwYXJ0IHNpemVzIGFzIDY0TUIsIDgwTUIsIDk2TUIgZXRjLlxuICAgICAgcGFydFNpemUgKz0gMTYgKiAxMDI0ICogMTAyNFxuICAgIH1cbiAgfVxuXG4gIC8vIGxvZyB0aGUgcmVxdWVzdCwgcmVzcG9uc2UsIGVycm9yXG4gIGxvZ0hUVFAocmVxT3B0aW9ucywgcmVzcG9uc2UsIGVycikge1xuICAgIC8vIGlmIG5vIGxvZ3N0cmVhbWVyIGF2YWlsYWJsZSByZXR1cm4uXG4gICAgaWYgKCF0aGlzLmxvZ1N0cmVhbSkge1xuICAgICAgcmV0dXJuXG4gICAgfVxuICAgIGlmICghaXNPYmplY3QocmVxT3B0aW9ucykpIHtcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ3JlcU9wdGlvbnMgc2hvdWxkIGJlIG9mIHR5cGUgXCJvYmplY3RcIicpXG4gICAgfVxuICAgIGlmIChyZXNwb25zZSAmJiAhaXNSZWFkYWJsZVN0cmVhbShyZXNwb25zZSkpIHtcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ3Jlc3BvbnNlIHNob3VsZCBiZSBvZiB0eXBlIFwiU3RyZWFtXCInKVxuICAgIH1cbiAgICBpZiAoZXJyICYmICEoZXJyIGluc3RhbmNlb2YgRXJyb3IpKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdlcnIgc2hvdWxkIGJlIG9mIHR5cGUgXCJFcnJvclwiJylcbiAgICB9XG4gICAgdmFyIGxvZ0hlYWRlcnMgPSAoaGVhZGVycykgPT4ge1xuICAgICAgXy5mb3JFYWNoKGhlYWRlcnMsICh2LCBrKSA9PiB7XG4gICAgICAgIGlmIChrID09ICdhdXRob3JpemF0aW9uJykge1xuICAgICAgICAgIHZhciByZWRhY3RlciA9IG5ldyBSZWdFeHAoJ1NpZ25hdHVyZT0oWzAtOWEtZl0rKScpXG4gICAgICAgICAgdiA9IHYucmVwbGFjZShyZWRhY3RlciwgJ1NpZ25hdHVyZT0qKlJFREFDVEVEKionKVxuICAgICAgICB9XG4gICAgICAgIHRoaXMubG9nU3RyZWFtLndyaXRlKGAke2t9OiAke3Z9XFxuYClcbiAgICAgIH0pXG4gICAgICB0aGlzLmxvZ1N0cmVhbS53cml0ZSgnXFxuJylcbiAgICB9XG4gICAgdGhpcy5sb2dTdHJlYW0ud3JpdGUoYFJFUVVFU1Q6ICR7cmVxT3B0aW9ucy5tZXRob2R9ICR7cmVxT3B0aW9ucy5wYXRofVxcbmApXG4gICAgbG9nSGVhZGVycyhyZXFPcHRpb25zLmhlYWRlcnMpXG4gICAgaWYgKHJlc3BvbnNlKSB7XG4gICAgICB0aGlzLmxvZ1N0cmVhbS53cml0ZShgUkVTUE9OU0U6ICR7cmVzcG9uc2Uuc3RhdHVzQ29kZX1cXG5gKVxuICAgICAgbG9nSGVhZGVycyhyZXNwb25zZS5oZWFkZXJzKVxuICAgIH1cbiAgICBpZiAoZXJyKSB7XG4gICAgICB0aGlzLmxvZ1N0cmVhbS53cml0ZSgnRVJST1IgQk9EWTpcXG4nKVxuICAgICAgdmFyIGVyckpTT04gPSBKU09OLnN0cmluZ2lmeShlcnIsIG51bGwsICdcXHQnKVxuICAgICAgdGhpcy5sb2dTdHJlYW0ud3JpdGUoYCR7ZXJySlNPTn1cXG5gKVxuICAgIH1cbiAgfVxuXG4gIC8vIEVuYWJsZSB0cmFjaW5nXG4gIHRyYWNlT24oc3RyZWFtKSB7XG4gICAgaWYgKCFzdHJlYW0pIHtcbiAgICAgIHN0cmVhbSA9IHByb2Nlc3Muc3Rkb3V0XG4gICAgfVxuICAgIHRoaXMubG9nU3RyZWFtID0gc3RyZWFtXG4gIH1cblxuICAvLyBEaXNhYmxlIHRyYWNpbmdcbiAgdHJhY2VPZmYoKSB7XG4gICAgdGhpcy5sb2dTdHJlYW0gPSBudWxsXG4gIH1cblxuICAvLyBtYWtlUmVxdWVzdCBpcyB0aGUgcHJpbWl0aXZlIHVzZWQgYnkgdGhlIGFwaXMgZm9yIG1ha2luZyBTMyByZXF1ZXN0cy5cbiAgLy8gcGF5bG9hZCBjYW4gYmUgZW1wdHkgc3RyaW5nIGluIGNhc2Ugb2Ygbm8gcGF5bG9hZC5cbiAgLy8gc3RhdHVzQ29kZSBpcyB0aGUgZXhwZWN0ZWQgc3RhdHVzQ29kZS4gSWYgcmVzcG9uc2Uuc3RhdHVzQ29kZSBkb2VzIG5vdCBtYXRjaFxuICAvLyB3ZSBwYXJzZSB0aGUgWE1MIGVycm9yIGFuZCBjYWxsIHRoZSBjYWxsYmFjayB3aXRoIHRoZSBlcnJvciBtZXNzYWdlLlxuICAvLyBBIHZhbGlkIHJlZ2lvbiBpcyBwYXNzZWQgYnkgdGhlIGNhbGxzIC0gbGlzdEJ1Y2tldHMsIG1ha2VCdWNrZXQgYW5kXG4gIC8vIGdldEJ1Y2tldFJlZ2lvbi5cbiAgbWFrZVJlcXVlc3Qob3B0aW9ucywgcGF5bG9hZCwgc3RhdHVzQ29kZXMsIHJlZ2lvbiwgcmV0dXJuUmVzcG9uc2UsIGNiKSB7XG4gICAgaWYgKCFpc09iamVjdChvcHRpb25zKSkge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignb3B0aW9ucyBzaG91bGQgYmUgb2YgdHlwZSBcIm9iamVjdFwiJylcbiAgICB9XG4gICAgaWYgKCFpc1N0cmluZyhwYXlsb2FkKSAmJiAhaXNPYmplY3QocGF5bG9hZCkpIHtcbiAgICAgIC8vIEJ1ZmZlciBpcyBvZiB0eXBlICdvYmplY3QnXG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdwYXlsb2FkIHNob3VsZCBiZSBvZiB0eXBlIFwic3RyaW5nXCIgb3IgXCJCdWZmZXJcIicpXG4gICAgfVxuICAgIHN0YXR1c0NvZGVzLmZvckVhY2goKHN0YXR1c0NvZGUpID0+IHtcbiAgICAgIGlmICghaXNOdW1iZXIoc3RhdHVzQ29kZSkpIHtcbiAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignc3RhdHVzQ29kZSBzaG91bGQgYmUgb2YgdHlwZSBcIm51bWJlclwiJylcbiAgICAgIH1cbiAgICB9KVxuICAgIGlmICghaXNTdHJpbmcocmVnaW9uKSkge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcigncmVnaW9uIHNob3VsZCBiZSBvZiB0eXBlIFwic3RyaW5nXCInKVxuICAgIH1cbiAgICBpZiAoIWlzQm9vbGVhbihyZXR1cm5SZXNwb25zZSkpIHtcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ3JldHVyblJlc3BvbnNlIHNob3VsZCBiZSBvZiB0eXBlIFwiYm9vbGVhblwiJylcbiAgICB9XG4gICAgaWYgKCFpc0Z1bmN0aW9uKGNiKSkge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignY2FsbGJhY2sgc2hvdWxkIGJlIG9mIHR5cGUgXCJmdW5jdGlvblwiJylcbiAgICB9XG4gICAgaWYgKCFvcHRpb25zLmhlYWRlcnMpIHtcbiAgICAgIG9wdGlvbnMuaGVhZGVycyA9IHt9XG4gICAgfVxuICAgIGlmIChvcHRpb25zLm1ldGhvZCA9PT0gJ1BPU1QnIHx8IG9wdGlvbnMubWV0aG9kID09PSAnUFVUJyB8fCBvcHRpb25zLm1ldGhvZCA9PT0gJ0RFTEVURScpIHtcbiAgICAgIG9wdGlvbnMuaGVhZGVyc1snY29udGVudC1sZW5ndGgnXSA9IHBheWxvYWQubGVuZ3RoXG4gICAgfVxuICAgIHZhciBzaGEyNTZzdW0gPSAnJ1xuICAgIGlmICh0aGlzLmVuYWJsZVNIQTI1Nikge1xuICAgICAgc2hhMjU2c3VtID0gdG9TaGEyNTYocGF5bG9hZClcbiAgICB9XG4gICAgdmFyIHN0cmVhbSA9IHJlYWRhYmxlU3RyZWFtKHBheWxvYWQpXG4gICAgdGhpcy5tYWtlUmVxdWVzdFN0cmVhbShvcHRpb25zLCBzdHJlYW0sIHNoYTI1NnN1bSwgc3RhdHVzQ29kZXMsIHJlZ2lvbiwgcmV0dXJuUmVzcG9uc2UsIGNiKVxuICB9XG5cbiAgLy8gbWFrZVJlcXVlc3RTdHJlYW0gd2lsbCBiZSB1c2VkIGRpcmVjdGx5IGluc3RlYWQgb2YgbWFrZVJlcXVlc3QgaW4gY2FzZSB0aGUgcGF5bG9hZFxuICAvLyBpcyBhdmFpbGFibGUgYXMgYSBzdHJlYW0uIGZvciBleC4gcHV0T2JqZWN0XG4gIG1ha2VSZXF1ZXN0U3RyZWFtKG9wdGlvbnMsIHN0cmVhbSwgc2hhMjU2c3VtLCBzdGF0dXNDb2RlcywgcmVnaW9uLCByZXR1cm5SZXNwb25zZSwgY2IpIHtcbiAgICBpZiAoIWlzT2JqZWN0KG9wdGlvbnMpKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdvcHRpb25zIHNob3VsZCBiZSBvZiB0eXBlIFwib2JqZWN0XCInKVxuICAgIH1cbiAgICBpZiAoIWlzUmVhZGFibGVTdHJlYW0oc3RyZWFtKSkge1xuICAgICAgdGhyb3cgbmV3IGVycm9ycy5JbnZhbGlkQXJndW1lbnRFcnJvcignc3RyZWFtIHNob3VsZCBiZSBhIHJlYWRhYmxlIFN0cmVhbScpXG4gICAgfVxuICAgIGlmICghaXNTdHJpbmcoc2hhMjU2c3VtKSkge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignc2hhMjU2c3VtIHNob3VsZCBiZSBvZiB0eXBlIFwic3RyaW5nXCInKVxuICAgIH1cbiAgICBzdGF0dXNDb2Rlcy5mb3JFYWNoKChzdGF0dXNDb2RlKSA9PiB7XG4gICAgICBpZiAoIWlzTnVtYmVyKHN0YXR1c0NvZGUpKSB7XG4gICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ3N0YXR1c0NvZGUgc2hvdWxkIGJlIG9mIHR5cGUgXCJudW1iZXJcIicpXG4gICAgICB9XG4gICAgfSlcbiAgICBpZiAoIWlzU3RyaW5nKHJlZ2lvbikpIHtcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ3JlZ2lvbiBzaG91bGQgYmUgb2YgdHlwZSBcInN0cmluZ1wiJylcbiAgICB9XG4gICAgaWYgKCFpc0Jvb2xlYW4ocmV0dXJuUmVzcG9uc2UpKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdyZXR1cm5SZXNwb25zZSBzaG91bGQgYmUgb2YgdHlwZSBcImJvb2xlYW5cIicpXG4gICAgfVxuICAgIGlmICghaXNGdW5jdGlvbihjYikpIHtcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ2NhbGxiYWNrIHNob3VsZCBiZSBvZiB0eXBlIFwiZnVuY3Rpb25cIicpXG4gICAgfVxuXG4gICAgLy8gc2hhMjU2c3VtIHdpbGwgYmUgZW1wdHkgZm9yIGFub255bW91cyBvciBodHRwcyByZXF1ZXN0c1xuICAgIGlmICghdGhpcy5lbmFibGVTSEEyNTYgJiYgc2hhMjU2c3VtLmxlbmd0aCAhPT0gMCkge1xuICAgICAgdGhyb3cgbmV3IGVycm9ycy5JbnZhbGlkQXJndW1lbnRFcnJvcihgc2hhMjU2c3VtIGV4cGVjdGVkIHRvIGJlIGVtcHR5IGZvciBhbm9ueW1vdXMgb3IgaHR0cHMgcmVxdWVzdHNgKVxuICAgIH1cbiAgICAvLyBzaGEyNTZzdW0gc2hvdWxkIGJlIHZhbGlkIGZvciBub24tYW5vbnltb3VzIGh0dHAgcmVxdWVzdHMuXG4gICAgaWYgKHRoaXMuZW5hYmxlU0hBMjU2ICYmIHNoYTI1NnN1bS5sZW5ndGggIT09IDY0KSB7XG4gICAgICB0aHJvdyBuZXcgZXJyb3JzLkludmFsaWRBcmd1bWVudEVycm9yKGBJbnZhbGlkIHNoYTI1NnN1bSA6ICR7c2hhMjU2c3VtfWApXG4gICAgfVxuXG4gICAgdmFyIF9tYWtlUmVxdWVzdCA9IChlLCByZWdpb24pID0+IHtcbiAgICAgIGlmIChlKSB7XG4gICAgICAgIHJldHVybiBjYihlKVxuICAgICAgfVxuICAgICAgb3B0aW9ucy5yZWdpb24gPSByZWdpb25cbiAgICAgIHZhciByZXFPcHRpb25zID0gdGhpcy5nZXRSZXF1ZXN0T3B0aW9ucyhvcHRpb25zKVxuICAgICAgaWYgKCF0aGlzLmFub255bW91cykge1xuICAgICAgICAvLyBGb3Igbm9uLWFub255bW91cyBodHRwcyByZXF1ZXN0cyBzaGEyNTZzdW0gaXMgJ1VOU0lHTkVELVBBWUxPQUQnIGZvciBzaWduYXR1cmUgY2FsY3VsYXRpb24uXG4gICAgICAgIGlmICghdGhpcy5lbmFibGVTSEEyNTYpIHtcbiAgICAgICAgICBzaGEyNTZzdW0gPSAnVU5TSUdORUQtUEFZTE9BRCdcbiAgICAgICAgfVxuXG4gICAgICAgIGxldCBkYXRlID0gbmV3IERhdGUoKVxuXG4gICAgICAgIHJlcU9wdGlvbnMuaGVhZGVyc1sneC1hbXotZGF0ZSddID0gbWFrZURhdGVMb25nKGRhdGUpXG4gICAgICAgIHJlcU9wdGlvbnMuaGVhZGVyc1sneC1hbXotY29udGVudC1zaGEyNTYnXSA9IHNoYTI1NnN1bVxuICAgICAgICBpZiAodGhpcy5zZXNzaW9uVG9rZW4pIHtcbiAgICAgICAgICByZXFPcHRpb25zLmhlYWRlcnNbJ3gtYW16LXNlY3VyaXR5LXRva2VuJ10gPSB0aGlzLnNlc3Npb25Ub2tlblxuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5jaGVja0FuZFJlZnJlc2hDcmVkcygpXG4gICAgICAgIHZhciBhdXRob3JpemF0aW9uID0gc2lnblY0KHJlcU9wdGlvbnMsIHRoaXMuYWNjZXNzS2V5LCB0aGlzLnNlY3JldEtleSwgcmVnaW9uLCBkYXRlLCBzaGEyNTZzdW0pXG4gICAgICAgIHJlcU9wdGlvbnMuaGVhZGVycy5hdXRob3JpemF0aW9uID0gYXV0aG9yaXphdGlvblxuICAgICAgfVxuICAgICAgdmFyIHJlcSA9IHRoaXMudHJhbnNwb3J0LnJlcXVlc3QocmVxT3B0aW9ucywgKHJlc3BvbnNlKSA9PiB7XG4gICAgICAgIGlmICghc3RhdHVzQ29kZXMuaW5jbHVkZXMocmVzcG9uc2Uuc3RhdHVzQ29kZSkpIHtcbiAgICAgICAgICAvLyBGb3IgYW4gaW5jb3JyZWN0IHJlZ2lvbiwgUzMgc2VydmVyIGFsd2F5cyBzZW5kcyBiYWNrIDQwMC5cbiAgICAgICAgICAvLyBCdXQgd2Ugd2lsbCBkbyBjYWNoZSBpbnZhbGlkYXRpb24gZm9yIGFsbCBlcnJvcnMgc28gdGhhdCxcbiAgICAgICAgICAvLyBpbiBmdXR1cmUsIGlmIEFXUyBTMyBkZWNpZGVzIHRvIHNlbmQgYSBkaWZmZXJlbnQgc3RhdHVzIGNvZGUgb3JcbiAgICAgICAgICAvLyBYTUwgZXJyb3IgY29kZSB3ZSB3aWxsIHN0aWxsIHdvcmsgZmluZS5cbiAgICAgICAgICBkZWxldGUgdGhpcy5yZWdpb25NYXBbb3B0aW9ucy5idWNrZXROYW1lXVxuICAgICAgICAgIHZhciBlcnJvclRyYW5zZm9ybWVyID0gdHJhbnNmb3JtZXJzLmdldEVycm9yVHJhbnNmb3JtZXIocmVzcG9uc2UpXG4gICAgICAgICAgcGlwZXNldHVwKHJlc3BvbnNlLCBlcnJvclRyYW5zZm9ybWVyKS5vbignZXJyb3InLCAoZSkgPT4ge1xuICAgICAgICAgICAgdGhpcy5sb2dIVFRQKHJlcU9wdGlvbnMsIHJlc3BvbnNlLCBlKVxuICAgICAgICAgICAgY2IoZSlcbiAgICAgICAgICB9KVxuICAgICAgICAgIHJldHVyblxuICAgICAgICB9XG4gICAgICAgIHRoaXMubG9nSFRUUChyZXFPcHRpb25zLCByZXNwb25zZSlcbiAgICAgICAgaWYgKHJldHVyblJlc3BvbnNlKSB7XG4gICAgICAgICAgcmV0dXJuIGNiKG51bGwsIHJlc3BvbnNlKVxuICAgICAgICB9XG4gICAgICAgIC8vIFdlIGRyYWluIHRoZSBzb2NrZXQgc28gdGhhdCB0aGUgY29ubmVjdGlvbiBnZXRzIGNsb3NlZC4gTm90ZSB0aGF0IHRoaXNcbiAgICAgICAgLy8gaXMgbm90IGV4cGVuc2l2ZSBhcyB0aGUgc29ja2V0IHdpbGwgbm90IGhhdmUgYW55IGRhdGEuXG4gICAgICAgIHJlc3BvbnNlLm9uKCdkYXRhJywgKCkgPT4ge30pXG4gICAgICAgIGNiKG51bGwpXG4gICAgICB9KVxuICAgICAgbGV0IHBpcGUgPSBwaXBlc2V0dXAoc3RyZWFtLCByZXEpXG4gICAgICBwaXBlLm9uKCdlcnJvcicsIChlKSA9PiB7XG4gICAgICAgIHRoaXMubG9nSFRUUChyZXFPcHRpb25zLCBudWxsLCBlKVxuICAgICAgICBjYihlKVxuICAgICAgfSlcbiAgICB9XG4gICAgaWYgKHJlZ2lvbikge1xuICAgICAgcmV0dXJuIF9tYWtlUmVxdWVzdChudWxsLCByZWdpb24pXG4gICAgfVxuICAgIHRoaXMuZ2V0QnVja2V0UmVnaW9uKG9wdGlvbnMuYnVja2V0TmFtZSwgX21ha2VSZXF1ZXN0KVxuICB9XG5cbiAgLy8gZ2V0cyB0aGUgcmVnaW9uIG9mIHRoZSBidWNrZXRcbiAgZ2V0QnVja2V0UmVnaW9uKGJ1Y2tldE5hbWUsIGNiKSB7XG4gICAgaWYgKCFpc1ZhbGlkQnVja2V0TmFtZShidWNrZXROYW1lKSkge1xuICAgICAgdGhyb3cgbmV3IGVycm9ycy5JbnZhbGlkQnVja2V0TmFtZUVycm9yKGBJbnZhbGlkIGJ1Y2tldCBuYW1lIDogJHtidWNrZXROYW1lfWApXG4gICAgfVxuICAgIGlmICghaXNGdW5jdGlvbihjYikpIHtcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ2NiIHNob3VsZCBiZSBvZiB0eXBlIFwiZnVuY3Rpb25cIicpXG4gICAgfVxuXG4gICAgLy8gUmVnaW9uIGlzIHNldCB3aXRoIGNvbnN0cnVjdG9yLCByZXR1cm4gdGhlIHJlZ2lvbiByaWdodCBoZXJlLlxuICAgIGlmICh0aGlzLnJlZ2lvbikge1xuICAgICAgcmV0dXJuIGNiKG51bGwsIHRoaXMucmVnaW9uKVxuICAgIH1cblxuICAgIGlmICh0aGlzLnJlZ2lvbk1hcFtidWNrZXROYW1lXSkge1xuICAgICAgcmV0dXJuIGNiKG51bGwsIHRoaXMucmVnaW9uTWFwW2J1Y2tldE5hbWVdKVxuICAgIH1cbiAgICB2YXIgZXh0cmFjdFJlZ2lvbiA9IChyZXNwb25zZSkgPT4ge1xuICAgICAgdmFyIHRyYW5zZm9ybWVyID0gdHJhbnNmb3JtZXJzLmdldEJ1Y2tldFJlZ2lvblRyYW5zZm9ybWVyKClcbiAgICAgIHZhciByZWdpb24gPSBERUZBVUxUX1JFR0lPTlxuICAgICAgcGlwZXNldHVwKHJlc3BvbnNlLCB0cmFuc2Zvcm1lcilcbiAgICAgICAgLm9uKCdlcnJvcicsIGNiKVxuICAgICAgICAub24oJ2RhdGEnLCAoZGF0YSkgPT4ge1xuICAgICAgICAgIGlmIChkYXRhKSB7XG4gICAgICAgICAgICByZWdpb24gPSBkYXRhXG4gICAgICAgICAgfVxuICAgICAgICB9KVxuICAgICAgICAub24oJ2VuZCcsICgpID0+IHtcbiAgICAgICAgICB0aGlzLnJlZ2lvbk1hcFtidWNrZXROYW1lXSA9IHJlZ2lvblxuICAgICAgICAgIGNiKG51bGwsIHJlZ2lvbilcbiAgICAgICAgfSlcbiAgICB9XG5cbiAgICB2YXIgbWV0aG9kID0gJ0dFVCdcbiAgICB2YXIgcXVlcnkgPSAnbG9jYXRpb24nXG5cbiAgICAvLyBgZ2V0QnVja2V0TG9jYXRpb25gIGJlaGF2ZXMgZGlmZmVyZW50bHkgaW4gZm9sbG93aW5nIHdheXMgZm9yXG4gICAgLy8gZGlmZmVyZW50IGVudmlyb25tZW50cy5cbiAgICAvL1xuICAgIC8vIC0gRm9yIG5vZGVqcyBlbnYgd2UgZGVmYXVsdCB0byBwYXRoIHN0eWxlIHJlcXVlc3RzLlxuICAgIC8vIC0gRm9yIGJyb3dzZXIgZW52IHBhdGggc3R5bGUgcmVxdWVzdHMgb24gYnVja2V0cyB5aWVsZHMgQ09SU1xuICAgIC8vICAgZXJyb3IuIFRvIGNpcmN1bXZlbnQgdGhpcyBwcm9ibGVtIHdlIG1ha2UgYSB2aXJ0dWFsIGhvc3RcbiAgICAvLyAgIHN0eWxlIHJlcXVlc3Qgc2lnbmVkIHdpdGggJ3VzLWVhc3QtMScuIFRoaXMgcmVxdWVzdCBmYWlsc1xuICAgIC8vICAgd2l0aCBhbiBlcnJvciAnQXV0aG9yaXphdGlvbkhlYWRlck1hbGZvcm1lZCcsIGFkZGl0aW9uYWxseVxuICAgIC8vICAgdGhlIGVycm9yIFhNTCBhbHNvIHByb3ZpZGVzIFJlZ2lvbiBvZiB0aGUgYnVja2V0LiBUbyB2YWxpZGF0ZVxuICAgIC8vICAgdGhpcyByZWdpb24gaXMgcHJvcGVyIHdlIHJldHJ5IHRoZSBzYW1lIHJlcXVlc3Qgd2l0aCB0aGUgbmV3bHlcbiAgICAvLyAgIG9idGFpbmVkIHJlZ2lvbi5cbiAgICB2YXIgcGF0aFN0eWxlID0gdGhpcy5wYXRoU3R5bGUgJiYgdHlwZW9mIHdpbmRvdyA9PT0gJ3VuZGVmaW5lZCdcblxuICAgIHRoaXMubWFrZVJlcXVlc3QoeyBtZXRob2QsIGJ1Y2tldE5hbWUsIHF1ZXJ5LCBwYXRoU3R5bGUgfSwgJycsIFsyMDBdLCBERUZBVUxUX1JFR0lPTiwgdHJ1ZSwgKGUsIHJlc3BvbnNlKSA9PiB7XG4gICAgICBpZiAoZSkge1xuICAgICAgICBpZiAoZS5uYW1lID09PSAnQXV0aG9yaXphdGlvbkhlYWRlck1hbGZvcm1lZCcpIHtcbiAgICAgICAgICB2YXIgcmVnaW9uID0gZS5SZWdpb25cbiAgICAgICAgICBpZiAoIXJlZ2lvbikge1xuICAgICAgICAgICAgcmV0dXJuIGNiKGUpXG4gICAgICAgICAgfVxuICAgICAgICAgIHRoaXMubWFrZVJlcXVlc3QoeyBtZXRob2QsIGJ1Y2tldE5hbWUsIHF1ZXJ5IH0sICcnLCBbMjAwXSwgcmVnaW9uLCB0cnVlLCAoZSwgcmVzcG9uc2UpID0+IHtcbiAgICAgICAgICAgIGlmIChlKSB7XG4gICAgICAgICAgICAgIHJldHVybiBjYihlKVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZXh0cmFjdFJlZ2lvbihyZXNwb25zZSlcbiAgICAgICAgICB9KVxuICAgICAgICAgIHJldHVyblxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBjYihlKVxuICAgICAgfVxuICAgICAgZXh0cmFjdFJlZ2lvbihyZXNwb25zZSlcbiAgICB9KVxuICB9XG5cbiAgLy8gQ3JlYXRlcyB0aGUgYnVja2V0IGBidWNrZXROYW1lYC5cbiAgLy9cbiAgLy8gX19Bcmd1bWVudHNfX1xuICAvLyAqIGBidWNrZXROYW1lYCBfc3RyaW5nXyAtIE5hbWUgb2YgdGhlIGJ1Y2tldFxuICAvLyAqIGByZWdpb25gIF9zdHJpbmdfIC0gcmVnaW9uIHZhbGlkIHZhbHVlcyBhcmUgX3VzLXdlc3QtMV8sIF91cy13ZXN0LTJfLCAgX2V1LXdlc3QtMV8sIF9ldS1jZW50cmFsLTFfLCBfYXAtc291dGhlYXN0LTFfLCBfYXAtbm9ydGhlYXN0LTFfLCBfYXAtc291dGhlYXN0LTJfLCBfc2EtZWFzdC0xXy5cbiAgLy8gKiBgbWFrZU9wdHNgIF9vYmplY3RfIC0gT3B0aW9ucyB0byBjcmVhdGUgYSBidWNrZXQuIGUuZyB7T2JqZWN0TG9ja2luZzp0cnVlfSAoT3B0aW9uYWwpXG4gIC8vICogYGNhbGxiYWNrKGVycilgIF9mdW5jdGlvbl8gLSBjYWxsYmFjayBmdW5jdGlvbiB3aXRoIGBlcnJgIGFzIHRoZSBlcnJvciBhcmd1bWVudC4gYGVycmAgaXMgbnVsbCBpZiB0aGUgYnVja2V0IGlzIHN1Y2Nlc3NmdWxseSBjcmVhdGVkLlxuICBtYWtlQnVja2V0KGJ1Y2tldE5hbWUsIHJlZ2lvbiwgbWFrZU9wdHMgPSB7fSwgY2IpIHtcbiAgICBpZiAoIWlzVmFsaWRCdWNrZXROYW1lKGJ1Y2tldE5hbWUpKSB7XG4gICAgICB0aHJvdyBuZXcgZXJyb3JzLkludmFsaWRCdWNrZXROYW1lRXJyb3IoJ0ludmFsaWQgYnVja2V0IG5hbWU6ICcgKyBidWNrZXROYW1lKVxuICAgIH1cbiAgICAvLyBCYWNrd2FyZCBDb21wYXRpYmlsaXR5XG4gICAgaWYgKGlzT2JqZWN0KHJlZ2lvbikpIHtcbiAgICAgIGNiID0gbWFrZU9wdHNcbiAgICAgIG1ha2VPcHRzID0gcmVnaW9uXG4gICAgICByZWdpb24gPSAnJ1xuICAgIH1cbiAgICBpZiAoaXNGdW5jdGlvbihyZWdpb24pKSB7XG4gICAgICBjYiA9IHJlZ2lvblxuICAgICAgcmVnaW9uID0gJydcbiAgICAgIG1ha2VPcHRzID0ge31cbiAgICB9XG4gICAgaWYgKGlzRnVuY3Rpb24obWFrZU9wdHMpKSB7XG4gICAgICBjYiA9IG1ha2VPcHRzXG4gICAgICBtYWtlT3B0cyA9IHt9XG4gICAgfVxuXG4gICAgaWYgKCFpc1N0cmluZyhyZWdpb24pKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdyZWdpb24gc2hvdWxkIGJlIG9mIHR5cGUgXCJzdHJpbmdcIicpXG4gICAgfVxuICAgIGlmICghaXNPYmplY3QobWFrZU9wdHMpKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdtYWtlT3B0cyBzaG91bGQgYmUgb2YgdHlwZSBcIm9iamVjdFwiJylcbiAgICB9XG4gICAgaWYgKCFpc0Z1bmN0aW9uKGNiKSkge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignY2FsbGJhY2sgc2hvdWxkIGJlIG9mIHR5cGUgXCJmdW5jdGlvblwiJylcbiAgICB9XG5cbiAgICB2YXIgcGF5bG9hZCA9ICcnXG5cbiAgICAvLyBSZWdpb24gYWxyZWFkeSBzZXQgaW4gY29uc3RydWN0b3IsIHZhbGlkYXRlIGlmXG4gICAgLy8gY2FsbGVyIHJlcXVlc3RlZCBidWNrZXQgbG9jYXRpb24gaXMgc2FtZS5cbiAgICBpZiAocmVnaW9uICYmIHRoaXMucmVnaW9uKSB7XG4gICAgICBpZiAocmVnaW9uICE9PSB0aGlzLnJlZ2lvbikge1xuICAgICAgICB0aHJvdyBuZXcgZXJyb3JzLkludmFsaWRBcmd1bWVudEVycm9yKGBDb25maWd1cmVkIHJlZ2lvbiAke3RoaXMucmVnaW9ufSwgcmVxdWVzdGVkICR7cmVnaW9ufWApXG4gICAgICB9XG4gICAgfVxuICAgIC8vIHNlbmRpbmcgbWFrZUJ1Y2tldCByZXF1ZXN0IHdpdGggWE1MIGNvbnRhaW5pbmcgJ3VzLWVhc3QtMScgZmFpbHMuIEZvclxuICAgIC8vIGRlZmF1bHQgcmVnaW9uIHNlcnZlciBleHBlY3RzIHRoZSByZXF1ZXN0IHdpdGhvdXQgYm9keVxuICAgIGlmIChyZWdpb24gJiYgcmVnaW9uICE9PSBERUZBVUxUX1JFR0lPTikge1xuICAgICAgdmFyIGNyZWF0ZUJ1Y2tldENvbmZpZ3VyYXRpb24gPSBbXVxuICAgICAgY3JlYXRlQnVja2V0Q29uZmlndXJhdGlvbi5wdXNoKHtcbiAgICAgICAgX2F0dHI6IHtcbiAgICAgICAgICB4bWxuczogJ2h0dHA6Ly9zMy5hbWF6b25hd3MuY29tL2RvYy8yMDA2LTAzLTAxLycsXG4gICAgICAgIH0sXG4gICAgICB9KVxuICAgICAgY3JlYXRlQnVja2V0Q29uZmlndXJhdGlvbi5wdXNoKHtcbiAgICAgICAgTG9jYXRpb25Db25zdHJhaW50OiByZWdpb24sXG4gICAgICB9KVxuICAgICAgdmFyIHBheWxvYWRPYmplY3QgPSB7XG4gICAgICAgIENyZWF0ZUJ1Y2tldENvbmZpZ3VyYXRpb246IGNyZWF0ZUJ1Y2tldENvbmZpZ3VyYXRpb24sXG4gICAgICB9XG4gICAgICBwYXlsb2FkID0gWG1sKHBheWxvYWRPYmplY3QpXG4gICAgfVxuICAgIHZhciBtZXRob2QgPSAnUFVUJ1xuICAgIHZhciBoZWFkZXJzID0ge31cblxuICAgIGlmIChtYWtlT3B0cy5PYmplY3RMb2NraW5nKSB7XG4gICAgICBoZWFkZXJzWyd4LWFtei1idWNrZXQtb2JqZWN0LWxvY2stZW5hYmxlZCddID0gdHJ1ZVxuICAgIH1cblxuICAgIGlmICghcmVnaW9uKSB7XG4gICAgICByZWdpb24gPSBERUZBVUxUX1JFR0lPTlxuICAgIH1cblxuICAgIGNvbnN0IHByb2Nlc3NXaXRoUmV0cnkgPSAoZXJyKSA9PiB7XG4gICAgICBpZiAoZXJyICYmIChyZWdpb24gPT09ICcnIHx8IHJlZ2lvbiA9PT0gREVGQVVMVF9SRUdJT04pKSB7XG4gICAgICAgIGlmIChlcnIuY29kZSA9PT0gJ0F1dGhvcml6YXRpb25IZWFkZXJNYWxmb3JtZWQnICYmIGVyci5yZWdpb24gIT09ICcnKSB7XG4gICAgICAgICAgLy8gUmV0cnkgd2l0aCByZWdpb24gcmV0dXJuZWQgYXMgcGFydCBvZiBlcnJvclxuICAgICAgICAgIHRoaXMubWFrZVJlcXVlc3QoeyBtZXRob2QsIGJ1Y2tldE5hbWUsIGhlYWRlcnMgfSwgcGF5bG9hZCwgWzIwMF0sIGVyci5yZWdpb24sIGZhbHNlLCBjYilcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICByZXR1cm4gY2IgJiYgY2IoZXJyKVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICByZXR1cm4gY2IgJiYgY2IoZXJyKVxuICAgIH1cbiAgICB0aGlzLm1ha2VSZXF1ZXN0KHsgbWV0aG9kLCBidWNrZXROYW1lLCBoZWFkZXJzIH0sIHBheWxvYWQsIFsyMDBdLCByZWdpb24sIGZhbHNlLCBwcm9jZXNzV2l0aFJldHJ5KVxuICB9XG5cbiAgLy8gTGlzdCBvZiBidWNrZXRzIGNyZWF0ZWQuXG4gIC8vXG4gIC8vIF9fQXJndW1lbnRzX19cbiAgLy8gKiBgY2FsbGJhY2soZXJyLCBidWNrZXRzKWAgX2Z1bmN0aW9uXyAtIGNhbGxiYWNrIGZ1bmN0aW9uIHdpdGggZXJyb3IgYXMgdGhlIGZpcnN0IGFyZ3VtZW50LiBgYnVja2V0c2AgaXMgYW4gYXJyYXkgb2YgYnVja2V0IGluZm9ybWF0aW9uXG4gIC8vXG4gIC8vIGBidWNrZXRzYCBhcnJheSBlbGVtZW50OlxuICAvLyAqIGBidWNrZXQubmFtZWAgX3N0cmluZ18gOiBidWNrZXQgbmFtZVxuICAvLyAqIGBidWNrZXQuY3JlYXRpb25EYXRlYCBfRGF0ZV86IGRhdGUgd2hlbiBidWNrZXQgd2FzIGNyZWF0ZWRcbiAgbGlzdEJ1Y2tldHMoY2IpIHtcbiAgICBpZiAoIWlzRnVuY3Rpb24oY2IpKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdjYWxsYmFjayBzaG91bGQgYmUgb2YgdHlwZSBcImZ1bmN0aW9uXCInKVxuICAgIH1cbiAgICB2YXIgbWV0aG9kID0gJ0dFVCdcbiAgICB0aGlzLm1ha2VSZXF1ZXN0KHsgbWV0aG9kIH0sICcnLCBbMjAwXSwgREVGQVVMVF9SRUdJT04sIHRydWUsIChlLCByZXNwb25zZSkgPT4ge1xuICAgICAgaWYgKGUpIHtcbiAgICAgICAgcmV0dXJuIGNiKGUpXG4gICAgICB9XG4gICAgICB2YXIgdHJhbnNmb3JtZXIgPSB0cmFuc2Zvcm1lcnMuZ2V0TGlzdEJ1Y2tldFRyYW5zZm9ybWVyKClcbiAgICAgIHZhciBidWNrZXRzXG4gICAgICBwaXBlc2V0dXAocmVzcG9uc2UsIHRyYW5zZm9ybWVyKVxuICAgICAgICAub24oJ2RhdGEnLCAocmVzdWx0KSA9PiAoYnVja2V0cyA9IHJlc3VsdCkpXG4gICAgICAgIC5vbignZXJyb3InLCAoZSkgPT4gY2IoZSkpXG4gICAgICAgIC5vbignZW5kJywgKCkgPT4gY2IobnVsbCwgYnVja2V0cykpXG4gICAgfSlcbiAgfVxuXG4gIC8vIFJldHVybnMgYSBzdHJlYW0gdGhhdCBlbWl0cyBvYmplY3RzIHRoYXQgYXJlIHBhcnRpYWxseSB1cGxvYWRlZC5cbiAgLy9cbiAgLy8gX19Bcmd1bWVudHNfX1xuICAvLyAqIGBidWNrZXROYW1lYCBfc3RyaW5nXzogbmFtZSBvZiB0aGUgYnVja2V0XG4gIC8vICogYHByZWZpeGAgX3N0cmluZ186IHByZWZpeCBvZiB0aGUgb2JqZWN0IG5hbWVzIHRoYXQgYXJlIHBhcnRpYWxseSB1cGxvYWRlZCAob3B0aW9uYWwsIGRlZmF1bHQgYCcnYClcbiAgLy8gKiBgcmVjdXJzaXZlYCBfYm9vbF86IGRpcmVjdG9yeSBzdHlsZSBsaXN0aW5nIHdoZW4gZmFsc2UsIHJlY3Vyc2l2ZSBsaXN0aW5nIHdoZW4gdHJ1ZSAob3B0aW9uYWwsIGRlZmF1bHQgYGZhbHNlYClcbiAgLy9cbiAgLy8gX19SZXR1cm4gVmFsdWVfX1xuICAvLyAqIGBzdHJlYW1gIF9TdHJlYW1fIDogZW1pdHMgb2JqZWN0cyBvZiB0aGUgZm9ybWF0OlxuICAvLyAgICogYG9iamVjdC5rZXlgIF9zdHJpbmdfOiBuYW1lIG9mIHRoZSBvYmplY3RcbiAgLy8gICAqIGBvYmplY3QudXBsb2FkSWRgIF9zdHJpbmdfOiB1cGxvYWQgSUQgb2YgdGhlIG9iamVjdFxuICAvLyAgICogYG9iamVjdC5zaXplYCBfSW50ZWdlcl86IHNpemUgb2YgdGhlIHBhcnRpYWxseSB1cGxvYWRlZCBvYmplY3RcbiAgbGlzdEluY29tcGxldGVVcGxvYWRzKGJ1Y2tldCwgcHJlZml4LCByZWN1cnNpdmUpIHtcbiAgICBpZiAocHJlZml4ID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHByZWZpeCA9ICcnXG4gICAgfVxuICAgIGlmIChyZWN1cnNpdmUgPT09IHVuZGVmaW5lZCkge1xuICAgICAgcmVjdXJzaXZlID0gZmFsc2VcbiAgICB9XG4gICAgaWYgKCFpc1ZhbGlkQnVja2V0TmFtZShidWNrZXQpKSB7XG4gICAgICB0aHJvdyBuZXcgZXJyb3JzLkludmFsaWRCdWNrZXROYW1lRXJyb3IoJ0ludmFsaWQgYnVja2V0IG5hbWU6ICcgKyBidWNrZXQpXG4gICAgfVxuICAgIGlmICghaXNWYWxpZFByZWZpeChwcmVmaXgpKSB7XG4gICAgICB0aHJvdyBuZXcgZXJyb3JzLkludmFsaWRQcmVmaXhFcnJvcihgSW52YWxpZCBwcmVmaXggOiAke3ByZWZpeH1gKVxuICAgIH1cbiAgICBpZiAoIWlzQm9vbGVhbihyZWN1cnNpdmUpKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdyZWN1cnNpdmUgc2hvdWxkIGJlIG9mIHR5cGUgXCJib29sZWFuXCInKVxuICAgIH1cbiAgICB2YXIgZGVsaW1pdGVyID0gcmVjdXJzaXZlID8gJycgOiAnLydcbiAgICB2YXIga2V5TWFya2VyID0gJydcbiAgICB2YXIgdXBsb2FkSWRNYXJrZXIgPSAnJ1xuICAgIHZhciB1cGxvYWRzID0gW11cbiAgICB2YXIgZW5kZWQgPSBmYWxzZVxuICAgIHZhciByZWFkU3RyZWFtID0gU3RyZWFtLlJlYWRhYmxlKHsgb2JqZWN0TW9kZTogdHJ1ZSB9KVxuICAgIHJlYWRTdHJlYW0uX3JlYWQgPSAoKSA9PiB7XG4gICAgICAvLyBwdXNoIG9uZSB1cGxvYWQgaW5mbyBwZXIgX3JlYWQoKVxuICAgICAgaWYgKHVwbG9hZHMubGVuZ3RoKSB7XG4gICAgICAgIHJldHVybiByZWFkU3RyZWFtLnB1c2godXBsb2Fkcy5zaGlmdCgpKVxuICAgICAgfVxuICAgICAgaWYgKGVuZGVkKSB7XG4gICAgICAgIHJldHVybiByZWFkU3RyZWFtLnB1c2gobnVsbClcbiAgICAgIH1cbiAgICAgIHRoaXMubGlzdEluY29tcGxldGVVcGxvYWRzUXVlcnkoYnVja2V0LCBwcmVmaXgsIGtleU1hcmtlciwgdXBsb2FkSWRNYXJrZXIsIGRlbGltaXRlcilcbiAgICAgICAgLm9uKCdlcnJvcicsIChlKSA9PiByZWFkU3RyZWFtLmVtaXQoJ2Vycm9yJywgZSkpXG4gICAgICAgIC5vbignZGF0YScsIChyZXN1bHQpID0+IHtcbiAgICAgICAgICByZXN1bHQucHJlZml4ZXMuZm9yRWFjaCgocHJlZml4KSA9PiB1cGxvYWRzLnB1c2gocHJlZml4KSlcbiAgICAgICAgICBhc3luYy5lYWNoU2VyaWVzKFxuICAgICAgICAgICAgcmVzdWx0LnVwbG9hZHMsXG4gICAgICAgICAgICAodXBsb2FkLCBjYikgPT4ge1xuICAgICAgICAgICAgICAvLyBmb3IgZWFjaCBpbmNvbXBsZXRlIHVwbG9hZCBhZGQgdGhlIHNpemVzIG9mIGl0cyB1cGxvYWRlZCBwYXJ0c1xuICAgICAgICAgICAgICB0aGlzLmxpc3RQYXJ0cyhidWNrZXQsIHVwbG9hZC5rZXksIHVwbG9hZC51cGxvYWRJZCwgKGVyciwgcGFydHMpID0+IHtcbiAgICAgICAgICAgICAgICBpZiAoZXJyKSB7XG4gICAgICAgICAgICAgICAgICByZXR1cm4gY2IoZXJyKVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB1cGxvYWQuc2l6ZSA9IHBhcnRzLnJlZHVjZSgoYWNjLCBpdGVtKSA9PiBhY2MgKyBpdGVtLnNpemUsIDApXG4gICAgICAgICAgICAgICAgdXBsb2Fkcy5wdXNoKHVwbG9hZClcbiAgICAgICAgICAgICAgICBjYigpXG4gICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgKGVycikgPT4ge1xuICAgICAgICAgICAgICBpZiAoZXJyKSB7XG4gICAgICAgICAgICAgICAgcmVhZFN0cmVhbS5lbWl0KCdlcnJvcicsIGVycilcbiAgICAgICAgICAgICAgICByZXR1cm5cbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBpZiAocmVzdWx0LmlzVHJ1bmNhdGVkKSB7XG4gICAgICAgICAgICAgICAga2V5TWFya2VyID0gcmVzdWx0Lm5leHRLZXlNYXJrZXJcbiAgICAgICAgICAgICAgICB1cGxvYWRJZE1hcmtlciA9IHJlc3VsdC5uZXh0VXBsb2FkSWRNYXJrZXJcbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBlbmRlZCA9IHRydWVcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICByZWFkU3RyZWFtLl9yZWFkKClcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgKVxuICAgICAgICB9KVxuICAgIH1cbiAgICByZXR1cm4gcmVhZFN0cmVhbVxuICB9XG5cbiAgLy8gVG8gY2hlY2sgaWYgYSBidWNrZXQgYWxyZWFkeSBleGlzdHMuXG4gIC8vXG4gIC8vIF9fQXJndW1lbnRzX19cbiAgLy8gKiBgYnVja2V0TmFtZWAgX3N0cmluZ18gOiBuYW1lIG9mIHRoZSBidWNrZXRcbiAgLy8gKiBgY2FsbGJhY2soZXJyKWAgX2Z1bmN0aW9uXyA6IGBlcnJgIGlzIGBudWxsYCBpZiB0aGUgYnVja2V0IGV4aXN0c1xuICBidWNrZXRFeGlzdHMoYnVja2V0TmFtZSwgY2IpIHtcbiAgICBpZiAoIWlzVmFsaWRCdWNrZXROYW1lKGJ1Y2tldE5hbWUpKSB7XG4gICAgICB0aHJvdyBuZXcgZXJyb3JzLkludmFsaWRCdWNrZXROYW1lRXJyb3IoJ0ludmFsaWQgYnVja2V0IG5hbWU6ICcgKyBidWNrZXROYW1lKVxuICAgIH1cbiAgICBpZiAoIWlzRnVuY3Rpb24oY2IpKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdjYWxsYmFjayBzaG91bGQgYmUgb2YgdHlwZSBcImZ1bmN0aW9uXCInKVxuICAgIH1cbiAgICB2YXIgbWV0aG9kID0gJ0hFQUQnXG4gICAgdGhpcy5tYWtlUmVxdWVzdCh7IG1ldGhvZCwgYnVja2V0TmFtZSB9LCAnJywgWzIwMF0sICcnLCBmYWxzZSwgKGVycikgPT4ge1xuICAgICAgaWYgKGVycikge1xuICAgICAgICBpZiAoZXJyLmNvZGUgPT0gJ05vU3VjaEJ1Y2tldCcgfHwgZXJyLmNvZGUgPT0gJ05vdEZvdW5kJykge1xuICAgICAgICAgIHJldHVybiBjYihudWxsLCBmYWxzZSlcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gY2IoZXJyKVxuICAgICAgfVxuICAgICAgY2IobnVsbCwgdHJ1ZSlcbiAgICB9KVxuICB9XG5cbiAgLy8gUmVtb3ZlIGEgYnVja2V0LlxuICAvL1xuICAvLyBfX0FyZ3VtZW50c19fXG4gIC8vICogYGJ1Y2tldE5hbWVgIF9zdHJpbmdfIDogbmFtZSBvZiB0aGUgYnVja2V0XG4gIC8vICogYGNhbGxiYWNrKGVycilgIF9mdW5jdGlvbl8gOiBgZXJyYCBpcyBgbnVsbGAgaWYgdGhlIGJ1Y2tldCBpcyByZW1vdmVkIHN1Y2Nlc3NmdWxseS5cbiAgcmVtb3ZlQnVja2V0KGJ1Y2tldE5hbWUsIGNiKSB7XG4gICAgaWYgKCFpc1ZhbGlkQnVja2V0TmFtZShidWNrZXROYW1lKSkge1xuICAgICAgdGhyb3cgbmV3IGVycm9ycy5JbnZhbGlkQnVja2V0TmFtZUVycm9yKCdJbnZhbGlkIGJ1Y2tldCBuYW1lOiAnICsgYnVja2V0TmFtZSlcbiAgICB9XG4gICAgaWYgKCFpc0Z1bmN0aW9uKGNiKSkge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignY2FsbGJhY2sgc2hvdWxkIGJlIG9mIHR5cGUgXCJmdW5jdGlvblwiJylcbiAgICB9XG4gICAgdmFyIG1ldGhvZCA9ICdERUxFVEUnXG4gICAgdGhpcy5tYWtlUmVxdWVzdCh7IG1ldGhvZCwgYnVja2V0TmFtZSB9LCAnJywgWzIwNF0sICcnLCBmYWxzZSwgKGUpID0+IHtcbiAgICAgIC8vIElmIHRoZSBidWNrZXQgd2FzIHN1Y2Nlc3NmdWxseSByZW1vdmVkLCByZW1vdmUgdGhlIHJlZ2lvbiBtYXAgZW50cnkuXG4gICAgICBpZiAoIWUpIHtcbiAgICAgICAgZGVsZXRlIHRoaXMucmVnaW9uTWFwW2J1Y2tldE5hbWVdXG4gICAgICB9XG4gICAgICBjYihlKVxuICAgIH0pXG4gIH1cblxuICAvLyBSZW1vdmUgdGhlIHBhcnRpYWxseSB1cGxvYWRlZCBvYmplY3QuXG4gIC8vXG4gIC8vIF9fQXJndW1lbnRzX19cbiAgLy8gKiBgYnVja2V0TmFtZWAgX3N0cmluZ186IG5hbWUgb2YgdGhlIGJ1Y2tldFxuICAvLyAqIGBvYmplY3ROYW1lYCBfc3RyaW5nXzogbmFtZSBvZiB0aGUgb2JqZWN0XG4gIC8vICogYGNhbGxiYWNrKGVycilgIF9mdW5jdGlvbl86IGNhbGxiYWNrIGZ1bmN0aW9uIGlzIGNhbGxlZCB3aXRoIG5vbiBgbnVsbGAgdmFsdWUgaW4gY2FzZSBvZiBlcnJvclxuICByZW1vdmVJbmNvbXBsZXRlVXBsb2FkKGJ1Y2tldE5hbWUsIG9iamVjdE5hbWUsIGNiKSB7XG4gICAgaWYgKCFpc1ZhbGlkQnVja2V0TmFtZShidWNrZXROYW1lKSkge1xuICAgICAgdGhyb3cgbmV3IGVycm9ycy5Jc1ZhbGlkQnVja2V0TmFtZUVycm9yKCdJbnZhbGlkIGJ1Y2tldCBuYW1lOiAnICsgYnVja2V0TmFtZSlcbiAgICB9XG4gICAgaWYgKCFpc1ZhbGlkT2JqZWN0TmFtZShvYmplY3ROYW1lKSkge1xuICAgICAgdGhyb3cgbmV3IGVycm9ycy5JbnZhbGlkT2JqZWN0TmFtZUVycm9yKGBJbnZhbGlkIG9iamVjdCBuYW1lOiAke29iamVjdE5hbWV9YClcbiAgICB9XG4gICAgaWYgKCFpc0Z1bmN0aW9uKGNiKSkge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignY2FsbGJhY2sgc2hvdWxkIGJlIG9mIHR5cGUgXCJmdW5jdGlvblwiJylcbiAgICB9XG4gICAgdmFyIHJlbW92ZVVwbG9hZElkXG4gICAgYXN5bmMuZHVyaW5nKFxuICAgICAgKGNiKSA9PiB7XG4gICAgICAgIHRoaXMuZmluZFVwbG9hZElkKGJ1Y2tldE5hbWUsIG9iamVjdE5hbWUsIChlLCB1cGxvYWRJZCkgPT4ge1xuICAgICAgICAgIGlmIChlKSB7XG4gICAgICAgICAgICByZXR1cm4gY2IoZSlcbiAgICAgICAgICB9XG4gICAgICAgICAgcmVtb3ZlVXBsb2FkSWQgPSB1cGxvYWRJZFxuICAgICAgICAgIGNiKG51bGwsIHVwbG9hZElkKVxuICAgICAgICB9KVxuICAgICAgfSxcbiAgICAgIChjYikgPT4ge1xuICAgICAgICB2YXIgbWV0aG9kID0gJ0RFTEVURSdcbiAgICAgICAgdmFyIHF1ZXJ5ID0gYHVwbG9hZElkPSR7cmVtb3ZlVXBsb2FkSWR9YFxuICAgICAgICB0aGlzLm1ha2VSZXF1ZXN0KHsgbWV0aG9kLCBidWNrZXROYW1lLCBvYmplY3ROYW1lLCBxdWVyeSB9LCAnJywgWzIwNF0sICcnLCBmYWxzZSwgKGUpID0+IGNiKGUpKVxuICAgICAgfSxcbiAgICAgIGNiLFxuICAgIClcbiAgfVxuXG4gIC8vIENhbGxiYWNrIGlzIGNhbGxlZCB3aXRoIGBlcnJvcmAgaW4gY2FzZSBvZiBlcnJvciBvciBgbnVsbGAgaW4gY2FzZSBvZiBzdWNjZXNzXG4gIC8vXG4gIC8vIF9fQXJndW1lbnRzX19cbiAgLy8gKiBgYnVja2V0TmFtZWAgX3N0cmluZ186IG5hbWUgb2YgdGhlIGJ1Y2tldFxuICAvLyAqIGBvYmplY3ROYW1lYCBfc3RyaW5nXzogbmFtZSBvZiB0aGUgb2JqZWN0XG4gIC8vICogYGZpbGVQYXRoYCBfc3RyaW5nXzogcGF0aCB0byB3aGljaCB0aGUgb2JqZWN0IGRhdGEgd2lsbCBiZSB3cml0dGVuIHRvXG4gIC8vICogYGdldE9wdHNgIF9vYmplY3RfOiBWZXJzaW9uIG9mIHRoZSBvYmplY3QgaW4gdGhlIGZvcm0gYHt2ZXJzaW9uSWQ6J215LXV1aWQnfWAuIERlZmF1bHQgaXMgYHt9YC4gKG9wdGlvbmFsKVxuICAvLyAqIGBjYWxsYmFjayhlcnIpYCBfZnVuY3Rpb25fOiBjYWxsYmFjayBpcyBjYWxsZWQgd2l0aCBgZXJyYCBpbiBjYXNlIG9mIGVycm9yLlxuICBmR2V0T2JqZWN0KGJ1Y2tldE5hbWUsIG9iamVjdE5hbWUsIGZpbGVQYXRoLCBnZXRPcHRzID0ge30sIGNiKSB7XG4gICAgLy8gSW5wdXQgdmFsaWRhdGlvbi5cbiAgICBpZiAoIWlzVmFsaWRCdWNrZXROYW1lKGJ1Y2tldE5hbWUpKSB7XG4gICAgICB0aHJvdyBuZXcgZXJyb3JzLkludmFsaWRCdWNrZXROYW1lRXJyb3IoJ0ludmFsaWQgYnVja2V0IG5hbWU6ICcgKyBidWNrZXROYW1lKVxuICAgIH1cbiAgICBpZiAoIWlzVmFsaWRPYmplY3ROYW1lKG9iamVjdE5hbWUpKSB7XG4gICAgICB0aHJvdyBuZXcgZXJyb3JzLkludmFsaWRPYmplY3ROYW1lRXJyb3IoYEludmFsaWQgb2JqZWN0IG5hbWU6ICR7b2JqZWN0TmFtZX1gKVxuICAgIH1cbiAgICBpZiAoIWlzU3RyaW5nKGZpbGVQYXRoKSkge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignZmlsZVBhdGggc2hvdWxkIGJlIG9mIHR5cGUgXCJzdHJpbmdcIicpXG4gICAgfVxuICAgIC8vIEJhY2t3YXJkIENvbXBhdGliaWxpdHlcbiAgICBpZiAoaXNGdW5jdGlvbihnZXRPcHRzKSkge1xuICAgICAgY2IgPSBnZXRPcHRzXG4gICAgICBnZXRPcHRzID0ge31cbiAgICB9XG5cbiAgICBpZiAoIWlzRnVuY3Rpb24oY2IpKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdjYWxsYmFjayBzaG91bGQgYmUgb2YgdHlwZSBcImZ1bmN0aW9uXCInKVxuICAgIH1cblxuICAgIC8vIEludGVybmFsIGRhdGEuXG4gICAgdmFyIHBhcnRGaWxlXG4gICAgdmFyIHBhcnRGaWxlU3RyZWFtXG4gICAgdmFyIG9ialN0YXRcblxuICAgIC8vIFJlbmFtZSB3cmFwcGVyLlxuICAgIHZhciByZW5hbWUgPSAoZXJyKSA9PiB7XG4gICAgICBpZiAoZXJyKSB7XG4gICAgICAgIHJldHVybiBjYihlcnIpXG4gICAgICB9XG4gICAgICBmcy5yZW5hbWUocGFydEZpbGUsIGZpbGVQYXRoLCBjYilcbiAgICB9XG5cbiAgICBhc3luYy53YXRlcmZhbGwoXG4gICAgICBbXG4gICAgICAgIChjYikgPT4gdGhpcy5zdGF0T2JqZWN0KGJ1Y2tldE5hbWUsIG9iamVjdE5hbWUsIGdldE9wdHMsIGNiKSxcbiAgICAgICAgKHJlc3VsdCwgY2IpID0+IHtcbiAgICAgICAgICBvYmpTdGF0ID0gcmVzdWx0XG4gICAgICAgICAgLy8gQ3JlYXRlIGFueSBtaXNzaW5nIHRvcCBsZXZlbCBkaXJlY3Rvcmllcy5cbiAgICAgICAgICBmcy5ta2RpcihwYXRoLmRpcm5hbWUoZmlsZVBhdGgpLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9LCAoZXJyKSA9PiBjYihlcnIpKVxuICAgICAgICB9LFxuICAgICAgICAoY2IpID0+IHtcbiAgICAgICAgICBwYXJ0RmlsZSA9IGAke2ZpbGVQYXRofS4ke29ialN0YXQuZXRhZ30ucGFydC5taW5pb2BcbiAgICAgICAgICBmcy5zdGF0KHBhcnRGaWxlLCAoZSwgc3RhdHMpID0+IHtcbiAgICAgICAgICAgIHZhciBvZmZzZXQgPSAwXG4gICAgICAgICAgICBpZiAoZSkge1xuICAgICAgICAgICAgICBwYXJ0RmlsZVN0cmVhbSA9IGZzLmNyZWF0ZVdyaXRlU3RyZWFtKHBhcnRGaWxlLCB7IGZsYWdzOiAndycgfSlcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIGlmIChvYmpTdGF0LnNpemUgPT09IHN0YXRzLnNpemUpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gcmVuYW1lKClcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBvZmZzZXQgPSBzdGF0cy5zaXplXG4gICAgICAgICAgICAgIHBhcnRGaWxlU3RyZWFtID0gZnMuY3JlYXRlV3JpdGVTdHJlYW0ocGFydEZpbGUsIHsgZmxhZ3M6ICdhJyB9KVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy5nZXRQYXJ0aWFsT2JqZWN0KGJ1Y2tldE5hbWUsIG9iamVjdE5hbWUsIG9mZnNldCwgMCwgZ2V0T3B0cywgY2IpXG4gICAgICAgICAgfSlcbiAgICAgICAgfSxcbiAgICAgICAgKGRvd25sb2FkU3RyZWFtLCBjYikgPT4ge1xuICAgICAgICAgIHBpcGVzZXR1cChkb3dubG9hZFN0cmVhbSwgcGFydEZpbGVTdHJlYW0pXG4gICAgICAgICAgICAub24oJ2Vycm9yJywgKGUpID0+IGNiKGUpKVxuICAgICAgICAgICAgLm9uKCdmaW5pc2gnLCBjYilcbiAgICAgICAgfSxcbiAgICAgICAgKGNiKSA9PiBmcy5zdGF0KHBhcnRGaWxlLCBjYiksXG4gICAgICAgIChzdGF0cywgY2IpID0+IHtcbiAgICAgICAgICBpZiAoc3RhdHMuc2l6ZSA9PT0gb2JqU3RhdC5zaXplKSB7XG4gICAgICAgICAgICByZXR1cm4gY2IoKVxuICAgICAgICAgIH1cbiAgICAgICAgICBjYihuZXcgRXJyb3IoJ1NpemUgbWlzbWF0Y2ggYmV0d2VlbiBkb3dubG9hZGVkIGZpbGUgYW5kIHRoZSBvYmplY3QnKSlcbiAgICAgICAgfSxcbiAgICAgIF0sXG4gICAgICByZW5hbWUsXG4gICAgKVxuICB9XG5cbiAgLy8gQ2FsbGJhY2sgaXMgY2FsbGVkIHdpdGggcmVhZGFibGUgc3RyZWFtIG9mIHRoZSBvYmplY3QgY29udGVudC5cbiAgLy9cbiAgLy8gX19Bcmd1bWVudHNfX1xuICAvLyAqIGBidWNrZXROYW1lYCBfc3RyaW5nXzogbmFtZSBvZiB0aGUgYnVja2V0XG4gIC8vICogYG9iamVjdE5hbWVgIF9zdHJpbmdfOiBuYW1lIG9mIHRoZSBvYmplY3RcbiAgLy8gKiBgZ2V0T3B0c2AgX29iamVjdF86IFZlcnNpb24gb2YgdGhlIG9iamVjdCBpbiB0aGUgZm9ybSBge3ZlcnNpb25JZDonbXktdXVpZCd9YC4gRGVmYXVsdCBpcyBge31gLiAob3B0aW9uYWwpXG4gIC8vICogYGNhbGxiYWNrKGVyciwgc3RyZWFtKWAgX2Z1bmN0aW9uXzogY2FsbGJhY2sgaXMgY2FsbGVkIHdpdGggYGVycmAgaW4gY2FzZSBvZiBlcnJvci4gYHN0cmVhbWAgaXMgdGhlIG9iamVjdCBjb250ZW50IHN0cmVhbVxuICBnZXRPYmplY3QoYnVja2V0TmFtZSwgb2JqZWN0TmFtZSwgZ2V0T3B0cyA9IHt9LCBjYikge1xuICAgIGlmICghaXNWYWxpZEJ1Y2tldE5hbWUoYnVja2V0TmFtZSkpIHtcbiAgICAgIHRocm93IG5ldyBlcnJvcnMuSW52YWxpZEJ1Y2tldE5hbWVFcnJvcignSW52YWxpZCBidWNrZXQgbmFtZTogJyArIGJ1Y2tldE5hbWUpXG4gICAgfVxuICAgIGlmICghaXNWYWxpZE9iamVjdE5hbWUob2JqZWN0TmFtZSkpIHtcbiAgICAgIHRocm93IG5ldyBlcnJvcnMuSW52YWxpZE9iamVjdE5hbWVFcnJvcihgSW52YWxpZCBvYmplY3QgbmFtZTogJHtvYmplY3ROYW1lfWApXG4gICAgfVxuICAgIC8vIEJhY2t3YXJkIENvbXBhdGliaWxpdHlcbiAgICBpZiAoaXNGdW5jdGlvbihnZXRPcHRzKSkge1xuICAgICAgY2IgPSBnZXRPcHRzXG4gICAgICBnZXRPcHRzID0ge31cbiAgICB9XG5cbiAgICBpZiAoIWlzRnVuY3Rpb24oY2IpKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdjYWxsYmFjayBzaG91bGQgYmUgb2YgdHlwZSBcImZ1bmN0aW9uXCInKVxuICAgIH1cbiAgICB0aGlzLmdldFBhcnRpYWxPYmplY3QoYnVja2V0TmFtZSwgb2JqZWN0TmFtZSwgMCwgMCwgZ2V0T3B0cywgY2IpXG4gIH1cblxuICAvLyBDYWxsYmFjayBpcyBjYWxsZWQgd2l0aCByZWFkYWJsZSBzdHJlYW0gb2YgdGhlIHBhcnRpYWwgb2JqZWN0IGNvbnRlbnQuXG4gIC8vXG4gIC8vIF9fQXJndW1lbnRzX19cbiAgLy8gKiBgYnVja2V0TmFtZWAgX3N0cmluZ186IG5hbWUgb2YgdGhlIGJ1Y2tldFxuICAvLyAqIGBvYmplY3ROYW1lYCBfc3RyaW5nXzogbmFtZSBvZiB0aGUgb2JqZWN0XG4gIC8vICogYG9mZnNldGAgX251bWJlcl86IG9mZnNldCBvZiB0aGUgb2JqZWN0IGZyb20gd2hlcmUgdGhlIHN0cmVhbSB3aWxsIHN0YXJ0XG4gIC8vICogYGxlbmd0aGAgX251bWJlcl86IGxlbmd0aCBvZiB0aGUgb2JqZWN0IHRoYXQgd2lsbCBiZSByZWFkIGluIHRoZSBzdHJlYW0gKG9wdGlvbmFsLCBpZiBub3Qgc3BlY2lmaWVkIHdlIHJlYWQgdGhlIHJlc3Qgb2YgdGhlIGZpbGUgZnJvbSB0aGUgb2Zmc2V0KVxuICAvLyAqIGBnZXRPcHRzYCBfb2JqZWN0XzogVmVyc2lvbiBvZiB0aGUgb2JqZWN0IGluIHRoZSBmb3JtIGB7dmVyc2lvbklkOidteS11dWlkJ31gLiBEZWZhdWx0IGlzIGB7fWAuIChvcHRpb25hbClcbiAgLy8gKiBgY2FsbGJhY2soZXJyLCBzdHJlYW0pYCBfZnVuY3Rpb25fOiBjYWxsYmFjayBpcyBjYWxsZWQgd2l0aCBgZXJyYCBpbiBjYXNlIG9mIGVycm9yLiBgc3RyZWFtYCBpcyB0aGUgb2JqZWN0IGNvbnRlbnQgc3RyZWFtXG4gIGdldFBhcnRpYWxPYmplY3QoYnVja2V0TmFtZSwgb2JqZWN0TmFtZSwgb2Zmc2V0LCBsZW5ndGgsIGdldE9wdHMgPSB7fSwgY2IpIHtcbiAgICBpZiAoaXNGdW5jdGlvbihsZW5ndGgpKSB7XG4gICAgICBjYiA9IGxlbmd0aFxuICAgICAgbGVuZ3RoID0gMFxuICAgIH1cbiAgICBpZiAoIWlzVmFsaWRCdWNrZXROYW1lKGJ1Y2tldE5hbWUpKSB7XG4gICAgICB0aHJvdyBuZXcgZXJyb3JzLkludmFsaWRCdWNrZXROYW1lRXJyb3IoJ0ludmFsaWQgYnVja2V0IG5hbWU6ICcgKyBidWNrZXROYW1lKVxuICAgIH1cbiAgICBpZiAoIWlzVmFsaWRPYmplY3ROYW1lKG9iamVjdE5hbWUpKSB7XG4gICAgICB0aHJvdyBuZXcgZXJyb3JzLkludmFsaWRPYmplY3ROYW1lRXJyb3IoYEludmFsaWQgb2JqZWN0IG5hbWU6ICR7b2JqZWN0TmFtZX1gKVxuICAgIH1cbiAgICBpZiAoIWlzTnVtYmVyKG9mZnNldCkpIHtcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ29mZnNldCBzaG91bGQgYmUgb2YgdHlwZSBcIm51bWJlclwiJylcbiAgICB9XG4gICAgaWYgKCFpc051bWJlcihsZW5ndGgpKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdsZW5ndGggc2hvdWxkIGJlIG9mIHR5cGUgXCJudW1iZXJcIicpXG4gICAgfVxuICAgIC8vIEJhY2t3YXJkIENvbXBhdGliaWxpdHlcbiAgICBpZiAoaXNGdW5jdGlvbihnZXRPcHRzKSkge1xuICAgICAgY2IgPSBnZXRPcHRzXG4gICAgICBnZXRPcHRzID0ge31cbiAgICB9XG5cbiAgICBpZiAoIWlzRnVuY3Rpb24oY2IpKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdjYWxsYmFjayBzaG91bGQgYmUgb2YgdHlwZSBcImZ1bmN0aW9uXCInKVxuICAgIH1cblxuICAgIHZhciByYW5nZSA9ICcnXG4gICAgaWYgKG9mZnNldCB8fCBsZW5ndGgpIHtcbiAgICAgIGlmIChvZmZzZXQpIHtcbiAgICAgICAgcmFuZ2UgPSBgYnl0ZXM9JHsrb2Zmc2V0fS1gXG4gICAgICB9IGVsc2Uge1xuICAgICAgICByYW5nZSA9ICdieXRlcz0wLSdcbiAgICAgICAgb2Zmc2V0ID0gMFxuICAgICAgfVxuICAgICAgaWYgKGxlbmd0aCkge1xuICAgICAgICByYW5nZSArPSBgJHsrbGVuZ3RoICsgb2Zmc2V0IC0gMX1gXG4gICAgICB9XG4gICAgfVxuXG4gICAgdmFyIGhlYWRlcnMgPSB7fVxuICAgIGlmIChyYW5nZSAhPT0gJycpIHtcbiAgICAgIGhlYWRlcnMucmFuZ2UgPSByYW5nZVxuICAgIH1cblxuICAgIHZhciBleHBlY3RlZFN0YXR1c0NvZGVzID0gWzIwMF1cbiAgICBpZiAocmFuZ2UpIHtcbiAgICAgIGV4cGVjdGVkU3RhdHVzQ29kZXMucHVzaCgyMDYpXG4gICAgfVxuICAgIHZhciBtZXRob2QgPSAnR0VUJ1xuXG4gICAgdmFyIHF1ZXJ5ID0gcXVlcnlzdHJpbmcuc3RyaW5naWZ5KGdldE9wdHMpXG4gICAgdGhpcy5tYWtlUmVxdWVzdCh7IG1ldGhvZCwgYnVja2V0TmFtZSwgb2JqZWN0TmFtZSwgaGVhZGVycywgcXVlcnkgfSwgJycsIGV4cGVjdGVkU3RhdHVzQ29kZXMsICcnLCB0cnVlLCBjYilcbiAgfVxuXG4gIC8vIFVwbG9hZHMgdGhlIG9iamVjdCB1c2luZyBjb250ZW50cyBmcm9tIGEgZmlsZVxuICAvL1xuICAvLyBfX0FyZ3VtZW50c19fXG4gIC8vICogYGJ1Y2tldE5hbWVgIF9zdHJpbmdfOiBuYW1lIG9mIHRoZSBidWNrZXRcbiAgLy8gKiBgb2JqZWN0TmFtZWAgX3N0cmluZ186IG5hbWUgb2YgdGhlIG9iamVjdFxuICAvLyAqIGBmaWxlUGF0aGAgX3N0cmluZ186IGZpbGUgcGF0aCBvZiB0aGUgZmlsZSB0byBiZSB1cGxvYWRlZFxuICAvLyAqIGBtZXRhRGF0YWAgX0phdmFzY3JpcHQgT2JqZWN0XzogbWV0YURhdGEgYXNzb3NjaWF0ZWQgd2l0aCB0aGUgb2JqZWN0XG4gIC8vICogYGNhbGxiYWNrKGVyciwgb2JqSW5mbylgIF9mdW5jdGlvbl86IG5vbiBudWxsIGBlcnJgIGluZGljYXRlcyBlcnJvciwgYG9iakluZm9gIF9vYmplY3RfIHdoaWNoIGNvbnRhaW5zIHZlcnNpb25JZCBhbmQgZXRhZy5cbiAgZlB1dE9iamVjdChidWNrZXROYW1lLCBvYmplY3ROYW1lLCBmaWxlUGF0aCwgbWV0YURhdGEsIGNhbGxiYWNrKSB7XG4gICAgaWYgKCFpc1ZhbGlkQnVja2V0TmFtZShidWNrZXROYW1lKSkge1xuICAgICAgdGhyb3cgbmV3IGVycm9ycy5JbnZhbGlkQnVja2V0TmFtZUVycm9yKCdJbnZhbGlkIGJ1Y2tldCBuYW1lOiAnICsgYnVja2V0TmFtZSlcbiAgICB9XG4gICAgaWYgKCFpc1ZhbGlkT2JqZWN0TmFtZShvYmplY3ROYW1lKSkge1xuICAgICAgdGhyb3cgbmV3IGVycm9ycy5JbnZhbGlkT2JqZWN0TmFtZUVycm9yKGBJbnZhbGlkIG9iamVjdCBuYW1lOiAke29iamVjdE5hbWV9YClcbiAgICB9XG5cbiAgICBpZiAoIWlzU3RyaW5nKGZpbGVQYXRoKSkge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignZmlsZVBhdGggc2hvdWxkIGJlIG9mIHR5cGUgXCJzdHJpbmdcIicpXG4gICAgfVxuICAgIGlmIChpc0Z1bmN0aW9uKG1ldGFEYXRhKSkge1xuICAgICAgY2FsbGJhY2sgPSBtZXRhRGF0YVxuICAgICAgbWV0YURhdGEgPSB7fSAvLyBTZXQgbWV0YURhdGEgZW1wdHkgaWYgbm8gbWV0YURhdGEgcHJvdmlkZWQuXG4gICAgfVxuICAgIGlmICghaXNPYmplY3QobWV0YURhdGEpKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdtZXRhRGF0YSBzaG91bGQgYmUgb2YgdHlwZSBcIm9iamVjdFwiJylcbiAgICB9XG5cbiAgICAvLyBJbnNlcnRzIGNvcnJlY3QgYGNvbnRlbnQtdHlwZWAgYXR0cmlidXRlIGJhc2VkIG9uIG1ldGFEYXRhIGFuZCBmaWxlUGF0aFxuICAgIG1ldGFEYXRhID0gaW5zZXJ0Q29udGVudFR5cGUobWV0YURhdGEsIGZpbGVQYXRoKVxuXG4gICAgLy8gVXBkYXRlcyBtZXRhRGF0YSB0byBoYXZlIHRoZSBjb3JyZWN0IHByZWZpeCBpZiBuZWVkZWRcbiAgICBtZXRhRGF0YSA9IHByZXBlbmRYQU1aTWV0YShtZXRhRGF0YSlcbiAgICB2YXIgc2l6ZVxuICAgIHZhciBwYXJ0U2l6ZVxuXG4gICAgYXN5bmMud2F0ZXJmYWxsKFxuICAgICAgW1xuICAgICAgICAoY2IpID0+IGZzLnN0YXQoZmlsZVBhdGgsIGNiKSxcbiAgICAgICAgKHN0YXRzLCBjYikgPT4ge1xuICAgICAgICAgIHNpemUgPSBzdGF0cy5zaXplXG4gICAgICAgICAgdmFyIHN0cmVhbVxuICAgICAgICAgIHZhciBjYlRyaWdnZXJlZCA9IGZhbHNlXG4gICAgICAgICAgdmFyIG9yaWdDYiA9IGNiXG4gICAgICAgICAgY2IgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICBpZiAoY2JUcmlnZ2VyZWQpIHtcbiAgICAgICAgICAgICAgcmV0dXJuXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjYlRyaWdnZXJlZCA9IHRydWVcbiAgICAgICAgICAgIGlmIChzdHJlYW0pIHtcbiAgICAgICAgICAgICAgc3RyZWFtLmRlc3Ryb3koKVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIG9yaWdDYi5hcHBseSh0aGlzLCBhcmd1bWVudHMpXG4gICAgICAgICAgfVxuICAgICAgICAgIGlmIChzaXplID4gdGhpcy5tYXhPYmplY3RTaXplKSB7XG4gICAgICAgICAgICByZXR1cm4gY2IobmV3IEVycm9yKGAke2ZpbGVQYXRofSBzaXplIDogJHtzdGF0cy5zaXplfSwgbWF4IGFsbG93ZWQgc2l6ZSA6IDVUQmApKVxuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoc2l6ZSA8PSB0aGlzLnBhcnRTaXplKSB7XG4gICAgICAgICAgICAvLyBzaW1wbGUgUFVUIHJlcXVlc3QsIG5vIG11bHRpcGFydFxuICAgICAgICAgICAgdmFyIG11bHRpcGFydCA9IGZhbHNlXG4gICAgICAgICAgICB2YXIgdXBsb2FkZXIgPSB0aGlzLmdldFVwbG9hZGVyKGJ1Y2tldE5hbWUsIG9iamVjdE5hbWUsIG1ldGFEYXRhLCBtdWx0aXBhcnQpXG4gICAgICAgICAgICB2YXIgaGFzaCA9IHRyYW5zZm9ybWVycy5nZXRIYXNoU3VtbWVyKHRoaXMuZW5hYmxlU0hBMjU2KVxuICAgICAgICAgICAgdmFyIHN0YXJ0ID0gMFxuICAgICAgICAgICAgdmFyIGVuZCA9IHNpemUgLSAxXG4gICAgICAgICAgICB2YXIgYXV0b0Nsb3NlID0gdHJ1ZVxuICAgICAgICAgICAgaWYgKHNpemUgPT09IDApIHtcbiAgICAgICAgICAgICAgZW5kID0gMFxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdmFyIG9wdGlvbnMgPSB7IHN0YXJ0LCBlbmQsIGF1dG9DbG9zZSB9XG4gICAgICAgICAgICBwaXBlc2V0dXAoZnMuY3JlYXRlUmVhZFN0cmVhbShmaWxlUGF0aCwgb3B0aW9ucyksIGhhc2gpXG4gICAgICAgICAgICAgIC5vbignZGF0YScsIChkYXRhKSA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIG1kNXN1bSA9IGRhdGEubWQ1c3VtXG4gICAgICAgICAgICAgICAgdmFyIHNoYTI1NnN1bSA9IGRhdGEuc2hhMjU2c3VtXG4gICAgICAgICAgICAgICAgc3RyZWFtID0gZnMuY3JlYXRlUmVhZFN0cmVhbShmaWxlUGF0aCwgb3B0aW9ucylcbiAgICAgICAgICAgICAgICB1cGxvYWRlcihzdHJlYW0sIHNpemUsIHNoYTI1NnN1bSwgbWQ1c3VtLCAoZXJyLCBvYmpJbmZvKSA9PiB7XG4gICAgICAgICAgICAgICAgICBjYWxsYmFjayhlcnIsIG9iakluZm8pXG4gICAgICAgICAgICAgICAgICBjYih0cnVlKVxuICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgIC5vbignZXJyb3InLCAoZSkgPT4gY2IoZSkpXG4gICAgICAgICAgICByZXR1cm5cbiAgICAgICAgICB9XG4gICAgICAgICAgdGhpcy5maW5kVXBsb2FkSWQoYnVja2V0TmFtZSwgb2JqZWN0TmFtZSwgY2IpXG4gICAgICAgIH0sXG4gICAgICAgICh1cGxvYWRJZCwgY2IpID0+IHtcbiAgICAgICAgICAvLyBpZiB0aGVyZSB3YXMgYSBwcmV2aW91cyBpbmNvbXBsZXRlIHVwbG9hZCwgZmV0Y2ggYWxsIGl0cyB1cGxvYWRlZCBwYXJ0cyBpbmZvXG4gICAgICAgICAgaWYgKHVwbG9hZElkKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5saXN0UGFydHMoYnVja2V0TmFtZSwgb2JqZWN0TmFtZSwgdXBsb2FkSWQsIChlLCBldGFncykgPT4gY2IoZSwgdXBsb2FkSWQsIGV0YWdzKSlcbiAgICAgICAgICB9XG4gICAgICAgICAgLy8gdGhlcmUgd2FzIG5vIHByZXZpb3VzIHVwbG9hZCwgaW5pdGlhdGUgYSBuZXcgb25lXG4gICAgICAgICAgdGhpcy5pbml0aWF0ZU5ld011bHRpcGFydFVwbG9hZChidWNrZXROYW1lLCBvYmplY3ROYW1lLCBtZXRhRGF0YSwgKGUsIHVwbG9hZElkKSA9PiBjYihlLCB1cGxvYWRJZCwgW10pKVxuICAgICAgICB9LFxuICAgICAgICAodXBsb2FkSWQsIGV0YWdzLCBjYikgPT4ge1xuICAgICAgICAgIHBhcnRTaXplID0gdGhpcy5jYWxjdWxhdGVQYXJ0U2l6ZShzaXplKVxuICAgICAgICAgIHZhciBtdWx0aXBhcnQgPSB0cnVlXG4gICAgICAgICAgdmFyIHVwbG9hZGVyID0gdGhpcy5nZXRVcGxvYWRlcihidWNrZXROYW1lLCBvYmplY3ROYW1lLCBtZXRhRGF0YSwgbXVsdGlwYXJ0KVxuXG4gICAgICAgICAgLy8gY29udmVydCBhcnJheSB0byBvYmplY3QgdG8gbWFrZSB0aGluZ3MgZWFzeVxuICAgICAgICAgIHZhciBwYXJ0cyA9IGV0YWdzLnJlZHVjZShmdW5jdGlvbiAoYWNjLCBpdGVtKSB7XG4gICAgICAgICAgICBpZiAoIWFjY1tpdGVtLnBhcnRdKSB7XG4gICAgICAgICAgICAgIGFjY1tpdGVtLnBhcnRdID0gaXRlbVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIGFjY1xuICAgICAgICAgIH0sIHt9KVxuICAgICAgICAgIHZhciBwYXJ0c0RvbmUgPSBbXVxuICAgICAgICAgIHZhciBwYXJ0TnVtYmVyID0gMVxuICAgICAgICAgIHZhciB1cGxvYWRlZFNpemUgPSAwXG4gICAgICAgICAgYXN5bmMud2hpbHN0KFxuICAgICAgICAgICAgKGNiKSA9PiB7XG4gICAgICAgICAgICAgIGNiKG51bGwsIHVwbG9hZGVkU2l6ZSA8IHNpemUpXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgKGNiKSA9PiB7XG4gICAgICAgICAgICAgIHZhciBzdHJlYW1cbiAgICAgICAgICAgICAgdmFyIGNiVHJpZ2dlcmVkID0gZmFsc2VcbiAgICAgICAgICAgICAgdmFyIG9yaWdDYiA9IGNiXG4gICAgICAgICAgICAgIGNiID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgIGlmIChjYlRyaWdnZXJlZCkge1xuICAgICAgICAgICAgICAgICAgcmV0dXJuXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNiVHJpZ2dlcmVkID0gdHJ1ZVxuICAgICAgICAgICAgICAgIGlmIChzdHJlYW0pIHtcbiAgICAgICAgICAgICAgICAgIHN0cmVhbS5kZXN0cm95KClcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcmV0dXJuIG9yaWdDYi5hcHBseSh0aGlzLCBhcmd1bWVudHMpXG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgdmFyIHBhcnQgPSBwYXJ0c1twYXJ0TnVtYmVyXVxuICAgICAgICAgICAgICB2YXIgaGFzaCA9IHRyYW5zZm9ybWVycy5nZXRIYXNoU3VtbWVyKHRoaXMuZW5hYmxlU0hBMjU2KVxuICAgICAgICAgICAgICB2YXIgbGVuZ3RoID0gcGFydFNpemVcbiAgICAgICAgICAgICAgaWYgKGxlbmd0aCA+IHNpemUgLSB1cGxvYWRlZFNpemUpIHtcbiAgICAgICAgICAgICAgICBsZW5ndGggPSBzaXplIC0gdXBsb2FkZWRTaXplXG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgdmFyIHN0YXJ0ID0gdXBsb2FkZWRTaXplXG4gICAgICAgICAgICAgIHZhciBlbmQgPSB1cGxvYWRlZFNpemUgKyBsZW5ndGggLSAxXG4gICAgICAgICAgICAgIHZhciBhdXRvQ2xvc2UgPSB0cnVlXG4gICAgICAgICAgICAgIHZhciBvcHRpb25zID0geyBhdXRvQ2xvc2UsIHN0YXJ0LCBlbmQgfVxuICAgICAgICAgICAgICAvLyB2ZXJpZnkgbWQ1c3VtIG9mIGVhY2ggcGFydFxuICAgICAgICAgICAgICBwaXBlc2V0dXAoZnMuY3JlYXRlUmVhZFN0cmVhbShmaWxlUGF0aCwgb3B0aW9ucyksIGhhc2gpXG4gICAgICAgICAgICAgICAgLm9uKCdkYXRhJywgKGRhdGEpID0+IHtcbiAgICAgICAgICAgICAgICAgIHZhciBtZDVzdW1IZXggPSBCdWZmZXIuZnJvbShkYXRhLm1kNXN1bSwgJ2Jhc2U2NCcpLnRvU3RyaW5nKCdoZXgnKVxuICAgICAgICAgICAgICAgICAgaWYgKHBhcnQgJiYgbWQ1c3VtSGV4ID09PSBwYXJ0LmV0YWcpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gbWQ1IG1hdGNoZXMsIGNodW5rIGFscmVhZHkgdXBsb2FkZWRcbiAgICAgICAgICAgICAgICAgICAgcGFydHNEb25lLnB1c2goeyBwYXJ0OiBwYXJ0TnVtYmVyLCBldGFnOiBwYXJ0LmV0YWcgfSlcbiAgICAgICAgICAgICAgICAgICAgcGFydE51bWJlcisrXG4gICAgICAgICAgICAgICAgICAgIHVwbG9hZGVkU2l6ZSArPSBsZW5ndGhcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGNiKClcbiAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgIC8vIHBhcnQgaXMgbm90IHVwbG9hZGVkIHlldCwgb3IgbWQ1IG1pc21hdGNoXG4gICAgICAgICAgICAgICAgICBzdHJlYW0gPSBmcy5jcmVhdGVSZWFkU3RyZWFtKGZpbGVQYXRoLCBvcHRpb25zKVxuICAgICAgICAgICAgICAgICAgdXBsb2FkZXIodXBsb2FkSWQsIHBhcnROdW1iZXIsIHN0cmVhbSwgbGVuZ3RoLCBkYXRhLnNoYTI1NnN1bSwgZGF0YS5tZDVzdW0sIChlLCBvYmpJbmZvKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGNiKGUpXG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgcGFydHNEb25lLnB1c2goeyBwYXJ0OiBwYXJ0TnVtYmVyLCBldGFnOiBvYmpJbmZvLmV0YWcgfSlcbiAgICAgICAgICAgICAgICAgICAgcGFydE51bWJlcisrXG4gICAgICAgICAgICAgICAgICAgIHVwbG9hZGVkU2l6ZSArPSBsZW5ndGhcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGNiKClcbiAgICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgICAub24oJ2Vycm9yJywgKGUpID0+IGNiKGUpKVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIChlKSA9PiB7XG4gICAgICAgICAgICAgIGlmIChlKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGNiKGUpXG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgY2IobnVsbCwgcGFydHNEb25lLCB1cGxvYWRJZClcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgKVxuICAgICAgICB9LFxuICAgICAgICAvLyBhbGwgcGFydHMgdXBsb2FkZWQsIGNvbXBsZXRlIHRoZSBtdWx0aXBhcnQgdXBsb2FkXG4gICAgICAgIChldGFncywgdXBsb2FkSWQsIGNiKSA9PiB0aGlzLmNvbXBsZXRlTXVsdGlwYXJ0VXBsb2FkKGJ1Y2tldE5hbWUsIG9iamVjdE5hbWUsIHVwbG9hZElkLCBldGFncywgY2IpLFxuICAgICAgXSxcbiAgICAgIChlcnIsIC4uLnJlc3QpID0+IHtcbiAgICAgICAgaWYgKGVyciA9PT0gdHJ1ZSkge1xuICAgICAgICAgIHJldHVyblxuICAgICAgICB9XG4gICAgICAgIGNhbGxiYWNrKGVyciwgLi4ucmVzdClcbiAgICAgIH0sXG4gICAgKVxuICB9XG5cbiAgLy8gVXBsb2FkcyB0aGUgb2JqZWN0LlxuICAvL1xuICAvLyBVcGxvYWRpbmcgYSBzdHJlYW1cbiAgLy8gX19Bcmd1bWVudHNfX1xuICAvLyAqIGBidWNrZXROYW1lYCBfc3RyaW5nXzogbmFtZSBvZiB0aGUgYnVja2V0XG4gIC8vICogYG9iamVjdE5hbWVgIF9zdHJpbmdfOiBuYW1lIG9mIHRoZSBvYmplY3RcbiAgLy8gKiBgc3RyZWFtYCBfU3RyZWFtXzogUmVhZGFibGUgc3RyZWFtXG4gIC8vICogYHNpemVgIF9udW1iZXJfOiBzaXplIG9mIHRoZSBvYmplY3QgKG9wdGlvbmFsKVxuICAvLyAqIGBjYWxsYmFjayhlcnIsIGV0YWcpYCBfZnVuY3Rpb25fOiBub24gbnVsbCBgZXJyYCBpbmRpY2F0ZXMgZXJyb3IsIGBldGFnYCBfc3RyaW5nXyBpcyB0aGUgZXRhZyBvZiB0aGUgb2JqZWN0IHVwbG9hZGVkLlxuICAvL1xuICAvLyBVcGxvYWRpbmcgXCJCdWZmZXJcIiBvciBcInN0cmluZ1wiXG4gIC8vIF9fQXJndW1lbnRzX19cbiAgLy8gKiBgYnVja2V0TmFtZWAgX3N0cmluZ186IG5hbWUgb2YgdGhlIGJ1Y2tldFxuICAvLyAqIGBvYmplY3ROYW1lYCBfc3RyaW5nXzogbmFtZSBvZiB0aGUgb2JqZWN0XG4gIC8vICogYHN0cmluZyBvciBCdWZmZXJgIF9zdHJpbmdfIG9yIF9CdWZmZXJfOiBzdHJpbmcgb3IgYnVmZmVyXG4gIC8vICogYGNhbGxiYWNrKGVyciwgb2JqSW5mbylgIF9mdW5jdGlvbl86IGBlcnJgIGlzIGBudWxsYCBpbiBjYXNlIG9mIHN1Y2Nlc3MgYW5kIGBpbmZvYCB3aWxsIGhhdmUgdGhlIGZvbGxvd2luZyBvYmplY3QgZGV0YWlsczpcbiAgLy8gICAqIGBldGFnYCBfc3RyaW5nXzogZXRhZyBvZiB0aGUgb2JqZWN0XG4gIC8vICAgKiBgdmVyc2lvbklkYCBfc3RyaW5nXzogdmVyc2lvbklkIG9mIHRoZSBvYmplY3RcbiAgcHV0T2JqZWN0KGJ1Y2tldE5hbWUsIG9iamVjdE5hbWUsIHN0cmVhbSwgc2l6ZSwgbWV0YURhdGEsIGNhbGxiYWNrKSB7XG4gICAgaWYgKCFpc1ZhbGlkQnVja2V0TmFtZShidWNrZXROYW1lKSkge1xuICAgICAgdGhyb3cgbmV3IGVycm9ycy5JbnZhbGlkQnVja2V0TmFtZUVycm9yKCdJbnZhbGlkIGJ1Y2tldCBuYW1lOiAnICsgYnVja2V0TmFtZSlcbiAgICB9XG4gICAgaWYgKCFpc1ZhbGlkT2JqZWN0TmFtZShvYmplY3ROYW1lKSkge1xuICAgICAgdGhyb3cgbmV3IGVycm9ycy5JbnZhbGlkT2JqZWN0TmFtZUVycm9yKGBJbnZhbGlkIG9iamVjdCBuYW1lOiAke29iamVjdE5hbWV9YClcbiAgICB9XG5cbiAgICAvLyBXZSdsbCBuZWVkIHRvIHNoaWZ0IGFyZ3VtZW50cyB0byB0aGUgbGVmdCBiZWNhdXNlIG9mIHNpemUgYW5kIG1ldGFEYXRhLlxuICAgIGlmIChpc0Z1bmN0aW9uKHNpemUpKSB7XG4gICAgICBjYWxsYmFjayA9IHNpemVcbiAgICAgIG1ldGFEYXRhID0ge31cbiAgICB9IGVsc2UgaWYgKGlzRnVuY3Rpb24obWV0YURhdGEpKSB7XG4gICAgICBjYWxsYmFjayA9IG1ldGFEYXRhXG4gICAgICBtZXRhRGF0YSA9IHt9XG4gICAgfVxuXG4gICAgLy8gV2UnbGwgbmVlZCB0byBzaGlmdCBhcmd1bWVudHMgdG8gdGhlIGxlZnQgYmVjYXVzZSBvZiBtZXRhRGF0YVxuICAgIC8vIGFuZCBzaXplIGJlaW5nIG9wdGlvbmFsLlxuICAgIGlmIChpc09iamVjdChzaXplKSkge1xuICAgICAgbWV0YURhdGEgPSBzaXplXG4gICAgfVxuXG4gICAgLy8gRW5zdXJlcyBNZXRhZGF0YSBoYXMgYXBwcm9wcmlhdGUgcHJlZml4IGZvciBBMyBBUElcbiAgICBtZXRhRGF0YSA9IHByZXBlbmRYQU1aTWV0YShtZXRhRGF0YSlcbiAgICBpZiAodHlwZW9mIHN0cmVhbSA9PT0gJ3N0cmluZycgfHwgc3RyZWFtIGluc3RhbmNlb2YgQnVmZmVyKSB7XG4gICAgICAvLyBBZGFwdHMgdGhlIG5vbi1zdHJlYW0gaW50ZXJmYWNlIGludG8gYSBzdHJlYW0uXG4gICAgICBzaXplID0gc3RyZWFtLmxlbmd0aFxuICAgICAgc3RyZWFtID0gcmVhZGFibGVTdHJlYW0oc3RyZWFtKVxuICAgIH0gZWxzZSBpZiAoIWlzUmVhZGFibGVTdHJlYW0oc3RyZWFtKSkge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcigndGhpcmQgYXJndW1lbnQgc2hvdWxkIGJlIG9mIHR5cGUgXCJzdHJlYW0uUmVhZGFibGVcIiBvciBcIkJ1ZmZlclwiIG9yIFwic3RyaW5nXCInKVxuICAgIH1cblxuICAgIGlmICghaXNGdW5jdGlvbihjYWxsYmFjaykpIHtcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ2NhbGxiYWNrIHNob3VsZCBiZSBvZiB0eXBlIFwiZnVuY3Rpb25cIicpXG4gICAgfVxuXG4gICAgaWYgKGlzTnVtYmVyKHNpemUpICYmIHNpemUgPCAwKSB7XG4gICAgICB0aHJvdyBuZXcgZXJyb3JzLkludmFsaWRBcmd1bWVudEVycm9yKGBzaXplIGNhbm5vdCBiZSBuZWdhdGl2ZSwgZ2l2ZW4gc2l6ZTogJHtzaXplfWApXG4gICAgfVxuXG4gICAgLy8gR2V0IHRoZSBwYXJ0IHNpemUgYW5kIGZvcndhcmQgdGhhdCB0byB0aGUgQmxvY2tTdHJlYW0uIERlZmF1bHQgdG8gdGhlXG4gICAgLy8gbGFyZ2VzdCBibG9jayBzaXplIHBvc3NpYmxlIGlmIG5lY2Vzc2FyeS5cbiAgICBpZiAoIWlzTnVtYmVyKHNpemUpKSB7XG4gICAgICBzaXplID0gdGhpcy5tYXhPYmplY3RTaXplXG4gICAgfVxuXG4gICAgc2l6ZSA9IHRoaXMuY2FsY3VsYXRlUGFydFNpemUoc2l6ZSlcblxuICAgIC8vIHMzIHJlcXVpcmVzIHRoYXQgYWxsIG5vbi1lbmQgY2h1bmtzIGJlIGF0IGxlYXN0IGB0aGlzLnBhcnRTaXplYCxcbiAgICAvLyBzbyB3ZSBjaHVuayB0aGUgc3RyZWFtIHVudGlsIHdlIGhpdCBlaXRoZXIgdGhhdCBzaXplIG9yIHRoZSBlbmQgYmVmb3JlXG4gICAgLy8gd2UgZmx1c2ggaXQgdG8gczMuXG4gICAgbGV0IGNodW5rZXIgPSBuZXcgQmxvY2tTdHJlYW0yKHsgc2l6ZSwgemVyb1BhZGRpbmc6IGZhbHNlIH0pXG5cbiAgICAvLyBUaGlzIGlzIGEgV3JpdGFibGUgc3RyZWFtIHRoYXQgY2FuIGJlIHdyaXR0ZW4gdG8gaW4gb3JkZXIgdG8gdXBsb2FkXG4gICAgLy8gdG8gdGhlIHNwZWNpZmllZCBidWNrZXQgYW5kIG9iamVjdCBhdXRvbWF0aWNhbGx5LlxuICAgIGxldCB1cGxvYWRlciA9IG5ldyBPYmplY3RVcGxvYWRlcih0aGlzLCBidWNrZXROYW1lLCBvYmplY3ROYW1lLCBzaXplLCBtZXRhRGF0YSwgY2FsbGJhY2spXG4gICAgLy8gc3RyZWFtID0+IGNodW5rZXIgPT4gdXBsb2FkZXJcbiAgICBwaXBlc2V0dXAoc3RyZWFtLCBjaHVua2VyLCB1cGxvYWRlcilcbiAgfVxuXG4gIC8vIENvcHkgdGhlIG9iamVjdC5cbiAgLy9cbiAgLy8gX19Bcmd1bWVudHNfX1xuICAvLyAqIGBidWNrZXROYW1lYCBfc3RyaW5nXzogbmFtZSBvZiB0aGUgYnVja2V0XG4gIC8vICogYG9iamVjdE5hbWVgIF9zdHJpbmdfOiBuYW1lIG9mIHRoZSBvYmplY3RcbiAgLy8gKiBgc3JjT2JqZWN0YCBfc3RyaW5nXzogcGF0aCBvZiB0aGUgc291cmNlIG9iamVjdCB0byBiZSBjb3BpZWRcbiAgLy8gKiBgY29uZGl0aW9uc2AgX0NvcHlDb25kaXRpb25zXzogY29weSBjb25kaXRpb25zIHRoYXQgbmVlZHMgdG8gYmUgc2F0aXNmaWVkIChvcHRpb25hbCwgZGVmYXVsdCBgbnVsbGApXG4gIC8vICogYGNhbGxiYWNrKGVyciwge2V0YWcsIGxhc3RNb2RpZmllZH0pYCBfZnVuY3Rpb25fOiBub24gbnVsbCBgZXJyYCBpbmRpY2F0ZXMgZXJyb3IsIGBldGFnYCBfc3RyaW5nXyBhbmQgYGxpc3RNb2RpZmVkYCBfRGF0ZV8gYXJlIHJlc3BlY3RpdmVseSB0aGUgZXRhZyBhbmQgdGhlIGxhc3QgbW9kaWZpZWQgZGF0ZSBvZiB0aGUgbmV3bHkgY29waWVkIG9iamVjdFxuICBjb3B5T2JqZWN0VjEoYXJnMSwgYXJnMiwgYXJnMywgYXJnNCwgYXJnNSkge1xuICAgIHZhciBidWNrZXROYW1lID0gYXJnMVxuICAgIHZhciBvYmplY3ROYW1lID0gYXJnMlxuICAgIHZhciBzcmNPYmplY3QgPSBhcmczXG4gICAgdmFyIGNvbmRpdGlvbnMsIGNiXG4gICAgaWYgKHR5cGVvZiBhcmc0ID09ICdmdW5jdGlvbicgJiYgYXJnNSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBjb25kaXRpb25zID0gbnVsbFxuICAgICAgY2IgPSBhcmc0XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbmRpdGlvbnMgPSBhcmc0XG4gICAgICBjYiA9IGFyZzVcbiAgICB9XG4gICAgaWYgKCFpc1ZhbGlkQnVja2V0TmFtZShidWNrZXROYW1lKSkge1xuICAgICAgdGhyb3cgbmV3IGVycm9ycy5JbnZhbGlkQnVja2V0TmFtZUVycm9yKCdJbnZhbGlkIGJ1Y2tldCBuYW1lOiAnICsgYnVja2V0TmFtZSlcbiAgICB9XG4gICAgaWYgKCFpc1ZhbGlkT2JqZWN0TmFtZShvYmplY3ROYW1lKSkge1xuICAgICAgdGhyb3cgbmV3IGVycm9ycy5JbnZhbGlkT2JqZWN0TmFtZUVycm9yKGBJbnZhbGlkIG9iamVjdCBuYW1lOiAke29iamVjdE5hbWV9YClcbiAgICB9XG4gICAgaWYgKCFpc1N0cmluZyhzcmNPYmplY3QpKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdzcmNPYmplY3Qgc2hvdWxkIGJlIG9mIHR5cGUgXCJzdHJpbmdcIicpXG4gICAgfVxuICAgIGlmIChzcmNPYmplY3QgPT09ICcnKSB7XG4gICAgICB0aHJvdyBuZXcgZXJyb3JzLkludmFsaWRQcmVmaXhFcnJvcihgRW1wdHkgc291cmNlIHByZWZpeGApXG4gICAgfVxuXG4gICAgaWYgKGNvbmRpdGlvbnMgIT09IG51bGwgJiYgIShjb25kaXRpb25zIGluc3RhbmNlb2YgQ29weUNvbmRpdGlvbnMpKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdjb25kaXRpb25zIHNob3VsZCBiZSBvZiB0eXBlIFwiQ29weUNvbmRpdGlvbnNcIicpXG4gICAgfVxuXG4gICAgdmFyIGhlYWRlcnMgPSB7fVxuICAgIGhlYWRlcnNbJ3gtYW16LWNvcHktc291cmNlJ10gPSB1cmlSZXNvdXJjZUVzY2FwZShzcmNPYmplY3QpXG5cbiAgICBpZiAoY29uZGl0aW9ucyAhPT0gbnVsbCkge1xuICAgICAgaWYgKGNvbmRpdGlvbnMubW9kaWZpZWQgIT09ICcnKSB7XG4gICAgICAgIGhlYWRlcnNbJ3gtYW16LWNvcHktc291cmNlLWlmLW1vZGlmaWVkLXNpbmNlJ10gPSBjb25kaXRpb25zLm1vZGlmaWVkXG4gICAgICB9XG4gICAgICBpZiAoY29uZGl0aW9ucy51bm1vZGlmaWVkICE9PSAnJykge1xuICAgICAgICBoZWFkZXJzWyd4LWFtei1jb3B5LXNvdXJjZS1pZi11bm1vZGlmaWVkLXNpbmNlJ10gPSBjb25kaXRpb25zLnVubW9kaWZpZWRcbiAgICAgIH1cbiAgICAgIGlmIChjb25kaXRpb25zLm1hdGNoRVRhZyAhPT0gJycpIHtcbiAgICAgICAgaGVhZGVyc1sneC1hbXotY29weS1zb3VyY2UtaWYtbWF0Y2gnXSA9IGNvbmRpdGlvbnMubWF0Y2hFVGFnXG4gICAgICB9XG4gICAgICBpZiAoY29uZGl0aW9ucy5tYXRjaEV0YWdFeGNlcHQgIT09ICcnKSB7XG4gICAgICAgIGhlYWRlcnNbJ3gtYW16LWNvcHktc291cmNlLWlmLW5vbmUtbWF0Y2gnXSA9IGNvbmRpdGlvbnMubWF0Y2hFVGFnRXhjZXB0XG4gICAgICB9XG4gICAgfVxuXG4gICAgdmFyIG1ldGhvZCA9ICdQVVQnXG4gICAgdGhpcy5tYWtlUmVxdWVzdCh7IG1ldGhvZCwgYnVja2V0TmFtZSwgb2JqZWN0TmFtZSwgaGVhZGVycyB9LCAnJywgWzIwMF0sICcnLCB0cnVlLCAoZSwgcmVzcG9uc2UpID0+IHtcbiAgICAgIGlmIChlKSB7XG4gICAgICAgIHJldHVybiBjYihlKVxuICAgICAgfVxuICAgICAgdmFyIHRyYW5zZm9ybWVyID0gdHJhbnNmb3JtZXJzLmdldENvcHlPYmplY3RUcmFuc2Zvcm1lcigpXG4gICAgICBwaXBlc2V0dXAocmVzcG9uc2UsIHRyYW5zZm9ybWVyKVxuICAgICAgICAub24oJ2Vycm9yJywgKGUpID0+IGNiKGUpKVxuICAgICAgICAub24oJ2RhdGEnLCAoZGF0YSkgPT4gY2IobnVsbCwgZGF0YSkpXG4gICAgfSlcbiAgfVxuXG4gIC8qKlxuICAgKiBJbnRlcm5hbCBNZXRob2QgdG8gcGVyZm9ybSBjb3B5IG9mIGFuIG9iamVjdC5cbiAgICogQHBhcmFtIHNvdXJjZUNvbmZpZyBfX29iamVjdF9fICAgaW5zdGFuY2Ugb2YgQ29weVNvdXJjZU9wdGlvbnMgQGxpbmsgLi9oZWxwZXJzL0NvcHlTb3VyY2VPcHRpb25zXG4gICAqIEBwYXJhbSBkZXN0Q29uZmlnICBfX29iamVjdF9fICAgaW5zdGFuY2Ugb2YgQ29weURlc3RpbmF0aW9uT3B0aW9ucyBAbGluayAuL2hlbHBlcnMvQ29weURlc3RpbmF0aW9uT3B0aW9uc1xuICAgKiBAcGFyYW0gY2IgX19mdW5jdGlvbl9fIGNhbGxlZCB3aXRoIG51bGwgaWYgdGhlcmUgaXMgYW4gZXJyb3JcbiAgICogQHJldHVybnMgUHJvbWlzZSBpZiBubyBjYWxsYWNrIGlzIHBhc3NlZC5cbiAgICovXG4gIGNvcHlPYmplY3RWMihzb3VyY2VDb25maWcsIGRlc3RDb25maWcsIGNiKSB7XG4gICAgaWYgKCEoc291cmNlQ29uZmlnIGluc3RhbmNlb2YgQ29weVNvdXJjZU9wdGlvbnMpKSB7XG4gICAgICB0aHJvdyBuZXcgZXJyb3JzLkludmFsaWRBcmd1bWVudEVycm9yKCdzb3VyY2VDb25maWcgc2hvdWxkIG9mIHR5cGUgQ29weVNvdXJjZU9wdGlvbnMgJylcbiAgICB9XG4gICAgaWYgKCEoZGVzdENvbmZpZyBpbnN0YW5jZW9mIENvcHlEZXN0aW5hdGlvbk9wdGlvbnMpKSB7XG4gICAgICB0aHJvdyBuZXcgZXJyb3JzLkludmFsaWRBcmd1bWVudEVycm9yKCdkZXN0Q29uZmlnIHNob3VsZCBvZiB0eXBlIENvcHlEZXN0aW5hdGlvbk9wdGlvbnMgJylcbiAgICB9XG4gICAgaWYgKCFkZXN0Q29uZmlnLnZhbGlkYXRlKCkpIHtcbiAgICAgIHJldHVybiBmYWxzZVxuICAgIH1cbiAgICBpZiAoIWRlc3RDb25maWcudmFsaWRhdGUoKSkge1xuICAgICAgcmV0dXJuIGZhbHNlXG4gICAgfVxuICAgIGlmICghaXNGdW5jdGlvbihjYikpIHtcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ2NhbGxiYWNrIHNob3VsZCBiZSBvZiB0eXBlIFwiZnVuY3Rpb25cIicpXG4gICAgfVxuXG4gICAgY29uc3QgaGVhZGVycyA9IE9iamVjdC5hc3NpZ24oe30sIHNvdXJjZUNvbmZpZy5nZXRIZWFkZXJzKCksIGRlc3RDb25maWcuZ2V0SGVhZGVycygpKVxuXG4gICAgY29uc3QgYnVja2V0TmFtZSA9IGRlc3RDb25maWcuQnVja2V0XG4gICAgY29uc3Qgb2JqZWN0TmFtZSA9IGRlc3RDb25maWcuT2JqZWN0XG5cbiAgICBjb25zdCBtZXRob2QgPSAnUFVUJ1xuICAgIHRoaXMubWFrZVJlcXVlc3QoeyBtZXRob2QsIGJ1Y2tldE5hbWUsIG9iamVjdE5hbWUsIGhlYWRlcnMgfSwgJycsIFsyMDBdLCAnJywgdHJ1ZSwgKGUsIHJlc3BvbnNlKSA9PiB7XG4gICAgICBpZiAoZSkge1xuICAgICAgICByZXR1cm4gY2IoZSlcbiAgICAgIH1cbiAgICAgIGNvbnN0IHRyYW5zZm9ybWVyID0gdHJhbnNmb3JtZXJzLmdldENvcHlPYmplY3RUcmFuc2Zvcm1lcigpXG4gICAgICBwaXBlc2V0dXAocmVzcG9uc2UsIHRyYW5zZm9ybWVyKVxuICAgICAgICAub24oJ2Vycm9yJywgKGUpID0+IGNiKGUpKVxuICAgICAgICAub24oJ2RhdGEnLCAoZGF0YSkgPT4ge1xuICAgICAgICAgIGNvbnN0IHJlc0hlYWRlcnMgPSByZXNwb25zZS5oZWFkZXJzXG5cbiAgICAgICAgICBjb25zdCBjb3B5T2JqUmVzcG9uc2UgPSB7XG4gICAgICAgICAgICBCdWNrZXQ6IGRlc3RDb25maWcuQnVja2V0LFxuICAgICAgICAgICAgS2V5OiBkZXN0Q29uZmlnLk9iamVjdCxcbiAgICAgICAgICAgIExhc3RNb2RpZmllZDogZGF0YS5MYXN0TW9kaWZpZWQsXG4gICAgICAgICAgICBNZXRhRGF0YTogZXh0cmFjdE1ldGFkYXRhKHJlc0hlYWRlcnMpLFxuICAgICAgICAgICAgVmVyc2lvbklkOiBnZXRWZXJzaW9uSWQocmVzSGVhZGVycyksXG4gICAgICAgICAgICBTb3VyY2VWZXJzaW9uSWQ6IGdldFNvdXJjZVZlcnNpb25JZChyZXNIZWFkZXJzKSxcbiAgICAgICAgICAgIEV0YWc6IHNhbml0aXplRVRhZyhyZXNIZWFkZXJzLmV0YWcpLFxuICAgICAgICAgICAgU2l6ZTogK3Jlc0hlYWRlcnNbJ2NvbnRlbnQtbGVuZ3RoJ10sXG4gICAgICAgICAgfVxuXG4gICAgICAgICAgcmV0dXJuIGNiKG51bGwsIGNvcHlPYmpSZXNwb25zZSlcbiAgICAgICAgfSlcbiAgICB9KVxuICB9XG5cbiAgLy8gQmFja3dhcmQgY29tcGF0aWJpbGl0eSBmb3IgQ29weSBPYmplY3QgQVBJLlxuICBjb3B5T2JqZWN0KC4uLmFsbEFyZ3MpIHtcbiAgICBpZiAoYWxsQXJnc1swXSBpbnN0YW5jZW9mIENvcHlTb3VyY2VPcHRpb25zICYmIGFsbEFyZ3NbMV0gaW5zdGFuY2VvZiBDb3B5RGVzdGluYXRpb25PcHRpb25zKSB7XG4gICAgICByZXR1cm4gdGhpcy5jb3B5T2JqZWN0VjIoLi4uYXJndW1lbnRzKVxuICAgIH1cbiAgICByZXR1cm4gdGhpcy5jb3B5T2JqZWN0VjEoLi4uYXJndW1lbnRzKVxuICB9XG5cbiAgLy8gbGlzdCBhIGJhdGNoIG9mIG9iamVjdHNcbiAgbGlzdE9iamVjdHNRdWVyeShidWNrZXROYW1lLCBwcmVmaXgsIG1hcmtlciwgbGlzdFF1ZXJ5T3B0cyA9IHt9KSB7XG4gICAgaWYgKCFpc1ZhbGlkQnVja2V0TmFtZShidWNrZXROYW1lKSkge1xuICAgICAgdGhyb3cgbmV3IGVycm9ycy5JbnZhbGlkQnVja2V0TmFtZUVycm9yKCdJbnZhbGlkIGJ1Y2tldCBuYW1lOiAnICsgYnVja2V0TmFtZSlcbiAgICB9XG4gICAgaWYgKCFpc1N0cmluZyhwcmVmaXgpKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdwcmVmaXggc2hvdWxkIGJlIG9mIHR5cGUgXCJzdHJpbmdcIicpXG4gICAgfVxuICAgIGlmICghaXNTdHJpbmcobWFya2VyKSkge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignbWFya2VyIHNob3VsZCBiZSBvZiB0eXBlIFwic3RyaW5nXCInKVxuICAgIH1cbiAgICBsZXQgeyBEZWxpbWl0ZXIsIE1heEtleXMsIEluY2x1ZGVWZXJzaW9uIH0gPSBsaXN0UXVlcnlPcHRzXG5cbiAgICBpZiAoIWlzT2JqZWN0KGxpc3RRdWVyeU9wdHMpKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdsaXN0UXVlcnlPcHRzIHNob3VsZCBiZSBvZiB0eXBlIFwib2JqZWN0XCInKVxuICAgIH1cblxuICAgIGlmICghaXNTdHJpbmcoRGVsaW1pdGVyKSkge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignRGVsaW1pdGVyIHNob3VsZCBiZSBvZiB0eXBlIFwic3RyaW5nXCInKVxuICAgIH1cbiAgICBpZiAoIWlzTnVtYmVyKE1heEtleXMpKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdNYXhLZXlzIHNob3VsZCBiZSBvZiB0eXBlIFwibnVtYmVyXCInKVxuICAgIH1cblxuICAgIGNvbnN0IHF1ZXJpZXMgPSBbXVxuICAgIC8vIGVzY2FwZSBldmVyeSB2YWx1ZSBpbiBxdWVyeSBzdHJpbmcsIGV4Y2VwdCBtYXhLZXlzXG4gICAgcXVlcmllcy5wdXNoKGBwcmVmaXg9JHt1cmlFc2NhcGUocHJlZml4KX1gKVxuICAgIHF1ZXJpZXMucHVzaChgZGVsaW1pdGVyPSR7dXJpRXNjYXBlKERlbGltaXRlcil9YClcbiAgICBxdWVyaWVzLnB1c2goYGVuY29kaW5nLXR5cGU9dXJsYClcblxuICAgIGlmIChJbmNsdWRlVmVyc2lvbikge1xuICAgICAgcXVlcmllcy5wdXNoKGB2ZXJzaW9uc2ApXG4gICAgfVxuXG4gICAgaWYgKG1hcmtlcikge1xuICAgICAgbWFya2VyID0gdXJpRXNjYXBlKG1hcmtlcilcbiAgICAgIGlmIChJbmNsdWRlVmVyc2lvbikge1xuICAgICAgICBxdWVyaWVzLnB1c2goYGtleS1tYXJrZXI9JHttYXJrZXJ9YClcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHF1ZXJpZXMucHVzaChgbWFya2VyPSR7bWFya2VyfWApXG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gbm8gbmVlZCB0byBlc2NhcGUgbWF4S2V5c1xuICAgIGlmIChNYXhLZXlzKSB7XG4gICAgICBpZiAoTWF4S2V5cyA+PSAxMDAwKSB7XG4gICAgICAgIE1heEtleXMgPSAxMDAwXG4gICAgICB9XG4gICAgICBxdWVyaWVzLnB1c2goYG1heC1rZXlzPSR7TWF4S2V5c31gKVxuICAgIH1cbiAgICBxdWVyaWVzLnNvcnQoKVxuICAgIHZhciBxdWVyeSA9ICcnXG4gICAgaWYgKHF1ZXJpZXMubGVuZ3RoID4gMCkge1xuICAgICAgcXVlcnkgPSBgJHtxdWVyaWVzLmpvaW4oJyYnKX1gXG4gICAgfVxuXG4gICAgdmFyIG1ldGhvZCA9ICdHRVQnXG4gICAgdmFyIHRyYW5zZm9ybWVyID0gdHJhbnNmb3JtZXJzLmdldExpc3RPYmplY3RzVHJhbnNmb3JtZXIoKVxuICAgIHRoaXMubWFrZVJlcXVlc3QoeyBtZXRob2QsIGJ1Y2tldE5hbWUsIHF1ZXJ5IH0sICcnLCBbMjAwXSwgJycsIHRydWUsIChlLCByZXNwb25zZSkgPT4ge1xuICAgICAgaWYgKGUpIHtcbiAgICAgICAgcmV0dXJuIHRyYW5zZm9ybWVyLmVtaXQoJ2Vycm9yJywgZSlcbiAgICAgIH1cbiAgICAgIHBpcGVzZXR1cChyZXNwb25zZSwgdHJhbnNmb3JtZXIpXG4gICAgfSlcbiAgICByZXR1cm4gdHJhbnNmb3JtZXJcbiAgfVxuXG4gIC8vIExpc3QgdGhlIG9iamVjdHMgaW4gdGhlIGJ1Y2tldC5cbiAgLy9cbiAgLy8gX19Bcmd1bWVudHNfX1xuICAvLyAqIGBidWNrZXROYW1lYCBfc3RyaW5nXzogbmFtZSBvZiB0aGUgYnVja2V0XG4gIC8vICogYHByZWZpeGAgX3N0cmluZ186IHRoZSBwcmVmaXggb2YgdGhlIG9iamVjdHMgdGhhdCBzaG91bGQgYmUgbGlzdGVkIChvcHRpb25hbCwgZGVmYXVsdCBgJydgKVxuICAvLyAqIGByZWN1cnNpdmVgIF9ib29sXzogYHRydWVgIGluZGljYXRlcyByZWN1cnNpdmUgc3R5bGUgbGlzdGluZyBhbmQgYGZhbHNlYCBpbmRpY2F0ZXMgZGlyZWN0b3J5IHN0eWxlIGxpc3RpbmcgZGVsaW1pdGVkIGJ5ICcvJy4gKG9wdGlvbmFsLCBkZWZhdWx0IGBmYWxzZWApXG4gIC8vICogYGxpc3RPcHRzIF9vYmplY3RfOiBxdWVyeSBwYXJhbXMgdG8gbGlzdCBvYmplY3Qgd2l0aCBiZWxvdyBrZXlzXG4gIC8vICogICAgbGlzdE9wdHMuTWF4S2V5cyBfaW50XyBtYXhpbXVtIG51bWJlciBvZiBrZXlzIHRvIHJldHVyblxuICAvLyAqICAgIGxpc3RPcHRzLkluY2x1ZGVWZXJzaW9uICBfYm9vbF8gdHJ1ZXxmYWxzZSB0byBpbmNsdWRlIHZlcnNpb25zLlxuICAvLyBfX1JldHVybiBWYWx1ZV9fXG4gIC8vICogYHN0cmVhbWAgX1N0cmVhbV86IHN0cmVhbSBlbWl0dGluZyB0aGUgb2JqZWN0cyBpbiB0aGUgYnVja2V0LCB0aGUgb2JqZWN0IGlzIG9mIHRoZSBmb3JtYXQ6XG4gIC8vICogYG9iai5uYW1lYCBfc3RyaW5nXzogbmFtZSBvZiB0aGUgb2JqZWN0XG4gIC8vICogYG9iai5wcmVmaXhgIF9zdHJpbmdfOiBuYW1lIG9mIHRoZSBvYmplY3QgcHJlZml4XG4gIC8vICogYG9iai5zaXplYCBfbnVtYmVyXzogc2l6ZSBvZiB0aGUgb2JqZWN0XG4gIC8vICogYG9iai5ldGFnYCBfc3RyaW5nXzogZXRhZyBvZiB0aGUgb2JqZWN0XG4gIC8vICogYG9iai5sYXN0TW9kaWZpZWRgIF9EYXRlXzogbW9kaWZpZWQgdGltZSBzdGFtcFxuICAvLyAqIGBvYmouaXNEZWxldGVNYXJrZXJgIF9ib29sZWFuXzogdHJ1ZSBpZiBpdCBpcyBhIGRlbGV0ZSBtYXJrZXJcbiAgLy8gKiBgb2JqLnZlcnNpb25JZGAgX3N0cmluZ186IHZlcnNpb25JZCBvZiB0aGUgb2JqZWN0XG4gIGxpc3RPYmplY3RzKGJ1Y2tldE5hbWUsIHByZWZpeCwgcmVjdXJzaXZlLCBsaXN0T3B0cyA9IHt9KSB7XG4gICAgaWYgKHByZWZpeCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBwcmVmaXggPSAnJ1xuICAgIH1cbiAgICBpZiAocmVjdXJzaXZlID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHJlY3Vyc2l2ZSA9IGZhbHNlXG4gICAgfVxuICAgIGlmICghaXNWYWxpZEJ1Y2tldE5hbWUoYnVja2V0TmFtZSkpIHtcbiAgICAgIHRocm93IG5ldyBlcnJvcnMuSW52YWxpZEJ1Y2tldE5hbWVFcnJvcignSW52YWxpZCBidWNrZXQgbmFtZTogJyArIGJ1Y2tldE5hbWUpXG4gICAgfVxuICAgIGlmICghaXNWYWxpZFByZWZpeChwcmVmaXgpKSB7XG4gICAgICB0aHJvdyBuZXcgZXJyb3JzLkludmFsaWRQcmVmaXhFcnJvcihgSW52YWxpZCBwcmVmaXggOiAke3ByZWZpeH1gKVxuICAgIH1cbiAgICBpZiAoIWlzU3RyaW5nKHByZWZpeCkpIHtcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ3ByZWZpeCBzaG91bGQgYmUgb2YgdHlwZSBcInN0cmluZ1wiJylcbiAgICB9XG4gICAgaWYgKCFpc0Jvb2xlYW4ocmVjdXJzaXZlKSkge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcigncmVjdXJzaXZlIHNob3VsZCBiZSBvZiB0eXBlIFwiYm9vbGVhblwiJylcbiAgICB9XG4gICAgaWYgKCFpc09iamVjdChsaXN0T3B0cykpIHtcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ2xpc3RPcHRzIHNob3VsZCBiZSBvZiB0eXBlIFwib2JqZWN0XCInKVxuICAgIH1cbiAgICB2YXIgbWFya2VyID0gJydcbiAgICBjb25zdCBsaXN0UXVlcnlPcHRzID0ge1xuICAgICAgRGVsaW1pdGVyOiByZWN1cnNpdmUgPyAnJyA6ICcvJywgLy8gaWYgcmVjdXJzaXZlIGlzIGZhbHNlIHNldCBkZWxpbWl0ZXIgdG8gJy8nXG4gICAgICBNYXhLZXlzOiAxMDAwLFxuICAgICAgSW5jbHVkZVZlcnNpb246IGxpc3RPcHRzLkluY2x1ZGVWZXJzaW9uLFxuICAgIH1cbiAgICB2YXIgb2JqZWN0cyA9IFtdXG4gICAgdmFyIGVuZGVkID0gZmFsc2VcbiAgICB2YXIgcmVhZFN0cmVhbSA9IFN0cmVhbS5SZWFkYWJsZSh7IG9iamVjdE1vZGU6IHRydWUgfSlcbiAgICByZWFkU3RyZWFtLl9yZWFkID0gKCkgPT4ge1xuICAgICAgLy8gcHVzaCBvbmUgb2JqZWN0IHBlciBfcmVhZCgpXG4gICAgICBpZiAob2JqZWN0cy5sZW5ndGgpIHtcbiAgICAgICAgcmVhZFN0cmVhbS5wdXNoKG9iamVjdHMuc2hpZnQoKSlcbiAgICAgICAgcmV0dXJuXG4gICAgICB9XG4gICAgICBpZiAoZW5kZWQpIHtcbiAgICAgICAgcmV0dXJuIHJlYWRTdHJlYW0ucHVzaChudWxsKVxuICAgICAgfVxuICAgICAgLy8gaWYgdGhlcmUgYXJlIG5vIG9iamVjdHMgdG8gcHVzaCBkbyBxdWVyeSBmb3IgdGhlIG5leHQgYmF0Y2ggb2Ygb2JqZWN0c1xuICAgICAgdGhpcy5saXN0T2JqZWN0c1F1ZXJ5KGJ1Y2tldE5hbWUsIHByZWZpeCwgbWFya2VyLCBsaXN0UXVlcnlPcHRzKVxuICAgICAgICAub24oJ2Vycm9yJywgKGUpID0+IHJlYWRTdHJlYW0uZW1pdCgnZXJyb3InLCBlKSlcbiAgICAgICAgLm9uKCdkYXRhJywgKHJlc3VsdCkgPT4ge1xuICAgICAgICAgIGlmIChyZXN1bHQuaXNUcnVuY2F0ZWQpIHtcbiAgICAgICAgICAgIG1hcmtlciA9IHJlc3VsdC5uZXh0TWFya2VyIHx8IHJlc3VsdC52ZXJzaW9uSWRNYXJrZXJcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgZW5kZWQgPSB0cnVlXG4gICAgICAgICAgfVxuICAgICAgICAgIG9iamVjdHMgPSByZXN1bHQub2JqZWN0c1xuICAgICAgICAgIHJlYWRTdHJlYW0uX3JlYWQoKVxuICAgICAgICB9KVxuICAgIH1cbiAgICByZXR1cm4gcmVhZFN0cmVhbVxuICB9XG5cbiAgLy8gbGlzdE9iamVjdHNWMlF1ZXJ5IC0gKExpc3QgT2JqZWN0cyBWMikgLSBMaXN0IHNvbWUgb3IgYWxsICh1cCB0byAxMDAwKSBvZiB0aGUgb2JqZWN0cyBpbiBhIGJ1Y2tldC5cbiAgLy9cbiAgLy8gWW91IGNhbiB1c2UgdGhlIHJlcXVlc3QgcGFyYW1ldGVycyBhcyBzZWxlY3Rpb24gY3JpdGVyaWEgdG8gcmV0dXJuIGEgc3Vic2V0IG9mIHRoZSBvYmplY3RzIGluIGEgYnVja2V0LlxuICAvLyByZXF1ZXN0IHBhcmFtZXRlcnMgOi1cbiAgLy8gKiBgYnVja2V0TmFtZWAgX3N0cmluZ186IG5hbWUgb2YgdGhlIGJ1Y2tldFxuICAvLyAqIGBwcmVmaXhgIF9zdHJpbmdfOiBMaW1pdHMgdGhlIHJlc3BvbnNlIHRvIGtleXMgdGhhdCBiZWdpbiB3aXRoIHRoZSBzcGVjaWZpZWQgcHJlZml4LlxuICAvLyAqIGBjb250aW51YXRpb24tdG9rZW5gIF9zdHJpbmdfOiBVc2VkIHRvIGNvbnRpbnVlIGl0ZXJhdGluZyBvdmVyIGEgc2V0IG9mIG9iamVjdHMuXG4gIC8vICogYGRlbGltaXRlcmAgX3N0cmluZ186IEEgZGVsaW1pdGVyIGlzIGEgY2hhcmFjdGVyIHlvdSB1c2UgdG8gZ3JvdXAga2V5cy5cbiAgLy8gKiBgbWF4LWtleXNgIF9udW1iZXJfOiBTZXRzIHRoZSBtYXhpbXVtIG51bWJlciBvZiBrZXlzIHJldHVybmVkIGluIHRoZSByZXNwb25zZSBib2R5LlxuICAvLyAqIGBzdGFydC1hZnRlcmAgX3N0cmluZ186IFNwZWNpZmllcyB0aGUga2V5IHRvIHN0YXJ0IGFmdGVyIHdoZW4gbGlzdGluZyBvYmplY3RzIGluIGEgYnVja2V0LlxuICBsaXN0T2JqZWN0c1YyUXVlcnkoYnVja2V0TmFtZSwgcHJlZml4LCBjb250aW51YXRpb25Ub2tlbiwgZGVsaW1pdGVyLCBtYXhLZXlzLCBzdGFydEFmdGVyKSB7XG4gICAgaWYgKCFpc1ZhbGlkQnVja2V0TmFtZShidWNrZXROYW1lKSkge1xuICAgICAgdGhyb3cgbmV3IGVycm9ycy5JbnZhbGlkQnVja2V0TmFtZUVycm9yKCdJbnZhbGlkIGJ1Y2tldCBuYW1lOiAnICsgYnVja2V0TmFtZSlcbiAgICB9XG4gICAgaWYgKCFpc1N0cmluZyhwcmVmaXgpKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdwcmVmaXggc2hvdWxkIGJlIG9mIHR5cGUgXCJzdHJpbmdcIicpXG4gICAgfVxuICAgIGlmICghaXNTdHJpbmcoY29udGludWF0aW9uVG9rZW4pKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdjb250aW51YXRpb25Ub2tlbiBzaG91bGQgYmUgb2YgdHlwZSBcInN0cmluZ1wiJylcbiAgICB9XG4gICAgaWYgKCFpc1N0cmluZyhkZWxpbWl0ZXIpKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdkZWxpbWl0ZXIgc2hvdWxkIGJlIG9mIHR5cGUgXCJzdHJpbmdcIicpXG4gICAgfVxuICAgIGlmICghaXNOdW1iZXIobWF4S2V5cykpIHtcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ21heEtleXMgc2hvdWxkIGJlIG9mIHR5cGUgXCJudW1iZXJcIicpXG4gICAgfVxuICAgIGlmICghaXNTdHJpbmcoc3RhcnRBZnRlcikpIHtcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ3N0YXJ0QWZ0ZXIgc2hvdWxkIGJlIG9mIHR5cGUgXCJzdHJpbmdcIicpXG4gICAgfVxuICAgIHZhciBxdWVyaWVzID0gW11cblxuICAgIC8vIENhbGwgZm9yIGxpc3Rpbmcgb2JqZWN0cyB2MiBBUElcbiAgICBxdWVyaWVzLnB1c2goYGxpc3QtdHlwZT0yYClcbiAgICBxdWVyaWVzLnB1c2goYGVuY29kaW5nLXR5cGU9dXJsYClcblxuICAgIC8vIGVzY2FwZSBldmVyeSB2YWx1ZSBpbiBxdWVyeSBzdHJpbmcsIGV4Y2VwdCBtYXhLZXlzXG4gICAgcXVlcmllcy5wdXNoKGBwcmVmaXg9JHt1cmlFc2NhcGUocHJlZml4KX1gKVxuICAgIHF1ZXJpZXMucHVzaChgZGVsaW1pdGVyPSR7dXJpRXNjYXBlKGRlbGltaXRlcil9YClcblxuICAgIGlmIChjb250aW51YXRpb25Ub2tlbikge1xuICAgICAgY29udGludWF0aW9uVG9rZW4gPSB1cmlFc2NhcGUoY29udGludWF0aW9uVG9rZW4pXG4gICAgICBxdWVyaWVzLnB1c2goYGNvbnRpbnVhdGlvbi10b2tlbj0ke2NvbnRpbnVhdGlvblRva2VufWApXG4gICAgfVxuICAgIC8vIFNldCBzdGFydC1hZnRlclxuICAgIGlmIChzdGFydEFmdGVyKSB7XG4gICAgICBzdGFydEFmdGVyID0gdXJpRXNjYXBlKHN0YXJ0QWZ0ZXIpXG4gICAgICBxdWVyaWVzLnB1c2goYHN0YXJ0LWFmdGVyPSR7c3RhcnRBZnRlcn1gKVxuICAgIH1cbiAgICAvLyBubyBuZWVkIHRvIGVzY2FwZSBtYXhLZXlzXG4gICAgaWYgKG1heEtleXMpIHtcbiAgICAgIGlmIChtYXhLZXlzID49IDEwMDApIHtcbiAgICAgICAgbWF4S2V5cyA9IDEwMDBcbiAgICAgIH1cbiAgICAgIHF1ZXJpZXMucHVzaChgbWF4LWtleXM9JHttYXhLZXlzfWApXG4gICAgfVxuICAgIHF1ZXJpZXMuc29ydCgpXG4gICAgdmFyIHF1ZXJ5ID0gJydcbiAgICBpZiAocXVlcmllcy5sZW5ndGggPiAwKSB7XG4gICAgICBxdWVyeSA9IGAke3F1ZXJpZXMuam9pbignJicpfWBcbiAgICB9XG4gICAgdmFyIG1ldGhvZCA9ICdHRVQnXG4gICAgdmFyIHRyYW5zZm9ybWVyID0gdHJhbnNmb3JtZXJzLmdldExpc3RPYmplY3RzVjJUcmFuc2Zvcm1lcigpXG4gICAgdGhpcy5tYWtlUmVxdWVzdCh7IG1ldGhvZCwgYnVja2V0TmFtZSwgcXVlcnkgfSwgJycsIFsyMDBdLCAnJywgdHJ1ZSwgKGUsIHJlc3BvbnNlKSA9PiB7XG4gICAgICBpZiAoZSkge1xuICAgICAgICByZXR1cm4gdHJhbnNmb3JtZXIuZW1pdCgnZXJyb3InLCBlKVxuICAgICAgfVxuICAgICAgcGlwZXNldHVwKHJlc3BvbnNlLCB0cmFuc2Zvcm1lcilcbiAgICB9KVxuICAgIHJldHVybiB0cmFuc2Zvcm1lclxuICB9XG5cbiAgLy8gTGlzdCB0aGUgb2JqZWN0cyBpbiB0aGUgYnVja2V0IHVzaW5nIFMzIExpc3RPYmplY3RzIFYyXG4gIC8vXG4gIC8vIF9fQXJndW1lbnRzX19cbiAgLy8gKiBgYnVja2V0TmFtZWAgX3N0cmluZ186IG5hbWUgb2YgdGhlIGJ1Y2tldFxuICAvLyAqIGBwcmVmaXhgIF9zdHJpbmdfOiB0aGUgcHJlZml4IG9mIHRoZSBvYmplY3RzIHRoYXQgc2hvdWxkIGJlIGxpc3RlZCAob3B0aW9uYWwsIGRlZmF1bHQgYCcnYClcbiAgLy8gKiBgcmVjdXJzaXZlYCBfYm9vbF86IGB0cnVlYCBpbmRpY2F0ZXMgcmVjdXJzaXZlIHN0eWxlIGxpc3RpbmcgYW5kIGBmYWxzZWAgaW5kaWNhdGVzIGRpcmVjdG9yeSBzdHlsZSBsaXN0aW5nIGRlbGltaXRlZCBieSAnLycuIChvcHRpb25hbCwgZGVmYXVsdCBgZmFsc2VgKVxuICAvLyAqIGBzdGFydEFmdGVyYCBfc3RyaW5nXzogU3BlY2lmaWVzIHRoZSBrZXkgdG8gc3RhcnQgYWZ0ZXIgd2hlbiBsaXN0aW5nIG9iamVjdHMgaW4gYSBidWNrZXQuIChvcHRpb25hbCwgZGVmYXVsdCBgJydgKVxuICAvL1xuICAvLyBfX1JldHVybiBWYWx1ZV9fXG4gIC8vICogYHN0cmVhbWAgX1N0cmVhbV86IHN0cmVhbSBlbWl0dGluZyB0aGUgb2JqZWN0cyBpbiB0aGUgYnVja2V0LCB0aGUgb2JqZWN0IGlzIG9mIHRoZSBmb3JtYXQ6XG4gIC8vICAgKiBgb2JqLm5hbWVgIF9zdHJpbmdfOiBuYW1lIG9mIHRoZSBvYmplY3RcbiAgLy8gICAqIGBvYmoucHJlZml4YCBfc3RyaW5nXzogbmFtZSBvZiB0aGUgb2JqZWN0IHByZWZpeFxuICAvLyAgICogYG9iai5zaXplYCBfbnVtYmVyXzogc2l6ZSBvZiB0aGUgb2JqZWN0XG4gIC8vICAgKiBgb2JqLmV0YWdgIF9zdHJpbmdfOiBldGFnIG9mIHRoZSBvYmplY3RcbiAgLy8gICAqIGBvYmoubGFzdE1vZGlmaWVkYCBfRGF0ZV86IG1vZGlmaWVkIHRpbWUgc3RhbXBcbiAgbGlzdE9iamVjdHNWMihidWNrZXROYW1lLCBwcmVmaXgsIHJlY3Vyc2l2ZSwgc3RhcnRBZnRlcikge1xuICAgIGlmIChwcmVmaXggPT09IHVuZGVmaW5lZCkge1xuICAgICAgcHJlZml4ID0gJydcbiAgICB9XG4gICAgaWYgKHJlY3Vyc2l2ZSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICByZWN1cnNpdmUgPSBmYWxzZVxuICAgIH1cbiAgICBpZiAoc3RhcnRBZnRlciA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBzdGFydEFmdGVyID0gJydcbiAgICB9XG4gICAgaWYgKCFpc1ZhbGlkQnVja2V0TmFtZShidWNrZXROYW1lKSkge1xuICAgICAgdGhyb3cgbmV3IGVycm9ycy5JbnZhbGlkQnVja2V0TmFtZUVycm9yKCdJbnZhbGlkIGJ1Y2tldCBuYW1lOiAnICsgYnVja2V0TmFtZSlcbiAgICB9XG4gICAgaWYgKCFpc1ZhbGlkUHJlZml4KHByZWZpeCkpIHtcbiAgICAgIHRocm93IG5ldyBlcnJvcnMuSW52YWxpZFByZWZpeEVycm9yKGBJbnZhbGlkIHByZWZpeCA6ICR7cHJlZml4fWApXG4gICAgfVxuICAgIGlmICghaXNTdHJpbmcocHJlZml4KSkge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcigncHJlZml4IHNob3VsZCBiZSBvZiB0eXBlIFwic3RyaW5nXCInKVxuICAgIH1cbiAgICBpZiAoIWlzQm9vbGVhbihyZWN1cnNpdmUpKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdyZWN1cnNpdmUgc2hvdWxkIGJlIG9mIHR5cGUgXCJib29sZWFuXCInKVxuICAgIH1cbiAgICBpZiAoIWlzU3RyaW5nKHN0YXJ0QWZ0ZXIpKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdzdGFydEFmdGVyIHNob3VsZCBiZSBvZiB0eXBlIFwic3RyaW5nXCInKVxuICAgIH1cbiAgICAvLyBpZiByZWN1cnNpdmUgaXMgZmFsc2Ugc2V0IGRlbGltaXRlciB0byAnLydcbiAgICB2YXIgZGVsaW1pdGVyID0gcmVjdXJzaXZlID8gJycgOiAnLydcbiAgICB2YXIgY29udGludWF0aW9uVG9rZW4gPSAnJ1xuICAgIHZhciBvYmplY3RzID0gW11cbiAgICB2YXIgZW5kZWQgPSBmYWxzZVxuICAgIHZhciByZWFkU3RyZWFtID0gU3RyZWFtLlJlYWRhYmxlKHsgb2JqZWN0TW9kZTogdHJ1ZSB9KVxuICAgIHJlYWRTdHJlYW0uX3JlYWQgPSAoKSA9PiB7XG4gICAgICAvLyBwdXNoIG9uZSBvYmplY3QgcGVyIF9yZWFkKClcbiAgICAgIGlmIChvYmplY3RzLmxlbmd0aCkge1xuICAgICAgICByZWFkU3RyZWFtLnB1c2gob2JqZWN0cy5zaGlmdCgpKVxuICAgICAgICByZXR1cm5cbiAgICAgIH1cbiAgICAgIGlmIChlbmRlZCkge1xuICAgICAgICByZXR1cm4gcmVhZFN0cmVhbS5wdXNoKG51bGwpXG4gICAgICB9XG4gICAgICAvLyBpZiB0aGVyZSBhcmUgbm8gb2JqZWN0cyB0byBwdXNoIGRvIHF1ZXJ5IGZvciB0aGUgbmV4dCBiYXRjaCBvZiBvYmplY3RzXG4gICAgICB0aGlzLmxpc3RPYmplY3RzVjJRdWVyeShidWNrZXROYW1lLCBwcmVmaXgsIGNvbnRpbnVhdGlvblRva2VuLCBkZWxpbWl0ZXIsIDEwMDAsIHN0YXJ0QWZ0ZXIpXG4gICAgICAgIC5vbignZXJyb3InLCAoZSkgPT4gcmVhZFN0cmVhbS5lbWl0KCdlcnJvcicsIGUpKVxuICAgICAgICAub24oJ2RhdGEnLCAocmVzdWx0KSA9PiB7XG4gICAgICAgICAgaWYgKHJlc3VsdC5pc1RydW5jYXRlZCkge1xuICAgICAgICAgICAgY29udGludWF0aW9uVG9rZW4gPSByZXN1bHQubmV4dENvbnRpbnVhdGlvblRva2VuXG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGVuZGVkID0gdHJ1ZVxuICAgICAgICAgIH1cbiAgICAgICAgICBvYmplY3RzID0gcmVzdWx0Lm9iamVjdHNcbiAgICAgICAgICByZWFkU3RyZWFtLl9yZWFkKClcbiAgICAgICAgfSlcbiAgICB9XG4gICAgcmV0dXJuIHJlYWRTdHJlYW1cbiAgfVxuXG4gIC8vIFN0YXQgaW5mb3JtYXRpb24gb2YgdGhlIG9iamVjdC5cbiAgLy9cbiAgLy8gX19Bcmd1bWVudHNfX1xuICAvLyAqIGBidWNrZXROYW1lYCBfc3RyaW5nXzogbmFtZSBvZiB0aGUgYnVja2V0XG4gIC8vICogYG9iamVjdE5hbWVgIF9zdHJpbmdfOiBuYW1lIG9mIHRoZSBvYmplY3RcbiAgLy8gKiBgc3RhdE9wdHNgICBfb2JqZWN0XyA6IFZlcnNpb24gb2YgdGhlIG9iamVjdCBpbiB0aGUgZm9ybSBge3ZlcnNpb25JZDonbXktdXVpZCd9YC4gRGVmYXVsdCBpcyBge31gLiAob3B0aW9uYWwpLlxuICAvLyAqIGBjYWxsYmFjayhlcnIsIHN0YXQpYCBfZnVuY3Rpb25fOiBgZXJyYCBpcyBub3QgYG51bGxgIGluIGNhc2Ugb2YgZXJyb3IsIGBzdGF0YCBjb250YWlucyB0aGUgb2JqZWN0IGluZm9ybWF0aW9uOlxuICAvLyAgICogYHN0YXQuc2l6ZWAgX251bWJlcl86IHNpemUgb2YgdGhlIG9iamVjdFxuICAvLyAgICogYHN0YXQuZXRhZ2AgX3N0cmluZ186IGV0YWcgb2YgdGhlIG9iamVjdFxuICAvLyAgICogYHN0YXQubWV0YURhdGFgIF9zdHJpbmdfOiBNZXRhRGF0YSBvZiB0aGUgb2JqZWN0XG4gIC8vICAgKiBgc3RhdC5sYXN0TW9kaWZpZWRgIF9EYXRlXzogbW9kaWZpZWQgdGltZSBzdGFtcFxuICAvLyAgICogYHN0YXQudmVyc2lvbklkYCBfc3RyaW5nXzogdmVyc2lvbiBpZCBvZiB0aGUgb2JqZWN0IGlmIGF2YWlsYWJsZVxuICBzdGF0T2JqZWN0KGJ1Y2tldE5hbWUsIG9iamVjdE5hbWUsIHN0YXRPcHRzID0ge30sIGNiKSB7XG4gICAgaWYgKCFpc1ZhbGlkQnVja2V0TmFtZShidWNrZXROYW1lKSkge1xuICAgICAgdGhyb3cgbmV3IGVycm9ycy5JbnZhbGlkQnVja2V0TmFtZUVycm9yKCdJbnZhbGlkIGJ1Y2tldCBuYW1lOiAnICsgYnVja2V0TmFtZSlcbiAgICB9XG4gICAgaWYgKCFpc1ZhbGlkT2JqZWN0TmFtZShvYmplY3ROYW1lKSkge1xuICAgICAgdGhyb3cgbmV3IGVycm9ycy5JbnZhbGlkT2JqZWN0TmFtZUVycm9yKGBJbnZhbGlkIG9iamVjdCBuYW1lOiAke29iamVjdE5hbWV9YClcbiAgICB9XG4gICAgLy8gYmFja3dhcmQgY29tcGF0aWJpbGl0eVxuICAgIGlmIChpc0Z1bmN0aW9uKHN0YXRPcHRzKSkge1xuICAgICAgY2IgPSBzdGF0T3B0c1xuICAgICAgc3RhdE9wdHMgPSB7fVxuICAgIH1cblxuICAgIGlmICghaXNPYmplY3Qoc3RhdE9wdHMpKSB7XG4gICAgICB0aHJvdyBuZXcgZXJyb3JzLkludmFsaWRBcmd1bWVudEVycm9yKCdzdGF0T3B0cyBzaG91bGQgYmUgb2YgdHlwZSBcIm9iamVjdFwiJylcbiAgICB9XG4gICAgaWYgKCFpc0Z1bmN0aW9uKGNiKSkge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignY2FsbGJhY2sgc2hvdWxkIGJlIG9mIHR5cGUgXCJmdW5jdGlvblwiJylcbiAgICB9XG5cbiAgICB2YXIgcXVlcnkgPSBxdWVyeXN0cmluZy5zdHJpbmdpZnkoc3RhdE9wdHMpXG4gICAgdmFyIG1ldGhvZCA9ICdIRUFEJ1xuICAgIHRoaXMubWFrZVJlcXVlc3QoeyBtZXRob2QsIGJ1Y2tldE5hbWUsIG9iamVjdE5hbWUsIHF1ZXJ5IH0sICcnLCBbMjAwXSwgJycsIHRydWUsIChlLCByZXNwb25zZSkgPT4ge1xuICAgICAgaWYgKGUpIHtcbiAgICAgICAgcmV0dXJuIGNiKGUpXG4gICAgICB9XG5cbiAgICAgIC8vIFdlIGRyYWluIHRoZSBzb2NrZXQgc28gdGhhdCB0aGUgY29ubmVjdGlvbiBnZXRzIGNsb3NlZC4gTm90ZSB0aGF0IHRoaXNcbiAgICAgIC8vIGlzIG5vdCBleHBlbnNpdmUgYXMgdGhlIHNvY2tldCB3aWxsIG5vdCBoYXZlIGFueSBkYXRhLlxuICAgICAgcmVzcG9uc2Uub24oJ2RhdGEnLCAoKSA9PiB7fSlcblxuICAgICAgY29uc3QgcmVzdWx0ID0ge1xuICAgICAgICBzaXplOiArcmVzcG9uc2UuaGVhZGVyc1snY29udGVudC1sZW5ndGgnXSxcbiAgICAgICAgbWV0YURhdGE6IGV4dHJhY3RNZXRhZGF0YShyZXNwb25zZS5oZWFkZXJzKSxcbiAgICAgICAgbGFzdE1vZGlmaWVkOiBuZXcgRGF0ZShyZXNwb25zZS5oZWFkZXJzWydsYXN0LW1vZGlmaWVkJ10pLFxuICAgICAgICB2ZXJzaW9uSWQ6IGdldFZlcnNpb25JZChyZXNwb25zZS5oZWFkZXJzKSxcbiAgICAgICAgZXRhZzogc2FuaXRpemVFVGFnKHJlc3BvbnNlLmhlYWRlcnMuZXRhZyksXG4gICAgICB9XG5cbiAgICAgIGNiKG51bGwsIHJlc3VsdClcbiAgICB9KVxuICB9XG5cbiAgLy8gUmVtb3ZlIHRoZSBzcGVjaWZpZWQgb2JqZWN0LlxuICAvL1xuICAvLyBfX0FyZ3VtZW50c19fXG4gIC8vICogYGJ1Y2tldE5hbWVgIF9zdHJpbmdfOiBuYW1lIG9mIHRoZSBidWNrZXRcbiAgLy8gKiBgb2JqZWN0TmFtZWAgX3N0cmluZ186IG5hbWUgb2YgdGhlIG9iamVjdFxuICAvLyAqIGByZW1vdmVPcHRzYCBfb2JqZWN0XzogVmVyc2lvbiBvZiB0aGUgb2JqZWN0IGluIHRoZSBmb3JtIGB7dmVyc2lvbklkOidteS11dWlkJywgZ292ZXJuYW5jZUJ5cGFzczp0cnVlfGZhbHNlLCBmb3JjZURlbGV0ZTp0cnVlfGZhbHNlfWAuIERlZmF1bHQgaXMgYHt9YC4gKG9wdGlvbmFsKVxuICAvLyAqIGBjYWxsYmFjayhlcnIpYCBfZnVuY3Rpb25fOiBjYWxsYmFjayBmdW5jdGlvbiBpcyBjYWxsZWQgd2l0aCBub24gYG51bGxgIHZhbHVlIGluIGNhc2Ugb2YgZXJyb3JcbiAgcmVtb3ZlT2JqZWN0KGJ1Y2tldE5hbWUsIG9iamVjdE5hbWUsIHJlbW92ZU9wdHMgPSB7fSwgY2IpIHtcbiAgICBpZiAoIWlzVmFsaWRCdWNrZXROYW1lKGJ1Y2tldE5hbWUpKSB7XG4gICAgICB0aHJvdyBuZXcgZXJyb3JzLkludmFsaWRCdWNrZXROYW1lRXJyb3IoJ0ludmFsaWQgYnVja2V0IG5hbWU6ICcgKyBidWNrZXROYW1lKVxuICAgIH1cbiAgICBpZiAoIWlzVmFsaWRPYmplY3ROYW1lKG9iamVjdE5hbWUpKSB7XG4gICAgICB0aHJvdyBuZXcgZXJyb3JzLkludmFsaWRPYmplY3ROYW1lRXJyb3IoYEludmFsaWQgb2JqZWN0IG5hbWU6ICR7b2JqZWN0TmFtZX1gKVxuICAgIH1cbiAgICAvLyBiYWNrd2FyZCBjb21wYXRpYmlsaXR5XG4gICAgaWYgKGlzRnVuY3Rpb24ocmVtb3ZlT3B0cykpIHtcbiAgICAgIGNiID0gcmVtb3ZlT3B0c1xuICAgICAgcmVtb3ZlT3B0cyA9IHt9XG4gICAgfVxuXG4gICAgaWYgKCFpc09iamVjdChyZW1vdmVPcHRzKSkge1xuICAgICAgdGhyb3cgbmV3IGVycm9ycy5JbnZhbGlkQXJndW1lbnRFcnJvcigncmVtb3ZlT3B0cyBzaG91bGQgYmUgb2YgdHlwZSBcIm9iamVjdFwiJylcbiAgICB9XG4gICAgaWYgKCFpc0Z1bmN0aW9uKGNiKSkge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignY2FsbGJhY2sgc2hvdWxkIGJlIG9mIHR5cGUgXCJmdW5jdGlvblwiJylcbiAgICB9XG4gICAgY29uc3QgbWV0aG9kID0gJ0RFTEVURSdcbiAgICBjb25zdCBxdWVyeVBhcmFtcyA9IHt9XG5cbiAgICBpZiAocmVtb3ZlT3B0cy52ZXJzaW9uSWQpIHtcbiAgICAgIHF1ZXJ5UGFyYW1zLnZlcnNpb25JZCA9IGAke3JlbW92ZU9wdHMudmVyc2lvbklkfWBcbiAgICB9XG4gICAgY29uc3QgaGVhZGVycyA9IHt9XG4gICAgaWYgKHJlbW92ZU9wdHMuZ292ZXJuYW5jZUJ5cGFzcykge1xuICAgICAgaGVhZGVyc1snWC1BbXotQnlwYXNzLUdvdmVybmFuY2UtUmV0ZW50aW9uJ10gPSB0cnVlXG4gICAgfVxuICAgIGlmIChyZW1vdmVPcHRzLmZvcmNlRGVsZXRlKSB7XG4gICAgICBoZWFkZXJzWyd4LW1pbmlvLWZvcmNlLWRlbGV0ZSddID0gdHJ1ZVxuICAgIH1cblxuICAgIGNvbnN0IHF1ZXJ5ID0gcXVlcnlzdHJpbmcuc3RyaW5naWZ5KHF1ZXJ5UGFyYW1zKVxuXG4gICAgbGV0IHJlcXVlc3RPcHRpb25zID0geyBtZXRob2QsIGJ1Y2tldE5hbWUsIG9iamVjdE5hbWUsIGhlYWRlcnMgfVxuICAgIGlmIChxdWVyeSkge1xuICAgICAgcmVxdWVzdE9wdGlvbnNbJ3F1ZXJ5J10gPSBxdWVyeVxuICAgIH1cblxuICAgIHRoaXMubWFrZVJlcXVlc3QocmVxdWVzdE9wdGlvbnMsICcnLCBbMjAwLCAyMDRdLCAnJywgZmFsc2UsIGNiKVxuICB9XG5cbiAgLy8gUmVtb3ZlIGFsbCB0aGUgb2JqZWN0cyByZXNpZGluZyBpbiB0aGUgb2JqZWN0c0xpc3QuXG4gIC8vXG4gIC8vIF9fQXJndW1lbnRzX19cbiAgLy8gKiBgYnVja2V0TmFtZWAgX3N0cmluZ186IG5hbWUgb2YgdGhlIGJ1Y2tldFxuICAvLyAqIGBvYmplY3RzTGlzdGAgX2FycmF5XzogYXJyYXkgb2Ygb2JqZWN0cyBvZiBvbmUgb2YgdGhlIGZvbGxvd2luZzpcbiAgLy8gKiAgICAgICAgIExpc3Qgb2YgT2JqZWN0IG5hbWVzIGFzIGFycmF5IG9mIHN0cmluZ3Mgd2hpY2ggYXJlIG9iamVjdCBrZXlzOiAgWydvYmplY3RuYW1lMScsJ29iamVjdG5hbWUyJ11cbiAgLy8gKiAgICAgICAgIExpc3Qgb2YgT2JqZWN0IG5hbWUgYW5kIHZlcnNpb25JZCBhcyBhbiBvYmplY3Q6ICBbe25hbWU6XCJvYmplY3RuYW1lXCIsdmVyc2lvbklkOlwibXktdmVyc2lvbi1pZFwifV1cblxuICByZW1vdmVPYmplY3RzKGJ1Y2tldE5hbWUsIG9iamVjdHNMaXN0LCBjYikge1xuICAgIGlmICghaXNWYWxpZEJ1Y2tldE5hbWUoYnVja2V0TmFtZSkpIHtcbiAgICAgIHRocm93IG5ldyBlcnJvcnMuSW52YWxpZEJ1Y2tldE5hbWVFcnJvcignSW52YWxpZCBidWNrZXQgbmFtZTogJyArIGJ1Y2tldE5hbWUpXG4gICAgfVxuICAgIGlmICghQXJyYXkuaXNBcnJheShvYmplY3RzTGlzdCkpIHtcbiAgICAgIHRocm93IG5ldyBlcnJvcnMuSW52YWxpZEFyZ3VtZW50RXJyb3IoJ29iamVjdHNMaXN0IHNob3VsZCBiZSBhIGxpc3QnKVxuICAgIH1cbiAgICBpZiAoIWlzRnVuY3Rpb24oY2IpKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdjYWxsYmFjayBzaG91bGQgYmUgb2YgdHlwZSBcImZ1bmN0aW9uXCInKVxuICAgIH1cblxuICAgIGNvbnN0IG1heEVudHJpZXMgPSAxMDAwXG4gICAgY29uc3QgcXVlcnkgPSAnZGVsZXRlJ1xuICAgIGNvbnN0IG1ldGhvZCA9ICdQT1NUJ1xuXG4gICAgbGV0IHJlc3VsdCA9IG9iamVjdHNMaXN0LnJlZHVjZShcbiAgICAgIChyZXN1bHQsIGVudHJ5KSA9PiB7XG4gICAgICAgIHJlc3VsdC5saXN0LnB1c2goZW50cnkpXG4gICAgICAgIGlmIChyZXN1bHQubGlzdC5sZW5ndGggPT09IG1heEVudHJpZXMpIHtcbiAgICAgICAgICByZXN1bHQubGlzdE9mTGlzdC5wdXNoKHJlc3VsdC5saXN0KVxuICAgICAgICAgIHJlc3VsdC5saXN0ID0gW11cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gcmVzdWx0XG4gICAgICB9LFxuICAgICAgeyBsaXN0T2ZMaXN0OiBbXSwgbGlzdDogW10gfSxcbiAgICApXG5cbiAgICBpZiAocmVzdWx0Lmxpc3QubGVuZ3RoID4gMCkge1xuICAgICAgcmVzdWx0Lmxpc3RPZkxpc3QucHVzaChyZXN1bHQubGlzdClcbiAgICB9XG5cbiAgICBjb25zdCBlbmNvZGVyID0gbmV3IFRleHRFbmNvZGVyKClcbiAgICBjb25zdCBiYXRjaFJlc3VsdHMgPSBbXVxuXG4gICAgYXN5bmMuZWFjaFNlcmllcyhcbiAgICAgIHJlc3VsdC5saXN0T2ZMaXN0LFxuICAgICAgKGxpc3QsIGJhdGNoQ2IpID0+IHtcbiAgICAgICAgdmFyIG9iamVjdHMgPSBbXVxuICAgICAgICBsaXN0LmZvckVhY2goZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgICAgaWYgKGlzT2JqZWN0KHZhbHVlKSkge1xuICAgICAgICAgICAgb2JqZWN0cy5wdXNoKHsgS2V5OiB2YWx1ZS5uYW1lLCBWZXJzaW9uSWQ6IHZhbHVlLnZlcnNpb25JZCB9KVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBvYmplY3RzLnB1c2goeyBLZXk6IHZhbHVlIH0pXG4gICAgICAgICAgfVxuICAgICAgICB9KVxuICAgICAgICBsZXQgZGVsZXRlT2JqZWN0cyA9IHsgRGVsZXRlOiB7IFF1aWV0OiB0cnVlLCBPYmplY3Q6IG9iamVjdHMgfSB9XG4gICAgICAgIGNvbnN0IGJ1aWxkZXIgPSBuZXcgeG1sMmpzLkJ1aWxkZXIoeyBoZWFkbGVzczogdHJ1ZSB9KVxuICAgICAgICBsZXQgcGF5bG9hZCA9IGJ1aWxkZXIuYnVpbGRPYmplY3QoZGVsZXRlT2JqZWN0cylcbiAgICAgICAgcGF5bG9hZCA9IGVuY29kZXIuZW5jb2RlKHBheWxvYWQpXG4gICAgICAgIGNvbnN0IGhlYWRlcnMgPSB7fVxuXG4gICAgICAgIGhlYWRlcnNbJ0NvbnRlbnQtTUQ1J10gPSB0b01kNShwYXlsb2FkKVxuXG4gICAgICAgIGxldCByZW1vdmVPYmplY3RzUmVzdWx0XG4gICAgICAgIHRoaXMubWFrZVJlcXVlc3QoeyBtZXRob2QsIGJ1Y2tldE5hbWUsIHF1ZXJ5LCBoZWFkZXJzIH0sIHBheWxvYWQsIFsyMDBdLCAnJywgdHJ1ZSwgKGUsIHJlc3BvbnNlKSA9PiB7XG4gICAgICAgICAgaWYgKGUpIHtcbiAgICAgICAgICAgIHJldHVybiBiYXRjaENiKGUpXG4gICAgICAgICAgfVxuICAgICAgICAgIHBpcGVzZXR1cChyZXNwb25zZSwgdHJhbnNmb3JtZXJzLnJlbW92ZU9iamVjdHNUcmFuc2Zvcm1lcigpKVxuICAgICAgICAgICAgLm9uKCdkYXRhJywgKGRhdGEpID0+IHtcbiAgICAgICAgICAgICAgcmVtb3ZlT2JqZWN0c1Jlc3VsdCA9IGRhdGFcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAub24oJ2Vycm9yJywgKGUpID0+IHtcbiAgICAgICAgICAgICAgcmV0dXJuIGJhdGNoQ2IoZSwgbnVsbClcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAub24oJ2VuZCcsICgpID0+IHtcbiAgICAgICAgICAgICAgYmF0Y2hSZXN1bHRzLnB1c2gocmVtb3ZlT2JqZWN0c1Jlc3VsdClcbiAgICAgICAgICAgICAgcmV0dXJuIGJhdGNoQ2IobnVsbCwgcmVtb3ZlT2JqZWN0c1Jlc3VsdClcbiAgICAgICAgICAgIH0pXG4gICAgICAgIH0pXG4gICAgICB9LFxuICAgICAgKCkgPT4ge1xuICAgICAgICBjYihudWxsLCBfLmZsYXR0ZW4oYmF0Y2hSZXN1bHRzKSlcbiAgICAgIH0sXG4gICAgKVxuICB9XG5cbiAgLy8gR2V0IHRoZSBwb2xpY3kgb24gYSBidWNrZXQgb3IgYW4gb2JqZWN0IHByZWZpeC5cbiAgLy9cbiAgLy8gX19Bcmd1bWVudHNfX1xuICAvLyAqIGBidWNrZXROYW1lYCBfc3RyaW5nXzogbmFtZSBvZiB0aGUgYnVja2V0XG4gIC8vICogYGNhbGxiYWNrKGVyciwgcG9saWN5KWAgX2Z1bmN0aW9uXzogY2FsbGJhY2sgZnVuY3Rpb25cbiAgZ2V0QnVja2V0UG9saWN5KGJ1Y2tldE5hbWUsIGNiKSB7XG4gICAgLy8gVmFsaWRhdGUgYXJndW1lbnRzLlxuICAgIGlmICghaXNWYWxpZEJ1Y2tldE5hbWUoYnVja2V0TmFtZSkpIHtcbiAgICAgIHRocm93IG5ldyBlcnJvcnMuSW52YWxpZEJ1Y2tldE5hbWVFcnJvcihgSW52YWxpZCBidWNrZXQgbmFtZTogJHtidWNrZXROYW1lfWApXG4gICAgfVxuICAgIGlmICghaXNGdW5jdGlvbihjYikpIHtcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ2NhbGxiYWNrIHNob3VsZCBiZSBvZiB0eXBlIFwiZnVuY3Rpb25cIicpXG4gICAgfVxuXG4gICAgbGV0IG1ldGhvZCA9ICdHRVQnXG4gICAgbGV0IHF1ZXJ5ID0gJ3BvbGljeSdcbiAgICB0aGlzLm1ha2VSZXF1ZXN0KHsgbWV0aG9kLCBidWNrZXROYW1lLCBxdWVyeSB9LCAnJywgWzIwMF0sICcnLCB0cnVlLCAoZSwgcmVzcG9uc2UpID0+IHtcbiAgICAgIGlmIChlKSB7XG4gICAgICAgIHJldHVybiBjYihlKVxuICAgICAgfVxuXG4gICAgICBsZXQgcG9saWN5ID0gQnVmZmVyLmZyb20oJycpXG4gICAgICBwaXBlc2V0dXAocmVzcG9uc2UsIHRyYW5zZm9ybWVycy5nZXRDb25jYXRlcigpKVxuICAgICAgICAub24oJ2RhdGEnLCAoZGF0YSkgPT4gKHBvbGljeSA9IGRhdGEpKVxuICAgICAgICAub24oJ2Vycm9yJywgY2IpXG4gICAgICAgIC5vbignZW5kJywgKCkgPT4ge1xuICAgICAgICAgIGNiKG51bGwsIHBvbGljeS50b1N0cmluZygpKVxuICAgICAgICB9KVxuICAgIH0pXG4gIH1cblxuICAvLyBTZXQgdGhlIHBvbGljeSBvbiBhIGJ1Y2tldCBvciBhbiBvYmplY3QgcHJlZml4LlxuICAvL1xuICAvLyBfX0FyZ3VtZW50c19fXG4gIC8vICogYGJ1Y2tldE5hbWVgIF9zdHJpbmdfOiBuYW1lIG9mIHRoZSBidWNrZXRcbiAgLy8gKiBgYnVja2V0UG9saWN5YCBfc3RyaW5nXzogYnVja2V0IHBvbGljeSAoSlNPTiBzdHJpbmdpZnknZWQpXG4gIC8vICogYGNhbGxiYWNrKGVycilgIF9mdW5jdGlvbl86IGNhbGxiYWNrIGZ1bmN0aW9uXG4gIHNldEJ1Y2tldFBvbGljeShidWNrZXROYW1lLCBwb2xpY3ksIGNiKSB7XG4gICAgLy8gVmFsaWRhdGUgYXJndW1lbnRzLlxuICAgIGlmICghaXNWYWxpZEJ1Y2tldE5hbWUoYnVja2V0TmFtZSkpIHtcbiAgICAgIHRocm93IG5ldyBlcnJvcnMuSW52YWxpZEJ1Y2tldE5hbWVFcnJvcihgSW52YWxpZCBidWNrZXQgbmFtZTogJHtidWNrZXROYW1lfWApXG4gICAgfVxuICAgIGlmICghaXNTdHJpbmcocG9saWN5KSkge1xuICAgICAgdGhyb3cgbmV3IGVycm9ycy5JbnZhbGlkQnVja2V0UG9saWN5RXJyb3IoYEludmFsaWQgYnVja2V0IHBvbGljeTogJHtwb2xpY3l9IC0gbXVzdCBiZSBcInN0cmluZ1wiYClcbiAgICB9XG4gICAgaWYgKCFpc0Z1bmN0aW9uKGNiKSkge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignY2FsbGJhY2sgc2hvdWxkIGJlIG9mIHR5cGUgXCJmdW5jdGlvblwiJylcbiAgICB9XG5cbiAgICBsZXQgbWV0aG9kID0gJ0RFTEVURSdcbiAgICBsZXQgcXVlcnkgPSAncG9saWN5J1xuXG4gICAgaWYgKHBvbGljeSkge1xuICAgICAgbWV0aG9kID0gJ1BVVCdcbiAgICB9XG5cbiAgICB0aGlzLm1ha2VSZXF1ZXN0KHsgbWV0aG9kLCBidWNrZXROYW1lLCBxdWVyeSB9LCBwb2xpY3ksIFsyMDRdLCAnJywgZmFsc2UsIGNiKVxuICB9XG5cbiAgLy8gR2VuZXJhdGUgYSBnZW5lcmljIHByZXNpZ25lZCBVUkwgd2hpY2ggY2FuIGJlXG4gIC8vIHVzZWQgZm9yIEhUVFAgbWV0aG9kcyBHRVQsIFBVVCwgSEVBRCBhbmQgREVMRVRFXG4gIC8vXG4gIC8vIF9fQXJndW1lbnRzX19cbiAgLy8gKiBgbWV0aG9kYCBfc3RyaW5nXzogbmFtZSBvZiB0aGUgSFRUUCBtZXRob2RcbiAgLy8gKiBgYnVja2V0TmFtZWAgX3N0cmluZ186IG5hbWUgb2YgdGhlIGJ1Y2tldFxuICAvLyAqIGBvYmplY3ROYW1lYCBfc3RyaW5nXzogbmFtZSBvZiB0aGUgb2JqZWN0XG4gIC8vICogYGV4cGlyeWAgX251bWJlcl86IGV4cGlyeSBpbiBzZWNvbmRzIChvcHRpb25hbCwgZGVmYXVsdCA3IGRheXMpXG4gIC8vICogYHJlcVBhcmFtc2AgX29iamVjdF86IHJlcXVlc3QgcGFyYW1ldGVycyAob3B0aW9uYWwpIGUuZyB7dmVyc2lvbklkOlwiMTBmYTk5NDYtM2Y2NC00MTM3LWE1OGYtODg4MDY1YzA3MzJlXCJ9XG4gIC8vICogYHJlcXVlc3REYXRlYCBfRGF0ZV86IEEgZGF0ZSBvYmplY3QsIHRoZSB1cmwgd2lsbCBiZSBpc3N1ZWQgYXQgKG9wdGlvbmFsKVxuICBwcmVzaWduZWRVcmwobWV0aG9kLCBidWNrZXROYW1lLCBvYmplY3ROYW1lLCBleHBpcmVzLCByZXFQYXJhbXMsIHJlcXVlc3REYXRlLCBjYikge1xuICAgIGlmICh0aGlzLmFub255bW91cykge1xuICAgICAgdGhyb3cgbmV3IGVycm9ycy5Bbm9ueW1vdXNSZXF1ZXN0RXJyb3IoJ1ByZXNpZ25lZCAnICsgbWV0aG9kICsgJyB1cmwgY2Fubm90IGJlIGdlbmVyYXRlZCBmb3IgYW5vbnltb3VzIHJlcXVlc3RzJylcbiAgICB9XG4gICAgaWYgKGlzRnVuY3Rpb24ocmVxdWVzdERhdGUpKSB7XG4gICAgICBjYiA9IHJlcXVlc3REYXRlXG4gICAgICByZXF1ZXN0RGF0ZSA9IG5ldyBEYXRlKClcbiAgICB9XG4gICAgaWYgKGlzRnVuY3Rpb24ocmVxUGFyYW1zKSkge1xuICAgICAgY2IgPSByZXFQYXJhbXNcbiAgICAgIHJlcVBhcmFtcyA9IHt9XG4gICAgICByZXF1ZXN0RGF0ZSA9IG5ldyBEYXRlKClcbiAgICB9XG4gICAgaWYgKGlzRnVuY3Rpb24oZXhwaXJlcykpIHtcbiAgICAgIGNiID0gZXhwaXJlc1xuICAgICAgcmVxUGFyYW1zID0ge31cbiAgICAgIGV4cGlyZXMgPSAyNCAqIDYwICogNjAgKiA3IC8vIDcgZGF5cyBpbiBzZWNvbmRzXG4gICAgICByZXF1ZXN0RGF0ZSA9IG5ldyBEYXRlKClcbiAgICB9XG4gICAgaWYgKCFpc051bWJlcihleHBpcmVzKSkge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignZXhwaXJlcyBzaG91bGQgYmUgb2YgdHlwZSBcIm51bWJlclwiJylcbiAgICB9XG4gICAgaWYgKCFpc09iamVjdChyZXFQYXJhbXMpKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdyZXFQYXJhbXMgc2hvdWxkIGJlIG9mIHR5cGUgXCJvYmplY3RcIicpXG4gICAgfVxuICAgIGlmICghaXNWYWxpZERhdGUocmVxdWVzdERhdGUpKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdyZXF1ZXN0RGF0ZSBzaG91bGQgYmUgb2YgdHlwZSBcIkRhdGVcIiBhbmQgdmFsaWQnKVxuICAgIH1cbiAgICBpZiAoIWlzRnVuY3Rpb24oY2IpKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdjYWxsYmFjayBzaG91bGQgYmUgb2YgdHlwZSBcImZ1bmN0aW9uXCInKVxuICAgIH1cbiAgICB2YXIgcXVlcnkgPSBxdWVyeXN0cmluZy5zdHJpbmdpZnkocmVxUGFyYW1zKVxuICAgIHRoaXMuZ2V0QnVja2V0UmVnaW9uKGJ1Y2tldE5hbWUsIChlLCByZWdpb24pID0+IHtcbiAgICAgIGlmIChlKSB7XG4gICAgICAgIHJldHVybiBjYihlKVxuICAgICAgfVxuICAgICAgLy8gVGhpcyBzdGF0ZW1lbnQgaXMgYWRkZWQgdG8gZW5zdXJlIHRoYXQgd2Ugc2VuZCBlcnJvciB0aHJvdWdoXG4gICAgICAvLyBjYWxsYmFjayBvbiBwcmVzaWduIGZhaWx1cmUuXG4gICAgICB2YXIgdXJsXG4gICAgICB2YXIgcmVxT3B0aW9ucyA9IHRoaXMuZ2V0UmVxdWVzdE9wdGlvbnMoeyBtZXRob2QsIHJlZ2lvbiwgYnVja2V0TmFtZSwgb2JqZWN0TmFtZSwgcXVlcnkgfSlcblxuICAgICAgdGhpcy5jaGVja0FuZFJlZnJlc2hDcmVkcygpXG4gICAgICB0cnkge1xuICAgICAgICB1cmwgPSBwcmVzaWduU2lnbmF0dXJlVjQoXG4gICAgICAgICAgcmVxT3B0aW9ucyxcbiAgICAgICAgICB0aGlzLmFjY2Vzc0tleSxcbiAgICAgICAgICB0aGlzLnNlY3JldEtleSxcbiAgICAgICAgICB0aGlzLnNlc3Npb25Ub2tlbixcbiAgICAgICAgICByZWdpb24sXG4gICAgICAgICAgcmVxdWVzdERhdGUsXG4gICAgICAgICAgZXhwaXJlcyxcbiAgICAgICAgKVxuICAgICAgfSBjYXRjaCAocGUpIHtcbiAgICAgICAgcmV0dXJuIGNiKHBlKVxuICAgICAgfVxuICAgICAgY2IobnVsbCwgdXJsKVxuICAgIH0pXG4gIH1cblxuICAvLyBHZW5lcmF0ZSBhIHByZXNpZ25lZCBVUkwgZm9yIEdFVFxuICAvL1xuICAvLyBfX0FyZ3VtZW50c19fXG4gIC8vICogYGJ1Y2tldE5hbWVgIF9zdHJpbmdfOiBuYW1lIG9mIHRoZSBidWNrZXRcbiAgLy8gKiBgb2JqZWN0TmFtZWAgX3N0cmluZ186IG5hbWUgb2YgdGhlIG9iamVjdFxuICAvLyAqIGBleHBpcnlgIF9udW1iZXJfOiBleHBpcnkgaW4gc2Vjb25kcyAob3B0aW9uYWwsIGRlZmF1bHQgNyBkYXlzKVxuICAvLyAqIGByZXNwSGVhZGVyc2AgX29iamVjdF86IHJlc3BvbnNlIGhlYWRlcnMgdG8gb3ZlcnJpZGUgb3IgcmVxdWVzdCBwYXJhbXMgZm9yIHF1ZXJ5IChvcHRpb25hbCkgZS5nIHt2ZXJzaW9uSWQ6XCIxMGZhOTk0Ni0zZjY0LTQxMzctYTU4Zi04ODgwNjVjMDczMmVcIn1cbiAgLy8gKiBgcmVxdWVzdERhdGVgIF9EYXRlXzogQSBkYXRlIG9iamVjdCwgdGhlIHVybCB3aWxsIGJlIGlzc3VlZCBhdCAob3B0aW9uYWwpXG4gIHByZXNpZ25lZEdldE9iamVjdChidWNrZXROYW1lLCBvYmplY3ROYW1lLCBleHBpcmVzLCByZXNwSGVhZGVycywgcmVxdWVzdERhdGUsIGNiKSB7XG4gICAgaWYgKCFpc1ZhbGlkQnVja2V0TmFtZShidWNrZXROYW1lKSkge1xuICAgICAgdGhyb3cgbmV3IGVycm9ycy5JbnZhbGlkQnVja2V0TmFtZUVycm9yKCdJbnZhbGlkIGJ1Y2tldCBuYW1lOiAnICsgYnVja2V0TmFtZSlcbiAgICB9XG4gICAgaWYgKCFpc1ZhbGlkT2JqZWN0TmFtZShvYmplY3ROYW1lKSkge1xuICAgICAgdGhyb3cgbmV3IGVycm9ycy5JbnZhbGlkT2JqZWN0TmFtZUVycm9yKGBJbnZhbGlkIG9iamVjdCBuYW1lOiAke29iamVjdE5hbWV9YClcbiAgICB9XG5cbiAgICBpZiAoaXNGdW5jdGlvbihyZXNwSGVhZGVycykpIHtcbiAgICAgIGNiID0gcmVzcEhlYWRlcnNcbiAgICAgIHJlc3BIZWFkZXJzID0ge31cbiAgICAgIHJlcXVlc3REYXRlID0gbmV3IERhdGUoKVxuICAgIH1cblxuICAgIHZhciB2YWxpZFJlc3BIZWFkZXJzID0gW1xuICAgICAgJ3Jlc3BvbnNlLWNvbnRlbnQtdHlwZScsXG4gICAgICAncmVzcG9uc2UtY29udGVudC1sYW5ndWFnZScsXG4gICAgICAncmVzcG9uc2UtZXhwaXJlcycsXG4gICAgICAncmVzcG9uc2UtY2FjaGUtY29udHJvbCcsXG4gICAgICAncmVzcG9uc2UtY29udGVudC1kaXNwb3NpdGlvbicsXG4gICAgICAncmVzcG9uc2UtY29udGVudC1lbmNvZGluZycsXG4gICAgXVxuICAgIHZhbGlkUmVzcEhlYWRlcnMuZm9yRWFjaCgoaGVhZGVyKSA9PiB7XG4gICAgICBpZiAocmVzcEhlYWRlcnMgIT09IHVuZGVmaW5lZCAmJiByZXNwSGVhZGVyc1toZWFkZXJdICE9PSB1bmRlZmluZWQgJiYgIWlzU3RyaW5nKHJlc3BIZWFkZXJzW2hlYWRlcl0pKSB7XG4gICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoYHJlc3BvbnNlIGhlYWRlciAke2hlYWRlcn0gc2hvdWxkIGJlIG9mIHR5cGUgXCJzdHJpbmdcImApXG4gICAgICB9XG4gICAgfSlcbiAgICByZXR1cm4gdGhpcy5wcmVzaWduZWRVcmwoJ0dFVCcsIGJ1Y2tldE5hbWUsIG9iamVjdE5hbWUsIGV4cGlyZXMsIHJlc3BIZWFkZXJzLCByZXF1ZXN0RGF0ZSwgY2IpXG4gIH1cblxuICAvLyBHZW5lcmF0ZSBhIHByZXNpZ25lZCBVUkwgZm9yIFBVVC4gVXNpbmcgdGhpcyBVUkwsIHRoZSBicm93c2VyIGNhbiB1cGxvYWQgdG8gUzMgb25seSB3aXRoIHRoZSBzcGVjaWZpZWQgb2JqZWN0IG5hbWUuXG4gIC8vXG4gIC8vIF9fQXJndW1lbnRzX19cbiAgLy8gKiBgYnVja2V0TmFtZWAgX3N0cmluZ186IG5hbWUgb2YgdGhlIGJ1Y2tldFxuICAvLyAqIGBvYmplY3ROYW1lYCBfc3RyaW5nXzogbmFtZSBvZiB0aGUgb2JqZWN0XG4gIC8vICogYGV4cGlyeWAgX251bWJlcl86IGV4cGlyeSBpbiBzZWNvbmRzIChvcHRpb25hbCwgZGVmYXVsdCA3IGRheXMpXG4gIHByZXNpZ25lZFB1dE9iamVjdChidWNrZXROYW1lLCBvYmplY3ROYW1lLCBleHBpcmVzLCBjYikge1xuICAgIGlmICghaXNWYWxpZEJ1Y2tldE5hbWUoYnVja2V0TmFtZSkpIHtcbiAgICAgIHRocm93IG5ldyBlcnJvcnMuSW52YWxpZEJ1Y2tldE5hbWVFcnJvcihgSW52YWxpZCBidWNrZXQgbmFtZTogJHtidWNrZXROYW1lfWApXG4gICAgfVxuICAgIGlmICghaXNWYWxpZE9iamVjdE5hbWUob2JqZWN0TmFtZSkpIHtcbiAgICAgIHRocm93IG5ldyBlcnJvcnMuSW52YWxpZE9iamVjdE5hbWVFcnJvcihgSW52YWxpZCBvYmplY3QgbmFtZTogJHtvYmplY3ROYW1lfWApXG4gICAgfVxuICAgIHJldHVybiB0aGlzLnByZXNpZ25lZFVybCgnUFVUJywgYnVja2V0TmFtZSwgb2JqZWN0TmFtZSwgZXhwaXJlcywgY2IpXG4gIH1cblxuICAvLyByZXR1cm4gUG9zdFBvbGljeSBvYmplY3RcbiAgbmV3UG9zdFBvbGljeSgpIHtcbiAgICByZXR1cm4gbmV3IFBvc3RQb2xpY3koKVxuICB9XG5cbiAgLy8gcHJlc2lnbmVkUG9zdFBvbGljeSBjYW4gYmUgdXNlZCBpbiBzaXR1YXRpb25zIHdoZXJlIHdlIHdhbnQgbW9yZSBjb250cm9sIG9uIHRoZSB1cGxvYWQgdGhhbiB3aGF0XG4gIC8vIHByZXNpZ25lZFB1dE9iamVjdCgpIHByb3ZpZGVzLiBpLmUgVXNpbmcgcHJlc2lnbmVkUG9zdFBvbGljeSB3ZSB3aWxsIGJlIGFibGUgdG8gcHV0IHBvbGljeSByZXN0cmljdGlvbnNcbiAgLy8gb24gdGhlIG9iamVjdCdzIGBuYW1lYCBgYnVja2V0YCBgZXhwaXJ5YCBgQ29udGVudC1UeXBlYCBgQ29udGVudC1EaXNwb3NpdGlvbmAgYG1ldGFEYXRhYFxuICBwcmVzaWduZWRQb3N0UG9saWN5KHBvc3RQb2xpY3ksIGNiKSB7XG4gICAgaWYgKHRoaXMuYW5vbnltb3VzKSB7XG4gICAgICB0aHJvdyBuZXcgZXJyb3JzLkFub255bW91c1JlcXVlc3RFcnJvcignUHJlc2lnbmVkIFBPU1QgcG9saWN5IGNhbm5vdCBiZSBnZW5lcmF0ZWQgZm9yIGFub255bW91cyByZXF1ZXN0cycpXG4gICAgfVxuICAgIGlmICghaXNPYmplY3QocG9zdFBvbGljeSkpIHtcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ3Bvc3RQb2xpY3kgc2hvdWxkIGJlIG9mIHR5cGUgXCJvYmplY3RcIicpXG4gICAgfVxuICAgIGlmICghaXNGdW5jdGlvbihjYikpIHtcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ2NiIHNob3VsZCBiZSBvZiB0eXBlIFwiZnVuY3Rpb25cIicpXG4gICAgfVxuICAgIHRoaXMuZ2V0QnVja2V0UmVnaW9uKHBvc3RQb2xpY3kuZm9ybURhdGEuYnVja2V0LCAoZSwgcmVnaW9uKSA9PiB7XG4gICAgICBpZiAoZSkge1xuICAgICAgICByZXR1cm4gY2IoZSlcbiAgICAgIH1cbiAgICAgIHZhciBkYXRlID0gbmV3IERhdGUoKVxuICAgICAgdmFyIGRhdGVTdHIgPSBtYWtlRGF0ZUxvbmcoZGF0ZSlcblxuICAgICAgdGhpcy5jaGVja0FuZFJlZnJlc2hDcmVkcygpXG5cbiAgICAgIGlmICghcG9zdFBvbGljeS5wb2xpY3kuZXhwaXJhdGlvbikge1xuICAgICAgICAvLyAnZXhwaXJhdGlvbicgaXMgbWFuZGF0b3J5IGZpZWxkIGZvciBTMy5cbiAgICAgICAgLy8gU2V0IGRlZmF1bHQgZXhwaXJhdGlvbiBkYXRlIG9mIDcgZGF5cy5cbiAgICAgICAgdmFyIGV4cGlyZXMgPSBuZXcgRGF0ZSgpXG4gICAgICAgIGV4cGlyZXMuc2V0U2Vjb25kcygyNCAqIDYwICogNjAgKiA3KVxuICAgICAgICBwb3N0UG9saWN5LnNldEV4cGlyZXMoZXhwaXJlcylcbiAgICAgIH1cblxuICAgICAgcG9zdFBvbGljeS5wb2xpY3kuY29uZGl0aW9ucy5wdXNoKFsnZXEnLCAnJHgtYW16LWRhdGUnLCBkYXRlU3RyXSlcbiAgICAgIHBvc3RQb2xpY3kuZm9ybURhdGFbJ3gtYW16LWRhdGUnXSA9IGRhdGVTdHJcblxuICAgICAgcG9zdFBvbGljeS5wb2xpY3kuY29uZGl0aW9ucy5wdXNoKFsnZXEnLCAnJHgtYW16LWFsZ29yaXRobScsICdBV1M0LUhNQUMtU0hBMjU2J10pXG4gICAgICBwb3N0UG9saWN5LmZvcm1EYXRhWyd4LWFtei1hbGdvcml0aG0nXSA9ICdBV1M0LUhNQUMtU0hBMjU2J1xuXG4gICAgICBwb3N0UG9saWN5LnBvbGljeS5jb25kaXRpb25zLnB1c2goWydlcScsICckeC1hbXotY3JlZGVudGlhbCcsIHRoaXMuYWNjZXNzS2V5ICsgJy8nICsgZ2V0U2NvcGUocmVnaW9uLCBkYXRlKV0pXG4gICAgICBwb3N0UG9saWN5LmZvcm1EYXRhWyd4LWFtei1jcmVkZW50aWFsJ10gPSB0aGlzLmFjY2Vzc0tleSArICcvJyArIGdldFNjb3BlKHJlZ2lvbiwgZGF0ZSlcblxuICAgICAgaWYgKHRoaXMuc2Vzc2lvblRva2VuKSB7XG4gICAgICAgIHBvc3RQb2xpY3kucG9saWN5LmNvbmRpdGlvbnMucHVzaChbJ2VxJywgJyR4LWFtei1zZWN1cml0eS10b2tlbicsIHRoaXMuc2Vzc2lvblRva2VuXSlcbiAgICAgICAgcG9zdFBvbGljeS5mb3JtRGF0YVsneC1hbXotc2VjdXJpdHktdG9rZW4nXSA9IHRoaXMuc2Vzc2lvblRva2VuXG4gICAgICB9XG5cbiAgICAgIHZhciBwb2xpY3lCYXNlNjQgPSBCdWZmZXIuZnJvbShKU09OLnN0cmluZ2lmeShwb3N0UG9saWN5LnBvbGljeSkpLnRvU3RyaW5nKCdiYXNlNjQnKVxuXG4gICAgICBwb3N0UG9saWN5LmZvcm1EYXRhLnBvbGljeSA9IHBvbGljeUJhc2U2NFxuXG4gICAgICB2YXIgc2lnbmF0dXJlID0gcG9zdFByZXNpZ25TaWduYXR1cmVWNChyZWdpb24sIGRhdGUsIHRoaXMuc2VjcmV0S2V5LCBwb2xpY3lCYXNlNjQpXG5cbiAgICAgIHBvc3RQb2xpY3kuZm9ybURhdGFbJ3gtYW16LXNpZ25hdHVyZSddID0gc2lnbmF0dXJlXG4gICAgICB2YXIgb3B0cyA9IHt9XG4gICAgICBvcHRzLnJlZ2lvbiA9IHJlZ2lvblxuICAgICAgb3B0cy5idWNrZXROYW1lID0gcG9zdFBvbGljeS5mb3JtRGF0YS5idWNrZXRcbiAgICAgIHZhciByZXFPcHRpb25zID0gdGhpcy5nZXRSZXF1ZXN0T3B0aW9ucyhvcHRzKVxuICAgICAgdmFyIHBvcnRTdHIgPSB0aGlzLnBvcnQgPT0gODAgfHwgdGhpcy5wb3J0ID09PSA0NDMgPyAnJyA6IGA6JHt0aGlzLnBvcnQudG9TdHJpbmcoKX1gXG4gICAgICB2YXIgdXJsU3RyID0gYCR7cmVxT3B0aW9ucy5wcm90b2NvbH0vLyR7cmVxT3B0aW9ucy5ob3N0fSR7cG9ydFN0cn0ke3JlcU9wdGlvbnMucGF0aH1gXG4gICAgICBjYihudWxsLCB7IHBvc3RVUkw6IHVybFN0ciwgZm9ybURhdGE6IHBvc3RQb2xpY3kuZm9ybURhdGEgfSlcbiAgICB9KVxuICB9XG5cbiAgLy8gQ2FsbHMgaW1wbGVtZW50ZWQgYmVsb3cgYXJlIHJlbGF0ZWQgdG8gbXVsdGlwYXJ0LlxuXG4gIC8vIEluaXRpYXRlIGEgbmV3IG11bHRpcGFydCB1cGxvYWQuXG4gIGluaXRpYXRlTmV3TXVsdGlwYXJ0VXBsb2FkKGJ1Y2tldE5hbWUsIG9iamVjdE5hbWUsIG1ldGFEYXRhLCBjYikge1xuICAgIGlmICghaXNWYWxpZEJ1Y2tldE5hbWUoYnVja2V0TmFtZSkpIHtcbiAgICAgIHRocm93IG5ldyBlcnJvcnMuSW52YWxpZEJ1Y2tldE5hbWVFcnJvcignSW52YWxpZCBidWNrZXQgbmFtZTogJyArIGJ1Y2tldE5hbWUpXG4gICAgfVxuICAgIGlmICghaXNWYWxpZE9iamVjdE5hbWUob2JqZWN0TmFtZSkpIHtcbiAgICAgIHRocm93IG5ldyBlcnJvcnMuSW52YWxpZE9iamVjdE5hbWVFcnJvcihgSW52YWxpZCBvYmplY3QgbmFtZTogJHtvYmplY3ROYW1lfWApXG4gICAgfVxuICAgIGlmICghaXNPYmplY3QobWV0YURhdGEpKSB7XG4gICAgICB0aHJvdyBuZXcgZXJyb3JzLkludmFsaWRPYmplY3ROYW1lRXJyb3IoJ2NvbnRlbnRUeXBlIHNob3VsZCBiZSBvZiB0eXBlIFwib2JqZWN0XCInKVxuICAgIH1cbiAgICB2YXIgbWV0aG9kID0gJ1BPU1QnXG4gICAgbGV0IGhlYWRlcnMgPSBPYmplY3QuYXNzaWduKHt9LCBtZXRhRGF0YSlcbiAgICB2YXIgcXVlcnkgPSAndXBsb2FkcydcbiAgICB0aGlzLm1ha2VSZXF1ZXN0KHsgbWV0aG9kLCBidWNrZXROYW1lLCBvYmplY3ROYW1lLCBxdWVyeSwgaGVhZGVycyB9LCAnJywgWzIwMF0sICcnLCB0cnVlLCAoZSwgcmVzcG9uc2UpID0+IHtcbiAgICAgIGlmIChlKSB7XG4gICAgICAgIHJldHVybiBjYihlKVxuICAgICAgfVxuICAgICAgdmFyIHRyYW5zZm9ybWVyID0gdHJhbnNmb3JtZXJzLmdldEluaXRpYXRlTXVsdGlwYXJ0VHJhbnNmb3JtZXIoKVxuICAgICAgcGlwZXNldHVwKHJlc3BvbnNlLCB0cmFuc2Zvcm1lcilcbiAgICAgICAgLm9uKCdlcnJvcicsIChlKSA9PiBjYihlKSlcbiAgICAgICAgLm9uKCdkYXRhJywgKHVwbG9hZElkKSA9PiBjYihudWxsLCB1cGxvYWRJZCkpXG4gICAgfSlcbiAgfVxuXG4gIC8vIENvbXBsZXRlIHRoZSBtdWx0aXBhcnQgdXBsb2FkLiBBZnRlciBhbGwgdGhlIHBhcnRzIGFyZSB1cGxvYWRlZCBpc3N1aW5nXG4gIC8vIHRoaXMgY2FsbCB3aWxsIGFnZ3JlZ2F0ZSB0aGUgcGFydHMgb24gdGhlIHNlcnZlciBpbnRvIGEgc2luZ2xlIG9iamVjdC5cbiAgY29tcGxldGVNdWx0aXBhcnRVcGxvYWQoYnVja2V0TmFtZSwgb2JqZWN0TmFtZSwgdXBsb2FkSWQsIGV0YWdzLCBjYikge1xuICAgIGlmICghaXNWYWxpZEJ1Y2tldE5hbWUoYnVja2V0TmFtZSkpIHtcbiAgICAgIHRocm93IG5ldyBlcnJvcnMuSW52YWxpZEJ1Y2tldE5hbWVFcnJvcignSW52YWxpZCBidWNrZXQgbmFtZTogJyArIGJ1Y2tldE5hbWUpXG4gICAgfVxuICAgIGlmICghaXNWYWxpZE9iamVjdE5hbWUob2JqZWN0TmFtZSkpIHtcbiAgICAgIHRocm93IG5ldyBlcnJvcnMuSW52YWxpZE9iamVjdE5hbWVFcnJvcihgSW52YWxpZCBvYmplY3QgbmFtZTogJHtvYmplY3ROYW1lfWApXG4gICAgfVxuICAgIGlmICghaXNTdHJpbmcodXBsb2FkSWQpKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCd1cGxvYWRJZCBzaG91bGQgYmUgb2YgdHlwZSBcInN0cmluZ1wiJylcbiAgICB9XG4gICAgaWYgKCFpc09iamVjdChldGFncykpIHtcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ2V0YWdzIHNob3VsZCBiZSBvZiB0eXBlIFwiQXJyYXlcIicpXG4gICAgfVxuICAgIGlmICghaXNGdW5jdGlvbihjYikpIHtcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ2NiIHNob3VsZCBiZSBvZiB0eXBlIFwiZnVuY3Rpb25cIicpXG4gICAgfVxuXG4gICAgaWYgKCF1cGxvYWRJZCkge1xuICAgICAgdGhyb3cgbmV3IGVycm9ycy5JbnZhbGlkQXJndW1lbnRFcnJvcigndXBsb2FkSWQgY2Fubm90IGJlIGVtcHR5JylcbiAgICB9XG5cbiAgICB2YXIgbWV0aG9kID0gJ1BPU1QnXG4gICAgdmFyIHF1ZXJ5ID0gYHVwbG9hZElkPSR7dXJpRXNjYXBlKHVwbG9hZElkKX1gXG5cbiAgICB2YXIgcGFydHMgPSBbXVxuXG4gICAgZXRhZ3MuZm9yRWFjaCgoZWxlbWVudCkgPT4ge1xuICAgICAgcGFydHMucHVzaCh7XG4gICAgICAgIFBhcnQ6IFtcbiAgICAgICAgICB7XG4gICAgICAgICAgICBQYXJ0TnVtYmVyOiBlbGVtZW50LnBhcnQsXG4gICAgICAgICAgfSxcbiAgICAgICAgICB7XG4gICAgICAgICAgICBFVGFnOiBlbGVtZW50LmV0YWcsXG4gICAgICAgICAgfSxcbiAgICAgICAgXSxcbiAgICAgIH0pXG4gICAgfSlcblxuICAgIHZhciBwYXlsb2FkT2JqZWN0ID0geyBDb21wbGV0ZU11bHRpcGFydFVwbG9hZDogcGFydHMgfVxuICAgIHZhciBwYXlsb2FkID0gWG1sKHBheWxvYWRPYmplY3QpXG5cbiAgICB0aGlzLm1ha2VSZXF1ZXN0KHsgbWV0aG9kLCBidWNrZXROYW1lLCBvYmplY3ROYW1lLCBxdWVyeSB9LCBwYXlsb2FkLCBbMjAwXSwgJycsIHRydWUsIChlLCByZXNwb25zZSkgPT4ge1xuICAgICAgaWYgKGUpIHtcbiAgICAgICAgcmV0dXJuIGNiKGUpXG4gICAgICB9XG4gICAgICB2YXIgdHJhbnNmb3JtZXIgPSB0cmFuc2Zvcm1lcnMuZ2V0Q29tcGxldGVNdWx0aXBhcnRUcmFuc2Zvcm1lcigpXG4gICAgICBwaXBlc2V0dXAocmVzcG9uc2UsIHRyYW5zZm9ybWVyKVxuICAgICAgICAub24oJ2Vycm9yJywgKGUpID0+IGNiKGUpKVxuICAgICAgICAub24oJ2RhdGEnLCAocmVzdWx0KSA9PiB7XG4gICAgICAgICAgaWYgKHJlc3VsdC5lcnJDb2RlKSB7XG4gICAgICAgICAgICAvLyBNdWx0aXBhcnQgQ29tcGxldGUgQVBJIHJldHVybnMgYW4gZXJyb3IgWE1MIGFmdGVyIGEgMjAwIGh0dHAgc3RhdHVzXG4gICAgICAgICAgICBjYihuZXcgZXJyb3JzLlMzRXJyb3IocmVzdWx0LmVyck1lc3NhZ2UpKVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBjb25zdCBjb21wbGV0ZU11bHRpcGFydFJlc3VsdCA9IHtcbiAgICAgICAgICAgICAgZXRhZzogcmVzdWx0LmV0YWcsXG4gICAgICAgICAgICAgIHZlcnNpb25JZDogZ2V0VmVyc2lvbklkKHJlc3BvbnNlLmhlYWRlcnMpLFxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY2IobnVsbCwgY29tcGxldGVNdWx0aXBhcnRSZXN1bHQpXG4gICAgICAgICAgfVxuICAgICAgICB9KVxuICAgIH0pXG4gIH1cblxuICAvLyBHZXQgcGFydC1pbmZvIG9mIGFsbCBwYXJ0cyBvZiBhbiBpbmNvbXBsZXRlIHVwbG9hZCBzcGVjaWZpZWQgYnkgdXBsb2FkSWQuXG4gIGxpc3RQYXJ0cyhidWNrZXROYW1lLCBvYmplY3ROYW1lLCB1cGxvYWRJZCwgY2IpIHtcbiAgICBpZiAoIWlzVmFsaWRCdWNrZXROYW1lKGJ1Y2tldE5hbWUpKSB7XG4gICAgICB0aHJvdyBuZXcgZXJyb3JzLkludmFsaWRCdWNrZXROYW1lRXJyb3IoJ0ludmFsaWQgYnVja2V0IG5hbWU6ICcgKyBidWNrZXROYW1lKVxuICAgIH1cbiAgICBpZiAoIWlzVmFsaWRPYmplY3ROYW1lKG9iamVjdE5hbWUpKSB7XG4gICAgICB0aHJvdyBuZXcgZXJyb3JzLkludmFsaWRPYmplY3ROYW1lRXJyb3IoYEludmFsaWQgb2JqZWN0IG5hbWU6ICR7b2JqZWN0TmFtZX1gKVxuICAgIH1cbiAgICBpZiAoIWlzU3RyaW5nKHVwbG9hZElkKSkge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcigndXBsb2FkSWQgc2hvdWxkIGJlIG9mIHR5cGUgXCJzdHJpbmdcIicpXG4gICAgfVxuICAgIGlmICghdXBsb2FkSWQpIHtcbiAgICAgIHRocm93IG5ldyBlcnJvcnMuSW52YWxpZEFyZ3VtZW50RXJyb3IoJ3VwbG9hZElkIGNhbm5vdCBiZSBlbXB0eScpXG4gICAgfVxuICAgIHZhciBwYXJ0cyA9IFtdXG4gICAgdmFyIGxpc3ROZXh0ID0gKG1hcmtlcikgPT4ge1xuICAgICAgdGhpcy5saXN0UGFydHNRdWVyeShidWNrZXROYW1lLCBvYmplY3ROYW1lLCB1cGxvYWRJZCwgbWFya2VyLCAoZSwgcmVzdWx0KSA9PiB7XG4gICAgICAgIGlmIChlKSB7XG4gICAgICAgICAgY2IoZSlcbiAgICAgICAgICByZXR1cm5cbiAgICAgICAgfVxuICAgICAgICBwYXJ0cyA9IHBhcnRzLmNvbmNhdChyZXN1bHQucGFydHMpXG4gICAgICAgIGlmIChyZXN1bHQuaXNUcnVuY2F0ZWQpIHtcbiAgICAgICAgICBsaXN0TmV4dChyZXN1bHQubWFya2VyKVxuICAgICAgICAgIHJldHVyblxuICAgICAgICB9XG4gICAgICAgIGNiKG51bGwsIHBhcnRzKVxuICAgICAgfSlcbiAgICB9XG4gICAgbGlzdE5leHQoMClcbiAgfVxuXG4gIC8vIENhbGxlZCBieSBsaXN0UGFydHMgdG8gZmV0Y2ggYSBiYXRjaCBvZiBwYXJ0LWluZm9cbiAgbGlzdFBhcnRzUXVlcnkoYnVja2V0TmFtZSwgb2JqZWN0TmFtZSwgdXBsb2FkSWQsIG1hcmtlciwgY2IpIHtcbiAgICBpZiAoIWlzVmFsaWRCdWNrZXROYW1lKGJ1Y2tldE5hbWUpKSB7XG4gICAgICB0aHJvdyBuZXcgZXJyb3JzLkludmFsaWRCdWNrZXROYW1lRXJyb3IoJ0ludmFsaWQgYnVja2V0IG5hbWU6ICcgKyBidWNrZXROYW1lKVxuICAgIH1cbiAgICBpZiAoIWlzVmFsaWRPYmplY3ROYW1lKG9iamVjdE5hbWUpKSB7XG4gICAgICB0aHJvdyBuZXcgZXJyb3JzLkludmFsaWRPYmplY3ROYW1lRXJyb3IoYEludmFsaWQgb2JqZWN0IG5hbWU6ICR7b2JqZWN0TmFtZX1gKVxuICAgIH1cbiAgICBpZiAoIWlzU3RyaW5nKHVwbG9hZElkKSkge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcigndXBsb2FkSWQgc2hvdWxkIGJlIG9mIHR5cGUgXCJzdHJpbmdcIicpXG4gICAgfVxuICAgIGlmICghaXNOdW1iZXIobWFya2VyKSkge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignbWFya2VyIHNob3VsZCBiZSBvZiB0eXBlIFwibnVtYmVyXCInKVxuICAgIH1cbiAgICBpZiAoIWlzRnVuY3Rpb24oY2IpKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdjYWxsYmFjayBzaG91bGQgYmUgb2YgdHlwZSBcImZ1bmN0aW9uXCInKVxuICAgIH1cbiAgICBpZiAoIXVwbG9hZElkKSB7XG4gICAgICB0aHJvdyBuZXcgZXJyb3JzLkludmFsaWRBcmd1bWVudEVycm9yKCd1cGxvYWRJZCBjYW5ub3QgYmUgZW1wdHknKVxuICAgIH1cbiAgICB2YXIgcXVlcnkgPSAnJ1xuICAgIGlmIChtYXJrZXIgJiYgbWFya2VyICE9PSAwKSB7XG4gICAgICBxdWVyeSArPSBgcGFydC1udW1iZXItbWFya2VyPSR7bWFya2VyfSZgXG4gICAgfVxuICAgIHF1ZXJ5ICs9IGB1cGxvYWRJZD0ke3VyaUVzY2FwZSh1cGxvYWRJZCl9YFxuXG4gICAgdmFyIG1ldGhvZCA9ICdHRVQnXG4gICAgdGhpcy5tYWtlUmVxdWVzdCh7IG1ldGhvZCwgYnVja2V0TmFtZSwgb2JqZWN0TmFtZSwgcXVlcnkgfSwgJycsIFsyMDBdLCAnJywgdHJ1ZSwgKGUsIHJlc3BvbnNlKSA9PiB7XG4gICAgICBpZiAoZSkge1xuICAgICAgICByZXR1cm4gY2IoZSlcbiAgICAgIH1cbiAgICAgIHZhciB0cmFuc2Zvcm1lciA9IHRyYW5zZm9ybWVycy5nZXRMaXN0UGFydHNUcmFuc2Zvcm1lcigpXG4gICAgICBwaXBlc2V0dXAocmVzcG9uc2UsIHRyYW5zZm9ybWVyKVxuICAgICAgICAub24oJ2Vycm9yJywgKGUpID0+IGNiKGUpKVxuICAgICAgICAub24oJ2RhdGEnLCAoZGF0YSkgPT4gY2IobnVsbCwgZGF0YSkpXG4gICAgfSlcbiAgfVxuXG4gIC8vIENhbGxlZCBieSBsaXN0SW5jb21wbGV0ZVVwbG9hZHMgdG8gZmV0Y2ggYSBiYXRjaCBvZiBpbmNvbXBsZXRlIHVwbG9hZHMuXG4gIGxpc3RJbmNvbXBsZXRlVXBsb2Fkc1F1ZXJ5KGJ1Y2tldE5hbWUsIHByZWZpeCwga2V5TWFya2VyLCB1cGxvYWRJZE1hcmtlciwgZGVsaW1pdGVyKSB7XG4gICAgaWYgKCFpc1ZhbGlkQnVja2V0TmFtZShidWNrZXROYW1lKSkge1xuICAgICAgdGhyb3cgbmV3IGVycm9ycy5JbnZhbGlkQnVja2V0TmFtZUVycm9yKCdJbnZhbGlkIGJ1Y2tldCBuYW1lOiAnICsgYnVja2V0TmFtZSlcbiAgICB9XG4gICAgaWYgKCFpc1N0cmluZyhwcmVmaXgpKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdwcmVmaXggc2hvdWxkIGJlIG9mIHR5cGUgXCJzdHJpbmdcIicpXG4gICAgfVxuICAgIGlmICghaXNTdHJpbmcoa2V5TWFya2VyKSkge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcigna2V5TWFya2VyIHNob3VsZCBiZSBvZiB0eXBlIFwic3RyaW5nXCInKVxuICAgIH1cbiAgICBpZiAoIWlzU3RyaW5nKHVwbG9hZElkTWFya2VyKSkge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcigndXBsb2FkSWRNYXJrZXIgc2hvdWxkIGJlIG9mIHR5cGUgXCJzdHJpbmdcIicpXG4gICAgfVxuICAgIGlmICghaXNTdHJpbmcoZGVsaW1pdGVyKSkge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignZGVsaW1pdGVyIHNob3VsZCBiZSBvZiB0eXBlIFwic3RyaW5nXCInKVxuICAgIH1cbiAgICB2YXIgcXVlcmllcyA9IFtdXG4gICAgcXVlcmllcy5wdXNoKGBwcmVmaXg9JHt1cmlFc2NhcGUocHJlZml4KX1gKVxuICAgIHF1ZXJpZXMucHVzaChgZGVsaW1pdGVyPSR7dXJpRXNjYXBlKGRlbGltaXRlcil9YClcblxuICAgIGlmIChrZXlNYXJrZXIpIHtcbiAgICAgIGtleU1hcmtlciA9IHVyaUVzY2FwZShrZXlNYXJrZXIpXG4gICAgICBxdWVyaWVzLnB1c2goYGtleS1tYXJrZXI9JHtrZXlNYXJrZXJ9YClcbiAgICB9XG4gICAgaWYgKHVwbG9hZElkTWFya2VyKSB7XG4gICAgICBxdWVyaWVzLnB1c2goYHVwbG9hZC1pZC1tYXJrZXI9JHt1cGxvYWRJZE1hcmtlcn1gKVxuICAgIH1cblxuICAgIHZhciBtYXhVcGxvYWRzID0gMTAwMFxuICAgIHF1ZXJpZXMucHVzaChgbWF4LXVwbG9hZHM9JHttYXhVcGxvYWRzfWApXG4gICAgcXVlcmllcy5zb3J0KClcbiAgICBxdWVyaWVzLnVuc2hpZnQoJ3VwbG9hZHMnKVxuICAgIHZhciBxdWVyeSA9ICcnXG4gICAgaWYgKHF1ZXJpZXMubGVuZ3RoID4gMCkge1xuICAgICAgcXVlcnkgPSBgJHtxdWVyaWVzLmpvaW4oJyYnKX1gXG4gICAgfVxuICAgIHZhciBtZXRob2QgPSAnR0VUJ1xuICAgIHZhciB0cmFuc2Zvcm1lciA9IHRyYW5zZm9ybWVycy5nZXRMaXN0TXVsdGlwYXJ0VHJhbnNmb3JtZXIoKVxuICAgIHRoaXMubWFrZVJlcXVlc3QoeyBtZXRob2QsIGJ1Y2tldE5hbWUsIHF1ZXJ5IH0sICcnLCBbMjAwXSwgJycsIHRydWUsIChlLCByZXNwb25zZSkgPT4ge1xuICAgICAgaWYgKGUpIHtcbiAgICAgICAgcmV0dXJuIHRyYW5zZm9ybWVyLmVtaXQoJ2Vycm9yJywgZSlcbiAgICAgIH1cbiAgICAgIHBpcGVzZXR1cChyZXNwb25zZSwgdHJhbnNmb3JtZXIpXG4gICAgfSlcbiAgICByZXR1cm4gdHJhbnNmb3JtZXJcbiAgfVxuXG4gIC8vIEZpbmQgdXBsb2FkSWQgb2YgYW4gaW5jb21wbGV0ZSB1cGxvYWQuXG4gIGZpbmRVcGxvYWRJZChidWNrZXROYW1lLCBvYmplY3ROYW1lLCBjYikge1xuICAgIGlmICghaXNWYWxpZEJ1Y2tldE5hbWUoYnVja2V0TmFtZSkpIHtcbiAgICAgIHRocm93IG5ldyBlcnJvcnMuSW52YWxpZEJ1Y2tldE5hbWVFcnJvcignSW52YWxpZCBidWNrZXQgbmFtZTogJyArIGJ1Y2tldE5hbWUpXG4gICAgfVxuICAgIGlmICghaXNWYWxpZE9iamVjdE5hbWUob2JqZWN0TmFtZSkpIHtcbiAgICAgIHRocm93IG5ldyBlcnJvcnMuSW52YWxpZE9iamVjdE5hbWVFcnJvcihgSW52YWxpZCBvYmplY3QgbmFtZTogJHtvYmplY3ROYW1lfWApXG4gICAgfVxuICAgIGlmICghaXNGdW5jdGlvbihjYikpIHtcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ2NiIHNob3VsZCBiZSBvZiB0eXBlIFwiZnVuY3Rpb25cIicpXG4gICAgfVxuICAgIHZhciBsYXRlc3RVcGxvYWRcbiAgICB2YXIgbGlzdE5leHQgPSAoa2V5TWFya2VyLCB1cGxvYWRJZE1hcmtlcikgPT4ge1xuICAgICAgdGhpcy5saXN0SW5jb21wbGV0ZVVwbG9hZHNRdWVyeShidWNrZXROYW1lLCBvYmplY3ROYW1lLCBrZXlNYXJrZXIsIHVwbG9hZElkTWFya2VyLCAnJylcbiAgICAgICAgLm9uKCdlcnJvcicsIChlKSA9PiBjYihlKSlcbiAgICAgICAgLm9uKCdkYXRhJywgKHJlc3VsdCkgPT4ge1xuICAgICAgICAgIHJlc3VsdC51cGxvYWRzLmZvckVhY2goKHVwbG9hZCkgPT4ge1xuICAgICAgICAgICAgaWYgKHVwbG9hZC5rZXkgPT09IG9iamVjdE5hbWUpIHtcbiAgICAgICAgICAgICAgaWYgKCFsYXRlc3RVcGxvYWQgfHwgdXBsb2FkLmluaXRpYXRlZC5nZXRUaW1lKCkgPiBsYXRlc3RVcGxvYWQuaW5pdGlhdGVkLmdldFRpbWUoKSkge1xuICAgICAgICAgICAgICAgIGxhdGVzdFVwbG9hZCA9IHVwbG9hZFxuICAgICAgICAgICAgICAgIHJldHVyblxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSlcbiAgICAgICAgICBpZiAocmVzdWx0LmlzVHJ1bmNhdGVkKSB7XG4gICAgICAgICAgICBsaXN0TmV4dChyZXN1bHQubmV4dEtleU1hcmtlciwgcmVzdWx0Lm5leHRVcGxvYWRJZE1hcmtlcilcbiAgICAgICAgICAgIHJldHVyblxuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAobGF0ZXN0VXBsb2FkKSB7XG4gICAgICAgICAgICByZXR1cm4gY2IobnVsbCwgbGF0ZXN0VXBsb2FkLnVwbG9hZElkKVxuICAgICAgICAgIH1cbiAgICAgICAgICBjYihudWxsLCB1bmRlZmluZWQpXG4gICAgICAgIH0pXG4gICAgfVxuICAgIGxpc3ROZXh0KCcnLCAnJylcbiAgfVxuXG4gIC8vIFJldHVybnMgYSBmdW5jdGlvbiB0aGF0IGNhbiBiZSB1c2VkIGZvciB1cGxvYWRpbmcgb2JqZWN0cy5cbiAgLy8gSWYgbXVsdGlwYXJ0ID09PSB0cnVlLCBpdCByZXR1cm5zIGZ1bmN0aW9uIHRoYXQgaXMgdXNlZCB0byB1cGxvYWRcbiAgLy8gYSBwYXJ0IG9mIHRoZSBtdWx0aXBhcnQuXG4gIGdldFVwbG9hZGVyKGJ1Y2tldE5hbWUsIG9iamVjdE5hbWUsIG1ldGFEYXRhLCBtdWx0aXBhcnQpIHtcbiAgICBpZiAoIWlzVmFsaWRCdWNrZXROYW1lKGJ1Y2tldE5hbWUpKSB7XG4gICAgICB0aHJvdyBuZXcgZXJyb3JzLkludmFsaWRCdWNrZXROYW1lRXJyb3IoJ0ludmFsaWQgYnVja2V0IG5hbWU6ICcgKyBidWNrZXROYW1lKVxuICAgIH1cbiAgICBpZiAoIWlzVmFsaWRPYmplY3ROYW1lKG9iamVjdE5hbWUpKSB7XG4gICAgICB0aHJvdyBuZXcgZXJyb3JzLkludmFsaWRPYmplY3ROYW1lRXJyb3IoYEludmFsaWQgb2JqZWN0IG5hbWU6ICR7b2JqZWN0TmFtZX1gKVxuICAgIH1cbiAgICBpZiAoIWlzQm9vbGVhbihtdWx0aXBhcnQpKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdtdWx0aXBhcnQgc2hvdWxkIGJlIG9mIHR5cGUgXCJib29sZWFuXCInKVxuICAgIH1cbiAgICBpZiAoIWlzT2JqZWN0KG1ldGFEYXRhKSkge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignbWV0YWRhdGEgc2hvdWxkIGJlIG9mIHR5cGUgXCJvYmplY3RcIicpXG4gICAgfVxuXG4gICAgdmFyIHZhbGlkYXRlID0gKHN0cmVhbSwgbGVuZ3RoLCBzaGEyNTZzdW0sIG1kNXN1bSwgY2IpID0+IHtcbiAgICAgIGlmICghaXNSZWFkYWJsZVN0cmVhbShzdHJlYW0pKSB7XG4gICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ3N0cmVhbSBzaG91bGQgYmUgb2YgdHlwZSBcIlN0cmVhbVwiJylcbiAgICAgIH1cbiAgICAgIGlmICghaXNOdW1iZXIobGVuZ3RoKSkge1xuICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdsZW5ndGggc2hvdWxkIGJlIG9mIHR5cGUgXCJudW1iZXJcIicpXG4gICAgICB9XG4gICAgICBpZiAoIWlzU3RyaW5nKHNoYTI1NnN1bSkpIHtcbiAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignc2hhMjU2c3VtIHNob3VsZCBiZSBvZiB0eXBlIFwic3RyaW5nXCInKVxuICAgICAgfVxuICAgICAgaWYgKCFpc1N0cmluZyhtZDVzdW0pKSB7XG4gICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ21kNXN1bSBzaG91bGQgYmUgb2YgdHlwZSBcInN0cmluZ1wiJylcbiAgICAgIH1cbiAgICAgIGlmICghaXNGdW5jdGlvbihjYikpIHtcbiAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignY2FsbGJhY2sgc2hvdWxkIGJlIG9mIHR5cGUgXCJmdW5jdGlvblwiJylcbiAgICAgIH1cbiAgICB9XG4gICAgdmFyIHNpbXBsZVVwbG9hZGVyID0gKC4uLmFyZ3MpID0+IHtcbiAgICAgIHZhbGlkYXRlKC4uLmFyZ3MpXG4gICAgICB2YXIgcXVlcnkgPSAnJ1xuICAgICAgdXBsb2FkKHF1ZXJ5LCAuLi5hcmdzKVxuICAgIH1cbiAgICB2YXIgbXVsdGlwYXJ0VXBsb2FkZXIgPSAodXBsb2FkSWQsIHBhcnROdW1iZXIsIC4uLnJlc3QpID0+IHtcbiAgICAgIGlmICghaXNTdHJpbmcodXBsb2FkSWQpKSB7XG4gICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ3VwbG9hZElkIHNob3VsZCBiZSBvZiB0eXBlIFwic3RyaW5nXCInKVxuICAgICAgfVxuICAgICAgaWYgKCFpc051bWJlcihwYXJ0TnVtYmVyKSkge1xuICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdwYXJ0TnVtYmVyIHNob3VsZCBiZSBvZiB0eXBlIFwibnVtYmVyXCInKVxuICAgICAgfVxuICAgICAgaWYgKCF1cGxvYWRJZCkge1xuICAgICAgICB0aHJvdyBuZXcgZXJyb3JzLkludmFsaWRBcmd1bWVudEVycm9yKCdFbXB0eSB1cGxvYWRJZCcpXG4gICAgICB9XG4gICAgICBpZiAoIXBhcnROdW1iZXIpIHtcbiAgICAgICAgdGhyb3cgbmV3IGVycm9ycy5JbnZhbGlkQXJndW1lbnRFcnJvcigncGFydE51bWJlciBjYW5ub3QgYmUgMCcpXG4gICAgICB9XG4gICAgICB2YWxpZGF0ZSguLi5yZXN0KVxuICAgICAgdmFyIHF1ZXJ5ID0gYHBhcnROdW1iZXI9JHtwYXJ0TnVtYmVyfSZ1cGxvYWRJZD0ke3VyaUVzY2FwZSh1cGxvYWRJZCl9YFxuICAgICAgdXBsb2FkKHF1ZXJ5LCAuLi5yZXN0KVxuICAgIH1cbiAgICB2YXIgdXBsb2FkID0gKHF1ZXJ5LCBzdHJlYW0sIGxlbmd0aCwgc2hhMjU2c3VtLCBtZDVzdW0sIGNiKSA9PiB7XG4gICAgICB2YXIgbWV0aG9kID0gJ1BVVCdcbiAgICAgIGxldCBoZWFkZXJzID0geyAnQ29udGVudC1MZW5ndGgnOiBsZW5ndGggfVxuXG4gICAgICBpZiAoIW11bHRpcGFydCkge1xuICAgICAgICBoZWFkZXJzID0gT2JqZWN0LmFzc2lnbih7fSwgbWV0YURhdGEsIGhlYWRlcnMpXG4gICAgICB9XG5cbiAgICAgIGlmICghdGhpcy5lbmFibGVTSEEyNTYpIHtcbiAgICAgICAgaGVhZGVyc1snQ29udGVudC1NRDUnXSA9IG1kNXN1bVxuICAgICAgfVxuICAgICAgdGhpcy5tYWtlUmVxdWVzdFN0cmVhbShcbiAgICAgICAgeyBtZXRob2QsIGJ1Y2tldE5hbWUsIG9iamVjdE5hbWUsIHF1ZXJ5LCBoZWFkZXJzIH0sXG4gICAgICAgIHN0cmVhbSxcbiAgICAgICAgc2hhMjU2c3VtLFxuICAgICAgICBbMjAwXSxcbiAgICAgICAgJycsXG4gICAgICAgIHRydWUsXG4gICAgICAgIChlLCByZXNwb25zZSkgPT4ge1xuICAgICAgICAgIGlmIChlKSB7XG4gICAgICAgICAgICByZXR1cm4gY2IoZSlcbiAgICAgICAgICB9XG4gICAgICAgICAgY29uc3QgcmVzdWx0ID0ge1xuICAgICAgICAgICAgZXRhZzogc2FuaXRpemVFVGFnKHJlc3BvbnNlLmhlYWRlcnMuZXRhZyksXG4gICAgICAgICAgICB2ZXJzaW9uSWQ6IGdldFZlcnNpb25JZChyZXNwb25zZS5oZWFkZXJzKSxcbiAgICAgICAgICB9XG4gICAgICAgICAgLy8gSWdub3JlIHRoZSAnZGF0YScgZXZlbnQgc28gdGhhdCB0aGUgc3RyZWFtIGNsb3Nlcy4gKG5vZGVqcyBzdHJlYW0gcmVxdWlyZW1lbnQpXG4gICAgICAgICAgcmVzcG9uc2Uub24oJ2RhdGEnLCAoKSA9PiB7fSlcbiAgICAgICAgICBjYihudWxsLCByZXN1bHQpXG4gICAgICAgIH0sXG4gICAgICApXG4gICAgfVxuICAgIGlmIChtdWx0aXBhcnQpIHtcbiAgICAgIHJldHVybiBtdWx0aXBhcnRVcGxvYWRlclxuICAgIH1cbiAgICByZXR1cm4gc2ltcGxlVXBsb2FkZXJcbiAgfVxuXG4gIC8vIFJlbW92ZSBhbGwgdGhlIG5vdGlmaWNhdGlvbiBjb25maWd1cmF0aW9ucyBpbiB0aGUgUzMgcHJvdmlkZXJcbiAgc2V0QnVja2V0Tm90aWZpY2F0aW9uKGJ1Y2tldE5hbWUsIGNvbmZpZywgY2IpIHtcbiAgICBpZiAoIWlzVmFsaWRCdWNrZXROYW1lKGJ1Y2tldE5hbWUpKSB7XG4gICAgICB0aHJvdyBuZXcgZXJyb3JzLkludmFsaWRCdWNrZXROYW1lRXJyb3IoJ0ludmFsaWQgYnVja2V0IG5hbWU6ICcgKyBidWNrZXROYW1lKVxuICAgIH1cbiAgICBpZiAoIWlzT2JqZWN0KGNvbmZpZykpIHtcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ25vdGlmaWNhdGlvbiBjb25maWcgc2hvdWxkIGJlIG9mIHR5cGUgXCJPYmplY3RcIicpXG4gICAgfVxuICAgIGlmICghaXNGdW5jdGlvbihjYikpIHtcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ2NhbGxiYWNrIHNob3VsZCBiZSBvZiB0eXBlIFwiZnVuY3Rpb25cIicpXG4gICAgfVxuICAgIHZhciBtZXRob2QgPSAnUFVUJ1xuICAgIHZhciBxdWVyeSA9ICdub3RpZmljYXRpb24nXG4gICAgdmFyIGJ1aWxkZXIgPSBuZXcgeG1sMmpzLkJ1aWxkZXIoe1xuICAgICAgcm9vdE5hbWU6ICdOb3RpZmljYXRpb25Db25maWd1cmF0aW9uJyxcbiAgICAgIHJlbmRlck9wdHM6IHsgcHJldHR5OiBmYWxzZSB9LFxuICAgICAgaGVhZGxlc3M6IHRydWUsXG4gICAgfSlcbiAgICB2YXIgcGF5bG9hZCA9IGJ1aWxkZXIuYnVpbGRPYmplY3QoY29uZmlnKVxuICAgIHRoaXMubWFrZVJlcXVlc3QoeyBtZXRob2QsIGJ1Y2tldE5hbWUsIHF1ZXJ5IH0sIHBheWxvYWQsIFsyMDBdLCAnJywgZmFsc2UsIGNiKVxuICB9XG5cbiAgcmVtb3ZlQWxsQnVja2V0Tm90aWZpY2F0aW9uKGJ1Y2tldE5hbWUsIGNiKSB7XG4gICAgdGhpcy5zZXRCdWNrZXROb3RpZmljYXRpb24oYnVja2V0TmFtZSwgbmV3IE5vdGlmaWNhdGlvbkNvbmZpZygpLCBjYilcbiAgfVxuXG4gIC8vIFJldHVybiB0aGUgbGlzdCBvZiBub3RpZmljYXRpb24gY29uZmlndXJhdGlvbnMgc3RvcmVkXG4gIC8vIGluIHRoZSBTMyBwcm92aWRlclxuICBnZXRCdWNrZXROb3RpZmljYXRpb24oYnVja2V0TmFtZSwgY2IpIHtcbiAgICBpZiAoIWlzVmFsaWRCdWNrZXROYW1lKGJ1Y2tldE5hbWUpKSB7XG4gICAgICB0aHJvdyBuZXcgZXJyb3JzLkludmFsaWRCdWNrZXROYW1lRXJyb3IoJ0ludmFsaWQgYnVja2V0IG5hbWU6ICcgKyBidWNrZXROYW1lKVxuICAgIH1cbiAgICBpZiAoIWlzRnVuY3Rpb24oY2IpKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdjYWxsYmFjayBzaG91bGQgYmUgb2YgdHlwZSBcImZ1bmN0aW9uXCInKVxuICAgIH1cbiAgICB2YXIgbWV0aG9kID0gJ0dFVCdcbiAgICB2YXIgcXVlcnkgPSAnbm90aWZpY2F0aW9uJ1xuICAgIHRoaXMubWFrZVJlcXVlc3QoeyBtZXRob2QsIGJ1Y2tldE5hbWUsIHF1ZXJ5IH0sICcnLCBbMjAwXSwgJycsIHRydWUsIChlLCByZXNwb25zZSkgPT4ge1xuICAgICAgaWYgKGUpIHtcbiAgICAgICAgcmV0dXJuIGNiKGUpXG4gICAgICB9XG4gICAgICB2YXIgdHJhbnNmb3JtZXIgPSB0cmFuc2Zvcm1lcnMuZ2V0QnVja2V0Tm90aWZpY2F0aW9uVHJhbnNmb3JtZXIoKVxuICAgICAgdmFyIGJ1Y2tldE5vdGlmaWNhdGlvblxuICAgICAgcGlwZXNldHVwKHJlc3BvbnNlLCB0cmFuc2Zvcm1lcilcbiAgICAgICAgLm9uKCdkYXRhJywgKHJlc3VsdCkgPT4gKGJ1Y2tldE5vdGlmaWNhdGlvbiA9IHJlc3VsdCkpXG4gICAgICAgIC5vbignZXJyb3InLCAoZSkgPT4gY2IoZSkpXG4gICAgICAgIC5vbignZW5kJywgKCkgPT4gY2IobnVsbCwgYnVja2V0Tm90aWZpY2F0aW9uKSlcbiAgICB9KVxuICB9XG5cbiAgLy8gTGlzdGVucyBmb3IgYnVja2V0IG5vdGlmaWNhdGlvbnMuIFJldHVybnMgYW4gRXZlbnRFbWl0dGVyLlxuICBsaXN0ZW5CdWNrZXROb3RpZmljYXRpb24oYnVja2V0TmFtZSwgcHJlZml4LCBzdWZmaXgsIGV2ZW50cykge1xuICAgIGlmICghaXNWYWxpZEJ1Y2tldE5hbWUoYnVja2V0TmFtZSkpIHtcbiAgICAgIHRocm93IG5ldyBlcnJvcnMuSW52YWxpZEJ1Y2tldE5hbWVFcnJvcihgSW52YWxpZCBidWNrZXQgbmFtZTogJHtidWNrZXROYW1lfWApXG4gICAgfVxuICAgIGlmICghaXNTdHJpbmcocHJlZml4KSkge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcigncHJlZml4IG11c3QgYmUgb2YgdHlwZSBzdHJpbmcnKVxuICAgIH1cbiAgICBpZiAoIWlzU3RyaW5nKHN1ZmZpeCkpIHtcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ3N1ZmZpeCBtdXN0IGJlIG9mIHR5cGUgc3RyaW5nJylcbiAgICB9XG4gICAgaWYgKCFBcnJheS5pc0FycmF5KGV2ZW50cykpIHtcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ2V2ZW50cyBtdXN0IGJlIG9mIHR5cGUgQXJyYXknKVxuICAgIH1cbiAgICBsZXQgbGlzdGVuZXIgPSBuZXcgTm90aWZpY2F0aW9uUG9sbGVyKHRoaXMsIGJ1Y2tldE5hbWUsIHByZWZpeCwgc3VmZml4LCBldmVudHMpXG4gICAgbGlzdGVuZXIuc3RhcnQoKVxuXG4gICAgcmV0dXJuIGxpc3RlbmVyXG4gIH1cblxuICBnZXRCdWNrZXRWZXJzaW9uaW5nKGJ1Y2tldE5hbWUsIGNiKSB7XG4gICAgaWYgKCFpc1ZhbGlkQnVja2V0TmFtZShidWNrZXROYW1lKSkge1xuICAgICAgdGhyb3cgbmV3IGVycm9ycy5JbnZhbGlkQnVja2V0TmFtZUVycm9yKCdJbnZhbGlkIGJ1Y2tldCBuYW1lOiAnICsgYnVja2V0TmFtZSlcbiAgICB9XG4gICAgaWYgKCFpc0Z1bmN0aW9uKGNiKSkge1xuICAgICAgdGhyb3cgbmV3IGVycm9ycy5JbnZhbGlkQXJndW1lbnRFcnJvcignY2FsbGJhY2sgc2hvdWxkIGJlIG9mIHR5cGUgXCJmdW5jdGlvblwiJylcbiAgICB9XG4gICAgdmFyIG1ldGhvZCA9ICdHRVQnXG4gICAgdmFyIHF1ZXJ5ID0gJ3ZlcnNpb25pbmcnXG5cbiAgICB0aGlzLm1ha2VSZXF1ZXN0KHsgbWV0aG9kLCBidWNrZXROYW1lLCBxdWVyeSB9LCAnJywgWzIwMF0sICcnLCB0cnVlLCAoZSwgcmVzcG9uc2UpID0+IHtcbiAgICAgIGlmIChlKSB7XG4gICAgICAgIHJldHVybiBjYihlKVxuICAgICAgfVxuXG4gICAgICBsZXQgdmVyc2lvbkNvbmZpZyA9IEJ1ZmZlci5mcm9tKCcnKVxuICAgICAgcGlwZXNldHVwKHJlc3BvbnNlLCB0cmFuc2Zvcm1lcnMuYnVja2V0VmVyc2lvbmluZ1RyYW5zZm9ybWVyKCkpXG4gICAgICAgIC5vbignZGF0YScsIChkYXRhKSA9PiB7XG4gICAgICAgICAgdmVyc2lvbkNvbmZpZyA9IGRhdGFcbiAgICAgICAgfSlcbiAgICAgICAgLm9uKCdlcnJvcicsIGNiKVxuICAgICAgICAub24oJ2VuZCcsICgpID0+IHtcbiAgICAgICAgICBjYihudWxsLCB2ZXJzaW9uQ29uZmlnKVxuICAgICAgICB9KVxuICAgIH0pXG4gIH1cblxuICBzZXRCdWNrZXRWZXJzaW9uaW5nKGJ1Y2tldE5hbWUsIHZlcnNpb25Db25maWcsIGNiKSB7XG4gICAgaWYgKCFpc1ZhbGlkQnVja2V0TmFtZShidWNrZXROYW1lKSkge1xuICAgICAgdGhyb3cgbmV3IGVycm9ycy5JbnZhbGlkQnVja2V0TmFtZUVycm9yKCdJbnZhbGlkIGJ1Y2tldCBuYW1lOiAnICsgYnVja2V0TmFtZSlcbiAgICB9XG4gICAgaWYgKCFPYmplY3Qua2V5cyh2ZXJzaW9uQ29uZmlnKS5sZW5ndGgpIHtcbiAgICAgIHRocm93IG5ldyBlcnJvcnMuSW52YWxpZEFyZ3VtZW50RXJyb3IoJ3ZlcnNpb25Db25maWcgc2hvdWxkIGJlIG9mIHR5cGUgXCJvYmplY3RcIicpXG4gICAgfVxuICAgIGlmICghaXNGdW5jdGlvbihjYikpIHtcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ2NhbGxiYWNrIHNob3VsZCBiZSBvZiB0eXBlIFwiZnVuY3Rpb25cIicpXG4gICAgfVxuXG4gICAgdmFyIG1ldGhvZCA9ICdQVVQnXG4gICAgdmFyIHF1ZXJ5ID0gJ3ZlcnNpb25pbmcnXG4gICAgdmFyIGJ1aWxkZXIgPSBuZXcgeG1sMmpzLkJ1aWxkZXIoe1xuICAgICAgcm9vdE5hbWU6ICdWZXJzaW9uaW5nQ29uZmlndXJhdGlvbicsXG4gICAgICByZW5kZXJPcHRzOiB7IHByZXR0eTogZmFsc2UgfSxcbiAgICAgIGhlYWRsZXNzOiB0cnVlLFxuICAgIH0pXG4gICAgdmFyIHBheWxvYWQgPSBidWlsZGVyLmJ1aWxkT2JqZWN0KHZlcnNpb25Db25maWcpXG5cbiAgICB0aGlzLm1ha2VSZXF1ZXN0KHsgbWV0aG9kLCBidWNrZXROYW1lLCBxdWVyeSB9LCBwYXlsb2FkLCBbMjAwXSwgJycsIGZhbHNlLCBjYilcbiAgfVxuXG4gIC8qKiBUbyBzZXQgVGFncyBvbiBhIGJ1Y2tldCBvciBvYmplY3QgYmFzZWQgb24gdGhlIHBhcmFtc1xuICAgKiAgX19Bcmd1bWVudHNfX1xuICAgKiB0YWdnaW5nUGFyYW1zIF9vYmplY3RfIFdoaWNoIGNvbnRhaW5zIHRoZSBmb2xsb3dpbmcgcHJvcGVydGllc1xuICAgKiAgYnVja2V0TmFtZSBfc3RyaW5nXyxcbiAgICogIG9iamVjdE5hbWUgX3N0cmluZ18gKE9wdGlvbmFsKSxcbiAgICogIHRhZ3MgX29iamVjdF8gb2YgdGhlIGZvcm0geyc8dGFnLWtleS0xPic6Jzx0YWctdmFsdWUtMT4nLCc8dGFnLWtleS0yPic6Jzx0YWctdmFsdWUtMj4nfVxuICAgKiAgcHV0T3B0cyBfb2JqZWN0XyAoT3B0aW9uYWwpIGUuZyB7dmVyc2lvbklkOlwibXktb2JqZWN0LXZlcnNpb24taWRcIn0sXG4gICAqICBjYihlcnJvcilgIF9mdW5jdGlvbl8gLSBjYWxsYmFjayBmdW5jdGlvbiB3aXRoIGBlcnJgIGFzIHRoZSBlcnJvciBhcmd1bWVudC4gYGVycmAgaXMgbnVsbCBpZiB0aGUgb3BlcmF0aW9uIGlzIHN1Y2Nlc3NmdWwuXG4gICAqL1xuICBzZXRUYWdnaW5nKHRhZ2dpbmdQYXJhbXMpIHtcbiAgICBjb25zdCB7IGJ1Y2tldE5hbWUsIG9iamVjdE5hbWUsIHRhZ3MsIHB1dE9wdHMgPSB7fSwgY2IgfSA9IHRhZ2dpbmdQYXJhbXNcbiAgICBjb25zdCBtZXRob2QgPSAnUFVUJ1xuICAgIGxldCBxdWVyeSA9ICd0YWdnaW5nJ1xuXG4gICAgaWYgKHB1dE9wdHMgJiYgcHV0T3B0cy52ZXJzaW9uSWQpIHtcbiAgICAgIHF1ZXJ5ID0gYCR7cXVlcnl9JnZlcnNpb25JZD0ke3B1dE9wdHMudmVyc2lvbklkfWBcbiAgICB9XG4gICAgY29uc3QgdGFnc0xpc3QgPSBbXVxuICAgIGZvciAoY29uc3QgW2tleSwgdmFsdWVdIG9mIE9iamVjdC5lbnRyaWVzKHRhZ3MpKSB7XG4gICAgICB0YWdzTGlzdC5wdXNoKHsgS2V5OiBrZXksIFZhbHVlOiB2YWx1ZSB9KVxuICAgIH1cbiAgICBjb25zdCB0YWdnaW5nQ29uZmlnID0ge1xuICAgICAgVGFnZ2luZzoge1xuICAgICAgICBUYWdTZXQ6IHtcbiAgICAgICAgICBUYWc6IHRhZ3NMaXN0LFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICB9XG4gICAgY29uc3QgZW5jb2RlciA9IG5ldyBUZXh0RW5jb2RlcigpXG4gICAgY29uc3QgaGVhZGVycyA9IHt9XG4gICAgY29uc3QgYnVpbGRlciA9IG5ldyB4bWwyanMuQnVpbGRlcih7IGhlYWRsZXNzOiB0cnVlLCByZW5kZXJPcHRzOiB7IHByZXR0eTogZmFsc2UgfSB9KVxuICAgIGxldCBwYXlsb2FkID0gYnVpbGRlci5idWlsZE9iamVjdCh0YWdnaW5nQ29uZmlnKVxuICAgIHBheWxvYWQgPSBlbmNvZGVyLmVuY29kZShwYXlsb2FkKVxuICAgIGhlYWRlcnNbJ0NvbnRlbnQtTUQ1J10gPSB0b01kNShwYXlsb2FkKVxuICAgIGNvbnN0IHJlcXVlc3RPcHRpb25zID0geyBtZXRob2QsIGJ1Y2tldE5hbWUsIHF1ZXJ5LCBoZWFkZXJzIH1cblxuICAgIGlmIChvYmplY3ROYW1lKSB7XG4gICAgICByZXF1ZXN0T3B0aW9uc1snb2JqZWN0TmFtZSddID0gb2JqZWN0TmFtZVxuICAgIH1cbiAgICBoZWFkZXJzWydDb250ZW50LU1ENSddID0gdG9NZDUocGF5bG9hZClcblxuICAgIHRoaXMubWFrZVJlcXVlc3QocmVxdWVzdE9wdGlvbnMsIHBheWxvYWQsIFsyMDBdLCAnJywgZmFsc2UsIGNiKVxuICB9XG5cbiAgLyoqIFNldCBUYWdzIG9uIGEgQnVja2V0XG4gICAqIF9fQXJndW1lbnRzX19cbiAgICogYnVja2V0TmFtZSBfc3RyaW5nX1xuICAgKiB0YWdzIF9vYmplY3RfIG9mIHRoZSBmb3JtIHsnPHRhZy1rZXktMT4nOic8dGFnLXZhbHVlLTE+JywnPHRhZy1rZXktMj4nOic8dGFnLXZhbHVlLTI+J31cbiAgICogYGNiKGVycm9yKWAgX2Z1bmN0aW9uXyAtIGNhbGxiYWNrIGZ1bmN0aW9uIHdpdGggYGVycmAgYXMgdGhlIGVycm9yIGFyZ3VtZW50LiBgZXJyYCBpcyBudWxsIGlmIHRoZSBvcGVyYXRpb24gaXMgc3VjY2Vzc2Z1bC5cbiAgICovXG4gIHNldEJ1Y2tldFRhZ2dpbmcoYnVja2V0TmFtZSwgdGFncywgY2IpIHtcbiAgICBpZiAoIWlzVmFsaWRCdWNrZXROYW1lKGJ1Y2tldE5hbWUpKSB7XG4gICAgICB0aHJvdyBuZXcgZXJyb3JzLkludmFsaWRCdWNrZXROYW1lRXJyb3IoJ0ludmFsaWQgYnVja2V0IG5hbWU6ICcgKyBidWNrZXROYW1lKVxuICAgIH1cbiAgICBpZiAoIWlzT2JqZWN0KHRhZ3MpKSB7XG4gICAgICB0aHJvdyBuZXcgZXJyb3JzLkludmFsaWRBcmd1bWVudEVycm9yKCd0YWdzIHNob3VsZCBiZSBvZiB0eXBlIFwib2JqZWN0XCInKVxuICAgIH1cbiAgICBpZiAoT2JqZWN0LmtleXModGFncykubGVuZ3RoID4gMTApIHtcbiAgICAgIHRocm93IG5ldyBlcnJvcnMuSW52YWxpZEFyZ3VtZW50RXJyb3IoJ21heGltdW0gdGFncyBhbGxvd2VkIGlzIDEwXCInKVxuICAgIH1cbiAgICBpZiAoIWlzRnVuY3Rpb24oY2IpKSB7XG4gICAgICB0aHJvdyBuZXcgZXJyb3JzLkludmFsaWRBcmd1bWVudEVycm9yKCdjYWxsYmFjayBzaG91bGQgYmUgb2YgdHlwZSBcImZ1bmN0aW9uXCInKVxuICAgIH1cblxuICAgIHJldHVybiB0aGlzLnNldFRhZ2dpbmcoeyBidWNrZXROYW1lLCB0YWdzLCBjYiB9KVxuICB9XG5cbiAgLyoqIFNldCBUYWdzIG9uIGFuIE9iamVjdFxuICAgKiBfX0FyZ3VtZW50c19fXG4gICAqIGJ1Y2tldE5hbWUgX3N0cmluZ19cbiAgICogb2JqZWN0TmFtZSBfc3RyaW5nX1xuICAgKiAgKiB0YWdzIF9vYmplY3RfIG9mIHRoZSBmb3JtIHsnPHRhZy1rZXktMT4nOic8dGFnLXZhbHVlLTE+JywnPHRhZy1rZXktMj4nOic8dGFnLXZhbHVlLTI+J31cbiAgICogIHB1dE9wdHMgX29iamVjdF8gKE9wdGlvbmFsKSBlLmcge3ZlcnNpb25JZDpcIm15LW9iamVjdC12ZXJzaW9uLWlkXCJ9LFxuICAgKiBgY2IoZXJyb3IpYCBfZnVuY3Rpb25fIC0gY2FsbGJhY2sgZnVuY3Rpb24gd2l0aCBgZXJyYCBhcyB0aGUgZXJyb3IgYXJndW1lbnQuIGBlcnJgIGlzIG51bGwgaWYgdGhlIG9wZXJhdGlvbiBpcyBzdWNjZXNzZnVsLlxuICAgKi9cbiAgc2V0T2JqZWN0VGFnZ2luZyhidWNrZXROYW1lLCBvYmplY3ROYW1lLCB0YWdzLCBwdXRPcHRzID0ge30sIGNiKSB7XG4gICAgaWYgKCFpc1ZhbGlkQnVja2V0TmFtZShidWNrZXROYW1lKSkge1xuICAgICAgdGhyb3cgbmV3IGVycm9ycy5JbnZhbGlkQnVja2V0TmFtZUVycm9yKCdJbnZhbGlkIGJ1Y2tldCBuYW1lOiAnICsgYnVja2V0TmFtZSlcbiAgICB9XG4gICAgaWYgKCFpc1ZhbGlkT2JqZWN0TmFtZShvYmplY3ROYW1lKSkge1xuICAgICAgdGhyb3cgbmV3IGVycm9ycy5JbnZhbGlkQnVja2V0TmFtZUVycm9yKCdJbnZhbGlkIG9iamVjdCBuYW1lOiAnICsgb2JqZWN0TmFtZSlcbiAgICB9XG5cbiAgICBpZiAoaXNGdW5jdGlvbihwdXRPcHRzKSkge1xuICAgICAgY2IgPSBwdXRPcHRzXG4gICAgICBwdXRPcHRzID0ge31cbiAgICB9XG5cbiAgICBpZiAoIWlzT2JqZWN0KHRhZ3MpKSB7XG4gICAgICB0aHJvdyBuZXcgZXJyb3JzLkludmFsaWRBcmd1bWVudEVycm9yKCd0YWdzIHNob3VsZCBiZSBvZiB0eXBlIFwib2JqZWN0XCInKVxuICAgIH1cbiAgICBpZiAoT2JqZWN0LmtleXModGFncykubGVuZ3RoID4gMTApIHtcbiAgICAgIHRocm93IG5ldyBlcnJvcnMuSW52YWxpZEFyZ3VtZW50RXJyb3IoJ01heGltdW0gdGFncyBhbGxvd2VkIGlzIDEwXCInKVxuICAgIH1cblxuICAgIGlmICghaXNGdW5jdGlvbihjYikpIHtcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ2NhbGxiYWNrIHNob3VsZCBiZSBvZiB0eXBlIFwiZnVuY3Rpb25cIicpXG4gICAgfVxuICAgIHJldHVybiB0aGlzLnNldFRhZ2dpbmcoeyBidWNrZXROYW1lLCBvYmplY3ROYW1lLCB0YWdzLCBwdXRPcHRzLCBjYiB9KVxuICB9XG5cbiAgLyoqIFJlbW92ZSBUYWdzIG9uIGFuIEJ1Y2tldC9PYmplY3QgYmFzZWQgb24gcGFyYW1zXG4gICAqIF9fQXJndW1lbnRzX19cbiAgICogYnVja2V0TmFtZSBfc3RyaW5nX1xuICAgKiBvYmplY3ROYW1lIF9zdHJpbmdfIChvcHRpb25hbClcbiAgICogcmVtb3ZlT3B0cyBfb2JqZWN0XyAoT3B0aW9uYWwpIGUuZyB7dmVyc2lvbklkOlwibXktb2JqZWN0LXZlcnNpb24taWRcIn0sXG4gICAqIGBjYihlcnJvcilgIF9mdW5jdGlvbl8gLSBjYWxsYmFjayBmdW5jdGlvbiB3aXRoIGBlcnJgIGFzIHRoZSBlcnJvciBhcmd1bWVudC4gYGVycmAgaXMgbnVsbCBpZiB0aGUgb3BlcmF0aW9uIGlzIHN1Y2Nlc3NmdWwuXG4gICAqL1xuICByZW1vdmVUYWdnaW5nKHsgYnVja2V0TmFtZSwgb2JqZWN0TmFtZSwgcmVtb3ZlT3B0cywgY2IgfSkge1xuICAgIGNvbnN0IG1ldGhvZCA9ICdERUxFVEUnXG4gICAgbGV0IHF1ZXJ5ID0gJ3RhZ2dpbmcnXG5cbiAgICBpZiAocmVtb3ZlT3B0cyAmJiBPYmplY3Qua2V5cyhyZW1vdmVPcHRzKS5sZW5ndGggJiYgcmVtb3ZlT3B0cy52ZXJzaW9uSWQpIHtcbiAgICAgIHF1ZXJ5ID0gYCR7cXVlcnl9JnZlcnNpb25JZD0ke3JlbW92ZU9wdHMudmVyc2lvbklkfWBcbiAgICB9XG4gICAgY29uc3QgcmVxdWVzdE9wdGlvbnMgPSB7IG1ldGhvZCwgYnVja2V0TmFtZSwgb2JqZWN0TmFtZSwgcXVlcnkgfVxuXG4gICAgaWYgKG9iamVjdE5hbWUpIHtcbiAgICAgIHJlcXVlc3RPcHRpb25zWydvYmplY3ROYW1lJ10gPSBvYmplY3ROYW1lXG4gICAgfVxuICAgIHRoaXMubWFrZVJlcXVlc3QocmVxdWVzdE9wdGlvbnMsICcnLCBbMjAwLCAyMDRdLCAnJywgdHJ1ZSwgY2IpXG4gIH1cblxuICAvKiogUmVtb3ZlIFRhZ3MgYXNzb2NpYXRlZCB3aXRoIGEgYnVja2V0XG4gICAqICBfX0FyZ3VtZW50c19fXG4gICAqIGJ1Y2tldE5hbWUgX3N0cmluZ19cbiAgICogYGNiKGVycm9yKWAgX2Z1bmN0aW9uXyAtIGNhbGxiYWNrIGZ1bmN0aW9uIHdpdGggYGVycmAgYXMgdGhlIGVycm9yIGFyZ3VtZW50LiBgZXJyYCBpcyBudWxsIGlmIHRoZSBvcGVyYXRpb24gaXMgc3VjY2Vzc2Z1bC5cbiAgICovXG4gIHJlbW92ZUJ1Y2tldFRhZ2dpbmcoYnVja2V0TmFtZSwgY2IpIHtcbiAgICBpZiAoIWlzVmFsaWRCdWNrZXROYW1lKGJ1Y2tldE5hbWUpKSB7XG4gICAgICB0aHJvdyBuZXcgZXJyb3JzLkludmFsaWRCdWNrZXROYW1lRXJyb3IoJ0ludmFsaWQgYnVja2V0IG5hbWU6ICcgKyBidWNrZXROYW1lKVxuICAgIH1cbiAgICBpZiAoIWlzRnVuY3Rpb24oY2IpKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdjYWxsYmFjayBzaG91bGQgYmUgb2YgdHlwZSBcImZ1bmN0aW9uXCInKVxuICAgIH1cbiAgICByZXR1cm4gdGhpcy5yZW1vdmVUYWdnaW5nKHsgYnVja2V0TmFtZSwgY2IgfSlcbiAgfVxuXG4gIC8qKiBSZW1vdmUgdGFncyBhc3NvY2lhdGVkIHdpdGggYW4gb2JqZWN0XG4gICAqIF9fQXJndW1lbnRzX19cbiAgICogYnVja2V0TmFtZSBfc3RyaW5nX1xuICAgKiBvYmplY3ROYW1lIF9zdHJpbmdfXG4gICAqIHJlbW92ZU9wdHMgX29iamVjdF8gKE9wdGlvbmFsKSBlLmcuIHtWZXJzaW9uSUQ6XCJteS1vYmplY3QtdmVyc2lvbi1pZFwifVxuICAgKiBgY2IoZXJyb3IpYCBfZnVuY3Rpb25fIC0gY2FsbGJhY2sgZnVuY3Rpb24gd2l0aCBgZXJyYCBhcyB0aGUgZXJyb3IgYXJndW1lbnQuIGBlcnJgIGlzIG51bGwgaWYgdGhlIG9wZXJhdGlvbiBpcyBzdWNjZXNzZnVsLlxuICAgKi9cbiAgcmVtb3ZlT2JqZWN0VGFnZ2luZyhidWNrZXROYW1lLCBvYmplY3ROYW1lLCByZW1vdmVPcHRzLCBjYikge1xuICAgIGlmICghaXNWYWxpZEJ1Y2tldE5hbWUoYnVja2V0TmFtZSkpIHtcbiAgICAgIHRocm93IG5ldyBlcnJvcnMuSW52YWxpZEJ1Y2tldE5hbWVFcnJvcignSW52YWxpZCBidWNrZXQgbmFtZTogJyArIGJ1Y2tldE5hbWUpXG4gICAgfVxuICAgIGlmICghaXNWYWxpZE9iamVjdE5hbWUob2JqZWN0TmFtZSkpIHtcbiAgICAgIHRocm93IG5ldyBlcnJvcnMuSW52YWxpZEJ1Y2tldE5hbWVFcnJvcignSW52YWxpZCBvYmplY3QgbmFtZTogJyArIG9iamVjdE5hbWUpXG4gICAgfVxuICAgIGlmIChpc0Z1bmN0aW9uKHJlbW92ZU9wdHMpKSB7XG4gICAgICBjYiA9IHJlbW92ZU9wdHNcbiAgICAgIHJlbW92ZU9wdHMgPSB7fVxuICAgIH1cbiAgICBpZiAocmVtb3ZlT3B0cyAmJiBPYmplY3Qua2V5cyhyZW1vdmVPcHRzKS5sZW5ndGggJiYgIWlzT2JqZWN0KHJlbW92ZU9wdHMpKSB7XG4gICAgICB0aHJvdyBuZXcgZXJyb3JzLkludmFsaWRBcmd1bWVudEVycm9yKCdyZW1vdmVPcHRzIHNob3VsZCBiZSBvZiB0eXBlIFwib2JqZWN0XCInKVxuICAgIH1cblxuICAgIGlmICghaXNGdW5jdGlvbihjYikpIHtcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ2NhbGxiYWNrIHNob3VsZCBiZSBvZiB0eXBlIFwiZnVuY3Rpb25cIicpXG4gICAgfVxuXG4gICAgcmV0dXJuIHRoaXMucmVtb3ZlVGFnZ2luZyh7IGJ1Y2tldE5hbWUsIG9iamVjdE5hbWUsIHJlbW92ZU9wdHMsIGNiIH0pXG4gIH1cblxuICAvKiogR2V0IFRhZ3MgYXNzb2NpYXRlZCB3aXRoIGEgQnVja2V0XG4gICAqICBfX0FyZ3VtZW50c19fXG4gICAqIGJ1Y2tldE5hbWUgX3N0cmluZ19cbiAgICogYGNiKGVycm9yLCB0YWdzKWAgX2Z1bmN0aW9uXyAtIGNhbGxiYWNrIGZ1bmN0aW9uIHdpdGggYGVycmAgYXMgdGhlIGVycm9yIGFyZ3VtZW50LiBgZXJyYCBpcyBudWxsIGlmIHRoZSBvcGVyYXRpb24gaXMgc3VjY2Vzc2Z1bC5cbiAgICovXG4gIGdldEJ1Y2tldFRhZ2dpbmcoYnVja2V0TmFtZSwgY2IpIHtcbiAgICBjb25zdCBtZXRob2QgPSAnR0VUJ1xuICAgIGNvbnN0IHF1ZXJ5ID0gJ3RhZ2dpbmcnXG4gICAgY29uc3QgcmVxdWVzdE9wdGlvbnMgPSB7IG1ldGhvZCwgYnVja2V0TmFtZSwgcXVlcnkgfVxuXG4gICAgdGhpcy5tYWtlUmVxdWVzdChyZXF1ZXN0T3B0aW9ucywgJycsIFsyMDBdLCAnJywgdHJ1ZSwgKGUsIHJlc3BvbnNlKSA9PiB7XG4gICAgICB2YXIgdHJhbnNmb3JtZXIgPSB0cmFuc2Zvcm1lcnMuZ2V0VGFnc1RyYW5zZm9ybWVyKClcbiAgICAgIGlmIChlKSB7XG4gICAgICAgIHJldHVybiBjYihlKVxuICAgICAgfVxuICAgICAgbGV0IHRhZ3NMaXN0XG4gICAgICBwaXBlc2V0dXAocmVzcG9uc2UsIHRyYW5zZm9ybWVyKVxuICAgICAgICAub24oJ2RhdGEnLCAocmVzdWx0KSA9PiAodGFnc0xpc3QgPSByZXN1bHQpKVxuICAgICAgICAub24oJ2Vycm9yJywgKGUpID0+IGNiKGUpKVxuICAgICAgICAub24oJ2VuZCcsICgpID0+IGNiKG51bGwsIHRhZ3NMaXN0KSlcbiAgICB9KVxuICB9XG5cbiAgLyoqIEdldCB0aGUgdGFncyBhc3NvY2lhdGVkIHdpdGggYSBidWNrZXQgT1IgYW4gb2JqZWN0XG4gICAqIGJ1Y2tldE5hbWUgX3N0cmluZ19cbiAgICogb2JqZWN0TmFtZSBfc3RyaW5nXyAoT3B0aW9uYWwpXG4gICAqIGdldE9wdHMgX29iamVjdF8gKE9wdGlvbmFsKSBlLmcge3ZlcnNpb25JZDpcIm15LW9iamVjdC12ZXJzaW9uLWlkXCJ9XG4gICAqIGBjYihlcnJvciwgdGFncylgIF9mdW5jdGlvbl8gLSBjYWxsYmFjayBmdW5jdGlvbiB3aXRoIGBlcnJgIGFzIHRoZSBlcnJvciBhcmd1bWVudC4gYGVycmAgaXMgbnVsbCBpZiB0aGUgb3BlcmF0aW9uIGlzIHN1Y2Nlc3NmdWwuXG4gICAqL1xuICBnZXRPYmplY3RUYWdnaW5nKGJ1Y2tldE5hbWUsIG9iamVjdE5hbWUsIGdldE9wdHMgPSB7fSwgY2IgPSAoKSA9PiBmYWxzZSkge1xuICAgIGNvbnN0IG1ldGhvZCA9ICdHRVQnXG4gICAgbGV0IHF1ZXJ5ID0gJ3RhZ2dpbmcnXG5cbiAgICBpZiAoIWlzVmFsaWRCdWNrZXROYW1lKGJ1Y2tldE5hbWUpKSB7XG4gICAgICB0aHJvdyBuZXcgZXJyb3JzLkludmFsaWRCdWNrZXROYW1lRXJyb3IoJ0ludmFsaWQgYnVja2V0IG5hbWU6ICcgKyBidWNrZXROYW1lKVxuICAgIH1cbiAgICBpZiAoIWlzVmFsaWRPYmplY3ROYW1lKG9iamVjdE5hbWUpKSB7XG4gICAgICB0aHJvdyBuZXcgZXJyb3JzLkludmFsaWRCdWNrZXROYW1lRXJyb3IoJ0ludmFsaWQgb2JqZWN0IG5hbWU6ICcgKyBvYmplY3ROYW1lKVxuICAgIH1cbiAgICBpZiAoaXNGdW5jdGlvbihnZXRPcHRzKSkge1xuICAgICAgY2IgPSBnZXRPcHRzXG4gICAgICBnZXRPcHRzID0ge31cbiAgICB9XG4gICAgaWYgKCFpc09iamVjdChnZXRPcHRzKSkge1xuICAgICAgdGhyb3cgbmV3IGVycm9ycy5JbnZhbGlkQXJndW1lbnRFcnJvcignZ2V0T3B0cyBzaG91bGQgYmUgb2YgdHlwZSBcIm9iamVjdFwiJylcbiAgICB9XG4gICAgaWYgKCFpc0Z1bmN0aW9uKGNiKSkge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignY2FsbGJhY2sgc2hvdWxkIGJlIG9mIHR5cGUgXCJmdW5jdGlvblwiJylcbiAgICB9XG5cbiAgICBpZiAoZ2V0T3B0cyAmJiBnZXRPcHRzLnZlcnNpb25JZCkge1xuICAgICAgcXVlcnkgPSBgJHtxdWVyeX0mdmVyc2lvbklkPSR7Z2V0T3B0cy52ZXJzaW9uSWR9YFxuICAgIH1cbiAgICBjb25zdCByZXF1ZXN0T3B0aW9ucyA9IHsgbWV0aG9kLCBidWNrZXROYW1lLCBxdWVyeSB9XG4gICAgaWYgKG9iamVjdE5hbWUpIHtcbiAgICAgIHJlcXVlc3RPcHRpb25zWydvYmplY3ROYW1lJ10gPSBvYmplY3ROYW1lXG4gICAgfVxuXG4gICAgdGhpcy5tYWtlUmVxdWVzdChyZXF1ZXN0T3B0aW9ucywgJycsIFsyMDBdLCAnJywgdHJ1ZSwgKGUsIHJlc3BvbnNlKSA9PiB7XG4gICAgICBjb25zdCB0cmFuc2Zvcm1lciA9IHRyYW5zZm9ybWVycy5nZXRUYWdzVHJhbnNmb3JtZXIoKVxuICAgICAgaWYgKGUpIHtcbiAgICAgICAgcmV0dXJuIGNiKGUpXG4gICAgICB9XG4gICAgICBsZXQgdGFnc0xpc3RcbiAgICAgIHBpcGVzZXR1cChyZXNwb25zZSwgdHJhbnNmb3JtZXIpXG4gICAgICAgIC5vbignZGF0YScsIChyZXN1bHQpID0+ICh0YWdzTGlzdCA9IHJlc3VsdCkpXG4gICAgICAgIC5vbignZXJyb3InLCAoZSkgPT4gY2IoZSkpXG4gICAgICAgIC5vbignZW5kJywgKCkgPT4gY2IobnVsbCwgdGFnc0xpc3QpKVxuICAgIH0pXG4gIH1cblxuICAvKipcbiAgICogQXBwbHkgbGlmZWN5Y2xlIGNvbmZpZ3VyYXRpb24gb24gYSBidWNrZXQuXG4gICAqIGJ1Y2tldE5hbWUgX3N0cmluZ19cbiAgICogcG9saWN5Q29uZmlnIF9vYmplY3RfIGEgdmFsaWQgcG9saWN5IGNvbmZpZ3VyYXRpb24gb2JqZWN0LlxuICAgKiBgY2IoZXJyb3IpYCBfZnVuY3Rpb25fIC0gY2FsbGJhY2sgZnVuY3Rpb24gd2l0aCBgZXJyYCBhcyB0aGUgZXJyb3IgYXJndW1lbnQuIGBlcnJgIGlzIG51bGwgaWYgdGhlIG9wZXJhdGlvbiBpcyBzdWNjZXNzZnVsLlxuICAgKi9cbiAgYXBwbHlCdWNrZXRMaWZlY3ljbGUoYnVja2V0TmFtZSwgcG9saWN5Q29uZmlnLCBjYikge1xuICAgIGNvbnN0IG1ldGhvZCA9ICdQVVQnXG4gICAgY29uc3QgcXVlcnkgPSAnbGlmZWN5Y2xlJ1xuXG4gICAgY29uc3QgZW5jb2RlciA9IG5ldyBUZXh0RW5jb2RlcigpXG4gICAgY29uc3QgaGVhZGVycyA9IHt9XG4gICAgY29uc3QgYnVpbGRlciA9IG5ldyB4bWwyanMuQnVpbGRlcih7XG4gICAgICByb290TmFtZTogJ0xpZmVjeWNsZUNvbmZpZ3VyYXRpb24nLFxuICAgICAgaGVhZGxlc3M6IHRydWUsXG4gICAgICByZW5kZXJPcHRzOiB7IHByZXR0eTogZmFsc2UgfSxcbiAgICB9KVxuICAgIGxldCBwYXlsb2FkID0gYnVpbGRlci5idWlsZE9iamVjdChwb2xpY3lDb25maWcpXG4gICAgcGF5bG9hZCA9IGVuY29kZXIuZW5jb2RlKHBheWxvYWQpXG4gICAgY29uc3QgcmVxdWVzdE9wdGlvbnMgPSB7IG1ldGhvZCwgYnVja2V0TmFtZSwgcXVlcnksIGhlYWRlcnMgfVxuICAgIGhlYWRlcnNbJ0NvbnRlbnQtTUQ1J10gPSB0b01kNShwYXlsb2FkKVxuXG4gICAgdGhpcy5tYWtlUmVxdWVzdChyZXF1ZXN0T3B0aW9ucywgcGF5bG9hZCwgWzIwMF0sICcnLCBmYWxzZSwgY2IpXG4gIH1cblxuICAvKiogUmVtb3ZlIGxpZmVjeWNsZSBjb25maWd1cmF0aW9uIG9mIGEgYnVja2V0LlxuICAgKiBidWNrZXROYW1lIF9zdHJpbmdfXG4gICAqIGBjYihlcnJvcilgIF9mdW5jdGlvbl8gLSBjYWxsYmFjayBmdW5jdGlvbiB3aXRoIGBlcnJgIGFzIHRoZSBlcnJvciBhcmd1bWVudC4gYGVycmAgaXMgbnVsbCBpZiB0aGUgb3BlcmF0aW9uIGlzIHN1Y2Nlc3NmdWwuXG4gICAqL1xuICByZW1vdmVCdWNrZXRMaWZlY3ljbGUoYnVja2V0TmFtZSwgY2IpIHtcbiAgICBpZiAoIWlzVmFsaWRCdWNrZXROYW1lKGJ1Y2tldE5hbWUpKSB7XG4gICAgICB0aHJvdyBuZXcgZXJyb3JzLkludmFsaWRCdWNrZXROYW1lRXJyb3IoJ0ludmFsaWQgYnVja2V0IG5hbWU6ICcgKyBidWNrZXROYW1lKVxuICAgIH1cbiAgICBjb25zdCBtZXRob2QgPSAnREVMRVRFJ1xuICAgIGNvbnN0IHF1ZXJ5ID0gJ2xpZmVjeWNsZSdcbiAgICB0aGlzLm1ha2VSZXF1ZXN0KHsgbWV0aG9kLCBidWNrZXROYW1lLCBxdWVyeSB9LCAnJywgWzIwNF0sICcnLCBmYWxzZSwgY2IpXG4gIH1cblxuICAvKiogU2V0L092ZXJyaWRlIGxpZmVjeWNsZSBjb25maWd1cmF0aW9uIG9uIGEgYnVja2V0LiBpZiB0aGUgY29uZmlndXJhdGlvbiBpcyBlbXB0eSwgaXQgcmVtb3ZlcyB0aGUgY29uZmlndXJhdGlvbi5cbiAgICogYnVja2V0TmFtZSBfc3RyaW5nX1xuICAgKiBsaWZlQ3ljbGVDb25maWcgX29iamVjdF8gb25lIG9mIHRoZSBmb2xsb3dpbmcgdmFsdWVzOiAobnVsbCBvciAnJykgdG8gcmVtb3ZlIHRoZSBsaWZlY3ljbGUgY29uZmlndXJhdGlvbi4gb3IgYSB2YWxpZCBsaWZlY3ljbGUgY29uZmlndXJhdGlvblxuICAgKiBgY2IoZXJyb3IpYCBfZnVuY3Rpb25fIC0gY2FsbGJhY2sgZnVuY3Rpb24gd2l0aCBgZXJyYCBhcyB0aGUgZXJyb3IgYXJndW1lbnQuIGBlcnJgIGlzIG51bGwgaWYgdGhlIG9wZXJhdGlvbiBpcyBzdWNjZXNzZnVsLlxuICAgKi9cbiAgc2V0QnVja2V0TGlmZWN5Y2xlKGJ1Y2tldE5hbWUsIGxpZmVDeWNsZUNvbmZpZyA9IG51bGwsIGNiKSB7XG4gICAgaWYgKCFpc1ZhbGlkQnVja2V0TmFtZShidWNrZXROYW1lKSkge1xuICAgICAgdGhyb3cgbmV3IGVycm9ycy5JbnZhbGlkQnVja2V0TmFtZUVycm9yKCdJbnZhbGlkIGJ1Y2tldCBuYW1lOiAnICsgYnVja2V0TmFtZSlcbiAgICB9XG4gICAgaWYgKF8uaXNFbXB0eShsaWZlQ3ljbGVDb25maWcpKSB7XG4gICAgICB0aGlzLnJlbW92ZUJ1Y2tldExpZmVjeWNsZShidWNrZXROYW1lLCBjYilcbiAgICB9IGVsc2Uge1xuICAgICAgdGhpcy5hcHBseUJ1Y2tldExpZmVjeWNsZShidWNrZXROYW1lLCBsaWZlQ3ljbGVDb25maWcsIGNiKVxuICAgIH1cbiAgfVxuXG4gIC8qKiBHZXQgbGlmZWN5Y2xlIGNvbmZpZ3VyYXRpb24gb24gYSBidWNrZXQuXG4gICAqIGJ1Y2tldE5hbWUgX3N0cmluZ19cbiAgICogYGNiKGNvbmZpZylgIF9mdW5jdGlvbl8gLSBjYWxsYmFjayBmdW5jdGlvbiB3aXRoIGxpZmVjeWNsZSBjb25maWd1cmF0aW9uIGFzIHRoZSBlcnJvciBhcmd1bWVudC5cbiAgICovXG4gIGdldEJ1Y2tldExpZmVjeWNsZShidWNrZXROYW1lLCBjYikge1xuICAgIGlmICghaXNWYWxpZEJ1Y2tldE5hbWUoYnVja2V0TmFtZSkpIHtcbiAgICAgIHRocm93IG5ldyBlcnJvcnMuSW52YWxpZEJ1Y2tldE5hbWVFcnJvcignSW52YWxpZCBidWNrZXQgbmFtZTogJyArIGJ1Y2tldE5hbWUpXG4gICAgfVxuICAgIGNvbnN0IG1ldGhvZCA9ICdHRVQnXG4gICAgY29uc3QgcXVlcnkgPSAnbGlmZWN5Y2xlJ1xuICAgIGNvbnN0IHJlcXVlc3RPcHRpb25zID0geyBtZXRob2QsIGJ1Y2tldE5hbWUsIHF1ZXJ5IH1cblxuICAgIHRoaXMubWFrZVJlcXVlc3QocmVxdWVzdE9wdGlvbnMsICcnLCBbMjAwXSwgJycsIHRydWUsIChlLCByZXNwb25zZSkgPT4ge1xuICAgICAgY29uc3QgdHJhbnNmb3JtZXIgPSB0cmFuc2Zvcm1lcnMubGlmZWN5Y2xlVHJhbnNmb3JtZXIoKVxuICAgICAgaWYgKGUpIHtcbiAgICAgICAgcmV0dXJuIGNiKGUpXG4gICAgICB9XG4gICAgICBsZXQgbGlmZWN5Y2xlQ29uZmlnXG4gICAgICBwaXBlc2V0dXAocmVzcG9uc2UsIHRyYW5zZm9ybWVyKVxuICAgICAgICAub24oJ2RhdGEnLCAocmVzdWx0KSA9PiAobGlmZWN5Y2xlQ29uZmlnID0gcmVzdWx0KSlcbiAgICAgICAgLm9uKCdlcnJvcicsIChlKSA9PiBjYihlKSlcbiAgICAgICAgLm9uKCdlbmQnLCAoKSA9PiBjYihudWxsLCBsaWZlY3ljbGVDb25maWcpKVxuICAgIH0pXG4gIH1cblxuICBzZXRPYmplY3RMb2NrQ29uZmlnKGJ1Y2tldE5hbWUsIGxvY2tDb25maWdPcHRzID0ge30sIGNiKSB7XG4gICAgY29uc3QgcmV0ZW50aW9uTW9kZXMgPSBbUkVURU5USU9OX01PREVTLkNPTVBMSUFOQ0UsIFJFVEVOVElPTl9NT0RFUy5HT1ZFUk5BTkNFXVxuICAgIGNvbnN0IHZhbGlkVW5pdHMgPSBbUkVURU5USU9OX1ZBTElESVRZX1VOSVRTLkRBWVMsIFJFVEVOVElPTl9WQUxJRElUWV9VTklUUy5ZRUFSU11cblxuICAgIGlmICghaXNWYWxpZEJ1Y2tldE5hbWUoYnVja2V0TmFtZSkpIHtcbiAgICAgIHRocm93IG5ldyBlcnJvcnMuSW52YWxpZEJ1Y2tldE5hbWVFcnJvcignSW52YWxpZCBidWNrZXQgbmFtZTogJyArIGJ1Y2tldE5hbWUpXG4gICAgfVxuXG4gICAgaWYgKGxvY2tDb25maWdPcHRzLm1vZGUgJiYgIXJldGVudGlvbk1vZGVzLmluY2x1ZGVzKGxvY2tDb25maWdPcHRzLm1vZGUpKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKGBsb2NrQ29uZmlnT3B0cy5tb2RlIHNob3VsZCBiZSBvbmUgb2YgJHtyZXRlbnRpb25Nb2Rlc31gKVxuICAgIH1cbiAgICBpZiAobG9ja0NvbmZpZ09wdHMudW5pdCAmJiAhdmFsaWRVbml0cy5pbmNsdWRlcyhsb2NrQ29uZmlnT3B0cy51bml0KSkge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcihgbG9ja0NvbmZpZ09wdHMudW5pdCBzaG91bGQgYmUgb25lIG9mICR7dmFsaWRVbml0c31gKVxuICAgIH1cbiAgICBpZiAobG9ja0NvbmZpZ09wdHMudmFsaWRpdHkgJiYgIWlzTnVtYmVyKGxvY2tDb25maWdPcHRzLnZhbGlkaXR5KSkge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcihgbG9ja0NvbmZpZ09wdHMudmFsaWRpdHkgc2hvdWxkIGJlIGEgbnVtYmVyYClcbiAgICB9XG5cbiAgICBjb25zdCBtZXRob2QgPSAnUFVUJ1xuICAgIGNvbnN0IHF1ZXJ5ID0gJ29iamVjdC1sb2NrJ1xuXG4gICAgbGV0IGNvbmZpZyA9IHtcbiAgICAgIE9iamVjdExvY2tFbmFibGVkOiAnRW5hYmxlZCcsXG4gICAgfVxuICAgIGNvbnN0IGNvbmZpZ0tleXMgPSBPYmplY3Qua2V5cyhsb2NrQ29uZmlnT3B0cylcbiAgICAvLyBDaGVjayBpZiBrZXlzIGFyZSBwcmVzZW50IGFuZCBhbGwga2V5cyBhcmUgcHJlc2VudC5cbiAgICBpZiAoY29uZmlnS2V5cy5sZW5ndGggPiAwKSB7XG4gICAgICBpZiAoXy5kaWZmZXJlbmNlKGNvbmZpZ0tleXMsIFsndW5pdCcsICdtb2RlJywgJ3ZhbGlkaXR5J10pLmxlbmd0aCAhPT0gMCkge1xuICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKFxuICAgICAgICAgIGBsb2NrQ29uZmlnT3B0cy5tb2RlLGxvY2tDb25maWdPcHRzLnVuaXQsbG9ja0NvbmZpZ09wdHMudmFsaWRpdHkgYWxsIHRoZSBwcm9wZXJ0aWVzIHNob3VsZCBiZSBzcGVjaWZpZWQuYCxcbiAgICAgICAgKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY29uZmlnLlJ1bGUgPSB7XG4gICAgICAgICAgRGVmYXVsdFJldGVudGlvbjoge30sXG4gICAgICAgIH1cbiAgICAgICAgaWYgKGxvY2tDb25maWdPcHRzLm1vZGUpIHtcbiAgICAgICAgICBjb25maWcuUnVsZS5EZWZhdWx0UmV0ZW50aW9uLk1vZGUgPSBsb2NrQ29uZmlnT3B0cy5tb2RlXG4gICAgICAgIH1cbiAgICAgICAgaWYgKGxvY2tDb25maWdPcHRzLnVuaXQgPT09IFJFVEVOVElPTl9WQUxJRElUWV9VTklUUy5EQVlTKSB7XG4gICAgICAgICAgY29uZmlnLlJ1bGUuRGVmYXVsdFJldGVudGlvbi5EYXlzID0gbG9ja0NvbmZpZ09wdHMudmFsaWRpdHlcbiAgICAgICAgfSBlbHNlIGlmIChsb2NrQ29uZmlnT3B0cy51bml0ID09PSBSRVRFTlRJT05fVkFMSURJVFlfVU5JVFMuWUVBUlMpIHtcbiAgICAgICAgICBjb25maWcuUnVsZS5EZWZhdWx0UmV0ZW50aW9uLlllYXJzID0gbG9ja0NvbmZpZ09wdHMudmFsaWRpdHlcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIGNvbnN0IGJ1aWxkZXIgPSBuZXcgeG1sMmpzLkJ1aWxkZXIoe1xuICAgICAgcm9vdE5hbWU6ICdPYmplY3RMb2NrQ29uZmlndXJhdGlvbicsXG4gICAgICByZW5kZXJPcHRzOiB7IHByZXR0eTogZmFsc2UgfSxcbiAgICAgIGhlYWRsZXNzOiB0cnVlLFxuICAgIH0pXG4gICAgY29uc3QgcGF5bG9hZCA9IGJ1aWxkZXIuYnVpbGRPYmplY3QoY29uZmlnKVxuXG4gICAgY29uc3QgaGVhZGVycyA9IHt9XG4gICAgaGVhZGVyc1snQ29udGVudC1NRDUnXSA9IHRvTWQ1KHBheWxvYWQpXG5cbiAgICB0aGlzLm1ha2VSZXF1ZXN0KHsgbWV0aG9kLCBidWNrZXROYW1lLCBxdWVyeSwgaGVhZGVycyB9LCBwYXlsb2FkLCBbMjAwXSwgJycsIGZhbHNlLCBjYilcbiAgfVxuXG4gIGdldE9iamVjdExvY2tDb25maWcoYnVja2V0TmFtZSwgY2IpIHtcbiAgICBpZiAoIWlzVmFsaWRCdWNrZXROYW1lKGJ1Y2tldE5hbWUpKSB7XG4gICAgICB0aHJvdyBuZXcgZXJyb3JzLkludmFsaWRCdWNrZXROYW1lRXJyb3IoJ0ludmFsaWQgYnVja2V0IG5hbWU6ICcgKyBidWNrZXROYW1lKVxuICAgIH1cbiAgICBpZiAoIWlzRnVuY3Rpb24oY2IpKSB7XG4gICAgICB0aHJvdyBuZXcgZXJyb3JzLkludmFsaWRBcmd1bWVudEVycm9yKCdjYWxsYmFjayBzaG91bGQgYmUgb2YgdHlwZSBcImZ1bmN0aW9uXCInKVxuICAgIH1cbiAgICBjb25zdCBtZXRob2QgPSAnR0VUJ1xuICAgIGNvbnN0IHF1ZXJ5ID0gJ29iamVjdC1sb2NrJ1xuXG4gICAgdGhpcy5tYWtlUmVxdWVzdCh7IG1ldGhvZCwgYnVja2V0TmFtZSwgcXVlcnkgfSwgJycsIFsyMDBdLCAnJywgdHJ1ZSwgKGUsIHJlc3BvbnNlKSA9PiB7XG4gICAgICBpZiAoZSkge1xuICAgICAgICByZXR1cm4gY2IoZSlcbiAgICAgIH1cblxuICAgICAgbGV0IG9iamVjdExvY2tDb25maWcgPSBCdWZmZXIuZnJvbSgnJylcbiAgICAgIHBpcGVzZXR1cChyZXNwb25zZSwgdHJhbnNmb3JtZXJzLm9iamVjdExvY2tUcmFuc2Zvcm1lcigpKVxuICAgICAgICAub24oJ2RhdGEnLCAoZGF0YSkgPT4ge1xuICAgICAgICAgIG9iamVjdExvY2tDb25maWcgPSBkYXRhXG4gICAgICAgIH0pXG4gICAgICAgIC5vbignZXJyb3InLCBjYilcbiAgICAgICAgLm9uKCdlbmQnLCAoKSA9PiB7XG4gICAgICAgICAgY2IobnVsbCwgb2JqZWN0TG9ja0NvbmZpZylcbiAgICAgICAgfSlcbiAgICB9KVxuICB9XG5cbiAgcHV0T2JqZWN0UmV0ZW50aW9uKGJ1Y2tldE5hbWUsIG9iamVjdE5hbWUsIHJldGVudGlvbk9wdHMgPSB7fSwgY2IpIHtcbiAgICBpZiAoIWlzVmFsaWRCdWNrZXROYW1lKGJ1Y2tldE5hbWUpKSB7XG4gICAgICB0aHJvdyBuZXcgZXJyb3JzLkludmFsaWRCdWNrZXROYW1lRXJyb3IoJ0ludmFsaWQgYnVja2V0IG5hbWU6ICcgKyBidWNrZXROYW1lKVxuICAgIH1cbiAgICBpZiAoIWlzVmFsaWRPYmplY3ROYW1lKG9iamVjdE5hbWUpKSB7XG4gICAgICB0aHJvdyBuZXcgZXJyb3JzLkludmFsaWRPYmplY3ROYW1lRXJyb3IoYEludmFsaWQgb2JqZWN0IG5hbWU6ICR7b2JqZWN0TmFtZX1gKVxuICAgIH1cbiAgICBpZiAoIWlzT2JqZWN0KHJldGVudGlvbk9wdHMpKSB7XG4gICAgICB0aHJvdyBuZXcgZXJyb3JzLkludmFsaWRBcmd1bWVudEVycm9yKCdyZXRlbnRpb25PcHRzIHNob3VsZCBiZSBvZiB0eXBlIFwib2JqZWN0XCInKVxuICAgIH0gZWxzZSB7XG4gICAgICBpZiAocmV0ZW50aW9uT3B0cy5nb3Zlcm5hbmNlQnlwYXNzICYmICFpc0Jvb2xlYW4ocmV0ZW50aW9uT3B0cy5nb3Zlcm5hbmNlQnlwYXNzKSkge1xuICAgICAgICB0aHJvdyBuZXcgZXJyb3JzLkludmFsaWRBcmd1bWVudEVycm9yKCdJbnZhbGlkIHZhbHVlIGZvciBnb3Zlcm5hbmNlQnlwYXNzJywgcmV0ZW50aW9uT3B0cy5nb3Zlcm5hbmNlQnlwYXNzKVxuICAgICAgfVxuICAgICAgaWYgKFxuICAgICAgICByZXRlbnRpb25PcHRzLm1vZGUgJiZcbiAgICAgICAgIVtSRVRFTlRJT05fTU9ERVMuQ09NUExJQU5DRSwgUkVURU5USU9OX01PREVTLkdPVkVSTkFOQ0VdLmluY2x1ZGVzKHJldGVudGlvbk9wdHMubW9kZSlcbiAgICAgICkge1xuICAgICAgICB0aHJvdyBuZXcgZXJyb3JzLkludmFsaWRBcmd1bWVudEVycm9yKCdJbnZhbGlkIG9iamVjdCByZXRlbnRpb24gbW9kZSAnLCByZXRlbnRpb25PcHRzLm1vZGUpXG4gICAgICB9XG4gICAgICBpZiAocmV0ZW50aW9uT3B0cy5yZXRhaW5VbnRpbERhdGUgJiYgIWlzU3RyaW5nKHJldGVudGlvbk9wdHMucmV0YWluVW50aWxEYXRlKSkge1xuICAgICAgICB0aHJvdyBuZXcgZXJyb3JzLkludmFsaWRBcmd1bWVudEVycm9yKCdJbnZhbGlkIHZhbHVlIGZvciByZXRhaW5VbnRpbERhdGUnLCByZXRlbnRpb25PcHRzLnJldGFpblVudGlsRGF0ZSlcbiAgICAgIH1cbiAgICAgIGlmIChyZXRlbnRpb25PcHRzLnZlcnNpb25JZCAmJiAhaXNTdHJpbmcocmV0ZW50aW9uT3B0cy52ZXJzaW9uSWQpKSB7XG4gICAgICAgIHRocm93IG5ldyBlcnJvcnMuSW52YWxpZEFyZ3VtZW50RXJyb3IoJ0ludmFsaWQgdmFsdWUgZm9yIHZlcnNpb25JZCcsIHJldGVudGlvbk9wdHMudmVyc2lvbklkKVxuICAgICAgfVxuICAgIH1cbiAgICBpZiAoIWlzRnVuY3Rpb24oY2IpKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdjYWxsYmFjayBzaG91bGQgYmUgb2YgdHlwZSBcImZ1bmN0aW9uXCInKVxuICAgIH1cblxuICAgIGNvbnN0IG1ldGhvZCA9ICdQVVQnXG4gICAgbGV0IHF1ZXJ5ID0gJ3JldGVudGlvbidcblxuICAgIGNvbnN0IGhlYWRlcnMgPSB7fVxuICAgIGlmIChyZXRlbnRpb25PcHRzLmdvdmVybmFuY2VCeXBhc3MpIHtcbiAgICAgIGhlYWRlcnNbJ1gtQW16LUJ5cGFzcy1Hb3Zlcm5hbmNlLVJldGVudGlvbiddID0gdHJ1ZVxuICAgIH1cblxuICAgIGNvbnN0IGJ1aWxkZXIgPSBuZXcgeG1sMmpzLkJ1aWxkZXIoeyByb290TmFtZTogJ1JldGVudGlvbicsIHJlbmRlck9wdHM6IHsgcHJldHR5OiBmYWxzZSB9LCBoZWFkbGVzczogdHJ1ZSB9KVxuICAgIGNvbnN0IHBhcmFtcyA9IHt9XG5cbiAgICBpZiAocmV0ZW50aW9uT3B0cy5tb2RlKSB7XG4gICAgICBwYXJhbXMuTW9kZSA9IHJldGVudGlvbk9wdHMubW9kZVxuICAgIH1cbiAgICBpZiAocmV0ZW50aW9uT3B0cy5yZXRhaW5VbnRpbERhdGUpIHtcbiAgICAgIHBhcmFtcy5SZXRhaW5VbnRpbERhdGUgPSByZXRlbnRpb25PcHRzLnJldGFpblVudGlsRGF0ZVxuICAgIH1cbiAgICBpZiAocmV0ZW50aW9uT3B0cy52ZXJzaW9uSWQpIHtcbiAgICAgIHF1ZXJ5ICs9IGAmdmVyc2lvbklkPSR7cmV0ZW50aW9uT3B0cy52ZXJzaW9uSWR9YFxuICAgIH1cblxuICAgIGxldCBwYXlsb2FkID0gYnVpbGRlci5idWlsZE9iamVjdChwYXJhbXMpXG5cbiAgICBoZWFkZXJzWydDb250ZW50LU1ENSddID0gdG9NZDUocGF5bG9hZClcbiAgICB0aGlzLm1ha2VSZXF1ZXN0KHsgbWV0aG9kLCBidWNrZXROYW1lLCBvYmplY3ROYW1lLCBxdWVyeSwgaGVhZGVycyB9LCBwYXlsb2FkLCBbMjAwLCAyMDRdLCAnJywgZmFsc2UsIGNiKVxuICB9XG5cbiAgZ2V0T2JqZWN0UmV0ZW50aW9uKGJ1Y2tldE5hbWUsIG9iamVjdE5hbWUsIGdldE9wdHMsIGNiKSB7XG4gICAgaWYgKCFpc1ZhbGlkQnVja2V0TmFtZShidWNrZXROYW1lKSkge1xuICAgICAgdGhyb3cgbmV3IGVycm9ycy5JbnZhbGlkQnVja2V0TmFtZUVycm9yKCdJbnZhbGlkIGJ1Y2tldCBuYW1lOiAnICsgYnVja2V0TmFtZSlcbiAgICB9XG4gICAgaWYgKCFpc1ZhbGlkT2JqZWN0TmFtZShvYmplY3ROYW1lKSkge1xuICAgICAgdGhyb3cgbmV3IGVycm9ycy5JbnZhbGlkT2JqZWN0TmFtZUVycm9yKGBJbnZhbGlkIG9iamVjdCBuYW1lOiAke29iamVjdE5hbWV9YClcbiAgICB9XG4gICAgaWYgKCFpc09iamVjdChnZXRPcHRzKSkge1xuICAgICAgdGhyb3cgbmV3IGVycm9ycy5JbnZhbGlkQXJndW1lbnRFcnJvcignY2FsbGJhY2sgc2hvdWxkIGJlIG9mIHR5cGUgXCJvYmplY3RcIicpXG4gICAgfSBlbHNlIGlmIChnZXRPcHRzLnZlcnNpb25JZCAmJiAhaXNTdHJpbmcoZ2V0T3B0cy52ZXJzaW9uSWQpKSB7XG4gICAgICB0aHJvdyBuZXcgZXJyb3JzLkludmFsaWRBcmd1bWVudEVycm9yKCdWZXJzaW9uSUQgc2hvdWxkIGJlIG9mIHR5cGUgXCJzdHJpbmdcIicpXG4gICAgfVxuICAgIGlmIChjYiAmJiAhaXNGdW5jdGlvbihjYikpIHtcbiAgICAgIHRocm93IG5ldyBlcnJvcnMuSW52YWxpZEFyZ3VtZW50RXJyb3IoJ2NhbGxiYWNrIHNob3VsZCBiZSBvZiB0eXBlIFwiZnVuY3Rpb25cIicpXG4gICAgfVxuICAgIGNvbnN0IG1ldGhvZCA9ICdHRVQnXG4gICAgbGV0IHF1ZXJ5ID0gJ3JldGVudGlvbidcbiAgICBpZiAoZ2V0T3B0cy52ZXJzaW9uSWQpIHtcbiAgICAgIHF1ZXJ5ICs9IGAmdmVyc2lvbklkPSR7Z2V0T3B0cy52ZXJzaW9uSWR9YFxuICAgIH1cblxuICAgIHRoaXMubWFrZVJlcXVlc3QoeyBtZXRob2QsIGJ1Y2tldE5hbWUsIG9iamVjdE5hbWUsIHF1ZXJ5IH0sICcnLCBbMjAwXSwgJycsIHRydWUsIChlLCByZXNwb25zZSkgPT4ge1xuICAgICAgaWYgKGUpIHtcbiAgICAgICAgcmV0dXJuIGNiKGUpXG4gICAgICB9XG5cbiAgICAgIGxldCByZXRlbnRpb25Db25maWcgPSBCdWZmZXIuZnJvbSgnJylcbiAgICAgIHBpcGVzZXR1cChyZXNwb25zZSwgdHJhbnNmb3JtZXJzLm9iamVjdFJldGVudGlvblRyYW5zZm9ybWVyKCkpXG4gICAgICAgIC5vbignZGF0YScsIChkYXRhKSA9PiB7XG4gICAgICAgICAgcmV0ZW50aW9uQ29uZmlnID0gZGF0YVxuICAgICAgICB9KVxuICAgICAgICAub24oJ2Vycm9yJywgY2IpXG4gICAgICAgIC5vbignZW5kJywgKCkgPT4ge1xuICAgICAgICAgIGNiKG51bGwsIHJldGVudGlvbkNvbmZpZylcbiAgICAgICAgfSlcbiAgICB9KVxuICB9XG5cbiAgc2V0QnVja2V0RW5jcnlwdGlvbihidWNrZXROYW1lLCBlbmNyeXB0aW9uQ29uZmlnLCBjYikge1xuICAgIGlmICghaXNWYWxpZEJ1Y2tldE5hbWUoYnVja2V0TmFtZSkpIHtcbiAgICAgIHRocm93IG5ldyBlcnJvcnMuSW52YWxpZEJ1Y2tldE5hbWVFcnJvcignSW52YWxpZCBidWNrZXQgbmFtZTogJyArIGJ1Y2tldE5hbWUpXG4gICAgfVxuXG4gICAgaWYgKGlzRnVuY3Rpb24oZW5jcnlwdGlvbkNvbmZpZykpIHtcbiAgICAgIGNiID0gZW5jcnlwdGlvbkNvbmZpZ1xuICAgICAgZW5jcnlwdGlvbkNvbmZpZyA9IG51bGxcbiAgICB9XG5cbiAgICBpZiAoIV8uaXNFbXB0eShlbmNyeXB0aW9uQ29uZmlnKSAmJiBlbmNyeXB0aW9uQ29uZmlnLlJ1bGUubGVuZ3RoID4gMSkge1xuICAgICAgdGhyb3cgbmV3IGVycm9ycy5JbnZhbGlkQXJndW1lbnRFcnJvcignSW52YWxpZCBSdWxlIGxlbmd0aC4gT25seSBvbmUgcnVsZSBpcyBhbGxvd2VkLjogJyArIGVuY3J5cHRpb25Db25maWcuUnVsZSlcbiAgICB9XG4gICAgaWYgKGNiICYmICFpc0Z1bmN0aW9uKGNiKSkge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignY2FsbGJhY2sgc2hvdWxkIGJlIG9mIHR5cGUgXCJmdW5jdGlvblwiJylcbiAgICB9XG5cbiAgICBsZXQgZW5jcnlwdGlvbk9iaiA9IGVuY3J5cHRpb25Db25maWdcbiAgICBpZiAoXy5pc0VtcHR5KGVuY3J5cHRpb25Db25maWcpKSB7XG4gICAgICBlbmNyeXB0aW9uT2JqID0ge1xuICAgICAgICAvLyBEZWZhdWx0IE1pbklPIFNlcnZlciBTdXBwb3J0ZWQgUnVsZVxuICAgICAgICBSdWxlOiBbXG4gICAgICAgICAge1xuICAgICAgICAgICAgQXBwbHlTZXJ2ZXJTaWRlRW5jcnlwdGlvbkJ5RGVmYXVsdDoge1xuICAgICAgICAgICAgICBTU0VBbGdvcml0aG06ICdBRVMyNTYnLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9LFxuICAgICAgICBdLFxuICAgICAgfVxuICAgIH1cblxuICAgIGxldCBtZXRob2QgPSAnUFVUJ1xuICAgIGxldCBxdWVyeSA9ICdlbmNyeXB0aW9uJ1xuICAgIGxldCBidWlsZGVyID0gbmV3IHhtbDJqcy5CdWlsZGVyKHtcbiAgICAgIHJvb3ROYW1lOiAnU2VydmVyU2lkZUVuY3J5cHRpb25Db25maWd1cmF0aW9uJyxcbiAgICAgIHJlbmRlck9wdHM6IHsgcHJldHR5OiBmYWxzZSB9LFxuICAgICAgaGVhZGxlc3M6IHRydWUsXG4gICAgfSlcbiAgICBsZXQgcGF5bG9hZCA9IGJ1aWxkZXIuYnVpbGRPYmplY3QoZW5jcnlwdGlvbk9iailcblxuICAgIGNvbnN0IGhlYWRlcnMgPSB7fVxuICAgIGhlYWRlcnNbJ0NvbnRlbnQtTUQ1J10gPSB0b01kNShwYXlsb2FkKVxuXG4gICAgdGhpcy5tYWtlUmVxdWVzdCh7IG1ldGhvZCwgYnVja2V0TmFtZSwgcXVlcnksIGhlYWRlcnMgfSwgcGF5bG9hZCwgWzIwMF0sICcnLCBmYWxzZSwgY2IpXG4gIH1cblxuICBnZXRCdWNrZXRFbmNyeXB0aW9uKGJ1Y2tldE5hbWUsIGNiKSB7XG4gICAgaWYgKCFpc1ZhbGlkQnVja2V0TmFtZShidWNrZXROYW1lKSkge1xuICAgICAgdGhyb3cgbmV3IGVycm9ycy5JbnZhbGlkQnVja2V0TmFtZUVycm9yKCdJbnZhbGlkIGJ1Y2tldCBuYW1lOiAnICsgYnVja2V0TmFtZSlcbiAgICB9XG4gICAgaWYgKCFpc0Z1bmN0aW9uKGNiKSkge1xuICAgICAgdGhyb3cgbmV3IGVycm9ycy5JbnZhbGlkQXJndW1lbnRFcnJvcignY2FsbGJhY2sgc2hvdWxkIGJlIG9mIHR5cGUgXCJmdW5jdGlvblwiJylcbiAgICB9XG4gICAgY29uc3QgbWV0aG9kID0gJ0dFVCdcbiAgICBjb25zdCBxdWVyeSA9ICdlbmNyeXB0aW9uJ1xuXG4gICAgdGhpcy5tYWtlUmVxdWVzdCh7IG1ldGhvZCwgYnVja2V0TmFtZSwgcXVlcnkgfSwgJycsIFsyMDBdLCAnJywgdHJ1ZSwgKGUsIHJlc3BvbnNlKSA9PiB7XG4gICAgICBpZiAoZSkge1xuICAgICAgICByZXR1cm4gY2IoZSlcbiAgICAgIH1cblxuICAgICAgbGV0IGJ1Y2tldEVuY0NvbmZpZyA9IEJ1ZmZlci5mcm9tKCcnKVxuICAgICAgcGlwZXNldHVwKHJlc3BvbnNlLCB0cmFuc2Zvcm1lcnMuYnVja2V0RW5jcnlwdGlvblRyYW5zZm9ybWVyKCkpXG4gICAgICAgIC5vbignZGF0YScsIChkYXRhKSA9PiB7XG4gICAgICAgICAgYnVja2V0RW5jQ29uZmlnID0gZGF0YVxuICAgICAgICB9KVxuICAgICAgICAub24oJ2Vycm9yJywgY2IpXG4gICAgICAgIC5vbignZW5kJywgKCkgPT4ge1xuICAgICAgICAgIGNiKG51bGwsIGJ1Y2tldEVuY0NvbmZpZylcbiAgICAgICAgfSlcbiAgICB9KVxuICB9XG4gIHJlbW92ZUJ1Y2tldEVuY3J5cHRpb24oYnVja2V0TmFtZSwgY2IpIHtcbiAgICBpZiAoIWlzVmFsaWRCdWNrZXROYW1lKGJ1Y2tldE5hbWUpKSB7XG4gICAgICB0aHJvdyBuZXcgZXJyb3JzLkludmFsaWRCdWNrZXROYW1lRXJyb3IoJ0ludmFsaWQgYnVja2V0IG5hbWU6ICcgKyBidWNrZXROYW1lKVxuICAgIH1cbiAgICBpZiAoIWlzRnVuY3Rpb24oY2IpKSB7XG4gICAgICB0aHJvdyBuZXcgZXJyb3JzLkludmFsaWRBcmd1bWVudEVycm9yKCdjYWxsYmFjayBzaG91bGQgYmUgb2YgdHlwZSBcImZ1bmN0aW9uXCInKVxuICAgIH1cbiAgICBjb25zdCBtZXRob2QgPSAnREVMRVRFJ1xuICAgIGNvbnN0IHF1ZXJ5ID0gJ2VuY3J5cHRpb24nXG5cbiAgICB0aGlzLm1ha2VSZXF1ZXN0KHsgbWV0aG9kLCBidWNrZXROYW1lLCBxdWVyeSB9LCAnJywgWzIwNF0sICcnLCBmYWxzZSwgY2IpXG4gIH1cblxuICBzZXRCdWNrZXRSZXBsaWNhdGlvbihidWNrZXROYW1lLCByZXBsaWNhdGlvbkNvbmZpZyA9IHt9LCBjYikge1xuICAgIGlmICghaXNWYWxpZEJ1Y2tldE5hbWUoYnVja2V0TmFtZSkpIHtcbiAgICAgIHRocm93IG5ldyBlcnJvcnMuSW52YWxpZEJ1Y2tldE5hbWVFcnJvcignSW52YWxpZCBidWNrZXQgbmFtZTogJyArIGJ1Y2tldE5hbWUpXG4gICAgfVxuICAgIGlmICghaXNPYmplY3QocmVwbGljYXRpb25Db25maWcpKSB7XG4gICAgICB0aHJvdyBuZXcgZXJyb3JzLkludmFsaWRBcmd1bWVudEVycm9yKCdyZXBsaWNhdGlvbkNvbmZpZyBzaG91bGQgYmUgb2YgdHlwZSBcIm9iamVjdFwiJylcbiAgICB9IGVsc2Uge1xuICAgICAgaWYgKF8uaXNFbXB0eShyZXBsaWNhdGlvbkNvbmZpZy5yb2xlKSkge1xuICAgICAgICB0aHJvdyBuZXcgZXJyb3JzLkludmFsaWRBcmd1bWVudEVycm9yKCdSb2xlIGNhbm5vdCBiZSBlbXB0eScpXG4gICAgICB9IGVsc2UgaWYgKHJlcGxpY2F0aW9uQ29uZmlnLnJvbGUgJiYgIWlzU3RyaW5nKHJlcGxpY2F0aW9uQ29uZmlnLnJvbGUpKSB7XG4gICAgICAgIHRocm93IG5ldyBlcnJvcnMuSW52YWxpZEFyZ3VtZW50RXJyb3IoJ0ludmFsaWQgdmFsdWUgZm9yIHJvbGUnLCByZXBsaWNhdGlvbkNvbmZpZy5yb2xlKVxuICAgICAgfVxuICAgICAgaWYgKF8uaXNFbXB0eShyZXBsaWNhdGlvbkNvbmZpZy5ydWxlcykpIHtcbiAgICAgICAgdGhyb3cgbmV3IGVycm9ycy5JbnZhbGlkQXJndW1lbnRFcnJvcignTWluaW11bSBvbmUgcmVwbGljYXRpb24gcnVsZSBtdXN0IGJlIHNwZWNpZmllZCcpXG4gICAgICB9XG4gICAgfVxuICAgIGlmICghaXNGdW5jdGlvbihjYikpIHtcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ2NhbGxiYWNrIHNob3VsZCBiZSBvZiB0eXBlIFwiZnVuY3Rpb25cIicpXG4gICAgfVxuXG4gICAgY29uc3QgbWV0aG9kID0gJ1BVVCdcbiAgICBsZXQgcXVlcnkgPSAncmVwbGljYXRpb24nXG4gICAgY29uc3QgaGVhZGVycyA9IHt9XG5cbiAgICBjb25zdCByZXBsaWNhdGlvblBhcmFtc0NvbmZpZyA9IHtcbiAgICAgIFJlcGxpY2F0aW9uQ29uZmlndXJhdGlvbjoge1xuICAgICAgICBSb2xlOiByZXBsaWNhdGlvbkNvbmZpZy5yb2xlLFxuICAgICAgICBSdWxlOiByZXBsaWNhdGlvbkNvbmZpZy5ydWxlcyxcbiAgICAgIH0sXG4gICAgfVxuXG4gICAgY29uc3QgYnVpbGRlciA9IG5ldyB4bWwyanMuQnVpbGRlcih7IHJlbmRlck9wdHM6IHsgcHJldHR5OiBmYWxzZSB9LCBoZWFkbGVzczogdHJ1ZSB9KVxuXG4gICAgbGV0IHBheWxvYWQgPSBidWlsZGVyLmJ1aWxkT2JqZWN0KHJlcGxpY2F0aW9uUGFyYW1zQ29uZmlnKVxuXG4gICAgaGVhZGVyc1snQ29udGVudC1NRDUnXSA9IHRvTWQ1KHBheWxvYWQpXG5cbiAgICB0aGlzLm1ha2VSZXF1ZXN0KHsgbWV0aG9kLCBidWNrZXROYW1lLCBxdWVyeSwgaGVhZGVycyB9LCBwYXlsb2FkLCBbMjAwXSwgJycsIGZhbHNlLCBjYilcbiAgfVxuXG4gIGdldEJ1Y2tldFJlcGxpY2F0aW9uKGJ1Y2tldE5hbWUsIGNiKSB7XG4gICAgaWYgKCFpc1ZhbGlkQnVja2V0TmFtZShidWNrZXROYW1lKSkge1xuICAgICAgdGhyb3cgbmV3IGVycm9ycy5JbnZhbGlkQnVja2V0TmFtZUVycm9yKCdJbnZhbGlkIGJ1Y2tldCBuYW1lOiAnICsgYnVja2V0TmFtZSlcbiAgICB9XG4gICAgaWYgKCFpc0Z1bmN0aW9uKGNiKSkge1xuICAgICAgdGhyb3cgbmV3IGVycm9ycy5JbnZhbGlkQXJndW1lbnRFcnJvcignY2FsbGJhY2sgc2hvdWxkIGJlIG9mIHR5cGUgXCJmdW5jdGlvblwiJylcbiAgICB9XG4gICAgY29uc3QgbWV0aG9kID0gJ0dFVCdcbiAgICBjb25zdCBxdWVyeSA9ICdyZXBsaWNhdGlvbidcblxuICAgIHRoaXMubWFrZVJlcXVlc3QoeyBtZXRob2QsIGJ1Y2tldE5hbWUsIHF1ZXJ5IH0sICcnLCBbMjAwXSwgJycsIHRydWUsIChlLCByZXNwb25zZSkgPT4ge1xuICAgICAgaWYgKGUpIHtcbiAgICAgICAgcmV0dXJuIGNiKGUpXG4gICAgICB9XG5cbiAgICAgIGxldCByZXBsaWNhdGlvbkNvbmZpZyA9IEJ1ZmZlci5mcm9tKCcnKVxuICAgICAgcGlwZXNldHVwKHJlc3BvbnNlLCB0cmFuc2Zvcm1lcnMucmVwbGljYXRpb25Db25maWdUcmFuc2Zvcm1lcigpKVxuICAgICAgICAub24oJ2RhdGEnLCAoZGF0YSkgPT4ge1xuICAgICAgICAgIHJlcGxpY2F0aW9uQ29uZmlnID0gZGF0YVxuICAgICAgICB9KVxuICAgICAgICAub24oJ2Vycm9yJywgY2IpXG4gICAgICAgIC5vbignZW5kJywgKCkgPT4ge1xuICAgICAgICAgIGNiKG51bGwsIHJlcGxpY2F0aW9uQ29uZmlnKVxuICAgICAgICB9KVxuICAgIH0pXG4gIH1cblxuICByZW1vdmVCdWNrZXRSZXBsaWNhdGlvbihidWNrZXROYW1lLCBjYikge1xuICAgIGlmICghaXNWYWxpZEJ1Y2tldE5hbWUoYnVja2V0TmFtZSkpIHtcbiAgICAgIHRocm93IG5ldyBlcnJvcnMuSW52YWxpZEJ1Y2tldE5hbWVFcnJvcignSW52YWxpZCBidWNrZXQgbmFtZTogJyArIGJ1Y2tldE5hbWUpXG4gICAgfVxuICAgIGNvbnN0IG1ldGhvZCA9ICdERUxFVEUnXG4gICAgY29uc3QgcXVlcnkgPSAncmVwbGljYXRpb24nXG4gICAgdGhpcy5tYWtlUmVxdWVzdCh7IG1ldGhvZCwgYnVja2V0TmFtZSwgcXVlcnkgfSwgJycsIFsyMDAsIDIwNF0sICcnLCBmYWxzZSwgY2IpXG4gIH1cblxuICBnZXRPYmplY3RMZWdhbEhvbGQoYnVja2V0TmFtZSwgb2JqZWN0TmFtZSwgZ2V0T3B0cyA9IHt9LCBjYikge1xuICAgIGlmICghaXNWYWxpZEJ1Y2tldE5hbWUoYnVja2V0TmFtZSkpIHtcbiAgICAgIHRocm93IG5ldyBlcnJvcnMuSW52YWxpZEJ1Y2tldE5hbWVFcnJvcignSW52YWxpZCBidWNrZXQgbmFtZTogJyArIGJ1Y2tldE5hbWUpXG4gICAgfVxuICAgIGlmICghaXNWYWxpZE9iamVjdE5hbWUob2JqZWN0TmFtZSkpIHtcbiAgICAgIHRocm93IG5ldyBlcnJvcnMuSW52YWxpZE9iamVjdE5hbWVFcnJvcihgSW52YWxpZCBvYmplY3QgbmFtZTogJHtvYmplY3ROYW1lfWApXG4gICAgfVxuXG4gICAgaWYgKGlzRnVuY3Rpb24oZ2V0T3B0cykpIHtcbiAgICAgIGNiID0gZ2V0T3B0c1xuICAgICAgZ2V0T3B0cyA9IHt9XG4gICAgfVxuXG4gICAgaWYgKCFpc09iamVjdChnZXRPcHRzKSkge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignZ2V0T3B0cyBzaG91bGQgYmUgb2YgdHlwZSBcIk9iamVjdFwiJylcbiAgICB9IGVsc2UgaWYgKE9iamVjdC5rZXlzKGdldE9wdHMpLmxlbmd0aCA+IDAgJiYgZ2V0T3B0cy52ZXJzaW9uSWQgJiYgIWlzU3RyaW5nKGdldE9wdHMudmVyc2lvbklkKSkge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcigndmVyc2lvbklkIHNob3VsZCBiZSBvZiB0eXBlIHN0cmluZy46JywgZ2V0T3B0cy52ZXJzaW9uSWQpXG4gICAgfVxuXG4gICAgaWYgKCFpc0Z1bmN0aW9uKGNiKSkge1xuICAgICAgdGhyb3cgbmV3IGVycm9ycy5JbnZhbGlkQXJndW1lbnRFcnJvcignY2FsbGJhY2sgc2hvdWxkIGJlIG9mIHR5cGUgXCJmdW5jdGlvblwiJylcbiAgICB9XG5cbiAgICBjb25zdCBtZXRob2QgPSAnR0VUJ1xuICAgIGxldCBxdWVyeSA9ICdsZWdhbC1ob2xkJ1xuXG4gICAgaWYgKGdldE9wdHMudmVyc2lvbklkKSB7XG4gICAgICBxdWVyeSArPSBgJnZlcnNpb25JZD0ke2dldE9wdHMudmVyc2lvbklkfWBcbiAgICB9XG5cbiAgICB0aGlzLm1ha2VSZXF1ZXN0KHsgbWV0aG9kLCBidWNrZXROYW1lLCBvYmplY3ROYW1lLCBxdWVyeSB9LCAnJywgWzIwMF0sICcnLCB0cnVlLCAoZSwgcmVzcG9uc2UpID0+IHtcbiAgICAgIGlmIChlKSB7XG4gICAgICAgIHJldHVybiBjYihlKVxuICAgICAgfVxuXG4gICAgICBsZXQgbGVnYWxIb2xkQ29uZmlnID0gQnVmZmVyLmZyb20oJycpXG4gICAgICBwaXBlc2V0dXAocmVzcG9uc2UsIHRyYW5zZm9ybWVycy5vYmplY3RMZWdhbEhvbGRUcmFuc2Zvcm1lcigpKVxuICAgICAgICAub24oJ2RhdGEnLCAoZGF0YSkgPT4ge1xuICAgICAgICAgIGxlZ2FsSG9sZENvbmZpZyA9IGRhdGFcbiAgICAgICAgfSlcbiAgICAgICAgLm9uKCdlcnJvcicsIGNiKVxuICAgICAgICAub24oJ2VuZCcsICgpID0+IHtcbiAgICAgICAgICBjYihudWxsLCBsZWdhbEhvbGRDb25maWcpXG4gICAgICAgIH0pXG4gICAgfSlcbiAgfVxuXG4gIHNldE9iamVjdExlZ2FsSG9sZChidWNrZXROYW1lLCBvYmplY3ROYW1lLCBzZXRPcHRzID0ge30sIGNiKSB7XG4gICAgaWYgKCFpc1ZhbGlkQnVja2V0TmFtZShidWNrZXROYW1lKSkge1xuICAgICAgdGhyb3cgbmV3IGVycm9ycy5JbnZhbGlkQnVja2V0TmFtZUVycm9yKCdJbnZhbGlkIGJ1Y2tldCBuYW1lOiAnICsgYnVja2V0TmFtZSlcbiAgICB9XG4gICAgaWYgKCFpc1ZhbGlkT2JqZWN0TmFtZShvYmplY3ROYW1lKSkge1xuICAgICAgdGhyb3cgbmV3IGVycm9ycy5JbnZhbGlkT2JqZWN0TmFtZUVycm9yKGBJbnZhbGlkIG9iamVjdCBuYW1lOiAke29iamVjdE5hbWV9YClcbiAgICB9XG5cbiAgICBjb25zdCBkZWZhdWx0T3B0cyA9IHtcbiAgICAgIHN0YXR1czogTEVHQUxfSE9MRF9TVEFUVVMuRU5BQkxFRCxcbiAgICB9XG4gICAgaWYgKGlzRnVuY3Rpb24oc2V0T3B0cykpIHtcbiAgICAgIGNiID0gc2V0T3B0c1xuICAgICAgc2V0T3B0cyA9IGRlZmF1bHRPcHRzXG4gICAgfVxuXG4gICAgaWYgKCFpc09iamVjdChzZXRPcHRzKSkge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignc2V0T3B0cyBzaG91bGQgYmUgb2YgdHlwZSBcIk9iamVjdFwiJylcbiAgICB9IGVsc2Uge1xuICAgICAgaWYgKCFbTEVHQUxfSE9MRF9TVEFUVVMuRU5BQkxFRCwgTEVHQUxfSE9MRF9TVEFUVVMuRElTQUJMRURdLmluY2x1ZGVzKHNldE9wdHMuc3RhdHVzKSkge1xuICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdJbnZhbGlkIHN0YXR1czogJyArIHNldE9wdHMuc3RhdHVzKVxuICAgICAgfVxuICAgICAgaWYgKHNldE9wdHMudmVyc2lvbklkICYmICFzZXRPcHRzLnZlcnNpb25JZC5sZW5ndGgpIHtcbiAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcigndmVyc2lvbklkIHNob3VsZCBiZSBvZiB0eXBlIHN0cmluZy46JyArIHNldE9wdHMudmVyc2lvbklkKVxuICAgICAgfVxuICAgIH1cblxuICAgIGlmICghaXNGdW5jdGlvbihjYikpIHtcbiAgICAgIHRocm93IG5ldyBlcnJvcnMuSW52YWxpZEFyZ3VtZW50RXJyb3IoJ2NhbGxiYWNrIHNob3VsZCBiZSBvZiB0eXBlIFwiZnVuY3Rpb25cIicpXG4gICAgfVxuXG4gICAgaWYgKF8uaXNFbXB0eShzZXRPcHRzKSkge1xuICAgICAgc2V0T3B0cyA9IHtcbiAgICAgICAgZGVmYXVsdE9wdHMsXG4gICAgICB9XG4gICAgfVxuXG4gICAgY29uc3QgbWV0aG9kID0gJ1BVVCdcbiAgICBsZXQgcXVlcnkgPSAnbGVnYWwtaG9sZCdcblxuICAgIGlmIChzZXRPcHRzLnZlcnNpb25JZCkge1xuICAgICAgcXVlcnkgKz0gYCZ2ZXJzaW9uSWQ9JHtzZXRPcHRzLnZlcnNpb25JZH1gXG4gICAgfVxuXG4gICAgbGV0IGNvbmZpZyA9IHtcbiAgICAgIFN0YXR1czogc2V0T3B0cy5zdGF0dXMsXG4gICAgfVxuXG4gICAgY29uc3QgYnVpbGRlciA9IG5ldyB4bWwyanMuQnVpbGRlcih7IHJvb3ROYW1lOiAnTGVnYWxIb2xkJywgcmVuZGVyT3B0czogeyBwcmV0dHk6IGZhbHNlIH0sIGhlYWRsZXNzOiB0cnVlIH0pXG4gICAgY29uc3QgcGF5bG9hZCA9IGJ1aWxkZXIuYnVpbGRPYmplY3QoY29uZmlnKVxuICAgIGNvbnN0IGhlYWRlcnMgPSB7fVxuICAgIGhlYWRlcnNbJ0NvbnRlbnQtTUQ1J10gPSB0b01kNShwYXlsb2FkKVxuXG4gICAgdGhpcy5tYWtlUmVxdWVzdCh7IG1ldGhvZCwgYnVja2V0TmFtZSwgb2JqZWN0TmFtZSwgcXVlcnksIGhlYWRlcnMgfSwgcGF5bG9hZCwgWzIwMF0sICcnLCBmYWxzZSwgY2IpXG4gIH1cblxuICAvKipcbiAgICogSW50ZXJuYWwgTWV0aG9kIHRvIGFib3J0IGEgbXVsdGlwYXJ0IHVwbG9hZCByZXF1ZXN0IGluIGNhc2Ugb2YgYW55IGVycm9ycy5cbiAgICogQHBhcmFtIGJ1Y2tldE5hbWUgX19zdHJpbmdfXyBCdWNrZXQgTmFtZVxuICAgKiBAcGFyYW0gb2JqZWN0TmFtZSBfX3N0cmluZ19fIE9iamVjdCBOYW1lXG4gICAqIEBwYXJhbSB1cGxvYWRJZCBfX3N0cmluZ19fIGlkIG9mIGEgbXVsdGlwYXJ0IHVwbG9hZCB0byBjYW5jZWwgZHVyaW5nIGNvbXBvc2Ugb2JqZWN0IHNlcXVlbmNlLlxuICAgKiBAcGFyYW0gY2IgX19mdW5jdGlvbl9fIGNhbGxiYWNrIGZ1bmN0aW9uXG4gICAqL1xuICBhYm9ydE11bHRpcGFydFVwbG9hZChidWNrZXROYW1lLCBvYmplY3ROYW1lLCB1cGxvYWRJZCwgY2IpIHtcbiAgICBjb25zdCBtZXRob2QgPSAnREVMRVRFJ1xuICAgIGxldCBxdWVyeSA9IGB1cGxvYWRJZD0ke3VwbG9hZElkfWBcblxuICAgIGNvbnN0IHJlcXVlc3RPcHRpb25zID0geyBtZXRob2QsIGJ1Y2tldE5hbWUsIG9iamVjdE5hbWU6IG9iamVjdE5hbWUsIHF1ZXJ5IH1cbiAgICB0aGlzLm1ha2VSZXF1ZXN0KHJlcXVlc3RPcHRpb25zLCAnJywgWzIwNF0sICcnLCBmYWxzZSwgY2IpXG4gIH1cblxuICAvKipcbiAgICogSW50ZXJuYWwgbWV0aG9kIHRvIHVwbG9hZCBhIHBhcnQgZHVyaW5nIGNvbXBvc2Ugb2JqZWN0LlxuICAgKiBAcGFyYW0gcGFydENvbmZpZyBfX29iamVjdF9fIGNvbnRhaW5zIHRoZSBmb2xsb3dpbmcuXG4gICAqICAgIGJ1Y2tldE5hbWUgX19zdHJpbmdfX1xuICAgKiAgICBvYmplY3ROYW1lIF9fc3RyaW5nX19cbiAgICogICAgdXBsb2FkSUQgX19zdHJpbmdfX1xuICAgKiAgICBwYXJ0TnVtYmVyIF9fbnVtYmVyX19cbiAgICogICAgaGVhZGVycyBfX29iamVjdF9fXG4gICAqIEBwYXJhbSBjYiBjYWxsZWQgd2l0aCBudWxsIGluY2FzZSBvZiBlcnJvci5cbiAgICovXG4gIHVwbG9hZFBhcnRDb3B5KHBhcnRDb25maWcsIGNiKSB7XG4gICAgY29uc3QgeyBidWNrZXROYW1lLCBvYmplY3ROYW1lLCB1cGxvYWRJRCwgcGFydE51bWJlciwgaGVhZGVycyB9ID0gcGFydENvbmZpZ1xuXG4gICAgY29uc3QgbWV0aG9kID0gJ1BVVCdcbiAgICBsZXQgcXVlcnkgPSBgdXBsb2FkSWQ9JHt1cGxvYWRJRH0mcGFydE51bWJlcj0ke3BhcnROdW1iZXJ9YFxuICAgIGNvbnN0IHJlcXVlc3RPcHRpb25zID0geyBtZXRob2QsIGJ1Y2tldE5hbWUsIG9iamVjdE5hbWU6IG9iamVjdE5hbWUsIHF1ZXJ5LCBoZWFkZXJzIH1cbiAgICByZXR1cm4gdGhpcy5tYWtlUmVxdWVzdChyZXF1ZXN0T3B0aW9ucywgJycsIFsyMDBdLCAnJywgdHJ1ZSwgKGUsIHJlc3BvbnNlKSA9PiB7XG4gICAgICBsZXQgcGFydENvcHlSZXN1bHQgPSBCdWZmZXIuZnJvbSgnJylcbiAgICAgIGlmIChlKSB7XG4gICAgICAgIHJldHVybiBjYihlKVxuICAgICAgfVxuICAgICAgcGlwZXNldHVwKHJlc3BvbnNlLCB0cmFuc2Zvcm1lcnMudXBsb2FkUGFydFRyYW5zZm9ybWVyKCkpXG4gICAgICAgIC5vbignZGF0YScsIChkYXRhKSA9PiB7XG4gICAgICAgICAgcGFydENvcHlSZXN1bHQgPSBkYXRhXG4gICAgICAgIH0pXG4gICAgICAgIC5vbignZXJyb3InLCBjYilcbiAgICAgICAgLm9uKCdlbmQnLCAoKSA9PiB7XG4gICAgICAgICAgbGV0IHVwbG9hZFBhcnRDb3B5UmVzID0ge1xuICAgICAgICAgICAgZXRhZzogc2FuaXRpemVFVGFnKHBhcnRDb3B5UmVzdWx0LkVUYWcpLFxuICAgICAgICAgICAga2V5OiBvYmplY3ROYW1lLFxuICAgICAgICAgICAgcGFydDogcGFydE51bWJlcixcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBjYihudWxsLCB1cGxvYWRQYXJ0Q29weVJlcylcbiAgICAgICAgfSlcbiAgICB9KVxuICB9XG5cbiAgY29tcG9zZU9iamVjdChkZXN0T2JqQ29uZmlnID0ge30sIHNvdXJjZU9iakxpc3QgPSBbXSwgY2IpIHtcbiAgICBjb25zdCBtZSA9IHRoaXMgLy8gbWFueSBhc3luYyBmbG93cy4gc28gc3RvcmUgdGhlIHJlZi5cbiAgICBjb25zdCBzb3VyY2VGaWxlc0xlbmd0aCA9IHNvdXJjZU9iakxpc3QubGVuZ3RoXG5cbiAgICBpZiAoIUFycmF5LmlzQXJyYXkoc291cmNlT2JqTGlzdCkpIHtcbiAgICAgIHRocm93IG5ldyBlcnJvcnMuSW52YWxpZEFyZ3VtZW50RXJyb3IoJ3NvdXJjZUNvbmZpZyBzaG91bGQgYW4gYXJyYXkgb2YgQ29weVNvdXJjZU9wdGlvbnMgJylcbiAgICB9XG4gICAgaWYgKCEoZGVzdE9iakNvbmZpZyBpbnN0YW5jZW9mIENvcHlEZXN0aW5hdGlvbk9wdGlvbnMpKSB7XG4gICAgICB0aHJvdyBuZXcgZXJyb3JzLkludmFsaWRBcmd1bWVudEVycm9yKCdkZXN0Q29uZmlnIHNob3VsZCBvZiB0eXBlIENvcHlEZXN0aW5hdGlvbk9wdGlvbnMgJylcbiAgICB9XG5cbiAgICBpZiAoc291cmNlRmlsZXNMZW5ndGggPCAxIHx8IHNvdXJjZUZpbGVzTGVuZ3RoID4gUEFSVF9DT05TVFJBSU5UUy5NQVhfUEFSVFNfQ09VTlQpIHtcbiAgICAgIHRocm93IG5ldyBlcnJvcnMuSW52YWxpZEFyZ3VtZW50RXJyb3IoXG4gICAgICAgIGBcIlRoZXJlIG11c3QgYmUgYXMgbGVhc3Qgb25lIGFuZCB1cCB0byAke1BBUlRfQ09OU1RSQUlOVFMuTUFYX1BBUlRTX0NPVU5UfSBzb3VyY2Ugb2JqZWN0cy5gLFxuICAgICAgKVxuICAgIH1cblxuICAgIGlmICghaXNGdW5jdGlvbihjYikpIHtcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ2NhbGxiYWNrIHNob3VsZCBiZSBvZiB0eXBlIFwiZnVuY3Rpb25cIicpXG4gICAgfVxuXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBzb3VyY2VGaWxlc0xlbmd0aDsgaSsrKSB7XG4gICAgICBpZiAoIXNvdXJjZU9iakxpc3RbaV0udmFsaWRhdGUoKSkge1xuICAgICAgICByZXR1cm4gZmFsc2VcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoIWRlc3RPYmpDb25maWcudmFsaWRhdGUoKSkge1xuICAgICAgcmV0dXJuIGZhbHNlXG4gICAgfVxuXG4gICAgY29uc3QgZ2V0U3RhdE9wdGlvbnMgPSAoc3JjQ29uZmlnKSA9PiB7XG4gICAgICBsZXQgc3RhdE9wdHMgPSB7fVxuICAgICAgaWYgKCFfLmlzRW1wdHkoc3JjQ29uZmlnLlZlcnNpb25JRCkpIHtcbiAgICAgICAgc3RhdE9wdHMgPSB7XG4gICAgICAgICAgdmVyc2lvbklkOiBzcmNDb25maWcuVmVyc2lvbklELFxuICAgICAgICB9XG4gICAgICB9XG4gICAgICByZXR1cm4gc3RhdE9wdHNcbiAgICB9XG4gICAgY29uc3Qgc3JjT2JqZWN0U2l6ZXMgPSBbXVxuICAgIGxldCB0b3RhbFNpemUgPSAwXG4gICAgbGV0IHRvdGFsUGFydHMgPSAwXG5cbiAgICBjb25zdCBzb3VyY2VPYmpTdGF0cyA9IHNvdXJjZU9iakxpc3QubWFwKChzcmNJdGVtKSA9PlxuICAgICAgbWUuc3RhdE9iamVjdChzcmNJdGVtLkJ1Y2tldCwgc3JjSXRlbS5PYmplY3QsIGdldFN0YXRPcHRpb25zKHNyY0l0ZW0pKSxcbiAgICApXG5cbiAgICByZXR1cm4gUHJvbWlzZS5hbGwoc291cmNlT2JqU3RhdHMpXG4gICAgICAudGhlbigoc3JjT2JqZWN0SW5mb3MpID0+IHtcbiAgICAgICAgY29uc3QgdmFsaWRhdGVkU3RhdHMgPSBzcmNPYmplY3RJbmZvcy5tYXAoKHJlc0l0ZW1TdGF0LCBpbmRleCkgPT4ge1xuICAgICAgICAgIGNvbnN0IHNyY0NvbmZpZyA9IHNvdXJjZU9iakxpc3RbaW5kZXhdXG5cbiAgICAgICAgICBsZXQgc3JjQ29weVNpemUgPSByZXNJdGVtU3RhdC5zaXplXG4gICAgICAgICAgLy8gQ2hlY2sgaWYgYSBzZWdtZW50IGlzIHNwZWNpZmllZCwgYW5kIGlmIHNvLCBpcyB0aGVcbiAgICAgICAgICAvLyBzZWdtZW50IHdpdGhpbiBvYmplY3QgYm91bmRzP1xuICAgICAgICAgIGlmIChzcmNDb25maWcuTWF0Y2hSYW5nZSkge1xuICAgICAgICAgICAgLy8gU2luY2UgcmFuZ2UgaXMgc3BlY2lmaWVkLFxuICAgICAgICAgICAgLy8gICAgMCA8PSBzcmMuc3JjU3RhcnQgPD0gc3JjLnNyY0VuZFxuICAgICAgICAgICAgLy8gc28gb25seSBpbnZhbGlkIGNhc2UgdG8gY2hlY2sgaXM6XG4gICAgICAgICAgICBjb25zdCBzcmNTdGFydCA9IHNyY0NvbmZpZy5TdGFydFxuICAgICAgICAgICAgY29uc3Qgc3JjRW5kID0gc3JjQ29uZmlnLkVuZFxuICAgICAgICAgICAgaWYgKHNyY0VuZCA+PSBzcmNDb3B5U2l6ZSB8fCBzcmNTdGFydCA8IDApIHtcbiAgICAgICAgICAgICAgdGhyb3cgbmV3IGVycm9ycy5JbnZhbGlkQXJndW1lbnRFcnJvcihcbiAgICAgICAgICAgICAgICBgQ29weVNyY09wdGlvbnMgJHtpbmRleH0gaGFzIGludmFsaWQgc2VnbWVudC10by1jb3B5IFske3NyY1N0YXJ0fSwgJHtzcmNFbmR9XSAoc2l6ZSBpcyAke3NyY0NvcHlTaXplfSlgLFxuICAgICAgICAgICAgICApXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBzcmNDb3B5U2l6ZSA9IHNyY0VuZCAtIHNyY1N0YXJ0ICsgMVxuICAgICAgICAgIH1cblxuICAgICAgICAgIC8vIE9ubHkgdGhlIGxhc3Qgc291cmNlIG1heSBiZSBsZXNzIHRoYW4gYGFic01pblBhcnRTaXplYFxuICAgICAgICAgIGlmIChzcmNDb3B5U2l6ZSA8IFBBUlRfQ09OU1RSQUlOVFMuQUJTX01JTl9QQVJUX1NJWkUgJiYgaW5kZXggPCBzb3VyY2VGaWxlc0xlbmd0aCAtIDEpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBlcnJvcnMuSW52YWxpZEFyZ3VtZW50RXJyb3IoXG4gICAgICAgICAgICAgIGBDb3B5U3JjT3B0aW9ucyAke2luZGV4fSBpcyB0b28gc21hbGwgKCR7c3JjQ29weVNpemV9KSBhbmQgaXQgaXMgbm90IHRoZSBsYXN0IHBhcnQuYCxcbiAgICAgICAgICAgIClcbiAgICAgICAgICB9XG5cbiAgICAgICAgICAvLyBJcyBkYXRhIHRvIGNvcHkgdG9vIGxhcmdlP1xuICAgICAgICAgIHRvdGFsU2l6ZSArPSBzcmNDb3B5U2l6ZVxuICAgICAgICAgIGlmICh0b3RhbFNpemUgPiBQQVJUX0NPTlNUUkFJTlRTLk1BWF9NVUxUSVBBUlRfUFVUX09CSkVDVF9TSVpFKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgZXJyb3JzLkludmFsaWRBcmd1bWVudEVycm9yKGBDYW5ub3QgY29tcG9zZSBhbiBvYmplY3Qgb2Ygc2l6ZSAke3RvdGFsU2l6ZX0gKD4gNVRpQilgKVxuICAgICAgICAgIH1cblxuICAgICAgICAgIC8vIHJlY29yZCBzb3VyY2Ugc2l6ZVxuICAgICAgICAgIHNyY09iamVjdFNpemVzW2luZGV4XSA9IHNyY0NvcHlTaXplXG5cbiAgICAgICAgICAvLyBjYWxjdWxhdGUgcGFydHMgbmVlZGVkIGZvciBjdXJyZW50IHNvdXJjZVxuICAgICAgICAgIHRvdGFsUGFydHMgKz0gcGFydHNSZXF1aXJlZChzcmNDb3B5U2l6ZSlcbiAgICAgICAgICAvLyBEbyB3ZSBuZWVkIG1vcmUgcGFydHMgdGhhbiB3ZSBhcmUgYWxsb3dlZD9cbiAgICAgICAgICBpZiAodG90YWxQYXJ0cyA+IFBBUlRfQ09OU1RSQUlOVFMuTUFYX1BBUlRTX0NPVU5UKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgZXJyb3JzLkludmFsaWRBcmd1bWVudEVycm9yKFxuICAgICAgICAgICAgICBgWW91ciBwcm9wb3NlZCBjb21wb3NlIG9iamVjdCByZXF1aXJlcyBtb3JlIHRoYW4gJHtQQVJUX0NPTlNUUkFJTlRTLk1BWF9QQVJUU19DT1VOVH0gcGFydHNgLFxuICAgICAgICAgICAgKVxuICAgICAgICAgIH1cblxuICAgICAgICAgIHJldHVybiByZXNJdGVtU3RhdFxuICAgICAgICB9KVxuXG4gICAgICAgIGlmICgodG90YWxQYXJ0cyA9PT0gMSAmJiB0b3RhbFNpemUgPD0gUEFSVF9DT05TVFJBSU5UUy5NQVhfUEFSVF9TSVpFKSB8fCB0b3RhbFNpemUgPT09IDApIHtcbiAgICAgICAgICByZXR1cm4gdGhpcy5jb3B5T2JqZWN0KHNvdXJjZU9iakxpc3RbMF0sIGRlc3RPYmpDb25maWcsIGNiKSAvLyB1c2UgY29weU9iamVjdFYyXG4gICAgICAgIH1cblxuICAgICAgICAvLyBwcmVzZXJ2ZSBldGFnIHRvIGF2b2lkIG1vZGlmaWNhdGlvbiBvZiBvYmplY3Qgd2hpbGUgY29weWluZy5cbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBzb3VyY2VGaWxlc0xlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgc291cmNlT2JqTGlzdFtpXS5NYXRjaEVUYWcgPSB2YWxpZGF0ZWRTdGF0c1tpXS5ldGFnXG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBzcGxpdFBhcnRTaXplTGlzdCA9IHZhbGlkYXRlZFN0YXRzLm1hcCgocmVzSXRlbVN0YXQsIGlkeCkgPT4ge1xuICAgICAgICAgIGNvbnN0IGNhbFNpemUgPSBjYWxjdWxhdGVFdmVuU3BsaXRzKHNyY09iamVjdFNpemVzW2lkeF0sIHNvdXJjZU9iakxpc3RbaWR4XSlcbiAgICAgICAgICByZXR1cm4gY2FsU2l6ZVxuICAgICAgICB9KVxuXG4gICAgICAgIGZ1bmN0aW9uIGdldFVwbG9hZFBhcnRDb25maWdMaXN0KHVwbG9hZElkKSB7XG4gICAgICAgICAgY29uc3QgdXBsb2FkUGFydENvbmZpZ0xpc3QgPSBbXVxuXG4gICAgICAgICAgc3BsaXRQYXJ0U2l6ZUxpc3QuZm9yRWFjaCgoc3BsaXRTaXplLCBzcGxpdEluZGV4KSA9PiB7XG4gICAgICAgICAgICBjb25zdCB7IHN0YXJ0SW5kZXg6IHN0YXJ0SWR4LCBlbmRJbmRleDogZW5kSWR4LCBvYmpJbmZvOiBvYmpDb25maWcgfSA9IHNwbGl0U2l6ZVxuXG4gICAgICAgICAgICBsZXQgcGFydEluZGV4ID0gc3BsaXRJbmRleCArIDEgLy8gcGFydCBpbmRleCBzdGFydHMgZnJvbSAxLlxuICAgICAgICAgICAgY29uc3QgdG90YWxVcGxvYWRzID0gQXJyYXkuZnJvbShzdGFydElkeClcblxuICAgICAgICAgICAgY29uc3QgaGVhZGVycyA9IHNvdXJjZU9iakxpc3Rbc3BsaXRJbmRleF0uZ2V0SGVhZGVycygpXG5cbiAgICAgICAgICAgIHRvdGFsVXBsb2Fkcy5mb3JFYWNoKChzcGxpdFN0YXJ0LCB1cGxkQ3RySWR4KSA9PiB7XG4gICAgICAgICAgICAgIGxldCBzcGxpdEVuZCA9IGVuZElkeFt1cGxkQ3RySWR4XVxuXG4gICAgICAgICAgICAgIGNvbnN0IHNvdXJjZU9iaiA9IGAke29iakNvbmZpZy5CdWNrZXR9LyR7b2JqQ29uZmlnLk9iamVjdH1gXG4gICAgICAgICAgICAgIGhlYWRlcnNbJ3gtYW16LWNvcHktc291cmNlJ10gPSBgJHtzb3VyY2VPYmp9YFxuICAgICAgICAgICAgICBoZWFkZXJzWyd4LWFtei1jb3B5LXNvdXJjZS1yYW5nZSddID0gYGJ5dGVzPSR7c3BsaXRTdGFydH0tJHtzcGxpdEVuZH1gXG5cbiAgICAgICAgICAgICAgY29uc3QgdXBsb2FkUGFydENvbmZpZyA9IHtcbiAgICAgICAgICAgICAgICBidWNrZXROYW1lOiBkZXN0T2JqQ29uZmlnLkJ1Y2tldCxcbiAgICAgICAgICAgICAgICBvYmplY3ROYW1lOiBkZXN0T2JqQ29uZmlnLk9iamVjdCxcbiAgICAgICAgICAgICAgICB1cGxvYWRJRDogdXBsb2FkSWQsXG4gICAgICAgICAgICAgICAgcGFydE51bWJlcjogcGFydEluZGV4LFxuICAgICAgICAgICAgICAgIGhlYWRlcnM6IGhlYWRlcnMsXG4gICAgICAgICAgICAgICAgc291cmNlT2JqOiBzb3VyY2VPYmosXG4gICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICB1cGxvYWRQYXJ0Q29uZmlnTGlzdC5wdXNoKHVwbG9hZFBhcnRDb25maWcpXG4gICAgICAgICAgICB9KVxuICAgICAgICAgIH0pXG5cbiAgICAgICAgICByZXR1cm4gdXBsb2FkUGFydENvbmZpZ0xpc3RcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IHBlcmZvcm1VcGxvYWRQYXJ0cyA9ICh1cGxvYWRJZCkgPT4ge1xuICAgICAgICAgIGNvbnN0IHVwbG9hZExpc3QgPSBnZXRVcGxvYWRQYXJ0Q29uZmlnTGlzdCh1cGxvYWRJZClcblxuICAgICAgICAgIGFzeW5jLm1hcCh1cGxvYWRMaXN0LCBtZS51cGxvYWRQYXJ0Q29weS5iaW5kKG1lKSwgKGVyciwgcmVzKSA9PiB7XG4gICAgICAgICAgICBpZiAoZXJyKSB7XG4gICAgICAgICAgICAgIHJldHVybiB0aGlzLmFib3J0TXVsdGlwYXJ0VXBsb2FkKGRlc3RPYmpDb25maWcuQnVja2V0LCBkZXN0T2JqQ29uZmlnLk9iamVjdCwgdXBsb2FkSWQsIGNiKVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgcGFydHNEb25lID0gcmVzLm1hcCgocGFydENvcHkpID0+ICh7IGV0YWc6IHBhcnRDb3B5LmV0YWcsIHBhcnQ6IHBhcnRDb3B5LnBhcnQgfSkpXG4gICAgICAgICAgICByZXR1cm4gbWUuY29tcGxldGVNdWx0aXBhcnRVcGxvYWQoZGVzdE9iakNvbmZpZy5CdWNrZXQsIGRlc3RPYmpDb25maWcuT2JqZWN0LCB1cGxvYWRJZCwgcGFydHNEb25lLCBjYilcbiAgICAgICAgICB9KVxuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgbmV3VXBsb2FkSGVhZGVycyA9IGRlc3RPYmpDb25maWcuZ2V0SGVhZGVycygpXG5cbiAgICAgICAgbWUuaW5pdGlhdGVOZXdNdWx0aXBhcnRVcGxvYWQoZGVzdE9iakNvbmZpZy5CdWNrZXQsIGRlc3RPYmpDb25maWcuT2JqZWN0LCBuZXdVcGxvYWRIZWFkZXJzLCAoZXJyLCB1cGxvYWRJZCkgPT4ge1xuICAgICAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgICAgIHJldHVybiBjYihlcnIsIG51bGwpXG4gICAgICAgICAgfVxuICAgICAgICAgIHBlcmZvcm1VcGxvYWRQYXJ0cyh1cGxvYWRJZClcbiAgICAgICAgfSlcbiAgICAgIH0pXG4gICAgICAuY2F0Y2goKGVycm9yKSA9PiB7XG4gICAgICAgIGNiKGVycm9yLCBudWxsKVxuICAgICAgfSlcbiAgfVxuICBzZWxlY3RPYmplY3RDb250ZW50KGJ1Y2tldE5hbWUsIG9iamVjdE5hbWUsIHNlbGVjdE9wdHMgPSB7fSwgY2IpIHtcbiAgICBpZiAoIWlzVmFsaWRCdWNrZXROYW1lKGJ1Y2tldE5hbWUpKSB7XG4gICAgICB0aHJvdyBuZXcgZXJyb3JzLkludmFsaWRCdWNrZXROYW1lRXJyb3IoYEludmFsaWQgYnVja2V0IG5hbWU6ICR7YnVja2V0TmFtZX1gKVxuICAgIH1cbiAgICBpZiAoIWlzVmFsaWRPYmplY3ROYW1lKG9iamVjdE5hbWUpKSB7XG4gICAgICB0aHJvdyBuZXcgZXJyb3JzLkludmFsaWRPYmplY3ROYW1lRXJyb3IoYEludmFsaWQgb2JqZWN0IG5hbWU6ICR7b2JqZWN0TmFtZX1gKVxuICAgIH1cbiAgICBpZiAoIV8uaXNFbXB0eShzZWxlY3RPcHRzKSkge1xuICAgICAgaWYgKCFpc1N0cmluZyhzZWxlY3RPcHRzLmV4cHJlc3Npb24pKSB7XG4gICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ3NxbEV4cHJlc3Npb24gc2hvdWxkIGJlIG9mIHR5cGUgXCJzdHJpbmdcIicpXG4gICAgICB9XG4gICAgICBpZiAoIV8uaXNFbXB0eShzZWxlY3RPcHRzLmlucHV0U2VyaWFsaXphdGlvbikpIHtcbiAgICAgICAgaWYgKCFpc09iamVjdChzZWxlY3RPcHRzLmlucHV0U2VyaWFsaXphdGlvbikpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdpbnB1dFNlcmlhbGl6YXRpb24gc2hvdWxkIGJlIG9mIHR5cGUgXCJvYmplY3RcIicpXG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ2lucHV0U2VyaWFsaXphdGlvbiBpcyByZXF1aXJlZCcpXG4gICAgICB9XG4gICAgICBpZiAoIV8uaXNFbXB0eShzZWxlY3RPcHRzLm91dHB1dFNlcmlhbGl6YXRpb24pKSB7XG4gICAgICAgIGlmICghaXNPYmplY3Qoc2VsZWN0T3B0cy5vdXRwdXRTZXJpYWxpemF0aW9uKSkge1xuICAgICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ291dHB1dFNlcmlhbGl6YXRpb24gc2hvdWxkIGJlIG9mIHR5cGUgXCJvYmplY3RcIicpXG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ291dHB1dFNlcmlhbGl6YXRpb24gaXMgcmVxdWlyZWQnKVxuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCd2YWxpZCBzZWxlY3QgY29uZmlndXJhdGlvbiBpcyByZXF1aXJlZCcpXG4gICAgfVxuXG4gICAgaWYgKCFpc0Z1bmN0aW9uKGNiKSkge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignY2FsbGJhY2sgc2hvdWxkIGJlIG9mIHR5cGUgXCJmdW5jdGlvblwiJylcbiAgICB9XG5cbiAgICBjb25zdCBtZXRob2QgPSAnUE9TVCdcbiAgICBsZXQgcXVlcnkgPSBgc2VsZWN0YFxuICAgIHF1ZXJ5ICs9ICcmc2VsZWN0LXR5cGU9MidcblxuICAgIGNvbnN0IGNvbmZpZyA9IFtcbiAgICAgIHtcbiAgICAgICAgRXhwcmVzc2lvbjogc2VsZWN0T3B0cy5leHByZXNzaW9uLFxuICAgICAgfSxcbiAgICAgIHtcbiAgICAgICAgRXhwcmVzc2lvblR5cGU6IHNlbGVjdE9wdHMuZXhwcmVzc2lvblR5cGUgfHwgJ1NRTCcsXG4gICAgICB9LFxuICAgICAge1xuICAgICAgICBJbnB1dFNlcmlhbGl6YXRpb246IFtzZWxlY3RPcHRzLmlucHV0U2VyaWFsaXphdGlvbl0sXG4gICAgICB9LFxuICAgICAge1xuICAgICAgICBPdXRwdXRTZXJpYWxpemF0aW9uOiBbc2VsZWN0T3B0cy5vdXRwdXRTZXJpYWxpemF0aW9uXSxcbiAgICAgIH0sXG4gICAgXVxuXG4gICAgLy8gT3B0aW9uYWxcbiAgICBpZiAoc2VsZWN0T3B0cy5yZXF1ZXN0UHJvZ3Jlc3MpIHtcbiAgICAgIGNvbmZpZy5wdXNoKHsgUmVxdWVzdFByb2dyZXNzOiBzZWxlY3RPcHRzLnJlcXVlc3RQcm9ncmVzcyB9KVxuICAgIH1cbiAgICAvLyBPcHRpb25hbFxuICAgIGlmIChzZWxlY3RPcHRzLnNjYW5SYW5nZSkge1xuICAgICAgY29uZmlnLnB1c2goeyBTY2FuUmFuZ2U6IHNlbGVjdE9wdHMuc2NhblJhbmdlIH0pXG4gICAgfVxuXG4gICAgY29uc3QgYnVpbGRlciA9IG5ldyB4bWwyanMuQnVpbGRlcih7XG4gICAgICByb290TmFtZTogJ1NlbGVjdE9iamVjdENvbnRlbnRSZXF1ZXN0JyxcbiAgICAgIHJlbmRlck9wdHM6IHsgcHJldHR5OiBmYWxzZSB9LFxuICAgICAgaGVhZGxlc3M6IHRydWUsXG4gICAgfSlcbiAgICBjb25zdCBwYXlsb2FkID0gYnVpbGRlci5idWlsZE9iamVjdChjb25maWcpXG5cbiAgICB0aGlzLm1ha2VSZXF1ZXN0KHsgbWV0aG9kLCBidWNrZXROYW1lLCBvYmplY3ROYW1lLCBxdWVyeSB9LCBwYXlsb2FkLCBbMjAwXSwgJycsIHRydWUsIChlLCByZXNwb25zZSkgPT4ge1xuICAgICAgaWYgKGUpIHtcbiAgICAgICAgcmV0dXJuIGNiKGUpXG4gICAgICB9XG5cbiAgICAgIGxldCBzZWxlY3RSZXN1bHRcbiAgICAgIHBpcGVzZXR1cChyZXNwb25zZSwgdHJhbnNmb3JtZXJzLnNlbGVjdE9iamVjdENvbnRlbnRUcmFuc2Zvcm1lcigpKVxuICAgICAgICAub24oJ2RhdGEnLCAoZGF0YSkgPT4ge1xuICAgICAgICAgIHNlbGVjdFJlc3VsdCA9IHBhcnNlU2VsZWN0T2JqZWN0Q29udGVudFJlc3BvbnNlKGRhdGEpXG4gICAgICAgIH0pXG4gICAgICAgIC5vbignZXJyb3InLCBjYilcbiAgICAgICAgLm9uKCdlbmQnLCAoKSA9PiB7XG4gICAgICAgICAgY2IobnVsbCwgc2VsZWN0UmVzdWx0KVxuICAgICAgICB9KVxuICAgIH0pXG4gIH1cblxuICBnZXQgZXh0ZW5zaW9ucygpIHtcbiAgICBpZiAoIXRoaXMuY2xpZW50RXh0ZW5zaW9ucykge1xuICAgICAgdGhpcy5jbGllbnRFeHRlbnNpb25zID0gbmV3IGV4dGVuc2lvbnModGhpcylcbiAgICB9XG4gICAgcmV0dXJuIHRoaXMuY2xpZW50RXh0ZW5zaW9uc1xuICB9XG59XG5cbi8vIFByb21pc2lmeSB2YXJpb3VzIHB1YmxpYy1mYWNpbmcgQVBJcyBvbiB0aGUgQ2xpZW50IG1vZHVsZS5cbkNsaWVudC5wcm90b3R5cGUubWFrZUJ1Y2tldCA9IHByb21pc2lmeShDbGllbnQucHJvdG90eXBlLm1ha2VCdWNrZXQpXG5DbGllbnQucHJvdG90eXBlLmxpc3RCdWNrZXRzID0gcHJvbWlzaWZ5KENsaWVudC5wcm90b3R5cGUubGlzdEJ1Y2tldHMpXG5DbGllbnQucHJvdG90eXBlLmJ1Y2tldEV4aXN0cyA9IHByb21pc2lmeShDbGllbnQucHJvdG90eXBlLmJ1Y2tldEV4aXN0cylcbkNsaWVudC5wcm90b3R5cGUucmVtb3ZlQnVja2V0ID0gcHJvbWlzaWZ5KENsaWVudC5wcm90b3R5cGUucmVtb3ZlQnVja2V0KVxuXG5DbGllbnQucHJvdG90eXBlLmdldE9iamVjdCA9IHByb21pc2lmeShDbGllbnQucHJvdG90eXBlLmdldE9iamVjdClcbkNsaWVudC5wcm90b3R5cGUuZ2V0UGFydGlhbE9iamVjdCA9IHByb21pc2lmeShDbGllbnQucHJvdG90eXBlLmdldFBhcnRpYWxPYmplY3QpXG5DbGllbnQucHJvdG90eXBlLmZHZXRPYmplY3QgPSBwcm9taXNpZnkoQ2xpZW50LnByb3RvdHlwZS5mR2V0T2JqZWN0KVxuQ2xpZW50LnByb3RvdHlwZS5wdXRPYmplY3QgPSBwcm9taXNpZnkoQ2xpZW50LnByb3RvdHlwZS5wdXRPYmplY3QpXG5DbGllbnQucHJvdG90eXBlLmZQdXRPYmplY3QgPSBwcm9taXNpZnkoQ2xpZW50LnByb3RvdHlwZS5mUHV0T2JqZWN0KVxuQ2xpZW50LnByb3RvdHlwZS5jb3B5T2JqZWN0ID0gcHJvbWlzaWZ5KENsaWVudC5wcm90b3R5cGUuY29weU9iamVjdClcbkNsaWVudC5wcm90b3R5cGUuc3RhdE9iamVjdCA9IHByb21pc2lmeShDbGllbnQucHJvdG90eXBlLnN0YXRPYmplY3QpXG5DbGllbnQucHJvdG90eXBlLnJlbW92ZU9iamVjdCA9IHByb21pc2lmeShDbGllbnQucHJvdG90eXBlLnJlbW92ZU9iamVjdClcbkNsaWVudC5wcm90b3R5cGUucmVtb3ZlT2JqZWN0cyA9IHByb21pc2lmeShDbGllbnQucHJvdG90eXBlLnJlbW92ZU9iamVjdHMpXG5cbkNsaWVudC5wcm90b3R5cGUucHJlc2lnbmVkVXJsID0gcHJvbWlzaWZ5KENsaWVudC5wcm90b3R5cGUucHJlc2lnbmVkVXJsKVxuQ2xpZW50LnByb3RvdHlwZS5wcmVzaWduZWRHZXRPYmplY3QgPSBwcm9taXNpZnkoQ2xpZW50LnByb3RvdHlwZS5wcmVzaWduZWRHZXRPYmplY3QpXG5DbGllbnQucHJvdG90eXBlLnByZXNpZ25lZFB1dE9iamVjdCA9IHByb21pc2lmeShDbGllbnQucHJvdG90eXBlLnByZXNpZ25lZFB1dE9iamVjdClcbkNsaWVudC5wcm90b3R5cGUucHJlc2lnbmVkUG9zdFBvbGljeSA9IHByb21pc2lmeShDbGllbnQucHJvdG90eXBlLnByZXNpZ25lZFBvc3RQb2xpY3kpXG5DbGllbnQucHJvdG90eXBlLmdldEJ1Y2tldE5vdGlmaWNhdGlvbiA9IHByb21pc2lmeShDbGllbnQucHJvdG90eXBlLmdldEJ1Y2tldE5vdGlmaWNhdGlvbilcbkNsaWVudC5wcm90b3R5cGUuc2V0QnVja2V0Tm90aWZpY2F0aW9uID0gcHJvbWlzaWZ5KENsaWVudC5wcm90b3R5cGUuc2V0QnVja2V0Tm90aWZpY2F0aW9uKVxuQ2xpZW50LnByb3RvdHlwZS5yZW1vdmVBbGxCdWNrZXROb3RpZmljYXRpb24gPSBwcm9taXNpZnkoQ2xpZW50LnByb3RvdHlwZS5yZW1vdmVBbGxCdWNrZXROb3RpZmljYXRpb24pXG5DbGllbnQucHJvdG90eXBlLmdldEJ1Y2tldFBvbGljeSA9IHByb21pc2lmeShDbGllbnQucHJvdG90eXBlLmdldEJ1Y2tldFBvbGljeSlcbkNsaWVudC5wcm90b3R5cGUuc2V0QnVja2V0UG9saWN5ID0gcHJvbWlzaWZ5KENsaWVudC5wcm90b3R5cGUuc2V0QnVja2V0UG9saWN5KVxuQ2xpZW50LnByb3RvdHlwZS5yZW1vdmVJbmNvbXBsZXRlVXBsb2FkID0gcHJvbWlzaWZ5KENsaWVudC5wcm90b3R5cGUucmVtb3ZlSW5jb21wbGV0ZVVwbG9hZClcbkNsaWVudC5wcm90b3R5cGUuZ2V0QnVja2V0VmVyc2lvbmluZyA9IHByb21pc2lmeShDbGllbnQucHJvdG90eXBlLmdldEJ1Y2tldFZlcnNpb25pbmcpXG5DbGllbnQucHJvdG90eXBlLnNldEJ1Y2tldFZlcnNpb25pbmcgPSBwcm9taXNpZnkoQ2xpZW50LnByb3RvdHlwZS5zZXRCdWNrZXRWZXJzaW9uaW5nKVxuQ2xpZW50LnByb3RvdHlwZS5zZXRCdWNrZXRUYWdnaW5nID0gcHJvbWlzaWZ5KENsaWVudC5wcm90b3R5cGUuc2V0QnVja2V0VGFnZ2luZylcbkNsaWVudC5wcm90b3R5cGUucmVtb3ZlQnVja2V0VGFnZ2luZyA9IHByb21pc2lmeShDbGllbnQucHJvdG90eXBlLnJlbW92ZUJ1Y2tldFRhZ2dpbmcpXG5DbGllbnQucHJvdG90eXBlLmdldEJ1Y2tldFRhZ2dpbmcgPSBwcm9taXNpZnkoQ2xpZW50LnByb3RvdHlwZS5nZXRCdWNrZXRUYWdnaW5nKVxuQ2xpZW50LnByb3RvdHlwZS5zZXRPYmplY3RUYWdnaW5nID0gcHJvbWlzaWZ5KENsaWVudC5wcm90b3R5cGUuc2V0T2JqZWN0VGFnZ2luZylcbkNsaWVudC5wcm90b3R5cGUucmVtb3ZlT2JqZWN0VGFnZ2luZyA9IHByb21pc2lmeShDbGllbnQucHJvdG90eXBlLnJlbW92ZU9iamVjdFRhZ2dpbmcpXG5DbGllbnQucHJvdG90eXBlLmdldE9iamVjdFRhZ2dpbmcgPSBwcm9taXNpZnkoQ2xpZW50LnByb3RvdHlwZS5nZXRPYmplY3RUYWdnaW5nKVxuQ2xpZW50LnByb3RvdHlwZS5zZXRCdWNrZXRMaWZlY3ljbGUgPSBwcm9taXNpZnkoQ2xpZW50LnByb3RvdHlwZS5zZXRCdWNrZXRMaWZlY3ljbGUpXG5DbGllbnQucHJvdG90eXBlLmdldEJ1Y2tldExpZmVjeWNsZSA9IHByb21pc2lmeShDbGllbnQucHJvdG90eXBlLmdldEJ1Y2tldExpZmVjeWNsZSlcbkNsaWVudC5wcm90b3R5cGUucmVtb3ZlQnVja2V0TGlmZWN5Y2xlID0gcHJvbWlzaWZ5KENsaWVudC5wcm90b3R5cGUucmVtb3ZlQnVja2V0TGlmZWN5Y2xlKVxuQ2xpZW50LnByb3RvdHlwZS5zZXRPYmplY3RMb2NrQ29uZmlnID0gcHJvbWlzaWZ5KENsaWVudC5wcm90b3R5cGUuc2V0T2JqZWN0TG9ja0NvbmZpZylcbkNsaWVudC5wcm90b3R5cGUuZ2V0T2JqZWN0TG9ja0NvbmZpZyA9IHByb21pc2lmeShDbGllbnQucHJvdG90eXBlLmdldE9iamVjdExvY2tDb25maWcpXG5DbGllbnQucHJvdG90eXBlLnB1dE9iamVjdFJldGVudGlvbiA9IHByb21pc2lmeShDbGllbnQucHJvdG90eXBlLnB1dE9iamVjdFJldGVudGlvbilcbkNsaWVudC5wcm90b3R5cGUuZ2V0T2JqZWN0UmV0ZW50aW9uID0gcHJvbWlzaWZ5KENsaWVudC5wcm90b3R5cGUuZ2V0T2JqZWN0UmV0ZW50aW9uKVxuQ2xpZW50LnByb3RvdHlwZS5zZXRCdWNrZXRFbmNyeXB0aW9uID0gcHJvbWlzaWZ5KENsaWVudC5wcm90b3R5cGUuc2V0QnVja2V0RW5jcnlwdGlvbilcbkNsaWVudC5wcm90b3R5cGUuZ2V0QnVja2V0RW5jcnlwdGlvbiA9IHByb21pc2lmeShDbGllbnQucHJvdG90eXBlLmdldEJ1Y2tldEVuY3J5cHRpb24pXG5DbGllbnQucHJvdG90eXBlLnJlbW92ZUJ1Y2tldEVuY3J5cHRpb24gPSBwcm9taXNpZnkoQ2xpZW50LnByb3RvdHlwZS5yZW1vdmVCdWNrZXRFbmNyeXB0aW9uKVxuQ2xpZW50LnByb3RvdHlwZS5zZXRCdWNrZXRSZXBsaWNhdGlvbiA9IHByb21pc2lmeShDbGllbnQucHJvdG90eXBlLnNldEJ1Y2tldFJlcGxpY2F0aW9uKVxuQ2xpZW50LnByb3RvdHlwZS5nZXRCdWNrZXRSZXBsaWNhdGlvbiA9IHByb21pc2lmeShDbGllbnQucHJvdG90eXBlLmdldEJ1Y2tldFJlcGxpY2F0aW9uKVxuQ2xpZW50LnByb3RvdHlwZS5yZW1vdmVCdWNrZXRSZXBsaWNhdGlvbiA9IHByb21pc2lmeShDbGllbnQucHJvdG90eXBlLnJlbW92ZUJ1Y2tldFJlcGxpY2F0aW9uKVxuQ2xpZW50LnByb3RvdHlwZS5zZXRPYmplY3RMZWdhbEhvbGQgPSBwcm9taXNpZnkoQ2xpZW50LnByb3RvdHlwZS5zZXRPYmplY3RMZWdhbEhvbGQpXG5DbGllbnQucHJvdG90eXBlLmdldE9iamVjdExlZ2FsSG9sZCA9IHByb21pc2lmeShDbGllbnQucHJvdG90eXBlLmdldE9iamVjdExlZ2FsSG9sZClcbkNsaWVudC5wcm90b3R5cGUuY29tcG9zZU9iamVjdCA9IHByb21pc2lmeShDbGllbnQucHJvdG90eXBlLmNvbXBvc2VPYmplY3QpXG5DbGllbnQucHJvdG90eXBlLnNlbGVjdE9iamVjdENvbnRlbnQgPSBwcm9taXNpZnkoQ2xpZW50LnByb3RvdHlwZS5zZWxlY3RPYmplY3RDb250ZW50KVxuIl0sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7O0FBZ0JBLElBQUFBLEVBQUEsR0FBQUMsdUJBQUEsQ0FBQUMsT0FBQTtBQUNBLElBQUFDLElBQUEsR0FBQUYsdUJBQUEsQ0FBQUMsT0FBQTtBQUNBLElBQUFFLE1BQUEsR0FBQUgsdUJBQUEsQ0FBQUMsT0FBQTtBQUVBLElBQUFHLE1BQUEsR0FBQUgsT0FBQTtBQUNBLElBQUFJLFlBQUEsR0FBQUosT0FBQTtBQUNBLElBQUFLLE9BQUEsR0FBQUwsT0FBQTtBQUNBLElBQUFNLFdBQUEsR0FBQVAsdUJBQUEsQ0FBQUMsT0FBQTtBQUNBLElBQUFPLFlBQUEsR0FBQVAsT0FBQTtBQUNBLElBQUFRLElBQUEsR0FBQVIsT0FBQTtBQUNBLElBQUFTLE9BQUEsR0FBQVQsT0FBQTtBQUVBLElBQUFVLE1BQUEsR0FBQVgsdUJBQUEsQ0FBQUMsT0FBQTtBQUNBLElBQUFXLFdBQUEsR0FBQVgsT0FBQTtBQUNBLElBQUFZLFFBQUEsR0FBQVosT0FBQTtBQXlDQWEsTUFBQSxDQUFBQyxJQUFBLENBQUFGLFFBQUEsRUFBQUcsT0FBQSxXQUFBQyxHQUFBO0VBQUEs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