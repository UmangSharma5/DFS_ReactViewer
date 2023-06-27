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

import * as fs from "fs";
import * as path from "path";
import * as Stream from "stream";
import async from 'async';
import BlockStream2 from 'block-stream2';
import _ from 'lodash';
import * as querystring from 'query-string';
import { TextEncoder } from 'web-encoding';
import Xml from 'xml';
import xml2js from 'xml2js';
import * as errors from "./errors.mjs";
import { extensions } from "./extensions.mjs";
import { CopyDestinationOptions, CopySourceOptions, DEFAULT_REGION } from "./helpers.mjs";
import { TypedClient } from "./internal/client.mjs";
import { CopyConditions } from "./internal/copy-conditions.mjs";
import { calculateEvenSplits, extractMetadata, getScope, getSourceVersionId, getVersionId, insertContentType, isBoolean, isFunction, isNumber, isObject, isReadableStream, isString, isValidBucketName, isValidDate, isValidObjectName, isValidPrefix, makeDateLong, PART_CONSTRAINTS, partsRequired, pipesetup, prependXAMZMeta, readableStream, sanitizeETag, toMd5, toSha256, uriEscape, uriResourceEscape } from "./internal/helper.mjs";
import { PostPolicy } from "./internal/post-policy.mjs";
import { LEGAL_HOLD_STATUS, RETENTION_MODES, RETENTION_VALIDITY_UNITS } from "./internal/type.mjs";
import { NotificationConfig, NotificationPoller } from "./notification.mjs";
import { ObjectUploader } from "./object-uploader.mjs";
import { promisify } from "./promisify.mjs";
import { postPresignSignatureV4, presignSignatureV4, signV4 } from "./signing.mjs";
import * as transformers from "./transformers.mjs";
import { parseSelectObjectContentResponse } from "./xml-parsers.mjs";
export * from "./helpers.mjs";
export * from "./notification.mjs";
export { CopyConditions, PostPolicy };
export class Client extends TypedClient {
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
    if (!isString(appName)) {
      throw new TypeError(`Invalid appName: ${appName}`);
    }
    if (appName.trim() === '') {
      throw new errors.InvalidArgumentError('Input appName cannot be empty.');
    }
    if (!isString(appVersion)) {
      throw new TypeError(`Invalid appVersion: ${appVersion}`);
    }
    if (appVersion.trim() === '') {
      throw new errors.InvalidArgumentError('Input appVersion cannot be empty.');
    }
    this.userAgent = `${this.userAgent} ${appName}/${appVersion}`;
  }

  // Calculate part size given the object size. Part size will be atleast this.partSize
  calculatePartSize(size) {
    if (!isNumber(size)) {
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
    if (!isObject(reqOptions)) {
      throw new TypeError('reqOptions should be of type "object"');
    }
    if (response && !isReadableStream(response)) {
      throw new TypeError('response should be of type "Stream"');
    }
    if (err && !(err instanceof Error)) {
      throw new TypeError('err should be of type "Error"');
    }
    var logHeaders = headers => {
      _.forEach(headers, (v, k) => {
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
    if (!isObject(options)) {
      throw new TypeError('options should be of type "object"');
    }
    if (!isString(payload) && !isObject(payload)) {
      // Buffer is of type 'object'
      throw new TypeError('payload should be of type "string" or "Buffer"');
    }
    statusCodes.forEach(statusCode => {
      if (!isNumber(statusCode)) {
        throw new TypeError('statusCode should be of type "number"');
      }
    });
    if (!isString(region)) {
      throw new TypeError('region should be of type "string"');
    }
    if (!isBoolean(returnResponse)) {
      throw new TypeError('returnResponse should be of type "boolean"');
    }
    if (!isFunction(cb)) {
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
      sha256sum = toSha256(payload);
    }
    var stream = readableStream(payload);
    this.makeRequestStream(options, stream, sha256sum, statusCodes, region, returnResponse, cb);
  }

  // makeRequestStream will be used directly instead of makeRequest in case the payload
  // is available as a stream. for ex. putObject
  makeRequestStream(options, stream, sha256sum, statusCodes, region, returnResponse, cb) {
    if (!isObject(options)) {
      throw new TypeError('options should be of type "object"');
    }
    if (!isReadableStream(stream)) {
      throw new errors.InvalidArgumentError('stream should be a readable Stream');
    }
    if (!isString(sha256sum)) {
      throw new TypeError('sha256sum should be of type "string"');
    }
    statusCodes.forEach(statusCode => {
      if (!isNumber(statusCode)) {
        throw new TypeError('statusCode should be of type "number"');
      }
    });
    if (!isString(region)) {
      throw new TypeError('region should be of type "string"');
    }
    if (!isBoolean(returnResponse)) {
      throw new TypeError('returnResponse should be of type "boolean"');
    }
    if (!isFunction(cb)) {
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
        reqOptions.headers['x-amz-date'] = makeDateLong(date);
        reqOptions.headers['x-amz-content-sha256'] = sha256sum;
        if (this.sessionToken) {
          reqOptions.headers['x-amz-security-token'] = this.sessionToken;
        }
        this.checkAndRefreshCreds();
        var authorization = signV4(reqOptions, this.accessKey, this.secretKey, region, date, sha256sum);
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
          pipesetup(response, errorTransformer).on('error', e => {
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
      let pipe = pipesetup(stream, req);
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
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError(`Invalid bucket name : ${bucketName}`);
    }
    if (!isFunction(cb)) {
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
      var region = DEFAULT_REGION;
      pipesetup(response, transformer).on('error', cb).on('data', data => {
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
    }, '', [200], DEFAULT_REGION, true, (e, response) => {
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
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName);
    }
    // Backward Compatibility
    if (isObject(region)) {
      cb = makeOpts;
      makeOpts = region;
      region = '';
    }
    if (isFunction(region)) {
      cb = region;
      region = '';
      makeOpts = {};
    }
    if (isFunction(makeOpts)) {
      cb = makeOpts;
      makeOpts = {};
    }
    if (!isString(region)) {
      throw new TypeError('region should be of type "string"');
    }
    if (!isObject(makeOpts)) {
      throw new TypeError('makeOpts should be of type "object"');
    }
    if (!isFunction(cb)) {
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
    if (region && region !== DEFAULT_REGION) {
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
      payload = Xml(payloadObject);
    }
    var method = 'PUT';
    var headers = {};
    if (makeOpts.ObjectLocking) {
      headers['x-amz-bucket-object-lock-enabled'] = true;
    }
    if (!region) {
      region = DEFAULT_REGION;
    }
    const processWithRetry = err => {
      if (err && (region === '' || region === DEFAULT_REGION)) {
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
    if (!isFunction(cb)) {
      throw new TypeError('callback should be of type "function"');
    }
    var method = 'GET';
    this.makeRequest({
      method
    }, '', [200], DEFAULT_REGION, true, (e, response) => {
      if (e) {
        return cb(e);
      }
      var transformer = transformers.getListBucketTransformer();
      var buckets;
      pipesetup(response, transformer).on('data', result => buckets = result).on('error', e => cb(e)).on('end', () => cb(null, buckets));
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
    if (!isValidBucketName(bucket)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucket);
    }
    if (!isValidPrefix(prefix)) {
      throw new errors.InvalidPrefixError(`Invalid prefix : ${prefix}`);
    }
    if (!isBoolean(recursive)) {
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
        async.eachSeries(result.uploads, (upload, cb) => {
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
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName);
    }
    if (!isFunction(cb)) {
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
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName);
    }
    if (!isFunction(cb)) {
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
    if (!isValidBucketName(bucketName)) {
      throw new errors.IsValidBucketNameError('Invalid bucket name: ' + bucketName);
    }
    if (!isValidObjectName(objectName)) {
      throw new errors.InvalidObjectNameError(`Invalid object name: ${objectName}`);
    }
    if (!isFunction(cb)) {
      throw new TypeError('callback should be of type "function"');
    }
    var removeUploadId;
    async.during(cb => {
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
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName);
    }
    if (!isValidObjectName(objectName)) {
      throw new errors.InvalidObjectNameError(`Invalid object name: ${objectName}`);
    }
    if (!isString(filePath)) {
      throw new TypeError('filePath should be of type "string"');
    }
    // Backward Compatibility
    if (isFunction(getOpts)) {
      cb = getOpts;
      getOpts = {};
    }
    if (!isFunction(cb)) {
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
    async.waterfall([cb => this.statObject(bucketName, objectName, getOpts, cb), (result, cb) => {
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
      pipesetup(downloadStream, partFileStream).on('error', e => cb(e)).on('finish', cb);
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
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName);
    }
    if (!isValidObjectName(objectName)) {
      throw new errors.InvalidObjectNameError(`Invalid object name: ${objectName}`);
    }
    // Backward Compatibility
    if (isFunction(getOpts)) {
      cb = getOpts;
      getOpts = {};
    }
    if (!isFunction(cb)) {
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
    if (isFunction(length)) {
      cb = length;
      length = 0;
    }
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName);
    }
    if (!isValidObjectName(objectName)) {
      throw new errors.InvalidObjectNameError(`Invalid object name: ${objectName}`);
    }
    if (!isNumber(offset)) {
      throw new TypeError('offset should be of type "number"');
    }
    if (!isNumber(length)) {
      throw new TypeError('length should be of type "number"');
    }
    // Backward Compatibility
    if (isFunction(getOpts)) {
      cb = getOpts;
      getOpts = {};
    }
    if (!isFunction(cb)) {
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
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName);
    }
    if (!isValidObjectName(objectName)) {
      throw new errors.InvalidObjectNameError(`Invalid object name: ${objectName}`);
    }
    if (!isString(filePath)) {
      throw new TypeError('filePath should be of type "string"');
    }
    if (isFunction(metaData)) {
      callback = metaData;
      metaData = {}; // Set metaData empty if no metaData provided.
    }

    if (!isObject(metaData)) {
      throw new TypeError('metaData should be of type "object"');
    }

    // Inserts correct `content-type` attribute based on metaData and filePath
    metaData = insertContentType(metaData, filePath);

    // Updates metaData to have the correct prefix if needed
    metaData = prependXAMZMeta(metaData);
    var size;
    var partSize;
    async.waterfall([cb => fs.stat(filePath, cb), (stats, cb) => {
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
        pipesetup(fs.createReadStream(filePath, options), hash).on('data', data => {
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
      async.whilst(cb => {
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
        pipesetup(fs.createReadStream(filePath, options), hash).on('data', data => {
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
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName);
    }
    if (!isValidObjectName(objectName)) {
      throw new errors.InvalidObjectNameError(`Invalid object name: ${objectName}`);
    }

    // We'll need to shift arguments to the left because of size and metaData.
    if (isFunction(size)) {
      callback = size;
      metaData = {};
    } else if (isFunction(metaData)) {
      callback = metaData;
      metaData = {};
    }

    // We'll need to shift arguments to the left because of metaData
    // and size being optional.
    if (isObject(size)) {
      metaData = size;
    }

    // Ensures Metadata has appropriate prefix for A3 API
    metaData = prependXAMZMeta(metaData);
    if (typeof stream === 'string' || stream instanceof Buffer) {
      // Adapts the non-stream interface into a stream.
      size = stream.length;
      stream = readableStream(stream);
    } else if (!isReadableStream(stream)) {
      throw new TypeError('third argument should be of type "stream.Readable" or "Buffer" or "string"');
    }
    if (!isFunction(callback)) {
      throw new TypeError('callback should be of type "function"');
    }
    if (isNumber(size) && size < 0) {
      throw new errors.InvalidArgumentError(`size cannot be negative, given size: ${size}`);
    }

    // Get the part size and forward that to the BlockStream. Default to the
    // largest block size possible if necessary.
    if (!isNumber(size)) {
      size = this.maxObjectSize;
    }
    size = this.calculatePartSize(size);

    // s3 requires that all non-end chunks be at least `this.partSize`,
    // so we chunk the stream until we hit either that size or the end before
    // we flush it to s3.
    let chunker = new BlockStream2({
      size,
      zeroPadding: false
    });

    // This is a Writable stream that can be written to in order to upload
    // to the specified bucket and object automatically.
    let uploader = new ObjectUploader(this, bucketName, objectName, size, metaData, callback);
    // stream => chunker => uploader
    pipesetup(stream, chunker, uploader);
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
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName);
    }
    if (!isValidObjectName(objectName)) {
      throw new errors.InvalidObjectNameError(`Invalid object name: ${objectName}`);
    }
    if (!isString(srcObject)) {
      throw new TypeError('srcObject should be of type "string"');
    }
    if (srcObject === '') {
      throw new errors.InvalidPrefixError(`Empty source prefix`);
    }
    if (conditions !== null && !(conditions instanceof CopyConditions)) {
      throw new TypeError('conditions should be of type "CopyConditions"');
    }
    var headers = {};
    headers['x-amz-copy-source'] = uriResourceEscape(srcObject);
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
      pipesetup(response, transformer).on('error', e => cb(e)).on('data', data => cb(null, data));
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
    if (!(sourceConfig instanceof CopySourceOptions)) {
      throw new errors.InvalidArgumentError('sourceConfig should of type CopySourceOptions ');
    }
    if (!(destConfig instanceof CopyDestinationOptions)) {
      throw new errors.InvalidArgumentError('destConfig should of type CopyDestinationOptions ');
    }
    if (!destConfig.validate()) {
      return false;
    }
    if (!destConfig.validate()) {
      return false;
    }
    if (!isFunction(cb)) {
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
      pipesetup(response, transformer).on('error', e => cb(e)).on('data', data => {
        const resHeaders = response.headers;
        const copyObjResponse = {
          Bucket: destConfig.Bucket,
          Key: destConfig.Object,
          LastModified: data.LastModified,
          MetaData: extractMetadata(resHeaders),
          VersionId: getVersionId(resHeaders),
          SourceVersionId: getSourceVersionId(resHeaders),
          Etag: sanitizeETag(resHeaders.etag),
          Size: +resHeaders['content-length']
        };
        return cb(null, copyObjResponse);
      });
    });
  }

  // Backward compatibility for Copy Object API.
  copyObject(...allArgs) {
    if (allArgs[0] instanceof CopySourceOptions && allArgs[1] instanceof CopyDestinationOptions) {
      return this.copyObjectV2(...arguments);
    }
    return this.copyObjectV1(...arguments);
  }

  // list a batch of objects
  listObjectsQuery(bucketName, prefix, marker, listQueryOpts = {}) {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName);
    }
    if (!isString(prefix)) {
      throw new TypeError('prefix should be of type "string"');
    }
    if (!isString(marker)) {
      throw new TypeError('marker should be of type "string"');
    }
    let {
      Delimiter,
      MaxKeys,
      IncludeVersion
    } = listQueryOpts;
    if (!isObject(listQueryOpts)) {
      throw new TypeError('listQueryOpts should be of type "object"');
    }
    if (!isString(Delimiter)) {
      throw new TypeError('Delimiter should be of type "string"');
    }
    if (!isNumber(MaxKeys)) {
      throw new TypeError('MaxKeys should be of type "number"');
    }
    const queries = [];
    // escape every value in query string, except maxKeys
    queries.push(`prefix=${uriEscape(prefix)}`);
    queries.push(`delimiter=${uriEscape(Delimiter)}`);
    queries.push(`encoding-type=url`);
    if (IncludeVersion) {
      queries.push(`versions`);
    }
    if (marker) {
      marker = uriEscape(marker);
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
      pipesetup(response, transformer);
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
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName);
    }
    if (!isValidPrefix(prefix)) {
      throw new errors.InvalidPrefixError(`Invalid prefix : ${prefix}`);
    }
    if (!isString(prefix)) {
      throw new TypeError('prefix should be of type "string"');
    }
    if (!isBoolean(recursive)) {
      throw new TypeError('recursive should be of type "boolean"');
    }
    if (!isObject(listOpts)) {
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
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName);
    }
    if (!isString(prefix)) {
      throw new TypeError('prefix should be of type "string"');
    }
    if (!isString(continuationToken)) {
      throw new TypeError('continuationToken should be of type "string"');
    }
    if (!isString(delimiter)) {
      throw new TypeError('delimiter should be of type "string"');
    }
    if (!isNumber(maxKeys)) {
      throw new TypeError('maxKeys should be of type "number"');
    }
    if (!isString(startAfter)) {
      throw new TypeError('startAfter should be of type "string"');
    }
    var queries = [];

    // Call for listing objects v2 API
    queries.push(`list-type=2`);
    queries.push(`encoding-type=url`);

    // escape every value in query string, except maxKeys
    queries.push(`prefix=${uriEscape(prefix)}`);
    queries.push(`delimiter=${uriEscape(delimiter)}`);
    if (continuationToken) {
      continuationToken = uriEscape(continuationToken);
      queries.push(`continuation-token=${continuationToken}`);
    }
    // Set start-after
    if (startAfter) {
      startAfter = uriEscape(startAfter);
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
      pipesetup(response, transformer);
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
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName);
    }
    if (!isValidPrefix(prefix)) {
      throw new errors.InvalidPrefixError(`Invalid prefix : ${prefix}`);
    }
    if (!isString(prefix)) {
      throw new TypeError('prefix should be of type "string"');
    }
    if (!isBoolean(recursive)) {
      throw new TypeError('recursive should be of type "boolean"');
    }
    if (!isString(startAfter)) {
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
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName);
    }
    if (!isValidObjectName(objectName)) {
      throw new errors.InvalidObjectNameError(`Invalid object name: ${objectName}`);
    }
    // backward compatibility
    if (isFunction(statOpts)) {
      cb = statOpts;
      statOpts = {};
    }
    if (!isObject(statOpts)) {
      throw new errors.InvalidArgumentError('statOpts should be of type "object"');
    }
    if (!isFunction(cb)) {
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
        metaData: extractMetadata(response.headers),
        lastModified: new Date(response.headers['last-modified']),
        versionId: getVersionId(response.headers),
        etag: sanitizeETag(response.headers.etag)
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
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName);
    }
    if (!isValidObjectName(objectName)) {
      throw new errors.InvalidObjectNameError(`Invalid object name: ${objectName}`);
    }
    // backward compatibility
    if (isFunction(removeOpts)) {
      cb = removeOpts;
      removeOpts = {};
    }
    if (!isObject(removeOpts)) {
      throw new errors.InvalidArgumentError('removeOpts should be of type "object"');
    }
    if (!isFunction(cb)) {
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
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName);
    }
    if (!Array.isArray(objectsList)) {
      throw new errors.InvalidArgumentError('objectsList should be a list');
    }
    if (!isFunction(cb)) {
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
    const encoder = new TextEncoder();
    const batchResults = [];
    async.eachSeries(result.listOfList, (list, batchCb) => {
      var objects = [];
      list.forEach(function (value) {
        if (isObject(value)) {
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
      const builder = new xml2js.Builder({
        headless: true
      });
      let payload = builder.buildObject(deleteObjects);
      payload = encoder.encode(payload);
      const headers = {};
      headers['Content-MD5'] = toMd5(payload);
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
        pipesetup(response, transformers.removeObjectsTransformer()).on('data', data => {
          removeObjectsResult = data;
        }).on('error', e => {
          return batchCb(e, null);
        }).on('end', () => {
          batchResults.push(removeObjectsResult);
          return batchCb(null, removeObjectsResult);
        });
      });
    }, () => {
      cb(null, _.flatten(batchResults));
    });
  }

  // Get the policy on a bucket or an object prefix.
  //
  // __Arguments__
  // * `bucketName` _string_: name of the bucket
  // * `callback(err, policy)` _function_: callback function
  getBucketPolicy(bucketName, cb) {
    // Validate arguments.
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError(`Invalid bucket name: ${bucketName}`);
    }
    if (!isFunction(cb)) {
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
      pipesetup(response, transformers.getConcater()).on('data', data => policy = data).on('error', cb).on('end', () => {
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
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError(`Invalid bucket name: ${bucketName}`);
    }
    if (!isString(policy)) {
      throw new errors.InvalidBucketPolicyError(`Invalid bucket policy: ${policy} - must be "string"`);
    }
    if (!isFunction(cb)) {
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
    if (isFunction(requestDate)) {
      cb = requestDate;
      requestDate = new Date();
    }
    if (isFunction(reqParams)) {
      cb = reqParams;
      reqParams = {};
      requestDate = new Date();
    }
    if (isFunction(expires)) {
      cb = expires;
      reqParams = {};
      expires = 24 * 60 * 60 * 7; // 7 days in seconds
      requestDate = new Date();
    }
    if (!isNumber(expires)) {
      throw new TypeError('expires should be of type "number"');
    }
    if (!isObject(reqParams)) {
      throw new TypeError('reqParams should be of type "object"');
    }
    if (!isValidDate(requestDate)) {
      throw new TypeError('requestDate should be of type "Date" and valid');
    }
    if (!isFunction(cb)) {
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
        url = presignSignatureV4(reqOptions, this.accessKey, this.secretKey, this.sessionToken, region, requestDate, expires);
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
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName);
    }
    if (!isValidObjectName(objectName)) {
      throw new errors.InvalidObjectNameError(`Invalid object name: ${objectName}`);
    }
    if (isFunction(respHeaders)) {
      cb = respHeaders;
      respHeaders = {};
      requestDate = new Date();
    }
    var validRespHeaders = ['response-content-type', 'response-content-language', 'response-expires', 'response-cache-control', 'response-content-disposition', 'response-content-encoding'];
    validRespHeaders.forEach(header => {
      if (respHeaders !== undefined && respHeaders[header] !== undefined && !isString(respHeaders[header])) {
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
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError(`Invalid bucket name: ${bucketName}`);
    }
    if (!isValidObjectName(objectName)) {
      throw new errors.InvalidObjectNameError(`Invalid object name: ${objectName}`);
    }
    return this.presignedUrl('PUT', bucketName, objectName, expires, cb);
  }

  // return PostPolicy object
  newPostPolicy() {
    return new PostPolicy();
  }

  // presignedPostPolicy can be used in situations where we want more control on the upload than what
  // presignedPutObject() provides. i.e Using presignedPostPolicy we will be able to put policy restrictions
  // on the object's `name` `bucket` `expiry` `Content-Type` `Content-Disposition` `metaData`
  presignedPostPolicy(postPolicy, cb) {
    if (this.anonymous) {
      throw new errors.AnonymousRequestError('Presigned POST policy cannot be generated for anonymous requests');
    }
    if (!isObject(postPolicy)) {
      throw new TypeError('postPolicy should be of type "object"');
    }
    if (!isFunction(cb)) {
      throw new TypeError('cb should be of type "function"');
    }
    this.getBucketRegion(postPolicy.formData.bucket, (e, region) => {
      if (e) {
        return cb(e);
      }
      var date = new Date();
      var dateStr = makeDateLong(date);
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
      postPolicy.policy.conditions.push(['eq', '$x-amz-credential', this.accessKey + '/' + getScope(region, date)]);
      postPolicy.formData['x-amz-credential'] = this.accessKey + '/' + getScope(region, date);
      if (this.sessionToken) {
        postPolicy.policy.conditions.push(['eq', '$x-amz-security-token', this.sessionToken]);
        postPolicy.formData['x-amz-security-token'] = this.sessionToken;
      }
      var policyBase64 = Buffer.from(JSON.stringify(postPolicy.policy)).toString('base64');
      postPolicy.formData.policy = policyBase64;
      var signature = postPresignSignatureV4(region, date, this.secretKey, policyBase64);
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
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName);
    }
    if (!isValidObjectName(objectName)) {
      throw new errors.InvalidObjectNameError(`Invalid object name: ${objectName}`);
    }
    if (!isObject(metaData)) {
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
      pipesetup(response, transformer).on('error', e => cb(e)).on('data', uploadId => cb(null, uploadId));
    });
  }

  // Complete the multipart upload. After all the parts are uploaded issuing
  // this call will aggregate the parts on the server into a single object.
  completeMultipartUpload(bucketName, objectName, uploadId, etags, cb) {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName);
    }
    if (!isValidObjectName(objectName)) {
      throw new errors.InvalidObjectNameError(`Invalid object name: ${objectName}`);
    }
    if (!isString(uploadId)) {
      throw new TypeError('uploadId should be of type "string"');
    }
    if (!isObject(etags)) {
      throw new TypeError('etags should be of type "Array"');
    }
    if (!isFunction(cb)) {
      throw new TypeError('cb should be of type "function"');
    }
    if (!uploadId) {
      throw new errors.InvalidArgumentError('uploadId cannot be empty');
    }
    var method = 'POST';
    var query = `uploadId=${uriEscape(uploadId)}`;
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
    var payload = Xml(payloadObject);
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
      pipesetup(response, transformer).on('error', e => cb(e)).on('data', result => {
        if (result.errCode) {
          // Multipart Complete API returns an error XML after a 200 http status
          cb(new errors.S3Error(result.errMessage));
        } else {
          const completeMultipartResult = {
            etag: result.etag,
            versionId: getVersionId(response.headers)
          };
          cb(null, completeMultipartResult);
        }
      });
    });
  }

  // Get part-info of all parts of an incomplete upload specified by uploadId.
  listParts(bucketName, objectName, uploadId, cb) {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName);
    }
    if (!isValidObjectName(objectName)) {
      throw new errors.InvalidObjectNameError(`Invalid object name: ${objectName}`);
    }
    if (!isString(uploadId)) {
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
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName);
    }
    if (!isValidObjectName(objectName)) {
      throw new errors.InvalidObjectNameError(`Invalid object name: ${objectName}`);
    }
    if (!isString(uploadId)) {
      throw new TypeError('uploadId should be of type "string"');
    }
    if (!isNumber(marker)) {
      throw new TypeError('marker should be of type "number"');
    }
    if (!isFunction(cb)) {
      throw new TypeError('callback should be of type "function"');
    }
    if (!uploadId) {
      throw new errors.InvalidArgumentError('uploadId cannot be empty');
    }
    var query = '';
    if (marker && marker !== 0) {
      query += `part-number-marker=${marker}&`;
    }
    query += `uploadId=${uriEscape(uploadId)}`;
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
      pipesetup(response, transformer).on('error', e => cb(e)).on('data', data => cb(null, data));
    });
  }

  // Called by listIncompleteUploads to fetch a batch of incomplete uploads.
  listIncompleteUploadsQuery(bucketName, prefix, keyMarker, uploadIdMarker, delimiter) {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName);
    }
    if (!isString(prefix)) {
      throw new TypeError('prefix should be of type "string"');
    }
    if (!isString(keyMarker)) {
      throw new TypeError('keyMarker should be of type "string"');
    }
    if (!isString(uploadIdMarker)) {
      throw new TypeError('uploadIdMarker should be of type "string"');
    }
    if (!isString(delimiter)) {
      throw new TypeError('delimiter should be of type "string"');
    }
    var queries = [];
    queries.push(`prefix=${uriEscape(prefix)}`);
    queries.push(`delimiter=${uriEscape(delimiter)}`);
    if (keyMarker) {
      keyMarker = uriEscape(keyMarker);
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
      pipesetup(response, transformer);
    });
    return transformer;
  }

  // Find uploadId of an incomplete upload.
  findUploadId(bucketName, objectName, cb) {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName);
    }
    if (!isValidObjectName(objectName)) {
      throw new errors.InvalidObjectNameError(`Invalid object name: ${objectName}`);
    }
    if (!isFunction(cb)) {
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
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName);
    }
    if (!isValidObjectName(objectName)) {
      throw new errors.InvalidObjectNameError(`Invalid object name: ${objectName}`);
    }
    if (!isBoolean(multipart)) {
      throw new TypeError('multipart should be of type "boolean"');
    }
    if (!isObject(metaData)) {
      throw new TypeError('metadata should be of type "object"');
    }
    var validate = (stream, length, sha256sum, md5sum, cb) => {
      if (!isReadableStream(stream)) {
        throw new TypeError('stream should be of type "Stream"');
      }
      if (!isNumber(length)) {
        throw new TypeError('length should be of type "number"');
      }
      if (!isString(sha256sum)) {
        throw new TypeError('sha256sum should be of type "string"');
      }
      if (!isString(md5sum)) {
        throw new TypeError('md5sum should be of type "string"');
      }
      if (!isFunction(cb)) {
        throw new TypeError('callback should be of type "function"');
      }
    };
    var simpleUploader = (...args) => {
      validate(...args);
      var query = '';
      upload(query, ...args);
    };
    var multipartUploader = (uploadId, partNumber, ...rest) => {
      if (!isString(uploadId)) {
        throw new TypeError('uploadId should be of type "string"');
      }
      if (!isNumber(partNumber)) {
        throw new TypeError('partNumber should be of type "number"');
      }
      if (!uploadId) {
        throw new errors.InvalidArgumentError('Empty uploadId');
      }
      if (!partNumber) {
        throw new errors.InvalidArgumentError('partNumber cannot be 0');
      }
      validate(...rest);
      var query = `partNumber=${partNumber}&uploadId=${uriEscape(uploadId)}`;
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
          etag: sanitizeETag(response.headers.etag),
          versionId: getVersionId(response.headers)
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
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName);
    }
    if (!isObject(config)) {
      throw new TypeError('notification config should be of type "Object"');
    }
    if (!isFunction(cb)) {
      throw new TypeError('callback should be of type "function"');
    }
    var method = 'PUT';
    var query = 'notification';
    var builder = new xml2js.Builder({
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
    this.setBucketNotification(bucketName, new NotificationConfig(), cb);
  }

  // Return the list of notification configurations stored
  // in the S3 provider
  getBucketNotification(bucketName, cb) {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName);
    }
    if (!isFunction(cb)) {
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
      pipesetup(response, transformer).on('data', result => bucketNotification = result).on('error', e => cb(e)).on('end', () => cb(null, bucketNotification));
    });
  }

  // Listens for bucket notifications. Returns an EventEmitter.
  listenBucketNotification(bucketName, prefix, suffix, events) {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError(`Invalid bucket name: ${bucketName}`);
    }
    if (!isString(prefix)) {
      throw new TypeError('prefix must be of type string');
    }
    if (!isString(suffix)) {
      throw new TypeError('suffix must be of type string');
    }
    if (!Array.isArray(events)) {
      throw new TypeError('events must be of type Array');
    }
    let listener = new NotificationPoller(this, bucketName, prefix, suffix, events);
    listener.start();
    return listener;
  }
  getBucketVersioning(bucketName, cb) {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName);
    }
    if (!isFunction(cb)) {
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
      pipesetup(response, transformers.bucketVersioningTransformer()).on('data', data => {
        versionConfig = data;
      }).on('error', cb).on('end', () => {
        cb(null, versionConfig);
      });
    });
  }
  setBucketVersioning(bucketName, versionConfig, cb) {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName);
    }
    if (!Object.keys(versionConfig).length) {
      throw new errors.InvalidArgumentError('versionConfig should be of type "object"');
    }
    if (!isFunction(cb)) {
      throw new TypeError('callback should be of type "function"');
    }
    var method = 'PUT';
    var query = 'versioning';
    var builder = new xml2js.Builder({
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
    const encoder = new TextEncoder();
    const headers = {};
    const builder = new xml2js.Builder({
      headless: true,
      renderOpts: {
        pretty: false
      }
    });
    let payload = builder.buildObject(taggingConfig);
    payload = encoder.encode(payload);
    headers['Content-MD5'] = toMd5(payload);
    const requestOptions = {
      method,
      bucketName,
      query,
      headers
    };
    if (objectName) {
      requestOptions['objectName'] = objectName;
    }
    headers['Content-MD5'] = toMd5(payload);
    this.makeRequest(requestOptions, payload, [200], '', false, cb);
  }

  /** Set Tags on a Bucket
   * __Arguments__
   * bucketName _string_
   * tags _object_ of the form {'<tag-key-1>':'<tag-value-1>','<tag-key-2>':'<tag-value-2>'}
   * `cb(error)` _function_ - callback function with `err` as the error argument. `err` is null if the operation is successful.
   */
  setBucketTagging(bucketName, tags, cb) {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName);
    }
    if (!isObject(tags)) {
      throw new errors.InvalidArgumentError('tags should be of type "object"');
    }
    if (Object.keys(tags).length > 10) {
      throw new errors.InvalidArgumentError('maximum tags allowed is 10"');
    }
    if (!isFunction(cb)) {
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
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName);
    }
    if (!isValidObjectName(objectName)) {
      throw new errors.InvalidBucketNameError('Invalid object name: ' + objectName);
    }
    if (isFunction(putOpts)) {
      cb = putOpts;
      putOpts = {};
    }
    if (!isObject(tags)) {
      throw new errors.InvalidArgumentError('tags should be of type "object"');
    }
    if (Object.keys(tags).length > 10) {
      throw new errors.InvalidArgumentError('Maximum tags allowed is 10"');
    }
    if (!isFunction(cb)) {
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
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName);
    }
    if (!isFunction(cb)) {
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
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName);
    }
    if (!isValidObjectName(objectName)) {
      throw new errors.InvalidBucketNameError('Invalid object name: ' + objectName);
    }
    if (isFunction(removeOpts)) {
      cb = removeOpts;
      removeOpts = {};
    }
    if (removeOpts && Object.keys(removeOpts).length && !isObject(removeOpts)) {
      throw new errors.InvalidArgumentError('removeOpts should be of type "object"');
    }
    if (!isFunction(cb)) {
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
      pipesetup(response, transformer).on('data', result => tagsList = result).on('error', e => cb(e)).on('end', () => cb(null, tagsList));
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
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName);
    }
    if (!isValidObjectName(objectName)) {
      throw new errors.InvalidBucketNameError('Invalid object name: ' + objectName);
    }
    if (isFunction(getOpts)) {
      cb = getOpts;
      getOpts = {};
    }
    if (!isObject(getOpts)) {
      throw new errors.InvalidArgumentError('getOpts should be of type "object"');
    }
    if (!isFunction(cb)) {
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
      pipesetup(response, transformer).on('data', result => tagsList = result).on('error', e => cb(e)).on('end', () => cb(null, tagsList));
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
    const encoder = new TextEncoder();
    const headers = {};
    const builder = new xml2js.Builder({
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
    headers['Content-MD5'] = toMd5(payload);
    this.makeRequest(requestOptions, payload, [200], '', false, cb);
  }

  /** Remove lifecycle configuration of a bucket.
   * bucketName _string_
   * `cb(error)` _function_ - callback function with `err` as the error argument. `err` is null if the operation is successful.
   */
  removeBucketLifecycle(bucketName, cb) {
    if (!isValidBucketName(bucketName)) {
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
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName);
    }
    if (_.isEmpty(lifeCycleConfig)) {
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
    if (!isValidBucketName(bucketName)) {
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
      pipesetup(response, transformer).on('data', result => lifecycleConfig = result).on('error', e => cb(e)).on('end', () => cb(null, lifecycleConfig));
    });
  }
  setObjectLockConfig(bucketName, lockConfigOpts = {}, cb) {
    const retentionModes = [RETENTION_MODES.COMPLIANCE, RETENTION_MODES.GOVERNANCE];
    const validUnits = [RETENTION_VALIDITY_UNITS.DAYS, RETENTION_VALIDITY_UNITS.YEARS];
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName);
    }
    if (lockConfigOpts.mode && !retentionModes.includes(lockConfigOpts.mode)) {
      throw new TypeError(`lockConfigOpts.mode should be one of ${retentionModes}`);
    }
    if (lockConfigOpts.unit && !validUnits.includes(lockConfigOpts.unit)) {
      throw new TypeError(`lockConfigOpts.unit should be one of ${validUnits}`);
    }
    if (lockConfigOpts.validity && !isNumber(lockConfigOpts.validity)) {
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
      if (_.difference(configKeys, ['unit', 'mode', 'validity']).length !== 0) {
        throw new TypeError(`lockConfigOpts.mode,lockConfigOpts.unit,lockConfigOpts.validity all the properties should be specified.`);
      } else {
        config.Rule = {
          DefaultRetention: {}
        };
        if (lockConfigOpts.mode) {
          config.Rule.DefaultRetention.Mode = lockConfigOpts.mode;
        }
        if (lockConfigOpts.unit === RETENTION_VALIDITY_UNITS.DAYS) {
          config.Rule.DefaultRetention.Days = lockConfigOpts.validity;
        } else if (lockConfigOpts.unit === RETENTION_VALIDITY_UNITS.YEARS) {
          config.Rule.DefaultRetention.Years = lockConfigOpts.validity;
        }
      }
    }
    const builder = new xml2js.Builder({
      rootName: 'ObjectLockConfiguration',
      renderOpts: {
        pretty: false
      },
      headless: true
    });
    const payload = builder.buildObject(config);
    const headers = {};
    headers['Content-MD5'] = toMd5(payload);
    this.makeRequest({
      method,
      bucketName,
      query,
      headers
    }, payload, [200], '', false, cb);
  }
  getObjectLockConfig(bucketName, cb) {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName);
    }
    if (!isFunction(cb)) {
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
      pipesetup(response, transformers.objectLockTransformer()).on('data', data => {
        objectLockConfig = data;
      }).on('error', cb).on('end', () => {
        cb(null, objectLockConfig);
      });
    });
  }
  putObjectRetention(bucketName, objectName, retentionOpts = {}, cb) {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName);
    }
    if (!isValidObjectName(objectName)) {
      throw new errors.InvalidObjectNameError(`Invalid object name: ${objectName}`);
    }
    if (!isObject(retentionOpts)) {
      throw new errors.InvalidArgumentError('retentionOpts should be of type "object"');
    } else {
      if (retentionOpts.governanceBypass && !isBoolean(retentionOpts.governanceBypass)) {
        throw new errors.InvalidArgumentError('Invalid value for governanceBypass', retentionOpts.governanceBypass);
      }
      if (retentionOpts.mode && ![RETENTION_MODES.COMPLIANCE, RETENTION_MODES.GOVERNANCE].includes(retentionOpts.mode)) {
        throw new errors.InvalidArgumentError('Invalid object retention mode ', retentionOpts.mode);
      }
      if (retentionOpts.retainUntilDate && !isString(retentionOpts.retainUntilDate)) {
        throw new errors.InvalidArgumentError('Invalid value for retainUntilDate', retentionOpts.retainUntilDate);
      }
      if (retentionOpts.versionId && !isString(retentionOpts.versionId)) {
        throw new errors.InvalidArgumentError('Invalid value for versionId', retentionOpts.versionId);
      }
    }
    if (!isFunction(cb)) {
      throw new TypeError('callback should be of type "function"');
    }
    const method = 'PUT';
    let query = 'retention';
    const headers = {};
    if (retentionOpts.governanceBypass) {
      headers['X-Amz-Bypass-Governance-Retention'] = true;
    }
    const builder = new xml2js.Builder({
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
    headers['Content-MD5'] = toMd5(payload);
    this.makeRequest({
      method,
      bucketName,
      objectName,
      query,
      headers
    }, payload, [200, 204], '', false, cb);
  }
  getObjectRetention(bucketName, objectName, getOpts, cb) {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName);
    }
    if (!isValidObjectName(objectName)) {
      throw new errors.InvalidObjectNameError(`Invalid object name: ${objectName}`);
    }
    if (!isObject(getOpts)) {
      throw new errors.InvalidArgumentError('callback should be of type "object"');
    } else if (getOpts.versionId && !isString(getOpts.versionId)) {
      throw new errors.InvalidArgumentError('VersionID should be of type "string"');
    }
    if (cb && !isFunction(cb)) {
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
      pipesetup(response, transformers.objectRetentionTransformer()).on('data', data => {
        retentionConfig = data;
      }).on('error', cb).on('end', () => {
        cb(null, retentionConfig);
      });
    });
  }
  setBucketEncryption(bucketName, encryptionConfig, cb) {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName);
    }
    if (isFunction(encryptionConfig)) {
      cb = encryptionConfig;
      encryptionConfig = null;
    }
    if (!_.isEmpty(encryptionConfig) && encryptionConfig.Rule.length > 1) {
      throw new errors.InvalidArgumentError('Invalid Rule length. Only one rule is allowed.: ' + encryptionConfig.Rule);
    }
    if (cb && !isFunction(cb)) {
      throw new TypeError('callback should be of type "function"');
    }
    let encryptionObj = encryptionConfig;
    if (_.isEmpty(encryptionConfig)) {
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
    let builder = new xml2js.Builder({
      rootName: 'ServerSideEncryptionConfiguration',
      renderOpts: {
        pretty: false
      },
      headless: true
    });
    let payload = builder.buildObject(encryptionObj);
    const headers = {};
    headers['Content-MD5'] = toMd5(payload);
    this.makeRequest({
      method,
      bucketName,
      query,
      headers
    }, payload, [200], '', false, cb);
  }
  getBucketEncryption(bucketName, cb) {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName);
    }
    if (!isFunction(cb)) {
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
      pipesetup(response, transformers.bucketEncryptionTransformer()).on('data', data => {
        bucketEncConfig = data;
      }).on('error', cb).on('end', () => {
        cb(null, bucketEncConfig);
      });
    });
  }
  removeBucketEncryption(bucketName, cb) {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName);
    }
    if (!isFunction(cb)) {
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
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName);
    }
    if (!isObject(replicationConfig)) {
      throw new errors.InvalidArgumentError('replicationConfig should be of type "object"');
    } else {
      if (_.isEmpty(replicationConfig.role)) {
        throw new errors.InvalidArgumentError('Role cannot be empty');
      } else if (replicationConfig.role && !isString(replicationConfig.role)) {
        throw new errors.InvalidArgumentError('Invalid value for role', replicationConfig.role);
      }
      if (_.isEmpty(replicationConfig.rules)) {
        throw new errors.InvalidArgumentError('Minimum one replication rule must be specified');
      }
    }
    if (!isFunction(cb)) {
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
    const builder = new xml2js.Builder({
      renderOpts: {
        pretty: false
      },
      headless: true
    });
    let payload = builder.buildObject(replicationParamsConfig);
    headers['Content-MD5'] = toMd5(payload);
    this.makeRequest({
      method,
      bucketName,
      query,
      headers
    }, payload, [200], '', false, cb);
  }
  getBucketReplication(bucketName, cb) {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName);
    }
    if (!isFunction(cb)) {
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
      pipesetup(response, transformers.replicationConfigTransformer()).on('data', data => {
        replicationConfig = data;
      }).on('error', cb).on('end', () => {
        cb(null, replicationConfig);
      });
    });
  }
  removeBucketReplication(bucketName, cb) {
    if (!isValidBucketName(bucketName)) {
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
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName);
    }
    if (!isValidObjectName(objectName)) {
      throw new errors.InvalidObjectNameError(`Invalid object name: ${objectName}`);
    }
    if (isFunction(getOpts)) {
      cb = getOpts;
      getOpts = {};
    }
    if (!isObject(getOpts)) {
      throw new TypeError('getOpts should be of type "Object"');
    } else if (Object.keys(getOpts).length > 0 && getOpts.versionId && !isString(getOpts.versionId)) {
      throw new TypeError('versionId should be of type string.:', getOpts.versionId);
    }
    if (!isFunction(cb)) {
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
      pipesetup(response, transformers.objectLegalHoldTransformer()).on('data', data => {
        legalHoldConfig = data;
      }).on('error', cb).on('end', () => {
        cb(null, legalHoldConfig);
      });
    });
  }
  setObjectLegalHold(bucketName, objectName, setOpts = {}, cb) {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName);
    }
    if (!isValidObjectName(objectName)) {
      throw new errors.InvalidObjectNameError(`Invalid object name: ${objectName}`);
    }
    const defaultOpts = {
      status: LEGAL_HOLD_STATUS.ENABLED
    };
    if (isFunction(setOpts)) {
      cb = setOpts;
      setOpts = defaultOpts;
    }
    if (!isObject(setOpts)) {
      throw new TypeError('setOpts should be of type "Object"');
    } else {
      if (![LEGAL_HOLD_STATUS.ENABLED, LEGAL_HOLD_STATUS.DISABLED].includes(setOpts.status)) {
        throw new TypeError('Invalid status: ' + setOpts.status);
      }
      if (setOpts.versionId && !setOpts.versionId.length) {
        throw new TypeError('versionId should be of type string.:' + setOpts.versionId);
      }
    }
    if (!isFunction(cb)) {
      throw new errors.InvalidArgumentError('callback should be of type "function"');
    }
    if (_.isEmpty(setOpts)) {
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
    const builder = new xml2js.Builder({
      rootName: 'LegalHold',
      renderOpts: {
        pretty: false
      },
      headless: true
    });
    const payload = builder.buildObject(config);
    const headers = {};
    headers['Content-MD5'] = toMd5(payload);
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
      pipesetup(response, transformers.uploadPartTransformer()).on('data', data => {
        partCopyResult = data;
      }).on('error', cb).on('end', () => {
        let uploadPartCopyRes = {
          etag: sanitizeETag(partCopyResult.ETag),
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
    if (!(destObjConfig instanceof CopyDestinationOptions)) {
      throw new errors.InvalidArgumentError('destConfig should of type CopyDestinationOptions ');
    }
    if (sourceFilesLength < 1 || sourceFilesLength > PART_CONSTRAINTS.MAX_PARTS_COUNT) {
      throw new errors.InvalidArgumentError(`"There must be as least one and up to ${PART_CONSTRAINTS.MAX_PARTS_COUNT} source objects.`);
    }
    if (!isFunction(cb)) {
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
      if (!_.isEmpty(srcConfig.VersionID)) {
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
        if (srcCopySize < PART_CONSTRAINTS.ABS_MIN_PART_SIZE && index < sourceFilesLength - 1) {
          throw new errors.InvalidArgumentError(`CopySrcOptions ${index} is too small (${srcCopySize}) and it is not the last part.`);
        }

        // Is data to copy too large?
        totalSize += srcCopySize;
        if (totalSize > PART_CONSTRAINTS.MAX_MULTIPART_PUT_OBJECT_SIZE) {
          throw new errors.InvalidArgumentError(`Cannot compose an object of size ${totalSize} (> 5TiB)`);
        }

        // record source size
        srcObjectSizes[index] = srcCopySize;

        // calculate parts needed for current source
        totalParts += partsRequired(srcCopySize);
        // Do we need more parts than we are allowed?
        if (totalParts > PART_CONSTRAINTS.MAX_PARTS_COUNT) {
          throw new errors.InvalidArgumentError(`Your proposed compose object requires more than ${PART_CONSTRAINTS.MAX_PARTS_COUNT} parts`);
        }
        return resItemStat;
      });
      if (totalParts === 1 && totalSize <= PART_CONSTRAINTS.MAX_PART_SIZE || totalSize === 0) {
        return this.copyObject(sourceObjList[0], destObjConfig, cb); // use copyObjectV2
      }

      // preserve etag to avoid modification of object while copying.
      for (let i = 0; i < sourceFilesLength; i++) {
        sourceObjList[i].MatchETag = validatedStats[i].etag;
      }
      const splitPartSizeList = validatedStats.map((resItemStat, idx) => {
        const calSize = calculateEvenSplits(srcObjectSizes[idx], sourceObjList[idx]);
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
        async.map(uploadList, me.uploadPartCopy.bind(me), (err, res) => {
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
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError(`Invalid bucket name: ${bucketName}`);
    }
    if (!isValidObjectName(objectName)) {
      throw new errors.InvalidObjectNameError(`Invalid object name: ${objectName}`);
    }
    if (!_.isEmpty(selectOpts)) {
      if (!isString(selectOpts.expression)) {
        throw new TypeError('sqlExpression should be of type "string"');
      }
      if (!_.isEmpty(selectOpts.inputSerialization)) {
        if (!isObject(selectOpts.inputSerialization)) {
          throw new TypeError('inputSerialization should be of type "object"');
        }
      } else {
        throw new TypeError('inputSerialization is required');
      }
      if (!_.isEmpty(selectOpts.outputSerialization)) {
        if (!isObject(selectOpts.outputSerialization)) {
          throw new TypeError('outputSerialization should be of type "object"');
        }
      } else {
        throw new TypeError('outputSerialization is required');
      }
    } else {
      throw new TypeError('valid select configuration is required');
    }
    if (!isFunction(cb)) {
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
    const builder = new xml2js.Builder({
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
      pipesetup(response, transformers.selectObjectContentTransformer()).on('data', data => {
        selectResult = parseSelectObjectContentResponse(data);
      }).on('error', cb).on('end', () => {
        cb(null, selectResult);
      });
    });
  }
  get extensions() {
    if (!this.clientExtensions) {
      this.clientExtensions = new extensions(this);
    }
    return this.clientExtensions;
  }
}

// Promisify various public-facing APIs on the Client module.
Client.prototype.makeBucket = promisify(Client.prototype.makeBucket);
Client.prototype.listBuckets = promisify(Client.prototype.listBuckets);
Client.prototype.bucketExists = promisify(Client.prototype.bucketExists);
Client.prototype.removeBucket = promisify(Client.prototype.removeBucket);
Client.prototype.getObject = promisify(Client.prototype.getObject);
Client.prototype.getPartialObject = promisify(Client.prototype.getPartialObject);
Client.prototype.fGetObject = promisify(Client.prototype.fGetObject);
Client.prototype.putObject = promisify(Client.prototype.putObject);
Client.prototype.fPutObject = promisify(Client.prototype.fPutObject);
Client.prototype.copyObject = promisify(Client.prototype.copyObject);
Client.prototype.statObject = promisify(Client.prototype.statObject);
Client.prototype.removeObject = promisify(Client.prototype.removeObject);
Client.prototype.removeObjects = promisify(Client.prototype.removeObjects);
Client.prototype.presignedUrl = promisify(Client.prototype.presignedUrl);
Client.prototype.presignedGetObject = promisify(Client.prototype.presignedGetObject);
Client.prototype.presignedPutObject = promisify(Client.prototype.presignedPutObject);
Client.prototype.presignedPostPolicy = promisify(Client.prototype.presignedPostPolicy);
Client.prototype.getBucketNotification = promisify(Client.prototype.getBucketNotification);
Client.prototype.setBucketNotification = promisify(Client.prototype.setBucketNotification);
Client.prototype.removeAllBucketNotification = promisify(Client.prototype.removeAllBucketNotification);
Client.prototype.getBucketPolicy = promisify(Client.prototype.getBucketPolicy);
Client.prototype.setBucketPolicy = promisify(Client.prototype.setBucketPolicy);
Client.prototype.removeIncompleteUpload = promisify(Client.prototype.removeIncompleteUpload);
Client.prototype.getBucketVersioning = promisify(Client.prototype.getBucketVersioning);
Client.prototype.setBucketVersioning = promisify(Client.prototype.setBucketVersioning);
Client.prototype.setBucketTagging = promisify(Client.prototype.setBucketTagging);
Client.prototype.removeBucketTagging = promisify(Client.prototype.removeBucketTagging);
Client.prototype.getBucketTagging = promisify(Client.prototype.getBucketTagging);
Client.prototype.setObjectTagging = promisify(Client.prototype.setObjectTagging);
Client.prototype.removeObjectTagging = promisify(Client.prototype.removeObjectTagging);
Client.prototype.getObjectTagging = promisify(Client.prototype.getObjectTagging);
Client.prototype.setBucketLifecycle = promisify(Client.prototype.setBucketLifecycle);
Client.prototype.getBucketLifecycle = promisify(Client.prototype.getBucketLifecycle);
Client.prototype.removeBucketLifecycle = promisify(Client.prototype.removeBucketLifecycle);
Client.prototype.setObjectLockConfig = promisify(Client.prototype.setObjectLockConfig);
Client.prototype.getObjectLockConfig = promisify(Client.prototype.getObjectLockConfig);
Client.prototype.putObjectRetention = promisify(Client.prototype.putObjectRetention);
Client.prototype.getObjectRetention = promisify(Client.prototype.getObjectRetention);
Client.prototype.setBucketEncryption = promisify(Client.prototype.setBucketEncryption);
Client.prototype.getBucketEncryption = promisify(Client.prototype.getBucketEncryption);
Client.prototype.removeBucketEncryption = promisify(Client.prototype.removeBucketEncryption);
Client.prototype.setBucketReplication = promisify(Client.prototype.setBucketReplication);
Client.prototype.getBucketReplication = promisify(Client.prototype.getBucketReplication);
Client.prototype.removeBucketReplication = promisify(Client.prototype.removeBucketReplication);
Client.prototype.setObjectLegalHold = promisify(Client.prototype.setObjectLegalHold);
Client.prototype.getObjectLegalHold = promisify(Client.prototype.getObjectLegalHold);
Client.prototype.composeObject = promisify(Client.prototype.composeObject);
Client.prototype.selectObjectContent = promisify(Client.prototype.selectObjectContent);
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJmcyIsInBhdGgiLCJTdHJlYW0iLCJhc3luYyIsIkJsb2NrU3RyZWFtMiIsIl8iLCJxdWVyeXN0cmluZyIsIlRleHRFbmNvZGVyIiwiWG1sIiwieG1sMmpzIiwiZXJyb3JzIiwiZXh0ZW5zaW9ucyIsIkNvcHlEZXN0aW5hdGlvbk9wdGlvbnMiLCJDb3B5U291cmNlT3B0aW9ucyIsIkRFRkFVTFRfUkVHSU9OIiwiVHlwZWRDbGllbnQiLCJDb3B5Q29uZGl0aW9ucyIsImNhbGN1bGF0ZUV2ZW5TcGxpdHMiLCJleHRyYWN0TWV0YWRhdGEiLCJnZXRTY29wZSIsImdldFNvdXJjZVZlcnNpb25JZCIsImdldFZlcnNpb25JZCIsImluc2VydENvbnRlbnRUeXBlIiwiaXNCb29sZWFuIiwiaXNGdW5jdGlvbiIsImlzTnVtYmVyIiwiaXNPYmplY3QiLCJpc1JlYWRhYmxlU3RyZWFtIiwiaXNTdHJpbmciLCJpc1ZhbGlkQnVja2V0TmFtZSIsImlzVmFsaWREYXRlIiwiaXNWYWxpZE9iamVjdE5hbWUiLCJpc1ZhbGlkUHJlZml4IiwibWFrZURhdGVMb25nIiwiUEFSVF9DT05TVFJBSU5UUyIsInBhcnRzUmVxdWlyZWQiLCJwaXBlc2V0dXAiLCJwcmVwZW5kWEFNWk1ldGEiLCJyZWFkYWJsZVN0cmVhbSIsInNhbml0aXplRVRhZyIsInRvTWQ1IiwidG9TaGEyNTYiLCJ1cmlFc2NhcGUiLCJ1cmlSZXNvdXJjZUVzY2FwZSIsIlBvc3RQb2xpY3kiLCJMRUdBTF9IT0xEX1NUQVRVUyIsIlJFVEVOVElPTl9NT0RFUyIsIlJFVEVOVElPTl9WQUxJRElUWV9VTklUUyIsIk5vdGlmaWNhdGlvbkNvbmZpZyIsIk5vdGlmaWNhdGlvblBvbGxlciIsIk9iamVjdFVwbG9hZGVyIiwicHJvbWlzaWZ5IiwicG9zdFByZXNpZ25TaWduYXR1cmVWNCIsInByZXNpZ25TaWduYXR1cmVWNCIsInNpZ25WNCIsInRyYW5zZm9ybWVycyIsInBhcnNlU2VsZWN0T2JqZWN0Q29udGVudFJlc3BvbnNlIiwiQ2xpZW50Iiwic2V0QXBwSW5mbyIsImFwcE5hbWUiLCJhcHBWZXJzaW9uIiwiVHlwZUVycm9yIiwidHJpbSIsIkludmFsaWRBcmd1bWVudEVycm9yIiwidXNlckFnZW50IiwiY2FsY3VsYXRlUGFydFNpemUiLCJzaXplIiwibWF4T2JqZWN0U2l6ZSIsIm92ZXJSaWRlUGFydFNpemUiLCJwYXJ0U2l6ZSIsImxvZ0hUVFAiLCJyZXFPcHRpb25zIiwicmVzcG9uc2UiLCJlcnIiLCJsb2dTdHJlYW0iLCJFcnJvciIsImxvZ0hlYWRlcnMiLCJoZWFkZXJzIiwiZm9yRWFjaCIsInYiLCJrIiwicmVkYWN0ZXIiLCJSZWdFeHAiLCJyZXBsYWNlIiwid3JpdGUiLCJtZXRob2QiLCJzdGF0dXNDb2RlIiwiZXJySlNPTiIsIkpTT04iLCJzdHJpbmdpZnkiLCJ0cmFjZU9uIiwic3RyZWFtIiwicHJvY2VzcyIsInN0ZG91dCIsInRyYWNlT2ZmIiwibWFrZVJlcXVlc3QiLCJvcHRpb25zIiwicGF5bG9hZCIsInN0YXR1c0NvZGVzIiwicmVnaW9uIiwicmV0dXJuUmVzcG9uc2UiLCJjYiIsImxlbmd0aCIsInNoYTI1NnN1bSIsImVuYWJsZVNIQTI1NiIsIm1ha2VSZXF1ZXN0U3RyZWFtIiwiX21ha2VSZXF1ZXN0IiwiZSIsImdldFJlcXVlc3RPcHRpb25zIiwiYW5vbnltb3VzIiwiZGF0ZSIsIkRhdGUiLCJzZXNzaW9uVG9rZW4iLCJjaGVja0FuZFJlZnJlc2hDcmVkcyIsImF1dGhvcml6YXRpb24iLCJhY2Nlc3NLZXkiLCJzZWNyZXRLZXkiLCJyZXEiLCJ0cmFuc3BvcnQiLCJyZXF1ZXN0IiwiaW5jbHVkZXMiLCJyZWdpb25NYXAiLCJidWNrZXROYW1lIiwiZXJyb3JUcmFuc2Zvcm1lciIsImdldEVycm9yVHJhbnNmb3JtZXIiLCJvbiIsInBpcGUiLCJnZXRCdWNrZXRSZWdpb24iLCJJbnZhbGlkQnVja2V0TmFtZUVycm9yIiwiZXh0cmFjdFJlZ2lvbiIsInRyYW5zZm9ybWVyIiwiZ2V0QnVja2V0UmVnaW9uVHJhbnNmb3JtZXIiLCJkYXRhIiwicXVlcnkiLCJwYXRoU3R5bGUiLCJ3aW5kb3ciLCJuYW1lIiwiUmVnaW9uIiwibWFrZUJ1Y2tldCIsIm1ha2VPcHRzIiwiY3JlYXRlQnVja2V0Q29uZmlndXJhdGlvbiIsInB1c2giLCJfYXR0ciIsInhtbG5zIiwiTG9jYXRpb25Db25zdHJhaW50IiwicGF5bG9hZE9iamVjdCIsIkNyZWF0ZUJ1Y2tldENvbmZpZ3VyYXRpb24iLCJPYmplY3RMb2NraW5nIiwicHJvY2Vzc1dpdGhSZXRyeSIsImNvZGUiLCJsaXN0QnVja2V0cyIsImdldExpc3RCdWNrZXRUcmFuc2Zvcm1lciIsImJ1Y2tldHMiLCJyZXN1bHQiLCJsaXN0SW5jb21wbGV0ZVVwbG9hZHMiLCJidWNrZXQiLCJwcmVmaXgiLCJyZWN1cnNpdmUiLCJ1bmRlZmluZWQiLCJJbnZhbGlkUHJlZml4RXJyb3IiLCJkZWxpbWl0ZXIiLCJrZXlNYXJrZXIiLCJ1cGxvYWRJZE1hcmtlciIsInVwbG9hZHMiLCJlbmRlZCIsInJlYWRTdHJlYW0iLCJSZWFkYWJsZSIsIm9iamVjdE1vZGUiLCJfcmVhZCIsInNoaWZ0IiwibGlzdEluY29tcGxldGVVcGxvYWRzUXVlcnkiLCJlbWl0IiwicHJlZml4ZXMiLCJlYWNoU2VyaWVzIiwidXBsb2FkIiwibGlzdFBhcnRzIiwia2V5IiwidXBsb2FkSWQiLCJwYXJ0cyIsInJlZHVjZSIsImFjYyIsIml0ZW0iLCJpc1RydW5jYXRlZCIsIm5leHRLZXlNYXJrZXIiLCJuZXh0VXBsb2FkSWRNYXJrZXIiLCJidWNrZXRFeGlzdHMiLCJyZW1vdmVCdWNrZXQiLCJyZW1vdmVJbmNvbXBsZXRlVXBsb2FkIiwib2JqZWN0TmFtZSIsIklzVmFsaWRCdWNrZXROYW1lRXJyb3IiLCJJbnZhbGlkT2JqZWN0TmFtZUVycm9yIiwicmVtb3ZlVXBsb2FkSWQiLCJkdXJpbmciLCJmaW5kVXBsb2FkSWQiLCJmR2V0T2JqZWN0IiwiZmlsZVBhdGgiLCJnZXRPcHRzIiwicGFydEZpbGUiLCJwYXJ0RmlsZVN0cmVhbSIsIm9ialN0YXQiLCJyZW5hbWUiLCJ3YXRlcmZhbGwiLCJzdGF0T2JqZWN0IiwibWtkaXIiLCJkaXJuYW1lIiwiZXRhZyIsInN0YXQiLCJzdGF0cyIsIm9mZnNldCIsImNyZWF0ZVdyaXRlU3RyZWFtIiwiZmxhZ3MiLCJnZXRQYXJ0aWFsT2JqZWN0IiwiZG93bmxvYWRTdHJlYW0iLCJnZXRPYmplY3QiLCJyYW5nZSIsImV4cGVjdGVkU3RhdHVzQ29kZXMiLCJmUHV0T2JqZWN0IiwibWV0YURhdGEiLCJjYWxsYmFjayIsImNiVHJpZ2dlcmVkIiwib3JpZ0NiIiwiZGVzdHJveSIsImFwcGx5IiwiYXJndW1lbnRzIiwibXVsdGlwYXJ0IiwidXBsb2FkZXIiLCJnZXRVcGxvYWRlciIsImhhc2giLCJnZXRIYXNoU3VtbWVyIiwic3RhcnQiLCJlbmQiLCJhdXRvQ2xvc2UiLCJjcmVhdGVSZWFkU3RyZWFtIiwibWQ1c3VtIiwib2JqSW5mbyIsImV0YWdzIiwiaW5pdGlhdGVOZXdNdWx0aXBhcnRVcGxvYWQiLCJwYXJ0IiwicGFydHNEb25lIiwicGFydE51bWJlciIsInVwbG9hZGVkU2l6ZSIsIndoaWxzdCIsIm1kNXN1bUhleCIsIkJ1ZmZlciIsImZyb20iLCJ0b1N0cmluZyIsImNvbXBsZXRlTXVsdGlwYXJ0VXBsb2FkIiwicmVzdCIsInB1dE9iamVjdCIsImNodW5rZXIiLCJ6ZXJvUGFkZGluZyIsImNvcHlPYmplY3RWMSIsImFyZzEiLCJhcmcyIiwiYXJnMyIsImFyZzQiLCJhcmc1Iiwic3JjT2JqZWN0IiwiY29uZGl0aW9ucyIsIm1vZGlmaWVkIiwidW5tb2RpZmllZCIsIm1hdGNoRVRhZyIsIm1hdGNoRXRhZ0V4Y2VwdCIsIm1hdGNoRVRhZ0V4Y2VwdCIsImdldENvcHlPYmplY3RUcmFuc2Zvcm1lciIsImNvcHlPYmplY3RWMiIsInNvdXJjZUNvbmZpZyIsImRlc3RDb25maWciLCJ2YWxpZGF0ZSIsIk9iamVjdCIsImFzc2lnbiIsImdldEhlYWRlcnMiLCJCdWNrZXQiLCJyZXNIZWFkZXJzIiwiY29weU9ialJlc3BvbnNlIiwiS2V5IiwiTGFzdE1vZGlmaWVkIiwiTWV0YURhdGEiLCJWZXJzaW9uSWQiLCJTb3VyY2VWZXJzaW9uSWQiLCJFdGFnIiwiU2l6ZSIsImNvcHlPYmplY3QiLCJhbGxBcmdzIiwibGlzdE9iamVjdHNRdWVyeSIsIm1hcmtlciIsImxpc3RRdWVyeU9wdHMiLCJEZWxpbWl0ZXIiLCJNYXhLZXlzIiwiSW5jbHVkZVZlcnNpb24iLCJxdWVyaWVzIiwic29ydCIsImpvaW4iLCJnZXRMaXN0T2JqZWN0c1RyYW5zZm9ybWVyIiwibGlzdE9iamVjdHMiLCJsaXN0T3B0cyIsIm9iamVjdHMiLCJuZXh0TWFya2VyIiwidmVyc2lvbklkTWFya2VyIiwibGlzdE9iamVjdHNWMlF1ZXJ5IiwiY29udGludWF0aW9uVG9rZW4iLCJtYXhLZXlzIiwic3RhcnRBZnRlciIsImdldExpc3RPYmplY3RzVjJUcmFuc2Zvcm1lciIsImxpc3RPYmplY3RzVjIiLCJuZXh0Q29udGludWF0aW9uVG9rZW4iLCJzdGF0T3B0cyIsImxhc3RNb2RpZmllZCIsInZlcnNpb25JZCIsInJlbW92ZU9iamVjdCIsInJlbW92ZU9wdHMiLCJxdWVyeVBhcmFtcyIsImdvdmVybmFuY2VCeXBhc3MiLCJmb3JjZURlbGV0ZSIsInJlcXVlc3RPcHRpb25zIiwicmVtb3ZlT2JqZWN0cyIsIm9iamVjdHNMaXN0IiwiQXJyYXkiLCJpc0FycmF5IiwibWF4RW50cmllcyIsImVudHJ5IiwibGlzdCIsImxpc3RPZkxpc3QiLCJlbmNvZGVyIiwiYmF0Y2hSZXN1bHRzIiwiYmF0Y2hDYiIsInZhbHVlIiwiZGVsZXRlT2JqZWN0cyIsIkRlbGV0ZSIsIlF1aWV0IiwiYnVpbGRlciIsIkJ1aWxkZXIiLCJoZWFkbGVzcyIsImJ1aWxkT2JqZWN0IiwiZW5jb2RlIiwicmVtb3ZlT2JqZWN0c1Jlc3VsdCIsInJlbW92ZU9iamVjdHNUcmFuc2Zvcm1lciIsImZsYXR0ZW4iLCJnZXRCdWNrZXRQb2xpY3kiLCJwb2xpY3kiLCJnZXRDb25jYXRlciIsInNldEJ1Y2tldFBvbGljeSIsIkludmFsaWRCdWNrZXRQb2xpY3lFcnJvciIsInByZXNpZ25lZFVybCIsImV4cGlyZXMiLCJyZXFQYXJhbXMiLCJyZXF1ZXN0RGF0ZSIsIkFub255bW91c1JlcXVlc3RFcnJvciIsInVybCIsInBlIiwicHJlc2lnbmVkR2V0T2JqZWN0IiwicmVzcEhlYWRlcnMiLCJ2YWxpZFJlc3BIZWFkZXJzIiwiaGVhZGVyIiwicHJlc2lnbmVkUHV0T2JqZWN0IiwibmV3UG9zdFBvbGljeSIsInByZXNpZ25lZFBvc3RQb2xpY3kiLCJwb3N0UG9saWN5IiwiZm9ybURhdGEiLCJkYXRlU3RyIiwiZXhwaXJhdGlvbiIsInNldFNlY29uZHMiLCJzZXRFeHBpcmVzIiwicG9saWN5QmFzZTY0Iiwic2lnbmF0dXJlIiwib3B0cyIsInBvcnRTdHIiLCJwb3J0IiwidXJsU3RyIiwicHJvdG9jb2wiLCJob3N0IiwicG9zdFVSTCIsImdldEluaXRpYXRlTXVsdGlwYXJ0VHJhbnNmb3JtZXIiLCJlbGVtZW50IiwiUGFydCIsIlBhcnROdW1iZXIiLCJFVGFnIiwiQ29tcGxldGVNdWx0aXBhcnRVcGxvYWQiLCJnZXRDb21wbGV0ZU11bHRpcGFydFRyYW5zZm9ybWVyIiwiZXJyQ29kZSIsIlMzRXJyb3IiLCJlcnJNZXNzYWdlIiwiY29tcGxldGVNdWx0aXBhcnRSZXN1bHQiLCJsaXN0TmV4dCIsImxpc3RQYXJ0c1F1ZXJ5IiwiY29uY2F0IiwiZ2V0TGlzdFBhcnRzVHJhbnNmb3JtZXIiLCJtYXhVcGxvYWRzIiwidW5zaGlmdCIsImdldExpc3RNdWx0aXBhcnRUcmFuc2Zvcm1lciIsImxhdGVzdFVwbG9hZCIsImluaXRpYXRlZCIsImdldFRpbWUiLCJzaW1wbGVVcGxvYWRlciIsImFyZ3MiLCJtdWx0aXBhcnRVcGxvYWRlciIsInNldEJ1Y2tldE5vdGlmaWNhdGlvbiIsImNvbmZpZyIsInJvb3ROYW1lIiwicmVuZGVyT3B0cyIsInByZXR0eSIsInJlbW92ZUFsbEJ1Y2tldE5vdGlmaWNhdGlvbiIsImdldEJ1Y2tldE5vdGlmaWNhdGlvbiIsImdldEJ1Y2tldE5vdGlmaWNhdGlvblRyYW5zZm9ybWVyIiwiYnVja2V0Tm90aWZpY2F0aW9uIiwibGlzdGVuQnVja2V0Tm90aWZpY2F0aW9uIiwic3VmZml4IiwiZXZlbnRzIiwibGlzdGVuZXIiLCJnZXRCdWNrZXRWZXJzaW9uaW5nIiwidmVyc2lvbkNvbmZpZyIsImJ1Y2tldFZlcnNpb25pbmdUcmFuc2Zvcm1lciIsInNldEJ1Y2tldFZlcnNpb25pbmciLCJrZXlzIiwic2V0VGFnZ2luZyIsInRhZ2dpbmdQYXJhbXMiLCJ0YWdzIiwicHV0T3B0cyIsInRhZ3NMaXN0IiwiZW50cmllcyIsIlZhbHVlIiwidGFnZ2luZ0NvbmZpZyIsIlRhZ2dpbmciLCJUYWdTZXQiLCJUYWciLCJzZXRCdWNrZXRUYWdnaW5nIiwic2V0T2JqZWN0VGFnZ2luZyIsInJlbW92ZVRhZ2dpbmciLCJyZW1vdmVCdWNrZXRUYWdnaW5nIiwicmVtb3ZlT2JqZWN0VGFnZ2luZyIsImdldEJ1Y2tldFRhZ2dpbmciLCJnZXRUYWdzVHJhbnNmb3JtZXIiLCJnZXRPYmplY3RUYWdnaW5nIiwiYXBwbHlCdWNrZXRMaWZlY3ljbGUiLCJwb2xpY3lDb25maWciLCJyZW1vdmVCdWNrZXRMaWZlY3ljbGUiLCJzZXRCdWNrZXRMaWZlY3ljbGUiLCJsaWZlQ3ljbGVDb25maWciLCJpc0VtcHR5IiwiZ2V0QnVja2V0TGlmZWN5Y2xlIiwibGlmZWN5Y2xlVHJhbnNmb3JtZXIiLCJsaWZlY3ljbGVDb25maWciLCJzZXRPYmplY3RMb2NrQ29uZmlnIiwibG9ja0NvbmZpZ09wdHMiLCJyZXRlbnRpb25Nb2RlcyIsIkNPTVBMSUFOQ0UiLCJHT1ZFUk5BTkNFIiwidmFsaWRVbml0cyIsIkRBWVMiLCJZRUFSUyIsIm1vZGUiLCJ1bml0IiwidmFsaWRpdHkiLCJPYmplY3RMb2NrRW5hYmxlZCIsImNvbmZpZ0tleXMiLCJkaWZmZXJlbmNlIiwiUnVsZSIsIkRlZmF1bHRSZXRlbnRpb24iLCJNb2RlIiwiRGF5cyIsIlllYXJzIiwiZ2V0T2JqZWN0TG9ja0NvbmZpZyIsIm9iamVjdExvY2tDb25maWciLCJvYmplY3RMb2NrVHJhbnNmb3JtZXIiLCJwdXRPYmplY3RSZXRlbnRpb24iLCJyZXRlbnRpb25PcHRzIiwicmV0YWluVW50aWxEYXRlIiwicGFyYW1zIiwiUmV0YWluVW50aWxEYXRlIiwiZ2V0T2JqZWN0UmV0ZW50aW9uIiwicmV0ZW50aW9uQ29uZmlnIiwib2JqZWN0UmV0ZW50aW9uVHJhbnNmb3JtZXIiLCJzZXRCdWNrZXRFbmNyeXB0aW9uIiwiZW5jcnlwdGlvbkNvbmZpZyIsImVuY3J5cHRpb25PYmoiLCJBcHBseVNlcnZlclNpZGVFbmNyeXB0aW9uQnlEZWZhdWx0IiwiU1NFQWxnb3JpdGhtIiwiZ2V0QnVja2V0RW5jcnlwdGlvbiIsImJ1Y2tldEVuY0NvbmZpZyIsImJ1Y2tldEVuY3J5cHRpb25UcmFuc2Zvcm1lciIsInJlbW92ZUJ1Y2tldEVuY3J5cHRpb24iLCJzZXRCdWNrZXRSZXBsaWNhdGlvbiIsInJlcGxpY2F0aW9uQ29uZmlnIiwicm9sZSIsInJ1bGVzIiwicmVwbGljYXRpb25QYXJhbXNDb25maWciLCJSZXBsaWNhdGlvbkNvbmZpZ3VyYXRpb24iLCJSb2xlIiwiZ2V0QnVja2V0UmVwbGljYXRpb24iLCJyZXBsaWNhdGlvbkNvbmZpZ1RyYW5zZm9ybWVyIiwicmVtb3ZlQnVja2V0UmVwbGljYXRpb24iLCJnZXRPYmplY3RMZWdhbEhvbGQiLCJsZWdhbEhvbGRDb25maWciLCJvYmplY3RMZWdhbEhvbGRUcmFuc2Zvcm1lciIsInNldE9iamVjdExlZ2FsSG9sZCIsInNldE9wdHMiLCJkZWZhdWx0T3B0cyIsInN0YXR1cyIsIkVOQUJMRUQiLCJESVNBQkxFRCIsIlN0YXR1cyIsImFib3J0TXVsdGlwYXJ0VXBsb2FkIiwidXBsb2FkUGFydENvcHkiLCJwYXJ0Q29uZmlnIiwidXBsb2FkSUQiLCJwYXJ0Q29weVJlc3VsdCIsInVwbG9hZFBhcnRUcmFuc2Zvcm1lciIsInVwbG9hZFBhcnRDb3B5UmVzIiwiY29tcG9zZU9iamVjdCIsImRlc3RPYmpDb25maWciLCJzb3VyY2VPYmpMaXN0IiwibWUiLCJzb3VyY2VGaWxlc0xlbmd0aCIsIk1BWF9QQVJUU19DT1VOVCIsImkiLCJnZXRTdGF0T3B0aW9ucyIsInNyY0NvbmZpZyIsIlZlcnNpb25JRCIsInNyY09iamVjdFNpemVzIiwidG90YWxTaXplIiwidG90YWxQYXJ0cyIsInNvdXJjZU9ialN0YXRzIiwibWFwIiwic3JjSXRlbSIsIlByb21pc2UiLCJhbGwiLCJ0aGVuIiwic3JjT2JqZWN0SW5mb3MiLCJ2YWxpZGF0ZWRTdGF0cyIsInJlc0l0ZW1TdGF0IiwiaW5kZXgiLCJzcmNDb3B5U2l6ZSIsIk1hdGNoUmFuZ2UiLCJzcmNTdGFydCIsIlN0YXJ0Iiwic3JjRW5kIiwiRW5kIiwiQUJTX01JTl9QQVJUX1NJWkUiLCJNQVhfTVVMVElQQVJUX1BVVF9PQkpFQ1RfU0laRSIsIk1BWF9QQVJUX1NJWkUiLCJNYXRjaEVUYWciLCJzcGxpdFBhcnRTaXplTGlzdCIsImlkeCIsImNhbFNpemUiLCJnZXRVcGxvYWRQYXJ0Q29uZmlnTGlzdCIsInVwbG9hZFBhcnRDb25maWdMaXN0Iiwic3BsaXRTaXplIiwic3BsaXRJbmRleCIsInN0YXJ0SW5kZXgiLCJzdGFydElkeCIsImVuZEluZGV4IiwiZW5kSWR4Iiwib2JqQ29uZmlnIiwicGFydEluZGV4IiwidG90YWxVcGxvYWRzIiwic3BsaXRTdGFydCIsInVwbGRDdHJJZHgiLCJzcGxpdEVuZCIsInNvdXJjZU9iaiIsInVwbG9hZFBhcnRDb25maWciLCJwZXJmb3JtVXBsb2FkUGFydHMiLCJ1cGxvYWRMaXN0IiwiYmluZCIsInJlcyIsInBhcnRDb3B5IiwibmV3VXBsb2FkSGVhZGVycyIsImNhdGNoIiwiZXJyb3IiLCJzZWxlY3RPYmplY3RDb250ZW50Iiwic2VsZWN0T3B0cyIsImV4cHJlc3Npb24iLCJpbnB1dFNlcmlhbGl6YXRpb24iLCJvdXRwdXRTZXJpYWxpemF0aW9uIiwiRXhwcmVzc2lvbiIsIkV4cHJlc3Npb25UeXBlIiwiZXhwcmVzc2lvblR5cGUiLCJJbnB1dFNlcmlhbGl6YXRpb24iLCJPdXRwdXRTZXJpYWxpemF0aW9uIiwicmVxdWVzdFByb2dyZXNzIiwiUmVxdWVzdFByb2dyZXNzIiwic2NhblJhbmdlIiwiU2NhblJhbmdlIiwic2VsZWN0UmVzdWx0Iiwic2VsZWN0T2JqZWN0Q29udGVudFRyYW5zZm9ybWVyIiwiY2xpZW50RXh0ZW5zaW9ucyIsInByb3RvdHlwZSJdLCJzb3VyY2VzIjpbIm1pbmlvLmpzIl0sInNvdXJjZXNDb250ZW50IjpbIi8qXG4gKiBNaW5JTyBKYXZhc2NyaXB0IExpYnJhcnkgZm9yIEFtYXpvbiBTMyBDb21wYXRpYmxlIENsb3VkIFN0b3JhZ2UsIChDKSAyMDE1IE1pbklPLCBJbmMuXG4gKlxuICogTGljZW5zZWQgdW5kZXIgdGhlIEFwYWNoZSBMaWNlbnNlLCBWZXJzaW9uIDIuMCAodGhlIFwiTGljZW5zZVwiKTtcbiAqIHlvdSBtYXkgbm90IHVzZSB0aGlzIGZpbGUgZXhjZXB0IGluIGNvbXBsaWFuY2Ugd2l0aCB0aGUgTGljZW5zZS5cbiAqIFlvdSBtYXkgb2J0YWluIGEgY29weSBvZiB0aGUgTGljZW5zZSBhdFxuICpcbiAqICAgICBodHRwOi8vd3d3LmFwYWNoZS5vcmcvbGljZW5zZXMvTElDRU5TRS0yLjBcbiAqXG4gKiBVbmxlc3MgcmVxdWlyZWQgYnkgYXBwbGljYWJsZSBsYXcgb3IgYWdyZWVkIHRvIGluIHdyaXRpbmcsIHNvZnR3YXJlXG4gKiBkaXN0cmlidXRlZCB1bmRlciB0aGUgTGljZW5zZSBpcyBkaXN0cmlidXRlZCBvbiBhbiBcIkFTIElTXCIgQkFTSVMsXG4gKiBXSVRIT1VUIFdBUlJBTlRJRVMgT1IgQ09ORElUSU9OUyBPRiBBTlkgS0lORCwgZWl0aGVyIGV4cHJlc3Mgb3IgaW1wbGllZC5cbiAqIFNlZSB0aGUgTGljZW5zZSBmb3IgdGhlIHNwZWNpZmljIGxhbmd1YWdlIGdvdmVybmluZyBwZXJtaXNzaW9ucyBhbmRcbiAqIGxpbWl0YXRpb25zIHVuZGVyIHRoZSBMaWNlbnNlLlxuICovXG5cbmltcG9ydCAqIGFzIGZzIGZyb20gJ25vZGU6ZnMnXG5pbXBvcnQgKiBhcyBwYXRoIGZyb20gJ25vZGU6cGF0aCdcbmltcG9ydCAqIGFzIFN0cmVhbSBmcm9tICdub2RlOnN0cmVhbSdcblxuaW1wb3J0IGFzeW5jIGZyb20gJ2FzeW5jJ1xuaW1wb3J0IEJsb2NrU3RyZWFtMiBmcm9tICdibG9jay1zdHJlYW0yJ1xuaW1wb3J0IF8gZnJvbSAnbG9kYXNoJ1xuaW1wb3J0ICogYXMgcXVlcnlzdHJpbmcgZnJvbSAncXVlcnktc3RyaW5nJ1xuaW1wb3J0IHsgVGV4dEVuY29kZXIgfSBmcm9tICd3ZWItZW5jb2RpbmcnXG5pbXBvcnQgWG1sIGZyb20gJ3htbCdcbmltcG9ydCB4bWwyanMgZnJvbSAneG1sMmpzJ1xuXG5pbXBvcnQgKiBhcyBlcnJvcnMgZnJvbSAnLi9lcnJvcnMudHMnXG5pbXBvcnQgeyBleHRlbnNpb25zIH0gZnJvbSAnLi9leHRlbnNpb25zLmpzJ1xuaW1wb3J0IHsgQ29weURlc3RpbmF0aW9uT3B0aW9ucywgQ29weVNvdXJjZU9wdGlvbnMsIERFRkFVTFRfUkVHSU9OIH0gZnJvbSAnLi9oZWxwZXJzLnRzJ1xuaW1wb3J0IHsgVHlwZWRDbGllbnQgfSBmcm9tICcuL2ludGVybmFsL2NsaWVudC50cydcbmltcG9ydCB7IENvcHlDb25kaXRpb25zIH0gZnJvbSAnLi9pbnRlcm5hbC9jb3B5LWNvbmRpdGlvbnMudHMnXG5pbXBvcnQge1xuICBjYWxjdWxhdGVFdmVuU3BsaXRzLFxuICBleHRyYWN0TWV0YWRhdGEsXG4gIGdldFNjb3BlLFxuICBnZXRTb3VyY2VWZXJzaW9uSWQsXG4gIGdldFZlcnNpb25JZCxcbiAgaW5zZXJ0Q29udGVudFR5cGUsXG4gIGlzQm9vbGVhbixcbiAgaXNGdW5jdGlvbixcbiAgaXNOdW1iZXIsXG4gIGlzT2JqZWN0LFxuICBpc1JlYWRhYmxlU3RyZWFtLFxuICBpc1N0cmluZyxcbiAgaXNWYWxpZEJ1Y2tldE5hbWUsXG4gIGlzVmFsaWREYXRlLFxuICBpc1ZhbGlkT2JqZWN0TmFtZSxcbiAgaXNWYWxpZFByZWZpeCxcbiAgbWFrZURhdGVMb25nLFxuICBQQVJUX0NPTlNUUkFJTlRTLFxuICBwYXJ0c1JlcXVpcmVkLFxuICBwaXBlc2V0dXAsXG4gIHByZXBlbmRYQU1aTWV0YSxcbiAgcmVhZGFibGVTdHJlYW0sXG4gIHNhbml0aXplRVRhZyxcbiAgdG9NZDUsXG4gIHRvU2hhMjU2LFxuICB1cmlFc2NhcGUsXG4gIHVyaVJlc291cmNlRXNjYXBlLFxufSBmcm9tICcuL2ludGVybmFsL2hlbHBlci50cydcbmltcG9ydCB7IFBvc3RQb2xpY3kgfSBmcm9tICcuL2ludGVybmFsL3Bvc3QtcG9saWN5LnRzJ1xuaW1wb3J0IHsgTEVHQUxfSE9MRF9TVEFUVVMsIFJFVEVOVElPTl9NT0RFUywgUkVURU5USU9OX1ZBTElESVRZX1VOSVRTIH0gZnJvbSAnLi9pbnRlcm5hbC90eXBlLnRzJ1xuaW1wb3J0IHsgTm90aWZpY2F0aW9uQ29uZmlnLCBOb3RpZmljYXRpb25Qb2xsZXIgfSBmcm9tICcuL25vdGlmaWNhdGlvbi5qcydcbmltcG9ydCB7IE9iamVjdFVwbG9hZGVyIH0gZnJvbSAnLi9vYmplY3QtdXBsb2FkZXIuanMnXG5pbXBvcnQgeyBwcm9taXNpZnkgfSBmcm9tICcuL3Byb21pc2lmeS5qcydcbmltcG9ydCB7IHBvc3RQcmVzaWduU2lnbmF0dXJlVjQsIHByZXNpZ25TaWduYXR1cmVWNCwgc2lnblY0IH0gZnJvbSAnLi9zaWduaW5nLnRzJ1xuaW1wb3J0ICogYXMgdHJhbnNmb3JtZXJzIGZyb20gJy4vdHJhbnNmb3JtZXJzLmpzJ1xuaW1wb3J0IHsgcGFyc2VTZWxlY3RPYmplY3RDb250ZW50UmVzcG9uc2UgfSBmcm9tICcuL3htbC1wYXJzZXJzLmpzJ1xuXG5leHBvcnQgKiBmcm9tICcuL2hlbHBlcnMudHMnXG5leHBvcnQgKiBmcm9tICcuL25vdGlmaWNhdGlvbi5qcydcbmV4cG9ydCB7IENvcHlDb25kaXRpb25zLCBQb3N0UG9saWN5IH1cblxuZXhwb3J0IGNsYXNzIENsaWVudCBleHRlbmRzIFR5cGVkQ2xpZW50IHtcbiAgLy8gU2V0IGFwcGxpY2F0aW9uIHNwZWNpZmljIGluZm9ybWF0aW9uLlxuICAvL1xuICAvLyBHZW5lcmF0ZXMgVXNlci1BZ2VudCBpbiB0aGUgZm9sbG93aW5nIHN0eWxlLlxuICAvL1xuICAvLyAgICAgICBNaW5JTyAoT1M7IEFSQ0gpIExJQi9WRVIgQVBQL1ZFUlxuICAvL1xuICAvLyBfX0FyZ3VtZW50c19fXG4gIC8vICogYGFwcE5hbWVgIF9zdHJpbmdfIC0gQXBwbGljYXRpb24gbmFtZS5cbiAgLy8gKiBgYXBwVmVyc2lvbmAgX3N0cmluZ18gLSBBcHBsaWNhdGlvbiB2ZXJzaW9uLlxuICBzZXRBcHBJbmZvKGFwcE5hbWUsIGFwcFZlcnNpb24pIHtcbiAgICBpZiAoIWlzU3RyaW5nKGFwcE5hbWUpKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKGBJbnZhbGlkIGFwcE5hbWU6ICR7YXBwTmFtZX1gKVxuICAgIH1cbiAgICBpZiAoYXBwTmFtZS50cmltKCkgPT09ICcnKSB7XG4gICAgICB0aHJvdyBuZXcgZXJyb3JzLkludmFsaWRBcmd1bWVudEVycm9yKCdJbnB1dCBhcHBOYW1lIGNhbm5vdCBiZSBlbXB0eS4nKVxuICAgIH1cbiAgICBpZiAoIWlzU3RyaW5nKGFwcFZlcnNpb24pKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKGBJbnZhbGlkIGFwcFZlcnNpb246ICR7YXBwVmVyc2lvbn1gKVxuICAgIH1cbiAgICBpZiAoYXBwVmVyc2lvbi50cmltKCkgPT09ICcnKSB7XG4gICAgICB0aHJvdyBuZXcgZXJyb3JzLkludmFsaWRBcmd1bWVudEVycm9yKCdJbnB1dCBhcHBWZXJzaW9uIGNhbm5vdCBiZSBlbXB0eS4nKVxuICAgIH1cbiAgICB0aGlzLnVzZXJBZ2VudCA9IGAke3RoaXMudXNlckFnZW50fSAke2FwcE5hbWV9LyR7YXBwVmVyc2lvbn1gXG4gIH1cblxuICAvLyBDYWxjdWxhdGUgcGFydCBzaXplIGdpdmVuIHRoZSBvYmplY3Qgc2l6ZS4gUGFydCBzaXplIHdpbGwgYmUgYXRsZWFzdCB0aGlzLnBhcnRTaXplXG4gIGNhbGN1bGF0ZVBhcnRTaXplKHNpemUpIHtcbiAgICBpZiAoIWlzTnVtYmVyKHNpemUpKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdzaXplIHNob3VsZCBiZSBvZiB0eXBlIFwibnVtYmVyXCInKVxuICAgIH1cbiAgICBpZiAoc2l6ZSA+IHRoaXMubWF4T2JqZWN0U2l6ZSkge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcihgc2l6ZSBzaG91bGQgbm90IGJlIG1vcmUgdGhhbiAke3RoaXMubWF4T2JqZWN0U2l6ZX1gKVxuICAgIH1cbiAgICBpZiAodGhpcy5vdmVyUmlkZVBhcnRTaXplKSB7XG4gICAgICByZXR1cm4gdGhpcy5wYXJ0U2l6ZVxuICAgIH1cbiAgICB2YXIgcGFydFNpemUgPSB0aGlzLnBhcnRTaXplXG4gICAgZm9yICg7Oykge1xuICAgICAgLy8gd2hpbGUodHJ1ZSkgey4uLn0gdGhyb3dzIGxpbnRpbmcgZXJyb3IuXG4gICAgICAvLyBJZiBwYXJ0U2l6ZSBpcyBiaWcgZW5vdWdoIHRvIGFjY29tb2RhdGUgdGhlIG9iamVjdCBzaXplLCB0aGVuIHVzZSBpdC5cbiAgICAgIGlmIChwYXJ0U2l6ZSAqIDEwMDAwID4gc2l6ZSkge1xuICAgICAgICByZXR1cm4gcGFydFNpemVcbiAgICAgIH1cbiAgICAgIC8vIFRyeSBwYXJ0IHNpemVzIGFzIDY0TUIsIDgwTUIsIDk2TUIgZXRjLlxuICAgICAgcGFydFNpemUgKz0gMTYgKiAxMDI0ICogMTAyNFxuICAgIH1cbiAgfVxuXG4gIC8vIGxvZyB0aGUgcmVxdWVzdCwgcmVzcG9uc2UsIGVycm9yXG4gIGxvZ0hUVFAocmVxT3B0aW9ucywgcmVzcG9uc2UsIGVycikge1xuICAgIC8vIGlmIG5vIGxvZ3N0cmVhbWVyIGF2YWlsYWJsZSByZXR1cm4uXG4gICAgaWYgKCF0aGlzLmxvZ1N0cmVhbSkge1xuICAgICAgcmV0dXJuXG4gICAgfVxuICAgIGlmICghaXNPYmplY3QocmVxT3B0aW9ucykpIHtcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ3JlcU9wdGlvbnMgc2hvdWxkIGJlIG9mIHR5cGUgXCJvYmplY3RcIicpXG4gICAgfVxuICAgIGlmIChyZXNwb25zZSAmJiAhaXNSZWFkYWJsZVN0cmVhbShyZXNwb25zZSkpIHtcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ3Jlc3BvbnNlIHNob3VsZCBiZSBvZiB0eXBlIFwiU3RyZWFtXCInKVxuICAgIH1cbiAgICBpZiAoZXJyICYmICEoZXJyIGluc3RhbmNlb2YgRXJyb3IpKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdlcnIgc2hvdWxkIGJlIG9mIHR5cGUgXCJFcnJvclwiJylcbiAgICB9XG4gICAgdmFyIGxvZ0hlYWRlcnMgPSAoaGVhZGVycykgPT4ge1xuICAgICAgXy5mb3JFYWNoKGhlYWRlcnMsICh2LCBrKSA9PiB7XG4gICAgICAgIGlmIChrID09ICdhdXRob3JpemF0aW9uJykge1xuICAgICAgICAgIHZhciByZWRhY3RlciA9IG5ldyBSZWdFeHAoJ1NpZ25hdHVyZT0oWzAtOWEtZl0rKScpXG4gICAgICAgICAgdiA9IHYucmVwbGFjZShyZWRhY3RlciwgJ1NpZ25hdHVyZT0qKlJFREFDVEVEKionKVxuICAgICAgICB9XG4gICAgICAgIHRoaXMubG9nU3RyZWFtLndyaXRlKGAke2t9OiAke3Z9XFxuYClcbiAgICAgIH0pXG4gICAgICB0aGlzLmxvZ1N0cmVhbS53cml0ZSgnXFxuJylcbiAgICB9XG4gICAgdGhpcy5sb2dTdHJlYW0ud3JpdGUoYFJFUVVFU1Q6ICR7cmVxT3B0aW9ucy5tZXRob2R9ICR7cmVxT3B0aW9ucy5wYXRofVxcbmApXG4gICAgbG9nSGVhZGVycyhyZXFPcHRpb25zLmhlYWRlcnMpXG4gICAgaWYgKHJlc3BvbnNlKSB7XG4gICAgICB0aGlzLmxvZ1N0cmVhbS53cml0ZShgUkVTUE9OU0U6ICR7cmVzcG9uc2Uuc3RhdHVzQ29kZX1cXG5gKVxuICAgICAgbG9nSGVhZGVycyhyZXNwb25zZS5oZWFkZXJzKVxuICAgIH1cbiAgICBpZiAoZXJyKSB7XG4gICAgICB0aGlzLmxvZ1N0cmVhbS53cml0ZSgnRVJST1IgQk9EWTpcXG4nKVxuICAgICAgdmFyIGVyckpTT04gPSBKU09OLnN0cmluZ2lmeShlcnIsIG51bGwsICdcXHQnKVxuICAgICAgdGhpcy5sb2dTdHJlYW0ud3JpdGUoYCR7ZXJySlNPTn1cXG5gKVxuICAgIH1cbiAgfVxuXG4gIC8vIEVuYWJsZSB0cmFjaW5nXG4gIHRyYWNlT24oc3RyZWFtKSB7XG4gICAgaWYgKCFzdHJlYW0pIHtcbiAgICAgIHN0cmVhbSA9IHByb2Nlc3Muc3Rkb3V0XG4gICAgfVxuICAgIHRoaXMubG9nU3RyZWFtID0gc3RyZWFtXG4gIH1cblxuICAvLyBEaXNhYmxlIHRyYWNpbmdcbiAgdHJhY2VPZmYoKSB7XG4gICAgdGhpcy5sb2dTdHJlYW0gPSBudWxsXG4gIH1cblxuICAvLyBtYWtlUmVxdWVzdCBpcyB0aGUgcHJpbWl0aXZlIHVzZWQgYnkgdGhlIGFwaXMgZm9yIG1ha2luZyBTMyByZXF1ZXN0cy5cbiAgLy8gcGF5bG9hZCBjYW4gYmUgZW1wdHkgc3RyaW5nIGluIGNhc2Ugb2Ygbm8gcGF5bG9hZC5cbiAgLy8gc3RhdHVzQ29kZSBpcyB0aGUgZXhwZWN0ZWQgc3RhdHVzQ29kZS4gSWYgcmVzcG9uc2Uuc3RhdHVzQ29kZSBkb2VzIG5vdCBtYXRjaFxuICAvLyB3ZSBwYXJzZSB0aGUgWE1MIGVycm9yIGFuZCBjYWxsIHRoZSBjYWxsYmFjayB3aXRoIHRoZSBlcnJvciBtZXNzYWdlLlxuICAvLyBBIHZhbGlkIHJlZ2lvbiBpcyBwYXNzZWQgYnkgdGhlIGNhbGxzIC0gbGlzdEJ1Y2tldHMsIG1ha2VCdWNrZXQgYW5kXG4gIC8vIGdldEJ1Y2tldFJlZ2lvbi5cbiAgbWFrZVJlcXVlc3Qob3B0aW9ucywgcGF5bG9hZCwgc3RhdHVzQ29kZXMsIHJlZ2lvbiwgcmV0dXJuUmVzcG9uc2UsIGNiKSB7XG4gICAgaWYgKCFpc09iamVjdChvcHRpb25zKSkge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignb3B0aW9ucyBzaG91bGQgYmUgb2YgdHlwZSBcIm9iamVjdFwiJylcbiAgICB9XG4gICAgaWYgKCFpc1N0cmluZyhwYXlsb2FkKSAmJiAhaXNPYmplY3QocGF5bG9hZCkpIHtcbiAgICAgIC8vIEJ1ZmZlciBpcyBvZiB0eXBlICdvYmplY3QnXG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdwYXlsb2FkIHNob3VsZCBiZSBvZiB0eXBlIFwic3RyaW5nXCIgb3IgXCJCdWZmZXJcIicpXG4gICAgfVxuICAgIHN0YXR1c0NvZGVzLmZvckVhY2goKHN0YXR1c0NvZGUpID0+IHtcbiAgICAgIGlmICghaXNOdW1iZXIoc3RhdHVzQ29kZSkpIHtcbiAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignc3RhdHVzQ29kZSBzaG91bGQgYmUgb2YgdHlwZSBcIm51bWJlclwiJylcbiAgICAgIH1cbiAgICB9KVxuICAgIGlmICghaXNTdHJpbmcocmVnaW9uKSkge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcigncmVnaW9uIHNob3VsZCBiZSBvZiB0eXBlIFwic3RyaW5nXCInKVxuICAgIH1cbiAgICBpZiAoIWlzQm9vbGVhbihyZXR1cm5SZXNwb25zZSkpIHtcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ3JldHVyblJlc3BvbnNlIHNob3VsZCBiZSBvZiB0eXBlIFwiYm9vbGVhblwiJylcbiAgICB9XG4gICAgaWYgKCFpc0Z1bmN0aW9uKGNiKSkge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignY2FsbGJhY2sgc2hvdWxkIGJlIG9mIHR5cGUgXCJmdW5jdGlvblwiJylcbiAgICB9XG4gICAgaWYgKCFvcHRpb25zLmhlYWRlcnMpIHtcbiAgICAgIG9wdGlvbnMuaGVhZGVycyA9IHt9XG4gICAgfVxuICAgIGlmIChvcHRpb25zLm1ldGhvZCA9PT0gJ1BPU1QnIHx8IG9wdGlvbnMubWV0aG9kID09PSAnUFVUJyB8fCBvcHRpb25zLm1ldGhvZCA9PT0gJ0RFTEVURScpIHtcbiAgICAgIG9wdGlvbnMuaGVhZGVyc1snY29udGVudC1sZW5ndGgnXSA9IHBheWxvYWQubGVuZ3RoXG4gICAgfVxuICAgIHZhciBzaGEyNTZzdW0gPSAnJ1xuICAgIGlmICh0aGlzLmVuYWJsZVNIQTI1Nikge1xuICAgICAgc2hhMjU2c3VtID0gdG9TaGEyNTYocGF5bG9hZClcbiAgICB9XG4gICAgdmFyIHN0cmVhbSA9IHJlYWRhYmxlU3RyZWFtKHBheWxvYWQpXG4gICAgdGhpcy5tYWtlUmVxdWVzdFN0cmVhbShvcHRpb25zLCBzdHJlYW0sIHNoYTI1NnN1bSwgc3RhdHVzQ29kZXMsIHJlZ2lvbiwgcmV0dXJuUmVzcG9uc2UsIGNiKVxuICB9XG5cbiAgLy8gbWFrZVJlcXVlc3RTdHJlYW0gd2lsbCBiZSB1c2VkIGRpcmVjdGx5IGluc3RlYWQgb2YgbWFrZVJlcXVlc3QgaW4gY2FzZSB0aGUgcGF5bG9hZFxuICAvLyBpcyBhdmFpbGFibGUgYXMgYSBzdHJlYW0uIGZvciBleC4gcHV0T2JqZWN0XG4gIG1ha2VSZXF1ZXN0U3RyZWFtKG9wdGlvbnMsIHN0cmVhbSwgc2hhMjU2c3VtLCBzdGF0dXNDb2RlcywgcmVnaW9uLCByZXR1cm5SZXNwb25zZSwgY2IpIHtcbiAgICBpZiAoIWlzT2JqZWN0KG9wdGlvbnMpKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdvcHRpb25zIHNob3VsZCBiZSBvZiB0eXBlIFwib2JqZWN0XCInKVxuICAgIH1cbiAgICBpZiAoIWlzUmVhZGFibGVTdHJlYW0oc3RyZWFtKSkge1xuICAgICAgdGhyb3cgbmV3IGVycm9ycy5JbnZhbGlkQXJndW1lbnRFcnJvcignc3RyZWFtIHNob3VsZCBiZSBhIHJlYWRhYmxlIFN0cmVhbScpXG4gICAgfVxuICAgIGlmICghaXNTdHJpbmcoc2hhMjU2c3VtKSkge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignc2hhMjU2c3VtIHNob3VsZCBiZSBvZiB0eXBlIFwic3RyaW5nXCInKVxuICAgIH1cbiAgICBzdGF0dXNDb2Rlcy5mb3JFYWNoKChzdGF0dXNDb2RlKSA9PiB7XG4gICAgICBpZiAoIWlzTnVtYmVyKHN0YXR1c0NvZGUpKSB7XG4gICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ3N0YXR1c0NvZGUgc2hvdWxkIGJlIG9mIHR5cGUgXCJudW1iZXJcIicpXG4gICAgICB9XG4gICAgfSlcbiAgICBpZiAoIWlzU3RyaW5nKHJlZ2lvbikpIHtcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ3JlZ2lvbiBzaG91bGQgYmUgb2YgdHlwZSBcInN0cmluZ1wiJylcbiAgICB9XG4gICAgaWYgKCFpc0Jvb2xlYW4ocmV0dXJuUmVzcG9uc2UpKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdyZXR1cm5SZXNwb25zZSBzaG91bGQgYmUgb2YgdHlwZSBcImJvb2xlYW5cIicpXG4gICAgfVxuICAgIGlmICghaXNGdW5jdGlvbihjYikpIHtcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ2NhbGxiYWNrIHNob3VsZCBiZSBvZiB0eXBlIFwiZnVuY3Rpb25cIicpXG4gICAgfVxuXG4gICAgLy8gc2hhMjU2c3VtIHdpbGwgYmUgZW1wdHkgZm9yIGFub255bW91cyBvciBodHRwcyByZXF1ZXN0c1xuICAgIGlmICghdGhpcy5lbmFibGVTSEEyNTYgJiYgc2hhMjU2c3VtLmxlbmd0aCAhPT0gMCkge1xuICAgICAgdGhyb3cgbmV3IGVycm9ycy5JbnZhbGlkQXJndW1lbnRFcnJvcihgc2hhMjU2c3VtIGV4cGVjdGVkIHRvIGJlIGVtcHR5IGZvciBhbm9ueW1vdXMgb3IgaHR0cHMgcmVxdWVzdHNgKVxuICAgIH1cbiAgICAvLyBzaGEyNTZzdW0gc2hvdWxkIGJlIHZhbGlkIGZvciBub24tYW5vbnltb3VzIGh0dHAgcmVxdWVzdHMuXG4gICAgaWYgKHRoaXMuZW5hYmxlU0hBMjU2ICYmIHNoYTI1NnN1bS5sZW5ndGggIT09IDY0KSB7XG4gICAgICB0aHJvdyBuZXcgZXJyb3JzLkludmFsaWRBcmd1bWVudEVycm9yKGBJbnZhbGlkIHNoYTI1NnN1bSA6ICR7c2hhMjU2c3VtfWApXG4gICAgfVxuXG4gICAgdmFyIF9tYWtlUmVxdWVzdCA9IChlLCByZWdpb24pID0+IHtcbiAgICAgIGlmIChlKSB7XG4gICAgICAgIHJldHVybiBjYihlKVxuICAgICAgfVxuICAgICAgb3B0aW9ucy5yZWdpb24gPSByZWdpb25cbiAgICAgIHZhciByZXFPcHRpb25zID0gdGhpcy5nZXRSZXF1ZXN0T3B0aW9ucyhvcHRpb25zKVxuICAgICAgaWYgKCF0aGlzLmFub255bW91cykge1xuICAgICAgICAvLyBGb3Igbm9uLWFub255bW91cyBodHRwcyByZXF1ZXN0cyBzaGEyNTZzdW0gaXMgJ1VOU0lHTkVELVBBWUxPQUQnIGZvciBzaWduYXR1cmUgY2FsY3VsYXRpb24uXG4gICAgICAgIGlmICghdGhpcy5lbmFibGVTSEEyNTYpIHtcbiAgICAgICAgICBzaGEyNTZzdW0gPSAnVU5TSUdORUQtUEFZTE9BRCdcbiAgICAgICAgfVxuXG4gICAgICAgIGxldCBkYXRlID0gbmV3IERhdGUoKVxuXG4gICAgICAgIHJlcU9wdGlvbnMuaGVhZGVyc1sneC1hbXotZGF0ZSddID0gbWFrZURhdGVMb25nKGRhdGUpXG4gICAgICAgIHJlcU9wdGlvbnMuaGVhZGVyc1sneC1hbXotY29udGVudC1zaGEyNTYnXSA9IHNoYTI1NnN1bVxuICAgICAgICBpZiAodGhpcy5zZXNzaW9uVG9rZW4pIHtcbiAgICAgICAgICByZXFPcHRpb25zLmhlYWRlcnNbJ3gtYW16LXNlY3VyaXR5LXRva2VuJ10gPSB0aGlzLnNlc3Npb25Ub2tlblxuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5jaGVja0FuZFJlZnJlc2hDcmVkcygpXG4gICAgICAgIHZhciBhdXRob3JpemF0aW9uID0gc2lnblY0KHJlcU9wdGlvbnMsIHRoaXMuYWNjZXNzS2V5LCB0aGlzLnNlY3JldEtleSwgcmVnaW9uLCBkYXRlLCBzaGEyNTZzdW0pXG4gICAgICAgIHJlcU9wdGlvbnMuaGVhZGVycy5hdXRob3JpemF0aW9uID0gYXV0aG9yaXphdGlvblxuICAgICAgfVxuICAgICAgdmFyIHJlcSA9IHRoaXMudHJhbnNwb3J0LnJlcXVlc3QocmVxT3B0aW9ucywgKHJlc3BvbnNlKSA9PiB7XG4gICAgICAgIGlmICghc3RhdHVzQ29kZXMuaW5jbHVkZXMocmVzcG9uc2Uuc3RhdHVzQ29kZSkpIHtcbiAgICAgICAgICAvLyBGb3IgYW4gaW5jb3JyZWN0IHJlZ2lvbiwgUzMgc2VydmVyIGFsd2F5cyBzZW5kcyBiYWNrIDQwMC5cbiAgICAgICAgICAvLyBCdXQgd2Ugd2lsbCBkbyBjYWNoZSBpbnZhbGlkYXRpb24gZm9yIGFsbCBlcnJvcnMgc28gdGhhdCxcbiAgICAgICAgICAvLyBpbiBmdXR1cmUsIGlmIEFXUyBTMyBkZWNpZGVzIHRvIHNlbmQgYSBkaWZmZXJlbnQgc3RhdHVzIGNvZGUgb3JcbiAgICAgICAgICAvLyBYTUwgZXJyb3IgY29kZSB3ZSB3aWxsIHN0aWxsIHdvcmsgZmluZS5cbiAgICAgICAgICBkZWxldGUgdGhpcy5yZWdpb25NYXBbb3B0aW9ucy5idWNrZXROYW1lXVxuICAgICAgICAgIHZhciBlcnJvclRyYW5zZm9ybWVyID0gdHJhbnNmb3JtZXJzLmdldEVycm9yVHJhbnNmb3JtZXIocmVzcG9uc2UpXG4gICAgICAgICAgcGlwZXNldHVwKHJlc3BvbnNlLCBlcnJvclRyYW5zZm9ybWVyKS5vbignZXJyb3InLCAoZSkgPT4ge1xuICAgICAgICAgICAgdGhpcy5sb2dIVFRQKHJlcU9wdGlvbnMsIHJlc3BvbnNlLCBlKVxuICAgICAgICAgICAgY2IoZSlcbiAgICAgICAgICB9KVxuICAgICAgICAgIHJldHVyblxuICAgICAgICB9XG4gICAgICAgIHRoaXMubG9nSFRUUChyZXFPcHRpb25zLCByZXNwb25zZSlcbiAgICAgICAgaWYgKHJldHVyblJlc3BvbnNlKSB7XG4gICAgICAgICAgcmV0dXJuIGNiKG51bGwsIHJlc3BvbnNlKVxuICAgICAgICB9XG4gICAgICAgIC8vIFdlIGRyYWluIHRoZSBzb2NrZXQgc28gdGhhdCB0aGUgY29ubmVjdGlvbiBnZXRzIGNsb3NlZC4gTm90ZSB0aGF0IHRoaXNcbiAgICAgICAgLy8gaXMgbm90IGV4cGVuc2l2ZSBhcyB0aGUgc29ja2V0IHdpbGwgbm90IGhhdmUgYW55IGRhdGEuXG4gICAgICAgIHJlc3BvbnNlLm9uKCdkYXRhJywgKCkgPT4ge30pXG4gICAgICAgIGNiKG51bGwpXG4gICAgICB9KVxuICAgICAgbGV0IHBpcGUgPSBwaXBlc2V0dXAoc3RyZWFtLCByZXEpXG4gICAgICBwaXBlLm9uKCdlcnJvcicsIChlKSA9PiB7XG4gICAgICAgIHRoaXMubG9nSFRUUChyZXFPcHRpb25zLCBudWxsLCBlKVxuICAgICAgICBjYihlKVxuICAgICAgfSlcbiAgICB9XG4gICAgaWYgKHJlZ2lvbikge1xuICAgICAgcmV0dXJuIF9tYWtlUmVxdWVzdChudWxsLCByZWdpb24pXG4gICAgfVxuICAgIHRoaXMuZ2V0QnVja2V0UmVnaW9uKG9wdGlvbnMuYnVja2V0TmFtZSwgX21ha2VSZXF1ZXN0KVxuICB9XG5cbiAgLy8gZ2V0cyB0aGUgcmVnaW9uIG9mIHRoZSBidWNrZXRcbiAgZ2V0QnVja2V0UmVnaW9uKGJ1Y2tldE5hbWUsIGNiKSB7XG4gICAgaWYgKCFpc1ZhbGlkQnVja2V0TmFtZShidWNrZXROYW1lKSkge1xuICAgICAgdGhyb3cgbmV3IGVycm9ycy5JbnZhbGlkQnVja2V0TmFtZUVycm9yKGBJbnZhbGlkIGJ1Y2tldCBuYW1lIDogJHtidWNrZXROYW1lfWApXG4gICAgfVxuICAgIGlmICghaXNGdW5jdGlvbihjYikpIHtcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ2NiIHNob3VsZCBiZSBvZiB0eXBlIFwiZnVuY3Rpb25cIicpXG4gICAgfVxuXG4gICAgLy8gUmVnaW9uIGlzIHNldCB3aXRoIGNvbnN0cnVjdG9yLCByZXR1cm4gdGhlIHJlZ2lvbiByaWdodCBoZXJlLlxuICAgIGlmICh0aGlzLnJlZ2lvbikge1xuICAgICAgcmV0dXJuIGNiKG51bGwsIHRoaXMucmVnaW9uKVxuICAgIH1cblxuICAgIGlmICh0aGlzLnJlZ2lvbk1hcFtidWNrZXROYW1lXSkge1xuICAgICAgcmV0dXJuIGNiKG51bGwsIHRoaXMucmVnaW9uTWFwW2J1Y2tldE5hbWVdKVxuICAgIH1cbiAgICB2YXIgZXh0cmFjdFJlZ2lvbiA9IChyZXNwb25zZSkgPT4ge1xuICAgICAgdmFyIHRyYW5zZm9ybWVyID0gdHJhbnNmb3JtZXJzLmdldEJ1Y2tldFJlZ2lvblRyYW5zZm9ybWVyKClcbiAgICAgIHZhciByZWdpb24gPSBERUZBVUxUX1JFR0lPTlxuICAgICAgcGlwZXNldHVwKHJlc3BvbnNlLCB0cmFuc2Zvcm1lcilcbiAgICAgICAgLm9uKCdlcnJvcicsIGNiKVxuICAgICAgICAub24oJ2RhdGEnLCAoZGF0YSkgPT4ge1xuICAgICAgICAgIGlmIChkYXRhKSB7XG4gICAgICAgICAgICByZWdpb24gPSBkYXRhXG4gICAgICAgICAgfVxuICAgICAgICB9KVxuICAgICAgICAub24oJ2VuZCcsICgpID0+IHtcbiAgICAgICAgICB0aGlzLnJlZ2lvbk1hcFtidWNrZXROYW1lXSA9IHJlZ2lvblxuICAgICAgICAgIGNiKG51bGwsIHJlZ2lvbilcbiAgICAgICAgfSlcbiAgICB9XG5cbiAgICB2YXIgbWV0aG9kID0gJ0dFVCdcbiAgICB2YXIgcXVlcnkgPSAnbG9jYXRpb24nXG5cbiAgICAvLyBgZ2V0QnVja2V0TG9jYXRpb25gIGJlaGF2ZXMgZGlmZmVyZW50bHkgaW4gZm9sbG93aW5nIHdheXMgZm9yXG4gICAgLy8gZGlmZmVyZW50IGVudmlyb25tZW50cy5cbiAgICAvL1xuICAgIC8vIC0gRm9yIG5vZGVqcyBlbnYgd2UgZGVmYXVsdCB0byBwYXRoIHN0eWxlIHJlcXVlc3RzLlxuICAgIC8vIC0gRm9yIGJyb3dzZXIgZW52IHBhdGggc3R5bGUgcmVxdWVzdHMgb24gYnVja2V0cyB5aWVsZHMgQ09SU1xuICAgIC8vICAgZXJyb3IuIFRvIGNpcmN1bXZlbnQgdGhpcyBwcm9ibGVtIHdlIG1ha2UgYSB2aXJ0dWFsIGhvc3RcbiAgICAvLyAgIHN0eWxlIHJlcXVlc3Qgc2lnbmVkIHdpdGggJ3VzLWVhc3QtMScuIFRoaXMgcmVxdWVzdCBmYWlsc1xuICAgIC8vICAgd2l0aCBhbiBlcnJvciAnQXV0aG9yaXphdGlvbkhlYWRlck1hbGZvcm1lZCcsIGFkZGl0aW9uYWxseVxuICAgIC8vICAgdGhlIGVycm9yIFhNTCBhbHNvIHByb3ZpZGVzIFJlZ2lvbiBvZiB0aGUgYnVja2V0LiBUbyB2YWxpZGF0ZVxuICAgIC8vICAgdGhpcyByZWdpb24gaXMgcHJvcGVyIHdlIHJldHJ5IHRoZSBzYW1lIHJlcXVlc3Qgd2l0aCB0aGUgbmV3bHlcbiAgICAvLyAgIG9idGFpbmVkIHJlZ2lvbi5cbiAgICB2YXIgcGF0aFN0eWxlID0gdGhpcy5wYXRoU3R5bGUgJiYgdHlwZW9mIHdpbmRvdyA9PT0gJ3VuZGVmaW5lZCdcblxuICAgIHRoaXMubWFrZVJlcXVlc3QoeyBtZXRob2QsIGJ1Y2tldE5hbWUsIHF1ZXJ5LCBwYXRoU3R5bGUgfSwgJycsIFsyMDBdLCBERUZBVUxUX1JFR0lPTiwgdHJ1ZSwgKGUsIHJlc3BvbnNlKSA9PiB7XG4gICAgICBpZiAoZSkge1xuICAgICAgICBpZiAoZS5uYW1lID09PSAnQXV0aG9yaXphdGlvbkhlYWRlck1hbGZvcm1lZCcpIHtcbiAgICAgICAgICB2YXIgcmVnaW9uID0gZS5SZWdpb25cbiAgICAgICAgICBpZiAoIXJlZ2lvbikge1xuICAgICAgICAgICAgcmV0dXJuIGNiKGUpXG4gICAgICAgICAgfVxuICAgICAgICAgIHRoaXMubWFrZVJlcXVlc3QoeyBtZXRob2QsIGJ1Y2tldE5hbWUsIHF1ZXJ5IH0sICcnLCBbMjAwXSwgcmVnaW9uLCB0cnVlLCAoZSwgcmVzcG9uc2UpID0+IHtcbiAgICAgICAgICAgIGlmIChlKSB7XG4gICAgICAgICAgICAgIHJldHVybiBjYihlKVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZXh0cmFjdFJlZ2lvbihyZXNwb25zZSlcbiAgICAgICAgICB9KVxuICAgICAgICAgIHJldHVyblxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBjYihlKVxuICAgICAgfVxuICAgICAgZXh0cmFjdFJlZ2lvbihyZXNwb25zZSlcbiAgICB9KVxuICB9XG5cbiAgLy8gQ3JlYXRlcyB0aGUgYnVja2V0IGBidWNrZXROYW1lYC5cbiAgLy9cbiAgLy8gX19Bcmd1bWVudHNfX1xuICAvLyAqIGBidWNrZXROYW1lYCBfc3RyaW5nXyAtIE5hbWUgb2YgdGhlIGJ1Y2tldFxuICAvLyAqIGByZWdpb25gIF9zdHJpbmdfIC0gcmVnaW9uIHZhbGlkIHZhbHVlcyBhcmUgX3VzLXdlc3QtMV8sIF91cy13ZXN0LTJfLCAgX2V1LXdlc3QtMV8sIF9ldS1jZW50cmFsLTFfLCBfYXAtc291dGhlYXN0LTFfLCBfYXAtbm9ydGhlYXN0LTFfLCBfYXAtc291dGhlYXN0LTJfLCBfc2EtZWFzdC0xXy5cbiAgLy8gKiBgbWFrZU9wdHNgIF9vYmplY3RfIC0gT3B0aW9ucyB0byBjcmVhdGUgYSBidWNrZXQuIGUuZyB7T2JqZWN0TG9ja2luZzp0cnVlfSAoT3B0aW9uYWwpXG4gIC8vICogYGNhbGxiYWNrKGVycilgIF9mdW5jdGlvbl8gLSBjYWxsYmFjayBmdW5jdGlvbiB3aXRoIGBlcnJgIGFzIHRoZSBlcnJvciBhcmd1bWVudC4gYGVycmAgaXMgbnVsbCBpZiB0aGUgYnVja2V0IGlzIHN1Y2Nlc3NmdWxseSBjcmVhdGVkLlxuICBtYWtlQnVja2V0KGJ1Y2tldE5hbWUsIHJlZ2lvbiwgbWFrZU9wdHMgPSB7fSwgY2IpIHtcbiAgICBpZiAoIWlzVmFsaWRCdWNrZXROYW1lKGJ1Y2tldE5hbWUpKSB7XG4gICAgICB0aHJvdyBuZXcgZXJyb3JzLkludmFsaWRCdWNrZXROYW1lRXJyb3IoJ0ludmFsaWQgYnVja2V0IG5hbWU6ICcgKyBidWNrZXROYW1lKVxuICAgIH1cbiAgICAvLyBCYWNrd2FyZCBDb21wYXRpYmlsaXR5XG4gICAgaWYgKGlzT2JqZWN0KHJlZ2lvbikpIHtcbiAgICAgIGNiID0gbWFrZU9wdHNcbiAgICAgIG1ha2VPcHRzID0gcmVnaW9uXG4gICAgICByZWdpb24gPSAnJ1xuICAgIH1cbiAgICBpZiAoaXNGdW5jdGlvbihyZWdpb24pKSB7XG4gICAgICBjYiA9IHJlZ2lvblxuICAgICAgcmVnaW9uID0gJydcbiAgICAgIG1ha2VPcHRzID0ge31cbiAgICB9XG4gICAgaWYgKGlzRnVuY3Rpb24obWFrZU9wdHMpKSB7XG4gICAgICBjYiA9IG1ha2VPcHRzXG4gICAgICBtYWtlT3B0cyA9IHt9XG4gICAgfVxuXG4gICAgaWYgKCFpc1N0cmluZyhyZWdpb24pKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdyZWdpb24gc2hvdWxkIGJlIG9mIHR5cGUgXCJzdHJpbmdcIicpXG4gICAgfVxuICAgIGlmICghaXNPYmplY3QobWFrZU9wdHMpKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdtYWtlT3B0cyBzaG91bGQgYmUgb2YgdHlwZSBcIm9iamVjdFwiJylcbiAgICB9XG4gICAgaWYgKCFpc0Z1bmN0aW9uKGNiKSkge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignY2FsbGJhY2sgc2hvdWxkIGJlIG9mIHR5cGUgXCJmdW5jdGlvblwiJylcbiAgICB9XG5cbiAgICB2YXIgcGF5bG9hZCA9ICcnXG5cbiAgICAvLyBSZWdpb24gYWxyZWFkeSBzZXQgaW4gY29uc3RydWN0b3IsIHZhbGlkYXRlIGlmXG4gICAgLy8gY2FsbGVyIHJlcXVlc3RlZCBidWNrZXQgbG9jYXRpb24gaXMgc2FtZS5cbiAgICBpZiAocmVnaW9uICYmIHRoaXMucmVnaW9uKSB7XG4gICAgICBpZiAocmVnaW9uICE9PSB0aGlzLnJlZ2lvbikge1xuICAgICAgICB0aHJvdyBuZXcgZXJyb3JzLkludmFsaWRBcmd1bWVudEVycm9yKGBDb25maWd1cmVkIHJlZ2lvbiAke3RoaXMucmVnaW9ufSwgcmVxdWVzdGVkICR7cmVnaW9ufWApXG4gICAgICB9XG4gICAgfVxuICAgIC8vIHNlbmRpbmcgbWFrZUJ1Y2tldCByZXF1ZXN0IHdpdGggWE1MIGNvbnRhaW5pbmcgJ3VzLWVhc3QtMScgZmFpbHMuIEZvclxuICAgIC8vIGRlZmF1bHQgcmVnaW9uIHNlcnZlciBleHBlY3RzIHRoZSByZXF1ZXN0IHdpdGhvdXQgYm9keVxuICAgIGlmIChyZWdpb24gJiYgcmVnaW9uICE9PSBERUZBVUxUX1JFR0lPTikge1xuICAgICAgdmFyIGNyZWF0ZUJ1Y2tldENvbmZpZ3VyYXRpb24gPSBbXVxuICAgICAgY3JlYXRlQnVja2V0Q29uZmlndXJhdGlvbi5wdXNoKHtcbiAgICAgICAgX2F0dHI6IHtcbiAgICAgICAgICB4bWxuczogJ2h0dHA6Ly9zMy5hbWF6b25hd3MuY29tL2RvYy8yMDA2LTAzLTAxLycsXG4gICAgICAgIH0sXG4gICAgICB9KVxuICAgICAgY3JlYXRlQnVja2V0Q29uZmlndXJhdGlvbi5wdXNoKHtcbiAgICAgICAgTG9jYXRpb25Db25zdHJhaW50OiByZWdpb24sXG4gICAgICB9KVxuICAgICAgdmFyIHBheWxvYWRPYmplY3QgPSB7XG4gICAgICAgIENyZWF0ZUJ1Y2tldENvbmZpZ3VyYXRpb246IGNyZWF0ZUJ1Y2tldENvbmZpZ3VyYXRpb24sXG4gICAgICB9XG4gICAgICBwYXlsb2FkID0gWG1sKHBheWxvYWRPYmplY3QpXG4gICAgfVxuICAgIHZhciBtZXRob2QgPSAnUFVUJ1xuICAgIHZhciBoZWFkZXJzID0ge31cblxuICAgIGlmIChtYWtlT3B0cy5PYmplY3RMb2NraW5nKSB7XG4gICAgICBoZWFkZXJzWyd4LWFtei1idWNrZXQtb2JqZWN0LWxvY2stZW5hYmxlZCddID0gdHJ1ZVxuICAgIH1cblxuICAgIGlmICghcmVnaW9uKSB7XG4gICAgICByZWdpb24gPSBERUZBVUxUX1JFR0lPTlxuICAgIH1cblxuICAgIGNvbnN0IHByb2Nlc3NXaXRoUmV0cnkgPSAoZXJyKSA9PiB7XG4gICAgICBpZiAoZXJyICYmIChyZWdpb24gPT09ICcnIHx8IHJlZ2lvbiA9PT0gREVGQVVMVF9SRUdJT04pKSB7XG4gICAgICAgIGlmIChlcnIuY29kZSA9PT0gJ0F1dGhvcml6YXRpb25IZWFkZXJNYWxmb3JtZWQnICYmIGVyci5yZWdpb24gIT09ICcnKSB7XG4gICAgICAgICAgLy8gUmV0cnkgd2l0aCByZWdpb24gcmV0dXJuZWQgYXMgcGFydCBvZiBlcnJvclxuICAgICAgICAgIHRoaXMubWFrZVJlcXVlc3QoeyBtZXRob2QsIGJ1Y2tldE5hbWUsIGhlYWRlcnMgfSwgcGF5bG9hZCwgWzIwMF0sIGVyci5yZWdpb24sIGZhbHNlLCBjYilcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICByZXR1cm4gY2IgJiYgY2IoZXJyKVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICByZXR1cm4gY2IgJiYgY2IoZXJyKVxuICAgIH1cbiAgICB0aGlzLm1ha2VSZXF1ZXN0KHsgbWV0aG9kLCBidWNrZXROYW1lLCBoZWFkZXJzIH0sIHBheWxvYWQsIFsyMDBdLCByZWdpb24sIGZhbHNlLCBwcm9jZXNzV2l0aFJldHJ5KVxuICB9XG5cbiAgLy8gTGlzdCBvZiBidWNrZXRzIGNyZWF0ZWQuXG4gIC8vXG4gIC8vIF9fQXJndW1lbnRzX19cbiAgLy8gKiBgY2FsbGJhY2soZXJyLCBidWNrZXRzKWAgX2Z1bmN0aW9uXyAtIGNhbGxiYWNrIGZ1bmN0aW9uIHdpdGggZXJyb3IgYXMgdGhlIGZpcnN0IGFyZ3VtZW50LiBgYnVja2V0c2AgaXMgYW4gYXJyYXkgb2YgYnVja2V0IGluZm9ybWF0aW9uXG4gIC8vXG4gIC8vIGBidWNrZXRzYCBhcnJheSBlbGVtZW50OlxuICAvLyAqIGBidWNrZXQubmFtZWAgX3N0cmluZ18gOiBidWNrZXQgbmFtZVxuICAvLyAqIGBidWNrZXQuY3JlYXRpb25EYXRlYCBfRGF0ZV86IGRhdGUgd2hlbiBidWNrZXQgd2FzIGNyZWF0ZWRcbiAgbGlzdEJ1Y2tldHMoY2IpIHtcbiAgICBpZiAoIWlzRnVuY3Rpb24oY2IpKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdjYWxsYmFjayBzaG91bGQgYmUgb2YgdHlwZSBcImZ1bmN0aW9uXCInKVxuICAgIH1cbiAgICB2YXIgbWV0aG9kID0gJ0dFVCdcbiAgICB0aGlzLm1ha2VSZXF1ZXN0KHsgbWV0aG9kIH0sICcnLCBbMjAwXSwgREVGQVVMVF9SRUdJT04sIHRydWUsIChlLCByZXNwb25zZSkgPT4ge1xuICAgICAgaWYgKGUpIHtcbiAgICAgICAgcmV0dXJuIGNiKGUpXG4gICAgICB9XG4gICAgICB2YXIgdHJhbnNmb3JtZXIgPSB0cmFuc2Zvcm1lcnMuZ2V0TGlzdEJ1Y2tldFRyYW5zZm9ybWVyKClcbiAgICAgIHZhciBidWNrZXRzXG4gICAgICBwaXBlc2V0dXAocmVzcG9uc2UsIHRyYW5zZm9ybWVyKVxuICAgICAgICAub24oJ2RhdGEnLCAocmVzdWx0KSA9PiAoYnVja2V0cyA9IHJlc3VsdCkpXG4gICAgICAgIC5vbignZXJyb3InLCAoZSkgPT4gY2IoZSkpXG4gICAgICAgIC5vbignZW5kJywgKCkgPT4gY2IobnVsbCwgYnVja2V0cykpXG4gICAgfSlcbiAgfVxuXG4gIC8vIFJldHVybnMgYSBzdHJlYW0gdGhhdCBlbWl0cyBvYmplY3RzIHRoYXQgYXJlIHBhcnRpYWxseSB1cGxvYWRlZC5cbiAgLy9cbiAgLy8gX19Bcmd1bWVudHNfX1xuICAvLyAqIGBidWNrZXROYW1lYCBfc3RyaW5nXzogbmFtZSBvZiB0aGUgYnVja2V0XG4gIC8vICogYHByZWZpeGAgX3N0cmluZ186IHByZWZpeCBvZiB0aGUgb2JqZWN0IG5hbWVzIHRoYXQgYXJlIHBhcnRpYWxseSB1cGxvYWRlZCAob3B0aW9uYWwsIGRlZmF1bHQgYCcnYClcbiAgLy8gKiBgcmVjdXJzaXZlYCBfYm9vbF86IGRpcmVjdG9yeSBzdHlsZSBsaXN0aW5nIHdoZW4gZmFsc2UsIHJlY3Vyc2l2ZSBsaXN0aW5nIHdoZW4gdHJ1ZSAob3B0aW9uYWwsIGRlZmF1bHQgYGZhbHNlYClcbiAgLy9cbiAgLy8gX19SZXR1cm4gVmFsdWVfX1xuICAvLyAqIGBzdHJlYW1gIF9TdHJlYW1fIDogZW1pdHMgb2JqZWN0cyBvZiB0aGUgZm9ybWF0OlxuICAvLyAgICogYG9iamVjdC5rZXlgIF9zdHJpbmdfOiBuYW1lIG9mIHRoZSBvYmplY3RcbiAgLy8gICAqIGBvYmplY3QudXBsb2FkSWRgIF9zdHJpbmdfOiB1cGxvYWQgSUQgb2YgdGhlIG9iamVjdFxuICAvLyAgICogYG9iamVjdC5zaXplYCBfSW50ZWdlcl86IHNpemUgb2YgdGhlIHBhcnRpYWxseSB1cGxvYWRlZCBvYmplY3RcbiAgbGlzdEluY29tcGxldGVVcGxvYWRzKGJ1Y2tldCwgcHJlZml4LCByZWN1cnNpdmUpIHtcbiAgICBpZiAocHJlZml4ID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHByZWZpeCA9ICcnXG4gICAgfVxuICAgIGlmIChyZWN1cnNpdmUgPT09IHVuZGVmaW5lZCkge1xuICAgICAgcmVjdXJzaXZlID0gZmFsc2VcbiAgICB9XG4gICAgaWYgKCFpc1ZhbGlkQnVja2V0TmFtZShidWNrZXQpKSB7XG4gICAgICB0aHJvdyBuZXcgZXJyb3JzLkludmFsaWRCdWNrZXROYW1lRXJyb3IoJ0ludmFsaWQgYnVja2V0IG5hbWU6ICcgKyBidWNrZXQpXG4gICAgfVxuICAgIGlmICghaXNWYWxpZFByZWZpeChwcmVmaXgpKSB7XG4gICAgICB0aHJvdyBuZXcgZXJyb3JzLkludmFsaWRQcmVmaXhFcnJvcihgSW52YWxpZCBwcmVmaXggOiAke3ByZWZpeH1gKVxuICAgIH1cbiAgICBpZiAoIWlzQm9vbGVhbihyZWN1cnNpdmUpKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdyZWN1cnNpdmUgc2hvdWxkIGJlIG9mIHR5cGUgXCJib29sZWFuXCInKVxuICAgIH1cbiAgICB2YXIgZGVsaW1pdGVyID0gcmVjdXJzaXZlID8gJycgOiAnLydcbiAgICB2YXIga2V5TWFya2VyID0gJydcbiAgICB2YXIgdXBsb2FkSWRNYXJrZXIgPSAnJ1xuICAgIHZhciB1cGxvYWRzID0gW11cbiAgICB2YXIgZW5kZWQgPSBmYWxzZVxuICAgIHZhciByZWFkU3RyZWFtID0gU3RyZWFtLlJlYWRhYmxlKHsgb2JqZWN0TW9kZTogdHJ1ZSB9KVxuICAgIHJlYWRTdHJlYW0uX3JlYWQgPSAoKSA9PiB7XG4gICAgICAvLyBwdXNoIG9uZSB1cGxvYWQgaW5mbyBwZXIgX3JlYWQoKVxuICAgICAgaWYgKHVwbG9hZHMubGVuZ3RoKSB7XG4gICAgICAgIHJldHVybiByZWFkU3RyZWFtLnB1c2godXBsb2Fkcy5zaGlmdCgpKVxuICAgICAgfVxuICAgICAgaWYgKGVuZGVkKSB7XG4gICAgICAgIHJldHVybiByZWFkU3RyZWFtLnB1c2gobnVsbClcbiAgICAgIH1cbiAgICAgIHRoaXMubGlzdEluY29tcGxldGVVcGxvYWRzUXVlcnkoYnVja2V0LCBwcmVmaXgsIGtleU1hcmtlciwgdXBsb2FkSWRNYXJrZXIsIGRlbGltaXRlcilcbiAgICAgICAgLm9uKCdlcnJvcicsIChlKSA9PiByZWFkU3RyZWFtLmVtaXQoJ2Vycm9yJywgZSkpXG4gICAgICAgIC5vbignZGF0YScsIChyZXN1bHQpID0+IHtcbiAgICAgICAgICByZXN1bHQucHJlZml4ZXMuZm9yRWFjaCgocHJlZml4KSA9PiB1cGxvYWRzLnB1c2gocHJlZml4KSlcbiAgICAgICAgICBhc3luYy5lYWNoU2VyaWVzKFxuICAgICAgICAgICAgcmVzdWx0LnVwbG9hZHMsXG4gICAgICAgICAgICAodXBsb2FkLCBjYikgPT4ge1xuICAgICAgICAgICAgICAvLyBmb3IgZWFjaCBpbmNvbXBsZXRlIHVwbG9hZCBhZGQgdGhlIHNpemVzIG9mIGl0cyB1cGxvYWRlZCBwYXJ0c1xuICAgICAgICAgICAgICB0aGlzLmxpc3RQYXJ0cyhidWNrZXQsIHVwbG9hZC5rZXksIHVwbG9hZC51cGxvYWRJZCwgKGVyciwgcGFydHMpID0+IHtcbiAgICAgICAgICAgICAgICBpZiAoZXJyKSB7XG4gICAgICAgICAgICAgICAgICByZXR1cm4gY2IoZXJyKVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB1cGxvYWQuc2l6ZSA9IHBhcnRzLnJlZHVjZSgoYWNjLCBpdGVtKSA9PiBhY2MgKyBpdGVtLnNpemUsIDApXG4gICAgICAgICAgICAgICAgdXBsb2Fkcy5wdXNoKHVwbG9hZClcbiAgICAgICAgICAgICAgICBjYigpXG4gICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgKGVycikgPT4ge1xuICAgICAgICAgICAgICBpZiAoZXJyKSB7XG4gICAgICAgICAgICAgICAgcmVhZFN0cmVhbS5lbWl0KCdlcnJvcicsIGVycilcbiAgICAgICAgICAgICAgICByZXR1cm5cbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBpZiAocmVzdWx0LmlzVHJ1bmNhdGVkKSB7XG4gICAgICAgICAgICAgICAga2V5TWFya2VyID0gcmVzdWx0Lm5leHRLZXlNYXJrZXJcbiAgICAgICAgICAgICAgICB1cGxvYWRJZE1hcmtlciA9IHJlc3VsdC5uZXh0VXBsb2FkSWRNYXJrZXJcbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBlbmRlZCA9IHRydWVcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICByZWFkU3RyZWFtLl9yZWFkKClcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgKVxuICAgICAgICB9KVxuICAgIH1cbiAgICByZXR1cm4gcmVhZFN0cmVhbVxuICB9XG5cbiAgLy8gVG8gY2hlY2sgaWYgYSBidWNrZXQgYWxyZWFkeSBleGlzdHMuXG4gIC8vXG4gIC8vIF9fQXJndW1lbnRzX19cbiAgLy8gKiBgYnVja2V0TmFtZWAgX3N0cmluZ18gOiBuYW1lIG9mIHRoZSBidWNrZXRcbiAgLy8gKiBgY2FsbGJhY2soZXJyKWAgX2Z1bmN0aW9uXyA6IGBlcnJgIGlzIGBudWxsYCBpZiB0aGUgYnVja2V0IGV4aXN0c1xuICBidWNrZXRFeGlzdHMoYnVja2V0TmFtZSwgY2IpIHtcbiAgICBpZiAoIWlzVmFsaWRCdWNrZXROYW1lKGJ1Y2tldE5hbWUpKSB7XG4gICAgICB0aHJvdyBuZXcgZXJyb3JzLkludmFsaWRCdWNrZXROYW1lRXJyb3IoJ0ludmFsaWQgYnVja2V0IG5hbWU6ICcgKyBidWNrZXROYW1lKVxuICAgIH1cbiAgICBpZiAoIWlzRnVuY3Rpb24oY2IpKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdjYWxsYmFjayBzaG91bGQgYmUgb2YgdHlwZSBcImZ1bmN0aW9uXCInKVxuICAgIH1cbiAgICB2YXIgbWV0aG9kID0gJ0hFQUQnXG4gICAgdGhpcy5tYWtlUmVxdWVzdCh7IG1ldGhvZCwgYnVja2V0TmFtZSB9LCAnJywgWzIwMF0sICcnLCBmYWxzZSwgKGVycikgPT4ge1xuICAgICAgaWYgKGVycikge1xuICAgICAgICBpZiAoZXJyLmNvZGUgPT0gJ05vU3VjaEJ1Y2tldCcgfHwgZXJyLmNvZGUgPT0gJ05vdEZvdW5kJykge1xuICAgICAgICAgIHJldHVybiBjYihudWxsLCBmYWxzZSlcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gY2IoZXJyKVxuICAgICAgfVxuICAgICAgY2IobnVsbCwgdHJ1ZSlcbiAgICB9KVxuICB9XG5cbiAgLy8gUmVtb3ZlIGEgYnVja2V0LlxuICAvL1xuICAvLyBfX0FyZ3VtZW50c19fXG4gIC8vICogYGJ1Y2tldE5hbWVgIF9zdHJpbmdfIDogbmFtZSBvZiB0aGUgYnVja2V0XG4gIC8vICogYGNhbGxiYWNrKGVycilgIF9mdW5jdGlvbl8gOiBgZXJyYCBpcyBgbnVsbGAgaWYgdGhlIGJ1Y2tldCBpcyByZW1vdmVkIHN1Y2Nlc3NmdWxseS5cbiAgcmVtb3ZlQnVja2V0KGJ1Y2tldE5hbWUsIGNiKSB7XG4gICAgaWYgKCFpc1ZhbGlkQnVja2V0TmFtZShidWNrZXROYW1lKSkge1xuICAgICAgdGhyb3cgbmV3IGVycm9ycy5JbnZhbGlkQnVja2V0TmFtZUVycm9yKCdJbnZhbGlkIGJ1Y2tldCBuYW1lOiAnICsgYnVja2V0TmFtZSlcbiAgICB9XG4gICAgaWYgKCFpc0Z1bmN0aW9uKGNiKSkge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignY2FsbGJhY2sgc2hvdWxkIGJlIG9mIHR5cGUgXCJmdW5jdGlvblwiJylcbiAgICB9XG4gICAgdmFyIG1ldGhvZCA9ICdERUxFVEUnXG4gICAgdGhpcy5tYWtlUmVxdWVzdCh7IG1ldGhvZCwgYnVja2V0TmFtZSB9LCAnJywgWzIwNF0sICcnLCBmYWxzZSwgKGUpID0+IHtcbiAgICAgIC8vIElmIHRoZSBidWNrZXQgd2FzIHN1Y2Nlc3NmdWxseSByZW1vdmVkLCByZW1vdmUgdGhlIHJlZ2lvbiBtYXAgZW50cnkuXG4gICAgICBpZiAoIWUpIHtcbiAgICAgICAgZGVsZXRlIHRoaXMucmVnaW9uTWFwW2J1Y2tldE5hbWVdXG4gICAgICB9XG4gICAgICBjYihlKVxuICAgIH0pXG4gIH1cblxuICAvLyBSZW1vdmUgdGhlIHBhcnRpYWxseSB1cGxvYWRlZCBvYmplY3QuXG4gIC8vXG4gIC8vIF9fQXJndW1lbnRzX19cbiAgLy8gKiBgYnVja2V0TmFtZWAgX3N0cmluZ186IG5hbWUgb2YgdGhlIGJ1Y2tldFxuICAvLyAqIGBvYmplY3ROYW1lYCBfc3RyaW5nXzogbmFtZSBvZiB0aGUgb2JqZWN0XG4gIC8vICogYGNhbGxiYWNrKGVycilgIF9mdW5jdGlvbl86IGNhbGxiYWNrIGZ1bmN0aW9uIGlzIGNhbGxlZCB3aXRoIG5vbiBgbnVsbGAgdmFsdWUgaW4gY2FzZSBvZiBlcnJvclxuICByZW1vdmVJbmNvbXBsZXRlVXBsb2FkKGJ1Y2tldE5hbWUsIG9iamVjdE5hbWUsIGNiKSB7XG4gICAgaWYgKCFpc1ZhbGlkQnVja2V0TmFtZShidWNrZXROYW1lKSkge1xuICAgICAgdGhyb3cgbmV3IGVycm9ycy5Jc1ZhbGlkQnVja2V0TmFtZUVycm9yKCdJbnZhbGlkIGJ1Y2tldCBuYW1lOiAnICsgYnVja2V0TmFtZSlcbiAgICB9XG4gICAgaWYgKCFpc1ZhbGlkT2JqZWN0TmFtZShvYmplY3ROYW1lKSkge1xuICAgICAgdGhyb3cgbmV3IGVycm9ycy5JbnZhbGlkT2JqZWN0TmFtZUVycm9yKGBJbnZhbGlkIG9iamVjdCBuYW1lOiAke29iamVjdE5hbWV9YClcbiAgICB9XG4gICAgaWYgKCFpc0Z1bmN0aW9uKGNiKSkge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignY2FsbGJhY2sgc2hvdWxkIGJlIG9mIHR5cGUgXCJmdW5jdGlvblwiJylcbiAgICB9XG4gICAgdmFyIHJlbW92ZVVwbG9hZElkXG4gICAgYXN5bmMuZHVyaW5nKFxuICAgICAgKGNiKSA9PiB7XG4gICAgICAgIHRoaXMuZmluZFVwbG9hZElkKGJ1Y2tldE5hbWUsIG9iamVjdE5hbWUsIChlLCB1cGxvYWRJZCkgPT4ge1xuICAgICAgICAgIGlmIChlKSB7XG4gICAgICAgICAgICByZXR1cm4gY2IoZSlcbiAgICAgICAgICB9XG4gICAgICAgICAgcmVtb3ZlVXBsb2FkSWQgPSB1cGxvYWRJZFxuICAgICAgICAgIGNiKG51bGwsIHVwbG9hZElkKVxuICAgICAgICB9KVxuICAgICAgfSxcbiAgICAgIChjYikgPT4ge1xuICAgICAgICB2YXIgbWV0aG9kID0gJ0RFTEVURSdcbiAgICAgICAgdmFyIHF1ZXJ5ID0gYHVwbG9hZElkPSR7cmVtb3ZlVXBsb2FkSWR9YFxuICAgICAgICB0aGlzLm1ha2VSZXF1ZXN0KHsgbWV0aG9kLCBidWNrZXROYW1lLCBvYmplY3ROYW1lLCBxdWVyeSB9LCAnJywgWzIwNF0sICcnLCBmYWxzZSwgKGUpID0+IGNiKGUpKVxuICAgICAgfSxcbiAgICAgIGNiLFxuICAgIClcbiAgfVxuXG4gIC8vIENhbGxiYWNrIGlzIGNhbGxlZCB3aXRoIGBlcnJvcmAgaW4gY2FzZSBvZiBlcnJvciBvciBgbnVsbGAgaW4gY2FzZSBvZiBzdWNjZXNzXG4gIC8vXG4gIC8vIF9fQXJndW1lbnRzX19cbiAgLy8gKiBgYnVja2V0TmFtZWAgX3N0cmluZ186IG5hbWUgb2YgdGhlIGJ1Y2tldFxuICAvLyAqIGBvYmplY3ROYW1lYCBfc3RyaW5nXzogbmFtZSBvZiB0aGUgb2JqZWN0XG4gIC8vICogYGZpbGVQYXRoYCBfc3RyaW5nXzogcGF0aCB0byB3aGljaCB0aGUgb2JqZWN0IGRhdGEgd2lsbCBiZSB3cml0dGVuIHRvXG4gIC8vICogYGdldE9wdHNgIF9vYmplY3RfOiBWZXJzaW9uIG9mIHRoZSBvYmplY3QgaW4gdGhlIGZvcm0gYHt2ZXJzaW9uSWQ6J215LXV1aWQnfWAuIERlZmF1bHQgaXMgYHt9YC4gKG9wdGlvbmFsKVxuICAvLyAqIGBjYWxsYmFjayhlcnIpYCBfZnVuY3Rpb25fOiBjYWxsYmFjayBpcyBjYWxsZWQgd2l0aCBgZXJyYCBpbiBjYXNlIG9mIGVycm9yLlxuICBmR2V0T2JqZWN0KGJ1Y2tldE5hbWUsIG9iamVjdE5hbWUsIGZpbGVQYXRoLCBnZXRPcHRzID0ge30sIGNiKSB7XG4gICAgLy8gSW5wdXQgdmFsaWRhdGlvbi5cbiAgICBpZiAoIWlzVmFsaWRCdWNrZXROYW1lKGJ1Y2tldE5hbWUpKSB7XG4gICAgICB0aHJvdyBuZXcgZXJyb3JzLkludmFsaWRCdWNrZXROYW1lRXJyb3IoJ0ludmFsaWQgYnVja2V0IG5hbWU6ICcgKyBidWNrZXROYW1lKVxuICAgIH1cbiAgICBpZiAoIWlzVmFsaWRPYmplY3ROYW1lKG9iamVjdE5hbWUpKSB7XG4gICAgICB0aHJvdyBuZXcgZXJyb3JzLkludmFsaWRPYmplY3ROYW1lRXJyb3IoYEludmFsaWQgb2JqZWN0IG5hbWU6ICR7b2JqZWN0TmFtZX1gKVxuICAgIH1cbiAgICBpZiAoIWlzU3RyaW5nKGZpbGVQYXRoKSkge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignZmlsZVBhdGggc2hvdWxkIGJlIG9mIHR5cGUgXCJzdHJpbmdcIicpXG4gICAgfVxuICAgIC8vIEJhY2t3YXJkIENvbXBhdGliaWxpdHlcbiAgICBpZiAoaXNGdW5jdGlvbihnZXRPcHRzKSkge1xuICAgICAgY2IgPSBnZXRPcHRzXG4gICAgICBnZXRPcHRzID0ge31cbiAgICB9XG5cbiAgICBpZiAoIWlzRnVuY3Rpb24oY2IpKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdjYWxsYmFjayBzaG91bGQgYmUgb2YgdHlwZSBcImZ1bmN0aW9uXCInKVxuICAgIH1cblxuICAgIC8vIEludGVybmFsIGRhdGEuXG4gICAgdmFyIHBhcnRGaWxlXG4gICAgdmFyIHBhcnRGaWxlU3RyZWFtXG4gICAgdmFyIG9ialN0YXRcblxuICAgIC8vIFJlbmFtZSB3cmFwcGVyLlxuICAgIHZhciByZW5hbWUgPSAoZXJyKSA9PiB7XG4gICAgICBpZiAoZXJyKSB7XG4gICAgICAgIHJldHVybiBjYihlcnIpXG4gICAgICB9XG4gICAgICBmcy5yZW5hbWUocGFydEZpbGUsIGZpbGVQYXRoLCBjYilcbiAgICB9XG5cbiAgICBhc3luYy53YXRlcmZhbGwoXG4gICAgICBbXG4gICAgICAgIChjYikgPT4gdGhpcy5zdGF0T2JqZWN0KGJ1Y2tldE5hbWUsIG9iamVjdE5hbWUsIGdldE9wdHMsIGNiKSxcbiAgICAgICAgKHJlc3VsdCwgY2IpID0+IHtcbiAgICAgICAgICBvYmpTdGF0ID0gcmVzdWx0XG4gICAgICAgICAgLy8gQ3JlYXRlIGFueSBtaXNzaW5nIHRvcCBsZXZlbCBkaXJlY3Rvcmllcy5cbiAgICAgICAgICBmcy5ta2RpcihwYXRoLmRpcm5hbWUoZmlsZVBhdGgpLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9LCAoZXJyKSA9PiBjYihlcnIpKVxuICAgICAgICB9LFxuICAgICAgICAoY2IpID0+IHtcbiAgICAgICAgICBwYXJ0RmlsZSA9IGAke2ZpbGVQYXRofS4ke29ialN0YXQuZXRhZ30ucGFydC5taW5pb2BcbiAgICAgICAgICBmcy5zdGF0KHBhcnRGaWxlLCAoZSwgc3RhdHMpID0+IHtcbiAgICAgICAgICAgIHZhciBvZmZzZXQgPSAwXG4gICAgICAgICAgICBpZiAoZSkge1xuICAgICAgICAgICAgICBwYXJ0RmlsZVN0cmVhbSA9IGZzLmNyZWF0ZVdyaXRlU3RyZWFtKHBhcnRGaWxlLCB7IGZsYWdzOiAndycgfSlcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIGlmIChvYmpTdGF0LnNpemUgPT09IHN0YXRzLnNpemUpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gcmVuYW1lKClcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBvZmZzZXQgPSBzdGF0cy5zaXplXG4gICAgICAgICAgICAgIHBhcnRGaWxlU3RyZWFtID0gZnMuY3JlYXRlV3JpdGVTdHJlYW0ocGFydEZpbGUsIHsgZmxhZ3M6ICdhJyB9KVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy5nZXRQYXJ0aWFsT2JqZWN0KGJ1Y2tldE5hbWUsIG9iamVjdE5hbWUsIG9mZnNldCwgMCwgZ2V0T3B0cywgY2IpXG4gICAgICAgICAgfSlcbiAgICAgICAgfSxcbiAgICAgICAgKGRvd25sb2FkU3RyZWFtLCBjYikgPT4ge1xuICAgICAgICAgIHBpcGVzZXR1cChkb3dubG9hZFN0cmVhbSwgcGFydEZpbGVTdHJlYW0pXG4gICAgICAgICAgICAub24oJ2Vycm9yJywgKGUpID0+IGNiKGUpKVxuICAgICAgICAgICAgLm9uKCdmaW5pc2gnLCBjYilcbiAgICAgICAgfSxcbiAgICAgICAgKGNiKSA9PiBmcy5zdGF0KHBhcnRGaWxlLCBjYiksXG4gICAgICAgIChzdGF0cywgY2IpID0+IHtcbiAgICAgICAgICBpZiAoc3RhdHMuc2l6ZSA9PT0gb2JqU3RhdC5zaXplKSB7XG4gICAgICAgICAgICByZXR1cm4gY2IoKVxuICAgICAgICAgIH1cbiAgICAgICAgICBjYihuZXcgRXJyb3IoJ1NpemUgbWlzbWF0Y2ggYmV0d2VlbiBkb3dubG9hZGVkIGZpbGUgYW5kIHRoZSBvYmplY3QnKSlcbiAgICAgICAgfSxcbiAgICAgIF0sXG4gICAgICByZW5hbWUsXG4gICAgKVxuICB9XG5cbiAgLy8gQ2FsbGJhY2sgaXMgY2FsbGVkIHdpdGggcmVhZGFibGUgc3RyZWFtIG9mIHRoZSBvYmplY3QgY29udGVudC5cbiAgLy9cbiAgLy8gX19Bcmd1bWVudHNfX1xuICAvLyAqIGBidWNrZXROYW1lYCBfc3RyaW5nXzogbmFtZSBvZiB0aGUgYnVja2V0XG4gIC8vICogYG9iamVjdE5hbWVgIF9zdHJpbmdfOiBuYW1lIG9mIHRoZSBvYmplY3RcbiAgLy8gKiBgZ2V0T3B0c2AgX29iamVjdF86IFZlcnNpb24gb2YgdGhlIG9iamVjdCBpbiB0aGUgZm9ybSBge3ZlcnNpb25JZDonbXktdXVpZCd9YC4gRGVmYXVsdCBpcyBge31gLiAob3B0aW9uYWwpXG4gIC8vICogYGNhbGxiYWNrKGVyciwgc3RyZWFtKWAgX2Z1bmN0aW9uXzogY2FsbGJhY2sgaXMgY2FsbGVkIHdpdGggYGVycmAgaW4gY2FzZSBvZiBlcnJvci4gYHN0cmVhbWAgaXMgdGhlIG9iamVjdCBjb250ZW50IHN0cmVhbVxuICBnZXRPYmplY3QoYnVja2V0TmFtZSwgb2JqZWN0TmFtZSwgZ2V0T3B0cyA9IHt9LCBjYikge1xuICAgIGlmICghaXNWYWxpZEJ1Y2tldE5hbWUoYnVja2V0TmFtZSkpIHtcbiAgICAgIHRocm93IG5ldyBlcnJvcnMuSW52YWxpZEJ1Y2tldE5hbWVFcnJvcignSW52YWxpZCBidWNrZXQgbmFtZTogJyArIGJ1Y2tldE5hbWUpXG4gICAgfVxuICAgIGlmICghaXNWYWxpZE9iamVjdE5hbWUob2JqZWN0TmFtZSkpIHtcbiAgICAgIHRocm93IG5ldyBlcnJvcnMuSW52YWxpZE9iamVjdE5hbWVFcnJvcihgSW52YWxpZCBvYmplY3QgbmFtZTogJHtvYmplY3ROYW1lfWApXG4gICAgfVxuICAgIC8vIEJhY2t3YXJkIENvbXBhdGliaWxpdHlcbiAgICBpZiAoaXNGdW5jdGlvbihnZXRPcHRzKSkge1xuICAgICAgY2IgPSBnZXRPcHRzXG4gICAgICBnZXRPcHRzID0ge31cbiAgICB9XG5cbiAgICBpZiAoIWlzRnVuY3Rpb24oY2IpKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdjYWxsYmFjayBzaG91bGQgYmUgb2YgdHlwZSBcImZ1bmN0aW9uXCInKVxuICAgIH1cbiAgICB0aGlzLmdldFBhcnRpYWxPYmplY3QoYnVja2V0TmFtZSwgb2JqZWN0TmFtZSwgMCwgMCwgZ2V0T3B0cywgY2IpXG4gIH1cblxuICAvLyBDYWxsYmFjayBpcyBjYWxsZWQgd2l0aCByZWFkYWJsZSBzdHJlYW0gb2YgdGhlIHBhcnRpYWwgb2JqZWN0IGNvbnRlbnQuXG4gIC8vXG4gIC8vIF9fQXJndW1lbnRzX19cbiAgLy8gKiBgYnVja2V0TmFtZWAgX3N0cmluZ186IG5hbWUgb2YgdGhlIGJ1Y2tldFxuICAvLyAqIGBvYmplY3ROYW1lYCBfc3RyaW5nXzogbmFtZSBvZiB0aGUgb2JqZWN0XG4gIC8vICogYG9mZnNldGAgX251bWJlcl86IG9mZnNldCBvZiB0aGUgb2JqZWN0IGZyb20gd2hlcmUgdGhlIHN0cmVhbSB3aWxsIHN0YXJ0XG4gIC8vICogYGxlbmd0aGAgX251bWJlcl86IGxlbmd0aCBvZiB0aGUgb2JqZWN0IHRoYXQgd2lsbCBiZSByZWFkIGluIHRoZSBzdHJlYW0gKG9wdGlvbmFsLCBpZiBub3Qgc3BlY2lmaWVkIHdlIHJlYWQgdGhlIHJlc3Qgb2YgdGhlIGZpbGUgZnJvbSB0aGUgb2Zmc2V0KVxuICAvLyAqIGBnZXRPcHRzYCBfb2JqZWN0XzogVmVyc2lvbiBvZiB0aGUgb2JqZWN0IGluIHRoZSBmb3JtIGB7dmVyc2lvbklkOidteS11dWlkJ31gLiBEZWZhdWx0IGlzIGB7fWAuIChvcHRpb25hbClcbiAgLy8gKiBgY2FsbGJhY2soZXJyLCBzdHJlYW0pYCBfZnVuY3Rpb25fOiBjYWxsYmFjayBpcyBjYWxsZWQgd2l0aCBgZXJyYCBpbiBjYXNlIG9mIGVycm9yLiBgc3RyZWFtYCBpcyB0aGUgb2JqZWN0IGNvbnRlbnQgc3RyZWFtXG4gIGdldFBhcnRpYWxPYmplY3QoYnVja2V0TmFtZSwgb2JqZWN0TmFtZSwgb2Zmc2V0LCBsZW5ndGgsIGdldE9wdHMgPSB7fSwgY2IpIHtcbiAgICBpZiAoaXNGdW5jdGlvbihsZW5ndGgpKSB7XG4gICAgICBjYiA9IGxlbmd0aFxuICAgICAgbGVuZ3RoID0gMFxuICAgIH1cbiAgICBpZiAoIWlzVmFsaWRCdWNrZXROYW1lKGJ1Y2tldE5hbWUpKSB7XG4gICAgICB0aHJvdyBuZXcgZXJyb3JzLkludmFsaWRCdWNrZXROYW1lRXJyb3IoJ0ludmFsaWQgYnVja2V0IG5hbWU6ICcgKyBidWNrZXROYW1lKVxuICAgIH1cbiAgICBpZiAoIWlzVmFsaWRPYmplY3ROYW1lKG9iamVjdE5hbWUpKSB7XG4gICAgICB0aHJvdyBuZXcgZXJyb3JzLkludmFsaWRPYmplY3ROYW1lRXJyb3IoYEludmFsaWQgb2JqZWN0IG5hbWU6ICR7b2JqZWN0TmFtZX1gKVxuICAgIH1cbiAgICBpZiAoIWlzTnVtYmVyKG9mZnNldCkpIHtcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ29mZnNldCBzaG91bGQgYmUgb2YgdHlwZSBcIm51bWJlclwiJylcbiAgICB9XG4gICAgaWYgKCFpc051bWJlcihsZW5ndGgpKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdsZW5ndGggc2hvdWxkIGJlIG9mIHR5cGUgXCJudW1iZXJcIicpXG4gICAgfVxuICAgIC8vIEJhY2t3YXJkIENvbXBhdGliaWxpdHlcbiAgICBpZiAoaXNGdW5jdGlvbihnZXRPcHRzKSkge1xuICAgICAgY2IgPSBnZXRPcHRzXG4gICAgICBnZXRPcHRzID0ge31cbiAgICB9XG5cbiAgICBpZiAoIWlzRnVuY3Rpb24oY2IpKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdjYWxsYmFjayBzaG91bGQgYmUgb2YgdHlwZSBcImZ1bmN0aW9uXCInKVxuICAgIH1cblxuICAgIHZhciByYW5nZSA9ICcnXG4gICAgaWYgKG9mZnNldCB8fCBsZW5ndGgpIHtcbiAgICAgIGlmIChvZmZzZXQpIHtcbiAgICAgICAgcmFuZ2UgPSBgYnl0ZXM9JHsrb2Zmc2V0fS1gXG4gICAgICB9IGVsc2Uge1xuICAgICAgICByYW5nZSA9ICdieXRlcz0wLSdcbiAgICAgICAgb2Zmc2V0ID0gMFxuICAgICAgfVxuICAgICAgaWYgKGxlbmd0aCkge1xuICAgICAgICByYW5nZSArPSBgJHsrbGVuZ3RoICsgb2Zmc2V0IC0gMX1gXG4gICAgICB9XG4gICAgfVxuXG4gICAgdmFyIGhlYWRlcnMgPSB7fVxuICAgIGlmIChyYW5nZSAhPT0gJycpIHtcbiAgICAgIGhlYWRlcnMucmFuZ2UgPSByYW5nZVxuICAgIH1cblxuICAgIHZhciBleHBlY3RlZFN0YXR1c0NvZGVzID0gWzIwMF1cbiAgICBpZiAocmFuZ2UpIHtcbiAgICAgIGV4cGVjdGVkU3RhdHVzQ29kZXMucHVzaCgyMDYpXG4gICAgfVxuICAgIHZhciBtZXRob2QgPSAnR0VUJ1xuXG4gICAgdmFyIHF1ZXJ5ID0gcXVlcnlzdHJpbmcuc3RyaW5naWZ5KGdldE9wdHMpXG4gICAgdGhpcy5tYWtlUmVxdWVzdCh7IG1ldGhvZCwgYnVja2V0TmFtZSwgb2JqZWN0TmFtZSwgaGVhZGVycywgcXVlcnkgfSwgJycsIGV4cGVjdGVkU3RhdHVzQ29kZXMsICcnLCB0cnVlLCBjYilcbiAgfVxuXG4gIC8vIFVwbG9hZHMgdGhlIG9iamVjdCB1c2luZyBjb250ZW50cyBmcm9tIGEgZmlsZVxuICAvL1xuICAvLyBfX0FyZ3VtZW50c19fXG4gIC8vICogYGJ1Y2tldE5hbWVgIF9zdHJpbmdfOiBuYW1lIG9mIHRoZSBidWNrZXRcbiAgLy8gKiBgb2JqZWN0TmFtZWAgX3N0cmluZ186IG5hbWUgb2YgdGhlIG9iamVjdFxuICAvLyAqIGBmaWxlUGF0aGAgX3N0cmluZ186IGZpbGUgcGF0aCBvZiB0aGUgZmlsZSB0byBiZSB1cGxvYWRlZFxuICAvLyAqIGBtZXRhRGF0YWAgX0phdmFzY3JpcHQgT2JqZWN0XzogbWV0YURhdGEgYXNzb3NjaWF0ZWQgd2l0aCB0aGUgb2JqZWN0XG4gIC8vICogYGNhbGxiYWNrKGVyciwgb2JqSW5mbylgIF9mdW5jdGlvbl86IG5vbiBudWxsIGBlcnJgIGluZGljYXRlcyBlcnJvciwgYG9iakluZm9gIF9vYmplY3RfIHdoaWNoIGNvbnRhaW5zIHZlcnNpb25JZCBhbmQgZXRhZy5cbiAgZlB1dE9iamVjdChidWNrZXROYW1lLCBvYmplY3ROYW1lLCBmaWxlUGF0aCwgbWV0YURhdGEsIGNhbGxiYWNrKSB7XG4gICAgaWYgKCFpc1ZhbGlkQnVja2V0TmFtZShidWNrZXROYW1lKSkge1xuICAgICAgdGhyb3cgbmV3IGVycm9ycy5JbnZhbGlkQnVja2V0TmFtZUVycm9yKCdJbnZhbGlkIGJ1Y2tldCBuYW1lOiAnICsgYnVja2V0TmFtZSlcbiAgICB9XG4gICAgaWYgKCFpc1ZhbGlkT2JqZWN0TmFtZShvYmplY3ROYW1lKSkge1xuICAgICAgdGhyb3cgbmV3IGVycm9ycy5JbnZhbGlkT2JqZWN0TmFtZUVycm9yKGBJbnZhbGlkIG9iamVjdCBuYW1lOiAke29iamVjdE5hbWV9YClcbiAgICB9XG5cbiAgICBpZiAoIWlzU3RyaW5nKGZpbGVQYXRoKSkge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignZmlsZVBhdGggc2hvdWxkIGJlIG9mIHR5cGUgXCJzdHJpbmdcIicpXG4gICAgfVxuICAgIGlmIChpc0Z1bmN0aW9uKG1ldGFEYXRhKSkge1xuICAgICAgY2FsbGJhY2sgPSBtZXRhRGF0YVxuICAgICAgbWV0YURhdGEgPSB7fSAvLyBTZXQgbWV0YURhdGEgZW1wdHkgaWYgbm8gbWV0YURhdGEgcHJvdmlkZWQuXG4gICAgfVxuICAgIGlmICghaXNPYmplY3QobWV0YURhdGEpKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdtZXRhRGF0YSBzaG91bGQgYmUgb2YgdHlwZSBcIm9iamVjdFwiJylcbiAgICB9XG5cbiAgICAvLyBJbnNlcnRzIGNvcnJlY3QgYGNvbnRlbnQtdHlwZWAgYXR0cmlidXRlIGJhc2VkIG9uIG1ldGFEYXRhIGFuZCBmaWxlUGF0aFxuICAgIG1ldGFEYXRhID0gaW5zZXJ0Q29udGVudFR5cGUobWV0YURhdGEsIGZpbGVQYXRoKVxuXG4gICAgLy8gVXBkYXRlcyBtZXRhRGF0YSB0byBoYXZlIHRoZSBjb3JyZWN0IHByZWZpeCBpZiBuZWVkZWRcbiAgICBtZXRhRGF0YSA9IHByZXBlbmRYQU1aTWV0YShtZXRhRGF0YSlcbiAgICB2YXIgc2l6ZVxuICAgIHZhciBwYXJ0U2l6ZVxuXG4gICAgYXN5bmMud2F0ZXJmYWxsKFxuICAgICAgW1xuICAgICAgICAoY2IpID0+IGZzLnN0YXQoZmlsZVBhdGgsIGNiKSxcbiAgICAgICAgKHN0YXRzLCBjYikgPT4ge1xuICAgICAgICAgIHNpemUgPSBzdGF0cy5zaXplXG4gICAgICAgICAgdmFyIHN0cmVhbVxuICAgICAgICAgIHZhciBjYlRyaWdnZXJlZCA9IGZhbHNlXG4gICAgICAgICAgdmFyIG9yaWdDYiA9IGNiXG4gICAgICAgICAgY2IgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICBpZiAoY2JUcmlnZ2VyZWQpIHtcbiAgICAgICAgICAgICAgcmV0dXJuXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjYlRyaWdnZXJlZCA9IHRydWVcbiAgICAgICAgICAgIGlmIChzdHJlYW0pIHtcbiAgICAgICAgICAgICAgc3RyZWFtLmRlc3Ryb3koKVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIG9yaWdDYi5hcHBseSh0aGlzLCBhcmd1bWVudHMpXG4gICAgICAgICAgfVxuICAgICAgICAgIGlmIChzaXplID4gdGhpcy5tYXhPYmplY3RTaXplKSB7XG4gICAgICAgICAgICByZXR1cm4gY2IobmV3IEVycm9yKGAke2ZpbGVQYXRofSBzaXplIDogJHtzdGF0cy5zaXplfSwgbWF4IGFsbG93ZWQgc2l6ZSA6IDVUQmApKVxuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoc2l6ZSA8PSB0aGlzLnBhcnRTaXplKSB7XG4gICAgICAgICAgICAvLyBzaW1wbGUgUFVUIHJlcXVlc3QsIG5vIG11bHRpcGFydFxuICAgICAgICAgICAgdmFyIG11bHRpcGFydCA9IGZhbHNlXG4gICAgICAgICAgICB2YXIgdXBsb2FkZXIgPSB0aGlzLmdldFVwbG9hZGVyKGJ1Y2tldE5hbWUsIG9iamVjdE5hbWUsIG1ldGFEYXRhLCBtdWx0aXBhcnQpXG4gICAgICAgICAgICB2YXIgaGFzaCA9IHRyYW5zZm9ybWVycy5nZXRIYXNoU3VtbWVyKHRoaXMuZW5hYmxlU0hBMjU2KVxuICAgICAgICAgICAgdmFyIHN0YXJ0ID0gMFxuICAgICAgICAgICAgdmFyIGVuZCA9IHNpemUgLSAxXG4gICAgICAgICAgICB2YXIgYXV0b0Nsb3NlID0gdHJ1ZVxuICAgICAgICAgICAgaWYgKHNpemUgPT09IDApIHtcbiAgICAgICAgICAgICAgZW5kID0gMFxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdmFyIG9wdGlvbnMgPSB7IHN0YXJ0LCBlbmQsIGF1dG9DbG9zZSB9XG4gICAgICAgICAgICBwaXBlc2V0dXAoZnMuY3JlYXRlUmVhZFN0cmVhbShmaWxlUGF0aCwgb3B0aW9ucyksIGhhc2gpXG4gICAgICAgICAgICAgIC5vbignZGF0YScsIChkYXRhKSA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIG1kNXN1bSA9IGRhdGEubWQ1c3VtXG4gICAgICAgICAgICAgICAgdmFyIHNoYTI1NnN1bSA9IGRhdGEuc2hhMjU2c3VtXG4gICAgICAgICAgICAgICAgc3RyZWFtID0gZnMuY3JlYXRlUmVhZFN0cmVhbShmaWxlUGF0aCwgb3B0aW9ucylcbiAgICAgICAgICAgICAgICB1cGxvYWRlcihzdHJlYW0sIHNpemUsIHNoYTI1NnN1bSwgbWQ1c3VtLCAoZXJyLCBvYmpJbmZvKSA9PiB7XG4gICAgICAgICAgICAgICAgICBjYWxsYmFjayhlcnIsIG9iakluZm8pXG4gICAgICAgICAgICAgICAgICBjYih0cnVlKVxuICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgIC5vbignZXJyb3InLCAoZSkgPT4gY2IoZSkpXG4gICAgICAgICAgICByZXR1cm5cbiAgICAgICAgICB9XG4gICAgICAgICAgdGhpcy5maW5kVXBsb2FkSWQoYnVja2V0TmFtZSwgb2JqZWN0TmFtZSwgY2IpXG4gICAgICAgIH0sXG4gICAgICAgICh1cGxvYWRJZCwgY2IpID0+IHtcbiAgICAgICAgICAvLyBpZiB0aGVyZSB3YXMgYSBwcmV2aW91cyBpbmNvbXBsZXRlIHVwbG9hZCwgZmV0Y2ggYWxsIGl0cyB1cGxvYWRlZCBwYXJ0cyBpbmZvXG4gICAgICAgICAgaWYgKHVwbG9hZElkKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5saXN0UGFydHMoYnVja2V0TmFtZSwgb2JqZWN0TmFtZSwgdXBsb2FkSWQsIChlLCBldGFncykgPT4gY2IoZSwgdXBsb2FkSWQsIGV0YWdzKSlcbiAgICAgICAgICB9XG4gICAgICAgICAgLy8gdGhlcmUgd2FzIG5vIHByZXZpb3VzIHVwbG9hZCwgaW5pdGlhdGUgYSBuZXcgb25lXG4gICAgICAgICAgdGhpcy5pbml0aWF0ZU5ld011bHRpcGFydFVwbG9hZChidWNrZXROYW1lLCBvYmplY3ROYW1lLCBtZXRhRGF0YSwgKGUsIHVwbG9hZElkKSA9PiBjYihlLCB1cGxvYWRJZCwgW10pKVxuICAgICAgICB9LFxuICAgICAgICAodXBsb2FkSWQsIGV0YWdzLCBjYikgPT4ge1xuICAgICAgICAgIHBhcnRTaXplID0gdGhpcy5jYWxjdWxhdGVQYXJ0U2l6ZShzaXplKVxuICAgICAgICAgIHZhciBtdWx0aXBhcnQgPSB0cnVlXG4gICAgICAgICAgdmFyIHVwbG9hZGVyID0gdGhpcy5nZXRVcGxvYWRlcihidWNrZXROYW1lLCBvYmplY3ROYW1lLCBtZXRhRGF0YSwgbXVsdGlwYXJ0KVxuXG4gICAgICAgICAgLy8gY29udmVydCBhcnJheSB0byBvYmplY3QgdG8gbWFrZSB0aGluZ3MgZWFzeVxuICAgICAgICAgIHZhciBwYXJ0cyA9IGV0YWdzLnJlZHVjZShmdW5jdGlvbiAoYWNjLCBpdGVtKSB7XG4gICAgICAgICAgICBpZiAoIWFjY1tpdGVtLnBhcnRdKSB7XG4gICAgICAgICAgICAgIGFjY1tpdGVtLnBhcnRdID0gaXRlbVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIGFjY1xuICAgICAgICAgIH0sIHt9KVxuICAgICAgICAgIHZhciBwYXJ0c0RvbmUgPSBbXVxuICAgICAgICAgIHZhciBwYXJ0TnVtYmVyID0gMVxuICAgICAgICAgIHZhciB1cGxvYWRlZFNpemUgPSAwXG4gICAgICAgICAgYXN5bmMud2hpbHN0KFxuICAgICAgICAgICAgKGNiKSA9PiB7XG4gICAgICAgICAgICAgIGNiKG51bGwsIHVwbG9hZGVkU2l6ZSA8IHNpemUpXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgKGNiKSA9PiB7XG4gICAgICAgICAgICAgIHZhciBzdHJlYW1cbiAgICAgICAgICAgICAgdmFyIGNiVHJpZ2dlcmVkID0gZmFsc2VcbiAgICAgICAgICAgICAgdmFyIG9yaWdDYiA9IGNiXG4gICAgICAgICAgICAgIGNiID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgIGlmIChjYlRyaWdnZXJlZCkge1xuICAgICAgICAgICAgICAgICAgcmV0dXJuXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNiVHJpZ2dlcmVkID0gdHJ1ZVxuICAgICAgICAgICAgICAgIGlmIChzdHJlYW0pIHtcbiAgICAgICAgICAgICAgICAgIHN0cmVhbS5kZXN0cm95KClcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcmV0dXJuIG9yaWdDYi5hcHBseSh0aGlzLCBhcmd1bWVudHMpXG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgdmFyIHBhcnQgPSBwYXJ0c1twYXJ0TnVtYmVyXVxuICAgICAgICAgICAgICB2YXIgaGFzaCA9IHRyYW5zZm9ybWVycy5nZXRIYXNoU3VtbWVyKHRoaXMuZW5hYmxlU0hBMjU2KVxuICAgICAgICAgICAgICB2YXIgbGVuZ3RoID0gcGFydFNpemVcbiAgICAgICAgICAgICAgaWYgKGxlbmd0aCA+IHNpemUgLSB1cGxvYWRlZFNpemUpIHtcbiAgICAgICAgICAgICAgICBsZW5ndGggPSBzaXplIC0gdXBsb2FkZWRTaXplXG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgdmFyIHN0YXJ0ID0gdXBsb2FkZWRTaXplXG4gICAgICAgICAgICAgIHZhciBlbmQgPSB1cGxvYWRlZFNpemUgKyBsZW5ndGggLSAxXG4gICAgICAgICAgICAgIHZhciBhdXRvQ2xvc2UgPSB0cnVlXG4gICAgICAgICAgICAgIHZhciBvcHRpb25zID0geyBhdXRvQ2xvc2UsIHN0YXJ0LCBlbmQgfVxuICAgICAgICAgICAgICAvLyB2ZXJpZnkgbWQ1c3VtIG9mIGVhY2ggcGFydFxuICAgICAgICAgICAgICBwaXBlc2V0dXAoZnMuY3JlYXRlUmVhZFN0cmVhbShmaWxlUGF0aCwgb3B0aW9ucyksIGhhc2gpXG4gICAgICAgICAgICAgICAgLm9uKCdkYXRhJywgKGRhdGEpID0+IHtcbiAgICAgICAgICAgICAgICAgIHZhciBtZDVzdW1IZXggPSBCdWZmZXIuZnJvbShkYXRhLm1kNXN1bSwgJ2Jhc2U2NCcpLnRvU3RyaW5nKCdoZXgnKVxuICAgICAgICAgICAgICAgICAgaWYgKHBhcnQgJiYgbWQ1c3VtSGV4ID09PSBwYXJ0LmV0YWcpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gbWQ1IG1hdGNoZXMsIGNodW5rIGFscmVhZHkgdXBsb2FkZWRcbiAgICAgICAgICAgICAgICAgICAgcGFydHNEb25lLnB1c2goeyBwYXJ0OiBwYXJ0TnVtYmVyLCBldGFnOiBwYXJ0LmV0YWcgfSlcbiAgICAgICAgICAgICAgICAgICAgcGFydE51bWJlcisrXG4gICAgICAgICAgICAgICAgICAgIHVwbG9hZGVkU2l6ZSArPSBsZW5ndGhcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGNiKClcbiAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgIC8vIHBhcnQgaXMgbm90IHVwbG9hZGVkIHlldCwgb3IgbWQ1IG1pc21hdGNoXG4gICAgICAgICAgICAgICAgICBzdHJlYW0gPSBmcy5jcmVhdGVSZWFkU3RyZWFtKGZpbGVQYXRoLCBvcHRpb25zKVxuICAgICAgICAgICAgICAgICAgdXBsb2FkZXIodXBsb2FkSWQsIHBhcnROdW1iZXIsIHN0cmVhbSwgbGVuZ3RoLCBkYXRhLnNoYTI1NnN1bSwgZGF0YS5tZDVzdW0sIChlLCBvYmpJbmZvKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGNiKGUpXG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgcGFydHNEb25lLnB1c2goeyBwYXJ0OiBwYXJ0TnVtYmVyLCBldGFnOiBvYmpJbmZvLmV0YWcgfSlcbiAgICAgICAgICAgICAgICAgICAgcGFydE51bWJlcisrXG4gICAgICAgICAgICAgICAgICAgIHVwbG9hZGVkU2l6ZSArPSBsZW5ndGhcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGNiKClcbiAgICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgICAub24oJ2Vycm9yJywgKGUpID0+IGNiKGUpKVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIChlKSA9PiB7XG4gICAgICAgICAgICAgIGlmIChlKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGNiKGUpXG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgY2IobnVsbCwgcGFydHNEb25lLCB1cGxvYWRJZClcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgKVxuICAgICAgICB9LFxuICAgICAgICAvLyBhbGwgcGFydHMgdXBsb2FkZWQsIGNvbXBsZXRlIHRoZSBtdWx0aXBhcnQgdXBsb2FkXG4gICAgICAgIChldGFncywgdXBsb2FkSWQsIGNiKSA9PiB0aGlzLmNvbXBsZXRlTXVsdGlwYXJ0VXBsb2FkKGJ1Y2tldE5hbWUsIG9iamVjdE5hbWUsIHVwbG9hZElkLCBldGFncywgY2IpLFxuICAgICAgXSxcbiAgICAgIChlcnIsIC4uLnJlc3QpID0+IHtcbiAgICAgICAgaWYgKGVyciA9PT0gdHJ1ZSkge1xuICAgICAgICAgIHJldHVyblxuICAgICAgICB9XG4gICAgICAgIGNhbGxiYWNrKGVyciwgLi4ucmVzdClcbiAgICAgIH0sXG4gICAgKVxuICB9XG5cbiAgLy8gVXBsb2FkcyB0aGUgb2JqZWN0LlxuICAvL1xuICAvLyBVcGxvYWRpbmcgYSBzdHJlYW1cbiAgLy8gX19Bcmd1bWVudHNfX1xuICAvLyAqIGBidWNrZXROYW1lYCBfc3RyaW5nXzogbmFtZSBvZiB0aGUgYnVja2V0XG4gIC8vICogYG9iamVjdE5hbWVgIF9zdHJpbmdfOiBuYW1lIG9mIHRoZSBvYmplY3RcbiAgLy8gKiBgc3RyZWFtYCBfU3RyZWFtXzogUmVhZGFibGUgc3RyZWFtXG4gIC8vICogYHNpemVgIF9udW1iZXJfOiBzaXplIG9mIHRoZSBvYmplY3QgKG9wdGlvbmFsKVxuICAvLyAqIGBjYWxsYmFjayhlcnIsIGV0YWcpYCBfZnVuY3Rpb25fOiBub24gbnVsbCBgZXJyYCBpbmRpY2F0ZXMgZXJyb3IsIGBldGFnYCBfc3RyaW5nXyBpcyB0aGUgZXRhZyBvZiB0aGUgb2JqZWN0IHVwbG9hZGVkLlxuICAvL1xuICAvLyBVcGxvYWRpbmcgXCJCdWZmZXJcIiBvciBcInN0cmluZ1wiXG4gIC8vIF9fQXJndW1lbnRzX19cbiAgLy8gKiBgYnVja2V0TmFtZWAgX3N0cmluZ186IG5hbWUgb2YgdGhlIGJ1Y2tldFxuICAvLyAqIGBvYmplY3ROYW1lYCBfc3RyaW5nXzogbmFtZSBvZiB0aGUgb2JqZWN0XG4gIC8vICogYHN0cmluZyBvciBCdWZmZXJgIF9zdHJpbmdfIG9yIF9CdWZmZXJfOiBzdHJpbmcgb3IgYnVmZmVyXG4gIC8vICogYGNhbGxiYWNrKGVyciwgb2JqSW5mbylgIF9mdW5jdGlvbl86IGBlcnJgIGlzIGBudWxsYCBpbiBjYXNlIG9mIHN1Y2Nlc3MgYW5kIGBpbmZvYCB3aWxsIGhhdmUgdGhlIGZvbGxvd2luZyBvYmplY3QgZGV0YWlsczpcbiAgLy8gICAqIGBldGFnYCBfc3RyaW5nXzogZXRhZyBvZiB0aGUgb2JqZWN0XG4gIC8vICAgKiBgdmVyc2lvbklkYCBfc3RyaW5nXzogdmVyc2lvbklkIG9mIHRoZSBvYmplY3RcbiAgcHV0T2JqZWN0KGJ1Y2tldE5hbWUsIG9iamVjdE5hbWUsIHN0cmVhbSwgc2l6ZSwgbWV0YURhdGEsIGNhbGxiYWNrKSB7XG4gICAgaWYgKCFpc1ZhbGlkQnVja2V0TmFtZShidWNrZXROYW1lKSkge1xuICAgICAgdGhyb3cgbmV3IGVycm9ycy5JbnZhbGlkQnVja2V0TmFtZUVycm9yKCdJbnZhbGlkIGJ1Y2tldCBuYW1lOiAnICsgYnVja2V0TmFtZSlcbiAgICB9XG4gICAgaWYgKCFpc1ZhbGlkT2JqZWN0TmFtZShvYmplY3ROYW1lKSkge1xuICAgICAgdGhyb3cgbmV3IGVycm9ycy5JbnZhbGlkT2JqZWN0TmFtZUVycm9yKGBJbnZhbGlkIG9iamVjdCBuYW1lOiAke29iamVjdE5hbWV9YClcbiAgICB9XG5cbiAgICAvLyBXZSdsbCBuZWVkIHRvIHNoaWZ0IGFyZ3VtZW50cyB0byB0aGUgbGVmdCBiZWNhdXNlIG9mIHNpemUgYW5kIG1ldGFEYXRhLlxuICAgIGlmIChpc0Z1bmN0aW9uKHNpemUpKSB7XG4gICAgICBjYWxsYmFjayA9IHNpemVcbiAgICAgIG1ldGFEYXRhID0ge31cbiAgICB9IGVsc2UgaWYgKGlzRnVuY3Rpb24obWV0YURhdGEpKSB7XG4gICAgICBjYWxsYmFjayA9IG1ldGFEYXRhXG4gICAgICBtZXRhRGF0YSA9IHt9XG4gICAgfVxuXG4gICAgLy8gV2UnbGwgbmVlZCB0byBzaGlmdCBhcmd1bWVudHMgdG8gdGhlIGxlZnQgYmVjYXVzZSBvZiBtZXRhRGF0YVxuICAgIC8vIGFuZCBzaXplIGJlaW5nIG9wdGlvbmFsLlxuICAgIGlmIChpc09iamVjdChzaXplKSkge1xuICAgICAgbWV0YURhdGEgPSBzaXplXG4gICAgfVxuXG4gICAgLy8gRW5zdXJlcyBNZXRhZGF0YSBoYXMgYXBwcm9wcmlhdGUgcHJlZml4IGZvciBBMyBBUElcbiAgICBtZXRhRGF0YSA9IHByZXBlbmRYQU1aTWV0YShtZXRhRGF0YSlcbiAgICBpZiAodHlwZW9mIHN0cmVhbSA9PT0gJ3N0cmluZycgfHwgc3RyZWFtIGluc3RhbmNlb2YgQnVmZmVyKSB7XG4gICAgICAvLyBBZGFwdHMgdGhlIG5vbi1zdHJlYW0gaW50ZXJmYWNlIGludG8gYSBzdHJlYW0uXG4gICAgICBzaXplID0gc3RyZWFtLmxlbmd0aFxuICAgICAgc3RyZWFtID0gcmVhZGFibGVTdHJlYW0oc3RyZWFtKVxuICAgIH0gZWxzZSBpZiAoIWlzUmVhZGFibGVTdHJlYW0oc3RyZWFtKSkge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcigndGhpcmQgYXJndW1lbnQgc2hvdWxkIGJlIG9mIHR5cGUgXCJzdHJlYW0uUmVhZGFibGVcIiBvciBcIkJ1ZmZlclwiIG9yIFwic3RyaW5nXCInKVxuICAgIH1cblxuICAgIGlmICghaXNGdW5jdGlvbihjYWxsYmFjaykpIHtcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ2NhbGxiYWNrIHNob3VsZCBiZSBvZiB0eXBlIFwiZnVuY3Rpb25cIicpXG4gICAgfVxuXG4gICAgaWYgKGlzTnVtYmVyKHNpemUpICYmIHNpemUgPCAwKSB7XG4gICAgICB0aHJvdyBuZXcgZXJyb3JzLkludmFsaWRBcmd1bWVudEVycm9yKGBzaXplIGNhbm5vdCBiZSBuZWdhdGl2ZSwgZ2l2ZW4gc2l6ZTogJHtzaXplfWApXG4gICAgfVxuXG4gICAgLy8gR2V0IHRoZSBwYXJ0IHNpemUgYW5kIGZvcndhcmQgdGhhdCB0byB0aGUgQmxvY2tTdHJlYW0uIERlZmF1bHQgdG8gdGhlXG4gICAgLy8gbGFyZ2VzdCBibG9jayBzaXplIHBvc3NpYmxlIGlmIG5lY2Vzc2FyeS5cbiAgICBpZiAoIWlzTnVtYmVyKHNpemUpKSB7XG4gICAgICBzaXplID0gdGhpcy5tYXhPYmplY3RTaXplXG4gICAgfVxuXG4gICAgc2l6ZSA9IHRoaXMuY2FsY3VsYXRlUGFydFNpemUoc2l6ZSlcblxuICAgIC8vIHMzIHJlcXVpcmVzIHRoYXQgYWxsIG5vbi1lbmQgY2h1bmtzIGJlIGF0IGxlYXN0IGB0aGlzLnBhcnRTaXplYCxcbiAgICAvLyBzbyB3ZSBjaHVuayB0aGUgc3RyZWFtIHVudGlsIHdlIGhpdCBlaXRoZXIgdGhhdCBzaXplIG9yIHRoZSBlbmQgYmVmb3JlXG4gICAgLy8gd2UgZmx1c2ggaXQgdG8gczMuXG4gICAgbGV0IGNodW5rZXIgPSBuZXcgQmxvY2tTdHJlYW0yKHsgc2l6ZSwgemVyb1BhZGRpbmc6IGZhbHNlIH0pXG5cbiAgICAvLyBUaGlzIGlzIGEgV3JpdGFibGUgc3RyZWFtIHRoYXQgY2FuIGJlIHdyaXR0ZW4gdG8gaW4gb3JkZXIgdG8gdXBsb2FkXG4gICAgLy8gdG8gdGhlIHNwZWNpZmllZCBidWNrZXQgYW5kIG9iamVjdCBhdXRvbWF0aWNhbGx5LlxuICAgIGxldCB1cGxvYWRlciA9IG5ldyBPYmplY3RVcGxvYWRlcih0aGlzLCBidWNrZXROYW1lLCBvYmplY3ROYW1lLCBzaXplLCBtZXRhRGF0YSwgY2FsbGJhY2spXG4gICAgLy8gc3RyZWFtID0+IGNodW5rZXIgPT4gdXBsb2FkZXJcbiAgICBwaXBlc2V0dXAoc3RyZWFtLCBjaHVua2VyLCB1cGxvYWRlcilcbiAgfVxuXG4gIC8vIENvcHkgdGhlIG9iamVjdC5cbiAgLy9cbiAgLy8gX19Bcmd1bWVudHNfX1xuICAvLyAqIGBidWNrZXROYW1lYCBfc3RyaW5nXzogbmFtZSBvZiB0aGUgYnVja2V0XG4gIC8vICogYG9iamVjdE5hbWVgIF9zdHJpbmdfOiBuYW1lIG9mIHRoZSBvYmplY3RcbiAgLy8gKiBgc3JjT2JqZWN0YCBfc3RyaW5nXzogcGF0aCBvZiB0aGUgc291cmNlIG9iamVjdCB0byBiZSBjb3BpZWRcbiAgLy8gKiBgY29uZGl0aW9uc2AgX0NvcHlDb25kaXRpb25zXzogY29weSBjb25kaXRpb25zIHRoYXQgbmVlZHMgdG8gYmUgc2F0aXNmaWVkIChvcHRpb25hbCwgZGVmYXVsdCBgbnVsbGApXG4gIC8vICogYGNhbGxiYWNrKGVyciwge2V0YWcsIGxhc3RNb2RpZmllZH0pYCBfZnVuY3Rpb25fOiBub24gbnVsbCBgZXJyYCBpbmRpY2F0ZXMgZXJyb3IsIGBldGFnYCBfc3RyaW5nXyBhbmQgYGxpc3RNb2RpZmVkYCBfRGF0ZV8gYXJlIHJlc3BlY3RpdmVseSB0aGUgZXRhZyBhbmQgdGhlIGxhc3QgbW9kaWZpZWQgZGF0ZSBvZiB0aGUgbmV3bHkgY29waWVkIG9iamVjdFxuICBjb3B5T2JqZWN0VjEoYXJnMSwgYXJnMiwgYXJnMywgYXJnNCwgYXJnNSkge1xuICAgIHZhciBidWNrZXROYW1lID0gYXJnMVxuICAgIHZhciBvYmplY3ROYW1lID0gYXJnMlxuICAgIHZhciBzcmNPYmplY3QgPSBhcmczXG4gICAgdmFyIGNvbmRpdGlvbnMsIGNiXG4gICAgaWYgKHR5cGVvZiBhcmc0ID09ICdmdW5jdGlvbicgJiYgYXJnNSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBjb25kaXRpb25zID0gbnVsbFxuICAgICAgY2IgPSBhcmc0XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbmRpdGlvbnMgPSBhcmc0XG4gICAgICBjYiA9IGFyZzVcbiAgICB9XG4gICAgaWYgKCFpc1ZhbGlkQnVja2V0TmFtZShidWNrZXROYW1lKSkge1xuICAgICAgdGhyb3cgbmV3IGVycm9ycy5JbnZhbGlkQnVja2V0TmFtZUVycm9yKCdJbnZhbGlkIGJ1Y2tldCBuYW1lOiAnICsgYnVja2V0TmFtZSlcbiAgICB9XG4gICAgaWYgKCFpc1ZhbGlkT2JqZWN0TmFtZShvYmplY3ROYW1lKSkge1xuICAgICAgdGhyb3cgbmV3IGVycm9ycy5JbnZhbGlkT2JqZWN0TmFtZUVycm9yKGBJbnZhbGlkIG9iamVjdCBuYW1lOiAke29iamVjdE5hbWV9YClcbiAgICB9XG4gICAgaWYgKCFpc1N0cmluZyhzcmNPYmplY3QpKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdzcmNPYmplY3Qgc2hvdWxkIGJlIG9mIHR5cGUgXCJzdHJpbmdcIicpXG4gICAgfVxuICAgIGlmIChzcmNPYmplY3QgPT09ICcnKSB7XG4gICAgICB0aHJvdyBuZXcgZXJyb3JzLkludmFsaWRQcmVmaXhFcnJvcihgRW1wdHkgc291cmNlIHByZWZpeGApXG4gICAgfVxuXG4gICAgaWYgKGNvbmRpdGlvbnMgIT09IG51bGwgJiYgIShjb25kaXRpb25zIGluc3RhbmNlb2YgQ29weUNvbmRpdGlvbnMpKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdjb25kaXRpb25zIHNob3VsZCBiZSBvZiB0eXBlIFwiQ29weUNvbmRpdGlvbnNcIicpXG4gICAgfVxuXG4gICAgdmFyIGhlYWRlcnMgPSB7fVxuICAgIGhlYWRlcnNbJ3gtYW16LWNvcHktc291cmNlJ10gPSB1cmlSZXNvdXJjZUVzY2FwZShzcmNPYmplY3QpXG5cbiAgICBpZiAoY29uZGl0aW9ucyAhPT0gbnVsbCkge1xuICAgICAgaWYgKGNvbmRpdGlvbnMubW9kaWZpZWQgIT09ICcnKSB7XG4gICAgICAgIGhlYWRlcnNbJ3gtYW16LWNvcHktc291cmNlLWlmLW1vZGlmaWVkLXNpbmNlJ10gPSBjb25kaXRpb25zLm1vZGlmaWVkXG4gICAgICB9XG4gICAgICBpZiAoY29uZGl0aW9ucy51bm1vZGlmaWVkICE9PSAnJykge1xuICAgICAgICBoZWFkZXJzWyd4LWFtei1jb3B5LXNvdXJjZS1pZi11bm1vZGlmaWVkLXNpbmNlJ10gPSBjb25kaXRpb25zLnVubW9kaWZpZWRcbiAgICAgIH1cbiAgICAgIGlmIChjb25kaXRpb25zLm1hdGNoRVRhZyAhPT0gJycpIHtcbiAgICAgICAgaGVhZGVyc1sneC1hbXotY29weS1zb3VyY2UtaWYtbWF0Y2gnXSA9IGNvbmRpdGlvbnMubWF0Y2hFVGFnXG4gICAgICB9XG4gICAgICBpZiAoY29uZGl0aW9ucy5tYXRjaEV0YWdFeGNlcHQgIT09ICcnKSB7XG4gICAgICAgIGhlYWRlcnNbJ3gtYW16LWNvcHktc291cmNlLWlmLW5vbmUtbWF0Y2gnXSA9IGNvbmRpdGlvbnMubWF0Y2hFVGFnRXhjZXB0XG4gICAgICB9XG4gICAgfVxuXG4gICAgdmFyIG1ldGhvZCA9ICdQVVQnXG4gICAgdGhpcy5tYWtlUmVxdWVzdCh7IG1ldGhvZCwgYnVja2V0TmFtZSwgb2JqZWN0TmFtZSwgaGVhZGVycyB9LCAnJywgWzIwMF0sICcnLCB0cnVlLCAoZSwgcmVzcG9uc2UpID0+IHtcbiAgICAgIGlmIChlKSB7XG4gICAgICAgIHJldHVybiBjYihlKVxuICAgICAgfVxuICAgICAgdmFyIHRyYW5zZm9ybWVyID0gdHJhbnNmb3JtZXJzLmdldENvcHlPYmplY3RUcmFuc2Zvcm1lcigpXG4gICAgICBwaXBlc2V0dXAocmVzcG9uc2UsIHRyYW5zZm9ybWVyKVxuICAgICAgICAub24oJ2Vycm9yJywgKGUpID0+IGNiKGUpKVxuICAgICAgICAub24oJ2RhdGEnLCAoZGF0YSkgPT4gY2IobnVsbCwgZGF0YSkpXG4gICAgfSlcbiAgfVxuXG4gIC8qKlxuICAgKiBJbnRlcm5hbCBNZXRob2QgdG8gcGVyZm9ybSBjb3B5IG9mIGFuIG9iamVjdC5cbiAgICogQHBhcmFtIHNvdXJjZUNvbmZpZyBfX29iamVjdF9fICAgaW5zdGFuY2Ugb2YgQ29weVNvdXJjZU9wdGlvbnMgQGxpbmsgLi9oZWxwZXJzL0NvcHlTb3VyY2VPcHRpb25zXG4gICAqIEBwYXJhbSBkZXN0Q29uZmlnICBfX29iamVjdF9fICAgaW5zdGFuY2Ugb2YgQ29weURlc3RpbmF0aW9uT3B0aW9ucyBAbGluayAuL2hlbHBlcnMvQ29weURlc3RpbmF0aW9uT3B0aW9uc1xuICAgKiBAcGFyYW0gY2IgX19mdW5jdGlvbl9fIGNhbGxlZCB3aXRoIG51bGwgaWYgdGhlcmUgaXMgYW4gZXJyb3JcbiAgICogQHJldHVybnMgUHJvbWlzZSBpZiBubyBjYWxsYWNrIGlzIHBhc3NlZC5cbiAgICovXG4gIGNvcHlPYmplY3RWMihzb3VyY2VDb25maWcsIGRlc3RDb25maWcsIGNiKSB7XG4gICAgaWYgKCEoc291cmNlQ29uZmlnIGluc3RhbmNlb2YgQ29weVNvdXJjZU9wdGlvbnMpKSB7XG4gICAgICB0aHJvdyBuZXcgZXJyb3JzLkludmFsaWRBcmd1bWVudEVycm9yKCdzb3VyY2VDb25maWcgc2hvdWxkIG9mIHR5cGUgQ29weVNvdXJjZU9wdGlvbnMgJylcbiAgICB9XG4gICAgaWYgKCEoZGVzdENvbmZpZyBpbnN0YW5jZW9mIENvcHlEZXN0aW5hdGlvbk9wdGlvbnMpKSB7XG4gICAgICB0aHJvdyBuZXcgZXJyb3JzLkludmFsaWRBcmd1bWVudEVycm9yKCdkZXN0Q29uZmlnIHNob3VsZCBvZiB0eXBlIENvcHlEZXN0aW5hdGlvbk9wdGlvbnMgJylcbiAgICB9XG4gICAgaWYgKCFkZXN0Q29uZmlnLnZhbGlkYXRlKCkpIHtcbiAgICAgIHJldHVybiBmYWxzZVxuICAgIH1cbiAgICBpZiAoIWRlc3RDb25maWcudmFsaWRhdGUoKSkge1xuICAgICAgcmV0dXJuIGZhbHNlXG4gICAgfVxuICAgIGlmICghaXNGdW5jdGlvbihjYikpIHtcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ2NhbGxiYWNrIHNob3VsZCBiZSBvZiB0eXBlIFwiZnVuY3Rpb25cIicpXG4gICAgfVxuXG4gICAgY29uc3QgaGVhZGVycyA9IE9iamVjdC5hc3NpZ24oe30sIHNvdXJjZUNvbmZpZy5nZXRIZWFkZXJzKCksIGRlc3RDb25maWcuZ2V0SGVhZGVycygpKVxuXG4gICAgY29uc3QgYnVja2V0TmFtZSA9IGRlc3RDb25maWcuQnVja2V0XG4gICAgY29uc3Qgb2JqZWN0TmFtZSA9IGRlc3RDb25maWcuT2JqZWN0XG5cbiAgICBjb25zdCBtZXRob2QgPSAnUFVUJ1xuICAgIHRoaXMubWFrZVJlcXVlc3QoeyBtZXRob2QsIGJ1Y2tldE5hbWUsIG9iamVjdE5hbWUsIGhlYWRlcnMgfSwgJycsIFsyMDBdLCAnJywgdHJ1ZSwgKGUsIHJlc3BvbnNlKSA9PiB7XG4gICAgICBpZiAoZSkge1xuICAgICAgICByZXR1cm4gY2IoZSlcbiAgICAgIH1cbiAgICAgIGNvbnN0IHRyYW5zZm9ybWVyID0gdHJhbnNmb3JtZXJzLmdldENvcHlPYmplY3RUcmFuc2Zvcm1lcigpXG4gICAgICBwaXBlc2V0dXAocmVzcG9uc2UsIHRyYW5zZm9ybWVyKVxuICAgICAgICAub24oJ2Vycm9yJywgKGUpID0+IGNiKGUpKVxuICAgICAgICAub24oJ2RhdGEnLCAoZGF0YSkgPT4ge1xuICAgICAgICAgIGNvbnN0IHJlc0hlYWRlcnMgPSByZXNwb25zZS5oZWFkZXJzXG5cbiAgICAgICAgICBjb25zdCBjb3B5T2JqUmVzcG9uc2UgPSB7XG4gICAgICAgICAgICBCdWNrZXQ6IGRlc3RDb25maWcuQnVja2V0LFxuICAgICAgICAgICAgS2V5OiBkZXN0Q29uZmlnLk9iamVjdCxcbiAgICAgICAgICAgIExhc3RNb2RpZmllZDogZGF0YS5MYXN0TW9kaWZpZWQsXG4gICAgICAgICAgICBNZXRhRGF0YTogZXh0cmFjdE1ldGFkYXRhKHJlc0hlYWRlcnMpLFxuICAgICAgICAgICAgVmVyc2lvbklkOiBnZXRWZXJzaW9uSWQocmVzSGVhZGVycyksXG4gICAgICAgICAgICBTb3VyY2VWZXJzaW9uSWQ6IGdldFNvdXJjZVZlcnNpb25JZChyZXNIZWFkZXJzKSxcbiAgICAgICAgICAgIEV0YWc6IHNhbml0aXplRVRhZyhyZXNIZWFkZXJzLmV0YWcpLFxuICAgICAgICAgICAgU2l6ZTogK3Jlc0hlYWRlcnNbJ2NvbnRlbnQtbGVuZ3RoJ10sXG4gICAgICAgICAgfVxuXG4gICAgICAgICAgcmV0dXJuIGNiKG51bGwsIGNvcHlPYmpSZXNwb25zZSlcbiAgICAgICAgfSlcbiAgICB9KVxuICB9XG5cbiAgLy8gQmFja3dhcmQgY29tcGF0aWJpbGl0eSBmb3IgQ29weSBPYmplY3QgQVBJLlxuICBjb3B5T2JqZWN0KC4uLmFsbEFyZ3MpIHtcbiAgICBpZiAoYWxsQXJnc1swXSBpbnN0YW5jZW9mIENvcHlTb3VyY2VPcHRpb25zICYmIGFsbEFyZ3NbMV0gaW5zdGFuY2VvZiBDb3B5RGVzdGluYXRpb25PcHRpb25zKSB7XG4gICAgICByZXR1cm4gdGhpcy5jb3B5T2JqZWN0VjIoLi4uYXJndW1lbnRzKVxuICAgIH1cbiAgICByZXR1cm4gdGhpcy5jb3B5T2JqZWN0VjEoLi4uYXJndW1lbnRzKVxuICB9XG5cbiAgLy8gbGlzdCBhIGJhdGNoIG9mIG9iamVjdHNcbiAgbGlzdE9iamVjdHNRdWVyeShidWNrZXROYW1lLCBwcmVmaXgsIG1hcmtlciwgbGlzdFF1ZXJ5T3B0cyA9IHt9KSB7XG4gICAgaWYgKCFpc1ZhbGlkQnVja2V0TmFtZShidWNrZXROYW1lKSkge1xuICAgICAgdGhyb3cgbmV3IGVycm9ycy5JbnZhbGlkQnVja2V0TmFtZUVycm9yKCdJbnZhbGlkIGJ1Y2tldCBuYW1lOiAnICsgYnVja2V0TmFtZSlcbiAgICB9XG4gICAgaWYgKCFpc1N0cmluZyhwcmVmaXgpKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdwcmVmaXggc2hvdWxkIGJlIG9mIHR5cGUgXCJzdHJpbmdcIicpXG4gICAgfVxuICAgIGlmICghaXNTdHJpbmcobWFya2VyKSkge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignbWFya2VyIHNob3VsZCBiZSBvZiB0eXBlIFwic3RyaW5nXCInKVxuICAgIH1cbiAgICBsZXQgeyBEZWxpbWl0ZXIsIE1heEtleXMsIEluY2x1ZGVWZXJzaW9uIH0gPSBsaXN0UXVlcnlPcHRzXG5cbiAgICBpZiAoIWlzT2JqZWN0KGxpc3RRdWVyeU9wdHMpKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdsaXN0UXVlcnlPcHRzIHNob3VsZCBiZSBvZiB0eXBlIFwib2JqZWN0XCInKVxuICAgIH1cblxuICAgIGlmICghaXNTdHJpbmcoRGVsaW1pdGVyKSkge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignRGVsaW1pdGVyIHNob3VsZCBiZSBvZiB0eXBlIFwic3RyaW5nXCInKVxuICAgIH1cbiAgICBpZiAoIWlzTnVtYmVyKE1heEtleXMpKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdNYXhLZXlzIHNob3VsZCBiZSBvZiB0eXBlIFwibnVtYmVyXCInKVxuICAgIH1cblxuICAgIGNvbnN0IHF1ZXJpZXMgPSBbXVxuICAgIC8vIGVzY2FwZSBldmVyeSB2YWx1ZSBpbiBxdWVyeSBzdHJpbmcsIGV4Y2VwdCBtYXhLZXlzXG4gICAgcXVlcmllcy5wdXNoKGBwcmVmaXg9JHt1cmlFc2NhcGUocHJlZml4KX1gKVxuICAgIHF1ZXJpZXMucHVzaChgZGVsaW1pdGVyPSR7dXJpRXNjYXBlKERlbGltaXRlcil9YClcbiAgICBxdWVyaWVzLnB1c2goYGVuY29kaW5nLXR5cGU9dXJsYClcblxuICAgIGlmIChJbmNsdWRlVmVyc2lvbikge1xuICAgICAgcXVlcmllcy5wdXNoKGB2ZXJzaW9uc2ApXG4gICAgfVxuXG4gICAgaWYgKG1hcmtlcikge1xuICAgICAgbWFya2VyID0gdXJpRXNjYXBlKG1hcmtlcilcbiAgICAgIGlmIChJbmNsdWRlVmVyc2lvbikge1xuICAgICAgICBxdWVyaWVzLnB1c2goYGtleS1tYXJrZXI9JHttYXJrZXJ9YClcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHF1ZXJpZXMucHVzaChgbWFya2VyPSR7bWFya2VyfWApXG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gbm8gbmVlZCB0byBlc2NhcGUgbWF4S2V5c1xuICAgIGlmIChNYXhLZXlzKSB7XG4gICAgICBpZiAoTWF4S2V5cyA+PSAxMDAwKSB7XG4gICAgICAgIE1heEtleXMgPSAxMDAwXG4gICAgICB9XG4gICAgICBxdWVyaWVzLnB1c2goYG1heC1rZXlzPSR7TWF4S2V5c31gKVxuICAgIH1cbiAgICBxdWVyaWVzLnNvcnQoKVxuICAgIHZhciBxdWVyeSA9ICcnXG4gICAgaWYgKHF1ZXJpZXMubGVuZ3RoID4gMCkge1xuICAgICAgcXVlcnkgPSBgJHtxdWVyaWVzLmpvaW4oJyYnKX1gXG4gICAgfVxuXG4gICAgdmFyIG1ldGhvZCA9ICdHRVQnXG4gICAgdmFyIHRyYW5zZm9ybWVyID0gdHJhbnNmb3JtZXJzLmdldExpc3RPYmplY3RzVHJhbnNmb3JtZXIoKVxuICAgIHRoaXMubWFrZVJlcXVlc3QoeyBtZXRob2QsIGJ1Y2tldE5hbWUsIHF1ZXJ5IH0sICcnLCBbMjAwXSwgJycsIHRydWUsIChlLCByZXNwb25zZSkgPT4ge1xuICAgICAgaWYgKGUpIHtcbiAgICAgICAgcmV0dXJuIHRyYW5zZm9ybWVyLmVtaXQoJ2Vycm9yJywgZSlcbiAgICAgIH1cbiAgICAgIHBpcGVzZXR1cChyZXNwb25zZSwgdHJhbnNmb3JtZXIpXG4gICAgfSlcbiAgICByZXR1cm4gdHJhbnNmb3JtZXJcbiAgfVxuXG4gIC8vIExpc3QgdGhlIG9iamVjdHMgaW4gdGhlIGJ1Y2tldC5cbiAgLy9cbiAgLy8gX19Bcmd1bWVudHNfX1xuICAvLyAqIGBidWNrZXROYW1lYCBfc3RyaW5nXzogbmFtZSBvZiB0aGUgYnVja2V0XG4gIC8vICogYHByZWZpeGAgX3N0cmluZ186IHRoZSBwcmVmaXggb2YgdGhlIG9iamVjdHMgdGhhdCBzaG91bGQgYmUgbGlzdGVkIChvcHRpb25hbCwgZGVmYXVsdCBgJydgKVxuICAvLyAqIGByZWN1cnNpdmVgIF9ib29sXzogYHRydWVgIGluZGljYXRlcyByZWN1cnNpdmUgc3R5bGUgbGlzdGluZyBhbmQgYGZhbHNlYCBpbmRpY2F0ZXMgZGlyZWN0b3J5IHN0eWxlIGxpc3RpbmcgZGVsaW1pdGVkIGJ5ICcvJy4gKG9wdGlvbmFsLCBkZWZhdWx0IGBmYWxzZWApXG4gIC8vICogYGxpc3RPcHRzIF9vYmplY3RfOiBxdWVyeSBwYXJhbXMgdG8gbGlzdCBvYmplY3Qgd2l0aCBiZWxvdyBrZXlzXG4gIC8vICogICAgbGlzdE9wdHMuTWF4S2V5cyBfaW50XyBtYXhpbXVtIG51bWJlciBvZiBrZXlzIHRvIHJldHVyblxuICAvLyAqICAgIGxpc3RPcHRzLkluY2x1ZGVWZXJzaW9uICBfYm9vbF8gdHJ1ZXxmYWxzZSB0byBpbmNsdWRlIHZlcnNpb25zLlxuICAvLyBfX1JldHVybiBWYWx1ZV9fXG4gIC8vICogYHN0cmVhbWAgX1N0cmVhbV86IHN0cmVhbSBlbWl0dGluZyB0aGUgb2JqZWN0cyBpbiB0aGUgYnVja2V0LCB0aGUgb2JqZWN0IGlzIG9mIHRoZSBmb3JtYXQ6XG4gIC8vICogYG9iai5uYW1lYCBfc3RyaW5nXzogbmFtZSBvZiB0aGUgb2JqZWN0XG4gIC8vICogYG9iai5wcmVmaXhgIF9zdHJpbmdfOiBuYW1lIG9mIHRoZSBvYmplY3QgcHJlZml4XG4gIC8vICogYG9iai5zaXplYCBfbnVtYmVyXzogc2l6ZSBvZiB0aGUgb2JqZWN0XG4gIC8vICogYG9iai5ldGFnYCBfc3RyaW5nXzogZXRhZyBvZiB0aGUgb2JqZWN0XG4gIC8vICogYG9iai5sYXN0TW9kaWZpZWRgIF9EYXRlXzogbW9kaWZpZWQgdGltZSBzdGFtcFxuICAvLyAqIGBvYmouaXNEZWxldGVNYXJrZXJgIF9ib29sZWFuXzogdHJ1ZSBpZiBpdCBpcyBhIGRlbGV0ZSBtYXJrZXJcbiAgLy8gKiBgb2JqLnZlcnNpb25JZGAgX3N0cmluZ186IHZlcnNpb25JZCBvZiB0aGUgb2JqZWN0XG4gIGxpc3RPYmplY3RzKGJ1Y2tldE5hbWUsIHByZWZpeCwgcmVjdXJzaXZlLCBsaXN0T3B0cyA9IHt9KSB7XG4gICAgaWYgKHByZWZpeCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBwcmVmaXggPSAnJ1xuICAgIH1cbiAgICBpZiAocmVjdXJzaXZlID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHJlY3Vyc2l2ZSA9IGZhbHNlXG4gICAgfVxuICAgIGlmICghaXNWYWxpZEJ1Y2tldE5hbWUoYnVja2V0TmFtZSkpIHtcbiAgICAgIHRocm93IG5ldyBlcnJvcnMuSW52YWxpZEJ1Y2tldE5hbWVFcnJvcignSW52YWxpZCBidWNrZXQgbmFtZTogJyArIGJ1Y2tldE5hbWUpXG4gICAgfVxuICAgIGlmICghaXNWYWxpZFByZWZpeChwcmVmaXgpKSB7XG4gICAgICB0aHJvdyBuZXcgZXJyb3JzLkludmFsaWRQcmVmaXhFcnJvcihgSW52YWxpZCBwcmVmaXggOiAke3ByZWZpeH1gKVxuICAgIH1cbiAgICBpZiAoIWlzU3RyaW5nKHByZWZpeCkpIHtcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ3ByZWZpeCBzaG91bGQgYmUgb2YgdHlwZSBcInN0cmluZ1wiJylcbiAgICB9XG4gICAgaWYgKCFpc0Jvb2xlYW4ocmVjdXJzaXZlKSkge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcigncmVjdXJzaXZlIHNob3VsZCBiZSBvZiB0eXBlIFwiYm9vbGVhblwiJylcbiAgICB9XG4gICAgaWYgKCFpc09iamVjdChsaXN0T3B0cykpIHtcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ2xpc3RPcHRzIHNob3VsZCBiZSBvZiB0eXBlIFwib2JqZWN0XCInKVxuICAgIH1cbiAgICB2YXIgbWFya2VyID0gJydcbiAgICBjb25zdCBsaXN0UXVlcnlPcHRzID0ge1xuICAgICAgRGVsaW1pdGVyOiByZWN1cnNpdmUgPyAnJyA6ICcvJywgLy8gaWYgcmVjdXJzaXZlIGlzIGZhbHNlIHNldCBkZWxpbWl0ZXIgdG8gJy8nXG4gICAgICBNYXhLZXlzOiAxMDAwLFxuICAgICAgSW5jbHVkZVZlcnNpb246IGxpc3RPcHRzLkluY2x1ZGVWZXJzaW9uLFxuICAgIH1cbiAgICB2YXIgb2JqZWN0cyA9IFtdXG4gICAgdmFyIGVuZGVkID0gZmFsc2VcbiAgICB2YXIgcmVhZFN0cmVhbSA9IFN0cmVhbS5SZWFkYWJsZSh7IG9iamVjdE1vZGU6IHRydWUgfSlcbiAgICByZWFkU3RyZWFtLl9yZWFkID0gKCkgPT4ge1xuICAgICAgLy8gcHVzaCBvbmUgb2JqZWN0IHBlciBfcmVhZCgpXG4gICAgICBpZiAob2JqZWN0cy5sZW5ndGgpIHtcbiAgICAgICAgcmVhZFN0cmVhbS5wdXNoKG9iamVjdHMuc2hpZnQoKSlcbiAgICAgICAgcmV0dXJuXG4gICAgICB9XG4gICAgICBpZiAoZW5kZWQpIHtcbiAgICAgICAgcmV0dXJuIHJlYWRTdHJlYW0ucHVzaChudWxsKVxuICAgICAgfVxuICAgICAgLy8gaWYgdGhlcmUgYXJlIG5vIG9iamVjdHMgdG8gcHVzaCBkbyBxdWVyeSBmb3IgdGhlIG5leHQgYmF0Y2ggb2Ygb2JqZWN0c1xuICAgICAgdGhpcy5saXN0T2JqZWN0c1F1ZXJ5KGJ1Y2tldE5hbWUsIHByZWZpeCwgbWFya2VyLCBsaXN0UXVlcnlPcHRzKVxuICAgICAgICAub24oJ2Vycm9yJywgKGUpID0+IHJlYWRTdHJlYW0uZW1pdCgnZXJyb3InLCBlKSlcbiAgICAgICAgLm9uKCdkYXRhJywgKHJlc3VsdCkgPT4ge1xuICAgICAgICAgIGlmIChyZXN1bHQuaXNUcnVuY2F0ZWQpIHtcbiAgICAgICAgICAgIG1hcmtlciA9IHJlc3VsdC5uZXh0TWFya2VyIHx8IHJlc3VsdC52ZXJzaW9uSWRNYXJrZXJcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgZW5kZWQgPSB0cnVlXG4gICAgICAgICAgfVxuICAgICAgICAgIG9iamVjdHMgPSByZXN1bHQub2JqZWN0c1xuICAgICAgICAgIHJlYWRTdHJlYW0uX3JlYWQoKVxuICAgICAgICB9KVxuICAgIH1cbiAgICByZXR1cm4gcmVhZFN0cmVhbVxuICB9XG5cbiAgLy8gbGlzdE9iamVjdHNWMlF1ZXJ5IC0gKExpc3QgT2JqZWN0cyBWMikgLSBMaXN0IHNvbWUgb3IgYWxsICh1cCB0byAxMDAwKSBvZiB0aGUgb2JqZWN0cyBpbiBhIGJ1Y2tldC5cbiAgLy9cbiAgLy8gWW91IGNhbiB1c2UgdGhlIHJlcXVlc3QgcGFyYW1ldGVycyBhcyBzZWxlY3Rpb24gY3JpdGVyaWEgdG8gcmV0dXJuIGEgc3Vic2V0IG9mIHRoZSBvYmplY3RzIGluIGEgYnVja2V0LlxuICAvLyByZXF1ZXN0IHBhcmFtZXRlcnMgOi1cbiAgLy8gKiBgYnVja2V0TmFtZWAgX3N0cmluZ186IG5hbWUgb2YgdGhlIGJ1Y2tldFxuICAvLyAqIGBwcmVmaXhgIF9zdHJpbmdfOiBMaW1pdHMgdGhlIHJlc3BvbnNlIHRvIGtleXMgdGhhdCBiZWdpbiB3aXRoIHRoZSBzcGVjaWZpZWQgcHJlZml4LlxuICAvLyAqIGBjb250aW51YXRpb24tdG9rZW5gIF9zdHJpbmdfOiBVc2VkIHRvIGNvbnRpbnVlIGl0ZXJhdGluZyBvdmVyIGEgc2V0IG9mIG9iamVjdHMuXG4gIC8vICogYGRlbGltaXRlcmAgX3N0cmluZ186IEEgZGVsaW1pdGVyIGlzIGEgY2hhcmFjdGVyIHlvdSB1c2UgdG8gZ3JvdXAga2V5cy5cbiAgLy8gKiBgbWF4LWtleXNgIF9udW1iZXJfOiBTZXRzIHRoZSBtYXhpbXVtIG51bWJlciBvZiBrZXlzIHJldHVybmVkIGluIHRoZSByZXNwb25zZSBib2R5LlxuICAvLyAqIGBzdGFydC1hZnRlcmAgX3N0cmluZ186IFNwZWNpZmllcyB0aGUga2V5IHRvIHN0YXJ0IGFmdGVyIHdoZW4gbGlzdGluZyBvYmplY3RzIGluIGEgYnVja2V0LlxuICBsaXN0T2JqZWN0c1YyUXVlcnkoYnVja2V0TmFtZSwgcHJlZml4LCBjb250aW51YXRpb25Ub2tlbiwgZGVsaW1pdGVyLCBtYXhLZXlzLCBzdGFydEFmdGVyKSB7XG4gICAgaWYgKCFpc1ZhbGlkQnVja2V0TmFtZShidWNrZXROYW1lKSkge1xuICAgICAgdGhyb3cgbmV3IGVycm9ycy5JbnZhbGlkQnVja2V0TmFtZUVycm9yKCdJbnZhbGlkIGJ1Y2tldCBuYW1lOiAnICsgYnVja2V0TmFtZSlcbiAgICB9XG4gICAgaWYgKCFpc1N0cmluZyhwcmVmaXgpKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdwcmVmaXggc2hvdWxkIGJlIG9mIHR5cGUgXCJzdHJpbmdcIicpXG4gICAgfVxuICAgIGlmICghaXNTdHJpbmcoY29udGludWF0aW9uVG9rZW4pKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdjb250aW51YXRpb25Ub2tlbiBzaG91bGQgYmUgb2YgdHlwZSBcInN0cmluZ1wiJylcbiAgICB9XG4gICAgaWYgKCFpc1N0cmluZyhkZWxpbWl0ZXIpKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdkZWxpbWl0ZXIgc2hvdWxkIGJlIG9mIHR5cGUgXCJzdHJpbmdcIicpXG4gICAgfVxuICAgIGlmICghaXNOdW1iZXIobWF4S2V5cykpIHtcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ21heEtleXMgc2hvdWxkIGJlIG9mIHR5cGUgXCJudW1iZXJcIicpXG4gICAgfVxuICAgIGlmICghaXNTdHJpbmcoc3RhcnRBZnRlcikpIHtcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ3N0YXJ0QWZ0ZXIgc2hvdWxkIGJlIG9mIHR5cGUgXCJzdHJpbmdcIicpXG4gICAgfVxuICAgIHZhciBxdWVyaWVzID0gW11cblxuICAgIC8vIENhbGwgZm9yIGxpc3Rpbmcgb2JqZWN0cyB2MiBBUElcbiAgICBxdWVyaWVzLnB1c2goYGxpc3QtdHlwZT0yYClcbiAgICBxdWVyaWVzLnB1c2goYGVuY29kaW5nLXR5cGU9dXJsYClcblxuICAgIC8vIGVzY2FwZSBldmVyeSB2YWx1ZSBpbiBxdWVyeSBzdHJpbmcsIGV4Y2VwdCBtYXhLZXlzXG4gICAgcXVlcmllcy5wdXNoKGBwcmVmaXg9JHt1cmlFc2NhcGUocHJlZml4KX1gKVxuICAgIHF1ZXJpZXMucHVzaChgZGVsaW1pdGVyPSR7dXJpRXNjYXBlKGRlbGltaXRlcil9YClcblxuICAgIGlmIChjb250aW51YXRpb25Ub2tlbikge1xuICAgICAgY29udGludWF0aW9uVG9rZW4gPSB1cmlFc2NhcGUoY29udGludWF0aW9uVG9rZW4pXG4gICAgICBxdWVyaWVzLnB1c2goYGNvbnRpbnVhdGlvbi10b2tlbj0ke2NvbnRpbnVhdGlvblRva2VufWApXG4gICAgfVxuICAgIC8vIFNldCBzdGFydC1hZnRlclxuICAgIGlmIChzdGFydEFmdGVyKSB7XG4gICAgICBzdGFydEFmdGVyID0gdXJpRXNjYXBlKHN0YXJ0QWZ0ZXIpXG4gICAgICBxdWVyaWVzLnB1c2goYHN0YXJ0LWFmdGVyPSR7c3RhcnRBZnRlcn1gKVxuICAgIH1cbiAgICAvLyBubyBuZWVkIHRvIGVzY2FwZSBtYXhLZXlzXG4gICAgaWYgKG1heEtleXMpIHtcbiAgICAgIGlmIChtYXhLZXlzID49IDEwMDApIHtcbiAgICAgICAgbWF4S2V5cyA9IDEwMDBcbiAgICAgIH1cbiAgICAgIHF1ZXJpZXMucHVzaChgbWF4LWtleXM9JHttYXhLZXlzfWApXG4gICAgfVxuICAgIHF1ZXJpZXMuc29ydCgpXG4gICAgdmFyIHF1ZXJ5ID0gJydcbiAgICBpZiAocXVlcmllcy5sZW5ndGggPiAwKSB7XG4gICAgICBxdWVyeSA9IGAke3F1ZXJpZXMuam9pbignJicpfWBcbiAgICB9XG4gICAgdmFyIG1ldGhvZCA9ICdHRVQnXG4gICAgdmFyIHRyYW5zZm9ybWVyID0gdHJhbnNmb3JtZXJzLmdldExpc3RPYmplY3RzVjJUcmFuc2Zvcm1lcigpXG4gICAgdGhpcy5tYWtlUmVxdWVzdCh7IG1ldGhvZCwgYnVja2V0TmFtZSwgcXVlcnkgfSwgJycsIFsyMDBdLCAnJywgdHJ1ZSwgKGUsIHJlc3BvbnNlKSA9PiB7XG4gICAgICBpZiAoZSkge1xuICAgICAgICByZXR1cm4gdHJhbnNmb3JtZXIuZW1pdCgnZXJyb3InLCBlKVxuICAgICAgfVxuICAgICAgcGlwZXNldHVwKHJlc3BvbnNlLCB0cmFuc2Zvcm1lcilcbiAgICB9KVxuICAgIHJldHVybiB0cmFuc2Zvcm1lclxuICB9XG5cbiAgLy8gTGlzdCB0aGUgb2JqZWN0cyBpbiB0aGUgYnVja2V0IHVzaW5nIFMzIExpc3RPYmplY3RzIFYyXG4gIC8vXG4gIC8vIF9fQXJndW1lbnRzX19cbiAgLy8gKiBgYnVja2V0TmFtZWAgX3N0cmluZ186IG5hbWUgb2YgdGhlIGJ1Y2tldFxuICAvLyAqIGBwcmVmaXhgIF9zdHJpbmdfOiB0aGUgcHJlZml4IG9mIHRoZSBvYmplY3RzIHRoYXQgc2hvdWxkIGJlIGxpc3RlZCAob3B0aW9uYWwsIGRlZmF1bHQgYCcnYClcbiAgLy8gKiBgcmVjdXJzaXZlYCBfYm9vbF86IGB0cnVlYCBpbmRpY2F0ZXMgcmVjdXJzaXZlIHN0eWxlIGxpc3RpbmcgYW5kIGBmYWxzZWAgaW5kaWNhdGVzIGRpcmVjdG9yeSBzdHlsZSBsaXN0aW5nIGRlbGltaXRlZCBieSAnLycuIChvcHRpb25hbCwgZGVmYXVsdCBgZmFsc2VgKVxuICAvLyAqIGBzdGFydEFmdGVyYCBfc3RyaW5nXzogU3BlY2lmaWVzIHRoZSBrZXkgdG8gc3RhcnQgYWZ0ZXIgd2hlbiBsaXN0aW5nIG9iamVjdHMgaW4gYSBidWNrZXQuIChvcHRpb25hbCwgZGVmYXVsdCBgJydgKVxuICAvL1xuICAvLyBfX1JldHVybiBWYWx1ZV9fXG4gIC8vICogYHN0cmVhbWAgX1N0cmVhbV86IHN0cmVhbSBlbWl0dGluZyB0aGUgb2JqZWN0cyBpbiB0aGUgYnVja2V0LCB0aGUgb2JqZWN0IGlzIG9mIHRoZSBmb3JtYXQ6XG4gIC8vICAgKiBgb2JqLm5hbWVgIF9zdHJpbmdfOiBuYW1lIG9mIHRoZSBvYmplY3RcbiAgLy8gICAqIGBvYmoucHJlZml4YCBfc3RyaW5nXzogbmFtZSBvZiB0aGUgb2JqZWN0IHByZWZpeFxuICAvLyAgICogYG9iai5zaXplYCBfbnVtYmVyXzogc2l6ZSBvZiB0aGUgb2JqZWN0XG4gIC8vICAgKiBgb2JqLmV0YWdgIF9zdHJpbmdfOiBldGFnIG9mIHRoZSBvYmplY3RcbiAgLy8gICAqIGBvYmoubGFzdE1vZGlmaWVkYCBfRGF0ZV86IG1vZGlmaWVkIHRpbWUgc3RhbXBcbiAgbGlzdE9iamVjdHNWMihidWNrZXROYW1lLCBwcmVmaXgsIHJlY3Vyc2l2ZSwgc3RhcnRBZnRlcikge1xuICAgIGlmIChwcmVmaXggPT09IHVuZGVmaW5lZCkge1xuICAgICAgcHJlZml4ID0gJydcbiAgICB9XG4gICAgaWYgKHJlY3Vyc2l2ZSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICByZWN1cnNpdmUgPSBmYWxzZVxuICAgIH1cbiAgICBpZiAoc3RhcnRBZnRlciA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBzdGFydEFmdGVyID0gJydcbiAgICB9XG4gICAgaWYgKCFpc1ZhbGlkQnVja2V0TmFtZShidWNrZXROYW1lKSkge1xuICAgICAgdGhyb3cgbmV3IGVycm9ycy5JbnZhbGlkQnVja2V0TmFtZUVycm9yKCdJbnZhbGlkIGJ1Y2tldCBuYW1lOiAnICsgYnVja2V0TmFtZSlcbiAgICB9XG4gICAgaWYgKCFpc1ZhbGlkUHJlZml4KHByZWZpeCkpIHtcbiAgICAgIHRocm93IG5ldyBlcnJvcnMuSW52YWxpZFByZWZpeEVycm9yKGBJbnZhbGlkIHByZWZpeCA6ICR7cHJlZml4fWApXG4gICAgfVxuICAgIGlmICghaXNTdHJpbmcocHJlZml4KSkge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcigncHJlZml4IHNob3VsZCBiZSBvZiB0eXBlIFwic3RyaW5nXCInKVxuICAgIH1cbiAgICBpZiAoIWlzQm9vbGVhbihyZWN1cnNpdmUpKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdyZWN1cnNpdmUgc2hvdWxkIGJlIG9mIHR5cGUgXCJib29sZWFuXCInKVxuICAgIH1cbiAgICBpZiAoIWlzU3RyaW5nKHN0YXJ0QWZ0ZXIpKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdzdGFydEFmdGVyIHNob3VsZCBiZSBvZiB0eXBlIFwic3RyaW5nXCInKVxuICAgIH1cbiAgICAvLyBpZiByZWN1cnNpdmUgaXMgZmFsc2Ugc2V0IGRlbGltaXRlciB0byAnLydcbiAgICB2YXIgZGVsaW1pdGVyID0gcmVjdXJzaXZlID8gJycgOiAnLydcbiAgICB2YXIgY29udGludWF0aW9uVG9rZW4gPSAnJ1xuICAgIHZhciBvYmplY3RzID0gW11cbiAgICB2YXIgZW5kZWQgPSBmYWxzZVxuICAgIHZhciByZWFkU3RyZWFtID0gU3RyZWFtLlJlYWRhYmxlKHsgb2JqZWN0TW9kZTogdHJ1ZSB9KVxuICAgIHJlYWRTdHJlYW0uX3JlYWQgPSAoKSA9PiB7XG4gICAgICAvLyBwdXNoIG9uZSBvYmplY3QgcGVyIF9yZWFkKClcbiAgICAgIGlmIChvYmplY3RzLmxlbmd0aCkge1xuICAgICAgICByZWFkU3RyZWFtLnB1c2gob2JqZWN0cy5zaGlmdCgpKVxuICAgICAgICByZXR1cm5cbiAgICAgIH1cbiAgICAgIGlmIChlbmRlZCkge1xuICAgICAgICByZXR1cm4gcmVhZFN0cmVhbS5wdXNoKG51bGwpXG4gICAgICB9XG4gICAgICAvLyBpZiB0aGVyZSBhcmUgbm8gb2JqZWN0cyB0byBwdXNoIGRvIHF1ZXJ5IGZvciB0aGUgbmV4dCBiYXRjaCBvZiBvYmplY3RzXG4gICAgICB0aGlzLmxpc3RPYmplY3RzVjJRdWVyeShidWNrZXROYW1lLCBwcmVmaXgsIGNvbnRpbnVhdGlvblRva2VuLCBkZWxpbWl0ZXIsIDEwMDAsIHN0YXJ0QWZ0ZXIpXG4gICAgICAgIC5vbignZXJyb3InLCAoZSkgPT4gcmVhZFN0cmVhbS5lbWl0KCdlcnJvcicsIGUpKVxuICAgICAgICAub24oJ2RhdGEnLCAocmVzdWx0KSA9PiB7XG4gICAgICAgICAgaWYgKHJlc3VsdC5pc1RydW5jYXRlZCkge1xuICAgICAgICAgICAgY29udGludWF0aW9uVG9rZW4gPSByZXN1bHQubmV4dENvbnRpbnVhdGlvblRva2VuXG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGVuZGVkID0gdHJ1ZVxuICAgICAgICAgIH1cbiAgICAgICAgICBvYmplY3RzID0gcmVzdWx0Lm9iamVjdHNcbiAgICAgICAgICByZWFkU3RyZWFtLl9yZWFkKClcbiAgICAgICAgfSlcbiAgICB9XG4gICAgcmV0dXJuIHJlYWRTdHJlYW1cbiAgfVxuXG4gIC8vIFN0YXQgaW5mb3JtYXRpb24gb2YgdGhlIG9iamVjdC5cbiAgLy9cbiAgLy8gX19Bcmd1bWVudHNfX1xuICAvLyAqIGBidWNrZXROYW1lYCBfc3RyaW5nXzogbmFtZSBvZiB0aGUgYnVja2V0XG4gIC8vICogYG9iamVjdE5hbWVgIF9zdHJpbmdfOiBuYW1lIG9mIHRoZSBvYmplY3RcbiAgLy8gKiBgc3RhdE9wdHNgICBfb2JqZWN0XyA6IFZlcnNpb24gb2YgdGhlIG9iamVjdCBpbiB0aGUgZm9ybSBge3ZlcnNpb25JZDonbXktdXVpZCd9YC4gRGVmYXVsdCBpcyBge31gLiAob3B0aW9uYWwpLlxuICAvLyAqIGBjYWxsYmFjayhlcnIsIHN0YXQpYCBfZnVuY3Rpb25fOiBgZXJyYCBpcyBub3QgYG51bGxgIGluIGNhc2Ugb2YgZXJyb3IsIGBzdGF0YCBjb250YWlucyB0aGUgb2JqZWN0IGluZm9ybWF0aW9uOlxuICAvLyAgICogYHN0YXQuc2l6ZWAgX251bWJlcl86IHNpemUgb2YgdGhlIG9iamVjdFxuICAvLyAgICogYHN0YXQuZXRhZ2AgX3N0cmluZ186IGV0YWcgb2YgdGhlIG9iamVjdFxuICAvLyAgICogYHN0YXQubWV0YURhdGFgIF9zdHJpbmdfOiBNZXRhRGF0YSBvZiB0aGUgb2JqZWN0XG4gIC8vICAgKiBgc3RhdC5sYXN0TW9kaWZpZWRgIF9EYXRlXzogbW9kaWZpZWQgdGltZSBzdGFtcFxuICAvLyAgICogYHN0YXQudmVyc2lvbklkYCBfc3RyaW5nXzogdmVyc2lvbiBpZCBvZiB0aGUgb2JqZWN0IGlmIGF2YWlsYWJsZVxuICBzdGF0T2JqZWN0KGJ1Y2tldE5hbWUsIG9iamVjdE5hbWUsIHN0YXRPcHRzID0ge30sIGNiKSB7XG4gICAgaWYgKCFpc1ZhbGlkQnVja2V0TmFtZShidWNrZXROYW1lKSkge1xuICAgICAgdGhyb3cgbmV3IGVycm9ycy5JbnZhbGlkQnVja2V0TmFtZUVycm9yKCdJbnZhbGlkIGJ1Y2tldCBuYW1lOiAnICsgYnVja2V0TmFtZSlcbiAgICB9XG4gICAgaWYgKCFpc1ZhbGlkT2JqZWN0TmFtZShvYmplY3ROYW1lKSkge1xuICAgICAgdGhyb3cgbmV3IGVycm9ycy5JbnZhbGlkT2JqZWN0TmFtZUVycm9yKGBJbnZhbGlkIG9iamVjdCBuYW1lOiAke29iamVjdE5hbWV9YClcbiAgICB9XG4gICAgLy8gYmFja3dhcmQgY29tcGF0aWJpbGl0eVxuICAgIGlmIChpc0Z1bmN0aW9uKHN0YXRPcHRzKSkge1xuICAgICAgY2IgPSBzdGF0T3B0c1xuICAgICAgc3RhdE9wdHMgPSB7fVxuICAgIH1cblxuICAgIGlmICghaXNPYmplY3Qoc3RhdE9wdHMpKSB7XG4gICAgICB0aHJvdyBuZXcgZXJyb3JzLkludmFsaWRBcmd1bWVudEVycm9yKCdzdGF0T3B0cyBzaG91bGQgYmUgb2YgdHlwZSBcIm9iamVjdFwiJylcbiAgICB9XG4gICAgaWYgKCFpc0Z1bmN0aW9uKGNiKSkge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignY2FsbGJhY2sgc2hvdWxkIGJlIG9mIHR5cGUgXCJmdW5jdGlvblwiJylcbiAgICB9XG5cbiAgICB2YXIgcXVlcnkgPSBxdWVyeXN0cmluZy5zdHJpbmdpZnkoc3RhdE9wdHMpXG4gICAgdmFyIG1ldGhvZCA9ICdIRUFEJ1xuICAgIHRoaXMubWFrZVJlcXVlc3QoeyBtZXRob2QsIGJ1Y2tldE5hbWUsIG9iamVjdE5hbWUsIHF1ZXJ5IH0sICcnLCBbMjAwXSwgJycsIHRydWUsIChlLCByZXNwb25zZSkgPT4ge1xuICAgICAgaWYgKGUpIHtcbiAgICAgICAgcmV0dXJuIGNiKGUpXG4gICAgICB9XG5cbiAgICAgIC8vIFdlIGRyYWluIHRoZSBzb2NrZXQgc28gdGhhdCB0aGUgY29ubmVjdGlvbiBnZXRzIGNsb3NlZC4gTm90ZSB0aGF0IHRoaXNcbiAgICAgIC8vIGlzIG5vdCBleHBlbnNpdmUgYXMgdGhlIHNvY2tldCB3aWxsIG5vdCBoYXZlIGFueSBkYXRhLlxuICAgICAgcmVzcG9uc2Uub24oJ2RhdGEnLCAoKSA9PiB7fSlcblxuICAgICAgY29uc3QgcmVzdWx0ID0ge1xuICAgICAgICBzaXplOiArcmVzcG9uc2UuaGVhZGVyc1snY29udGVudC1sZW5ndGgnXSxcbiAgICAgICAgbWV0YURhdGE6IGV4dHJhY3RNZXRhZGF0YShyZXNwb25zZS5oZWFkZXJzKSxcbiAgICAgICAgbGFzdE1vZGlmaWVkOiBuZXcgRGF0ZShyZXNwb25zZS5oZWFkZXJzWydsYXN0LW1vZGlmaWVkJ10pLFxuICAgICAgICB2ZXJzaW9uSWQ6IGdldFZlcnNpb25JZChyZXNwb25zZS5oZWFkZXJzKSxcbiAgICAgICAgZXRhZzogc2FuaXRpemVFVGFnKHJlc3BvbnNlLmhlYWRlcnMuZXRhZyksXG4gICAgICB9XG5cbiAgICAgIGNiKG51bGwsIHJlc3VsdClcbiAgICB9KVxuICB9XG5cbiAgLy8gUmVtb3ZlIHRoZSBzcGVjaWZpZWQgb2JqZWN0LlxuICAvL1xuICAvLyBfX0FyZ3VtZW50c19fXG4gIC8vICogYGJ1Y2tldE5hbWVgIF9zdHJpbmdfOiBuYW1lIG9mIHRoZSBidWNrZXRcbiAgLy8gKiBgb2JqZWN0TmFtZWAgX3N0cmluZ186IG5hbWUgb2YgdGhlIG9iamVjdFxuICAvLyAqIGByZW1vdmVPcHRzYCBfb2JqZWN0XzogVmVyc2lvbiBvZiB0aGUgb2JqZWN0IGluIHRoZSBmb3JtIGB7dmVyc2lvbklkOidteS11dWlkJywgZ292ZXJuYW5jZUJ5cGFzczp0cnVlfGZhbHNlLCBmb3JjZURlbGV0ZTp0cnVlfGZhbHNlfWAuIERlZmF1bHQgaXMgYHt9YC4gKG9wdGlvbmFsKVxuICAvLyAqIGBjYWxsYmFjayhlcnIpYCBfZnVuY3Rpb25fOiBjYWxsYmFjayBmdW5jdGlvbiBpcyBjYWxsZWQgd2l0aCBub24gYG51bGxgIHZhbHVlIGluIGNhc2Ugb2YgZXJyb3JcbiAgcmVtb3ZlT2JqZWN0KGJ1Y2tldE5hbWUsIG9iamVjdE5hbWUsIHJlbW92ZU9wdHMgPSB7fSwgY2IpIHtcbiAgICBpZiAoIWlzVmFsaWRCdWNrZXROYW1lKGJ1Y2tldE5hbWUpKSB7XG4gICAgICB0aHJvdyBuZXcgZXJyb3JzLkludmFsaWRCdWNrZXROYW1lRXJyb3IoJ0ludmFsaWQgYnVja2V0IG5hbWU6ICcgKyBidWNrZXROYW1lKVxuICAgIH1cbiAgICBpZiAoIWlzVmFsaWRPYmplY3ROYW1lKG9iamVjdE5hbWUpKSB7XG4gICAgICB0aHJvdyBuZXcgZXJyb3JzLkludmFsaWRPYmplY3ROYW1lRXJyb3IoYEludmFsaWQgb2JqZWN0IG5hbWU6ICR7b2JqZWN0TmFtZX1gKVxuICAgIH1cbiAgICAvLyBiYWNrd2FyZCBjb21wYXRpYmlsaXR5XG4gICAgaWYgKGlzRnVuY3Rpb24ocmVtb3ZlT3B0cykpIHtcbiAgICAgIGNiID0gcmVtb3ZlT3B0c1xuICAgICAgcmVtb3ZlT3B0cyA9IHt9XG4gICAgfVxuXG4gICAgaWYgKCFpc09iamVjdChyZW1vdmVPcHRzKSkge1xuICAgICAgdGhyb3cgbmV3IGVycm9ycy5JbnZhbGlkQXJndW1lbnRFcnJvcigncmVtb3ZlT3B0cyBzaG91bGQgYmUgb2YgdHlwZSBcIm9iamVjdFwiJylcbiAgICB9XG4gICAgaWYgKCFpc0Z1bmN0aW9uKGNiKSkge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignY2FsbGJhY2sgc2hvdWxkIGJlIG9mIHR5cGUgXCJmdW5jdGlvblwiJylcbiAgICB9XG4gICAgY29uc3QgbWV0aG9kID0gJ0RFTEVURSdcbiAgICBjb25zdCBxdWVyeVBhcmFtcyA9IHt9XG5cbiAgICBpZiAocmVtb3ZlT3B0cy52ZXJzaW9uSWQpIHtcbiAgICAgIHF1ZXJ5UGFyYW1zLnZlcnNpb25JZCA9IGAke3JlbW92ZU9wdHMudmVyc2lvbklkfWBcbiAgICB9XG4gICAgY29uc3QgaGVhZGVycyA9IHt9XG4gICAgaWYgKHJlbW92ZU9wdHMuZ292ZXJuYW5jZUJ5cGFzcykge1xuICAgICAgaGVhZGVyc1snWC1BbXotQnlwYXNzLUdvdmVybmFuY2UtUmV0ZW50aW9uJ10gPSB0cnVlXG4gICAgfVxuICAgIGlmIChyZW1vdmVPcHRzLmZvcmNlRGVsZXRlKSB7XG4gICAgICBoZWFkZXJzWyd4LW1pbmlvLWZvcmNlLWRlbGV0ZSddID0gdHJ1ZVxuICAgIH1cblxuICAgIGNvbnN0IHF1ZXJ5ID0gcXVlcnlzdHJpbmcuc3RyaW5naWZ5KHF1ZXJ5UGFyYW1zKVxuXG4gICAgbGV0IHJlcXVlc3RPcHRpb25zID0geyBtZXRob2QsIGJ1Y2tldE5hbWUsIG9iamVjdE5hbWUsIGhlYWRlcnMgfVxuICAgIGlmIChxdWVyeSkge1xuICAgICAgcmVxdWVzdE9wdGlvbnNbJ3F1ZXJ5J10gPSBxdWVyeVxuICAgIH1cblxuICAgIHRoaXMubWFrZVJlcXVlc3QocmVxdWVzdE9wdGlvbnMsICcnLCBbMjAwLCAyMDRdLCAnJywgZmFsc2UsIGNiKVxuICB9XG5cbiAgLy8gUmVtb3ZlIGFsbCB0aGUgb2JqZWN0cyByZXNpZGluZyBpbiB0aGUgb2JqZWN0c0xpc3QuXG4gIC8vXG4gIC8vIF9fQXJndW1lbnRzX19cbiAgLy8gKiBgYnVja2V0TmFtZWAgX3N0cmluZ186IG5hbWUgb2YgdGhlIGJ1Y2tldFxuICAvLyAqIGBvYmplY3RzTGlzdGAgX2FycmF5XzogYXJyYXkgb2Ygb2JqZWN0cyBvZiBvbmUgb2YgdGhlIGZvbGxvd2luZzpcbiAgLy8gKiAgICAgICAgIExpc3Qgb2YgT2JqZWN0IG5hbWVzIGFzIGFycmF5IG9mIHN0cmluZ3Mgd2hpY2ggYXJlIG9iamVjdCBrZXlzOiAgWydvYmplY3RuYW1lMScsJ29iamVjdG5hbWUyJ11cbiAgLy8gKiAgICAgICAgIExpc3Qgb2YgT2JqZWN0IG5hbWUgYW5kIHZlcnNpb25JZCBhcyBhbiBvYmplY3Q6ICBbe25hbWU6XCJvYmplY3RuYW1lXCIsdmVyc2lvbklkOlwibXktdmVyc2lvbi1pZFwifV1cblxuICByZW1vdmVPYmplY3RzKGJ1Y2tldE5hbWUsIG9iamVjdHNMaXN0LCBjYikge1xuICAgIGlmICghaXNWYWxpZEJ1Y2tldE5hbWUoYnVja2V0TmFtZSkpIHtcbiAgICAgIHRocm93IG5ldyBlcnJvcnMuSW52YWxpZEJ1Y2tldE5hbWVFcnJvcignSW52YWxpZCBidWNrZXQgbmFtZTogJyArIGJ1Y2tldE5hbWUpXG4gICAgfVxuICAgIGlmICghQXJyYXkuaXNBcnJheShvYmplY3RzTGlzdCkpIHtcbiAgICAgIHRocm93IG5ldyBlcnJvcnMuSW52YWxpZEFyZ3VtZW50RXJyb3IoJ29iamVjdHNMaXN0IHNob3VsZCBiZSBhIGxpc3QnKVxuICAgIH1cbiAgICBpZiAoIWlzRnVuY3Rpb24oY2IpKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdjYWxsYmFjayBzaG91bGQgYmUgb2YgdHlwZSBcImZ1bmN0aW9uXCInKVxuICAgIH1cblxuICAgIGNvbnN0IG1heEVudHJpZXMgPSAxMDAwXG4gICAgY29uc3QgcXVlcnkgPSAnZGVsZXRlJ1xuICAgIGNvbnN0IG1ldGhvZCA9ICdQT1NUJ1xuXG4gICAgbGV0IHJlc3VsdCA9IG9iamVjdHNMaXN0LnJlZHVjZShcbiAgICAgIChyZXN1bHQsIGVudHJ5KSA9PiB7XG4gICAgICAgIHJlc3VsdC5saXN0LnB1c2goZW50cnkpXG4gICAgICAgIGlmIChyZXN1bHQubGlzdC5sZW5ndGggPT09IG1heEVudHJpZXMpIHtcbiAgICAgICAgICByZXN1bHQubGlzdE9mTGlzdC5wdXNoKHJlc3VsdC5saXN0KVxuICAgICAgICAgIHJlc3VsdC5saXN0ID0gW11cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gcmVzdWx0XG4gICAgICB9LFxuICAgICAgeyBsaXN0T2ZMaXN0OiBbXSwgbGlzdDogW10gfSxcbiAgICApXG5cbiAgICBpZiAocmVzdWx0Lmxpc3QubGVuZ3RoID4gMCkge1xuICAgICAgcmVzdWx0Lmxpc3RPZkxpc3QucHVzaChyZXN1bHQubGlzdClcbiAgICB9XG5cbiAgICBjb25zdCBlbmNvZGVyID0gbmV3IFRleHRFbmNvZGVyKClcbiAgICBjb25zdCBiYXRjaFJlc3VsdHMgPSBbXVxuXG4gICAgYXN5bmMuZWFjaFNlcmllcyhcbiAgICAgIHJlc3VsdC5saXN0T2ZMaXN0LFxuICAgICAgKGxpc3QsIGJhdGNoQ2IpID0+IHtcbiAgICAgICAgdmFyIG9iamVjdHMgPSBbXVxuICAgICAgICBsaXN0LmZvckVhY2goZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgICAgaWYgKGlzT2JqZWN0KHZhbHVlKSkge1xuICAgICAgICAgICAgb2JqZWN0cy5wdXNoKHsgS2V5OiB2YWx1ZS5uYW1lLCBWZXJzaW9uSWQ6IHZhbHVlLnZlcnNpb25JZCB9KVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBvYmplY3RzLnB1c2goeyBLZXk6IHZhbHVlIH0pXG4gICAgICAgICAgfVxuICAgICAgICB9KVxuICAgICAgICBsZXQgZGVsZXRlT2JqZWN0cyA9IHsgRGVsZXRlOiB7IFF1aWV0OiB0cnVlLCBPYmplY3Q6IG9iamVjdHMgfSB9XG4gICAgICAgIGNvbnN0IGJ1aWxkZXIgPSBuZXcgeG1sMmpzLkJ1aWxkZXIoeyBoZWFkbGVzczogdHJ1ZSB9KVxuICAgICAgICBsZXQgcGF5bG9hZCA9IGJ1aWxkZXIuYnVpbGRPYmplY3QoZGVsZXRlT2JqZWN0cylcbiAgICAgICAgcGF5bG9hZCA9IGVuY29kZXIuZW5jb2RlKHBheWxvYWQpXG4gICAgICAgIGNvbnN0IGhlYWRlcnMgPSB7fVxuXG4gICAgICAgIGhlYWRlcnNbJ0NvbnRlbnQtTUQ1J10gPSB0b01kNShwYXlsb2FkKVxuXG4gICAgICAgIGxldCByZW1vdmVPYmplY3RzUmVzdWx0XG4gICAgICAgIHRoaXMubWFrZVJlcXVlc3QoeyBtZXRob2QsIGJ1Y2tldE5hbWUsIHF1ZXJ5LCBoZWFkZXJzIH0sIHBheWxvYWQsIFsyMDBdLCAnJywgdHJ1ZSwgKGUsIHJlc3BvbnNlKSA9PiB7XG4gICAgICAgICAgaWYgKGUpIHtcbiAgICAgICAgICAgIHJldHVybiBiYXRjaENiKGUpXG4gICAgICAgICAgfVxuICAgICAgICAgIHBpcGVzZXR1cChyZXNwb25zZSwgdHJhbnNmb3JtZXJzLnJlbW92ZU9iamVjdHNUcmFuc2Zvcm1lcigpKVxuICAgICAgICAgICAgLm9uKCdkYXRhJywgKGRhdGEpID0+IHtcbiAgICAgICAgICAgICAgcmVtb3ZlT2JqZWN0c1Jlc3VsdCA9IGRhdGFcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAub24oJ2Vycm9yJywgKGUpID0+IHtcbiAgICAgICAgICAgICAgcmV0dXJuIGJhdGNoQ2IoZSwgbnVsbClcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAub24oJ2VuZCcsICgpID0+IHtcbiAgICAgICAgICAgICAgYmF0Y2hSZXN1bHRzLnB1c2gocmVtb3ZlT2JqZWN0c1Jlc3VsdClcbiAgICAgICAgICAgICAgcmV0dXJuIGJhdGNoQ2IobnVsbCwgcmVtb3ZlT2JqZWN0c1Jlc3VsdClcbiAgICAgICAgICAgIH0pXG4gICAgICAgIH0pXG4gICAgICB9LFxuICAgICAgKCkgPT4ge1xuICAgICAgICBjYihudWxsLCBfLmZsYXR0ZW4oYmF0Y2hSZXN1bHRzKSlcbiAgICAgIH0sXG4gICAgKVxuICB9XG5cbiAgLy8gR2V0IHRoZSBwb2xpY3kgb24gYSBidWNrZXQgb3IgYW4gb2JqZWN0IHByZWZpeC5cbiAgLy9cbiAgLy8gX19Bcmd1bWVudHNfX1xuICAvLyAqIGBidWNrZXROYW1lYCBfc3RyaW5nXzogbmFtZSBvZiB0aGUgYnVja2V0XG4gIC8vICogYGNhbGxiYWNrKGVyciwgcG9saWN5KWAgX2Z1bmN0aW9uXzogY2FsbGJhY2sgZnVuY3Rpb25cbiAgZ2V0QnVja2V0UG9saWN5KGJ1Y2tldE5hbWUsIGNiKSB7XG4gICAgLy8gVmFsaWRhdGUgYXJndW1lbnRzLlxuICAgIGlmICghaXNWYWxpZEJ1Y2tldE5hbWUoYnVja2V0TmFtZSkpIHtcbiAgICAgIHRocm93IG5ldyBlcnJvcnMuSW52YWxpZEJ1Y2tldE5hbWVFcnJvcihgSW52YWxpZCBidWNrZXQgbmFtZTogJHtidWNrZXROYW1lfWApXG4gICAgfVxuICAgIGlmICghaXNGdW5jdGlvbihjYikpIHtcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ2NhbGxiYWNrIHNob3VsZCBiZSBvZiB0eXBlIFwiZnVuY3Rpb25cIicpXG4gICAgfVxuXG4gICAgbGV0IG1ldGhvZCA9ICdHRVQnXG4gICAgbGV0IHF1ZXJ5ID0gJ3BvbGljeSdcbiAgICB0aGlzLm1ha2VSZXF1ZXN0KHsgbWV0aG9kLCBidWNrZXROYW1lLCBxdWVyeSB9LCAnJywgWzIwMF0sICcnLCB0cnVlLCAoZSwgcmVzcG9uc2UpID0+IHtcbiAgICAgIGlmIChlKSB7XG4gICAgICAgIHJldHVybiBjYihlKVxuICAgICAgfVxuXG4gICAgICBsZXQgcG9saWN5ID0gQnVmZmVyLmZyb20oJycpXG4gICAgICBwaXBlc2V0dXAocmVzcG9uc2UsIHRyYW5zZm9ybWVycy5nZXRDb25jYXRlcigpKVxuICAgICAgICAub24oJ2RhdGEnLCAoZGF0YSkgPT4gKHBvbGljeSA9IGRhdGEpKVxuICAgICAgICAub24oJ2Vycm9yJywgY2IpXG4gICAgICAgIC5vbignZW5kJywgKCkgPT4ge1xuICAgICAgICAgIGNiKG51bGwsIHBvbGljeS50b1N0cmluZygpKVxuICAgICAgICB9KVxuICAgIH0pXG4gIH1cblxuICAvLyBTZXQgdGhlIHBvbGljeSBvbiBhIGJ1Y2tldCBvciBhbiBvYmplY3QgcHJlZml4LlxuICAvL1xuICAvLyBfX0FyZ3VtZW50c19fXG4gIC8vICogYGJ1Y2tldE5hbWVgIF9zdHJpbmdfOiBuYW1lIG9mIHRoZSBidWNrZXRcbiAgLy8gKiBgYnVja2V0UG9saWN5YCBfc3RyaW5nXzogYnVja2V0IHBvbGljeSAoSlNPTiBzdHJpbmdpZnknZWQpXG4gIC8vICogYGNhbGxiYWNrKGVycilgIF9mdW5jdGlvbl86IGNhbGxiYWNrIGZ1bmN0aW9uXG4gIHNldEJ1Y2tldFBvbGljeShidWNrZXROYW1lLCBwb2xpY3ksIGNiKSB7XG4gICAgLy8gVmFsaWRhdGUgYXJndW1lbnRzLlxuICAgIGlmICghaXNWYWxpZEJ1Y2tldE5hbWUoYnVja2V0TmFtZSkpIHtcbiAgICAgIHRocm93IG5ldyBlcnJvcnMuSW52YWxpZEJ1Y2tldE5hbWVFcnJvcihgSW52YWxpZCBidWNrZXQgbmFtZTogJHtidWNrZXROYW1lfWApXG4gICAgfVxuICAgIGlmICghaXNTdHJpbmcocG9saWN5KSkge1xuICAgICAgdGhyb3cgbmV3IGVycm9ycy5JbnZhbGlkQnVja2V0UG9saWN5RXJyb3IoYEludmFsaWQgYnVja2V0IHBvbGljeTogJHtwb2xpY3l9IC0gbXVzdCBiZSBcInN0cmluZ1wiYClcbiAgICB9XG4gICAgaWYgKCFpc0Z1bmN0aW9uKGNiKSkge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignY2FsbGJhY2sgc2hvdWxkIGJlIG9mIHR5cGUgXCJmdW5jdGlvblwiJylcbiAgICB9XG5cbiAgICBsZXQgbWV0aG9kID0gJ0RFTEVURSdcbiAgICBsZXQgcXVlcnkgPSAncG9saWN5J1xuXG4gICAgaWYgKHBvbGljeSkge1xuICAgICAgbWV0aG9kID0gJ1BVVCdcbiAgICB9XG5cbiAgICB0aGlzLm1ha2VSZXF1ZXN0KHsgbWV0aG9kLCBidWNrZXROYW1lLCBxdWVyeSB9LCBwb2xpY3ksIFsyMDRdLCAnJywgZmFsc2UsIGNiKVxuICB9XG5cbiAgLy8gR2VuZXJhdGUgYSBnZW5lcmljIHByZXNpZ25lZCBVUkwgd2hpY2ggY2FuIGJlXG4gIC8vIHVzZWQgZm9yIEhUVFAgbWV0aG9kcyBHRVQsIFBVVCwgSEVBRCBhbmQgREVMRVRFXG4gIC8vXG4gIC8vIF9fQXJndW1lbnRzX19cbiAgLy8gKiBgbWV0aG9kYCBfc3RyaW5nXzogbmFtZSBvZiB0aGUgSFRUUCBtZXRob2RcbiAgLy8gKiBgYnVja2V0TmFtZWAgX3N0cmluZ186IG5hbWUgb2YgdGhlIGJ1Y2tldFxuICAvLyAqIGBvYmplY3ROYW1lYCBfc3RyaW5nXzogbmFtZSBvZiB0aGUgb2JqZWN0XG4gIC8vICogYGV4cGlyeWAgX251bWJlcl86IGV4cGlyeSBpbiBzZWNvbmRzIChvcHRpb25hbCwgZGVmYXVsdCA3IGRheXMpXG4gIC8vICogYHJlcVBhcmFtc2AgX29iamVjdF86IHJlcXVlc3QgcGFyYW1ldGVycyAob3B0aW9uYWwpIGUuZyB7dmVyc2lvbklkOlwiMTBmYTk5NDYtM2Y2NC00MTM3LWE1OGYtODg4MDY1YzA3MzJlXCJ9XG4gIC8vICogYHJlcXVlc3REYXRlYCBfRGF0ZV86IEEgZGF0ZSBvYmplY3QsIHRoZSB1cmwgd2lsbCBiZSBpc3N1ZWQgYXQgKG9wdGlvbmFsKVxuICBwcmVzaWduZWRVcmwobWV0aG9kLCBidWNrZXROYW1lLCBvYmplY3ROYW1lLCBleHBpcmVzLCByZXFQYXJhbXMsIHJlcXVlc3REYXRlLCBjYikge1xuICAgIGlmICh0aGlzLmFub255bW91cykge1xuICAgICAgdGhyb3cgbmV3IGVycm9ycy5Bbm9ueW1vdXNSZXF1ZXN0RXJyb3IoJ1ByZXNpZ25lZCAnICsgbWV0aG9kICsgJyB1cmwgY2Fubm90IGJlIGdlbmVyYXRlZCBmb3IgYW5vbnltb3VzIHJlcXVlc3RzJylcbiAgICB9XG4gICAgaWYgKGlzRnVuY3Rpb24ocmVxdWVzdERhdGUpKSB7XG4gICAgICBjYiA9IHJlcXVlc3REYXRlXG4gICAgICByZXF1ZXN0RGF0ZSA9IG5ldyBEYXRlKClcbiAgICB9XG4gICAgaWYgKGlzRnVuY3Rpb24ocmVxUGFyYW1zKSkge1xuICAgICAgY2IgPSByZXFQYXJhbXNcbiAgICAgIHJlcVBhcmFtcyA9IHt9XG4gICAgICByZXF1ZXN0RGF0ZSA9IG5ldyBEYXRlKClcbiAgICB9XG4gICAgaWYgKGlzRnVuY3Rpb24oZXhwaXJlcykpIHtcbiAgICAgIGNiID0gZXhwaXJlc1xuICAgICAgcmVxUGFyYW1zID0ge31cbiAgICAgIGV4cGlyZXMgPSAyNCAqIDYwICogNjAgKiA3IC8vIDcgZGF5cyBpbiBzZWNvbmRzXG4gICAgICByZXF1ZXN0RGF0ZSA9IG5ldyBEYXRlKClcbiAgICB9XG4gICAgaWYgKCFpc051bWJlcihleHBpcmVzKSkge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignZXhwaXJlcyBzaG91bGQgYmUgb2YgdHlwZSBcIm51bWJlclwiJylcbiAgICB9XG4gICAgaWYgKCFpc09iamVjdChyZXFQYXJhbXMpKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdyZXFQYXJhbXMgc2hvdWxkIGJlIG9mIHR5cGUgXCJvYmplY3RcIicpXG4gICAgfVxuICAgIGlmICghaXNWYWxpZERhdGUocmVxdWVzdERhdGUpKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdyZXF1ZXN0RGF0ZSBzaG91bGQgYmUgb2YgdHlwZSBcIkRhdGVcIiBhbmQgdmFsaWQnKVxuICAgIH1cbiAgICBpZiAoIWlzRnVuY3Rpb24oY2IpKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdjYWxsYmFjayBzaG91bGQgYmUgb2YgdHlwZSBcImZ1bmN0aW9uXCInKVxuICAgIH1cbiAgICB2YXIgcXVlcnkgPSBxdWVyeXN0cmluZy5zdHJpbmdpZnkocmVxUGFyYW1zKVxuICAgIHRoaXMuZ2V0QnVja2V0UmVnaW9uKGJ1Y2tldE5hbWUsIChlLCByZWdpb24pID0+IHtcbiAgICAgIGlmIChlKSB7XG4gICAgICAgIHJldHVybiBjYihlKVxuICAgICAgfVxuICAgICAgLy8gVGhpcyBzdGF0ZW1lbnQgaXMgYWRkZWQgdG8gZW5zdXJlIHRoYXQgd2Ugc2VuZCBlcnJvciB0aHJvdWdoXG4gICAgICAvLyBjYWxsYmFjayBvbiBwcmVzaWduIGZhaWx1cmUuXG4gICAgICB2YXIgdXJsXG4gICAgICB2YXIgcmVxT3B0aW9ucyA9IHRoaXMuZ2V0UmVxdWVzdE9wdGlvbnMoeyBtZXRob2QsIHJlZ2lvbiwgYnVja2V0TmFtZSwgb2JqZWN0TmFtZSwgcXVlcnkgfSlcblxuICAgICAgdGhpcy5jaGVja0FuZFJlZnJlc2hDcmVkcygpXG4gICAgICB0cnkge1xuICAgICAgICB1cmwgPSBwcmVzaWduU2lnbmF0dXJlVjQoXG4gICAgICAgICAgcmVxT3B0aW9ucyxcbiAgICAgICAgICB0aGlzLmFjY2Vzc0tleSxcbiAgICAgICAgICB0aGlzLnNlY3JldEtleSxcbiAgICAgICAgICB0aGlzLnNlc3Npb25Ub2tlbixcbiAgICAgICAgICByZWdpb24sXG4gICAgICAgICAgcmVxdWVzdERhdGUsXG4gICAgICAgICAgZXhwaXJlcyxcbiAgICAgICAgKVxuICAgICAgfSBjYXRjaCAocGUpIHtcbiAgICAgICAgcmV0dXJuIGNiKHBlKVxuICAgICAgfVxuICAgICAgY2IobnVsbCwgdXJsKVxuICAgIH0pXG4gIH1cblxuICAvLyBHZW5lcmF0ZSBhIHByZXNpZ25lZCBVUkwgZm9yIEdFVFxuICAvL1xuICAvLyBfX0FyZ3VtZW50c19fXG4gIC8vICogYGJ1Y2tldE5hbWVgIF9zdHJpbmdfOiBuYW1lIG9mIHRoZSBidWNrZXRcbiAgLy8gKiBgb2JqZWN0TmFtZWAgX3N0cmluZ186IG5hbWUgb2YgdGhlIG9iamVjdFxuICAvLyAqIGBleHBpcnlgIF9udW1iZXJfOiBleHBpcnkgaW4gc2Vjb25kcyAob3B0aW9uYWwsIGRlZmF1bHQgNyBkYXlzKVxuICAvLyAqIGByZXNwSGVhZGVyc2AgX29iamVjdF86IHJlc3BvbnNlIGhlYWRlcnMgdG8gb3ZlcnJpZGUgb3IgcmVxdWVzdCBwYXJhbXMgZm9yIHF1ZXJ5IChvcHRpb25hbCkgZS5nIHt2ZXJzaW9uSWQ6XCIxMGZhOTk0Ni0zZjY0LTQxMzctYTU4Zi04ODgwNjVjMDczMmVcIn1cbiAgLy8gKiBgcmVxdWVzdERhdGVgIF9EYXRlXzogQSBkYXRlIG9iamVjdCwgdGhlIHVybCB3aWxsIGJlIGlzc3VlZCBhdCAob3B0aW9uYWwpXG4gIHByZXNpZ25lZEdldE9iamVjdChidWNrZXROYW1lLCBvYmplY3ROYW1lLCBleHBpcmVzLCByZXNwSGVhZGVycywgcmVxdWVzdERhdGUsIGNiKSB7XG4gICAgaWYgKCFpc1ZhbGlkQnVja2V0TmFtZShidWNrZXROYW1lKSkge1xuICAgICAgdGhyb3cgbmV3IGVycm9ycy5JbnZhbGlkQnVja2V0TmFtZUVycm9yKCdJbnZhbGlkIGJ1Y2tldCBuYW1lOiAnICsgYnVja2V0TmFtZSlcbiAgICB9XG4gICAgaWYgKCFpc1ZhbGlkT2JqZWN0TmFtZShvYmplY3ROYW1lKSkge1xuICAgICAgdGhyb3cgbmV3IGVycm9ycy5JbnZhbGlkT2JqZWN0TmFtZUVycm9yKGBJbnZhbGlkIG9iamVjdCBuYW1lOiAke29iamVjdE5hbWV9YClcbiAgICB9XG5cbiAgICBpZiAoaXNGdW5jdGlvbihyZXNwSGVhZGVycykpIHtcbiAgICAgIGNiID0gcmVzcEhlYWRlcnNcbiAgICAgIHJlc3BIZWFkZXJzID0ge31cbiAgICAgIHJlcXVlc3REYXRlID0gbmV3IERhdGUoKVxuICAgIH1cblxuICAgIHZhciB2YWxpZFJlc3BIZWFkZXJzID0gW1xuICAgICAgJ3Jlc3BvbnNlLWNvbnRlbnQtdHlwZScsXG4gICAgICAncmVzcG9uc2UtY29udGVudC1sYW5ndWFnZScsXG4gICAgICAncmVzcG9uc2UtZXhwaXJlcycsXG4gICAgICAncmVzcG9uc2UtY2FjaGUtY29udHJvbCcsXG4gICAgICAncmVzcG9uc2UtY29udGVudC1kaXNwb3NpdGlvbicsXG4gICAgICAncmVzcG9uc2UtY29udGVudC1lbmNvZGluZycsXG4gICAgXVxuICAgIHZhbGlkUmVzcEhlYWRlcnMuZm9yRWFjaCgoaGVhZGVyKSA9PiB7XG4gICAgICBpZiAocmVzcEhlYWRlcnMgIT09IHVuZGVmaW5lZCAmJiByZXNwSGVhZGVyc1toZWFkZXJdICE9PSB1bmRlZmluZWQgJiYgIWlzU3RyaW5nKHJlc3BIZWFkZXJzW2hlYWRlcl0pKSB7XG4gICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoYHJlc3BvbnNlIGhlYWRlciAke2hlYWRlcn0gc2hvdWxkIGJlIG9mIHR5cGUgXCJzdHJpbmdcImApXG4gICAgICB9XG4gICAgfSlcbiAgICByZXR1cm4gdGhpcy5wcmVzaWduZWRVcmwoJ0dFVCcsIGJ1Y2tldE5hbWUsIG9iamVjdE5hbWUsIGV4cGlyZXMsIHJlc3BIZWFkZXJzLCByZXF1ZXN0RGF0ZSwgY2IpXG4gIH1cblxuICAvLyBHZW5lcmF0ZSBhIHByZXNpZ25lZCBVUkwgZm9yIFBVVC4gVXNpbmcgdGhpcyBVUkwsIHRoZSBicm93c2VyIGNhbiB1cGxvYWQgdG8gUzMgb25seSB3aXRoIHRoZSBzcGVjaWZpZWQgb2JqZWN0IG5hbWUuXG4gIC8vXG4gIC8vIF9fQXJndW1lbnRzX19cbiAgLy8gKiBgYnVja2V0TmFtZWAgX3N0cmluZ186IG5hbWUgb2YgdGhlIGJ1Y2tldFxuICAvLyAqIGBvYmplY3ROYW1lYCBfc3RyaW5nXzogbmFtZSBvZiB0aGUgb2JqZWN0XG4gIC8vICogYGV4cGlyeWAgX251bWJlcl86IGV4cGlyeSBpbiBzZWNvbmRzIChvcHRpb25hbCwgZGVmYXVsdCA3IGRheXMpXG4gIHByZXNpZ25lZFB1dE9iamVjdChidWNrZXROYW1lLCBvYmplY3ROYW1lLCBleHBpcmVzLCBjYikge1xuICAgIGlmICghaXNWYWxpZEJ1Y2tldE5hbWUoYnVja2V0TmFtZSkpIHtcbiAgICAgIHRocm93IG5ldyBlcnJvcnMuSW52YWxpZEJ1Y2tldE5hbWVFcnJvcihgSW52YWxpZCBidWNrZXQgbmFtZTogJHtidWNrZXROYW1lfWApXG4gICAgfVxuICAgIGlmICghaXNWYWxpZE9iamVjdE5hbWUob2JqZWN0TmFtZSkpIHtcbiAgICAgIHRocm93IG5ldyBlcnJvcnMuSW52YWxpZE9iamVjdE5hbWVFcnJvcihgSW52YWxpZCBvYmplY3QgbmFtZTogJHtvYmplY3ROYW1lfWApXG4gICAgfVxuICAgIHJldHVybiB0aGlzLnByZXNpZ25lZFVybCgnUFVUJywgYnVja2V0TmFtZSwgb2JqZWN0TmFtZSwgZXhwaXJlcywgY2IpXG4gIH1cblxuICAvLyByZXR1cm4gUG9zdFBvbGljeSBvYmplY3RcbiAgbmV3UG9zdFBvbGljeSgpIHtcbiAgICByZXR1cm4gbmV3IFBvc3RQb2xpY3koKVxuICB9XG5cbiAgLy8gcHJlc2lnbmVkUG9zdFBvbGljeSBjYW4gYmUgdXNlZCBpbiBzaXR1YXRpb25zIHdoZXJlIHdlIHdhbnQgbW9yZSBjb250cm9sIG9uIHRoZSB1cGxvYWQgdGhhbiB3aGF0XG4gIC8vIHByZXNpZ25lZFB1dE9iamVjdCgpIHByb3ZpZGVzLiBpLmUgVXNpbmcgcHJlc2lnbmVkUG9zdFBvbGljeSB3ZSB3aWxsIGJlIGFibGUgdG8gcHV0IHBvbGljeSByZXN0cmljdGlvbnNcbiAgLy8gb24gdGhlIG9iamVjdCdzIGBuYW1lYCBgYnVja2V0YCBgZXhwaXJ5YCBgQ29udGVudC1UeXBlYCBgQ29udGVudC1EaXNwb3NpdGlvbmAgYG1ldGFEYXRhYFxuICBwcmVzaWduZWRQb3N0UG9saWN5KHBvc3RQb2xpY3ksIGNiKSB7XG4gICAgaWYgKHRoaXMuYW5vbnltb3VzKSB7XG4gICAgICB0aHJvdyBuZXcgZXJyb3JzLkFub255bW91c1JlcXVlc3RFcnJvcignUHJlc2lnbmVkIFBPU1QgcG9saWN5IGNhbm5vdCBiZSBnZW5lcmF0ZWQgZm9yIGFub255bW91cyByZXF1ZXN0cycpXG4gICAgfVxuICAgIGlmICghaXNPYmplY3QocG9zdFBvbGljeSkpIHtcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ3Bvc3RQb2xpY3kgc2hvdWxkIGJlIG9mIHR5cGUgXCJvYmplY3RcIicpXG4gICAgfVxuICAgIGlmICghaXNGdW5jdGlvbihjYikpIHtcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ2NiIHNob3VsZCBiZSBvZiB0eXBlIFwiZnVuY3Rpb25cIicpXG4gICAgfVxuICAgIHRoaXMuZ2V0QnVja2V0UmVnaW9uKHBvc3RQb2xpY3kuZm9ybURhdGEuYnVja2V0LCAoZSwgcmVnaW9uKSA9PiB7XG4gICAgICBpZiAoZSkge1xuICAgICAgICByZXR1cm4gY2IoZSlcbiAgICAgIH1cbiAgICAgIHZhciBkYXRlID0gbmV3IERhdGUoKVxuICAgICAgdmFyIGRhdGVTdHIgPSBtYWtlRGF0ZUxvbmcoZGF0ZSlcblxuICAgICAgdGhpcy5jaGVja0FuZFJlZnJlc2hDcmVkcygpXG5cbiAgICAgIGlmICghcG9zdFBvbGljeS5wb2xpY3kuZXhwaXJhdGlvbikge1xuICAgICAgICAvLyAnZXhwaXJhdGlvbicgaXMgbWFuZGF0b3J5IGZpZWxkIGZvciBTMy5cbiAgICAgICAgLy8gU2V0IGRlZmF1bHQgZXhwaXJhdGlvbiBkYXRlIG9mIDcgZGF5cy5cbiAgICAgICAgdmFyIGV4cGlyZXMgPSBuZXcgRGF0ZSgpXG4gICAgICAgIGV4cGlyZXMuc2V0U2Vjb25kcygyNCAqIDYwICogNjAgKiA3KVxuICAgICAgICBwb3N0UG9saWN5LnNldEV4cGlyZXMoZXhwaXJlcylcbiAgICAgIH1cblxuICAgICAgcG9zdFBvbGljeS5wb2xpY3kuY29uZGl0aW9ucy5wdXNoKFsnZXEnLCAnJHgtYW16LWRhdGUnLCBkYXRlU3RyXSlcbiAgICAgIHBvc3RQb2xpY3kuZm9ybURhdGFbJ3gtYW16LWRhdGUnXSA9IGRhdGVTdHJcblxuICAgICAgcG9zdFBvbGljeS5wb2xpY3kuY29uZGl0aW9ucy5wdXNoKFsnZXEnLCAnJHgtYW16LWFsZ29yaXRobScsICdBV1M0LUhNQUMtU0hBMjU2J10pXG4gICAgICBwb3N0UG9saWN5LmZvcm1EYXRhWyd4LWFtei1hbGdvcml0aG0nXSA9ICdBV1M0LUhNQUMtU0hBMjU2J1xuXG4gICAgICBwb3N0UG9saWN5LnBvbGljeS5jb25kaXRpb25zLnB1c2goWydlcScsICckeC1hbXotY3JlZGVudGlhbCcsIHRoaXMuYWNjZXNzS2V5ICsgJy8nICsgZ2V0U2NvcGUocmVnaW9uLCBkYXRlKV0pXG4gICAgICBwb3N0UG9saWN5LmZvcm1EYXRhWyd4LWFtei1jcmVkZW50aWFsJ10gPSB0aGlzLmFjY2Vzc0tleSArICcvJyArIGdldFNjb3BlKHJlZ2lvbiwgZGF0ZSlcblxuICAgICAgaWYgKHRoaXMuc2Vzc2lvblRva2VuKSB7XG4gICAgICAgIHBvc3RQb2xpY3kucG9saWN5LmNvbmRpdGlvbnMucHVzaChbJ2VxJywgJyR4LWFtei1zZWN1cml0eS10b2tlbicsIHRoaXMuc2Vzc2lvblRva2VuXSlcbiAgICAgICAgcG9zdFBvbGljeS5mb3JtRGF0YVsneC1hbXotc2VjdXJpdHktdG9rZW4nXSA9IHRoaXMuc2Vzc2lvblRva2VuXG4gICAgICB9XG5cbiAgICAgIHZhciBwb2xpY3lCYXNlNjQgPSBCdWZmZXIuZnJvbShKU09OLnN0cmluZ2lmeShwb3N0UG9saWN5LnBvbGljeSkpLnRvU3RyaW5nKCdiYXNlNjQnKVxuXG4gICAgICBwb3N0UG9saWN5LmZvcm1EYXRhLnBvbGljeSA9IHBvbGljeUJhc2U2NFxuXG4gICAgICB2YXIgc2lnbmF0dXJlID0gcG9zdFByZXNpZ25TaWduYXR1cmVWNChyZWdpb24sIGRhdGUsIHRoaXMuc2VjcmV0S2V5LCBwb2xpY3lCYXNlNjQpXG5cbiAgICAgIHBvc3RQb2xpY3kuZm9ybURhdGFbJ3gtYW16LXNpZ25hdHVyZSddID0gc2lnbmF0dXJlXG4gICAgICB2YXIgb3B0cyA9IHt9XG4gICAgICBvcHRzLnJlZ2lvbiA9IHJlZ2lvblxuICAgICAgb3B0cy5idWNrZXROYW1lID0gcG9zdFBvbGljeS5mb3JtRGF0YS5idWNrZXRcbiAgICAgIHZhciByZXFPcHRpb25zID0gdGhpcy5nZXRSZXF1ZXN0T3B0aW9ucyhvcHRzKVxuICAgICAgdmFyIHBvcnRTdHIgPSB0aGlzLnBvcnQgPT0gODAgfHwgdGhpcy5wb3J0ID09PSA0NDMgPyAnJyA6IGA6JHt0aGlzLnBvcnQudG9TdHJpbmcoKX1gXG4gICAgICB2YXIgdXJsU3RyID0gYCR7cmVxT3B0aW9ucy5wcm90b2NvbH0vLyR7cmVxT3B0aW9ucy5ob3N0fSR7cG9ydFN0cn0ke3JlcU9wdGlvbnMucGF0aH1gXG4gICAgICBjYihudWxsLCB7IHBvc3RVUkw6IHVybFN0ciwgZm9ybURhdGE6IHBvc3RQb2xpY3kuZm9ybURhdGEgfSlcbiAgICB9KVxuICB9XG5cbiAgLy8gQ2FsbHMgaW1wbGVtZW50ZWQgYmVsb3cgYXJlIHJlbGF0ZWQgdG8gbXVsdGlwYXJ0LlxuXG4gIC8vIEluaXRpYXRlIGEgbmV3IG11bHRpcGFydCB1cGxvYWQuXG4gIGluaXRpYXRlTmV3TXVsdGlwYXJ0VXBsb2FkKGJ1Y2tldE5hbWUsIG9iamVjdE5hbWUsIG1ldGFEYXRhLCBjYikge1xuICAgIGlmICghaXNWYWxpZEJ1Y2tldE5hbWUoYnVja2V0TmFtZSkpIHtcbiAgICAgIHRocm93IG5ldyBlcnJvcnMuSW52YWxpZEJ1Y2tldE5hbWVFcnJvcignSW52YWxpZCBidWNrZXQgbmFtZTogJyArIGJ1Y2tldE5hbWUpXG4gICAgfVxuICAgIGlmICghaXNWYWxpZE9iamVjdE5hbWUob2JqZWN0TmFtZSkpIHtcbiAgICAgIHRocm93IG5ldyBlcnJvcnMuSW52YWxpZE9iamVjdE5hbWVFcnJvcihgSW52YWxpZCBvYmplY3QgbmFtZTogJHtvYmplY3ROYW1lfWApXG4gICAgfVxuICAgIGlmICghaXNPYmplY3QobWV0YURhdGEpKSB7XG4gICAgICB0aHJvdyBuZXcgZXJyb3JzLkludmFsaWRPYmplY3ROYW1lRXJyb3IoJ2NvbnRlbnRUeXBlIHNob3VsZCBiZSBvZiB0eXBlIFwib2JqZWN0XCInKVxuICAgIH1cbiAgICB2YXIgbWV0aG9kID0gJ1BPU1QnXG4gICAgbGV0IGhlYWRlcnMgPSBPYmplY3QuYXNzaWduKHt9LCBtZXRhRGF0YSlcbiAgICB2YXIgcXVlcnkgPSAndXBsb2FkcydcbiAgICB0aGlzLm1ha2VSZXF1ZXN0KHsgbWV0aG9kLCBidWNrZXROYW1lLCBvYmplY3ROYW1lLCBxdWVyeSwgaGVhZGVycyB9LCAnJywgWzIwMF0sICcnLCB0cnVlLCAoZSwgcmVzcG9uc2UpID0+IHtcbiAgICAgIGlmIChlKSB7XG4gICAgICAgIHJldHVybiBjYihlKVxuICAgICAgfVxuICAgICAgdmFyIHRyYW5zZm9ybWVyID0gdHJhbnNmb3JtZXJzLmdldEluaXRpYXRlTXVsdGlwYXJ0VHJhbnNmb3JtZXIoKVxuICAgICAgcGlwZXNldHVwKHJlc3BvbnNlLCB0cmFuc2Zvcm1lcilcbiAgICAgICAgLm9uKCdlcnJvcicsIChlKSA9PiBjYihlKSlcbiAgICAgICAgLm9uKCdkYXRhJywgKHVwbG9hZElkKSA9PiBjYihudWxsLCB1cGxvYWRJZCkpXG4gICAgfSlcbiAgfVxuXG4gIC8vIENvbXBsZXRlIHRoZSBtdWx0aXBhcnQgdXBsb2FkLiBBZnRlciBhbGwgdGhlIHBhcnRzIGFyZSB1cGxvYWRlZCBpc3N1aW5nXG4gIC8vIHRoaXMgY2FsbCB3aWxsIGFnZ3JlZ2F0ZSB0aGUgcGFydHMgb24gdGhlIHNlcnZlciBpbnRvIGEgc2luZ2xlIG9iamVjdC5cbiAgY29tcGxldGVNdWx0aXBhcnRVcGxvYWQoYnVja2V0TmFtZSwgb2JqZWN0TmFtZSwgdXBsb2FkSWQsIGV0YWdzLCBjYikge1xuICAgIGlmICghaXNWYWxpZEJ1Y2tldE5hbWUoYnVja2V0TmFtZSkpIHtcbiAgICAgIHRocm93IG5ldyBlcnJvcnMuSW52YWxpZEJ1Y2tldE5hbWVFcnJvcignSW52YWxpZCBidWNrZXQgbmFtZTogJyArIGJ1Y2tldE5hbWUpXG4gICAgfVxuICAgIGlmICghaXNWYWxpZE9iamVjdE5hbWUob2JqZWN0TmFtZSkpIHtcbiAgICAgIHRocm93IG5ldyBlcnJvcnMuSW52YWxpZE9iamVjdE5hbWVFcnJvcihgSW52YWxpZCBvYmplY3QgbmFtZTogJHtvYmplY3ROYW1lfWApXG4gICAgfVxuICAgIGlmICghaXNTdHJpbmcodXBsb2FkSWQpKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCd1cGxvYWRJZCBzaG91bGQgYmUgb2YgdHlwZSBcInN0cmluZ1wiJylcbiAgICB9XG4gICAgaWYgKCFpc09iamVjdChldGFncykpIHtcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ2V0YWdzIHNob3VsZCBiZSBvZiB0eXBlIFwiQXJyYXlcIicpXG4gICAgfVxuICAgIGlmICghaXNGdW5jdGlvbihjYikpIHtcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ2NiIHNob3VsZCBiZSBvZiB0eXBlIFwiZnVuY3Rpb25cIicpXG4gICAgfVxuXG4gICAgaWYgKCF1cGxvYWRJZCkge1xuICAgICAgdGhyb3cgbmV3IGVycm9ycy5JbnZhbGlkQXJndW1lbnRFcnJvcigndXBsb2FkSWQgY2Fubm90IGJlIGVtcHR5JylcbiAgICB9XG5cbiAgICB2YXIgbWV0aG9kID0gJ1BPU1QnXG4gICAgdmFyIHF1ZXJ5ID0gYHVwbG9hZElkPSR7dXJpRXNjYXBlKHVwbG9hZElkKX1gXG5cbiAgICB2YXIgcGFydHMgPSBbXVxuXG4gICAgZXRhZ3MuZm9yRWFjaCgoZWxlbWVudCkgPT4ge1xuICAgICAgcGFydHMucHVzaCh7XG4gICAgICAgIFBhcnQ6IFtcbiAgICAgICAgICB7XG4gICAgICAgICAgICBQYXJ0TnVtYmVyOiBlbGVtZW50LnBhcnQsXG4gICAgICAgICAgfSxcbiAgICAgICAgICB7XG4gICAgICAgICAgICBFVGFnOiBlbGVtZW50LmV0YWcsXG4gICAgICAgICAgfSxcbiAgICAgICAgXSxcbiAgICAgIH0pXG4gICAgfSlcblxuICAgIHZhciBwYXlsb2FkT2JqZWN0ID0geyBDb21wbGV0ZU11bHRpcGFydFVwbG9hZDogcGFydHMgfVxuICAgIHZhciBwYXlsb2FkID0gWG1sKHBheWxvYWRPYmplY3QpXG5cbiAgICB0aGlzLm1ha2VSZXF1ZXN0KHsgbWV0aG9kLCBidWNrZXROYW1lLCBvYmplY3ROYW1lLCBxdWVyeSB9LCBwYXlsb2FkLCBbMjAwXSwgJycsIHRydWUsIChlLCByZXNwb25zZSkgPT4ge1xuICAgICAgaWYgKGUpIHtcbiAgICAgICAgcmV0dXJuIGNiKGUpXG4gICAgICB9XG4gICAgICB2YXIgdHJhbnNmb3JtZXIgPSB0cmFuc2Zvcm1lcnMuZ2V0Q29tcGxldGVNdWx0aXBhcnRUcmFuc2Zvcm1lcigpXG4gICAgICBwaXBlc2V0dXAocmVzcG9uc2UsIHRyYW5zZm9ybWVyKVxuICAgICAgICAub24oJ2Vycm9yJywgKGUpID0+IGNiKGUpKVxuICAgICAgICAub24oJ2RhdGEnLCAocmVzdWx0KSA9PiB7XG4gICAgICAgICAgaWYgKHJlc3VsdC5lcnJDb2RlKSB7XG4gICAgICAgICAgICAvLyBNdWx0aXBhcnQgQ29tcGxldGUgQVBJIHJldHVybnMgYW4gZXJyb3IgWE1MIGFmdGVyIGEgMjAwIGh0dHAgc3RhdHVzXG4gICAgICAgICAgICBjYihuZXcgZXJyb3JzLlMzRXJyb3IocmVzdWx0LmVyck1lc3NhZ2UpKVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBjb25zdCBjb21wbGV0ZU11bHRpcGFydFJlc3VsdCA9IHtcbiAgICAgICAgICAgICAgZXRhZzogcmVzdWx0LmV0YWcsXG4gICAgICAgICAgICAgIHZlcnNpb25JZDogZ2V0VmVyc2lvbklkKHJlc3BvbnNlLmhlYWRlcnMpLFxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY2IobnVsbCwgY29tcGxldGVNdWx0aXBhcnRSZXN1bHQpXG4gICAgICAgICAgfVxuICAgICAgICB9KVxuICAgIH0pXG4gIH1cblxuICAvLyBHZXQgcGFydC1pbmZvIG9mIGFsbCBwYXJ0cyBvZiBhbiBpbmNvbXBsZXRlIHVwbG9hZCBzcGVjaWZpZWQgYnkgdXBsb2FkSWQuXG4gIGxpc3RQYXJ0cyhidWNrZXROYW1lLCBvYmplY3ROYW1lLCB1cGxvYWRJZCwgY2IpIHtcbiAgICBpZiAoIWlzVmFsaWRCdWNrZXROYW1lKGJ1Y2tldE5hbWUpKSB7XG4gICAgICB0aHJvdyBuZXcgZXJyb3JzLkludmFsaWRCdWNrZXROYW1lRXJyb3IoJ0ludmFsaWQgYnVja2V0IG5hbWU6ICcgKyBidWNrZXROYW1lKVxuICAgIH1cbiAgICBpZiAoIWlzVmFsaWRPYmplY3ROYW1lKG9iamVjdE5hbWUpKSB7XG4gICAgICB0aHJvdyBuZXcgZXJyb3JzLkludmFsaWRPYmplY3ROYW1lRXJyb3IoYEludmFsaWQgb2JqZWN0IG5hbWU6ICR7b2JqZWN0TmFtZX1gKVxuICAgIH1cbiAgICBpZiAoIWlzU3RyaW5nKHVwbG9hZElkKSkge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcigndXBsb2FkSWQgc2hvdWxkIGJlIG9mIHR5cGUgXCJzdHJpbmdcIicpXG4gICAgfVxuICAgIGlmICghdXBsb2FkSWQpIHtcbiAgICAgIHRocm93IG5ldyBlcnJvcnMuSW52YWxpZEFyZ3VtZW50RXJyb3IoJ3VwbG9hZElkIGNhbm5vdCBiZSBlbXB0eScpXG4gICAgfVxuICAgIHZhciBwYXJ0cyA9IFtdXG4gICAgdmFyIGxpc3ROZXh0ID0gKG1hcmtlcikgPT4ge1xuICAgICAgdGhpcy5saXN0UGFydHNRdWVyeShidWNrZXROYW1lLCBvYmplY3ROYW1lLCB1cGxvYWRJZCwgbWFya2VyLCAoZSwgcmVzdWx0KSA9PiB7XG4gICAgICAgIGlmIChlKSB7XG4gICAgICAgICAgY2IoZSlcbiAgICAgICAgICByZXR1cm5cbiAgICAgICAgfVxuICAgICAgICBwYXJ0cyA9IHBhcnRzLmNvbmNhdChyZXN1bHQucGFydHMpXG4gICAgICAgIGlmIChyZXN1bHQuaXNUcnVuY2F0ZWQpIHtcbiAgICAgICAgICBsaXN0TmV4dChyZXN1bHQubWFya2VyKVxuICAgICAgICAgIHJldHVyblxuICAgICAgICB9XG4gICAgICAgIGNiKG51bGwsIHBhcnRzKVxuICAgICAgfSlcbiAgICB9XG4gICAgbGlzdE5leHQoMClcbiAgfVxuXG4gIC8vIENhbGxlZCBieSBsaXN0UGFydHMgdG8gZmV0Y2ggYSBiYXRjaCBvZiBwYXJ0LWluZm9cbiAgbGlzdFBhcnRzUXVlcnkoYnVja2V0TmFtZSwgb2JqZWN0TmFtZSwgdXBsb2FkSWQsIG1hcmtlciwgY2IpIHtcbiAgICBpZiAoIWlzVmFsaWRCdWNrZXROYW1lKGJ1Y2tldE5hbWUpKSB7XG4gICAgICB0aHJvdyBuZXcgZXJyb3JzLkludmFsaWRCdWNrZXROYW1lRXJyb3IoJ0ludmFsaWQgYnVja2V0IG5hbWU6ICcgKyBidWNrZXROYW1lKVxuICAgIH1cbiAgICBpZiAoIWlzVmFsaWRPYmplY3ROYW1lKG9iamVjdE5hbWUpKSB7XG4gICAgICB0aHJvdyBuZXcgZXJyb3JzLkludmFsaWRPYmplY3ROYW1lRXJyb3IoYEludmFsaWQgb2JqZWN0IG5hbWU6ICR7b2JqZWN0TmFtZX1gKVxuICAgIH1cbiAgICBpZiAoIWlzU3RyaW5nKHVwbG9hZElkKSkge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcigndXBsb2FkSWQgc2hvdWxkIGJlIG9mIHR5cGUgXCJzdHJpbmdcIicpXG4gICAgfVxuICAgIGlmICghaXNOdW1iZXIobWFya2VyKSkge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignbWFya2VyIHNob3VsZCBiZSBvZiB0eXBlIFwibnVtYmVyXCInKVxuICAgIH1cbiAgICBpZiAoIWlzRnVuY3Rpb24oY2IpKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdjYWxsYmFjayBzaG91bGQgYmUgb2YgdHlwZSBcImZ1bmN0aW9uXCInKVxuICAgIH1cbiAgICBpZiAoIXVwbG9hZElkKSB7XG4gICAgICB0aHJvdyBuZXcgZXJyb3JzLkludmFsaWRBcmd1bWVudEVycm9yKCd1cGxvYWRJZCBjYW5ub3QgYmUgZW1wdHknKVxuICAgIH1cbiAgICB2YXIgcXVlcnkgPSAnJ1xuICAgIGlmIChtYXJrZXIgJiYgbWFya2VyICE9PSAwKSB7XG4gICAgICBxdWVyeSArPSBgcGFydC1udW1iZXItbWFya2VyPSR7bWFya2VyfSZgXG4gICAgfVxuICAgIHF1ZXJ5ICs9IGB1cGxvYWRJZD0ke3VyaUVzY2FwZSh1cGxvYWRJZCl9YFxuXG4gICAgdmFyIG1ldGhvZCA9ICdHRVQnXG4gICAgdGhpcy5tYWtlUmVxdWVzdCh7IG1ldGhvZCwgYnVja2V0TmFtZSwgb2JqZWN0TmFtZSwgcXVlcnkgfSwgJycsIFsyMDBdLCAnJywgdHJ1ZSwgKGUsIHJlc3BvbnNlKSA9PiB7XG4gICAgICBpZiAoZSkge1xuICAgICAgICByZXR1cm4gY2IoZSlcbiAgICAgIH1cbiAgICAgIHZhciB0cmFuc2Zvcm1lciA9IHRyYW5zZm9ybWVycy5nZXRMaXN0UGFydHNUcmFuc2Zvcm1lcigpXG4gICAgICBwaXBlc2V0dXAocmVzcG9uc2UsIHRyYW5zZm9ybWVyKVxuICAgICAgICAub24oJ2Vycm9yJywgKGUpID0+IGNiKGUpKVxuICAgICAgICAub24oJ2RhdGEnLCAoZGF0YSkgPT4gY2IobnVsbCwgZGF0YSkpXG4gICAgfSlcbiAgfVxuXG4gIC8vIENhbGxlZCBieSBsaXN0SW5jb21wbGV0ZVVwbG9hZHMgdG8gZmV0Y2ggYSBiYXRjaCBvZiBpbmNvbXBsZXRlIHVwbG9hZHMuXG4gIGxpc3RJbmNvbXBsZXRlVXBsb2Fkc1F1ZXJ5KGJ1Y2tldE5hbWUsIHByZWZpeCwga2V5TWFya2VyLCB1cGxvYWRJZE1hcmtlciwgZGVsaW1pdGVyKSB7XG4gICAgaWYgKCFpc1ZhbGlkQnVja2V0TmFtZShidWNrZXROYW1lKSkge1xuICAgICAgdGhyb3cgbmV3IGVycm9ycy5JbnZhbGlkQnVja2V0TmFtZUVycm9yKCdJbnZhbGlkIGJ1Y2tldCBuYW1lOiAnICsgYnVja2V0TmFtZSlcbiAgICB9XG4gICAgaWYgKCFpc1N0cmluZyhwcmVmaXgpKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdwcmVmaXggc2hvdWxkIGJlIG9mIHR5cGUgXCJzdHJpbmdcIicpXG4gICAgfVxuICAgIGlmICghaXNTdHJpbmcoa2V5TWFya2VyKSkge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcigna2V5TWFya2VyIHNob3VsZCBiZSBvZiB0eXBlIFwic3RyaW5nXCInKVxuICAgIH1cbiAgICBpZiAoIWlzU3RyaW5nKHVwbG9hZElkTWFya2VyKSkge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcigndXBsb2FkSWRNYXJrZXIgc2hvdWxkIGJlIG9mIHR5cGUgXCJzdHJpbmdcIicpXG4gICAgfVxuICAgIGlmICghaXNTdHJpbmcoZGVsaW1pdGVyKSkge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignZGVsaW1pdGVyIHNob3VsZCBiZSBvZiB0eXBlIFwic3RyaW5nXCInKVxuICAgIH1cbiAgICB2YXIgcXVlcmllcyA9IFtdXG4gICAgcXVlcmllcy5wdXNoKGBwcmVmaXg9JHt1cmlFc2NhcGUocHJlZml4KX1gKVxuICAgIHF1ZXJpZXMucHVzaChgZGVsaW1pdGVyPSR7dXJpRXNjYXBlKGRlbGltaXRlcil9YClcblxuICAgIGlmIChrZXlNYXJrZXIpIHtcbiAgICAgIGtleU1hcmtlciA9IHVyaUVzY2FwZShrZXlNYXJrZXIpXG4gICAgICBxdWVyaWVzLnB1c2goYGtleS1tYXJrZXI9JHtrZXlNYXJrZXJ9YClcbiAgICB9XG4gICAgaWYgKHVwbG9hZElkTWFya2VyKSB7XG4gICAgICBxdWVyaWVzLnB1c2goYHVwbG9hZC1pZC1tYXJrZXI9JHt1cGxvYWRJZE1hcmtlcn1gKVxuICAgIH1cblxuICAgIHZhciBtYXhVcGxvYWRzID0gMTAwMFxuICAgIHF1ZXJpZXMucHVzaChgbWF4LXVwbG9hZHM9JHttYXhVcGxvYWRzfWApXG4gICAgcXVlcmllcy5zb3J0KClcbiAgICBxdWVyaWVzLnVuc2hpZnQoJ3VwbG9hZHMnKVxuICAgIHZhciBxdWVyeSA9ICcnXG4gICAgaWYgKHF1ZXJpZXMubGVuZ3RoID4gMCkge1xuICAgICAgcXVlcnkgPSBgJHtxdWVyaWVzLmpvaW4oJyYnKX1gXG4gICAgfVxuICAgIHZhciBtZXRob2QgPSAnR0VUJ1xuICAgIHZhciB0cmFuc2Zvcm1lciA9IHRyYW5zZm9ybWVycy5nZXRMaXN0TXVsdGlwYXJ0VHJhbnNmb3JtZXIoKVxuICAgIHRoaXMubWFrZVJlcXVlc3QoeyBtZXRob2QsIGJ1Y2tldE5hbWUsIHF1ZXJ5IH0sICcnLCBbMjAwXSwgJycsIHRydWUsIChlLCByZXNwb25zZSkgPT4ge1xuICAgICAgaWYgKGUpIHtcbiAgICAgICAgcmV0dXJuIHRyYW5zZm9ybWVyLmVtaXQoJ2Vycm9yJywgZSlcbiAgICAgIH1cbiAgICAgIHBpcGVzZXR1cChyZXNwb25zZSwgdHJhbnNmb3JtZXIpXG4gICAgfSlcbiAgICByZXR1cm4gdHJhbnNmb3JtZXJcbiAgfVxuXG4gIC8vIEZpbmQgdXBsb2FkSWQgb2YgYW4gaW5jb21wbGV0ZSB1cGxvYWQuXG4gIGZpbmRVcGxvYWRJZChidWNrZXROYW1lLCBvYmplY3ROYW1lLCBjYikge1xuICAgIGlmICghaXNWYWxpZEJ1Y2tldE5hbWUoYnVja2V0TmFtZSkpIHtcbiAgICAgIHRocm93IG5ldyBlcnJvcnMuSW52YWxpZEJ1Y2tldE5hbWVFcnJvcignSW52YWxpZCBidWNrZXQgbmFtZTogJyArIGJ1Y2tldE5hbWUpXG4gICAgfVxuICAgIGlmICghaXNWYWxpZE9iamVjdE5hbWUob2JqZWN0TmFtZSkpIHtcbiAgICAgIHRocm93IG5ldyBlcnJvcnMuSW52YWxpZE9iamVjdE5hbWVFcnJvcihgSW52YWxpZCBvYmplY3QgbmFtZTogJHtvYmplY3ROYW1lfWApXG4gICAgfVxuICAgIGlmICghaXNGdW5jdGlvbihjYikpIHtcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ2NiIHNob3VsZCBiZSBvZiB0eXBlIFwiZnVuY3Rpb25cIicpXG4gICAgfVxuICAgIHZhciBsYXRlc3RVcGxvYWRcbiAgICB2YXIgbGlzdE5leHQgPSAoa2V5TWFya2VyLCB1cGxvYWRJZE1hcmtlcikgPT4ge1xuICAgICAgdGhpcy5saXN0SW5jb21wbGV0ZVVwbG9hZHNRdWVyeShidWNrZXROYW1lLCBvYmplY3ROYW1lLCBrZXlNYXJrZXIsIHVwbG9hZElkTWFya2VyLCAnJylcbiAgICAgICAgLm9uKCdlcnJvcicsIChlKSA9PiBjYihlKSlcbiAgICAgICAgLm9uKCdkYXRhJywgKHJlc3VsdCkgPT4ge1xuICAgICAgICAgIHJlc3VsdC51cGxvYWRzLmZvckVhY2goKHVwbG9hZCkgPT4ge1xuICAgICAgICAgICAgaWYgKHVwbG9hZC5rZXkgPT09IG9iamVjdE5hbWUpIHtcbiAgICAgICAgICAgICAgaWYgKCFsYXRlc3RVcGxvYWQgfHwgdXBsb2FkLmluaXRpYXRlZC5nZXRUaW1lKCkgPiBsYXRlc3RVcGxvYWQuaW5pdGlhdGVkLmdldFRpbWUoKSkge1xuICAgICAgICAgICAgICAgIGxhdGVzdFVwbG9hZCA9IHVwbG9hZFxuICAgICAgICAgICAgICAgIHJldHVyblxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSlcbiAgICAgICAgICBpZiAocmVzdWx0LmlzVHJ1bmNhdGVkKSB7XG4gICAgICAgICAgICBsaXN0TmV4dChyZXN1bHQubmV4dEtleU1hcmtlciwgcmVzdWx0Lm5leHRVcGxvYWRJZE1hcmtlcilcbiAgICAgICAgICAgIHJldHVyblxuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAobGF0ZXN0VXBsb2FkKSB7XG4gICAgICAgICAgICByZXR1cm4gY2IobnVsbCwgbGF0ZXN0VXBsb2FkLnVwbG9hZElkKVxuICAgICAgICAgIH1cbiAgICAgICAgICBjYihudWxsLCB1bmRlZmluZWQpXG4gICAgICAgIH0pXG4gICAgfVxuICAgIGxpc3ROZXh0KCcnLCAnJylcbiAgfVxuXG4gIC8vIFJldHVybnMgYSBmdW5jdGlvbiB0aGF0IGNhbiBiZSB1c2VkIGZvciB1cGxvYWRpbmcgb2JqZWN0cy5cbiAgLy8gSWYgbXVsdGlwYXJ0ID09PSB0cnVlLCBpdCByZXR1cm5zIGZ1bmN0aW9uIHRoYXQgaXMgdXNlZCB0byB1cGxvYWRcbiAgLy8gYSBwYXJ0IG9mIHRoZSBtdWx0aXBhcnQuXG4gIGdldFVwbG9hZGVyKGJ1Y2tldE5hbWUsIG9iamVjdE5hbWUsIG1ldGFEYXRhLCBtdWx0aXBhcnQpIHtcbiAgICBpZiAoIWlzVmFsaWRCdWNrZXROYW1lKGJ1Y2tldE5hbWUpKSB7XG4gICAgICB0aHJvdyBuZXcgZXJyb3JzLkludmFsaWRCdWNrZXROYW1lRXJyb3IoJ0ludmFsaWQgYnVja2V0IG5hbWU6ICcgKyBidWNrZXROYW1lKVxuICAgIH1cbiAgICBpZiAoIWlzVmFsaWRPYmplY3ROYW1lKG9iamVjdE5hbWUpKSB7XG4gICAgICB0aHJvdyBuZXcgZXJyb3JzLkludmFsaWRPYmplY3ROYW1lRXJyb3IoYEludmFsaWQgb2JqZWN0IG5hbWU6ICR7b2JqZWN0TmFtZX1gKVxuICAgIH1cbiAgICBpZiAoIWlzQm9vbGVhbihtdWx0aXBhcnQpKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdtdWx0aXBhcnQgc2hvdWxkIGJlIG9mIHR5cGUgXCJib29sZWFuXCInKVxuICAgIH1cbiAgICBpZiAoIWlzT2JqZWN0KG1ldGFEYXRhKSkge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignbWV0YWRhdGEgc2hvdWxkIGJlIG9mIHR5cGUgXCJvYmplY3RcIicpXG4gICAgfVxuXG4gICAgdmFyIHZhbGlkYXRlID0gKHN0cmVhbSwgbGVuZ3RoLCBzaGEyNTZzdW0sIG1kNXN1bSwgY2IpID0+IHtcbiAgICAgIGlmICghaXNSZWFkYWJsZVN0cmVhbShzdHJlYW0pKSB7XG4gICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ3N0cmVhbSBzaG91bGQgYmUgb2YgdHlwZSBcIlN0cmVhbVwiJylcbiAgICAgIH1cbiAgICAgIGlmICghaXNOdW1iZXIobGVuZ3RoKSkge1xuICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdsZW5ndGggc2hvdWxkIGJlIG9mIHR5cGUgXCJudW1iZXJcIicpXG4gICAgICB9XG4gICAgICBpZiAoIWlzU3RyaW5nKHNoYTI1NnN1bSkpIHtcbiAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignc2hhMjU2c3VtIHNob3VsZCBiZSBvZiB0eXBlIFwic3RyaW5nXCInKVxuICAgICAgfVxuICAgICAgaWYgKCFpc1N0cmluZyhtZDVzdW0pKSB7XG4gICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ21kNXN1bSBzaG91bGQgYmUgb2YgdHlwZSBcInN0cmluZ1wiJylcbiAgICAgIH1cbiAgICAgIGlmICghaXNGdW5jdGlvbihjYikpIHtcbiAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignY2FsbGJhY2sgc2hvdWxkIGJlIG9mIHR5cGUgXCJmdW5jdGlvblwiJylcbiAgICAgIH1cbiAgICB9XG4gICAgdmFyIHNpbXBsZVVwbG9hZGVyID0gKC4uLmFyZ3MpID0+IHtcbiAgICAgIHZhbGlkYXRlKC4uLmFyZ3MpXG4gICAgICB2YXIgcXVlcnkgPSAnJ1xuICAgICAgdXBsb2FkKHF1ZXJ5LCAuLi5hcmdzKVxuICAgIH1cbiAgICB2YXIgbXVsdGlwYXJ0VXBsb2FkZXIgPSAodXBsb2FkSWQsIHBhcnROdW1iZXIsIC4uLnJlc3QpID0+IHtcbiAgICAgIGlmICghaXNTdHJpbmcodXBsb2FkSWQpKSB7XG4gICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ3VwbG9hZElkIHNob3VsZCBiZSBvZiB0eXBlIFwic3RyaW5nXCInKVxuICAgICAgfVxuICAgICAgaWYgKCFpc051bWJlcihwYXJ0TnVtYmVyKSkge1xuICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdwYXJ0TnVtYmVyIHNob3VsZCBiZSBvZiB0eXBlIFwibnVtYmVyXCInKVxuICAgICAgfVxuICAgICAgaWYgKCF1cGxvYWRJZCkge1xuICAgICAgICB0aHJvdyBuZXcgZXJyb3JzLkludmFsaWRBcmd1bWVudEVycm9yKCdFbXB0eSB1cGxvYWRJZCcpXG4gICAgICB9XG4gICAgICBpZiAoIXBhcnROdW1iZXIpIHtcbiAgICAgICAgdGhyb3cgbmV3IGVycm9ycy5JbnZhbGlkQXJndW1lbnRFcnJvcigncGFydE51bWJlciBjYW5ub3QgYmUgMCcpXG4gICAgICB9XG4gICAgICB2YWxpZGF0ZSguLi5yZXN0KVxuICAgICAgdmFyIHF1ZXJ5ID0gYHBhcnROdW1iZXI9JHtwYXJ0TnVtYmVyfSZ1cGxvYWRJZD0ke3VyaUVzY2FwZSh1cGxvYWRJZCl9YFxuICAgICAgdXBsb2FkKHF1ZXJ5LCAuLi5yZXN0KVxuICAgIH1cbiAgICB2YXIgdXBsb2FkID0gKHF1ZXJ5LCBzdHJlYW0sIGxlbmd0aCwgc2hhMjU2c3VtLCBtZDVzdW0sIGNiKSA9PiB7XG4gICAgICB2YXIgbWV0aG9kID0gJ1BVVCdcbiAgICAgIGxldCBoZWFkZXJzID0geyAnQ29udGVudC1MZW5ndGgnOiBsZW5ndGggfVxuXG4gICAgICBpZiAoIW11bHRpcGFydCkge1xuICAgICAgICBoZWFkZXJzID0gT2JqZWN0LmFzc2lnbih7fSwgbWV0YURhdGEsIGhlYWRlcnMpXG4gICAgICB9XG5cbiAgICAgIGlmICghdGhpcy5lbmFibGVTSEEyNTYpIHtcbiAgICAgICAgaGVhZGVyc1snQ29udGVudC1NRDUnXSA9IG1kNXN1bVxuICAgICAgfVxuICAgICAgdGhpcy5tYWtlUmVxdWVzdFN0cmVhbShcbiAgICAgICAgeyBtZXRob2QsIGJ1Y2tldE5hbWUsIG9iamVjdE5hbWUsIHF1ZXJ5LCBoZWFkZXJzIH0sXG4gICAgICAgIHN0cmVhbSxcbiAgICAgICAgc2hhMjU2c3VtLFxuICAgICAgICBbMjAwXSxcbiAgICAgICAgJycsXG4gICAgICAgIHRydWUsXG4gICAgICAgIChlLCByZXNwb25zZSkgPT4ge1xuICAgICAgICAgIGlmIChlKSB7XG4gICAgICAgICAgICByZXR1cm4gY2IoZSlcbiAgICAgICAgICB9XG4gICAgICAgICAgY29uc3QgcmVzdWx0ID0ge1xuICAgICAgICAgICAgZXRhZzogc2FuaXRpemVFVGFnKHJlc3BvbnNlLmhlYWRlcnMuZXRhZyksXG4gICAgICAgICAgICB2ZXJzaW9uSWQ6IGdldFZlcnNpb25JZChyZXNwb25zZS5oZWFkZXJzKSxcbiAgICAgICAgICB9XG4gICAgICAgICAgLy8gSWdub3JlIHRoZSAnZGF0YScgZXZlbnQgc28gdGhhdCB0aGUgc3RyZWFtIGNsb3Nlcy4gKG5vZGVqcyBzdHJlYW0gcmVxdWlyZW1lbnQpXG4gICAgICAgICAgcmVzcG9uc2Uub24oJ2RhdGEnLCAoKSA9PiB7fSlcbiAgICAgICAgICBjYihudWxsLCByZXN1bHQpXG4gICAgICAgIH0sXG4gICAgICApXG4gICAgfVxuICAgIGlmIChtdWx0aXBhcnQpIHtcbiAgICAgIHJldHVybiBtdWx0aXBhcnRVcGxvYWRlclxuICAgIH1cbiAgICByZXR1cm4gc2ltcGxlVXBsb2FkZXJcbiAgfVxuXG4gIC8vIFJlbW92ZSBhbGwgdGhlIG5vdGlmaWNhdGlvbiBjb25maWd1cmF0aW9ucyBpbiB0aGUgUzMgcHJvdmlkZXJcbiAgc2V0QnVja2V0Tm90aWZpY2F0aW9uKGJ1Y2tldE5hbWUsIGNvbmZpZywgY2IpIHtcbiAgICBpZiAoIWlzVmFsaWRCdWNrZXROYW1lKGJ1Y2tldE5hbWUpKSB7XG4gICAgICB0aHJvdyBuZXcgZXJyb3JzLkludmFsaWRCdWNrZXROYW1lRXJyb3IoJ0ludmFsaWQgYnVja2V0IG5hbWU6ICcgKyBidWNrZXROYW1lKVxuICAgIH1cbiAgICBpZiAoIWlzT2JqZWN0KGNvbmZpZykpIHtcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ25vdGlmaWNhdGlvbiBjb25maWcgc2hvdWxkIGJlIG9mIHR5cGUgXCJPYmplY3RcIicpXG4gICAgfVxuICAgIGlmICghaXNGdW5jdGlvbihjYikpIHtcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ2NhbGxiYWNrIHNob3VsZCBiZSBvZiB0eXBlIFwiZnVuY3Rpb25cIicpXG4gICAgfVxuICAgIHZhciBtZXRob2QgPSAnUFVUJ1xuICAgIHZhciBxdWVyeSA9ICdub3RpZmljYXRpb24nXG4gICAgdmFyIGJ1aWxkZXIgPSBuZXcgeG1sMmpzLkJ1aWxkZXIoe1xuICAgICAgcm9vdE5hbWU6ICdOb3RpZmljYXRpb25Db25maWd1cmF0aW9uJyxcbiAgICAgIHJlbmRlck9wdHM6IHsgcHJldHR5OiBmYWxzZSB9LFxuICAgICAgaGVhZGxlc3M6IHRydWUsXG4gICAgfSlcbiAgICB2YXIgcGF5bG9hZCA9IGJ1aWxkZXIuYnVpbGRPYmplY3QoY29uZmlnKVxuICAgIHRoaXMubWFrZVJlcXVlc3QoeyBtZXRob2QsIGJ1Y2tldE5hbWUsIHF1ZXJ5IH0sIHBheWxvYWQsIFsyMDBdLCAnJywgZmFsc2UsIGNiKVxuICB9XG5cbiAgcmVtb3ZlQWxsQnVja2V0Tm90aWZpY2F0aW9uKGJ1Y2tldE5hbWUsIGNiKSB7XG4gICAgdGhpcy5zZXRCdWNrZXROb3RpZmljYXRpb24oYnVja2V0TmFtZSwgbmV3IE5vdGlmaWNhdGlvbkNvbmZpZygpLCBjYilcbiAgfVxuXG4gIC8vIFJldHVybiB0aGUgbGlzdCBvZiBub3RpZmljYXRpb24gY29uZmlndXJhdGlvbnMgc3RvcmVkXG4gIC8vIGluIHRoZSBTMyBwcm92aWRlclxuICBnZXRCdWNrZXROb3RpZmljYXRpb24oYnVja2V0TmFtZSwgY2IpIHtcbiAgICBpZiAoIWlzVmFsaWRCdWNrZXROYW1lKGJ1Y2tldE5hbWUpKSB7XG4gICAgICB0aHJvdyBuZXcgZXJyb3JzLkludmFsaWRCdWNrZXROYW1lRXJyb3IoJ0ludmFsaWQgYnVja2V0IG5hbWU6ICcgKyBidWNrZXROYW1lKVxuICAgIH1cbiAgICBpZiAoIWlzRnVuY3Rpb24oY2IpKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdjYWxsYmFjayBzaG91bGQgYmUgb2YgdHlwZSBcImZ1bmN0aW9uXCInKVxuICAgIH1cbiAgICB2YXIgbWV0aG9kID0gJ0dFVCdcbiAgICB2YXIgcXVlcnkgPSAnbm90aWZpY2F0aW9uJ1xuICAgIHRoaXMubWFrZVJlcXVlc3QoeyBtZXRob2QsIGJ1Y2tldE5hbWUsIHF1ZXJ5IH0sICcnLCBbMjAwXSwgJycsIHRydWUsIChlLCByZXNwb25zZSkgPT4ge1xuICAgICAgaWYgKGUpIHtcbiAgICAgICAgcmV0dXJuIGNiKGUpXG4gICAgICB9XG4gICAgICB2YXIgdHJhbnNmb3JtZXIgPSB0cmFuc2Zvcm1lcnMuZ2V0QnVja2V0Tm90aWZpY2F0aW9uVHJhbnNmb3JtZXIoKVxuICAgICAgdmFyIGJ1Y2tldE5vdGlmaWNhdGlvblxuICAgICAgcGlwZXNldHVwKHJlc3BvbnNlLCB0cmFuc2Zvcm1lcilcbiAgICAgICAgLm9uKCdkYXRhJywgKHJlc3VsdCkgPT4gKGJ1Y2tldE5vdGlmaWNhdGlvbiA9IHJlc3VsdCkpXG4gICAgICAgIC5vbignZXJyb3InLCAoZSkgPT4gY2IoZSkpXG4gICAgICAgIC5vbignZW5kJywgKCkgPT4gY2IobnVsbCwgYnVja2V0Tm90aWZpY2F0aW9uKSlcbiAgICB9KVxuICB9XG5cbiAgLy8gTGlzdGVucyBmb3IgYnVja2V0IG5vdGlmaWNhdGlvbnMuIFJldHVybnMgYW4gRXZlbnRFbWl0dGVyLlxuICBsaXN0ZW5CdWNrZXROb3RpZmljYXRpb24oYnVja2V0TmFtZSwgcHJlZml4LCBzdWZmaXgsIGV2ZW50cykge1xuICAgIGlmICghaXNWYWxpZEJ1Y2tldE5hbWUoYnVja2V0TmFtZSkpIHtcbiAgICAgIHRocm93IG5ldyBlcnJvcnMuSW52YWxpZEJ1Y2tldE5hbWVFcnJvcihgSW52YWxpZCBidWNrZXQgbmFtZTogJHtidWNrZXROYW1lfWApXG4gICAgfVxuICAgIGlmICghaXNTdHJpbmcocHJlZml4KSkge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcigncHJlZml4IG11c3QgYmUgb2YgdHlwZSBzdHJpbmcnKVxuICAgIH1cbiAgICBpZiAoIWlzU3RyaW5nKHN1ZmZpeCkpIHtcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ3N1ZmZpeCBtdXN0IGJlIG9mIHR5cGUgc3RyaW5nJylcbiAgICB9XG4gICAgaWYgKCFBcnJheS5pc0FycmF5KGV2ZW50cykpIHtcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ2V2ZW50cyBtdXN0IGJlIG9mIHR5cGUgQXJyYXknKVxuICAgIH1cbiAgICBsZXQgbGlzdGVuZXIgPSBuZXcgTm90aWZpY2F0aW9uUG9sbGVyKHRoaXMsIGJ1Y2tldE5hbWUsIHByZWZpeCwgc3VmZml4LCBldmVudHMpXG4gICAgbGlzdGVuZXIuc3RhcnQoKVxuXG4gICAgcmV0dXJuIGxpc3RlbmVyXG4gIH1cblxuICBnZXRCdWNrZXRWZXJzaW9uaW5nKGJ1Y2tldE5hbWUsIGNiKSB7XG4gICAgaWYgKCFpc1ZhbGlkQnVja2V0TmFtZShidWNrZXROYW1lKSkge1xuICAgICAgdGhyb3cgbmV3IGVycm9ycy5JbnZhbGlkQnVja2V0TmFtZUVycm9yKCdJbnZhbGlkIGJ1Y2tldCBuYW1lOiAnICsgYnVja2V0TmFtZSlcbiAgICB9XG4gICAgaWYgKCFpc0Z1bmN0aW9uKGNiKSkge1xuICAgICAgdGhyb3cgbmV3IGVycm9ycy5JbnZhbGlkQXJndW1lbnRFcnJvcignY2FsbGJhY2sgc2hvdWxkIGJlIG9mIHR5cGUgXCJmdW5jdGlvblwiJylcbiAgICB9XG4gICAgdmFyIG1ldGhvZCA9ICdHRVQnXG4gICAgdmFyIHF1ZXJ5ID0gJ3ZlcnNpb25pbmcnXG5cbiAgICB0aGlzLm1ha2VSZXF1ZXN0KHsgbWV0aG9kLCBidWNrZXROYW1lLCBxdWVyeSB9LCAnJywgWzIwMF0sICcnLCB0cnVlLCAoZSwgcmVzcG9uc2UpID0+IHtcbiAgICAgIGlmIChlKSB7XG4gICAgICAgIHJldHVybiBjYihlKVxuICAgICAgfVxuXG4gICAgICBsZXQgdmVyc2lvbkNvbmZpZyA9IEJ1ZmZlci5mcm9tKCcnKVxuICAgICAgcGlwZXNldHVwKHJlc3BvbnNlLCB0cmFuc2Zvcm1lcnMuYnVja2V0VmVyc2lvbmluZ1RyYW5zZm9ybWVyKCkpXG4gICAgICAgIC5vbignZGF0YScsIChkYXRhKSA9PiB7XG4gICAgICAgICAgdmVyc2lvbkNvbmZpZyA9IGRhdGFcbiAgICAgICAgfSlcbiAgICAgICAgLm9uKCdlcnJvcicsIGNiKVxuICAgICAgICAub24oJ2VuZCcsICgpID0+IHtcbiAgICAgICAgICBjYihudWxsLCB2ZXJzaW9uQ29uZmlnKVxuICAgICAgICB9KVxuICAgIH0pXG4gIH1cblxuICBzZXRCdWNrZXRWZXJzaW9uaW5nKGJ1Y2tldE5hbWUsIHZlcnNpb25Db25maWcsIGNiKSB7XG4gICAgaWYgKCFpc1ZhbGlkQnVja2V0TmFtZShidWNrZXROYW1lKSkge1xuICAgICAgdGhyb3cgbmV3IGVycm9ycy5JbnZhbGlkQnVja2V0TmFtZUVycm9yKCdJbnZhbGlkIGJ1Y2tldCBuYW1lOiAnICsgYnVja2V0TmFtZSlcbiAgICB9XG4gICAgaWYgKCFPYmplY3Qua2V5cyh2ZXJzaW9uQ29uZmlnKS5sZW5ndGgpIHtcbiAgICAgIHRocm93IG5ldyBlcnJvcnMuSW52YWxpZEFyZ3VtZW50RXJyb3IoJ3ZlcnNpb25Db25maWcgc2hvdWxkIGJlIG9mIHR5cGUgXCJvYmplY3RcIicpXG4gICAgfVxuICAgIGlmICghaXNGdW5jdGlvbihjYikpIHtcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ2NhbGxiYWNrIHNob3VsZCBiZSBvZiB0eXBlIFwiZnVuY3Rpb25cIicpXG4gICAgfVxuXG4gICAgdmFyIG1ldGhvZCA9ICdQVVQnXG4gICAgdmFyIHF1ZXJ5ID0gJ3ZlcnNpb25pbmcnXG4gICAgdmFyIGJ1aWxkZXIgPSBuZXcgeG1sMmpzLkJ1aWxkZXIoe1xuICAgICAgcm9vdE5hbWU6ICdWZXJzaW9uaW5nQ29uZmlndXJhdGlvbicsXG4gICAgICByZW5kZXJPcHRzOiB7IHByZXR0eTogZmFsc2UgfSxcbiAgICAgIGhlYWRsZXNzOiB0cnVlLFxuICAgIH0pXG4gICAgdmFyIHBheWxvYWQgPSBidWlsZGVyLmJ1aWxkT2JqZWN0KHZlcnNpb25Db25maWcpXG5cbiAgICB0aGlzLm1ha2VSZXF1ZXN0KHsgbWV0aG9kLCBidWNrZXROYW1lLCBxdWVyeSB9LCBwYXlsb2FkLCBbMjAwXSwgJycsIGZhbHNlLCBjYilcbiAgfVxuXG4gIC8qKiBUbyBzZXQgVGFncyBvbiBhIGJ1Y2tldCBvciBvYmplY3QgYmFzZWQgb24gdGhlIHBhcmFtc1xuICAgKiAgX19Bcmd1bWVudHNfX1xuICAgKiB0YWdnaW5nUGFyYW1zIF9vYmplY3RfIFdoaWNoIGNvbnRhaW5zIHRoZSBmb2xsb3dpbmcgcHJvcGVydGllc1xuICAgKiAgYnVja2V0TmFtZSBfc3RyaW5nXyxcbiAgICogIG9iamVjdE5hbWUgX3N0cmluZ18gKE9wdGlvbmFsKSxcbiAgICogIHRhZ3MgX29iamVjdF8gb2YgdGhlIGZvcm0geyc8dGFnLWtleS0xPic6Jzx0YWctdmFsdWUtMT4nLCc8dGFnLWtleS0yPic6Jzx0YWctdmFsdWUtMj4nfVxuICAgKiAgcHV0T3B0cyBfb2JqZWN0XyAoT3B0aW9uYWwpIGUuZyB7dmVyc2lvbklkOlwibXktb2JqZWN0LXZlcnNpb24taWRcIn0sXG4gICAqICBjYihlcnJvcilgIF9mdW5jdGlvbl8gLSBjYWxsYmFjayBmdW5jdGlvbiB3aXRoIGBlcnJgIGFzIHRoZSBlcnJvciBhcmd1bWVudC4gYGVycmAgaXMgbnVsbCBpZiB0aGUgb3BlcmF0aW9uIGlzIHN1Y2Nlc3NmdWwuXG4gICAqL1xuICBzZXRUYWdnaW5nKHRhZ2dpbmdQYXJhbXMpIHtcbiAgICBjb25zdCB7IGJ1Y2tldE5hbWUsIG9iamVjdE5hbWUsIHRhZ3MsIHB1dE9wdHMgPSB7fSwgY2IgfSA9IHRhZ2dpbmdQYXJhbXNcbiAgICBjb25zdCBtZXRob2QgPSAnUFVUJ1xuICAgIGxldCBxdWVyeSA9ICd0YWdnaW5nJ1xuXG4gICAgaWYgKHB1dE9wdHMgJiYgcHV0T3B0cy52ZXJzaW9uSWQpIHtcbiAgICAgIHF1ZXJ5ID0gYCR7cXVlcnl9JnZlcnNpb25JZD0ke3B1dE9wdHMudmVyc2lvbklkfWBcbiAgICB9XG4gICAgY29uc3QgdGFnc0xpc3QgPSBbXVxuICAgIGZvciAoY29uc3QgW2tleSwgdmFsdWVdIG9mIE9iamVjdC5lbnRyaWVzKHRhZ3MpKSB7XG4gICAgICB0YWdzTGlzdC5wdXNoKHsgS2V5OiBrZXksIFZhbHVlOiB2YWx1ZSB9KVxuICAgIH1cbiAgICBjb25zdCB0YWdnaW5nQ29uZmlnID0ge1xuICAgICAgVGFnZ2luZzoge1xuICAgICAgICBUYWdTZXQ6IHtcbiAgICAgICAgICBUYWc6IHRhZ3NMaXN0LFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICB9XG4gICAgY29uc3QgZW5jb2RlciA9IG5ldyBUZXh0RW5jb2RlcigpXG4gICAgY29uc3QgaGVhZGVycyA9IHt9XG4gICAgY29uc3QgYnVpbGRlciA9IG5ldyB4bWwyanMuQnVpbGRlcih7IGhlYWRsZXNzOiB0cnVlLCByZW5kZXJPcHRzOiB7IHByZXR0eTogZmFsc2UgfSB9KVxuICAgIGxldCBwYXlsb2FkID0gYnVpbGRlci5idWlsZE9iamVjdCh0YWdnaW5nQ29uZmlnKVxuICAgIHBheWxvYWQgPSBlbmNvZGVyLmVuY29kZShwYXlsb2FkKVxuICAgIGhlYWRlcnNbJ0NvbnRlbnQtTUQ1J10gPSB0b01kNShwYXlsb2FkKVxuICAgIGNvbnN0IHJlcXVlc3RPcHRpb25zID0geyBtZXRob2QsIGJ1Y2tldE5hbWUsIHF1ZXJ5LCBoZWFkZXJzIH1cblxuICAgIGlmIChvYmplY3ROYW1lKSB7XG4gICAgICByZXF1ZXN0T3B0aW9uc1snb2JqZWN0TmFtZSddID0gb2JqZWN0TmFtZVxuICAgIH1cbiAgICBoZWFkZXJzWydDb250ZW50LU1ENSddID0gdG9NZDUocGF5bG9hZClcblxuICAgIHRoaXMubWFrZVJlcXVlc3QocmVxdWVzdE9wdGlvbnMsIHBheWxvYWQsIFsyMDBdLCAnJywgZmFsc2UsIGNiKVxuICB9XG5cbiAgLyoqIFNldCBUYWdzIG9uIGEgQnVja2V0XG4gICAqIF9fQXJndW1lbnRzX19cbiAgICogYnVja2V0TmFtZSBfc3RyaW5nX1xuICAgKiB0YWdzIF9vYmplY3RfIG9mIHRoZSBmb3JtIHsnPHRhZy1rZXktMT4nOic8dGFnLXZhbHVlLTE+JywnPHRhZy1rZXktMj4nOic8dGFnLXZhbHVlLTI+J31cbiAgICogYGNiKGVycm9yKWAgX2Z1bmN0aW9uXyAtIGNhbGxiYWNrIGZ1bmN0aW9uIHdpdGggYGVycmAgYXMgdGhlIGVycm9yIGFyZ3VtZW50LiBgZXJyYCBpcyBudWxsIGlmIHRoZSBvcGVyYXRpb24gaXMgc3VjY2Vzc2Z1bC5cbiAgICovXG4gIHNldEJ1Y2tldFRhZ2dpbmcoYnVja2V0TmFtZSwgdGFncywgY2IpIHtcbiAgICBpZiAoIWlzVmFsaWRCdWNrZXROYW1lKGJ1Y2tldE5hbWUpKSB7XG4gICAgICB0aHJvdyBuZXcgZXJyb3JzLkludmFsaWRCdWNrZXROYW1lRXJyb3IoJ0ludmFsaWQgYnVja2V0IG5hbWU6ICcgKyBidWNrZXROYW1lKVxuICAgIH1cbiAgICBpZiAoIWlzT2JqZWN0KHRhZ3MpKSB7XG4gICAgICB0aHJvdyBuZXcgZXJyb3JzLkludmFsaWRBcmd1bWVudEVycm9yKCd0YWdzIHNob3VsZCBiZSBvZiB0eXBlIFwib2JqZWN0XCInKVxuICAgIH1cbiAgICBpZiAoT2JqZWN0LmtleXModGFncykubGVuZ3RoID4gMTApIHtcbiAgICAgIHRocm93IG5ldyBlcnJvcnMuSW52YWxpZEFyZ3VtZW50RXJyb3IoJ21heGltdW0gdGFncyBhbGxvd2VkIGlzIDEwXCInKVxuICAgIH1cbiAgICBpZiAoIWlzRnVuY3Rpb24oY2IpKSB7XG4gICAgICB0aHJvdyBuZXcgZXJyb3JzLkludmFsaWRBcmd1bWVudEVycm9yKCdjYWxsYmFjayBzaG91bGQgYmUgb2YgdHlwZSBcImZ1bmN0aW9uXCInKVxuICAgIH1cblxuICAgIHJldHVybiB0aGlzLnNldFRhZ2dpbmcoeyBidWNrZXROYW1lLCB0YWdzLCBjYiB9KVxuICB9XG5cbiAgLyoqIFNldCBUYWdzIG9uIGFuIE9iamVjdFxuICAgKiBfX0FyZ3VtZW50c19fXG4gICAqIGJ1Y2tldE5hbWUgX3N0cmluZ19cbiAgICogb2JqZWN0TmFtZSBfc3RyaW5nX1xuICAgKiAgKiB0YWdzIF9vYmplY3RfIG9mIHRoZSBmb3JtIHsnPHRhZy1rZXktMT4nOic8dGFnLXZhbHVlLTE+JywnPHRhZy1rZXktMj4nOic8dGFnLXZhbHVlLTI+J31cbiAgICogIHB1dE9wdHMgX29iamVjdF8gKE9wdGlvbmFsKSBlLmcge3ZlcnNpb25JZDpcIm15LW9iamVjdC12ZXJzaW9uLWlkXCJ9LFxuICAgKiBgY2IoZXJyb3IpYCBfZnVuY3Rpb25fIC0gY2FsbGJhY2sgZnVuY3Rpb24gd2l0aCBgZXJyYCBhcyB0aGUgZXJyb3IgYXJndW1lbnQuIGBlcnJgIGlzIG51bGwgaWYgdGhlIG9wZXJhdGlvbiBpcyBzdWNjZXNzZnVsLlxuICAgKi9cbiAgc2V0T2JqZWN0VGFnZ2luZyhidWNrZXROYW1lLCBvYmplY3ROYW1lLCB0YWdzLCBwdXRPcHRzID0ge30sIGNiKSB7XG4gICAgaWYgKCFpc1ZhbGlkQnVja2V0TmFtZShidWNrZXROYW1lKSkge1xuICAgICAgdGhyb3cgbmV3IGVycm9ycy5JbnZhbGlkQnVja2V0TmFtZUVycm9yKCdJbnZhbGlkIGJ1Y2tldCBuYW1lOiAnICsgYnVja2V0TmFtZSlcbiAgICB9XG4gICAgaWYgKCFpc1ZhbGlkT2JqZWN0TmFtZShvYmplY3ROYW1lKSkge1xuICAgICAgdGhyb3cgbmV3IGVycm9ycy5JbnZhbGlkQnVja2V0TmFtZUVycm9yKCdJbnZhbGlkIG9iamVjdCBuYW1lOiAnICsgb2JqZWN0TmFtZSlcbiAgICB9XG5cbiAgICBpZiAoaXNGdW5jdGlvbihwdXRPcHRzKSkge1xuICAgICAgY2IgPSBwdXRPcHRzXG4gICAgICBwdXRPcHRzID0ge31cbiAgICB9XG5cbiAgICBpZiAoIWlzT2JqZWN0KHRhZ3MpKSB7XG4gICAgICB0aHJvdyBuZXcgZXJyb3JzLkludmFsaWRBcmd1bWVudEVycm9yKCd0YWdzIHNob3VsZCBiZSBvZiB0eXBlIFwib2JqZWN0XCInKVxuICAgIH1cbiAgICBpZiAoT2JqZWN0LmtleXModGFncykubGVuZ3RoID4gMTApIHtcbiAgICAgIHRocm93IG5ldyBlcnJvcnMuSW52YWxpZEFyZ3VtZW50RXJyb3IoJ01heGltdW0gdGFncyBhbGxvd2VkIGlzIDEwXCInKVxuICAgIH1cblxuICAgIGlmICghaXNGdW5jdGlvbihjYikpIHtcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ2NhbGxiYWNrIHNob3VsZCBiZSBvZiB0eXBlIFwiZnVuY3Rpb25cIicpXG4gICAgfVxuICAgIHJldHVybiB0aGlzLnNldFRhZ2dpbmcoeyBidWNrZXROYW1lLCBvYmplY3ROYW1lLCB0YWdzLCBwdXRPcHRzLCBjYiB9KVxuICB9XG5cbiAgLyoqIFJlbW92ZSBUYWdzIG9uIGFuIEJ1Y2tldC9PYmplY3QgYmFzZWQgb24gcGFyYW1zXG4gICAqIF9fQXJndW1lbnRzX19cbiAgICogYnVja2V0TmFtZSBfc3RyaW5nX1xuICAgKiBvYmplY3ROYW1lIF9zdHJpbmdfIChvcHRpb25hbClcbiAgICogcmVtb3ZlT3B0cyBfb2JqZWN0XyAoT3B0aW9uYWwpIGUuZyB7dmVyc2lvbklkOlwibXktb2JqZWN0LXZlcnNpb24taWRcIn0sXG4gICAqIGBjYihlcnJvcilgIF9mdW5jdGlvbl8gLSBjYWxsYmFjayBmdW5jdGlvbiB3aXRoIGBlcnJgIGFzIHRoZSBlcnJvciBhcmd1bWVudC4gYGVycmAgaXMgbnVsbCBpZiB0aGUgb3BlcmF0aW9uIGlzIHN1Y2Nlc3NmdWwuXG4gICAqL1xuICByZW1vdmVUYWdnaW5nKHsgYnVja2V0TmFtZSwgb2JqZWN0TmFtZSwgcmVtb3ZlT3B0cywgY2IgfSkge1xuICAgIGNvbnN0IG1ldGhvZCA9ICdERUxFVEUnXG4gICAgbGV0IHF1ZXJ5ID0gJ3RhZ2dpbmcnXG5cbiAgICBpZiAocmVtb3ZlT3B0cyAmJiBPYmplY3Qua2V5cyhyZW1vdmVPcHRzKS5sZW5ndGggJiYgcmVtb3ZlT3B0cy52ZXJzaW9uSWQpIHtcbiAgICAgIHF1ZXJ5ID0gYCR7cXVlcnl9JnZlcnNpb25JZD0ke3JlbW92ZU9wdHMudmVyc2lvbklkfWBcbiAgICB9XG4gICAgY29uc3QgcmVxdWVzdE9wdGlvbnMgPSB7IG1ldGhvZCwgYnVja2V0TmFtZSwgb2JqZWN0TmFtZSwgcXVlcnkgfVxuXG4gICAgaWYgKG9iamVjdE5hbWUpIHtcbiAgICAgIHJlcXVlc3RPcHRpb25zWydvYmplY3ROYW1lJ10gPSBvYmplY3ROYW1lXG4gICAgfVxuICAgIHRoaXMubWFrZVJlcXVlc3QocmVxdWVzdE9wdGlvbnMsICcnLCBbMjAwLCAyMDRdLCAnJywgdHJ1ZSwgY2IpXG4gIH1cblxuICAvKiogUmVtb3ZlIFRhZ3MgYXNzb2NpYXRlZCB3aXRoIGEgYnVja2V0XG4gICAqICBfX0FyZ3VtZW50c19fXG4gICAqIGJ1Y2tldE5hbWUgX3N0cmluZ19cbiAgICogYGNiKGVycm9yKWAgX2Z1bmN0aW9uXyAtIGNhbGxiYWNrIGZ1bmN0aW9uIHdpdGggYGVycmAgYXMgdGhlIGVycm9yIGFyZ3VtZW50LiBgZXJyYCBpcyBudWxsIGlmIHRoZSBvcGVyYXRpb24gaXMgc3VjY2Vzc2Z1bC5cbiAgICovXG4gIHJlbW92ZUJ1Y2tldFRhZ2dpbmcoYnVja2V0TmFtZSwgY2IpIHtcbiAgICBpZiAoIWlzVmFsaWRCdWNrZXROYW1lKGJ1Y2tldE5hbWUpKSB7XG4gICAgICB0aHJvdyBuZXcgZXJyb3JzLkludmFsaWRCdWNrZXROYW1lRXJyb3IoJ0ludmFsaWQgYnVja2V0IG5hbWU6ICcgKyBidWNrZXROYW1lKVxuICAgIH1cbiAgICBpZiAoIWlzRnVuY3Rpb24oY2IpKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdjYWxsYmFjayBzaG91bGQgYmUgb2YgdHlwZSBcImZ1bmN0aW9uXCInKVxuICAgIH1cbiAgICByZXR1cm4gdGhpcy5yZW1vdmVUYWdnaW5nKHsgYnVja2V0TmFtZSwgY2IgfSlcbiAgfVxuXG4gIC8qKiBSZW1vdmUgdGFncyBhc3NvY2lhdGVkIHdpdGggYW4gb2JqZWN0XG4gICAqIF9fQXJndW1lbnRzX19cbiAgICogYnVja2V0TmFtZSBfc3RyaW5nX1xuICAgKiBvYmplY3ROYW1lIF9zdHJpbmdfXG4gICAqIHJlbW92ZU9wdHMgX29iamVjdF8gKE9wdGlvbmFsKSBlLmcuIHtWZXJzaW9uSUQ6XCJteS1vYmplY3QtdmVyc2lvbi1pZFwifVxuICAgKiBgY2IoZXJyb3IpYCBfZnVuY3Rpb25fIC0gY2FsbGJhY2sgZnVuY3Rpb24gd2l0aCBgZXJyYCBhcyB0aGUgZXJyb3IgYXJndW1lbnQuIGBlcnJgIGlzIG51bGwgaWYgdGhlIG9wZXJhdGlvbiBpcyBzdWNjZXNzZnVsLlxuICAgKi9cbiAgcmVtb3ZlT2JqZWN0VGFnZ2luZyhidWNrZXROYW1lLCBvYmplY3ROYW1lLCByZW1vdmVPcHRzLCBjYikge1xuICAgIGlmICghaXNWYWxpZEJ1Y2tldE5hbWUoYnVja2V0TmFtZSkpIHtcbiAgICAgIHRocm93IG5ldyBlcnJvcnMuSW52YWxpZEJ1Y2tldE5hbWVFcnJvcignSW52YWxpZCBidWNrZXQgbmFtZTogJyArIGJ1Y2tldE5hbWUpXG4gICAgfVxuICAgIGlmICghaXNWYWxpZE9iamVjdE5hbWUob2JqZWN0TmFtZSkpIHtcbiAgICAgIHRocm93IG5ldyBlcnJvcnMuSW52YWxpZEJ1Y2tldE5hbWVFcnJvcignSW52YWxpZCBvYmplY3QgbmFtZTogJyArIG9iamVjdE5hbWUpXG4gICAgfVxuICAgIGlmIChpc0Z1bmN0aW9uKHJlbW92ZU9wdHMpKSB7XG4gICAgICBjYiA9IHJlbW92ZU9wdHNcbiAgICAgIHJlbW92ZU9wdHMgPSB7fVxuICAgIH1cbiAgICBpZiAocmVtb3ZlT3B0cyAmJiBPYmplY3Qua2V5cyhyZW1vdmVPcHRzKS5sZW5ndGggJiYgIWlzT2JqZWN0KHJlbW92ZU9wdHMpKSB7XG4gICAgICB0aHJvdyBuZXcgZXJyb3JzLkludmFsaWRBcmd1bWVudEVycm9yKCdyZW1vdmVPcHRzIHNob3VsZCBiZSBvZiB0eXBlIFwib2JqZWN0XCInKVxuICAgIH1cblxuICAgIGlmICghaXNGdW5jdGlvbihjYikpIHtcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ2NhbGxiYWNrIHNob3VsZCBiZSBvZiB0eXBlIFwiZnVuY3Rpb25cIicpXG4gICAgfVxuXG4gICAgcmV0dXJuIHRoaXMucmVtb3ZlVGFnZ2luZyh7IGJ1Y2tldE5hbWUsIG9iamVjdE5hbWUsIHJlbW92ZU9wdHMsIGNiIH0pXG4gIH1cblxuICAvKiogR2V0IFRhZ3MgYXNzb2NpYXRlZCB3aXRoIGEgQnVja2V0XG4gICAqICBfX0FyZ3VtZW50c19fXG4gICAqIGJ1Y2tldE5hbWUgX3N0cmluZ19cbiAgICogYGNiKGVycm9yLCB0YWdzKWAgX2Z1bmN0aW9uXyAtIGNhbGxiYWNrIGZ1bmN0aW9uIHdpdGggYGVycmAgYXMgdGhlIGVycm9yIGFyZ3VtZW50LiBgZXJyYCBpcyBudWxsIGlmIHRoZSBvcGVyYXRpb24gaXMgc3VjY2Vzc2Z1bC5cbiAgICovXG4gIGdldEJ1Y2tldFRhZ2dpbmcoYnVja2V0TmFtZSwgY2IpIHtcbiAgICBjb25zdCBtZXRob2QgPSAnR0VUJ1xuICAgIGNvbnN0IHF1ZXJ5ID0gJ3RhZ2dpbmcnXG4gICAgY29uc3QgcmVxdWVzdE9wdGlvbnMgPSB7IG1ldGhvZCwgYnVja2V0TmFtZSwgcXVlcnkgfVxuXG4gICAgdGhpcy5tYWtlUmVxdWVzdChyZXF1ZXN0T3B0aW9ucywgJycsIFsyMDBdLCAnJywgdHJ1ZSwgKGUsIHJlc3BvbnNlKSA9PiB7XG4gICAgICB2YXIgdHJhbnNmb3JtZXIgPSB0cmFuc2Zvcm1lcnMuZ2V0VGFnc1RyYW5zZm9ybWVyKClcbiAgICAgIGlmIChlKSB7XG4gICAgICAgIHJldHVybiBjYihlKVxuICAgICAgfVxuICAgICAgbGV0IHRhZ3NMaXN0XG4gICAgICBwaXBlc2V0dXAocmVzcG9uc2UsIHRyYW5zZm9ybWVyKVxuICAgICAgICAub24oJ2RhdGEnLCAocmVzdWx0KSA9PiAodGFnc0xpc3QgPSByZXN1bHQpKVxuICAgICAgICAub24oJ2Vycm9yJywgKGUpID0+IGNiKGUpKVxuICAgICAgICAub24oJ2VuZCcsICgpID0+IGNiKG51bGwsIHRhZ3NMaXN0KSlcbiAgICB9KVxuICB9XG5cbiAgLyoqIEdldCB0aGUgdGFncyBhc3NvY2lhdGVkIHdpdGggYSBidWNrZXQgT1IgYW4gb2JqZWN0XG4gICAqIGJ1Y2tldE5hbWUgX3N0cmluZ19cbiAgICogb2JqZWN0TmFtZSBfc3RyaW5nXyAoT3B0aW9uYWwpXG4gICAqIGdldE9wdHMgX29iamVjdF8gKE9wdGlvbmFsKSBlLmcge3ZlcnNpb25JZDpcIm15LW9iamVjdC12ZXJzaW9uLWlkXCJ9XG4gICAqIGBjYihlcnJvciwgdGFncylgIF9mdW5jdGlvbl8gLSBjYWxsYmFjayBmdW5jdGlvbiB3aXRoIGBlcnJgIGFzIHRoZSBlcnJvciBhcmd1bWVudC4gYGVycmAgaXMgbnVsbCBpZiB0aGUgb3BlcmF0aW9uIGlzIHN1Y2Nlc3NmdWwuXG4gICAqL1xuICBnZXRPYmplY3RUYWdnaW5nKGJ1Y2tldE5hbWUsIG9iamVjdE5hbWUsIGdldE9wdHMgPSB7fSwgY2IgPSAoKSA9PiBmYWxzZSkge1xuICAgIGNvbnN0IG1ldGhvZCA9ICdHRVQnXG4gICAgbGV0IHF1ZXJ5ID0gJ3RhZ2dpbmcnXG5cbiAgICBpZiAoIWlzVmFsaWRCdWNrZXROYW1lKGJ1Y2tldE5hbWUpKSB7XG4gICAgICB0aHJvdyBuZXcgZXJyb3JzLkludmFsaWRCdWNrZXROYW1lRXJyb3IoJ0ludmFsaWQgYnVja2V0IG5hbWU6ICcgKyBidWNrZXROYW1lKVxuICAgIH1cbiAgICBpZiAoIWlzVmFsaWRPYmplY3ROYW1lKG9iamVjdE5hbWUpKSB7XG4gICAgICB0aHJvdyBuZXcgZXJyb3JzLkludmFsaWRCdWNrZXROYW1lRXJyb3IoJ0ludmFsaWQgb2JqZWN0IG5hbWU6ICcgKyBvYmplY3ROYW1lKVxuICAgIH1cbiAgICBpZiAoaXNGdW5jdGlvbihnZXRPcHRzKSkge1xuICAgICAgY2IgPSBnZXRPcHRzXG4gICAgICBnZXRPcHRzID0ge31cbiAgICB9XG4gICAgaWYgKCFpc09iamVjdChnZXRPcHRzKSkge1xuICAgICAgdGhyb3cgbmV3IGVycm9ycy5JbnZhbGlkQXJndW1lbnRFcnJvcignZ2V0T3B0cyBzaG91bGQgYmUgb2YgdHlwZSBcIm9iamVjdFwiJylcbiAgICB9XG4gICAgaWYgKCFpc0Z1bmN0aW9uKGNiKSkge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignY2FsbGJhY2sgc2hvdWxkIGJlIG9mIHR5cGUgXCJmdW5jdGlvblwiJylcbiAgICB9XG5cbiAgICBpZiAoZ2V0T3B0cyAmJiBnZXRPcHRzLnZlcnNpb25JZCkge1xuICAgICAgcXVlcnkgPSBgJHtxdWVyeX0mdmVyc2lvbklkPSR7Z2V0T3B0cy52ZXJzaW9uSWR9YFxuICAgIH1cbiAgICBjb25zdCByZXF1ZXN0T3B0aW9ucyA9IHsgbWV0aG9kLCBidWNrZXROYW1lLCBxdWVyeSB9XG4gICAgaWYgKG9iamVjdE5hbWUpIHtcbiAgICAgIHJlcXVlc3RPcHRpb25zWydvYmplY3ROYW1lJ10gPSBvYmplY3ROYW1lXG4gICAgfVxuXG4gICAgdGhpcy5tYWtlUmVxdWVzdChyZXF1ZXN0T3B0aW9ucywgJycsIFsyMDBdLCAnJywgdHJ1ZSwgKGUsIHJlc3BvbnNlKSA9PiB7XG4gICAgICBjb25zdCB0cmFuc2Zvcm1lciA9IHRyYW5zZm9ybWVycy5nZXRUYWdzVHJhbnNmb3JtZXIoKVxuICAgICAgaWYgKGUpIHtcbiAgICAgICAgcmV0dXJuIGNiKGUpXG4gICAgICB9XG4gICAgICBsZXQgdGFnc0xpc3RcbiAgICAgIHBpcGVzZXR1cChyZXNwb25zZSwgdHJhbnNmb3JtZXIpXG4gICAgICAgIC5vbignZGF0YScsIChyZXN1bHQpID0+ICh0YWdzTGlzdCA9IHJlc3VsdCkpXG4gICAgICAgIC5vbignZXJyb3InLCAoZSkgPT4gY2IoZSkpXG4gICAgICAgIC5vbignZW5kJywgKCkgPT4gY2IobnVsbCwgdGFnc0xpc3QpKVxuICAgIH0pXG4gIH1cblxuICAvKipcbiAgICogQXBwbHkgbGlmZWN5Y2xlIGNvbmZpZ3VyYXRpb24gb24gYSBidWNrZXQuXG4gICAqIGJ1Y2tldE5hbWUgX3N0cmluZ19cbiAgICogcG9saWN5Q29uZmlnIF9vYmplY3RfIGEgdmFsaWQgcG9saWN5IGNvbmZpZ3VyYXRpb24gb2JqZWN0LlxuICAgKiBgY2IoZXJyb3IpYCBfZnVuY3Rpb25fIC0gY2FsbGJhY2sgZnVuY3Rpb24gd2l0aCBgZXJyYCBhcyB0aGUgZXJyb3IgYXJndW1lbnQuIGBlcnJgIGlzIG51bGwgaWYgdGhlIG9wZXJhdGlvbiBpcyBzdWNjZXNzZnVsLlxuICAgKi9cbiAgYXBwbHlCdWNrZXRMaWZlY3ljbGUoYnVja2V0TmFtZSwgcG9saWN5Q29uZmlnLCBjYikge1xuICAgIGNvbnN0IG1ldGhvZCA9ICdQVVQnXG4gICAgY29uc3QgcXVlcnkgPSAnbGlmZWN5Y2xlJ1xuXG4gICAgY29uc3QgZW5jb2RlciA9IG5ldyBUZXh0RW5jb2RlcigpXG4gICAgY29uc3QgaGVhZGVycyA9IHt9XG4gICAgY29uc3QgYnVpbGRlciA9IG5ldyB4bWwyanMuQnVpbGRlcih7XG4gICAgICByb290TmFtZTogJ0xpZmVjeWNsZUNvbmZpZ3VyYXRpb24nLFxuICAgICAgaGVhZGxlc3M6IHRydWUsXG4gICAgICByZW5kZXJPcHRzOiB7IHByZXR0eTogZmFsc2UgfSxcbiAgICB9KVxuICAgIGxldCBwYXlsb2FkID0gYnVpbGRlci5idWlsZE9iamVjdChwb2xpY3lDb25maWcpXG4gICAgcGF5bG9hZCA9IGVuY29kZXIuZW5jb2RlKHBheWxvYWQpXG4gICAgY29uc3QgcmVxdWVzdE9wdGlvbnMgPSB7IG1ldGhvZCwgYnVja2V0TmFtZSwgcXVlcnksIGhlYWRlcnMgfVxuICAgIGhlYWRlcnNbJ0NvbnRlbnQtTUQ1J10gPSB0b01kNShwYXlsb2FkKVxuXG4gICAgdGhpcy5tYWtlUmVxdWVzdChyZXF1ZXN0T3B0aW9ucywgcGF5bG9hZCwgWzIwMF0sICcnLCBmYWxzZSwgY2IpXG4gIH1cblxuICAvKiogUmVtb3ZlIGxpZmVjeWNsZSBjb25maWd1cmF0aW9uIG9mIGEgYnVja2V0LlxuICAgKiBidWNrZXROYW1lIF9zdHJpbmdfXG4gICAqIGBjYihlcnJvcilgIF9mdW5jdGlvbl8gLSBjYWxsYmFjayBmdW5jdGlvbiB3aXRoIGBlcnJgIGFzIHRoZSBlcnJvciBhcmd1bWVudC4gYGVycmAgaXMgbnVsbCBpZiB0aGUgb3BlcmF0aW9uIGlzIHN1Y2Nlc3NmdWwuXG4gICAqL1xuICByZW1vdmVCdWNrZXRMaWZlY3ljbGUoYnVja2V0TmFtZSwgY2IpIHtcbiAgICBpZiAoIWlzVmFsaWRCdWNrZXROYW1lKGJ1Y2tldE5hbWUpKSB7XG4gICAgICB0aHJvdyBuZXcgZXJyb3JzLkludmFsaWRCdWNrZXROYW1lRXJyb3IoJ0ludmFsaWQgYnVja2V0IG5hbWU6ICcgKyBidWNrZXROYW1lKVxuICAgIH1cbiAgICBjb25zdCBtZXRob2QgPSAnREVMRVRFJ1xuICAgIGNvbnN0IHF1ZXJ5ID0gJ2xpZmVjeWNsZSdcbiAgICB0aGlzLm1ha2VSZXF1ZXN0KHsgbWV0aG9kLCBidWNrZXROYW1lLCBxdWVyeSB9LCAnJywgWzIwNF0sICcnLCBmYWxzZSwgY2IpXG4gIH1cblxuICAvKiogU2V0L092ZXJyaWRlIGxpZmVjeWNsZSBjb25maWd1cmF0aW9uIG9uIGEgYnVja2V0LiBpZiB0aGUgY29uZmlndXJhdGlvbiBpcyBlbXB0eSwgaXQgcmVtb3ZlcyB0aGUgY29uZmlndXJhdGlvbi5cbiAgICogYnVja2V0TmFtZSBfc3RyaW5nX1xuICAgKiBsaWZlQ3ljbGVDb25maWcgX29iamVjdF8gb25lIG9mIHRoZSBmb2xsb3dpbmcgdmFsdWVzOiAobnVsbCBvciAnJykgdG8gcmVtb3ZlIHRoZSBsaWZlY3ljbGUgY29uZmlndXJhdGlvbi4gb3IgYSB2YWxpZCBsaWZlY3ljbGUgY29uZmlndXJhdGlvblxuICAgKiBgY2IoZXJyb3IpYCBfZnVuY3Rpb25fIC0gY2FsbGJhY2sgZnVuY3Rpb24gd2l0aCBgZXJyYCBhcyB0aGUgZXJyb3IgYXJndW1lbnQuIGBlcnJgIGlzIG51bGwgaWYgdGhlIG9wZXJhdGlvbiBpcyBzdWNjZXNzZnVsLlxuICAgKi9cbiAgc2V0QnVja2V0TGlmZWN5Y2xlKGJ1Y2tldE5hbWUsIGxpZmVDeWNsZUNvbmZpZyA9IG51bGwsIGNiKSB7XG4gICAgaWYgKCFpc1ZhbGlkQnVja2V0TmFtZShidWNrZXROYW1lKSkge1xuICAgICAgdGhyb3cgbmV3IGVycm9ycy5JbnZhbGlkQnVja2V0TmFtZUVycm9yKCdJbnZhbGlkIGJ1Y2tldCBuYW1lOiAnICsgYnVja2V0TmFtZSlcbiAgICB9XG4gICAgaWYgKF8uaXNFbXB0eShsaWZlQ3ljbGVDb25maWcpKSB7XG4gICAgICB0aGlzLnJlbW92ZUJ1Y2tldExpZmVjeWNsZShidWNrZXROYW1lLCBjYilcbiAgICB9IGVsc2Uge1xuICAgICAgdGhpcy5hcHBseUJ1Y2tldExpZmVjeWNsZShidWNrZXROYW1lLCBsaWZlQ3ljbGVDb25maWcsIGNiKVxuICAgIH1cbiAgfVxuXG4gIC8qKiBHZXQgbGlmZWN5Y2xlIGNvbmZpZ3VyYXRpb24gb24gYSBidWNrZXQuXG4gICAqIGJ1Y2tldE5hbWUgX3N0cmluZ19cbiAgICogYGNiKGNvbmZpZylgIF9mdW5jdGlvbl8gLSBjYWxsYmFjayBmdW5jdGlvbiB3aXRoIGxpZmVjeWNsZSBjb25maWd1cmF0aW9uIGFzIHRoZSBlcnJvciBhcmd1bWVudC5cbiAgICovXG4gIGdldEJ1Y2tldExpZmVjeWNsZShidWNrZXROYW1lLCBjYikge1xuICAgIGlmICghaXNWYWxpZEJ1Y2tldE5hbWUoYnVja2V0TmFtZSkpIHtcbiAgICAgIHRocm93IG5ldyBlcnJvcnMuSW52YWxpZEJ1Y2tldE5hbWVFcnJvcignSW52YWxpZCBidWNrZXQgbmFtZTogJyArIGJ1Y2tldE5hbWUpXG4gICAgfVxuICAgIGNvbnN0IG1ldGhvZCA9ICdHRVQnXG4gICAgY29uc3QgcXVlcnkgPSAnbGlmZWN5Y2xlJ1xuICAgIGNvbnN0IHJlcXVlc3RPcHRpb25zID0geyBtZXRob2QsIGJ1Y2tldE5hbWUsIHF1ZXJ5IH1cblxuICAgIHRoaXMubWFrZVJlcXVlc3QocmVxdWVzdE9wdGlvbnMsICcnLCBbMjAwXSwgJycsIHRydWUsIChlLCByZXNwb25zZSkgPT4ge1xuICAgICAgY29uc3QgdHJhbnNmb3JtZXIgPSB0cmFuc2Zvcm1lcnMubGlmZWN5Y2xlVHJhbnNmb3JtZXIoKVxuICAgICAgaWYgKGUpIHtcbiAgICAgICAgcmV0dXJuIGNiKGUpXG4gICAgICB9XG4gICAgICBsZXQgbGlmZWN5Y2xlQ29uZmlnXG4gICAgICBwaXBlc2V0dXAocmVzcG9uc2UsIHRyYW5zZm9ybWVyKVxuICAgICAgICAub24oJ2RhdGEnLCAocmVzdWx0KSA9PiAobGlmZWN5Y2xlQ29uZmlnID0gcmVzdWx0KSlcbiAgICAgICAgLm9uKCdlcnJvcicsIChlKSA9PiBjYihlKSlcbiAgICAgICAgLm9uKCdlbmQnLCAoKSA9PiBjYihudWxsLCBsaWZlY3ljbGVDb25maWcpKVxuICAgIH0pXG4gIH1cblxuICBzZXRPYmplY3RMb2NrQ29uZmlnKGJ1Y2tldE5hbWUsIGxvY2tDb25maWdPcHRzID0ge30sIGNiKSB7XG4gICAgY29uc3QgcmV0ZW50aW9uTW9kZXMgPSBbUkVURU5USU9OX01PREVTLkNPTVBMSUFOQ0UsIFJFVEVOVElPTl9NT0RFUy5HT1ZFUk5BTkNFXVxuICAgIGNvbnN0IHZhbGlkVW5pdHMgPSBbUkVURU5USU9OX1ZBTElESVRZX1VOSVRTLkRBWVMsIFJFVEVOVElPTl9WQUxJRElUWV9VTklUUy5ZRUFSU11cblxuICAgIGlmICghaXNWYWxpZEJ1Y2tldE5hbWUoYnVja2V0TmFtZSkpIHtcbiAgICAgIHRocm93IG5ldyBlcnJvcnMuSW52YWxpZEJ1Y2tldE5hbWVFcnJvcignSW52YWxpZCBidWNrZXQgbmFtZTogJyArIGJ1Y2tldE5hbWUpXG4gICAgfVxuXG4gICAgaWYgKGxvY2tDb25maWdPcHRzLm1vZGUgJiYgIXJldGVudGlvbk1vZGVzLmluY2x1ZGVzKGxvY2tDb25maWdPcHRzLm1vZGUpKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKGBsb2NrQ29uZmlnT3B0cy5tb2RlIHNob3VsZCBiZSBvbmUgb2YgJHtyZXRlbnRpb25Nb2Rlc31gKVxuICAgIH1cbiAgICBpZiAobG9ja0NvbmZpZ09wdHMudW5pdCAmJiAhdmFsaWRVbml0cy5pbmNsdWRlcyhsb2NrQ29uZmlnT3B0cy51bml0KSkge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcihgbG9ja0NvbmZpZ09wdHMudW5pdCBzaG91bGQgYmUgb25lIG9mICR7dmFsaWRVbml0c31gKVxuICAgIH1cbiAgICBpZiAobG9ja0NvbmZpZ09wdHMudmFsaWRpdHkgJiYgIWlzTnVtYmVyKGxvY2tDb25maWdPcHRzLnZhbGlkaXR5KSkge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcihgbG9ja0NvbmZpZ09wdHMudmFsaWRpdHkgc2hvdWxkIGJlIGEgbnVtYmVyYClcbiAgICB9XG5cbiAgICBjb25zdCBtZXRob2QgPSAnUFVUJ1xuICAgIGNvbnN0IHF1ZXJ5ID0gJ29iamVjdC1sb2NrJ1xuXG4gICAgbGV0IGNvbmZpZyA9IHtcbiAgICAgIE9iamVjdExvY2tFbmFibGVkOiAnRW5hYmxlZCcsXG4gICAgfVxuICAgIGNvbnN0IGNvbmZpZ0tleXMgPSBPYmplY3Qua2V5cyhsb2NrQ29uZmlnT3B0cylcbiAgICAvLyBDaGVjayBpZiBrZXlzIGFyZSBwcmVzZW50IGFuZCBhbGwga2V5cyBhcmUgcHJlc2VudC5cbiAgICBpZiAoY29uZmlnS2V5cy5sZW5ndGggPiAwKSB7XG4gICAgICBpZiAoXy5kaWZmZXJlbmNlKGNvbmZpZ0tleXMsIFsndW5pdCcsICdtb2RlJywgJ3ZhbGlkaXR5J10pLmxlbmd0aCAhPT0gMCkge1xuICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKFxuICAgICAgICAgIGBsb2NrQ29uZmlnT3B0cy5tb2RlLGxvY2tDb25maWdPcHRzLnVuaXQsbG9ja0NvbmZpZ09wdHMudmFsaWRpdHkgYWxsIHRoZSBwcm9wZXJ0aWVzIHNob3VsZCBiZSBzcGVjaWZpZWQuYCxcbiAgICAgICAgKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY29uZmlnLlJ1bGUgPSB7XG4gICAgICAgICAgRGVmYXVsdFJldGVudGlvbjoge30sXG4gICAgICAgIH1cbiAgICAgICAgaWYgKGxvY2tDb25maWdPcHRzLm1vZGUpIHtcbiAgICAgICAgICBjb25maWcuUnVsZS5EZWZhdWx0UmV0ZW50aW9uLk1vZGUgPSBsb2NrQ29uZmlnT3B0cy5tb2RlXG4gICAgICAgIH1cbiAgICAgICAgaWYgKGxvY2tDb25maWdPcHRzLnVuaXQgPT09IFJFVEVOVElPTl9WQUxJRElUWV9VTklUUy5EQVlTKSB7XG4gICAgICAgICAgY29uZmlnLlJ1bGUuRGVmYXVsdFJldGVudGlvbi5EYXlzID0gbG9ja0NvbmZpZ09wdHMudmFsaWRpdHlcbiAgICAgICAgfSBlbHNlIGlmIChsb2NrQ29uZmlnT3B0cy51bml0ID09PSBSRVRFTlRJT05fVkFMSURJVFlfVU5JVFMuWUVBUlMpIHtcbiAgICAgICAgICBjb25maWcuUnVsZS5EZWZhdWx0UmV0ZW50aW9uLlllYXJzID0gbG9ja0NvbmZpZ09wdHMudmFsaWRpdHlcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIGNvbnN0IGJ1aWxkZXIgPSBuZXcgeG1sMmpzLkJ1aWxkZXIoe1xuICAgICAgcm9vdE5hbWU6ICdPYmplY3RMb2NrQ29uZmlndXJhdGlvbicsXG4gICAgICByZW5kZXJPcHRzOiB7IHByZXR0eTogZmFsc2UgfSxcbiAgICAgIGhlYWRsZXNzOiB0cnVlLFxuICAgIH0pXG4gICAgY29uc3QgcGF5bG9hZCA9IGJ1aWxkZXIuYnVpbGRPYmplY3QoY29uZmlnKVxuXG4gICAgY29uc3QgaGVhZGVycyA9IHt9XG4gICAgaGVhZGVyc1snQ29udGVudC1NRDUnXSA9IHRvTWQ1KHBheWxvYWQpXG5cbiAgICB0aGlzLm1ha2VSZXF1ZXN0KHsgbWV0aG9kLCBidWNrZXROYW1lLCBxdWVyeSwgaGVhZGVycyB9LCBwYXlsb2FkLCBbMjAwXSwgJycsIGZhbHNlLCBjYilcbiAgfVxuXG4gIGdldE9iamVjdExvY2tDb25maWcoYnVja2V0TmFtZSwgY2IpIHtcbiAgICBpZiAoIWlzVmFsaWRCdWNrZXROYW1lKGJ1Y2tldE5hbWUpKSB7XG4gICAgICB0aHJvdyBuZXcgZXJyb3JzLkludmFsaWRCdWNrZXROYW1lRXJyb3IoJ0ludmFsaWQgYnVja2V0IG5hbWU6ICcgKyBidWNrZXROYW1lKVxuICAgIH1cbiAgICBpZiAoIWlzRnVuY3Rpb24oY2IpKSB7XG4gICAgICB0aHJvdyBuZXcgZXJyb3JzLkludmFsaWRBcmd1bWVudEVycm9yKCdjYWxsYmFjayBzaG91bGQgYmUgb2YgdHlwZSBcImZ1bmN0aW9uXCInKVxuICAgIH1cbiAgICBjb25zdCBtZXRob2QgPSAnR0VUJ1xuICAgIGNvbnN0IHF1ZXJ5ID0gJ29iamVjdC1sb2NrJ1xuXG4gICAgdGhpcy5tYWtlUmVxdWVzdCh7IG1ldGhvZCwgYnVja2V0TmFtZSwgcXVlcnkgfSwgJycsIFsyMDBdLCAnJywgdHJ1ZSwgKGUsIHJlc3BvbnNlKSA9PiB7XG4gICAgICBpZiAoZSkge1xuICAgICAgICByZXR1cm4gY2IoZSlcbiAgICAgIH1cblxuICAgICAgbGV0IG9iamVjdExvY2tDb25maWcgPSBCdWZmZXIuZnJvbSgnJylcbiAgICAgIHBpcGVzZXR1cChyZXNwb25zZSwgdHJhbnNmb3JtZXJzLm9iamVjdExvY2tUcmFuc2Zvcm1lcigpKVxuICAgICAgICAub24oJ2RhdGEnLCAoZGF0YSkgPT4ge1xuICAgICAgICAgIG9iamVjdExvY2tDb25maWcgPSBkYXRhXG4gICAgICAgIH0pXG4gICAgICAgIC5vbignZXJyb3InLCBjYilcbiAgICAgICAgLm9uKCdlbmQnLCAoKSA9PiB7XG4gICAgICAgICAgY2IobnVsbCwgb2JqZWN0TG9ja0NvbmZpZylcbiAgICAgICAgfSlcbiAgICB9KVxuICB9XG5cbiAgcHV0T2JqZWN0UmV0ZW50aW9uKGJ1Y2tldE5hbWUsIG9iamVjdE5hbWUsIHJldGVudGlvbk9wdHMgPSB7fSwgY2IpIHtcbiAgICBpZiAoIWlzVmFsaWRCdWNrZXROYW1lKGJ1Y2tldE5hbWUpKSB7XG4gICAgICB0aHJvdyBuZXcgZXJyb3JzLkludmFsaWRCdWNrZXROYW1lRXJyb3IoJ0ludmFsaWQgYnVja2V0IG5hbWU6ICcgKyBidWNrZXROYW1lKVxuICAgIH1cbiAgICBpZiAoIWlzVmFsaWRPYmplY3ROYW1lKG9iamVjdE5hbWUpKSB7XG4gICAgICB0aHJvdyBuZXcgZXJyb3JzLkludmFsaWRPYmplY3ROYW1lRXJyb3IoYEludmFsaWQgb2JqZWN0IG5hbWU6ICR7b2JqZWN0TmFtZX1gKVxuICAgIH1cbiAgICBpZiAoIWlzT2JqZWN0KHJldGVudGlvbk9wdHMpKSB7XG4gICAgICB0aHJvdyBuZXcgZXJyb3JzLkludmFsaWRBcmd1bWVudEVycm9yKCdyZXRlbnRpb25PcHRzIHNob3VsZCBiZSBvZiB0eXBlIFwib2JqZWN0XCInKVxuICAgIH0gZWxzZSB7XG4gICAgICBpZiAocmV0ZW50aW9uT3B0cy5nb3Zlcm5hbmNlQnlwYXNzICYmICFpc0Jvb2xlYW4ocmV0ZW50aW9uT3B0cy5nb3Zlcm5hbmNlQnlwYXNzKSkge1xuICAgICAgICB0aHJvdyBuZXcgZXJyb3JzLkludmFsaWRBcmd1bWVudEVycm9yKCdJbnZhbGlkIHZhbHVlIGZvciBnb3Zlcm5hbmNlQnlwYXNzJywgcmV0ZW50aW9uT3B0cy5nb3Zlcm5hbmNlQnlwYXNzKVxuICAgICAgfVxuICAgICAgaWYgKFxuICAgICAgICByZXRlbnRpb25PcHRzLm1vZGUgJiZcbiAgICAgICAgIVtSRVRFTlRJT05fTU9ERVMuQ09NUExJQU5DRSwgUkVURU5USU9OX01PREVTLkdPVkVSTkFOQ0VdLmluY2x1ZGVzKHJldGVudGlvbk9wdHMubW9kZSlcbiAgICAgICkge1xuICAgICAgICB0aHJvdyBuZXcgZXJyb3JzLkludmFsaWRBcmd1bWVudEVycm9yKCdJbnZhbGlkIG9iamVjdCByZXRlbnRpb24gbW9kZSAnLCByZXRlbnRpb25PcHRzLm1vZGUpXG4gICAgICB9XG4gICAgICBpZiAocmV0ZW50aW9uT3B0cy5yZXRhaW5VbnRpbERhdGUgJiYgIWlzU3RyaW5nKHJldGVudGlvbk9wdHMucmV0YWluVW50aWxEYXRlKSkge1xuICAgICAgICB0aHJvdyBuZXcgZXJyb3JzLkludmFsaWRBcmd1bWVudEVycm9yKCdJbnZhbGlkIHZhbHVlIGZvciByZXRhaW5VbnRpbERhdGUnLCByZXRlbnRpb25PcHRzLnJldGFpblVudGlsRGF0ZSlcbiAgICAgIH1cbiAgICAgIGlmIChyZXRlbnRpb25PcHRzLnZlcnNpb25JZCAmJiAhaXNTdHJpbmcocmV0ZW50aW9uT3B0cy52ZXJzaW9uSWQpKSB7XG4gICAgICAgIHRocm93IG5ldyBlcnJvcnMuSW52YWxpZEFyZ3VtZW50RXJyb3IoJ0ludmFsaWQgdmFsdWUgZm9yIHZlcnNpb25JZCcsIHJldGVudGlvbk9wdHMudmVyc2lvbklkKVxuICAgICAgfVxuICAgIH1cbiAgICBpZiAoIWlzRnVuY3Rpb24oY2IpKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdjYWxsYmFjayBzaG91bGQgYmUgb2YgdHlwZSBcImZ1bmN0aW9uXCInKVxuICAgIH1cblxuICAgIGNvbnN0IG1ldGhvZCA9ICdQVVQnXG4gICAgbGV0IHF1ZXJ5ID0gJ3JldGVudGlvbidcblxuICAgIGNvbnN0IGhlYWRlcnMgPSB7fVxuICAgIGlmIChyZXRlbnRpb25PcHRzLmdvdmVybmFuY2VCeXBhc3MpIHtcbiAgICAgIGhlYWRlcnNbJ1gtQW16LUJ5cGFzcy1Hb3Zlcm5hbmNlLVJldGVudGlvbiddID0gdHJ1ZVxuICAgIH1cblxuICAgIGNvbnN0IGJ1aWxkZXIgPSBuZXcgeG1sMmpzLkJ1aWxkZXIoeyByb290TmFtZTogJ1JldGVudGlvbicsIHJlbmRlck9wdHM6IHsgcHJldHR5OiBmYWxzZSB9LCBoZWFkbGVzczogdHJ1ZSB9KVxuICAgIGNvbnN0IHBhcmFtcyA9IHt9XG5cbiAgICBpZiAocmV0ZW50aW9uT3B0cy5tb2RlKSB7XG4gICAgICBwYXJhbXMuTW9kZSA9IHJldGVudGlvbk9wdHMubW9kZVxuICAgIH1cbiAgICBpZiAocmV0ZW50aW9uT3B0cy5yZXRhaW5VbnRpbERhdGUpIHtcbiAgICAgIHBhcmFtcy5SZXRhaW5VbnRpbERhdGUgPSByZXRlbnRpb25PcHRzLnJldGFpblVudGlsRGF0ZVxuICAgIH1cbiAgICBpZiAocmV0ZW50aW9uT3B0cy52ZXJzaW9uSWQpIHtcbiAgICAgIHF1ZXJ5ICs9IGAmdmVyc2lvbklkPSR7cmV0ZW50aW9uT3B0cy52ZXJzaW9uSWR9YFxuICAgIH1cblxuICAgIGxldCBwYXlsb2FkID0gYnVpbGRlci5idWlsZE9iamVjdChwYXJhbXMpXG5cbiAgICBoZWFkZXJzWydDb250ZW50LU1ENSddID0gdG9NZDUocGF5bG9hZClcbiAgICB0aGlzLm1ha2VSZXF1ZXN0KHsgbWV0aG9kLCBidWNrZXROYW1lLCBvYmplY3ROYW1lLCBxdWVyeSwgaGVhZGVycyB9LCBwYXlsb2FkLCBbMjAwLCAyMDRdLCAnJywgZmFsc2UsIGNiKVxuICB9XG5cbiAgZ2V0T2JqZWN0UmV0ZW50aW9uKGJ1Y2tldE5hbWUsIG9iamVjdE5hbWUsIGdldE9wdHMsIGNiKSB7XG4gICAgaWYgKCFpc1ZhbGlkQnVja2V0TmFtZShidWNrZXROYW1lKSkge1xuICAgICAgdGhyb3cgbmV3IGVycm9ycy5JbnZhbGlkQnVja2V0TmFtZUVycm9yKCdJbnZhbGlkIGJ1Y2tldCBuYW1lOiAnICsgYnVja2V0TmFtZSlcbiAgICB9XG4gICAgaWYgKCFpc1ZhbGlkT2JqZWN0TmFtZShvYmplY3ROYW1lKSkge1xuICAgICAgdGhyb3cgbmV3IGVycm9ycy5JbnZhbGlkT2JqZWN0TmFtZUVycm9yKGBJbnZhbGlkIG9iamVjdCBuYW1lOiAke29iamVjdE5hbWV9YClcbiAgICB9XG4gICAgaWYgKCFpc09iamVjdChnZXRPcHRzKSkge1xuICAgICAgdGhyb3cgbmV3IGVycm9ycy5JbnZhbGlkQXJndW1lbnRFcnJvcignY2FsbGJhY2sgc2hvdWxkIGJlIG9mIHR5cGUgXCJvYmplY3RcIicpXG4gICAgfSBlbHNlIGlmIChnZXRPcHRzLnZlcnNpb25JZCAmJiAhaXNTdHJpbmcoZ2V0T3B0cy52ZXJzaW9uSWQpKSB7XG4gICAgICB0aHJvdyBuZXcgZXJyb3JzLkludmFsaWRBcmd1bWVudEVycm9yKCdWZXJzaW9uSUQgc2hvdWxkIGJlIG9mIHR5cGUgXCJzdHJpbmdcIicpXG4gICAgfVxuICAgIGlmIChjYiAmJiAhaXNGdW5jdGlvbihjYikpIHtcbiAgICAgIHRocm93IG5ldyBlcnJvcnMuSW52YWxpZEFyZ3VtZW50RXJyb3IoJ2NhbGxiYWNrIHNob3VsZCBiZSBvZiB0eXBlIFwiZnVuY3Rpb25cIicpXG4gICAgfVxuICAgIGNvbnN0IG1ldGhvZCA9ICdHRVQnXG4gICAgbGV0IHF1ZXJ5ID0gJ3JldGVudGlvbidcbiAgICBpZiAoZ2V0T3B0cy52ZXJzaW9uSWQpIHtcbiAgICAgIHF1ZXJ5ICs9IGAmdmVyc2lvbklkPSR7Z2V0T3B0cy52ZXJzaW9uSWR9YFxuICAgIH1cblxuICAgIHRoaXMubWFrZVJlcXVlc3QoeyBtZXRob2QsIGJ1Y2tldE5hbWUsIG9iamVjdE5hbWUsIHF1ZXJ5IH0sICcnLCBbMjAwXSwgJycsIHRydWUsIChlLCByZXNwb25zZSkgPT4ge1xuICAgICAgaWYgKGUpIHtcbiAgICAgICAgcmV0dXJuIGNiKGUpXG4gICAgICB9XG5cbiAgICAgIGxldCByZXRlbnRpb25Db25maWcgPSBCdWZmZXIuZnJvbSgnJylcbiAgICAgIHBpcGVzZXR1cChyZXNwb25zZSwgdHJhbnNmb3JtZXJzLm9iamVjdFJldGVudGlvblRyYW5zZm9ybWVyKCkpXG4gICAgICAgIC5vbignZGF0YScsIChkYXRhKSA9PiB7XG4gICAgICAgICAgcmV0ZW50aW9uQ29uZmlnID0gZGF0YVxuICAgICAgICB9KVxuICAgICAgICAub24oJ2Vycm9yJywgY2IpXG4gICAgICAgIC5vbignZW5kJywgKCkgPT4ge1xuICAgICAgICAgIGNiKG51bGwsIHJldGVudGlvbkNvbmZpZylcbiAgICAgICAgfSlcbiAgICB9KVxuICB9XG5cbiAgc2V0QnVja2V0RW5jcnlwdGlvbihidWNrZXROYW1lLCBlbmNyeXB0aW9uQ29uZmlnLCBjYikge1xuICAgIGlmICghaXNWYWxpZEJ1Y2tldE5hbWUoYnVja2V0TmFtZSkpIHtcbiAgICAgIHRocm93IG5ldyBlcnJvcnMuSW52YWxpZEJ1Y2tldE5hbWVFcnJvcignSW52YWxpZCBidWNrZXQgbmFtZTogJyArIGJ1Y2tldE5hbWUpXG4gICAgfVxuXG4gICAgaWYgKGlzRnVuY3Rpb24oZW5jcnlwdGlvbkNvbmZpZykpIHtcbiAgICAgIGNiID0gZW5jcnlwdGlvbkNvbmZpZ1xuICAgICAgZW5jcnlwdGlvbkNvbmZpZyA9IG51bGxcbiAgICB9XG5cbiAgICBpZiAoIV8uaXNFbXB0eShlbmNyeXB0aW9uQ29uZmlnKSAmJiBlbmNyeXB0aW9uQ29uZmlnLlJ1bGUubGVuZ3RoID4gMSkge1xuICAgICAgdGhyb3cgbmV3IGVycm9ycy5JbnZhbGlkQXJndW1lbnRFcnJvcignSW52YWxpZCBSdWxlIGxlbmd0aC4gT25seSBvbmUgcnVsZSBpcyBhbGxvd2VkLjogJyArIGVuY3J5cHRpb25Db25maWcuUnVsZSlcbiAgICB9XG4gICAgaWYgKGNiICYmICFpc0Z1bmN0aW9uKGNiKSkge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignY2FsbGJhY2sgc2hvdWxkIGJlIG9mIHR5cGUgXCJmdW5jdGlvblwiJylcbiAgICB9XG5cbiAgICBsZXQgZW5jcnlwdGlvbk9iaiA9IGVuY3J5cHRpb25Db25maWdcbiAgICBpZiAoXy5pc0VtcHR5KGVuY3J5cHRpb25Db25maWcpKSB7XG4gICAgICBlbmNyeXB0aW9uT2JqID0ge1xuICAgICAgICAvLyBEZWZhdWx0IE1pbklPIFNlcnZlciBTdXBwb3J0ZWQgUnVsZVxuICAgICAgICBSdWxlOiBbXG4gICAgICAgICAge1xuICAgICAgICAgICAgQXBwbHlTZXJ2ZXJTaWRlRW5jcnlwdGlvbkJ5RGVmYXVsdDoge1xuICAgICAgICAgICAgICBTU0VBbGdvcml0aG06ICdBRVMyNTYnLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9LFxuICAgICAgICBdLFxuICAgICAgfVxuICAgIH1cblxuICAgIGxldCBtZXRob2QgPSAnUFVUJ1xuICAgIGxldCBxdWVyeSA9ICdlbmNyeXB0aW9uJ1xuICAgIGxldCBidWlsZGVyID0gbmV3IHhtbDJqcy5CdWlsZGVyKHtcbiAgICAgIHJvb3ROYW1lOiAnU2VydmVyU2lkZUVuY3J5cHRpb25Db25maWd1cmF0aW9uJyxcbiAgICAgIHJlbmRlck9wdHM6IHsgcHJldHR5OiBmYWxzZSB9LFxuICAgICAgaGVhZGxlc3M6IHRydWUsXG4gICAgfSlcbiAgICBsZXQgcGF5bG9hZCA9IGJ1aWxkZXIuYnVpbGRPYmplY3QoZW5jcnlwdGlvbk9iailcblxuICAgIGNvbnN0IGhlYWRlcnMgPSB7fVxuICAgIGhlYWRlcnNbJ0NvbnRlbnQtTUQ1J10gPSB0b01kNShwYXlsb2FkKVxuXG4gICAgdGhpcy5tYWtlUmVxdWVzdCh7IG1ldGhvZCwgYnVja2V0TmFtZSwgcXVlcnksIGhlYWRlcnMgfSwgcGF5bG9hZCwgWzIwMF0sICcnLCBmYWxzZSwgY2IpXG4gIH1cblxuICBnZXRCdWNrZXRFbmNyeXB0aW9uKGJ1Y2tldE5hbWUsIGNiKSB7XG4gICAgaWYgKCFpc1ZhbGlkQnVja2V0TmFtZShidWNrZXROYW1lKSkge1xuICAgICAgdGhyb3cgbmV3IGVycm9ycy5JbnZhbGlkQnVja2V0TmFtZUVycm9yKCdJbnZhbGlkIGJ1Y2tldCBuYW1lOiAnICsgYnVja2V0TmFtZSlcbiAgICB9XG4gICAgaWYgKCFpc0Z1bmN0aW9uKGNiKSkge1xuICAgICAgdGhyb3cgbmV3IGVycm9ycy5JbnZhbGlkQXJndW1lbnRFcnJvcignY2FsbGJhY2sgc2hvdWxkIGJlIG9mIHR5cGUgXCJmdW5jdGlvblwiJylcbiAgICB9XG4gICAgY29uc3QgbWV0aG9kID0gJ0dFVCdcbiAgICBjb25zdCBxdWVyeSA9ICdlbmNyeXB0aW9uJ1xuXG4gICAgdGhpcy5tYWtlUmVxdWVzdCh7IG1ldGhvZCwgYnVja2V0TmFtZSwgcXVlcnkgfSwgJycsIFsyMDBdLCAnJywgdHJ1ZSwgKGUsIHJlc3BvbnNlKSA9PiB7XG4gICAgICBpZiAoZSkge1xuICAgICAgICByZXR1cm4gY2IoZSlcbiAgICAgIH1cblxuICAgICAgbGV0IGJ1Y2tldEVuY0NvbmZpZyA9IEJ1ZmZlci5mcm9tKCcnKVxuICAgICAgcGlwZXNldHVwKHJlc3BvbnNlLCB0cmFuc2Zvcm1lcnMuYnVja2V0RW5jcnlwdGlvblRyYW5zZm9ybWVyKCkpXG4gICAgICAgIC5vbignZGF0YScsIChkYXRhKSA9PiB7XG4gICAgICAgICAgYnVja2V0RW5jQ29uZmlnID0gZGF0YVxuICAgICAgICB9KVxuICAgICAgICAub24oJ2Vycm9yJywgY2IpXG4gICAgICAgIC5vbignZW5kJywgKCkgPT4ge1xuICAgICAgICAgIGNiKG51bGwsIGJ1Y2tldEVuY0NvbmZpZylcbiAgICAgICAgfSlcbiAgICB9KVxuICB9XG4gIHJlbW92ZUJ1Y2tldEVuY3J5cHRpb24oYnVja2V0TmFtZSwgY2IpIHtcbiAgICBpZiAoIWlzVmFsaWRCdWNrZXROYW1lKGJ1Y2tldE5hbWUpKSB7XG4gICAgICB0aHJvdyBuZXcgZXJyb3JzLkludmFsaWRCdWNrZXROYW1lRXJyb3IoJ0ludmFsaWQgYnVja2V0IG5hbWU6ICcgKyBidWNrZXROYW1lKVxuICAgIH1cbiAgICBpZiAoIWlzRnVuY3Rpb24oY2IpKSB7XG4gICAgICB0aHJvdyBuZXcgZXJyb3JzLkludmFsaWRBcmd1bWVudEVycm9yKCdjYWxsYmFjayBzaG91bGQgYmUgb2YgdHlwZSBcImZ1bmN0aW9uXCInKVxuICAgIH1cbiAgICBjb25zdCBtZXRob2QgPSAnREVMRVRFJ1xuICAgIGNvbnN0IHF1ZXJ5ID0gJ2VuY3J5cHRpb24nXG5cbiAgICB0aGlzLm1ha2VSZXF1ZXN0KHsgbWV0aG9kLCBidWNrZXROYW1lLCBxdWVyeSB9LCAnJywgWzIwNF0sICcnLCBmYWxzZSwgY2IpXG4gIH1cblxuICBzZXRCdWNrZXRSZXBsaWNhdGlvbihidWNrZXROYW1lLCByZXBsaWNhdGlvbkNvbmZpZyA9IHt9LCBjYikge1xuICAgIGlmICghaXNWYWxpZEJ1Y2tldE5hbWUoYnVja2V0TmFtZSkpIHtcbiAgICAgIHRocm93IG5ldyBlcnJvcnMuSW52YWxpZEJ1Y2tldE5hbWVFcnJvcignSW52YWxpZCBidWNrZXQgbmFtZTogJyArIGJ1Y2tldE5hbWUpXG4gICAgfVxuICAgIGlmICghaXNPYmplY3QocmVwbGljYXRpb25Db25maWcpKSB7XG4gICAgICB0aHJvdyBuZXcgZXJyb3JzLkludmFsaWRBcmd1bWVudEVycm9yKCdyZXBsaWNhdGlvbkNvbmZpZyBzaG91bGQgYmUgb2YgdHlwZSBcIm9iamVjdFwiJylcbiAgICB9IGVsc2Uge1xuICAgICAgaWYgKF8uaXNFbXB0eShyZXBsaWNhdGlvbkNvbmZpZy5yb2xlKSkge1xuICAgICAgICB0aHJvdyBuZXcgZXJyb3JzLkludmFsaWRBcmd1bWVudEVycm9yKCdSb2xlIGNhbm5vdCBiZSBlbXB0eScpXG4gICAgICB9IGVsc2UgaWYgKHJlcGxpY2F0aW9uQ29uZmlnLnJvbGUgJiYgIWlzU3RyaW5nKHJlcGxpY2F0aW9uQ29uZmlnLnJvbGUpKSB7XG4gICAgICAgIHRocm93IG5ldyBlcnJvcnMuSW52YWxpZEFyZ3VtZW50RXJyb3IoJ0ludmFsaWQgdmFsdWUgZm9yIHJvbGUnLCByZXBsaWNhdGlvbkNvbmZpZy5yb2xlKVxuICAgICAgfVxuICAgICAgaWYgKF8uaXNFbXB0eShyZXBsaWNhdGlvbkNvbmZpZy5ydWxlcykpIHtcbiAgICAgICAgdGhyb3cgbmV3IGVycm9ycy5JbnZhbGlkQXJndW1lbnRFcnJvcignTWluaW11bSBvbmUgcmVwbGljYXRpb24gcnVsZSBtdXN0IGJlIHNwZWNpZmllZCcpXG4gICAgICB9XG4gICAgfVxuICAgIGlmICghaXNGdW5jdGlvbihjYikpIHtcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ2NhbGxiYWNrIHNob3VsZCBiZSBvZiB0eXBlIFwiZnVuY3Rpb25cIicpXG4gICAgfVxuXG4gICAgY29uc3QgbWV0aG9kID0gJ1BVVCdcbiAgICBsZXQgcXVlcnkgPSAncmVwbGljYXRpb24nXG4gICAgY29uc3QgaGVhZGVycyA9IHt9XG5cbiAgICBjb25zdCByZXBsaWNhdGlvblBhcmFtc0NvbmZpZyA9IHtcbiAgICAgIFJlcGxpY2F0aW9uQ29uZmlndXJhdGlvbjoge1xuICAgICAgICBSb2xlOiByZXBsaWNhdGlvbkNvbmZpZy5yb2xlLFxuICAgICAgICBSdWxlOiByZXBsaWNhdGlvbkNvbmZpZy5ydWxlcyxcbiAgICAgIH0sXG4gICAgfVxuXG4gICAgY29uc3QgYnVpbGRlciA9IG5ldyB4bWwyanMuQnVpbGRlcih7IHJlbmRlck9wdHM6IHsgcHJldHR5OiBmYWxzZSB9LCBoZWFkbGVzczogdHJ1ZSB9KVxuXG4gICAgbGV0IHBheWxvYWQgPSBidWlsZGVyLmJ1aWxkT2JqZWN0KHJlcGxpY2F0aW9uUGFyYW1zQ29uZmlnKVxuXG4gICAgaGVhZGVyc1snQ29udGVudC1NRDUnXSA9IHRvTWQ1KHBheWxvYWQpXG5cbiAgICB0aGlzLm1ha2VSZXF1ZXN0KHsgbWV0aG9kLCBidWNrZXROYW1lLCBxdWVyeSwgaGVhZGVycyB9LCBwYXlsb2FkLCBbMjAwXSwgJycsIGZhbHNlLCBjYilcbiAgfVxuXG4gIGdldEJ1Y2tldFJlcGxpY2F0aW9uKGJ1Y2tldE5hbWUsIGNiKSB7XG4gICAgaWYgKCFpc1ZhbGlkQnVja2V0TmFtZShidWNrZXROYW1lKSkge1xuICAgICAgdGhyb3cgbmV3IGVycm9ycy5JbnZhbGlkQnVja2V0TmFtZUVycm9yKCdJbnZhbGlkIGJ1Y2tldCBuYW1lOiAnICsgYnVja2V0TmFtZSlcbiAgICB9XG4gICAgaWYgKCFpc0Z1bmN0aW9uKGNiKSkge1xuICAgICAgdGhyb3cgbmV3IGVycm9ycy5JbnZhbGlkQXJndW1lbnRFcnJvcignY2FsbGJhY2sgc2hvdWxkIGJlIG9mIHR5cGUgXCJmdW5jdGlvblwiJylcbiAgICB9XG4gICAgY29uc3QgbWV0aG9kID0gJ0dFVCdcbiAgICBjb25zdCBxdWVyeSA9ICdyZXBsaWNhdGlvbidcblxuICAgIHRoaXMubWFrZVJlcXVlc3QoeyBtZXRob2QsIGJ1Y2tldE5hbWUsIHF1ZXJ5IH0sICcnLCBbMjAwXSwgJycsIHRydWUsIChlLCByZXNwb25zZSkgPT4ge1xuICAgICAgaWYgKGUpIHtcbiAgICAgICAgcmV0dXJuIGNiKGUpXG4gICAgICB9XG5cbiAgICAgIGxldCByZXBsaWNhdGlvbkNvbmZpZyA9IEJ1ZmZlci5mcm9tKCcnKVxuICAgICAgcGlwZXNldHVwKHJlc3BvbnNlLCB0cmFuc2Zvcm1lcnMucmVwbGljYXRpb25Db25maWdUcmFuc2Zvcm1lcigpKVxuICAgICAgICAub24oJ2RhdGEnLCAoZGF0YSkgPT4ge1xuICAgICAgICAgIHJlcGxpY2F0aW9uQ29uZmlnID0gZGF0YVxuICAgICAgICB9KVxuICAgICAgICAub24oJ2Vycm9yJywgY2IpXG4gICAgICAgIC5vbignZW5kJywgKCkgPT4ge1xuICAgICAgICAgIGNiKG51bGwsIHJlcGxpY2F0aW9uQ29uZmlnKVxuICAgICAgICB9KVxuICAgIH0pXG4gIH1cblxuICByZW1vdmVCdWNrZXRSZXBsaWNhdGlvbihidWNrZXROYW1lLCBjYikge1xuICAgIGlmICghaXNWYWxpZEJ1Y2tldE5hbWUoYnVja2V0TmFtZSkpIHtcbiAgICAgIHRocm93IG5ldyBlcnJvcnMuSW52YWxpZEJ1Y2tldE5hbWVFcnJvcignSW52YWxpZCBidWNrZXQgbmFtZTogJyArIGJ1Y2tldE5hbWUpXG4gICAgfVxuICAgIGNvbnN0IG1ldGhvZCA9ICdERUxFVEUnXG4gICAgY29uc3QgcXVlcnkgPSAncmVwbGljYXRpb24nXG4gICAgdGhpcy5tYWtlUmVxdWVzdCh7IG1ldGhvZCwgYnVja2V0TmFtZSwgcXVlcnkgfSwgJycsIFsyMDAsIDIwNF0sICcnLCBmYWxzZSwgY2IpXG4gIH1cblxuICBnZXRPYmplY3RMZWdhbEhvbGQoYnVja2V0TmFtZSwgb2JqZWN0TmFtZSwgZ2V0T3B0cyA9IHt9LCBjYikge1xuICAgIGlmICghaXNWYWxpZEJ1Y2tldE5hbWUoYnVja2V0TmFtZSkpIHtcbiAgICAgIHRocm93IG5ldyBlcnJvcnMuSW52YWxpZEJ1Y2tldE5hbWVFcnJvcignSW52YWxpZCBidWNrZXQgbmFtZTogJyArIGJ1Y2tldE5hbWUpXG4gICAgfVxuICAgIGlmICghaXNWYWxpZE9iamVjdE5hbWUob2JqZWN0TmFtZSkpIHtcbiAgICAgIHRocm93IG5ldyBlcnJvcnMuSW52YWxpZE9iamVjdE5hbWVFcnJvcihgSW52YWxpZCBvYmplY3QgbmFtZTogJHtvYmplY3ROYW1lfWApXG4gICAgfVxuXG4gICAgaWYgKGlzRnVuY3Rpb24oZ2V0T3B0cykpIHtcbiAgICAgIGNiID0gZ2V0T3B0c1xuICAgICAgZ2V0T3B0cyA9IHt9XG4gICAgfVxuXG4gICAgaWYgKCFpc09iamVjdChnZXRPcHRzKSkge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignZ2V0T3B0cyBzaG91bGQgYmUgb2YgdHlwZSBcIk9iamVjdFwiJylcbiAgICB9IGVsc2UgaWYgKE9iamVjdC5rZXlzKGdldE9wdHMpLmxlbmd0aCA+IDAgJiYgZ2V0T3B0cy52ZXJzaW9uSWQgJiYgIWlzU3RyaW5nKGdldE9wdHMudmVyc2lvbklkKSkge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcigndmVyc2lvbklkIHNob3VsZCBiZSBvZiB0eXBlIHN0cmluZy46JywgZ2V0T3B0cy52ZXJzaW9uSWQpXG4gICAgfVxuXG4gICAgaWYgKCFpc0Z1bmN0aW9uKGNiKSkge1xuICAgICAgdGhyb3cgbmV3IGVycm9ycy5JbnZhbGlkQXJndW1lbnRFcnJvcignY2FsbGJhY2sgc2hvdWxkIGJlIG9mIHR5cGUgXCJmdW5jdGlvblwiJylcbiAgICB9XG5cbiAgICBjb25zdCBtZXRob2QgPSAnR0VUJ1xuICAgIGxldCBxdWVyeSA9ICdsZWdhbC1ob2xkJ1xuXG4gICAgaWYgKGdldE9wdHMudmVyc2lvbklkKSB7XG4gICAgICBxdWVyeSArPSBgJnZlcnNpb25JZD0ke2dldE9wdHMudmVyc2lvbklkfWBcbiAgICB9XG5cbiAgICB0aGlzLm1ha2VSZXF1ZXN0KHsgbWV0aG9kLCBidWNrZXROYW1lLCBvYmplY3ROYW1lLCBxdWVyeSB9LCAnJywgWzIwMF0sICcnLCB0cnVlLCAoZSwgcmVzcG9uc2UpID0+IHtcbiAgICAgIGlmIChlKSB7XG4gICAgICAgIHJldHVybiBjYihlKVxuICAgICAgfVxuXG4gICAgICBsZXQgbGVnYWxIb2xkQ29uZmlnID0gQnVmZmVyLmZyb20oJycpXG4gICAgICBwaXBlc2V0dXAocmVzcG9uc2UsIHRyYW5zZm9ybWVycy5vYmplY3RMZWdhbEhvbGRUcmFuc2Zvcm1lcigpKVxuICAgICAgICAub24oJ2RhdGEnLCAoZGF0YSkgPT4ge1xuICAgICAgICAgIGxlZ2FsSG9sZENvbmZpZyA9IGRhdGFcbiAgICAgICAgfSlcbiAgICAgICAgLm9uKCdlcnJvcicsIGNiKVxuICAgICAgICAub24oJ2VuZCcsICgpID0+IHtcbiAgICAgICAgICBjYihudWxsLCBsZWdhbEhvbGRDb25maWcpXG4gICAgICAgIH0pXG4gICAgfSlcbiAgfVxuXG4gIHNldE9iamVjdExlZ2FsSG9sZChidWNrZXROYW1lLCBvYmplY3ROYW1lLCBzZXRPcHRzID0ge30sIGNiKSB7XG4gICAgaWYgKCFpc1ZhbGlkQnVja2V0TmFtZShidWNrZXROYW1lKSkge1xuICAgICAgdGhyb3cgbmV3IGVycm9ycy5JbnZhbGlkQnVja2V0TmFtZUVycm9yKCdJbnZhbGlkIGJ1Y2tldCBuYW1lOiAnICsgYnVja2V0TmFtZSlcbiAgICB9XG4gICAgaWYgKCFpc1ZhbGlkT2JqZWN0TmFtZShvYmplY3ROYW1lKSkge1xuICAgICAgdGhyb3cgbmV3IGVycm9ycy5JbnZhbGlkT2JqZWN0TmFtZUVycm9yKGBJbnZhbGlkIG9iamVjdCBuYW1lOiAke29iamVjdE5hbWV9YClcbiAgICB9XG5cbiAgICBjb25zdCBkZWZhdWx0T3B0cyA9IHtcbiAgICAgIHN0YXR1czogTEVHQUxfSE9MRF9TVEFUVVMuRU5BQkxFRCxcbiAgICB9XG4gICAgaWYgKGlzRnVuY3Rpb24oc2V0T3B0cykpIHtcbiAgICAgIGNiID0gc2V0T3B0c1xuICAgICAgc2V0T3B0cyA9IGRlZmF1bHRPcHRzXG4gICAgfVxuXG4gICAgaWYgKCFpc09iamVjdChzZXRPcHRzKSkge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignc2V0T3B0cyBzaG91bGQgYmUgb2YgdHlwZSBcIk9iamVjdFwiJylcbiAgICB9IGVsc2Uge1xuICAgICAgaWYgKCFbTEVHQUxfSE9MRF9TVEFUVVMuRU5BQkxFRCwgTEVHQUxfSE9MRF9TVEFUVVMuRElTQUJMRURdLmluY2x1ZGVzKHNldE9wdHMuc3RhdHVzKSkge1xuICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdJbnZhbGlkIHN0YXR1czogJyArIHNldE9wdHMuc3RhdHVzKVxuICAgICAgfVxuICAgICAgaWYgKHNldE9wdHMudmVyc2lvbklkICYmICFzZXRPcHRzLnZlcnNpb25JZC5sZW5ndGgpIHtcbiAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcigndmVyc2lvbklkIHNob3VsZCBiZSBvZiB0eXBlIHN0cmluZy46JyArIHNldE9wdHMudmVyc2lvbklkKVxuICAgICAgfVxuICAgIH1cblxuICAgIGlmICghaXNGdW5jdGlvbihjYikpIHtcbiAgICAgIHRocm93IG5ldyBlcnJvcnMuSW52YWxpZEFyZ3VtZW50RXJyb3IoJ2NhbGxiYWNrIHNob3VsZCBiZSBvZiB0eXBlIFwiZnVuY3Rpb25cIicpXG4gICAgfVxuXG4gICAgaWYgKF8uaXNFbXB0eShzZXRPcHRzKSkge1xuICAgICAgc2V0T3B0cyA9IHtcbiAgICAgICAgZGVmYXVsdE9wdHMsXG4gICAgICB9XG4gICAgfVxuXG4gICAgY29uc3QgbWV0aG9kID0gJ1BVVCdcbiAgICBsZXQgcXVlcnkgPSAnbGVnYWwtaG9sZCdcblxuICAgIGlmIChzZXRPcHRzLnZlcnNpb25JZCkge1xuICAgICAgcXVlcnkgKz0gYCZ2ZXJzaW9uSWQ9JHtzZXRPcHRzLnZlcnNpb25JZH1gXG4gICAgfVxuXG4gICAgbGV0IGNvbmZpZyA9IHtcbiAgICAgIFN0YXR1czogc2V0T3B0cy5zdGF0dXMsXG4gICAgfVxuXG4gICAgY29uc3QgYnVpbGRlciA9IG5ldyB4bWwyanMuQnVpbGRlcih7IHJvb3ROYW1lOiAnTGVnYWxIb2xkJywgcmVuZGVyT3B0czogeyBwcmV0dHk6IGZhbHNlIH0sIGhlYWRsZXNzOiB0cnVlIH0pXG4gICAgY29uc3QgcGF5bG9hZCA9IGJ1aWxkZXIuYnVpbGRPYmplY3QoY29uZmlnKVxuICAgIGNvbnN0IGhlYWRlcnMgPSB7fVxuICAgIGhlYWRlcnNbJ0NvbnRlbnQtTUQ1J10gPSB0b01kNShwYXlsb2FkKVxuXG4gICAgdGhpcy5tYWtlUmVxdWVzdCh7IG1ldGhvZCwgYnVja2V0TmFtZSwgb2JqZWN0TmFtZSwgcXVlcnksIGhlYWRlcnMgfSwgcGF5bG9hZCwgWzIwMF0sICcnLCBmYWxzZSwgY2IpXG4gIH1cblxuICAvKipcbiAgICogSW50ZXJuYWwgTWV0aG9kIHRvIGFib3J0IGEgbXVsdGlwYXJ0IHVwbG9hZCByZXF1ZXN0IGluIGNhc2Ugb2YgYW55IGVycm9ycy5cbiAgICogQHBhcmFtIGJ1Y2tldE5hbWUgX19zdHJpbmdfXyBCdWNrZXQgTmFtZVxuICAgKiBAcGFyYW0gb2JqZWN0TmFtZSBfX3N0cmluZ19fIE9iamVjdCBOYW1lXG4gICAqIEBwYXJhbSB1cGxvYWRJZCBfX3N0cmluZ19fIGlkIG9mIGEgbXVsdGlwYXJ0IHVwbG9hZCB0byBjYW5jZWwgZHVyaW5nIGNvbXBvc2Ugb2JqZWN0IHNlcXVlbmNlLlxuICAgKiBAcGFyYW0gY2IgX19mdW5jdGlvbl9fIGNhbGxiYWNrIGZ1bmN0aW9uXG4gICAqL1xuICBhYm9ydE11bHRpcGFydFVwbG9hZChidWNrZXROYW1lLCBvYmplY3ROYW1lLCB1cGxvYWRJZCwgY2IpIHtcbiAgICBjb25zdCBtZXRob2QgPSAnREVMRVRFJ1xuICAgIGxldCBxdWVyeSA9IGB1cGxvYWRJZD0ke3VwbG9hZElkfWBcblxuICAgIGNvbnN0IHJlcXVlc3RPcHRpb25zID0geyBtZXRob2QsIGJ1Y2tldE5hbWUsIG9iamVjdE5hbWU6IG9iamVjdE5hbWUsIHF1ZXJ5IH1cbiAgICB0aGlzLm1ha2VSZXF1ZXN0KHJlcXVlc3RPcHRpb25zLCAnJywgWzIwNF0sICcnLCBmYWxzZSwgY2IpXG4gIH1cblxuICAvKipcbiAgICogSW50ZXJuYWwgbWV0aG9kIHRvIHVwbG9hZCBhIHBhcnQgZHVyaW5nIGNvbXBvc2Ugb2JqZWN0LlxuICAgKiBAcGFyYW0gcGFydENvbmZpZyBfX29iamVjdF9fIGNvbnRhaW5zIHRoZSBmb2xsb3dpbmcuXG4gICAqICAgIGJ1Y2tldE5hbWUgX19zdHJpbmdfX1xuICAgKiAgICBvYmplY3ROYW1lIF9fc3RyaW5nX19cbiAgICogICAgdXBsb2FkSUQgX19zdHJpbmdfX1xuICAgKiAgICBwYXJ0TnVtYmVyIF9fbnVtYmVyX19cbiAgICogICAgaGVhZGVycyBfX29iamVjdF9fXG4gICAqIEBwYXJhbSBjYiBjYWxsZWQgd2l0aCBudWxsIGluY2FzZSBvZiBlcnJvci5cbiAgICovXG4gIHVwbG9hZFBhcnRDb3B5KHBhcnRDb25maWcsIGNiKSB7XG4gICAgY29uc3QgeyBidWNrZXROYW1lLCBvYmplY3ROYW1lLCB1cGxvYWRJRCwgcGFydE51bWJlciwgaGVhZGVycyB9ID0gcGFydENvbmZpZ1xuXG4gICAgY29uc3QgbWV0aG9kID0gJ1BVVCdcbiAgICBsZXQgcXVlcnkgPSBgdXBsb2FkSWQ9JHt1cGxvYWRJRH0mcGFydE51bWJlcj0ke3BhcnROdW1iZXJ9YFxuICAgIGNvbnN0IHJlcXVlc3RPcHRpb25zID0geyBtZXRob2QsIGJ1Y2tldE5hbWUsIG9iamVjdE5hbWU6IG9iamVjdE5hbWUsIHF1ZXJ5LCBoZWFkZXJzIH1cbiAgICByZXR1cm4gdGhpcy5tYWtlUmVxdWVzdChyZXF1ZXN0T3B0aW9ucywgJycsIFsyMDBdLCAnJywgdHJ1ZSwgKGUsIHJlc3BvbnNlKSA9PiB7XG4gICAgICBsZXQgcGFydENvcHlSZXN1bHQgPSBCdWZmZXIuZnJvbSgnJylcbiAgICAgIGlmIChlKSB7XG4gICAgICAgIHJldHVybiBjYihlKVxuICAgICAgfVxuICAgICAgcGlwZXNldHVwKHJlc3BvbnNlLCB0cmFuc2Zvcm1lcnMudXBsb2FkUGFydFRyYW5zZm9ybWVyKCkpXG4gICAgICAgIC5vbignZGF0YScsIChkYXRhKSA9PiB7XG4gICAgICAgICAgcGFydENvcHlSZXN1bHQgPSBkYXRhXG4gICAgICAgIH0pXG4gICAgICAgIC5vbignZXJyb3InLCBjYilcbiAgICAgICAgLm9uKCdlbmQnLCAoKSA9PiB7XG4gICAgICAgICAgbGV0IHVwbG9hZFBhcnRDb3B5UmVzID0ge1xuICAgICAgICAgICAgZXRhZzogc2FuaXRpemVFVGFnKHBhcnRDb3B5UmVzdWx0LkVUYWcpLFxuICAgICAgICAgICAga2V5OiBvYmplY3ROYW1lLFxuICAgICAgICAgICAgcGFydDogcGFydE51bWJlcixcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBjYihudWxsLCB1cGxvYWRQYXJ0Q29weVJlcylcbiAgICAgICAgfSlcbiAgICB9KVxuICB9XG5cbiAgY29tcG9zZU9iamVjdChkZXN0T2JqQ29uZmlnID0ge30sIHNvdXJjZU9iakxpc3QgPSBbXSwgY2IpIHtcbiAgICBjb25zdCBtZSA9IHRoaXMgLy8gbWFueSBhc3luYyBmbG93cy4gc28gc3RvcmUgdGhlIHJlZi5cbiAgICBjb25zdCBzb3VyY2VGaWxlc0xlbmd0aCA9IHNvdXJjZU9iakxpc3QubGVuZ3RoXG5cbiAgICBpZiAoIUFycmF5LmlzQXJyYXkoc291cmNlT2JqTGlzdCkpIHtcbiAgICAgIHRocm93IG5ldyBlcnJvcnMuSW52YWxpZEFyZ3VtZW50RXJyb3IoJ3NvdXJjZUNvbmZpZyBzaG91bGQgYW4gYXJyYXkgb2YgQ29weVNvdXJjZU9wdGlvbnMgJylcbiAgICB9XG4gICAgaWYgKCEoZGVzdE9iakNvbmZpZyBpbnN0YW5jZW9mIENvcHlEZXN0aW5hdGlvbk9wdGlvbnMpKSB7XG4gICAgICB0aHJvdyBuZXcgZXJyb3JzLkludmFsaWRBcmd1bWVudEVycm9yKCdkZXN0Q29uZmlnIHNob3VsZCBvZiB0eXBlIENvcHlEZXN0aW5hdGlvbk9wdGlvbnMgJylcbiAgICB9XG5cbiAgICBpZiAoc291cmNlRmlsZXNMZW5ndGggPCAxIHx8IHNvdXJjZUZpbGVzTGVuZ3RoID4gUEFSVF9DT05TVFJBSU5UUy5NQVhfUEFSVFNfQ09VTlQpIHtcbiAgICAgIHRocm93IG5ldyBlcnJvcnMuSW52YWxpZEFyZ3VtZW50RXJyb3IoXG4gICAgICAgIGBcIlRoZXJlIG11c3QgYmUgYXMgbGVhc3Qgb25lIGFuZCB1cCB0byAke1BBUlRfQ09OU1RSQUlOVFMuTUFYX1BBUlRTX0NPVU5UfSBzb3VyY2Ugb2JqZWN0cy5gLFxuICAgICAgKVxuICAgIH1cblxuICAgIGlmICghaXNGdW5jdGlvbihjYikpIHtcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ2NhbGxiYWNrIHNob3VsZCBiZSBvZiB0eXBlIFwiZnVuY3Rpb25cIicpXG4gICAgfVxuXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBzb3VyY2VGaWxlc0xlbmd0aDsgaSsrKSB7XG4gICAgICBpZiAoIXNvdXJjZU9iakxpc3RbaV0udmFsaWRhdGUoKSkge1xuICAgICAgICByZXR1cm4gZmFsc2VcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoIWRlc3RPYmpDb25maWcudmFsaWRhdGUoKSkge1xuICAgICAgcmV0dXJuIGZhbHNlXG4gICAgfVxuXG4gICAgY29uc3QgZ2V0U3RhdE9wdGlvbnMgPSAoc3JjQ29uZmlnKSA9PiB7XG4gICAgICBsZXQgc3RhdE9wdHMgPSB7fVxuICAgICAgaWYgKCFfLmlzRW1wdHkoc3JjQ29uZmlnLlZlcnNpb25JRCkpIHtcbiAgICAgICAgc3RhdE9wdHMgPSB7XG4gICAgICAgICAgdmVyc2lvbklkOiBzcmNDb25maWcuVmVyc2lvbklELFxuICAgICAgICB9XG4gICAgICB9XG4gICAgICByZXR1cm4gc3RhdE9wdHNcbiAgICB9XG4gICAgY29uc3Qgc3JjT2JqZWN0U2l6ZXMgPSBbXVxuICAgIGxldCB0b3RhbFNpemUgPSAwXG4gICAgbGV0IHRvdGFsUGFydHMgPSAwXG5cbiAgICBjb25zdCBzb3VyY2VPYmpTdGF0cyA9IHNvdXJjZU9iakxpc3QubWFwKChzcmNJdGVtKSA9PlxuICAgICAgbWUuc3RhdE9iamVjdChzcmNJdGVtLkJ1Y2tldCwgc3JjSXRlbS5PYmplY3QsIGdldFN0YXRPcHRpb25zKHNyY0l0ZW0pKSxcbiAgICApXG5cbiAgICByZXR1cm4gUHJvbWlzZS5hbGwoc291cmNlT2JqU3RhdHMpXG4gICAgICAudGhlbigoc3JjT2JqZWN0SW5mb3MpID0+IHtcbiAgICAgICAgY29uc3QgdmFsaWRhdGVkU3RhdHMgPSBzcmNPYmplY3RJbmZvcy5tYXAoKHJlc0l0ZW1TdGF0LCBpbmRleCkgPT4ge1xuICAgICAgICAgIGNvbnN0IHNyY0NvbmZpZyA9IHNvdXJjZU9iakxpc3RbaW5kZXhdXG5cbiAgICAgICAgICBsZXQgc3JjQ29weVNpemUgPSByZXNJdGVtU3RhdC5zaXplXG4gICAgICAgICAgLy8gQ2hlY2sgaWYgYSBzZWdtZW50IGlzIHNwZWNpZmllZCwgYW5kIGlmIHNvLCBpcyB0aGVcbiAgICAgICAgICAvLyBzZWdtZW50IHdpdGhpbiBvYmplY3QgYm91bmRzP1xuICAgICAgICAgIGlmIChzcmNDb25maWcuTWF0Y2hSYW5nZSkge1xuICAgICAgICAgICAgLy8gU2luY2UgcmFuZ2UgaXMgc3BlY2lmaWVkLFxuICAgICAgICAgICAgLy8gICAgMCA8PSBzcmMuc3JjU3RhcnQgPD0gc3JjLnNyY0VuZFxuICAgICAgICAgICAgLy8gc28gb25seSBpbnZhbGlkIGNhc2UgdG8gY2hlY2sgaXM6XG4gICAgICAgICAgICBjb25zdCBzcmNTdGFydCA9IHNyY0NvbmZpZy5TdGFydFxuICAgICAgICAgICAgY29uc3Qgc3JjRW5kID0gc3JjQ29uZmlnLkVuZFxuICAgICAgICAgICAgaWYgKHNyY0VuZCA+PSBzcmNDb3B5U2l6ZSB8fCBzcmNTdGFydCA8IDApIHtcbiAgICAgICAgICAgICAgdGhyb3cgbmV3IGVycm9ycy5JbnZhbGlkQXJndW1lbnRFcnJvcihcbiAgICAgICAgICAgICAgICBgQ29weVNyY09wdGlvbnMgJHtpbmRleH0gaGFzIGludmFsaWQgc2VnbWVudC10by1jb3B5IFske3NyY1N0YXJ0fSwgJHtzcmNFbmR9XSAoc2l6ZSBpcyAke3NyY0NvcHlTaXplfSlgLFxuICAgICAgICAgICAgICApXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBzcmNDb3B5U2l6ZSA9IHNyY0VuZCAtIHNyY1N0YXJ0ICsgMVxuICAgICAgICAgIH1cblxuICAgICAgICAgIC8vIE9ubHkgdGhlIGxhc3Qgc291cmNlIG1heSBiZSBsZXNzIHRoYW4gYGFic01pblBhcnRTaXplYFxuICAgICAgICAgIGlmIChzcmNDb3B5U2l6ZSA8IFBBUlRfQ09OU1RSQUlOVFMuQUJTX01JTl9QQVJUX1NJWkUgJiYgaW5kZXggPCBzb3VyY2VGaWxlc0xlbmd0aCAtIDEpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBlcnJvcnMuSW52YWxpZEFyZ3VtZW50RXJyb3IoXG4gICAgICAgICAgICAgIGBDb3B5U3JjT3B0aW9ucyAke2luZGV4fSBpcyB0b28gc21hbGwgKCR7c3JjQ29weVNpemV9KSBhbmQgaXQgaXMgbm90IHRoZSBsYXN0IHBhcnQuYCxcbiAgICAgICAgICAgIClcbiAgICAgICAgICB9XG5cbiAgICAgICAgICAvLyBJcyBkYXRhIHRvIGNvcHkgdG9vIGxhcmdlP1xuICAgICAgICAgIHRvdGFsU2l6ZSArPSBzcmNDb3B5U2l6ZVxuICAgICAgICAgIGlmICh0b3RhbFNpemUgPiBQQVJUX0NPTlNUUkFJTlRTLk1BWF9NVUxUSVBBUlRfUFVUX09CSkVDVF9TSVpFKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgZXJyb3JzLkludmFsaWRBcmd1bWVudEVycm9yKGBDYW5ub3QgY29tcG9zZSBhbiBvYmplY3Qgb2Ygc2l6ZSAke3RvdGFsU2l6ZX0gKD4gNVRpQilgKVxuICAgICAgICAgIH1cblxuICAgICAgICAgIC8vIHJlY29yZCBzb3VyY2Ugc2l6ZVxuICAgICAgICAgIHNyY09iamVjdFNpemVzW2luZGV4XSA9IHNyY0NvcHlTaXplXG5cbiAgICAgICAgICAvLyBjYWxjdWxhdGUgcGFydHMgbmVlZGVkIGZvciBjdXJyZW50IHNvdXJjZVxuICAgICAgICAgIHRvdGFsUGFydHMgKz0gcGFydHNSZXF1aXJlZChzcmNDb3B5U2l6ZSlcbiAgICAgICAgICAvLyBEbyB3ZSBuZWVkIG1vcmUgcGFydHMgdGhhbiB3ZSBhcmUgYWxsb3dlZD9cbiAgICAgICAgICBpZiAodG90YWxQYXJ0cyA+IFBBUlRfQ09OU1RSQUlOVFMuTUFYX1BBUlRTX0NPVU5UKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgZXJyb3JzLkludmFsaWRBcmd1bWVudEVycm9yKFxuICAgICAgICAgICAgICBgWW91ciBwcm9wb3NlZCBjb21wb3NlIG9iamVjdCByZXF1aXJlcyBtb3JlIHRoYW4gJHtQQVJUX0NPTlNUUkFJTlRTLk1BWF9QQVJUU19DT1VOVH0gcGFydHNgLFxuICAgICAgICAgICAgKVxuICAgICAgICAgIH1cblxuICAgICAgICAgIHJldHVybiByZXNJdGVtU3RhdFxuICAgICAgICB9KVxuXG4gICAgICAgIGlmICgodG90YWxQYXJ0cyA9PT0gMSAmJiB0b3RhbFNpemUgPD0gUEFSVF9DT05TVFJBSU5UUy5NQVhfUEFSVF9TSVpFKSB8fCB0b3RhbFNpemUgPT09IDApIHtcbiAgICAgICAgICByZXR1cm4gdGhpcy5jb3B5T2JqZWN0KHNvdXJjZU9iakxpc3RbMF0sIGRlc3RPYmpDb25maWcsIGNiKSAvLyB1c2UgY29weU9iamVjdFYyXG4gICAgICAgIH1cblxuICAgICAgICAvLyBwcmVzZXJ2ZSBldGFnIHRvIGF2b2lkIG1vZGlmaWNhdGlvbiBvZiBvYmplY3Qgd2hpbGUgY29weWluZy5cbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBzb3VyY2VGaWxlc0xlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgc291cmNlT2JqTGlzdFtpXS5NYXRjaEVUYWcgPSB2YWxpZGF0ZWRTdGF0c1tpXS5ldGFnXG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBzcGxpdFBhcnRTaXplTGlzdCA9IHZhbGlkYXRlZFN0YXRzLm1hcCgocmVzSXRlbVN0YXQsIGlkeCkgPT4ge1xuICAgICAgICAgIGNvbnN0IGNhbFNpemUgPSBjYWxjdWxhdGVFdmVuU3BsaXRzKHNyY09iamVjdFNpemVzW2lkeF0sIHNvdXJjZU9iakxpc3RbaWR4XSlcbiAgICAgICAgICByZXR1cm4gY2FsU2l6ZVxuICAgICAgICB9KVxuXG4gICAgICAgIGZ1bmN0aW9uIGdldFVwbG9hZFBhcnRDb25maWdMaXN0KHVwbG9hZElkKSB7XG4gICAgICAgICAgY29uc3QgdXBsb2FkUGFydENvbmZpZ0xpc3QgPSBbXVxuXG4gICAgICAgICAgc3BsaXRQYXJ0U2l6ZUxpc3QuZm9yRWFjaCgoc3BsaXRTaXplLCBzcGxpdEluZGV4KSA9PiB7XG4gICAgICAgICAgICBjb25zdCB7IHN0YXJ0SW5kZXg6IHN0YXJ0SWR4LCBlbmRJbmRleDogZW5kSWR4LCBvYmpJbmZvOiBvYmpDb25maWcgfSA9IHNwbGl0U2l6ZVxuXG4gICAgICAgICAgICBsZXQgcGFydEluZGV4ID0gc3BsaXRJbmRleCArIDEgLy8gcGFydCBpbmRleCBzdGFydHMgZnJvbSAxLlxuICAgICAgICAgICAgY29uc3QgdG90YWxVcGxvYWRzID0gQXJyYXkuZnJvbShzdGFydElkeClcblxuICAgICAgICAgICAgY29uc3QgaGVhZGVycyA9IHNvdXJjZU9iakxpc3Rbc3BsaXRJbmRleF0uZ2V0SGVhZGVycygpXG5cbiAgICAgICAgICAgIHRvdGFsVXBsb2Fkcy5mb3JFYWNoKChzcGxpdFN0YXJ0LCB1cGxkQ3RySWR4KSA9PiB7XG4gICAgICAgICAgICAgIGxldCBzcGxpdEVuZCA9IGVuZElkeFt1cGxkQ3RySWR4XVxuXG4gICAgICAgICAgICAgIGNvbnN0IHNvdXJjZU9iaiA9IGAke29iakNvbmZpZy5CdWNrZXR9LyR7b2JqQ29uZmlnLk9iamVjdH1gXG4gICAgICAgICAgICAgIGhlYWRlcnNbJ3gtYW16LWNvcHktc291cmNlJ10gPSBgJHtzb3VyY2VPYmp9YFxuICAgICAgICAgICAgICBoZWFkZXJzWyd4LWFtei1jb3B5LXNvdXJjZS1yYW5nZSddID0gYGJ5dGVzPSR7c3BsaXRTdGFydH0tJHtzcGxpdEVuZH1gXG5cbiAgICAgICAgICAgICAgY29uc3QgdXBsb2FkUGFydENvbmZpZyA9IHtcbiAgICAgICAgICAgICAgICBidWNrZXROYW1lOiBkZXN0T2JqQ29uZmlnLkJ1Y2tldCxcbiAgICAgICAgICAgICAgICBvYmplY3ROYW1lOiBkZXN0T2JqQ29uZmlnLk9iamVjdCxcbiAgICAgICAgICAgICAgICB1cGxvYWRJRDogdXBsb2FkSWQsXG4gICAgICAgICAgICAgICAgcGFydE51bWJlcjogcGFydEluZGV4LFxuICAgICAgICAgICAgICAgIGhlYWRlcnM6IGhlYWRlcnMsXG4gICAgICAgICAgICAgICAgc291cmNlT2JqOiBzb3VyY2VPYmosXG4gICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICB1cGxvYWRQYXJ0Q29uZmlnTGlzdC5wdXNoKHVwbG9hZFBhcnRDb25maWcpXG4gICAgICAgICAgICB9KVxuICAgICAgICAgIH0pXG5cbiAgICAgICAgICByZXR1cm4gdXBsb2FkUGFydENvbmZpZ0xpc3RcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IHBlcmZvcm1VcGxvYWRQYXJ0cyA9ICh1cGxvYWRJZCkgPT4ge1xuICAgICAgICAgIGNvbnN0IHVwbG9hZExpc3QgPSBnZXRVcGxvYWRQYXJ0Q29uZmlnTGlzdCh1cGxvYWRJZClcblxuICAgICAgICAgIGFzeW5jLm1hcCh1cGxvYWRMaXN0LCBtZS51cGxvYWRQYXJ0Q29weS5iaW5kKG1lKSwgKGVyciwgcmVzKSA9PiB7XG4gICAgICAgICAgICBpZiAoZXJyKSB7XG4gICAgICAgICAgICAgIHJldHVybiB0aGlzLmFib3J0TXVsdGlwYXJ0VXBsb2FkKGRlc3RPYmpDb25maWcuQnVja2V0LCBkZXN0T2JqQ29uZmlnLk9iamVjdCwgdXBsb2FkSWQsIGNiKVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgcGFydHNEb25lID0gcmVzLm1hcCgocGFydENvcHkpID0+ICh7IGV0YWc6IHBhcnRDb3B5LmV0YWcsIHBhcnQ6IHBhcnRDb3B5LnBhcnQgfSkpXG4gICAgICAgICAgICByZXR1cm4gbWUuY29tcGxldGVNdWx0aXBhcnRVcGxvYWQoZGVzdE9iakNvbmZpZy5CdWNrZXQsIGRlc3RPYmpDb25maWcuT2JqZWN0LCB1cGxvYWRJZCwgcGFydHNEb25lLCBjYilcbiAgICAgICAgICB9KVxuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgbmV3VXBsb2FkSGVhZGVycyA9IGRlc3RPYmpDb25maWcuZ2V0SGVhZGVycygpXG5cbiAgICAgICAgbWUuaW5pdGlhdGVOZXdNdWx0aXBhcnRVcGxvYWQoZGVzdE9iakNvbmZpZy5CdWNrZXQsIGRlc3RPYmpDb25maWcuT2JqZWN0LCBuZXdVcGxvYWRIZWFkZXJzLCAoZXJyLCB1cGxvYWRJZCkgPT4ge1xuICAgICAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgICAgIHJldHVybiBjYihlcnIsIG51bGwpXG4gICAgICAgICAgfVxuICAgICAgICAgIHBlcmZvcm1VcGxvYWRQYXJ0cyh1cGxvYWRJZClcbiAgICAgICAgfSlcbiAgICAgIH0pXG4gICAgICAuY2F0Y2goKGVycm9yKSA9PiB7XG4gICAgICAgIGNiKGVycm9yLCBudWxsKVxuICAgICAgfSlcbiAgfVxuICBzZWxlY3RPYmplY3RDb250ZW50KGJ1Y2tldE5hbWUsIG9iamVjdE5hbWUsIHNlbGVjdE9wdHMgPSB7fSwgY2IpIHtcbiAgICBpZiAoIWlzVmFsaWRCdWNrZXROYW1lKGJ1Y2tldE5hbWUpKSB7XG4gICAgICB0aHJvdyBuZXcgZXJyb3JzLkludmFsaWRCdWNrZXROYW1lRXJyb3IoYEludmFsaWQgYnVja2V0IG5hbWU6ICR7YnVja2V0TmFtZX1gKVxuICAgIH1cbiAgICBpZiAoIWlzVmFsaWRPYmplY3ROYW1lKG9iamVjdE5hbWUpKSB7XG4gICAgICB0aHJvdyBuZXcgZXJyb3JzLkludmFsaWRPYmplY3ROYW1lRXJyb3IoYEludmFsaWQgb2JqZWN0IG5hbWU6ICR7b2JqZWN0TmFtZX1gKVxuICAgIH1cbiAgICBpZiAoIV8uaXNFbXB0eShzZWxlY3RPcHRzKSkge1xuICAgICAgaWYgKCFpc1N0cmluZyhzZWxlY3RPcHRzLmV4cHJlc3Npb24pKSB7XG4gICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ3NxbEV4cHJlc3Npb24gc2hvdWxkIGJlIG9mIHR5cGUgXCJzdHJpbmdcIicpXG4gICAgICB9XG4gICAgICBpZiAoIV8uaXNFbXB0eShzZWxlY3RPcHRzLmlucHV0U2VyaWFsaXphdGlvbikpIHtcbiAgICAgICAgaWYgKCFpc09iamVjdChzZWxlY3RPcHRzLmlucHV0U2VyaWFsaXphdGlvbikpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdpbnB1dFNlcmlhbGl6YXRpb24gc2hvdWxkIGJlIG9mIHR5cGUgXCJvYmplY3RcIicpXG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ2lucHV0U2VyaWFsaXphdGlvbiBpcyByZXF1aXJlZCcpXG4gICAgICB9XG4gICAgICBpZiAoIV8uaXNFbXB0eShzZWxlY3RPcHRzLm91dHB1dFNlcmlhbGl6YXRpb24pKSB7XG4gICAgICAgIGlmICghaXNPYmplY3Qoc2VsZWN0T3B0cy5vdXRwdXRTZXJpYWxpemF0aW9uKSkge1xuICAgICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ291dHB1dFNlcmlhbGl6YXRpb24gc2hvdWxkIGJlIG9mIHR5cGUgXCJvYmplY3RcIicpXG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ291dHB1dFNlcmlhbGl6YXRpb24gaXMgcmVxdWlyZWQnKVxuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCd2YWxpZCBzZWxlY3QgY29uZmlndXJhdGlvbiBpcyByZXF1aXJlZCcpXG4gICAgfVxuXG4gICAgaWYgKCFpc0Z1bmN0aW9uKGNiKSkge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignY2FsbGJhY2sgc2hvdWxkIGJlIG9mIHR5cGUgXCJmdW5jdGlvblwiJylcbiAgICB9XG5cbiAgICBjb25zdCBtZXRob2QgPSAnUE9TVCdcbiAgICBsZXQgcXVlcnkgPSBgc2VsZWN0YFxuICAgIHF1ZXJ5ICs9ICcmc2VsZWN0LXR5cGU9MidcblxuICAgIGNvbnN0IGNvbmZpZyA9IFtcbiAgICAgIHtcbiAgICAgICAgRXhwcmVzc2lvbjogc2VsZWN0T3B0cy5leHByZXNzaW9uLFxuICAgICAgfSxcbiAgICAgIHtcbiAgICAgICAgRXhwcmVzc2lvblR5cGU6IHNlbGVjdE9wdHMuZXhwcmVzc2lvblR5cGUgfHwgJ1NRTCcsXG4gICAgICB9LFxuICAgICAge1xuICAgICAgICBJbnB1dFNlcmlhbGl6YXRpb246IFtzZWxlY3RPcHRzLmlucHV0U2VyaWFsaXphdGlvbl0sXG4gICAgICB9LFxuICAgICAge1xuICAgICAgICBPdXRwdXRTZXJpYWxpemF0aW9uOiBbc2VsZWN0T3B0cy5vdXRwdXRTZXJpYWxpemF0aW9uXSxcbiAgICAgIH0sXG4gICAgXVxuXG4gICAgLy8gT3B0aW9uYWxcbiAgICBpZiAoc2VsZWN0T3B0cy5yZXF1ZXN0UHJvZ3Jlc3MpIHtcbiAgICAgIGNvbmZpZy5wdXNoKHsgUmVxdWVzdFByb2dyZXNzOiBzZWxlY3RPcHRzLnJlcXVlc3RQcm9ncmVzcyB9KVxuICAgIH1cbiAgICAvLyBPcHRpb25hbFxuICAgIGlmIChzZWxlY3RPcHRzLnNjYW5SYW5nZSkge1xuICAgICAgY29uZmlnLnB1c2goeyBTY2FuUmFuZ2U6IHNlbGVjdE9wdHMuc2NhblJhbmdlIH0pXG4gICAgfVxuXG4gICAgY29uc3QgYnVpbGRlciA9IG5ldyB4bWwyanMuQnVpbGRlcih7XG4gICAgICByb290TmFtZTogJ1NlbGVjdE9iamVjdENvbnRlbnRSZXF1ZXN0JyxcbiAgICAgIHJlbmRlck9wdHM6IHsgcHJldHR5OiBmYWxzZSB9LFxuICAgICAgaGVhZGxlc3M6IHRydWUsXG4gICAgfSlcbiAgICBjb25zdCBwYXlsb2FkID0gYnVpbGRlci5idWlsZE9iamVjdChjb25maWcpXG5cbiAgICB0aGlzLm1ha2VSZXF1ZXN0KHsgbWV0aG9kLCBidWNrZXROYW1lLCBvYmplY3ROYW1lLCBxdWVyeSB9LCBwYXlsb2FkLCBbMjAwXSwgJycsIHRydWUsIChlLCByZXNwb25zZSkgPT4ge1xuICAgICAgaWYgKGUpIHtcbiAgICAgICAgcmV0dXJuIGNiKGUpXG4gICAgICB9XG5cbiAgICAgIGxldCBzZWxlY3RSZXN1bHRcbiAgICAgIHBpcGVzZXR1cChyZXNwb25zZSwgdHJhbnNmb3JtZXJzLnNlbGVjdE9iamVjdENvbnRlbnRUcmFuc2Zvcm1lcigpKVxuICAgICAgICAub24oJ2RhdGEnLCAoZGF0YSkgPT4ge1xuICAgICAgICAgIHNlbGVjdFJlc3VsdCA9IHBhcnNlU2VsZWN0T2JqZWN0Q29udGVudFJlc3BvbnNlKGRhdGEpXG4gICAgICAgIH0pXG4gICAgICAgIC5vbignZXJyb3InLCBjYilcbiAgICAgICAgLm9uKCdlbmQnLCAoKSA9PiB7XG4gICAgICAgICAgY2IobnVsbCwgc2VsZWN0UmVzdWx0KVxuICAgICAgICB9KVxuICAgIH0pXG4gIH1cblxuICBnZXQgZXh0ZW5zaW9ucygpIHtcbiAgICBpZiAoIXRoaXMuY2xpZW50RXh0ZW5zaW9ucykge1xuICAgICAgdGhpcy5jbGllbnRFeHRlbnNpb25zID0gbmV3IGV4dGVuc2lvbnModGhpcylcbiAgICB9XG4gICAgcmV0dXJuIHRoaXMuY2xpZW50RXh0ZW5zaW9uc1xuICB9XG59XG5cbi8vIFByb21pc2lmeSB2YXJpb3VzIHB1YmxpYy1mYWNpbmcgQVBJcyBvbiB0aGUgQ2xpZW50IG1vZHVsZS5cbkNsaWVudC5wcm90b3R5cGUubWFrZUJ1Y2tldCA9IHByb21pc2lmeShDbGllbnQucHJvdG90eXBlLm1ha2VCdWNrZXQpXG5DbGllbnQucHJvdG90eXBlLmxpc3RCdWNrZXRzID0gcHJvbWlzaWZ5KENsaWVudC5wcm90b3R5cGUubGlzdEJ1Y2tldHMpXG5DbGllbnQucHJvdG90eXBlLmJ1Y2tldEV4aXN0cyA9IHByb21pc2lmeShDbGllbnQucHJvdG90eXBlLmJ1Y2tldEV4aXN0cylcbkNsaWVudC5wcm90b3R5cGUucmVtb3ZlQnVja2V0ID0gcHJvbWlzaWZ5KENsaWVudC5wcm90b3R5cGUucmVtb3ZlQnVja2V0KVxuXG5DbGllbnQucHJvdG90eXBlLmdldE9iamVjdCA9IHByb21pc2lmeShDbGllbnQucHJvdG90eXBlLmdldE9iamVjdClcbkNsaWVudC5wcm90b3R5cGUuZ2V0UGFydGlhbE9iamVjdCA9IHByb21pc2lmeShDbGllbnQucHJvdG90eXBlLmdldFBhcnRpYWxPYmplY3QpXG5DbGllbnQucHJvdG90eXBlLmZHZXRPYmplY3QgPSBwcm9taXNpZnkoQ2xpZW50LnByb3RvdHlwZS5mR2V0T2JqZWN0KVxuQ2xpZW50LnByb3RvdHlwZS5wdXRPYmplY3QgPSBwcm9taXNpZnkoQ2xpZW50LnByb3RvdHlwZS5wdXRPYmplY3QpXG5DbGllbnQucHJvdG90eXBlLmZQdXRPYmplY3QgPSBwcm9taXNpZnkoQ2xpZW50LnByb3RvdHlwZS5mUHV0T2JqZWN0KVxuQ2xpZW50LnByb3RvdHlwZS5jb3B5T2JqZWN0ID0gcHJvbWlzaWZ5KENsaWVudC5wcm90b3R5cGUuY29weU9iamVjdClcbkNsaWVudC5wcm90b3R5cGUuc3RhdE9iamVjdCA9IHByb21pc2lmeShDbGllbnQucHJvdG90eXBlLnN0YXRPYmplY3QpXG5DbGllbnQucHJvdG90eXBlLnJlbW92ZU9iamVjdCA9IHByb21pc2lmeShDbGllbnQucHJvdG90eXBlLnJlbW92ZU9iamVjdClcbkNsaWVudC5wcm90b3R5cGUucmVtb3ZlT2JqZWN0cyA9IHByb21pc2lmeShDbGllbnQucHJvdG90eXBlLnJlbW92ZU9iamVjdHMpXG5cbkNsaWVudC5wcm90b3R5cGUucHJlc2lnbmVkVXJsID0gcHJvbWlzaWZ5KENsaWVudC5wcm90b3R5cGUucHJlc2lnbmVkVXJsKVxuQ2xpZW50LnByb3RvdHlwZS5wcmVzaWduZWRHZXRPYmplY3QgPSBwcm9taXNpZnkoQ2xpZW50LnByb3RvdHlwZS5wcmVzaWduZWRHZXRPYmplY3QpXG5DbGllbnQucHJvdG90eXBlLnByZXNpZ25lZFB1dE9iamVjdCA9IHByb21pc2lmeShDbGllbnQucHJvdG90eXBlLnByZXNpZ25lZFB1dE9iamVjdClcbkNsaWVudC5wcm90b3R5cGUucHJlc2lnbmVkUG9zdFBvbGljeSA9IHByb21pc2lmeShDbGllbnQucHJvdG90eXBlLnByZXNpZ25lZFBvc3RQb2xpY3kpXG5DbGllbnQucHJvdG90eXBlLmdldEJ1Y2tldE5vdGlmaWNhdGlvbiA9IHByb21pc2lmeShDbGllbnQucHJvdG90eXBlLmdldEJ1Y2tldE5vdGlmaWNhdGlvbilcbkNsaWVudC5wcm90b3R5cGUuc2V0QnVja2V0Tm90aWZpY2F0aW9uID0gcHJvbWlzaWZ5KENsaWVudC5wcm90b3R5cGUuc2V0QnVja2V0Tm90aWZpY2F0aW9uKVxuQ2xpZW50LnByb3RvdHlwZS5yZW1vdmVBbGxCdWNrZXROb3RpZmljYXRpb24gPSBwcm9taXNpZnkoQ2xpZW50LnByb3RvdHlwZS5yZW1vdmVBbGxCdWNrZXROb3RpZmljYXRpb24pXG5DbGllbnQucHJvdG90eXBlLmdldEJ1Y2tldFBvbGljeSA9IHByb21pc2lmeShDbGllbnQucHJvdG90eXBlLmdldEJ1Y2tldFBvbGljeSlcbkNsaWVudC5wcm90b3R5cGUuc2V0QnVja2V0UG9saWN5ID0gcHJvbWlzaWZ5KENsaWVudC5wcm90b3R5cGUuc2V0QnVja2V0UG9saWN5KVxuQ2xpZW50LnByb3RvdHlwZS5yZW1vdmVJbmNvbXBsZXRlVXBsb2FkID0gcHJvbWlzaWZ5KENsaWVudC5wcm90b3R5cGUucmVtb3ZlSW5jb21wbGV0ZVVwbG9hZClcbkNsaWVudC5wcm90b3R5cGUuZ2V0QnVja2V0VmVyc2lvbmluZyA9IHByb21pc2lmeShDbGllbnQucHJvdG90eXBlLmdldEJ1Y2tldFZlcnNpb25pbmcpXG5DbGllbnQucHJvdG90eXBlLnNldEJ1Y2tldFZlcnNpb25pbmcgPSBwcm9taXNpZnkoQ2xpZW50LnByb3RvdHlwZS5zZXRCdWNrZXRWZXJzaW9uaW5nKVxuQ2xpZW50LnByb3RvdHlwZS5zZXRCdWNrZXRUYWdnaW5nID0gcHJvbWlzaWZ5KENsaWVudC5wcm90b3R5cGUuc2V0QnVja2V0VGFnZ2luZylcbkNsaWVudC5wcm90b3R5cGUucmVtb3ZlQnVja2V0VGFnZ2luZyA9IHByb21pc2lmeShDbGllbnQucHJvdG90eXBlLnJlbW92ZUJ1Y2tldFRhZ2dpbmcpXG5DbGllbnQucHJvdG90eXBlLmdldEJ1Y2tldFRhZ2dpbmcgPSBwcm9taXNpZnkoQ2xpZW50LnByb3RvdHlwZS5nZXRCdWNrZXRUYWdnaW5nKVxuQ2xpZW50LnByb3RvdHlwZS5zZXRPYmplY3RUYWdnaW5nID0gcHJvbWlzaWZ5KENsaWVudC5wcm90b3R5cGUuc2V0T2JqZWN0VGFnZ2luZylcbkNsaWVudC5wcm90b3R5cGUucmVtb3ZlT2JqZWN0VGFnZ2luZyA9IHByb21pc2lmeShDbGllbnQucHJvdG90eXBlLnJlbW92ZU9iamVjdFRhZ2dpbmcpXG5DbGllbnQucHJvdG90eXBlLmdldE9iamVjdFRhZ2dpbmcgPSBwcm9taXNpZnkoQ2xpZW50LnByb3RvdHlwZS5nZXRPYmplY3RUYWdnaW5nKVxuQ2xpZW50LnByb3RvdHlwZS5zZXRCdWNrZXRMaWZlY3ljbGUgPSBwcm9taXNpZnkoQ2xpZW50LnByb3RvdHlwZS5zZXRCdWNrZXRMaWZlY3ljbGUpXG5DbGllbnQucHJvdG90eXBlLmdldEJ1Y2tldExpZmVjeWNsZSA9IHByb21pc2lmeShDbGllbnQucHJvdG90eXBlLmdldEJ1Y2tldExpZmVjeWNsZSlcbkNsaWVudC5wcm90b3R5cGUucmVtb3ZlQnVja2V0TGlmZWN5Y2xlID0gcHJvbWlzaWZ5KENsaWVudC5wcm90b3R5cGUucmVtb3ZlQnVja2V0TGlmZWN5Y2xlKVxuQ2xpZW50LnByb3RvdHlwZS5zZXRPYmplY3RMb2NrQ29uZmlnID0gcHJvbWlzaWZ5KENsaWVudC5wcm90b3R5cGUuc2V0T2JqZWN0TG9ja0NvbmZpZylcbkNsaWVudC5wcm90b3R5cGUuZ2V0T2JqZWN0TG9ja0NvbmZpZyA9IHByb21pc2lmeShDbGllbnQucHJvdG90eXBlLmdldE9iamVjdExvY2tDb25maWcpXG5DbGllbnQucHJvdG90eXBlLnB1dE9iamVjdFJldGVudGlvbiA9IHByb21pc2lmeShDbGllbnQucHJvdG90eXBlLnB1dE9iamVjdFJldGVudGlvbilcbkNsaWVudC5wcm90b3R5cGUuZ2V0T2JqZWN0UmV0ZW50aW9uID0gcHJvbWlzaWZ5KENsaWVudC5wcm90b3R5cGUuZ2V0T2JqZWN0UmV0ZW50aW9uKVxuQ2xpZW50LnByb3RvdHlwZS5zZXRCdWNrZXRFbmNyeXB0aW9uID0gcHJvbWlzaWZ5KENsaWVudC5wcm90b3R5cGUuc2V0QnVja2V0RW5jcnlwdGlvbilcbkNsaWVudC5wcm90b3R5cGUuZ2V0QnVja2V0RW5jcnlwdGlvbiA9IHByb21pc2lmeShDbGllbnQucHJvdG90eXBlLmdldEJ1Y2tldEVuY3J5cHRpb24pXG5DbGllbnQucHJvdG90eXBlLnJlbW92ZUJ1Y2tldEVuY3J5cHRpb24gPSBwcm9taXNpZnkoQ2xpZW50LnByb3RvdHlwZS5yZW1vdmVCdWNrZXRFbmNyeXB0aW9uKVxuQ2xpZW50LnByb3RvdHlwZS5zZXRCdWNrZXRSZXBsaWNhdGlvbiA9IHByb21pc2lmeShDbGllbnQucHJvdG90eXBlLnNldEJ1Y2tldFJlcGxpY2F0aW9uKVxuQ2xpZW50LnByb3RvdHlwZS5nZXRCdWNrZXRSZXBsaWNhdGlvbiA9IHByb21pc2lmeShDbGllbnQucHJvdG90eXBlLmdldEJ1Y2tldFJlcGxpY2F0aW9uKVxuQ2xpZW50LnByb3RvdHlwZS5yZW1vdmVCdWNrZXRSZXBsaWNhdGlvbiA9IHByb21pc2lmeShDbGllbnQucHJvdG90eXBlLnJlbW92ZUJ1Y2tldFJlcGxpY2F0aW9uKVxuQ2xpZW50LnByb3RvdHlwZS5zZXRPYmplY3RMZWdhbEhvbGQgPSBwcm9taXNpZnkoQ2xpZW50LnByb3RvdHlwZS5zZXRPYmplY3RMZWdhbEhvbGQpXG5DbGllbnQucHJvdG90eXBlLmdldE9iamVjdExlZ2FsSG9sZCA9IHByb21pc2lmeShDbGllbnQucHJvdG90eXBlLmdldE9iamVjdExlZ2FsSG9sZClcbkNsaWVudC5wcm90b3R5cGUuY29tcG9zZU9iamVjdCA9IHByb21pc2lmeShDbGllbnQucHJvdG90eXBlLmNvbXBvc2VPYmplY3QpXG5DbGllbnQucHJvdG90eXBlLnNlbGVjdE9iamVjdENvbnRlbnQgPSBwcm9taXNpZnkoQ2xpZW50LnByb3RvdHlwZS5zZWxlY3RPYmplY3RDb250ZW50KVxuIl0sIm1hcHBpbmdzIjoiQUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUEsT0FBTyxLQUFLQSxFQUFFO0FBQ2QsT0FBTyxLQUFLQyxJQUFJO0FB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