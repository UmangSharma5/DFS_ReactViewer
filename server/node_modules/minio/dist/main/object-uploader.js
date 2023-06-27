"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
var Crypto = _interopRequireWildcard(require("crypto"), true);
var _stream = require("stream");
var querystring = _interopRequireWildcard(require("query-string"), true);
var _helper = require("./internal/helper.js");
function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }
function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }
/*
 * MinIO Javascript Library for Amazon S3 Compatible Cloud Storage, (C) 2016 MinIO, Inc.
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

// We extend Transform because Writable does not implement ._flush().
class ObjectUploader extends _stream.Transform {
  constructor(client, bucketName, objectName, partSize, metaData, callback) {
    super();
    this.emptyStream = true;
    this.client = client;
    this.bucketName = bucketName;
    this.objectName = objectName;
    // The size of each multipart, chunked by BlockStream2.
    this.partSize = partSize;
    // This is the metadata for the object.
    this.metaData = metaData;

    // Call like: callback(error, {etag, versionId}).
    this.callback = callback;

    // We need to keep track of what number chunk/part we're on. This increments
    // each time _write() is called. Starts with 1, not 0.
    this.partNumber = 1;

    // A list of the previously uploaded chunks, for resuming a file upload. This
    // will be null if we aren't resuming an upload.
    this.oldParts = null;

    // Keep track of the etags for aggregating the chunks together later. Each
    // etag represents a single chunk of the file.
    this.etags = [];

    // This is for the multipart upload request — if null, we're either not initiated
    // yet or we're flushing in one packet.
    this.id = null;

    // Handle errors.
    this.on('error', err => {
      callback(err);
    });
  }
  _transform(chunk, encoding, callback) {
    this.emptyStream = false;
    let method = 'PUT';
    let headers = {
      'Content-Length': chunk.length
    };
    let md5digest = '';

    // Calculate and set Content-MD5 header if SHA256 is not set.
    // This will happen only when there is a secure connection to the s3 server.
    if (!this.client.enableSHA256) {
      md5digest = Crypto.createHash('md5').update(chunk).digest();
      headers['Content-MD5'] = md5digest.toString('base64');
    }
    // We can flush the object in one packet if it fits in one chunk. This is true
    // if the chunk size is smaller than the part size, signifying the end of the
    // stream.
    if (this.partNumber == 1 && chunk.length < this.partSize) {
      // PUT the chunk in a single request — use an empty query.
      let options = {
        method,
        // Set user metadata as this is not a multipart upload
        headers: Object.assign({}, this.metaData, headers),
        query: '',
        bucketName: this.bucketName,
        objectName: this.objectName
      };
      this.client.makeRequest(options, chunk, [200], '', true, (err, response) => {
        if (err) {
          return callback(err);
        }
        let result = {
          etag: (0, _helper.sanitizeETag)(response.headers.etag),
          versionId: (0, _helper.getVersionId)(response.headers)
        };
        // Ignore the 'data' event so that the stream closes. (nodejs stream requirement)
        response.on('data', () => {});

        // Give the etag back, we're done!

        process.nextTick(() => {
          this.callback(null, result);
        });

        // Because we're sure the stream has ended, allow it to flush and end.
        callback();
      });
      return;
    }

    // If we aren't flushing in one packet, we need to initiate the multipart upload,
    // if it hasn't already been done. The write will be buffered until the upload has been
    // initiated.
    if (this.id === null) {
      this.once('ready', () => {
        this._transform(chunk, encoding, callback);
      });

      // Check for an incomplete previous upload.
      this.client.findUploadId(this.bucketName, this.objectName, (err, id) => {
        if (err) {
          return this.emit('error', err);
        }

        // If no upload ID exists, initiate a new one.
        if (!id) {
          this.client.initiateNewMultipartUpload(this.bucketName, this.objectName, this.metaData, (err, id) => {
            if (err) {
              return callback(err);
            }
            this.id = id;

            // We are now ready to accept new chunks — this will flush the buffered chunk.
            this.emit('ready');
          });
          return;
        }
        this.id = id;

        // Retrieve the pre-uploaded parts, if we need to resume the upload.
        this.client.listParts(this.bucketName, this.objectName, id, (err, etags) => {
          if (err) {
            return this.emit('error', err);
          }

          // It is possible for no parts to be already uploaded.
          if (!etags) {
            etags = [];
          }

          // oldParts will become an object, allowing oldParts[partNumber].etag
          this.oldParts = etags.reduce(function (prev, item) {
            if (!prev[item.part]) {
              prev[item.part] = item;
            }
            return prev;
          }, {});
          this.emit('ready');
        });
      });
      return;
    }

    // Continue uploading various parts if we have initiated multipart upload.
    let partNumber = this.partNumber++;

    // Check to see if we've already uploaded this chunk. If the hash sums match,
    // we can skip to the next chunk.
    if (this.oldParts) {
      let oldPart = this.oldParts[partNumber];

      // Calulcate the md5 hash, if it has not already been calculated.
      if (!md5digest) {
        md5digest = Crypto.createHash('md5').update(chunk).digest();
      }
      if (oldPart && md5digest.toString('hex') === oldPart.etag) {
        // The md5 matches, the chunk has already been uploaded.
        this.etags.push({
          part: partNumber,
          etag: oldPart.etag
        });
        callback();
        return;
      }
    }

    // Write the chunk with an uploader.
    let query = querystring.stringify({
      partNumber: partNumber,
      uploadId: this.id
    });
    let options = {
      method,
      query,
      headers,
      bucketName: this.bucketName,
      objectName: this.objectName
    };
    this.client.makeRequest(options, chunk, [200], '', true, (err, response) => {
      if (err) {
        return callback(err);
      }

      // In order to aggregate the parts together, we need to collect the etags.
      let etag = response.headers.etag;
      if (etag) {
        etag = etag.replace(/^"/, '').replace(/"$/, '');
      }
      this.etags.push({
        part: partNumber,
        etag
      });

      // Ignore the 'data' event so that the stream closes. (nodejs stream requirement)
      response.on('data', () => {});

      // We're ready for the next chunk.
      callback();
    });
  }
  _flush(callback) {
    if (this.emptyStream) {
      let method = 'PUT';
      let headers = Object.assign({}, this.metaData, {
        'Content-Length': 0
      });
      let options = {
        method,
        headers,
        query: '',
        bucketName: this.bucketName,
        objectName: this.objectName
      };
      this.client.makeRequest(options, '', [200], '', true, (err, response) => {
        if (err) {
          return callback(err);
        }
        let result = {
          etag: (0, _helper.sanitizeETag)(response.headers.etag),
          versionId: (0, _helper.getVersionId)(response.headers)
        };

        // Ignore the 'data' event so that the stream closes. (nodejs stream requirement)
        response.on('data', () => {});

        // Give the etag back, we're done!
        process.nextTick(() => {
          this.callback(null, result);
        });

        // Because we're sure the stream has ended, allow it to flush and end.
        callback();
      });
      return;
    }
    // If it has been uploaded in a single packet, we don't have to do anything.
    if (this.id === null) {
      return;
    }

    // This is called when all of the chunks uploaded successfully, thus
    // completing the multipart upload.
    this.client.completeMultipartUpload(this.bucketName, this.objectName, this.id, this.etags, (err, etag) => {
      if (err) {
        return callback(err);
      }

      // Call our callback on the next tick to allow the streams infrastructure
      // to finish what its doing before we continue.
      process.nextTick(() => {
        this.callback(null, etag);
      });
      callback();
    });
  }
}

// deprecated default export, please use named exports.
// keep for backward compatibility.
// eslint-disable-next-line import/no-default-export
exports.ObjectUploader = ObjectUploader;
var _default = ObjectUploader;
exports.default = _default;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJDcnlwdG8iLCJfaW50ZXJvcFJlcXVpcmVXaWxkY2FyZCIsInJlcXVpcmUiLCJfc3RyZWFtIiwicXVlcnlzdHJpbmciLCJfaGVscGVyIiwiX2dldFJlcXVpcmVXaWxkY2FyZENhY2hlIiwibm9kZUludGVyb3AiLCJXZWFrTWFwIiwiY2FjaGVCYWJlbEludGVyb3AiLCJjYWNoZU5vZGVJbnRlcm9wIiwib2JqIiwiX19lc01vZHVsZSIsImRlZmF1bHQiLCJjYWNoZSIsImhhcyIsImdldCIsIm5ld09iaiIsImhhc1Byb3BlcnR5RGVzY3JpcHRvciIsIk9iamVjdCIsImRlZmluZVByb3BlcnR5IiwiZ2V0T3duUHJvcGVydHlEZXNjcmlwdG9yIiwia2V5IiwicHJvdG90eXBlIiwiaGFzT3duUHJvcGVydHkiLCJjYWxsIiwiZGVzYyIsInNldCIsIk9iamVjdFVwbG9hZGVyIiwiVHJhbnNmb3JtIiwiY29uc3RydWN0b3IiLCJjbGllbnQiLCJidWNrZXROYW1lIiwib2JqZWN0TmFtZSIsInBhcnRTaXplIiwibWV0YURhdGEiLCJjYWxsYmFjayIsImVtcHR5U3RyZWFtIiwicGFydE51bWJlciIsIm9sZFBhcnRzIiwiZXRhZ3MiLCJpZCIsIm9uIiwiZXJyIiwiX3RyYW5zZm9ybSIsImNodW5rIiwiZW5jb2RpbmciLCJtZXRob2QiLCJoZWFkZXJzIiwibGVuZ3RoIiwibWQ1ZGlnZXN0IiwiZW5hYmxlU0hBMjU2IiwiY3JlYXRlSGFzaCIsInVwZGF0ZSIsImRpZ2VzdCIsInRvU3RyaW5nIiwib3B0aW9ucyIsImFzc2lnbiIsInF1ZXJ5IiwibWFrZVJlcXVlc3QiLCJyZXNwb25zZSIsInJlc3VsdCIsImV0YWciLCJzYW5pdGl6ZUVUYWciLCJ2ZXJzaW9uSWQiLCJnZXRWZXJzaW9uSWQiLCJwcm9jZXNzIiwibmV4dFRpY2siLCJvbmNlIiwiZmluZFVwbG9hZElkIiwiZW1pdCIsImluaXRpYXRlTmV3TXVsdGlwYXJ0VXBsb2FkIiwibGlzdFBhcnRzIiwicmVkdWNlIiwicHJldiIsIml0ZW0iLCJwYXJ0Iiwib2xkUGFydCIsInB1c2giLCJzdHJpbmdpZnkiLCJ1cGxvYWRJZCIsInJlcGxhY2UiLCJfZmx1c2giLCJjb21wbGV0ZU11bHRpcGFydFVwbG9hZCIsImV4cG9ydHMiLCJfZGVmYXVsdCJdLCJzb3VyY2VzIjpbIm9iamVjdC11cGxvYWRlci5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyIvKlxuICogTWluSU8gSmF2YXNjcmlwdCBMaWJyYXJ5IGZvciBBbWF6b24gUzMgQ29tcGF0aWJsZSBDbG91ZCBTdG9yYWdlLCAoQykgMjAxNiBNaW5JTywgSW5jLlxuICpcbiAqIExpY2Vuc2VkIHVuZGVyIHRoZSBBcGFjaGUgTGljZW5zZSwgVmVyc2lvbiAyLjAgKHRoZSBcIkxpY2Vuc2VcIik7XG4gKiB5b3UgbWF5IG5vdCB1c2UgdGhpcyBmaWxlIGV4Y2VwdCBpbiBjb21wbGlhbmNlIHdpdGggdGhlIExpY2Vuc2UuXG4gKiBZb3UgbWF5IG9idGFpbiBhIGNvcHkgb2YgdGhlIExpY2Vuc2UgYXRcbiAqXG4gKiAgICAgaHR0cDovL3d3dy5hcGFjaGUub3JnL2xpY2Vuc2VzL0xJQ0VOU0UtMi4wXG4gKlxuICogVW5sZXNzIHJlcXVpcmVkIGJ5IGFwcGxpY2FibGUgbGF3IG9yIGFncmVlZCB0byBpbiB3cml0aW5nLCBzb2Z0d2FyZVxuICogZGlzdHJpYnV0ZWQgdW5kZXIgdGhlIExpY2Vuc2UgaXMgZGlzdHJpYnV0ZWQgb24gYW4gXCJBUyBJU1wiIEJBU0lTLFxuICogV0lUSE9VVCBXQVJSQU5USUVTIE9SIENPTkRJVElPTlMgT0YgQU5ZIEtJTkQsIGVpdGhlciBleHByZXNzIG9yIGltcGxpZWQuXG4gKiBTZWUgdGhlIExpY2Vuc2UgZm9yIHRoZSBzcGVjaWZpYyBsYW5ndWFnZSBnb3Zlcm5pbmcgcGVybWlzc2lvbnMgYW5kXG4gKiBsaW1pdGF0aW9ucyB1bmRlciB0aGUgTGljZW5zZS5cbiAqL1xuXG5pbXBvcnQgKiBhcyBDcnlwdG8gZnJvbSAnbm9kZTpjcnlwdG8nXG5pbXBvcnQgeyBUcmFuc2Zvcm0gfSBmcm9tICdub2RlOnN0cmVhbSdcblxuaW1wb3J0ICogYXMgcXVlcnlzdHJpbmcgZnJvbSAncXVlcnktc3RyaW5nJ1xuXG5pbXBvcnQgeyBnZXRWZXJzaW9uSWQsIHNhbml0aXplRVRhZyB9IGZyb20gJy4vaW50ZXJuYWwvaGVscGVyLnRzJ1xuXG4vLyBXZSBleHRlbmQgVHJhbnNmb3JtIGJlY2F1c2UgV3JpdGFibGUgZG9lcyBub3QgaW1wbGVtZW50IC5fZmx1c2goKS5cbmV4cG9ydCBjbGFzcyBPYmplY3RVcGxvYWRlciBleHRlbmRzIFRyYW5zZm9ybSB7XG4gIGNvbnN0cnVjdG9yKGNsaWVudCwgYnVja2V0TmFtZSwgb2JqZWN0TmFtZSwgcGFydFNpemUsIG1ldGFEYXRhLCBjYWxsYmFjaykge1xuICAgIHN1cGVyKClcbiAgICB0aGlzLmVtcHR5U3RyZWFtID0gdHJ1ZVxuICAgIHRoaXMuY2xpZW50ID0gY2xpZW50XG4gICAgdGhpcy5idWNrZXROYW1lID0gYnVja2V0TmFtZVxuICAgIHRoaXMub2JqZWN0TmFtZSA9IG9iamVjdE5hbWVcbiAgICAvLyBUaGUgc2l6ZSBvZiBlYWNoIG11bHRpcGFydCwgY2h1bmtlZCBieSBCbG9ja1N0cmVhbTIuXG4gICAgdGhpcy5wYXJ0U2l6ZSA9IHBhcnRTaXplXG4gICAgLy8gVGhpcyBpcyB0aGUgbWV0YWRhdGEgZm9yIHRoZSBvYmplY3QuXG4gICAgdGhpcy5tZXRhRGF0YSA9IG1ldGFEYXRhXG5cbiAgICAvLyBDYWxsIGxpa2U6IGNhbGxiYWNrKGVycm9yLCB7ZXRhZywgdmVyc2lvbklkfSkuXG4gICAgdGhpcy5jYWxsYmFjayA9IGNhbGxiYWNrXG5cbiAgICAvLyBXZSBuZWVkIHRvIGtlZXAgdHJhY2sgb2Ygd2hhdCBudW1iZXIgY2h1bmsvcGFydCB3ZSdyZSBvbi4gVGhpcyBpbmNyZW1lbnRzXG4gICAgLy8gZWFjaCB0aW1lIF93cml0ZSgpIGlzIGNhbGxlZC4gU3RhcnRzIHdpdGggMSwgbm90IDAuXG4gICAgdGhpcy5wYXJ0TnVtYmVyID0gMVxuXG4gICAgLy8gQSBsaXN0IG9mIHRoZSBwcmV2aW91c2x5IHVwbG9hZGVkIGNodW5rcywgZm9yIHJlc3VtaW5nIGEgZmlsZSB1cGxvYWQuIFRoaXNcbiAgICAvLyB3aWxsIGJlIG51bGwgaWYgd2UgYXJlbid0IHJlc3VtaW5nIGFuIHVwbG9hZC5cbiAgICB0aGlzLm9sZFBhcnRzID0gbnVsbFxuXG4gICAgLy8gS2VlcCB0cmFjayBvZiB0aGUgZXRhZ3MgZm9yIGFnZ3JlZ2F0aW5nIHRoZSBjaHVua3MgdG9nZXRoZXIgbGF0ZXIuIEVhY2hcbiAgICAvLyBldGFnIHJlcHJlc2VudHMgYSBzaW5nbGUgY2h1bmsgb2YgdGhlIGZpbGUuXG4gICAgdGhpcy5ldGFncyA9IFtdXG5cbiAgICAvLyBUaGlzIGlzIGZvciB0aGUgbXVsdGlwYXJ0IHVwbG9hZCByZXF1ZXN0IOKAlCBpZiBudWxsLCB3ZSdyZSBlaXRoZXIgbm90IGluaXRpYXRlZFxuICAgIC8vIHlldCBvciB3ZSdyZSBmbHVzaGluZyBpbiBvbmUgcGFja2V0LlxuICAgIHRoaXMuaWQgPSBudWxsXG5cbiAgICAvLyBIYW5kbGUgZXJyb3JzLlxuICAgIHRoaXMub24oJ2Vycm9yJywgKGVycikgPT4ge1xuICAgICAgY2FsbGJhY2soZXJyKVxuICAgIH0pXG4gIH1cblxuICBfdHJhbnNmb3JtKGNodW5rLCBlbmNvZGluZywgY2FsbGJhY2spIHtcbiAgICB0aGlzLmVtcHR5U3RyZWFtID0gZmFsc2VcbiAgICBsZXQgbWV0aG9kID0gJ1BVVCdcbiAgICBsZXQgaGVhZGVycyA9IHsgJ0NvbnRlbnQtTGVuZ3RoJzogY2h1bmsubGVuZ3RoIH1cbiAgICBsZXQgbWQ1ZGlnZXN0ID0gJydcblxuICAgIC8vIENhbGN1bGF0ZSBhbmQgc2V0IENvbnRlbnQtTUQ1IGhlYWRlciBpZiBTSEEyNTYgaXMgbm90IHNldC5cbiAgICAvLyBUaGlzIHdpbGwgaGFwcGVuIG9ubHkgd2hlbiB0aGVyZSBpcyBhIHNlY3VyZSBjb25uZWN0aW9uIHRvIHRoZSBzMyBzZXJ2ZXIuXG4gICAgaWYgKCF0aGlzLmNsaWVudC5lbmFibGVTSEEyNTYpIHtcbiAgICAgIG1kNWRpZ2VzdCA9IENyeXB0by5jcmVhdGVIYXNoKCdtZDUnKS51cGRhdGUoY2h1bmspLmRpZ2VzdCgpXG4gICAgICBoZWFkZXJzWydDb250ZW50LU1ENSddID0gbWQ1ZGlnZXN0LnRvU3RyaW5nKCdiYXNlNjQnKVxuICAgIH1cbiAgICAvLyBXZSBjYW4gZmx1c2ggdGhlIG9iamVjdCBpbiBvbmUgcGFja2V0IGlmIGl0IGZpdHMgaW4gb25lIGNodW5rLiBUaGlzIGlzIHRydWVcbiAgICAvLyBpZiB0aGUgY2h1bmsgc2l6ZSBpcyBzbWFsbGVyIHRoYW4gdGhlIHBhcnQgc2l6ZSwgc2lnbmlmeWluZyB0aGUgZW5kIG9mIHRoZVxuICAgIC8vIHN0cmVhbS5cbiAgICBpZiAodGhpcy5wYXJ0TnVtYmVyID09IDEgJiYgY2h1bmsubGVuZ3RoIDwgdGhpcy5wYXJ0U2l6ZSkge1xuICAgICAgLy8gUFVUIHRoZSBjaHVuayBpbiBhIHNpbmdsZSByZXF1ZXN0IOKAlCB1c2UgYW4gZW1wdHkgcXVlcnkuXG4gICAgICBsZXQgb3B0aW9ucyA9IHtcbiAgICAgICAgbWV0aG9kLFxuICAgICAgICAvLyBTZXQgdXNlciBtZXRhZGF0YSBhcyB0aGlzIGlzIG5vdCBhIG11bHRpcGFydCB1cGxvYWRcbiAgICAgICAgaGVhZGVyczogT2JqZWN0LmFzc2lnbih7fSwgdGhpcy5tZXRhRGF0YSwgaGVhZGVycyksXG4gICAgICAgIHF1ZXJ5OiAnJyxcbiAgICAgICAgYnVja2V0TmFtZTogdGhpcy5idWNrZXROYW1lLFxuICAgICAgICBvYmplY3ROYW1lOiB0aGlzLm9iamVjdE5hbWUsXG4gICAgICB9XG5cbiAgICAgIHRoaXMuY2xpZW50Lm1ha2VSZXF1ZXN0KG9wdGlvbnMsIGNodW5rLCBbMjAwXSwgJycsIHRydWUsIChlcnIsIHJlc3BvbnNlKSA9PiB7XG4gICAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgICByZXR1cm4gY2FsbGJhY2soZXJyKVxuICAgICAgICB9XG4gICAgICAgIGxldCByZXN1bHQgPSB7XG4gICAgICAgICAgZXRhZzogc2FuaXRpemVFVGFnKHJlc3BvbnNlLmhlYWRlcnMuZXRhZyksXG4gICAgICAgICAgdmVyc2lvbklkOiBnZXRWZXJzaW9uSWQocmVzcG9uc2UuaGVhZGVycyksXG4gICAgICAgIH1cbiAgICAgICAgLy8gSWdub3JlIHRoZSAnZGF0YScgZXZlbnQgc28gdGhhdCB0aGUgc3RyZWFtIGNsb3Nlcy4gKG5vZGVqcyBzdHJlYW0gcmVxdWlyZW1lbnQpXG4gICAgICAgIHJlc3BvbnNlLm9uKCdkYXRhJywgKCkgPT4ge30pXG5cbiAgICAgICAgLy8gR2l2ZSB0aGUgZXRhZyBiYWNrLCB3ZSdyZSBkb25lIVxuXG4gICAgICAgIHByb2Nlc3MubmV4dFRpY2soKCkgPT4ge1xuICAgICAgICAgIHRoaXMuY2FsbGJhY2sobnVsbCwgcmVzdWx0KVxuICAgICAgICB9KVxuXG4gICAgICAgIC8vIEJlY2F1c2Ugd2UncmUgc3VyZSB0aGUgc3RyZWFtIGhhcyBlbmRlZCwgYWxsb3cgaXQgdG8gZmx1c2ggYW5kIGVuZC5cbiAgICAgICAgY2FsbGJhY2soKVxuICAgICAgfSlcblxuICAgICAgcmV0dXJuXG4gICAgfVxuXG4gICAgLy8gSWYgd2UgYXJlbid0IGZsdXNoaW5nIGluIG9uZSBwYWNrZXQsIHdlIG5lZWQgdG8gaW5pdGlhdGUgdGhlIG11bHRpcGFydCB1cGxvYWQsXG4gICAgLy8gaWYgaXQgaGFzbid0IGFscmVhZHkgYmVlbiBkb25lLiBUaGUgd3JpdGUgd2lsbCBiZSBidWZmZXJlZCB1bnRpbCB0aGUgdXBsb2FkIGhhcyBiZWVuXG4gICAgLy8gaW5pdGlhdGVkLlxuICAgIGlmICh0aGlzLmlkID09PSBudWxsKSB7XG4gICAgICB0aGlzLm9uY2UoJ3JlYWR5JywgKCkgPT4ge1xuICAgICAgICB0aGlzLl90cmFuc2Zvcm0oY2h1bmssIGVuY29kaW5nLCBjYWxsYmFjaylcbiAgICAgIH0pXG5cbiAgICAgIC8vIENoZWNrIGZvciBhbiBpbmNvbXBsZXRlIHByZXZpb3VzIHVwbG9hZC5cbiAgICAgIHRoaXMuY2xpZW50LmZpbmRVcGxvYWRJZCh0aGlzLmJ1Y2tldE5hbWUsIHRoaXMub2JqZWN0TmFtZSwgKGVyciwgaWQpID0+IHtcbiAgICAgICAgaWYgKGVycikge1xuICAgICAgICAgIHJldHVybiB0aGlzLmVtaXQoJ2Vycm9yJywgZXJyKVxuICAgICAgICB9XG5cbiAgICAgICAgLy8gSWYgbm8gdXBsb2FkIElEIGV4aXN0cywgaW5pdGlhdGUgYSBuZXcgb25lLlxuICAgICAgICBpZiAoIWlkKSB7XG4gICAgICAgICAgdGhpcy5jbGllbnQuaW5pdGlhdGVOZXdNdWx0aXBhcnRVcGxvYWQodGhpcy5idWNrZXROYW1lLCB0aGlzLm9iamVjdE5hbWUsIHRoaXMubWV0YURhdGEsIChlcnIsIGlkKSA9PiB7XG4gICAgICAgICAgICBpZiAoZXJyKSB7XG4gICAgICAgICAgICAgIHJldHVybiBjYWxsYmFjayhlcnIpXG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHRoaXMuaWQgPSBpZFxuXG4gICAgICAgICAgICAvLyBXZSBhcmUgbm93IHJlYWR5IHRvIGFjY2VwdCBuZXcgY2h1bmtzIOKAlCB0aGlzIHdpbGwgZmx1c2ggdGhlIGJ1ZmZlcmVkIGNodW5rLlxuICAgICAgICAgICAgdGhpcy5lbWl0KCdyZWFkeScpXG4gICAgICAgICAgfSlcblxuICAgICAgICAgIHJldHVyblxuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5pZCA9IGlkXG5cbiAgICAgICAgLy8gUmV0cmlldmUgdGhlIHByZS11cGxvYWRlZCBwYXJ0cywgaWYgd2UgbmVlZCB0byByZXN1bWUgdGhlIHVwbG9hZC5cbiAgICAgICAgdGhpcy5jbGllbnQubGlzdFBhcnRzKHRoaXMuYnVja2V0TmFtZSwgdGhpcy5vYmplY3ROYW1lLCBpZCwgKGVyciwgZXRhZ3MpID0+IHtcbiAgICAgICAgICBpZiAoZXJyKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5lbWl0KCdlcnJvcicsIGVycilcbiAgICAgICAgICB9XG5cbiAgICAgICAgICAvLyBJdCBpcyBwb3NzaWJsZSBmb3Igbm8gcGFydHMgdG8gYmUgYWxyZWFkeSB1cGxvYWRlZC5cbiAgICAgICAgICBpZiAoIWV0YWdzKSB7XG4gICAgICAgICAgICBldGFncyA9IFtdXG4gICAgICAgICAgfVxuXG4gICAgICAgICAgLy8gb2xkUGFydHMgd2lsbCBiZWNvbWUgYW4gb2JqZWN0LCBhbGxvd2luZyBvbGRQYXJ0c1twYXJ0TnVtYmVyXS5ldGFnXG4gICAgICAgICAgdGhpcy5vbGRQYXJ0cyA9IGV0YWdzLnJlZHVjZShmdW5jdGlvbiAocHJldiwgaXRlbSkge1xuICAgICAgICAgICAgaWYgKCFwcmV2W2l0ZW0ucGFydF0pIHtcbiAgICAgICAgICAgICAgcHJldltpdGVtLnBhcnRdID0gaXRlbVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHByZXZcbiAgICAgICAgICB9LCB7fSlcblxuICAgICAgICAgIHRoaXMuZW1pdCgncmVhZHknKVxuICAgICAgICB9KVxuICAgICAgfSlcblxuICAgICAgcmV0dXJuXG4gICAgfVxuXG4gICAgLy8gQ29udGludWUgdXBsb2FkaW5nIHZhcmlvdXMgcGFydHMgaWYgd2UgaGF2ZSBpbml0aWF0ZWQgbXVsdGlwYXJ0IHVwbG9hZC5cbiAgICBsZXQgcGFydE51bWJlciA9IHRoaXMucGFydE51bWJlcisrXG5cbiAgICAvLyBDaGVjayB0byBzZWUgaWYgd2UndmUgYWxyZWFkeSB1cGxvYWRlZCB0aGlzIGNodW5rLiBJZiB0aGUgaGFzaCBzdW1zIG1hdGNoLFxuICAgIC8vIHdlIGNhbiBza2lwIHRvIHRoZSBuZXh0IGNodW5rLlxuICAgIGlmICh0aGlzLm9sZFBhcnRzKSB7XG4gICAgICBsZXQgb2xkUGFydCA9IHRoaXMub2xkUGFydHNbcGFydE51bWJlcl1cblxuICAgICAgLy8gQ2FsdWxjYXRlIHRoZSBtZDUgaGFzaCwgaWYgaXQgaGFzIG5vdCBhbHJlYWR5IGJlZW4gY2FsY3VsYXRlZC5cbiAgICAgIGlmICghbWQ1ZGlnZXN0KSB7XG4gICAgICAgIG1kNWRpZ2VzdCA9IENyeXB0by5jcmVhdGVIYXNoKCdtZDUnKS51cGRhdGUoY2h1bmspLmRpZ2VzdCgpXG4gICAgICB9XG5cbiAgICAgIGlmIChvbGRQYXJ0ICYmIG1kNWRpZ2VzdC50b1N0cmluZygnaGV4JykgPT09IG9sZFBhcnQuZXRhZykge1xuICAgICAgICAvLyBUaGUgbWQ1IG1hdGNoZXMsIHRoZSBjaHVuayBoYXMgYWxyZWFkeSBiZWVuIHVwbG9hZGVkLlxuICAgICAgICB0aGlzLmV0YWdzLnB1c2goeyBwYXJ0OiBwYXJ0TnVtYmVyLCBldGFnOiBvbGRQYXJ0LmV0YWcgfSlcblxuICAgICAgICBjYWxsYmFjaygpXG4gICAgICAgIHJldHVyblxuICAgICAgfVxuICAgIH1cblxuICAgIC8vIFdyaXRlIHRoZSBjaHVuayB3aXRoIGFuIHVwbG9hZGVyLlxuICAgIGxldCBxdWVyeSA9IHF1ZXJ5c3RyaW5nLnN0cmluZ2lmeSh7XG4gICAgICBwYXJ0TnVtYmVyOiBwYXJ0TnVtYmVyLFxuICAgICAgdXBsb2FkSWQ6IHRoaXMuaWQsXG4gICAgfSlcblxuICAgIGxldCBvcHRpb25zID0ge1xuICAgICAgbWV0aG9kLFxuICAgICAgcXVlcnksXG4gICAgICBoZWFkZXJzLFxuICAgICAgYnVja2V0TmFtZTogdGhpcy5idWNrZXROYW1lLFxuICAgICAgb2JqZWN0TmFtZTogdGhpcy5vYmplY3ROYW1lLFxuICAgIH1cblxuICAgIHRoaXMuY2xpZW50Lm1ha2VSZXF1ZXN0KG9wdGlvbnMsIGNodW5rLCBbMjAwXSwgJycsIHRydWUsIChlcnIsIHJlc3BvbnNlKSA9PiB7XG4gICAgICBpZiAoZXJyKSB7XG4gICAgICAgIHJldHVybiBjYWxsYmFjayhlcnIpXG4gICAgICB9XG5cbiAgICAgIC8vIEluIG9yZGVyIHRvIGFnZ3JlZ2F0ZSB0aGUgcGFydHMgdG9nZXRoZXIsIHdlIG5lZWQgdG8gY29sbGVjdCB0aGUgZXRhZ3MuXG4gICAgICBsZXQgZXRhZyA9IHJlc3BvbnNlLmhlYWRlcnMuZXRhZ1xuICAgICAgaWYgKGV0YWcpIHtcbiAgICAgICAgZXRhZyA9IGV0YWcucmVwbGFjZSgvXlwiLywgJycpLnJlcGxhY2UoL1wiJC8sICcnKVxuICAgICAgfVxuXG4gICAgICB0aGlzLmV0YWdzLnB1c2goeyBwYXJ0OiBwYXJ0TnVtYmVyLCBldGFnIH0pXG5cbiAgICAgIC8vIElnbm9yZSB0aGUgJ2RhdGEnIGV2ZW50IHNvIHRoYXQgdGhlIHN0cmVhbSBjbG9zZXMuIChub2RlanMgc3RyZWFtIHJlcXVpcmVtZW50KVxuICAgICAgcmVzcG9uc2Uub24oJ2RhdGEnLCAoKSA9PiB7fSlcblxuICAgICAgLy8gV2UncmUgcmVhZHkgZm9yIHRoZSBuZXh0IGNodW5rLlxuICAgICAgY2FsbGJhY2soKVxuICAgIH0pXG4gIH1cblxuICBfZmx1c2goY2FsbGJhY2spIHtcbiAgICBpZiAodGhpcy5lbXB0eVN0cmVhbSkge1xuICAgICAgbGV0IG1ldGhvZCA9ICdQVVQnXG4gICAgICBsZXQgaGVhZGVycyA9IE9iamVjdC5hc3NpZ24oe30sIHRoaXMubWV0YURhdGEsIHsgJ0NvbnRlbnQtTGVuZ3RoJzogMCB9KVxuICAgICAgbGV0IG9wdGlvbnMgPSB7XG4gICAgICAgIG1ldGhvZCxcbiAgICAgICAgaGVhZGVycyxcbiAgICAgICAgcXVlcnk6ICcnLFxuICAgICAgICBidWNrZXROYW1lOiB0aGlzLmJ1Y2tldE5hbWUsXG4gICAgICAgIG9iamVjdE5hbWU6IHRoaXMub2JqZWN0TmFtZSxcbiAgICAgIH1cblxuICAgICAgdGhpcy5jbGllbnQubWFrZVJlcXVlc3Qob3B0aW9ucywgJycsIFsyMDBdLCAnJywgdHJ1ZSwgKGVyciwgcmVzcG9uc2UpID0+IHtcbiAgICAgICAgaWYgKGVycikge1xuICAgICAgICAgIHJldHVybiBjYWxsYmFjayhlcnIpXG4gICAgICAgIH1cblxuICAgICAgICBsZXQgcmVzdWx0ID0ge1xuICAgICAgICAgIGV0YWc6IHNhbml0aXplRVRhZyhyZXNwb25zZS5oZWFkZXJzLmV0YWcpLFxuICAgICAgICAgIHZlcnNpb25JZDogZ2V0VmVyc2lvbklkKHJlc3BvbnNlLmhlYWRlcnMpLFxuICAgICAgICB9XG5cbiAgICAgICAgLy8gSWdub3JlIHRoZSAnZGF0YScgZXZlbnQgc28gdGhhdCB0aGUgc3RyZWFtIGNsb3Nlcy4gKG5vZGVqcyBzdHJlYW0gcmVxdWlyZW1lbnQpXG4gICAgICAgIHJlc3BvbnNlLm9uKCdkYXRhJywgKCkgPT4ge30pXG5cbiAgICAgICAgLy8gR2l2ZSB0aGUgZXRhZyBiYWNrLCB3ZSdyZSBkb25lIVxuICAgICAgICBwcm9jZXNzLm5leHRUaWNrKCgpID0+IHtcbiAgICAgICAgICB0aGlzLmNhbGxiYWNrKG51bGwsIHJlc3VsdClcbiAgICAgICAgfSlcblxuICAgICAgICAvLyBCZWNhdXNlIHdlJ3JlIHN1cmUgdGhlIHN0cmVhbSBoYXMgZW5kZWQsIGFsbG93IGl0IHRvIGZsdXNoIGFuZCBlbmQuXG4gICAgICAgIGNhbGxiYWNrKClcbiAgICAgIH0pXG5cbiAgICAgIHJldHVyblxuICAgIH1cbiAgICAvLyBJZiBpdCBoYXMgYmVlbiB1cGxvYWRlZCBpbiBhIHNpbmdsZSBwYWNrZXQsIHdlIGRvbid0IGhhdmUgdG8gZG8gYW55dGhpbmcuXG4gICAgaWYgKHRoaXMuaWQgPT09IG51bGwpIHtcbiAgICAgIHJldHVyblxuICAgIH1cblxuICAgIC8vIFRoaXMgaXMgY2FsbGVkIHdoZW4gYWxsIG9mIHRoZSBjaHVua3MgdXBsb2FkZWQgc3VjY2Vzc2Z1bGx5LCB0aHVzXG4gICAgLy8gY29tcGxldGluZyB0aGUgbXVsdGlwYXJ0IHVwbG9hZC5cbiAgICB0aGlzLmNsaWVudC5jb21wbGV0ZU11bHRpcGFydFVwbG9hZCh0aGlzLmJ1Y2tldE5hbWUsIHRoaXMub2JqZWN0TmFtZSwgdGhpcy5pZCwgdGhpcy5ldGFncywgKGVyciwgZXRhZykgPT4ge1xuICAgICAgaWYgKGVycikge1xuICAgICAgICByZXR1cm4gY2FsbGJhY2soZXJyKVxuICAgICAgfVxuXG4gICAgICAvLyBDYWxsIG91ciBjYWxsYmFjayBvbiB0aGUgbmV4dCB0aWNrIHRvIGFsbG93IHRoZSBzdHJlYW1zIGluZnJhc3RydWN0dXJlXG4gICAgICAvLyB0byBmaW5pc2ggd2hhdCBpdHMgZG9pbmcgYmVmb3JlIHdlIGNvbnRpbnVlLlxuICAgICAgcHJvY2Vzcy5uZXh0VGljaygoKSA9PiB7XG4gICAgICAgIHRoaXMuY2FsbGJhY2sobnVsbCwgZXRhZylcbiAgICAgIH0pXG5cbiAgICAgIGNhbGxiYWNrKClcbiAgICB9KVxuICB9XG59XG5cbi8vIGRlcHJlY2F0ZWQgZGVmYXVsdCBleHBvcnQsIHBsZWFzZSB1c2UgbmFtZWQgZXhwb3J0cy5cbi8vIGtlZXAgZm9yIGJhY2t3YXJkIGNvbXBhdGliaWxpdHkuXG4vLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgaW1wb3J0L25vLWRlZmF1bHQtZXhwb3J0XG5leHBvcnQgZGVmYXVsdCBPYmplY3RVcGxvYWRlclxuIl0sIm1hcHBpbmdzIjoiOzs7OztBQWdCQSxJQUFBQSxNQUFBLEdBQUFDLHVCQUFBLENBQUFDLE9BQUE7QUFDQSxJQUFBQyxPQUFBLEdBQUFELE9BQUE7QUFFQSxJQUFBRSxXQUFBLEdBQUFILHVCQUFBLENBQUFDLE9BQUE7QUFFQSxJQUFBRyxPQUFBLEdBQUFILE9BQUE7QUFBaUUsU0FBQUkseUJBQUFDLFdBQUEsZUFBQUMsT0FBQSxrQ0FBQUMsaUJBQUEsT0FBQUQsT0FBQSxRQUFBRSxnQkFBQSxPQUFBRixPQUFBLFlBQUFGLHdCQUFBLFlBQUFBLENBQUFDLFdBQUEsV0FBQUEsV0FBQSxHQUFBRyxnQkFBQSxHQUFBRCxpQkFBQSxLQUFBRixXQUFBO0FBQUEsU0FBQU4sd0JBQUFVLEdBQUEsRUFBQUosV0FBQSxTQUFBQSxXQUFBLElBQUFJLEdBQUEsSUFBQUEsR0FBQSxDQUFBQyxVQUFBLFdBQUFELEdBQUEsUUFBQUEsR0FBQSxvQkFBQUEsR0FBQSx3QkFBQUEsR0FBQSw0QkFBQUUsT0FBQSxFQUFBRixHQUFBLFVBQUFHLEtBQUEsR0FB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