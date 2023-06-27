"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
var Stream = _interopRequireWildcard(require("stream"), true);
var errors = _interopRequireWildcard(require("./errors.js"), true);
var _helper = require("./internal/helper.js");
var transformers = _interopRequireWildcard(require("./transformers.js"), true);
function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }
function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }
/*
 * MinIO Javascript Library for Amazon S3 Compatible Cloud Storage, (C) 2020 MinIO, Inc.
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

class extensions {
  constructor(client) {
    this.client = client;
  }

  // List the objects in the bucket using S3 ListObjects V2 With Metadata
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
  //   * `obj.metadata` _object_: metadata of the object

  listObjectsV2WithMetadata(bucketName, prefix, recursive, startAfter) {
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
      this.listObjectsV2WithMetadataQuery(bucketName, prefix, continuationToken, delimiter, 1000, startAfter).on('error', e => readStream.emit('error', e)).on('data', result => {
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

  // listObjectsV2WithMetadataQuery - (List Objects V2 with metadata) - List some or all (up to 1000) of the objects in a bucket.
  //
  // You can use the request parameters as selection criteria to return a subset of the objects in a bucket.
  // request parameters :-
  // * `bucketName` _string_: name of the bucket
  // * `prefix` _string_: Limits the response to keys that begin with the specified prefix.
  // * `continuation-token` _string_: Used to continue iterating over a set of objects.
  // * `delimiter` _string_: A delimiter is a character you use to group keys.
  // * `max-keys` _number_: Sets the maximum number of keys returned in the response body.
  // * `start-after` _string_: Specifies the key to start after when listing objects in a bucket.

  listObjectsV2WithMetadataQuery(bucketName, prefix, continuationToken, delimiter, maxKeys, startAfter) {
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
    queries.push(`metadata=true`);
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
    var transformer = transformers.getListObjectsV2WithMetadataTransformer();
    this.client.makeRequest({
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
}

// deprecated default export, please use named exports.
// keep for backward compatibility.
// eslint-disable-next-line import/no-default-export
exports.extensions = extensions;
var _default = extensions;
exports.default = _default;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJTdHJlYW0iLCJfaW50ZXJvcFJlcXVpcmVXaWxkY2FyZCIsInJlcXVpcmUiLCJlcnJvcnMiLCJfaGVscGVyIiwidHJhbnNmb3JtZXJzIiwiX2dldFJlcXVpcmVXaWxkY2FyZENhY2hlIiwibm9kZUludGVyb3AiLCJXZWFrTWFwIiwiY2FjaGVCYWJlbEludGVyb3AiLCJjYWNoZU5vZGVJbnRlcm9wIiwib2JqIiwiX19lc01vZHVsZSIsImRlZmF1bHQiLCJjYWNoZSIsImhhcyIsImdldCIsIm5ld09iaiIsImhhc1Byb3BlcnR5RGVzY3JpcHRvciIsIk9iamVjdCIsImRlZmluZVByb3BlcnR5IiwiZ2V0T3duUHJvcGVydHlEZXNjcmlwdG9yIiwia2V5IiwicHJvdG90eXBlIiwiaGFzT3duUHJvcGVydHkiLCJjYWxsIiwiZGVzYyIsInNldCIsImV4dGVuc2lvbnMiLCJjb25zdHJ1Y3RvciIsImNsaWVudCIsImxpc3RPYmplY3RzVjJXaXRoTWV0YWRhdGEiLCJidWNrZXROYW1lIiwicHJlZml4IiwicmVjdXJzaXZlIiwic3RhcnRBZnRlciIsInVuZGVmaW5lZCIsImlzVmFsaWRCdWNrZXROYW1lIiwiSW52YWxpZEJ1Y2tldE5hbWVFcnJvciIsImlzVmFsaWRQcmVmaXgiLCJJbnZhbGlkUHJlZml4RXJyb3IiLCJpc1N0cmluZyIsIlR5cGVFcnJvciIsImlzQm9vbGVhbiIsImRlbGltaXRlciIsImNvbnRpbnVhdGlvblRva2VuIiwib2JqZWN0cyIsImVuZGVkIiwicmVhZFN0cmVhbSIsIlJlYWRhYmxlIiwib2JqZWN0TW9kZSIsIl9yZWFkIiwibGVuZ3RoIiwicHVzaCIsInNoaWZ0IiwibGlzdE9iamVjdHNWMldpdGhNZXRhZGF0YVF1ZXJ5Iiwib24iLCJlIiwiZW1pdCIsInJlc3VsdCIsImlzVHJ1bmNhdGVkIiwibmV4dENvbnRpbnVhdGlvblRva2VuIiwibWF4S2V5cyIsImlzTnVtYmVyIiwicXVlcmllcyIsInVyaUVzY2FwZSIsInNvcnQiLCJxdWVyeSIsImpvaW4iLCJtZXRob2QiLCJ0cmFuc2Zvcm1lciIsImdldExpc3RPYmplY3RzVjJXaXRoTWV0YWRhdGFUcmFuc2Zvcm1lciIsIm1ha2VSZXF1ZXN0IiwicmVzcG9uc2UiLCJwaXBlc2V0dXAiLCJleHBvcnRzIiwiX2RlZmF1bHQiXSwic291cmNlcyI6WyJleHRlbnNpb25zLmpzIl0sInNvdXJjZXNDb250ZW50IjpbIi8qXG4gKiBNaW5JTyBKYXZhc2NyaXB0IExpYnJhcnkgZm9yIEFtYXpvbiBTMyBDb21wYXRpYmxlIENsb3VkIFN0b3JhZ2UsIChDKSAyMDIwIE1pbklPLCBJbmMuXG4gKlxuICogTGljZW5zZWQgdW5kZXIgdGhlIEFwYWNoZSBMaWNlbnNlLCBWZXJzaW9uIDIuMCAodGhlIFwiTGljZW5zZVwiKTtcbiAqIHlvdSBtYXkgbm90IHVzZSB0aGlzIGZpbGUgZXhjZXB0IGluIGNvbXBsaWFuY2Ugd2l0aCB0aGUgTGljZW5zZS5cbiAqIFlvdSBtYXkgb2J0YWluIGEgY29weSBvZiB0aGUgTGljZW5zZSBhdFxuICpcbiAqICAgICBodHRwOi8vd3d3LmFwYWNoZS5vcmcvbGljZW5zZXMvTElDRU5TRS0yLjBcbiAqXG4gKiBVbmxlc3MgcmVxdWlyZWQgYnkgYXBwbGljYWJsZSBsYXcgb3IgYWdyZWVkIHRvIGluIHdyaXRpbmcsIHNvZnR3YXJlXG4gKiBkaXN0cmlidXRlZCB1bmRlciB0aGUgTGljZW5zZSBpcyBkaXN0cmlidXRlZCBvbiBhbiBcIkFTIElTXCIgQkFTSVMsXG4gKiBXSVRIT1VUIFdBUlJBTlRJRVMgT1IgQ09ORElUSU9OUyBPRiBBTlkgS0lORCwgZWl0aGVyIGV4cHJlc3Mgb3IgaW1wbGllZC5cbiAqIFNlZSB0aGUgTGljZW5zZSBmb3IgdGhlIHNwZWNpZmljIGxhbmd1YWdlIGdvdmVybmluZyBwZXJtaXNzaW9ucyBhbmRcbiAqIGxpbWl0YXRpb25zIHVuZGVyIHRoZSBMaWNlbnNlLlxuICovXG5cbmltcG9ydCAqIGFzIFN0cmVhbSBmcm9tICdub2RlOnN0cmVhbSdcblxuaW1wb3J0ICogYXMgZXJyb3JzIGZyb20gJy4vZXJyb3JzLnRzJ1xuaW1wb3J0IHtcbiAgaXNCb29sZWFuLFxuICBpc051bWJlcixcbiAgaXNTdHJpbmcsXG4gIGlzVmFsaWRCdWNrZXROYW1lLFxuICBpc1ZhbGlkUHJlZml4LFxuICBwaXBlc2V0dXAsXG4gIHVyaUVzY2FwZSxcbn0gZnJvbSAnLi9pbnRlcm5hbC9oZWxwZXIudHMnXG5pbXBvcnQgKiBhcyB0cmFuc2Zvcm1lcnMgZnJvbSAnLi90cmFuc2Zvcm1lcnMuanMnXG5cbmV4cG9ydCBjbGFzcyBleHRlbnNpb25zIHtcbiAgY29uc3RydWN0b3IoY2xpZW50KSB7XG4gICAgdGhpcy5jbGllbnQgPSBjbGllbnRcbiAgfVxuXG4gIC8vIExpc3QgdGhlIG9iamVjdHMgaW4gdGhlIGJ1Y2tldCB1c2luZyBTMyBMaXN0T2JqZWN0cyBWMiBXaXRoIE1ldGFkYXRhXG4gIC8vXG4gIC8vIF9fQXJndW1lbnRzX19cbiAgLy8gKiBgYnVja2V0TmFtZWAgX3N0cmluZ186IG5hbWUgb2YgdGhlIGJ1Y2tldFxuICAvLyAqIGBwcmVmaXhgIF9zdHJpbmdfOiB0aGUgcHJlZml4IG9mIHRoZSBvYmplY3RzIHRoYXQgc2hvdWxkIGJlIGxpc3RlZCAob3B0aW9uYWwsIGRlZmF1bHQgYCcnYClcbiAgLy8gKiBgcmVjdXJzaXZlYCBfYm9vbF86IGB0cnVlYCBpbmRpY2F0ZXMgcmVjdXJzaXZlIHN0eWxlIGxpc3RpbmcgYW5kIGBmYWxzZWAgaW5kaWNhdGVzIGRpcmVjdG9yeSBzdHlsZSBsaXN0aW5nIGRlbGltaXRlZCBieSAnLycuIChvcHRpb25hbCwgZGVmYXVsdCBgZmFsc2VgKVxuICAvLyAqIGBzdGFydEFmdGVyYCBfc3RyaW5nXzogU3BlY2lmaWVzIHRoZSBrZXkgdG8gc3RhcnQgYWZ0ZXIgd2hlbiBsaXN0aW5nIG9iamVjdHMgaW4gYSBidWNrZXQuIChvcHRpb25hbCwgZGVmYXVsdCBgJydgKVxuICAvL1xuICAvLyBfX1JldHVybiBWYWx1ZV9fXG4gIC8vICogYHN0cmVhbWAgX1N0cmVhbV86IHN0cmVhbSBlbWl0dGluZyB0aGUgb2JqZWN0cyBpbiB0aGUgYnVja2V0LCB0aGUgb2JqZWN0IGlzIG9mIHRoZSBmb3JtYXQ6XG4gIC8vICAgKiBgb2JqLm5hbWVgIF9zdHJpbmdfOiBuYW1lIG9mIHRoZSBvYmplY3RcbiAgLy8gICAqIGBvYmoucHJlZml4YCBfc3RyaW5nXzogbmFtZSBvZiB0aGUgb2JqZWN0IHByZWZpeFxuICAvLyAgICogYG9iai5zaXplYCBfbnVtYmVyXzogc2l6ZSBvZiB0aGUgb2JqZWN0XG4gIC8vICAgKiBgb2JqLmV0YWdgIF9zdHJpbmdfOiBldGFnIG9mIHRoZSBvYmplY3RcbiAgLy8gICAqIGBvYmoubGFzdE1vZGlmaWVkYCBfRGF0ZV86IG1vZGlmaWVkIHRpbWUgc3RhbXBcbiAgLy8gICAqIGBvYmoubWV0YWRhdGFgIF9vYmplY3RfOiBtZXRhZGF0YSBvZiB0aGUgb2JqZWN0XG5cbiAgbGlzdE9iamVjdHNWMldpdGhNZXRhZGF0YShidWNrZXROYW1lLCBwcmVmaXgsIHJlY3Vyc2l2ZSwgc3RhcnRBZnRlcikge1xuICAgIGlmIChwcmVmaXggPT09IHVuZGVmaW5lZCkge1xuICAgICAgcHJlZml4ID0gJydcbiAgICB9XG4gICAgaWYgKHJlY3Vyc2l2ZSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICByZWN1cnNpdmUgPSBmYWxzZVxuICAgIH1cbiAgICBpZiAoc3RhcnRBZnRlciA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBzdGFydEFmdGVyID0gJydcbiAgICB9XG4gICAgaWYgKCFpc1ZhbGlkQnVja2V0TmFtZShidWNrZXROYW1lKSkge1xuICAgICAgdGhyb3cgbmV3IGVycm9ycy5JbnZhbGlkQnVja2V0TmFtZUVycm9yKCdJbnZhbGlkIGJ1Y2tldCBuYW1lOiAnICsgYnVja2V0TmFtZSlcbiAgICB9XG4gICAgaWYgKCFpc1ZhbGlkUHJlZml4KHByZWZpeCkpIHtcbiAgICAgIHRocm93IG5ldyBlcnJvcnMuSW52YWxpZFByZWZpeEVycm9yKGBJbnZhbGlkIHByZWZpeCA6ICR7cHJlZml4fWApXG4gICAgfVxuICAgIGlmICghaXNTdHJpbmcocHJlZml4KSkge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcigncHJlZml4IHNob3VsZCBiZSBvZiB0eXBlIFwic3RyaW5nXCInKVxuICAgIH1cbiAgICBpZiAoIWlzQm9vbGVhbihyZWN1cnNpdmUpKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdyZWN1cnNpdmUgc2hvdWxkIGJlIG9mIHR5cGUgXCJib29sZWFuXCInKVxuICAgIH1cbiAgICBpZiAoIWlzU3RyaW5nKHN0YXJ0QWZ0ZXIpKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdzdGFydEFmdGVyIHNob3VsZCBiZSBvZiB0eXBlIFwic3RyaW5nXCInKVxuICAgIH1cbiAgICAvLyBpZiByZWN1cnNpdmUgaXMgZmFsc2Ugc2V0IGRlbGltaXRlciB0byAnLydcbiAgICB2YXIgZGVsaW1pdGVyID0gcmVjdXJzaXZlID8gJycgOiAnLydcbiAgICB2YXIgY29udGludWF0aW9uVG9rZW4gPSAnJ1xuICAgIHZhciBvYmplY3RzID0gW11cbiAgICB2YXIgZW5kZWQgPSBmYWxzZVxuICAgIHZhciByZWFkU3RyZWFtID0gU3RyZWFtLlJlYWRhYmxlKHsgb2JqZWN0TW9kZTogdHJ1ZSB9KVxuICAgIHJlYWRTdHJlYW0uX3JlYWQgPSAoKSA9PiB7XG4gICAgICAvLyBwdXNoIG9uZSBvYmplY3QgcGVyIF9yZWFkKClcbiAgICAgIGlmIChvYmplY3RzLmxlbmd0aCkge1xuICAgICAgICByZWFkU3RyZWFtLnB1c2gob2JqZWN0cy5zaGlmdCgpKVxuICAgICAgICByZXR1cm5cbiAgICAgIH1cbiAgICAgIGlmIChlbmRlZCkge1xuICAgICAgICByZXR1cm4gcmVhZFN0cmVhbS5wdXNoKG51bGwpXG4gICAgICB9XG4gICAgICAvLyBpZiB0aGVyZSBhcmUgbm8gb2JqZWN0cyB0byBwdXNoIGRvIHF1ZXJ5IGZvciB0aGUgbmV4dCBiYXRjaCBvZiBvYmplY3RzXG4gICAgICB0aGlzLmxpc3RPYmplY3RzVjJXaXRoTWV0YWRhdGFRdWVyeShidWNrZXROYW1lLCBwcmVmaXgsIGNvbnRpbnVhdGlvblRva2VuLCBkZWxpbWl0ZXIsIDEwMDAsIHN0YXJ0QWZ0ZXIpXG4gICAgICAgIC5vbignZXJyb3InLCAoZSkgPT4gcmVhZFN0cmVhbS5lbWl0KCdlcnJvcicsIGUpKVxuICAgICAgICAub24oJ2RhdGEnLCAocmVzdWx0KSA9PiB7XG4gICAgICAgICAgaWYgKHJlc3VsdC5pc1RydW5jYXRlZCkge1xuICAgICAgICAgICAgY29udGludWF0aW9uVG9rZW4gPSByZXN1bHQubmV4dENvbnRpbnVhdGlvblRva2VuXG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGVuZGVkID0gdHJ1ZVxuICAgICAgICAgIH1cbiAgICAgICAgICBvYmplY3RzID0gcmVzdWx0Lm9iamVjdHNcbiAgICAgICAgICByZWFkU3RyZWFtLl9yZWFkKClcbiAgICAgICAgfSlcbiAgICB9XG4gICAgcmV0dXJuIHJlYWRTdHJlYW1cbiAgfVxuXG4gIC8vIGxpc3RPYmplY3RzVjJXaXRoTWV0YWRhdGFRdWVyeSAtIChMaXN0IE9iamVjdHMgVjIgd2l0aCBtZXRhZGF0YSkgLSBMaXN0IHNvbWUgb3IgYWxsICh1cCB0byAxMDAwKSBvZiB0aGUgb2JqZWN0cyBpbiBhIGJ1Y2tldC5cbiAgLy9cbiAgLy8gWW91IGNhbiB1c2UgdGhlIHJlcXVlc3QgcGFyYW1ldGVycyBhcyBzZWxlY3Rpb24gY3JpdGVyaWEgdG8gcmV0dXJuIGEgc3Vic2V0IG9mIHRoZSBvYmplY3RzIGluIGEgYnVja2V0LlxuICAvLyByZXF1ZXN0IHBhcmFtZXRlcnMgOi1cbiAgLy8gKiBgYnVja2V0TmFtZWAgX3N0cmluZ186IG5hbWUgb2YgdGhlIGJ1Y2tldFxuICAvLyAqIGBwcmVmaXhgIF9zdHJpbmdfOiBMaW1pdHMgdGhlIHJlc3BvbnNlIHRvIGtleXMgdGhhdCBiZWdpbiB3aXRoIHRoZSBzcGVjaWZpZWQgcHJlZml4LlxuICAvLyAqIGBjb250aW51YXRpb24tdG9rZW5gIF9zdHJpbmdfOiBVc2VkIHRvIGNvbnRpbnVlIGl0ZXJhdGluZyBvdmVyIGEgc2V0IG9mIG9iamVjdHMuXG4gIC8vICogYGRlbGltaXRlcmAgX3N0cmluZ186IEEgZGVsaW1pdGVyIGlzIGEgY2hhcmFjdGVyIHlvdSB1c2UgdG8gZ3JvdXAga2V5cy5cbiAgLy8gKiBgbWF4LWtleXNgIF9udW1iZXJfOiBTZXRzIHRoZSBtYXhpbXVtIG51bWJlciBvZiBrZXlzIHJldHVybmVkIGluIHRoZSByZXNwb25zZSBib2R5LlxuICAvLyAqIGBzdGFydC1hZnRlcmAgX3N0cmluZ186IFNwZWNpZmllcyB0aGUga2V5IHRvIHN0YXJ0IGFmdGVyIHdoZW4gbGlzdGluZyBvYmplY3RzIGluIGEgYnVja2V0LlxuXG4gIGxpc3RPYmplY3RzVjJXaXRoTWV0YWRhdGFRdWVyeShidWNrZXROYW1lLCBwcmVmaXgsIGNvbnRpbnVhdGlvblRva2VuLCBkZWxpbWl0ZXIsIG1heEtleXMsIHN0YXJ0QWZ0ZXIpIHtcbiAgICBpZiAoIWlzVmFsaWRCdWNrZXROYW1lKGJ1Y2tldE5hbWUpKSB7XG4gICAgICB0aHJvdyBuZXcgZXJyb3JzLkludmFsaWRCdWNrZXROYW1lRXJyb3IoJ0ludmFsaWQgYnVja2V0IG5hbWU6ICcgKyBidWNrZXROYW1lKVxuICAgIH1cbiAgICBpZiAoIWlzU3RyaW5nKHByZWZpeCkpIHtcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ3ByZWZpeCBzaG91bGQgYmUgb2YgdHlwZSBcInN0cmluZ1wiJylcbiAgICB9XG4gICAgaWYgKCFpc1N0cmluZyhjb250aW51YXRpb25Ub2tlbikpIHtcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ2NvbnRpbnVhdGlvblRva2VuIHNob3VsZCBiZSBvZiB0eXBlIFwic3RyaW5nXCInKVxuICAgIH1cbiAgICBpZiAoIWlzU3RyaW5nKGRlbGltaXRlcikpIHtcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ2RlbGltaXRlciBzaG91bGQgYmUgb2YgdHlwZSBcInN0cmluZ1wiJylcbiAgICB9XG4gICAgaWYgKCFpc051bWJlcihtYXhLZXlzKSkge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignbWF4S2V5cyBzaG91bGQgYmUgb2YgdHlwZSBcIm51bWJlclwiJylcbiAgICB9XG4gICAgaWYgKCFpc1N0cmluZyhzdGFydEFmdGVyKSkge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignc3RhcnRBZnRlciBzaG91bGQgYmUgb2YgdHlwZSBcInN0cmluZ1wiJylcbiAgICB9XG4gICAgdmFyIHF1ZXJpZXMgPSBbXVxuXG4gICAgLy8gQ2FsbCBmb3IgbGlzdGluZyBvYmplY3RzIHYyIEFQSVxuICAgIHF1ZXJpZXMucHVzaChgbGlzdC10eXBlPTJgKVxuICAgIHF1ZXJpZXMucHVzaChgZW5jb2RpbmctdHlwZT11cmxgKVxuICAgIC8vIGVzY2FwZSBldmVyeSB2YWx1ZSBpbiBxdWVyeSBzdHJpbmcsIGV4Y2VwdCBtYXhLZXlzXG4gICAgcXVlcmllcy5wdXNoKGBwcmVmaXg9JHt1cmlFc2NhcGUocHJlZml4KX1gKVxuICAgIHF1ZXJpZXMucHVzaChgZGVsaW1pdGVyPSR7dXJpRXNjYXBlKGRlbGltaXRlcil9YClcbiAgICBxdWVyaWVzLnB1c2goYG1ldGFkYXRhPXRydWVgKVxuXG4gICAgaWYgKGNvbnRpbnVhdGlvblRva2VuKSB7XG4gICAgICBjb250aW51YXRpb25Ub2tlbiA9IHVyaUVzY2FwZShjb250aW51YXRpb25Ub2tlbilcbiAgICAgIHF1ZXJpZXMucHVzaChgY29udGludWF0aW9uLXRva2VuPSR7Y29udGludWF0aW9uVG9rZW59YClcbiAgICB9XG4gICAgLy8gU2V0IHN0YXJ0LWFmdGVyXG4gICAgaWYgKHN0YXJ0QWZ0ZXIpIHtcbiAgICAgIHN0YXJ0QWZ0ZXIgPSB1cmlFc2NhcGUoc3RhcnRBZnRlcilcbiAgICAgIHF1ZXJpZXMucHVzaChgc3RhcnQtYWZ0ZXI9JHtzdGFydEFmdGVyfWApXG4gICAgfVxuICAgIC8vIG5vIG5lZWQgdG8gZXNjYXBlIG1heEtleXNcbiAgICBpZiAobWF4S2V5cykge1xuICAgICAgaWYgKG1heEtleXMgPj0gMTAwMCkge1xuICAgICAgICBtYXhLZXlzID0gMTAwMFxuICAgICAgfVxuICAgICAgcXVlcmllcy5wdXNoKGBtYXgta2V5cz0ke21heEtleXN9YClcbiAgICB9XG4gICAgcXVlcmllcy5zb3J0KClcbiAgICB2YXIgcXVlcnkgPSAnJ1xuICAgIGlmIChxdWVyaWVzLmxlbmd0aCA+IDApIHtcbiAgICAgIHF1ZXJ5ID0gYCR7cXVlcmllcy5qb2luKCcmJyl9YFxuICAgIH1cbiAgICB2YXIgbWV0aG9kID0gJ0dFVCdcbiAgICB2YXIgdHJhbnNmb3JtZXIgPSB0cmFuc2Zvcm1lcnMuZ2V0TGlzdE9iamVjdHNWMldpdGhNZXRhZGF0YVRyYW5zZm9ybWVyKClcbiAgICB0aGlzLmNsaWVudC5tYWtlUmVxdWVzdCh7IG1ldGhvZCwgYnVja2V0TmFtZSwgcXVlcnkgfSwgJycsIFsyMDBdLCAnJywgdHJ1ZSwgKGUsIHJlc3BvbnNlKSA9PiB7XG4gICAgICBpZiAoZSkge1xuICAgICAgICByZXR1cm4gdHJhbnNmb3JtZXIuZW1pdCgnZXJyb3InLCBlKVxuICAgICAgfVxuICAgICAgcGlwZXNldHVwKHJlc3BvbnNlLCB0cmFuc2Zvcm1lcilcbiAgICB9KVxuICAgIHJldHVybiB0cmFuc2Zvcm1lclxuICB9XG59XG5cbi8vIGRlcHJlY2F0ZWQgZGVmYXVsdCBleHBvcnQsIHBsZWFzZSB1c2UgbmFtZWQgZXhwb3J0cy5cbi8vIGtlZXAgZm9yIGJhY2t3YXJkIGNvbXBhdGliaWxpdHkuXG4vLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgaW1wb3J0L25vLWRlZmF1bHQtZXhwb3J0XG5leHBvcnQgZGVmYXVsdCBleHRlbnNpb25zXG4iXSwibWFwcGluZ3MiOiI7Ozs7O0FBZ0JBLElBQUFBLE1BQUEsR0FBQUMsdUJBQUEsQ0FBQUMsT0FBQTtBQUVBLElBQUFDLE1BQUEsR0FBQUYsdUJBQUEsQ0FBQUMsT0FBQTtBQUNBLElBQUFF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