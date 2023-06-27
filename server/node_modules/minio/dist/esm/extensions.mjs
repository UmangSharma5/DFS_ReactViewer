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

import * as Stream from "stream";
import * as errors from "./errors.mjs";
import { isBoolean, isNumber, isString, isValidBucketName, isValidPrefix, pipesetup, uriEscape } from "./internal/helper.mjs";
import * as transformers from "./transformers.mjs";
export class extensions {
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
    queries.push(`metadata=true`);
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
    var transformer = transformers.getListObjectsV2WithMetadataTransformer();
    this.client.makeRequest({
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
}

// deprecated default export, please use named exports.
// keep for backward compatibility.
// eslint-disable-next-line import/no-default-export
export default extensions;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJTdHJlYW0iLCJlcnJvcnMiLCJpc0Jvb2xlYW4iLCJpc051bWJlciIsImlzU3RyaW5nIiwiaXNWYWxpZEJ1Y2tldE5hbWUiLCJpc1ZhbGlkUHJlZml4IiwicGlwZXNldHVwIiwidXJpRXNjYXBlIiwidHJhbnNmb3JtZXJzIiwiZXh0ZW5zaW9ucyIsImNvbnN0cnVjdG9yIiwiY2xpZW50IiwibGlzdE9iamVjdHNWMldpdGhNZXRhZGF0YSIsImJ1Y2tldE5hbWUiLCJwcmVmaXgiLCJyZWN1cnNpdmUiLCJzdGFydEFmdGVyIiwidW5kZWZpbmVkIiwiSW52YWxpZEJ1Y2tldE5hbWVFcnJvciIsIkludmFsaWRQcmVmaXhFcnJvciIsIlR5cGVFcnJvciIsImRlbGltaXRlciIsImNvbnRpbnVhdGlvblRva2VuIiwib2JqZWN0cyIsImVuZGVkIiwicmVhZFN0cmVhbSIsIlJlYWRhYmxlIiwib2JqZWN0TW9kZSIsIl9yZWFkIiwibGVuZ3RoIiwicHVzaCIsInNoaWZ0IiwibGlzdE9iamVjdHNWMldpdGhNZXRhZGF0YVF1ZXJ5Iiwib24iLCJlIiwiZW1pdCIsInJlc3VsdCIsImlzVHJ1bmNhdGVkIiwibmV4dENvbnRpbnVhdGlvblRva2VuIiwibWF4S2V5cyIsInF1ZXJpZXMiLCJzb3J0IiwicXVlcnkiLCJqb2luIiwibWV0aG9kIiwidHJhbnNmb3JtZXIiLCJnZXRMaXN0T2JqZWN0c1YyV2l0aE1ldGFkYXRhVHJhbnNmb3JtZXIiLCJtYWtlUmVxdWVzdCIsInJlc3BvbnNlIl0sInNvdXJjZXMiOlsiZXh0ZW5zaW9ucy5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyIvKlxuICogTWluSU8gSmF2YXNjcmlwdCBMaWJyYXJ5IGZvciBBbWF6b24gUzMgQ29tcGF0aWJsZSBDbG91ZCBTdG9yYWdlLCAoQykgMjAyMCBNaW5JTywgSW5jLlxuICpcbiAqIExpY2Vuc2VkIHVuZGVyIHRoZSBBcGFjaGUgTGljZW5zZSwgVmVyc2lvbiAyLjAgKHRoZSBcIkxpY2Vuc2VcIik7XG4gKiB5b3UgbWF5IG5vdCB1c2UgdGhpcyBmaWxlIGV4Y2VwdCBpbiBjb21wbGlhbmNlIHdpdGggdGhlIExpY2Vuc2UuXG4gKiBZb3UgbWF5IG9idGFpbiBhIGNvcHkgb2YgdGhlIExpY2Vuc2UgYXRcbiAqXG4gKiAgICAgaHR0cDovL3d3dy5hcGFjaGUub3JnL2xpY2Vuc2VzL0xJQ0VOU0UtMi4wXG4gKlxuICogVW5sZXNzIHJlcXVpcmVkIGJ5IGFwcGxpY2FibGUgbGF3IG9yIGFncmVlZCB0byBpbiB3cml0aW5nLCBzb2Z0d2FyZVxuICogZGlzdHJpYnV0ZWQgdW5kZXIgdGhlIExpY2Vuc2UgaXMgZGlzdHJpYnV0ZWQgb24gYW4gXCJBUyBJU1wiIEJBU0lTLFxuICogV0lUSE9VVCBXQVJSQU5USUVTIE9SIENPTkRJVElPTlMgT0YgQU5ZIEtJTkQsIGVpdGhlciBleHByZXNzIG9yIGltcGxpZWQuXG4gKiBTZWUgdGhlIExpY2Vuc2UgZm9yIHRoZSBzcGVjaWZpYyBsYW5ndWFnZSBnb3Zlcm5pbmcgcGVybWlzc2lvbnMgYW5kXG4gKiBsaW1pdGF0aW9ucyB1bmRlciB0aGUgTGljZW5zZS5cbiAqL1xuXG5pbXBvcnQgKiBhcyBTdHJlYW0gZnJvbSAnbm9kZTpzdHJlYW0nXG5cbmltcG9ydCAqIGFzIGVycm9ycyBmcm9tICcuL2Vycm9ycy50cydcbmltcG9ydCB7XG4gIGlzQm9vbGVhbixcbiAgaXNOdW1iZXIsXG4gIGlzU3RyaW5nLFxuICBpc1ZhbGlkQnVja2V0TmFtZSxcbiAgaXNWYWxpZFByZWZpeCxcbiAgcGlwZXNldHVwLFxuICB1cmlFc2NhcGUsXG59IGZyb20gJy4vaW50ZXJuYWwvaGVscGVyLnRzJ1xuaW1wb3J0ICogYXMgdHJhbnNmb3JtZXJzIGZyb20gJy4vdHJhbnNmb3JtZXJzLmpzJ1xuXG5leHBvcnQgY2xhc3MgZXh0ZW5zaW9ucyB7XG4gIGNvbnN0cnVjdG9yKGNsaWVudCkge1xuICAgIHRoaXMuY2xpZW50ID0gY2xpZW50XG4gIH1cblxuICAvLyBMaXN0IHRoZSBvYmplY3RzIGluIHRoZSBidWNrZXQgdXNpbmcgUzMgTGlzdE9iamVjdHMgVjIgV2l0aCBNZXRhZGF0YVxuICAvL1xuICAvLyBfX0FyZ3VtZW50c19fXG4gIC8vICogYGJ1Y2tldE5hbWVgIF9zdHJpbmdfOiBuYW1lIG9mIHRoZSBidWNrZXRcbiAgLy8gKiBgcHJlZml4YCBfc3RyaW5nXzogdGhlIHByZWZpeCBvZiB0aGUgb2JqZWN0cyB0aGF0IHNob3VsZCBiZSBsaXN0ZWQgKG9wdGlvbmFsLCBkZWZhdWx0IGAnJ2ApXG4gIC8vICogYHJlY3Vyc2l2ZWAgX2Jvb2xfOiBgdHJ1ZWAgaW5kaWNhdGVzIHJlY3Vyc2l2ZSBzdHlsZSBsaXN0aW5nIGFuZCBgZmFsc2VgIGluZGljYXRlcyBkaXJlY3Rvcnkgc3R5bGUgbGlzdGluZyBkZWxpbWl0ZWQgYnkgJy8nLiAob3B0aW9uYWwsIGRlZmF1bHQgYGZhbHNlYClcbiAgLy8gKiBgc3RhcnRBZnRlcmAgX3N0cmluZ186IFNwZWNpZmllcyB0aGUga2V5IHRvIHN0YXJ0IGFmdGVyIHdoZW4gbGlzdGluZyBvYmplY3RzIGluIGEgYnVja2V0LiAob3B0aW9uYWwsIGRlZmF1bHQgYCcnYClcbiAgLy9cbiAgLy8gX19SZXR1cm4gVmFsdWVfX1xuICAvLyAqIGBzdHJlYW1gIF9TdHJlYW1fOiBzdHJlYW0gZW1pdHRpbmcgdGhlIG9iamVjdHMgaW4gdGhlIGJ1Y2tldCwgdGhlIG9iamVjdCBpcyBvZiB0aGUgZm9ybWF0OlxuICAvLyAgICogYG9iai5uYW1lYCBfc3RyaW5nXzogbmFtZSBvZiB0aGUgb2JqZWN0XG4gIC8vICAgKiBgb2JqLnByZWZpeGAgX3N0cmluZ186IG5hbWUgb2YgdGhlIG9iamVjdCBwcmVmaXhcbiAgLy8gICAqIGBvYmouc2l6ZWAgX251bWJlcl86IHNpemUgb2YgdGhlIG9iamVjdFxuICAvLyAgICogYG9iai5ldGFnYCBfc3RyaW5nXzogZXRhZyBvZiB0aGUgb2JqZWN0XG4gIC8vICAgKiBgb2JqLmxhc3RNb2RpZmllZGAgX0RhdGVfOiBtb2RpZmllZCB0aW1lIHN0YW1wXG4gIC8vICAgKiBgb2JqLm1ldGFkYXRhYCBfb2JqZWN0XzogbWV0YWRhdGEgb2YgdGhlIG9iamVjdFxuXG4gIGxpc3RPYmplY3RzVjJXaXRoTWV0YWRhdGEoYnVja2V0TmFtZSwgcHJlZml4LCByZWN1cnNpdmUsIHN0YXJ0QWZ0ZXIpIHtcbiAgICBpZiAocHJlZml4ID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHByZWZpeCA9ICcnXG4gICAgfVxuICAgIGlmIChyZWN1cnNpdmUgPT09IHVuZGVmaW5lZCkge1xuICAgICAgcmVjdXJzaXZlID0gZmFsc2VcbiAgICB9XG4gICAgaWYgKHN0YXJ0QWZ0ZXIgPT09IHVuZGVmaW5lZCkge1xuICAgICAgc3RhcnRBZnRlciA9ICcnXG4gICAgfVxuICAgIGlmICghaXNWYWxpZEJ1Y2tldE5hbWUoYnVja2V0TmFtZSkpIHtcbiAgICAgIHRocm93IG5ldyBlcnJvcnMuSW52YWxpZEJ1Y2tldE5hbWVFcnJvcignSW52YWxpZCBidWNrZXQgbmFtZTogJyArIGJ1Y2tldE5hbWUpXG4gICAgfVxuICAgIGlmICghaXNWYWxpZFByZWZpeChwcmVmaXgpKSB7XG4gICAgICB0aHJvdyBuZXcgZXJyb3JzLkludmFsaWRQcmVmaXhFcnJvcihgSW52YWxpZCBwcmVmaXggOiAke3ByZWZpeH1gKVxuICAgIH1cbiAgICBpZiAoIWlzU3RyaW5nKHByZWZpeCkpIHtcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ3ByZWZpeCBzaG91bGQgYmUgb2YgdHlwZSBcInN0cmluZ1wiJylcbiAgICB9XG4gICAgaWYgKCFpc0Jvb2xlYW4ocmVjdXJzaXZlKSkge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcigncmVjdXJzaXZlIHNob3VsZCBiZSBvZiB0eXBlIFwiYm9vbGVhblwiJylcbiAgICB9XG4gICAgaWYgKCFpc1N0cmluZyhzdGFydEFmdGVyKSkge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignc3RhcnRBZnRlciBzaG91bGQgYmUgb2YgdHlwZSBcInN0cmluZ1wiJylcbiAgICB9XG4gICAgLy8gaWYgcmVjdXJzaXZlIGlzIGZhbHNlIHNldCBkZWxpbWl0ZXIgdG8gJy8nXG4gICAgdmFyIGRlbGltaXRlciA9IHJlY3Vyc2l2ZSA/ICcnIDogJy8nXG4gICAgdmFyIGNvbnRpbnVhdGlvblRva2VuID0gJydcbiAgICB2YXIgb2JqZWN0cyA9IFtdXG4gICAgdmFyIGVuZGVkID0gZmFsc2VcbiAgICB2YXIgcmVhZFN0cmVhbSA9IFN0cmVhbS5SZWFkYWJsZSh7IG9iamVjdE1vZGU6IHRydWUgfSlcbiAgICByZWFkU3RyZWFtLl9yZWFkID0gKCkgPT4ge1xuICAgICAgLy8gcHVzaCBvbmUgb2JqZWN0IHBlciBfcmVhZCgpXG4gICAgICBpZiAob2JqZWN0cy5sZW5ndGgpIHtcbiAgICAgICAgcmVhZFN0cmVhbS5wdXNoKG9iamVjdHMuc2hpZnQoKSlcbiAgICAgICAgcmV0dXJuXG4gICAgICB9XG4gICAgICBpZiAoZW5kZWQpIHtcbiAgICAgICAgcmV0dXJuIHJlYWRTdHJlYW0ucHVzaChudWxsKVxuICAgICAgfVxuICAgICAgLy8gaWYgdGhlcmUgYXJlIG5vIG9iamVjdHMgdG8gcHVzaCBkbyBxdWVyeSBmb3IgdGhlIG5leHQgYmF0Y2ggb2Ygb2JqZWN0c1xuICAgICAgdGhpcy5saXN0T2JqZWN0c1YyV2l0aE1ldGFkYXRhUXVlcnkoYnVja2V0TmFtZSwgcHJlZml4LCBjb250aW51YXRpb25Ub2tlbiwgZGVsaW1pdGVyLCAxMDAwLCBzdGFydEFmdGVyKVxuICAgICAgICAub24oJ2Vycm9yJywgKGUpID0+IHJlYWRTdHJlYW0uZW1pdCgnZXJyb3InLCBlKSlcbiAgICAgICAgLm9uKCdkYXRhJywgKHJlc3VsdCkgPT4ge1xuICAgICAgICAgIGlmIChyZXN1bHQuaXNUcnVuY2F0ZWQpIHtcbiAgICAgICAgICAgIGNvbnRpbnVhdGlvblRva2VuID0gcmVzdWx0Lm5leHRDb250aW51YXRpb25Ub2tlblxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBlbmRlZCA9IHRydWVcbiAgICAgICAgICB9XG4gICAgICAgICAgb2JqZWN0cyA9IHJlc3VsdC5vYmplY3RzXG4gICAgICAgICAgcmVhZFN0cmVhbS5fcmVhZCgpXG4gICAgICAgIH0pXG4gICAgfVxuICAgIHJldHVybiByZWFkU3RyZWFtXG4gIH1cblxuICAvLyBsaXN0T2JqZWN0c1YyV2l0aE1ldGFkYXRhUXVlcnkgLSAoTGlzdCBPYmplY3RzIFYyIHdpdGggbWV0YWRhdGEpIC0gTGlzdCBzb21lIG9yIGFsbCAodXAgdG8gMTAwMCkgb2YgdGhlIG9iamVjdHMgaW4gYSBidWNrZXQuXG4gIC8vXG4gIC8vIFlvdSBjYW4gdXNlIHRoZSByZXF1ZXN0IHBhcmFtZXRlcnMgYXMgc2VsZWN0aW9uIGNyaXRlcmlhIHRvIHJldHVybiBhIHN1YnNldCBvZiB0aGUgb2JqZWN0cyBpbiBhIGJ1Y2tldC5cbiAgLy8gcmVxdWVzdCBwYXJhbWV0ZXJzIDotXG4gIC8vICogYGJ1Y2tldE5hbWVgIF9zdHJpbmdfOiBuYW1lIG9mIHRoZSBidWNrZXRcbiAgLy8gKiBgcHJlZml4YCBfc3RyaW5nXzogTGltaXRzIHRoZSByZXNwb25zZSB0byBrZXlzIHRoYXQgYmVnaW4gd2l0aCB0aGUgc3BlY2lmaWVkIHByZWZpeC5cbiAgLy8gKiBgY29udGludWF0aW9uLXRva2VuYCBfc3RyaW5nXzogVXNlZCB0byBjb250aW51ZSBpdGVyYXRpbmcgb3ZlciBhIHNldCBvZiBvYmplY3RzLlxuICAvLyAqIGBkZWxpbWl0ZXJgIF9zdHJpbmdfOiBBIGRlbGltaXRlciBpcyBhIGNoYXJhY3RlciB5b3UgdXNlIHRvIGdyb3VwIGtleXMuXG4gIC8vICogYG1heC1rZXlzYCBfbnVtYmVyXzogU2V0cyB0aGUgbWF4aW11bSBudW1iZXIgb2Yga2V5cyByZXR1cm5lZCBpbiB0aGUgcmVzcG9uc2UgYm9keS5cbiAgLy8gKiBgc3RhcnQtYWZ0ZXJgIF9zdHJpbmdfOiBTcGVjaWZpZXMgdGhlIGtleSB0byBzdGFydCBhZnRlciB3aGVuIGxpc3Rpbmcgb2JqZWN0cyBpbiBhIGJ1Y2tldC5cblxuICBsaXN0T2JqZWN0c1YyV2l0aE1ldGFkYXRhUXVlcnkoYnVja2V0TmFtZSwgcHJlZml4LCBjb250aW51YXRpb25Ub2tlbiwgZGVsaW1pdGVyLCBtYXhLZXlzLCBzdGFydEFmdGVyKSB7XG4gICAgaWYgKCFpc1ZhbGlkQnVja2V0TmFtZShidWNrZXROYW1lKSkge1xuICAgICAgdGhyb3cgbmV3IGVycm9ycy5JbnZhbGlkQnVja2V0TmFtZUVycm9yKCdJbnZhbGlkIGJ1Y2tldCBuYW1lOiAnICsgYnVja2V0TmFtZSlcbiAgICB9XG4gICAgaWYgKCFpc1N0cmluZyhwcmVmaXgpKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdwcmVmaXggc2hvdWxkIGJlIG9mIHR5cGUgXCJzdHJpbmdcIicpXG4gICAgfVxuICAgIGlmICghaXNTdHJpbmcoY29udGludWF0aW9uVG9rZW4pKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdjb250aW51YXRpb25Ub2tlbiBzaG91bGQgYmUgb2YgdHlwZSBcInN0cmluZ1wiJylcbiAgICB9XG4gICAgaWYgKCFpc1N0cmluZyhkZWxpbWl0ZXIpKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdkZWxpbWl0ZXIgc2hvdWxkIGJlIG9mIHR5cGUgXCJzdHJpbmdcIicpXG4gICAgfVxuICAgIGlmICghaXNOdW1iZXIobWF4S2V5cykpIHtcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ21heEtleXMgc2hvdWxkIGJlIG9mIHR5cGUgXCJudW1iZXJcIicpXG4gICAgfVxuICAgIGlmICghaXNTdHJpbmcoc3RhcnRBZnRlcikpIHtcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ3N0YXJ0QWZ0ZXIgc2hvdWxkIGJlIG9mIHR5cGUgXCJzdHJpbmdcIicpXG4gICAgfVxuICAgIHZhciBxdWVyaWVzID0gW11cblxuICAgIC8vIENhbGwgZm9yIGxpc3Rpbmcgb2JqZWN0cyB2MiBBUElcbiAgICBxdWVyaWVzLnB1c2goYGxpc3QtdHlwZT0yYClcbiAgICBxdWVyaWVzLnB1c2goYGVuY29kaW5nLXR5cGU9dXJsYClcbiAgICAvLyBlc2NhcGUgZXZlcnkgdmFsdWUgaW4gcXVlcnkgc3RyaW5nLCBleGNlcHQgbWF4S2V5c1xuICAgIHF1ZXJpZXMucHVzaChgcHJlZml4PSR7dXJpRXNjYXBlKHByZWZpeCl9YClcbiAgICBxdWVyaWVzLnB1c2goYGRlbGltaXRlcj0ke3VyaUVzY2FwZShkZWxpbWl0ZXIpfWApXG4gICAgcXVlcmllcy5wdXNoKGBtZXRhZGF0YT10cnVlYClcblxuICAgIGlmIChjb250aW51YXRpb25Ub2tlbikge1xuICAgICAgY29udGludWF0aW9uVG9rZW4gPSB1cmlFc2NhcGUoY29udGludWF0aW9uVG9rZW4pXG4gICAgICBxdWVyaWVzLnB1c2goYGNvbnRpbnVhdGlvbi10b2tlbj0ke2NvbnRpbnVhdGlvblRva2VufWApXG4gICAgfVxuICAgIC8vIFNldCBzdGFydC1hZnRlclxuICAgIGlmIChzdGFydEFmdGVyKSB7XG4gICAgICBzdGFydEFmdGVyID0gdXJpRXNjYXBlKHN0YXJ0QWZ0ZXIpXG4gICAgICBxdWVyaWVzLnB1c2goYHN0YXJ0LWFmdGVyPSR7c3RhcnRBZnRlcn1gKVxuICAgIH1cbiAgICAvLyBubyBuZWVkIHRvIGVzY2FwZSBtYXhLZXlzXG4gICAgaWYgKG1heEtleXMpIHtcbiAgICAgIGlmIChtYXhLZXlzID49IDEwMDApIHtcbiAgICAgICAgbWF4S2V5cyA9IDEwMDBcbiAgICAgIH1cbiAgICAgIHF1ZXJpZXMucHVzaChgbWF4LWtleXM9JHttYXhLZXlzfWApXG4gICAgfVxuICAgIHF1ZXJpZXMuc29ydCgpXG4gICAgdmFyIHF1ZXJ5ID0gJydcbiAgICBpZiAocXVlcmllcy5sZW5ndGggPiAwKSB7XG4gICAgICBxdWVyeSA9IGAke3F1ZXJpZXMuam9pbignJicpfWBcbiAgICB9XG4gICAgdmFyIG1ldGhvZCA9ICdHRVQnXG4gICAgdmFyIHRyYW5zZm9ybWVyID0gdHJhbnNmb3JtZXJzLmdldExpc3RPYmplY3RzVjJXaXRoTWV0YWRhdGFUcmFuc2Zvcm1lcigpXG4gICAgdGhpcy5jbGllbnQubWFrZVJlcXVlc3QoeyBtZXRob2QsIGJ1Y2tldE5hbWUsIHF1ZXJ5IH0sICcnLCBbMjAwXSwgJycsIHRydWUsIChlLCByZXNwb25zZSkgPT4ge1xuICAgICAgaWYgKGUpIHtcbiAgICAgICAgcmV0dXJuIHRyYW5zZm9ybWVyLmVtaXQoJ2Vycm9yJywgZSlcbiAgICAgIH1cbiAgICAgIHBpcGVzZXR1cChyZXNwb25zZSwgdHJhbnNmb3JtZXIpXG4gICAgfSlcbiAgICByZXR1cm4gdHJhbnNmb3JtZXJcbiAgfVxufVxuXG4vLyBkZXByZWNhdGVkIGRlZmF1bHQgZXhwb3J0LCBwbGVhc2UgdXNlIG5hbWVkIGV4cG9ydHMuXG4vLyBrZWVwIGZvciBiYWNrd2FyZCBjb21wYXRpYmlsaXR5LlxuLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGltcG9ydC9uby1kZWZhdWx0LWV4cG9ydFxuZXhwb3J0IGRlZmF1bHQgZXh0ZW5zaW9uc1xuIl0sIm1hcHBpbmdzIjoiQUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUEsT0FBTyxLQUFLQSxNQUFNO0FBRWxCLE9BQU8sS0FBS0MsTUFBTSxNQUFNLGNBQWE7QUFDckMsU0FDRUMsU0FBUyxFQUNUQyxRQUFRLEVBQ1JDLFFBQVEsRUFDUkMsaUJBQWlCLEVBQ2pCQyxhQUFhLEVBQ2JDLFNBQVMsRUFDVEMsU0FBUyxRQUNKLHVCQUFzQjtBQUM3QixPQUFPLEtBQUtDLFlBQVksTUFBTSxvQkFBbUI7QUFFakQsT0FBTyxNQUFNQyxVQUFVLENBQUM7RUFDdEJDLFdBQVdBLENBQUNDLE1BQU0sRUFBRTtJQUNsQixJQUFJLENBQUNBLE1BQU0sR0FBR0EsTUFBTTtFQUN0Qjs7RUFFQTtFQUNBO0VBQ0E7RUFDQTtFQUNBO0VBQ0E7RUFDQTtFQUNBO0VBQ0E7RUFDQTtFQUNBO0VBQ0E7RUFDQTtFQUNBO0VBQ0E7RUFDQTs7RUFF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