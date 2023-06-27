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

import crc32 from 'buffer-crc32';
import { XMLParser } from 'fast-xml-parser';
import _ from 'lodash';
import * as errors from "./errors.mjs";
import { SelectResults } from "./helpers.mjs";
import { isObject, parseXml, readableStream, sanitizeETag, sanitizeObjectKey, toArray } from "./internal/helper.mjs";
import { RETENTION_VALIDITY_UNITS } from "./internal/type.mjs";

// Parse XML and return information as Javascript types
const fxp = new XMLParser();

// parse error XML response
export function parseError(xml, headerInfo) {
  var xmlErr = {};
  var xmlObj = fxp.parse(xml);
  if (xmlObj.Error) {
    xmlErr = xmlObj.Error;
  }
  var e = new errors.S3Error();
  _.each(xmlErr, (value, key) => {
    e[key.toLowerCase()] = value;
  });
  _.each(headerInfo, (value, key) => {
    e[key] = value;
  });
  return e;
}

// parse XML response for copy object
export function parseCopyObject(xml) {
  var result = {
    etag: '',
    lastModified: ''
  };
  var xmlobj = parseXml(xml);
  if (!xmlobj.CopyObjectResult) {
    throw new errors.InvalidXMLError('Missing tag: "CopyObjectResult"');
  }
  xmlobj = xmlobj.CopyObjectResult;
  if (xmlobj.ETag) {
    result.etag = xmlobj.ETag.replace(/^"/g, '').replace(/"$/g, '').replace(/^&quot;/g, '').replace(/&quot;$/g, '').replace(/^&#34;/g, '').replace(/&#34;$/g, '');
  }
  if (xmlobj.LastModified) {
    result.lastModified = new Date(xmlobj.LastModified);
  }
  return result;
}

// parse XML response for listing in-progress multipart uploads
export function parseListMultipart(xml) {
  var result = {
    uploads: [],
    prefixes: [],
    isTruncated: false
  };
  var xmlobj = parseXml(xml);
  if (!xmlobj.ListMultipartUploadsResult) {
    throw new errors.InvalidXMLError('Missing tag: "ListMultipartUploadsResult"');
  }
  xmlobj = xmlobj.ListMultipartUploadsResult;
  if (xmlobj.IsTruncated) {
    result.isTruncated = xmlobj.IsTruncated;
  }
  if (xmlobj.NextKeyMarker) {
    result.nextKeyMarker = xmlobj.NextKeyMarker;
  }
  if (xmlobj.NextUploadIdMarker) {
    result.nextUploadIdMarker = xmlobj.nextUploadIdMarker;
  }
  if (xmlobj.CommonPrefixes) {
    toArray(xmlobj.CommonPrefixes).forEach(prefix => {
      result.prefixes.push({
        prefix: sanitizeObjectKey(toArray(prefix.Prefix)[0])
      });
    });
  }
  if (xmlobj.Upload) {
    toArray(xmlobj.Upload).forEach(upload => {
      var key = upload.Key;
      var uploadId = upload.UploadId;
      var initiator = {
        id: upload.Initiator.ID,
        displayName: upload.Initiator.DisplayName
      };
      var owner = {
        id: upload.Owner.ID,
        displayName: upload.Owner.DisplayName
      };
      var storageClass = upload.StorageClass;
      var initiated = new Date(upload.Initiated);
      result.uploads.push({
        key,
        uploadId,
        initiator,
        owner,
        storageClass,
        initiated
      });
    });
  }
  return result;
}

// parse XML response to list all the owned buckets
export function parseListBucket(xml) {
  var result = [];
  var xmlobj = parseXml(xml);
  if (!xmlobj.ListAllMyBucketsResult) {
    throw new errors.InvalidXMLError('Missing tag: "ListAllMyBucketsResult"');
  }
  xmlobj = xmlobj.ListAllMyBucketsResult;
  if (xmlobj.Buckets) {
    if (xmlobj.Buckets.Bucket) {
      toArray(xmlobj.Buckets.Bucket).forEach(bucket => {
        var name = bucket.Name;
        var creationDate = new Date(bucket.CreationDate);
        result.push({
          name,
          creationDate
        });
      });
    }
  }
  return result;
}

// parse XML response for bucket notification
export function parseBucketNotification(xml) {
  var result = {
    TopicConfiguration: [],
    QueueConfiguration: [],
    CloudFunctionConfiguration: []
  };
  // Parse the events list
  var genEvents = function (events) {
    var result = [];
    if (events) {
      toArray(events).forEach(s3event => {
        result.push(s3event);
      });
    }
    return result;
  };
  // Parse all filter rules
  var genFilterRules = function (filters) {
    var result = [];
    if (filters) {
      filters = toArray(filters);
      if (filters[0].S3Key) {
        filters[0].S3Key = toArray(filters[0].S3Key);
        if (filters[0].S3Key[0].FilterRule) {
          toArray(filters[0].S3Key[0].FilterRule).forEach(rule => {
            var Name = toArray(rule.Name)[0];
            var Value = toArray(rule.Value)[0];
            result.push({
              Name,
              Value
            });
          });
        }
      }
    }
    return result;
  };
  var xmlobj = parseXml(xml);
  xmlobj = xmlobj.NotificationConfiguration;

  // Parse all topic configurations in the xml
  if (xmlobj.TopicConfiguration) {
    toArray(xmlobj.TopicConfiguration).forEach(config => {
      var Id = toArray(config.Id)[0];
      var Topic = toArray(config.Topic)[0];
      var Event = genEvents(config.Event);
      var Filter = genFilterRules(config.Filter);
      result.TopicConfiguration.push({
        Id,
        Topic,
        Event,
        Filter
      });
    });
  }
  // Parse all topic configurations in the xml
  if (xmlobj.QueueConfiguration) {
    toArray(xmlobj.QueueConfiguration).forEach(config => {
      var Id = toArray(config.Id)[0];
      var Queue = toArray(config.Queue)[0];
      var Event = genEvents(config.Event);
      var Filter = genFilterRules(config.Filter);
      result.QueueConfiguration.push({
        Id,
        Queue,
        Event,
        Filter
      });
    });
  }
  // Parse all QueueConfiguration arrays
  if (xmlobj.CloudFunctionConfiguration) {
    toArray(xmlobj.CloudFunctionConfiguration).forEach(config => {
      var Id = toArray(config.Id)[0];
      var CloudFunction = toArray(config.CloudFunction)[0];
      var Event = genEvents(config.Event);
      var Filter = genFilterRules(config.Filter);
      result.CloudFunctionConfiguration.push({
        Id,
        CloudFunction,
        Event,
        Filter
      });
    });
  }
  return result;
}

// parse XML response for bucket region
export function parseBucketRegion(xml) {
  // return region information
  return parseXml(xml).LocationConstraint;
}

// parse XML response for list parts of an in progress multipart upload
export function parseListParts(xml) {
  var xmlobj = parseXml(xml);
  var result = {
    isTruncated: false,
    parts: [],
    marker: undefined
  };
  if (!xmlobj.ListPartsResult) {
    throw new errors.InvalidXMLError('Missing tag: "ListPartsResult"');
  }
  xmlobj = xmlobj.ListPartsResult;
  if (xmlobj.IsTruncated) {
    result.isTruncated = xmlobj.IsTruncated;
  }
  if (xmlobj.NextPartNumberMarker) {
    result.marker = +toArray(xmlobj.NextPartNumberMarker)[0];
  }
  if (xmlobj.Part) {
    toArray(xmlobj.Part).forEach(p => {
      var part = +toArray(p.PartNumber)[0];
      var lastModified = new Date(p.LastModified);
      var etag = p.ETag.replace(/^"/g, '').replace(/"$/g, '').replace(/^&quot;/g, '').replace(/&quot;$/g, '').replace(/^&#34;/g, '').replace(/&#34;$/g, '');
      result.parts.push({
        part,
        lastModified,
        etag
      });
    });
  }
  return result;
}

// parse XML response when a new multipart upload is initiated
export function parseInitiateMultipart(xml) {
  var xmlobj = parseXml(xml);
  if (!xmlobj.InitiateMultipartUploadResult) {
    throw new errors.InvalidXMLError('Missing tag: "InitiateMultipartUploadResult"');
  }
  xmlobj = xmlobj.InitiateMultipartUploadResult;
  if (xmlobj.UploadId) {
    return xmlobj.UploadId;
  }
  throw new errors.InvalidXMLError('Missing tag: "UploadId"');
}

// parse XML response when a multipart upload is completed
export function parseCompleteMultipart(xml) {
  var xmlobj = parseXml(xml).CompleteMultipartUploadResult;
  if (xmlobj.Location) {
    var location = toArray(xmlobj.Location)[0];
    var bucket = toArray(xmlobj.Bucket)[0];
    var key = xmlobj.Key;
    var etag = xmlobj.ETag.replace(/^"/g, '').replace(/"$/g, '').replace(/^&quot;/g, '').replace(/&quot;$/g, '').replace(/^&#34;/g, '').replace(/&#34;$/g, '');
    return {
      location,
      bucket,
      key,
      etag
    };
  }
  // Complete Multipart can return XML Error after a 200 OK response
  if (xmlobj.Code && xmlobj.Message) {
    var errCode = toArray(xmlobj.Code)[0];
    var errMessage = toArray(xmlobj.Message)[0];
    return {
      errCode,
      errMessage
    };
  }
}
const formatObjInfo = (content, opts = {}) => {
  let {
    Key,
    LastModified,
    ETag,
    Size,
    VersionId,
    IsLatest
  } = content;
  if (!isObject(opts)) {
    opts = {};
  }
  const name = sanitizeObjectKey(toArray(Key)[0]);
  const lastModified = new Date(toArray(LastModified)[0]);
  const etag = sanitizeETag(toArray(ETag)[0]);
  return {
    name,
    lastModified,
    etag,
    size: Size,
    versionId: VersionId,
    isLatest: IsLatest,
    isDeleteMarker: opts.IsDeleteMarker ? opts.IsDeleteMarker : false
  };
};

// parse XML response for list objects in a bucket
export function parseListObjects(xml) {
  var result = {
    objects: [],
    isTruncated: false
  };
  let isTruncated = false;
  let nextMarker, nextVersionKeyMarker;
  const xmlobj = parseXml(xml);
  const parseCommonPrefixesEntity = responseEntity => {
    if (responseEntity) {
      toArray(responseEntity).forEach(commonPrefix => {
        result.objects.push({
          prefix: sanitizeObjectKey(toArray(commonPrefix.Prefix)[0]),
          size: 0
        });
      });
    }
  };
  const listBucketResult = xmlobj.ListBucketResult;
  const listVersionsResult = xmlobj.ListVersionsResult;
  if (listBucketResult) {
    if (listBucketResult.IsTruncated) {
      isTruncated = listBucketResult.IsTruncated;
    }
    if (listBucketResult.Contents) {
      toArray(listBucketResult.Contents).forEach(content => {
        const name = sanitizeObjectKey(toArray(content.Key)[0]);
        const lastModified = new Date(toArray(content.LastModified)[0]);
        const etag = sanitizeETag(toArray(content.ETag)[0]);
        const size = content.Size;
        result.objects.push({
          name,
          lastModified,
          etag,
          size
        });
      });
    }
    if (listBucketResult.NextMarker) {
      nextMarker = listBucketResult.NextMarker;
    }
    parseCommonPrefixesEntity(listBucketResult.CommonPrefixes);
  }
  if (listVersionsResult) {
    if (listVersionsResult.IsTruncated) {
      isTruncated = listVersionsResult.IsTruncated;
    }
    if (listVersionsResult.Version) {
      toArray(listVersionsResult.Version).forEach(content => {
        result.objects.push(formatObjInfo(content));
      });
    }
    if (listVersionsResult.DeleteMarker) {
      toArray(listVersionsResult.DeleteMarker).forEach(content => {
        result.objects.push(formatObjInfo(content, {
          IsDeleteMarker: true
        }));
      });
    }
    if (listVersionsResult.NextKeyMarker) {
      nextVersionKeyMarker = listVersionsResult.NextKeyMarker;
    }
    if (listVersionsResult.NextVersionIdMarker) {
      result.versionIdMarker = listVersionsResult.NextVersionIdMarker;
    }
    parseCommonPrefixesEntity(listVersionsResult.CommonPrefixes);
  }
  result.isTruncated = isTruncated;
  if (isTruncated) {
    result.nextMarker = nextVersionKeyMarker || nextMarker;
  }
  return result;
}

// parse XML response for list objects v2 in a bucket
export function parseListObjectsV2(xml) {
  var result = {
    objects: [],
    isTruncated: false
  };
  var xmlobj = parseXml(xml);
  if (!xmlobj.ListBucketResult) {
    throw new errors.InvalidXMLError('Missing tag: "ListBucketResult"');
  }
  xmlobj = xmlobj.ListBucketResult;
  if (xmlobj.IsTruncated) {
    result.isTruncated = xmlobj.IsTruncated;
  }
  if (xmlobj.NextContinuationToken) {
    result.nextContinuationToken = xmlobj.NextContinuationToken;
  }
  if (xmlobj.Contents) {
    toArray(xmlobj.Contents).forEach(content => {
      var name = sanitizeObjectKey(toArray(content.Key)[0]);
      var lastModified = new Date(content.LastModified);
      var etag = sanitizeETag(content.ETag);
      var size = content.Size;
      result.objects.push({
        name,
        lastModified,
        etag,
        size
      });
    });
  }
  if (xmlobj.CommonPrefixes) {
    toArray(xmlobj.CommonPrefixes).forEach(commonPrefix => {
      result.objects.push({
        prefix: sanitizeObjectKey(toArray(commonPrefix.Prefix)[0]),
        size: 0
      });
    });
  }
  return result;
}

// parse XML response for list objects v2 with metadata in a bucket
export function parseListObjectsV2WithMetadata(xml) {
  var result = {
    objects: [],
    isTruncated: false
  };
  var xmlobj = parseXml(xml);
  if (!xmlobj.ListBucketResult) {
    throw new errors.InvalidXMLError('Missing tag: "ListBucketResult"');
  }
  xmlobj = xmlobj.ListBucketResult;
  if (xmlobj.IsTruncated) {
    result.isTruncated = xmlobj.IsTruncated;
  }
  if (xmlobj.NextContinuationToken) {
    result.nextContinuationToken = xmlobj.NextContinuationToken;
  }
  if (xmlobj.Contents) {
    toArray(xmlobj.Contents).forEach(content => {
      var name = sanitizeObjectKey(content.Key);
      var lastModified = new Date(content.LastModified);
      var etag = sanitizeETag(content.ETag);
      var size = content.Size;
      var metadata;
      if (content.UserMetadata != null) {
        metadata = toArray(content.UserMetadata)[0];
      } else {
        metadata = null;
      }
      result.objects.push({
        name,
        lastModified,
        etag,
        size,
        metadata
      });
    });
  }
  if (xmlobj.CommonPrefixes) {
    toArray(xmlobj.CommonPrefixes).forEach(commonPrefix => {
      result.objects.push({
        prefix: sanitizeObjectKey(toArray(commonPrefix.Prefix)[0]),
        size: 0
      });
    });
  }
  return result;
}
export function parseBucketVersioningConfig(xml) {
  var xmlObj = parseXml(xml);
  return xmlObj.VersioningConfiguration;
}
export function parseTagging(xml) {
  const xmlObj = parseXml(xml);
  let result = [];
  if (xmlObj.Tagging && xmlObj.Tagging.TagSet && xmlObj.Tagging.TagSet.Tag) {
    const tagResult = xmlObj.Tagging.TagSet.Tag;
    // if it is a single tag convert into an array so that the return value is always an array.
    if (isObject(tagResult)) {
      result.push(tagResult);
    } else {
      result = tagResult;
    }
  }
  return result;
}
export function parseLifecycleConfig(xml) {
  const xmlObj = parseXml(xml);
  return xmlObj.LifecycleConfiguration;
}
export function parseObjectLockConfig(xml) {
  const xmlObj = parseXml(xml);
  let lockConfigResult = {};
  if (xmlObj.ObjectLockConfiguration) {
    lockConfigResult = {
      objectLockEnabled: xmlObj.ObjectLockConfiguration.ObjectLockEnabled
    };
    let retentionResp;
    if (xmlObj.ObjectLockConfiguration && xmlObj.ObjectLockConfiguration.Rule && xmlObj.ObjectLockConfiguration.Rule.DefaultRetention) {
      retentionResp = xmlObj.ObjectLockConfiguration.Rule.DefaultRetention || {};
      lockConfigResult.mode = retentionResp.Mode;
    }
    if (retentionResp) {
      const isUnitYears = retentionResp.Years;
      if (isUnitYears) {
        lockConfigResult.validity = isUnitYears;
        lockConfigResult.unit = RETENTION_VALIDITY_UNITS.YEARS;
      } else {
        lockConfigResult.validity = retentionResp.Days;
        lockConfigResult.unit = RETENTION_VALIDITY_UNITS.DAYS;
      }
    }
    return lockConfigResult;
  }
}
export function parseObjectRetentionConfig(xml) {
  const xmlObj = parseXml(xml);
  const retentionConfig = xmlObj.Retention;
  return {
    mode: retentionConfig.Mode,
    retainUntilDate: retentionConfig.RetainUntilDate
  };
}
export function parseBucketEncryptionConfig(xml) {
  let encConfig = parseXml(xml);
  return encConfig;
}
export function parseReplicationConfig(xml) {
  const xmlObj = parseXml(xml);
  const replicationConfig = {
    ReplicationConfiguration: {
      role: xmlObj.ReplicationConfiguration.Role,
      rules: toArray(xmlObj.ReplicationConfiguration.Rule)
    }
  };
  return replicationConfig;
}
export function parseObjectLegalHoldConfig(xml) {
  const xmlObj = parseXml(xml);
  return xmlObj.LegalHold;
}
export function uploadPartParser(xml) {
  const xmlObj = parseXml(xml);
  const respEl = xmlObj.CopyPartResult;
  return respEl;
}
export function removeObjectsParser(xml) {
  const xmlObj = parseXml(xml);
  if (xmlObj.DeleteResult && xmlObj.DeleteResult.Error) {
    // return errors as array always. as the response is object in case of single object passed in removeObjects
    return toArray(xmlObj.DeleteResult.Error);
  }
  return [];
}
export function parseSelectObjectContentResponse(res) {
  // extractHeaderType extracts the first half of the header message, the header type.
  function extractHeaderType(stream) {
    const headerNameLen = Buffer.from(stream.read(1)).readUInt8();
    const headerNameWithSeparator = Buffer.from(stream.read(headerNameLen)).toString();
    const splitBySeparator = (headerNameWithSeparator || '').split(':');
    const headerName = splitBySeparator.length >= 1 ? splitBySeparator[1] : '';
    return headerName;
  }
  function extractHeaderValue(stream) {
    const bodyLen = Buffer.from(stream.read(2)).readUInt16BE();
    const bodyName = Buffer.from(stream.read(bodyLen)).toString();
    return bodyName;
  }
  const selectResults = new SelectResults({}); // will be returned

  const responseStream = readableStream(res); // convert byte array to a readable responseStream
  while (responseStream._readableState.length) {
    // Top level responseStream read tracker.
    let msgCrcAccumulator; // accumulate from start of the message till the message crc start.

    const totalByteLengthBuffer = Buffer.from(responseStream.read(4));
    msgCrcAccumulator = crc32(totalByteLengthBuffer);
    const headerBytesBuffer = Buffer.from(responseStream.read(4));
    msgCrcAccumulator = crc32(headerBytesBuffer, msgCrcAccumulator);
    const calculatedPreludeCrc = msgCrcAccumulator.readInt32BE(); // use it to check if any CRC mismatch in header itself.

    const preludeCrcBuffer = Buffer.from(responseStream.read(4)); // read 4 bytes    i.e 4+4 =8 + 4 = 12 ( prelude + prelude crc)
    msgCrcAccumulator = crc32(preludeCrcBuffer, msgCrcAccumulator);
    const totalMsgLength = totalByteLengthBuffer.readInt32BE();
    const headerLength = headerBytesBuffer.readInt32BE();
    const preludeCrcByteValue = preludeCrcBuffer.readInt32BE();
    if (preludeCrcByteValue !== calculatedPreludeCrc) {
      // Handle Header CRC mismatch Error
      throw new Error(`Header Checksum Mismatch, Prelude CRC of ${preludeCrcByteValue} does not equal expected CRC of ${calculatedPreludeCrc}`);
    }
    const headers = {};
    if (headerLength > 0) {
      const headerBytes = Buffer.from(responseStream.read(headerLength));
      msgCrcAccumulator = crc32(headerBytes, msgCrcAccumulator);
      const headerReaderStream = readableStream(headerBytes);
      while (headerReaderStream._readableState.length) {
        let headerTypeName = extractHeaderType(headerReaderStream);
        headerReaderStream.read(1); // just read and ignore it.
        headers[headerTypeName] = extractHeaderValue(headerReaderStream);
      }
    }
    let payloadStream;
    const payLoadLength = totalMsgLength - headerLength - 16;
    if (payLoadLength > 0) {
      const payLoadBuffer = Buffer.from(responseStream.read(payLoadLength));
      msgCrcAccumulator = crc32(payLoadBuffer, msgCrcAccumulator);
      // read the checksum early and detect any mismatch so we can avoid unnecessary further processing.
      const messageCrcByteValue = Buffer.from(responseStream.read(4)).readInt32BE();
      const calculatedCrc = msgCrcAccumulator.readInt32BE();
      // Handle message CRC Error
      if (messageCrcByteValue !== calculatedCrc) {
        throw new Error(`Message Checksum Mismatch, Message CRC of ${messageCrcByteValue} does not equal expected CRC of ${calculatedCrc}`);
      }
      payloadStream = readableStream(payLoadBuffer);
    }
    const messageType = headers['message-type'];
    switch (messageType) {
      case 'error':
        {
          const errorMessage = headers['error-code'] + ':"' + headers['error-message'] + '"';
          throw new Error(errorMessage);
        }
      case 'event':
        {
          const contentType = headers['content-type'];
          const eventType = headers['event-type'];
          switch (eventType) {
            case 'End':
              {
                selectResults.setResponse(res);
                return selectResults;
              }
            case 'Records':
              {
                const readData = payloadStream.read(payLoadLength);
                selectResults.setRecords(readData);
                break;
              }
            case 'Progress':
              {
                switch (contentType) {
                  case 'text/xml':
                    {
                      const progressData = payloadStream.read(payLoadLength);
                      selectResults.setProgress(progressData.toString());
                      break;
                    }
                  default:
                    {
                      const errorMessage = `Unexpected content-type ${contentType} sent for event-type Progress`;
                      throw new Error(errorMessage);
                    }
                }
              }
              break;
            case 'Stats':
              {
                switch (contentType) {
                  case 'text/xml':
                    {
                      const statsData = payloadStream.read(payLoadLength);
                      selectResults.setStats(statsData.toString());
                      break;
                    }
                  default:
                    {
                      const errorMessage = `Unexpected content-type ${contentType} sent for event-type Stats`;
                      throw new Error(errorMessage);
                    }
                }
              }
              break;
            default:
              {
                // Continuation message: Not sure if it is supported. did not find a reference or any message in response.
                // It does not have a payload.
                const warningMessage = `Un implemented event detected  ${messageType}.`;
                // eslint-disable-next-line no-console
                console.warn(warningMessage);
              }
          } // eventType End
        }
      // Event End
    } // messageType End
  } // Top Level Stream End
}
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJjcmMzMiIsIlhNTFBhcnNlciIsIl8iLCJlcnJvcnMiLCJTZWxlY3RSZXN1bHRzIiwiaXNPYmplY3QiLCJwYXJzZVhtbCIsInJlYWRhYmxlU3RyZWFtIiwic2FuaXRpemVFVGFnIiwic2FuaXRpemVPYmplY3RLZXkiLCJ0b0FycmF5IiwiUkVURU5USU9OX1ZBTElESVRZX1VOSVRTIiwiZnhwIiwicGFyc2VFcnJvciIsInhtbCIsImhlYWRlckluZm8iLCJ4bWxFcnIiLCJ4bWxPYmoiLCJwYXJzZSIsIkVycm9yIiwiZSIsIlMzRXJyb3IiLCJlYWNoIiwidmFsdWUiLCJrZXkiLCJ0b0xvd2VyQ2FzZSIsInBhcnNlQ29weU9iamVjdCIsInJlc3VsdCIsImV0YWciLCJsYXN0TW9kaWZpZWQiLCJ4bWxvYmoiLCJDb3B5T2JqZWN0UmVzdWx0IiwiSW52YWxpZFhNTEVycm9yIiwiRVRhZyIsInJlcGxhY2UiLCJMYXN0TW9kaWZpZWQiLCJEYXRlIiwicGFyc2VMaXN0TXVsdGlwYXJ0IiwidXBsb2FkcyIsInByZWZpeGVzIiwiaXNUcnVuY2F0ZWQiLCJMaXN0TXVsdGlwYXJ0VXBsb2Fkc1Jlc3VsdCIsIklzVHJ1bmNhdGVkIiwiTmV4dEtleU1hcmtlciIsIm5leHRLZXlNYXJrZXIiLCJOZXh0VXBsb2FkSWRNYXJrZXIiLCJuZXh0VXBsb2FkSWRNYXJrZXIiLCJDb21tb25QcmVmaXhlcyIsImZvckVhY2giLCJwcmVmaXgiLCJwdXNoIiwiUHJlZml4IiwiVXBsb2FkIiwidXBsb2FkIiwiS2V5IiwidXBsb2FkSWQiLCJVcGxvYWRJZCIsImluaXRpYXRvciIsImlkIiwiSW5pdGlhdG9yIiwiSUQiLCJkaXNwbGF5TmFtZSIsIkRpc3BsYXlOYW1lIiwib3duZXIiLCJPd25lciIsInN0b3JhZ2VDbGFzcyIsIlN0b3JhZ2VDbGFzcyIsImluaXRpYXRlZCIsIkluaXRpYXRlZCIsInBhcnNlTGlzdEJ1Y2tldCIsIkxpc3RBbGxNeUJ1Y2tldHNSZXN1bHQiLCJCdWNrZXRzIiwiQnVja2V0IiwiYnVja2V0IiwibmFtZSIsIk5hbWUiLCJjcmVhdGlvbkRhdGUiLCJDcmVhdGlvbkRhdGUiLCJwYXJzZUJ1Y2tldE5vdGlmaWNhdGlvbiIsIlRvcGljQ29uZmlndXJhdGlvbiIsIlF1ZXVlQ29uZmlndXJhdGlvbiIsIkNsb3VkRnVuY3Rpb25Db25maWd1cmF0aW9uIiwiZ2VuRXZlbnRzIiwiZXZlbnRzIiwiczNldmVudCIsImdlbkZpbHRlclJ1bGVzIiwiZmlsdGVycyIsIlMzS2V5IiwiRmlsdGVyUnVsZSIsInJ1bGUiLCJWYWx1ZSIsIk5vdGlmaWNhdGlvbkNvbmZpZ3VyYXRpb24iLCJjb25maWciLCJJZCIsIlRvcGljIiwiRXZlbnQiLCJGaWx0ZXIiLCJRdWV1ZSIsIkNsb3VkRnVuY3Rpb24iLCJwYXJzZUJ1Y2tldFJlZ2lvbiIsIkxvY2F0aW9uQ29uc3RyYWludCIsInBhcnNlTGlzdFBhcnRzIiwicGFydHMiLCJtYXJrZXIiLCJ1bmRlZmluZWQiLCJMaXN0UGFydHNSZXN1bHQiLCJOZXh0UGFydE51bWJlck1hcmtlciIsIlBhcnQiLCJwIiwicGFydCIsIlBhcnROdW1iZXIiLCJwYXJzZUluaXRpYXRlTXVsdGlwYXJ0IiwiSW5pdGlhdGVNdWx0aXBhcnRVcGxvYWRSZXN1bHQiLCJwYXJzZUNvbXBsZXRlTXVsdGlwYXJ0IiwiQ29tcGxldGVNdWx0aXBhcnRVcGxvYWRSZXN1bHQiLCJMb2NhdGlvbiIsImxvY2F0aW9uIiwiQ29kZSIsIk1lc3NhZ2UiLCJlcnJDb2RlIiwiZXJyTWVzc2FnZSIsImZvcm1hdE9iakluZm8iLCJjb250ZW50Iiwib3B0cyIsIlNpemUiLCJWZXJzaW9uSWQiLCJJc0xhdGVzdCIsInNpemUiLCJ2ZXJzaW9uSWQiLCJpc0xhdGVzdCIsImlzRGVsZXRlTWFya2VyIiwiSXNEZWxldGVNYXJrZXIiLCJwYXJzZUxpc3RPYmplY3RzIiwib2JqZWN0cyIsIm5leHRNYXJrZXIiLCJuZXh0VmVyc2lvbktleU1hcmtlciIsInBhcnNlQ29tbW9uUHJlZml4ZXNFbnRpdHkiLCJyZXNwb25zZUVudGl0eSIsImNvbW1vblByZWZpeCIsImxpc3RCdWNrZXRSZXN1bHQiLCJMaXN0QnVja2V0UmVzdWx0IiwibGlzdFZlcnNpb25zUmVzdWx0IiwiTGlzdFZlcnNpb25zUmVzdWx0IiwiQ29udGVudHMiLCJOZXh0TWFya2VyIiwiVmVyc2lvbiIsIkRlbGV0ZU1hcmtlciIsIk5leHRWZXJzaW9uSWRNYXJrZXIiLCJ2ZXJzaW9uSWRNYXJrZXIiLCJwYXJzZUxpc3RPYmplY3RzVjIiLCJOZXh0Q29udGludWF0aW9uVG9rZW4iLCJuZXh0Q29udGludWF0aW9uVG9rZW4iLCJwYXJzZUxpc3RPYmplY3RzVjJXaXRoTWV0YWRhdGEiLCJtZXRhZGF0YSIsIlVzZXJNZXRhZGF0YSIsInBhcnNlQnVja2V0VmVyc2lvbmluZ0NvbmZpZyIsIlZlcnNpb25pbmdDb25maWd1cmF0aW9uIiwicGFyc2VUYWdnaW5nIiwiVGFnZ2luZyIsIlRhZ1NldCIsIlRhZyIsInRhZ1Jlc3VsdCIsInBhcnNlTGlmZWN5Y2xlQ29uZmlnIiwiTGlmZWN5Y2xlQ29uZmlndXJhdGlvbiIsInBhcnNlT2JqZWN0TG9ja0NvbmZpZyIsImxvY2tDb25maWdSZXN1bHQiLCJPYmplY3RMb2NrQ29uZmlndXJhdGlvbiIsIm9iamVjdExvY2tFbmFibGVkIiwiT2JqZWN0TG9ja0VuYWJsZWQiLCJyZXRlbnRpb25SZXNwIiwiUnVsZSIsIkRlZmF1bHRSZXRlbnRpb24iLCJtb2RlIiwiTW9kZSIsImlzVW5pdFllYXJzIiwiWWVhcnMiLCJ2YWxpZGl0eSIsInVuaXQiLCJZRUFSUyIsIkRheXMiLCJEQVlTIiwicGFyc2VPYmplY3RSZXRlbnRpb25Db25maWciLCJyZXRlbnRpb25Db25maWciLCJSZXRlbnRpb24iLCJyZXRhaW5VbnRpbERhdGUiLCJSZXRhaW5VbnRpbERhdGUiLCJwYXJzZUJ1Y2tldEVuY3J5cHRpb25Db25maWciLCJlbmNDb25maWciLCJwYXJzZVJlcGxpY2F0aW9uQ29uZmlnIiwicmVwbGljYXRpb25Db25maWciLCJSZXBsaWNhdGlvbkNvbmZpZ3VyYXRpb24iLCJyb2xlIiwiUm9sZSIsInJ1bGVzIiwicGFyc2VPYmplY3RMZWdhbEhvbGRDb25maWciLCJMZWdhbEhvbGQiLCJ1cGxvYWRQYXJ0UGFyc2VyIiwicmVzcEVsIiwiQ29weVBhcnRSZXN1bHQiLCJyZW1vdmVPYmplY3RzUGFyc2VyIiwiRGVsZXRlUmVzdWx0IiwicGFyc2VTZWxlY3RPYmplY3RDb250ZW50UmVzcG9uc2UiLCJyZXMiLCJleHRyYWN0SGVhZGVyVHlwZSIsInN0cmVhbSIsImhlYWRlck5hbWVMZW4iLCJCdWZmZXIiLCJmcm9tIiwicmVhZCIsInJlYWRVSW50OCIsImhlYWRlck5hbWVXaXRoU2VwYXJhdG9yIiwidG9TdHJpbmciLCJzcGxpdEJ5U2VwYXJhdG9yIiwic3BsaXQiLCJoZWFkZXJOYW1lIiwibGVuZ3RoIiwiZXh0cmFjdEhlYWRlclZhbHVlIiwiYm9keUxlbiIsInJlYWRVSW50MTZCRSIsImJvZHlOYW1lIiwic2VsZWN0UmVzdWx0cyIsInJlc3BvbnNlU3RyZWFtIiwiX3JlYWRhYmxlU3RhdGUiLCJtc2dDcmNBY2N1bXVsYXRvciIsInRvdGFsQnl0ZUxlbmd0aEJ1ZmZlciIsImhlYWRlckJ5dGVzQnVmZmVyIiwiY2FsY3VsYXRlZFByZWx1ZGVDcmMiLCJyZWFkSW50MzJCRSIsInByZWx1ZGVDcmNCdWZmZXIiLCJ0b3RhbE1zZ0xlbmd0aCIsImhlYWRlckxlbmd0aCIsInByZWx1ZGVDcmNCeXRlVmFsdWUiLCJoZWFkZXJzIiwiaGVhZGVyQnl0ZXMiLCJoZWFkZXJSZWFkZXJTdHJlYW0iLCJoZWFkZXJUeXBlTmFtZSIsInBheWxvYWRTdHJlYW0iLCJwYXlMb2FkTGVuZ3RoIiwicGF5TG9hZEJ1ZmZlciIsIm1lc3NhZ2VDcmNCeXRlVmFsdWUiLCJjYWxjdWxhdGVkQ3JjIiwibWVzc2FnZVR5cGUiLCJlcnJvck1lc3NhZ2UiLCJjb250ZW50VHlwZSIsImV2ZW50VHlwZSIsInNldFJlc3BvbnNlIiwicmVhZERhdGEiLCJzZXRSZWNvcmRzIiwicHJvZ3Jlc3NEYXRhIiwic2V0UHJvZ3Jlc3MiLCJzdGF0c0RhdGEiLCJzZXRTdGF0cyIsIndhcm5pbmdNZXNzYWdlIiwiY29uc29sZSIsIndhcm4iXSwic291cmNlcyI6WyJ4bWwtcGFyc2Vycy5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyIvKlxuICogTWluSU8gSmF2YXNjcmlwdCBMaWJyYXJ5IGZvciBBbWF6b24gUzMgQ29tcGF0aWJsZSBDbG91ZCBTdG9yYWdlLCAoQykgMjAxNSBNaW5JTywgSW5jLlxuICpcbiAqIExpY2Vuc2VkIHVuZGVyIHRoZSBBcGFjaGUgTGljZW5zZSwgVmVyc2lvbiAyLjAgKHRoZSBcIkxpY2Vuc2VcIik7XG4gKiB5b3UgbWF5IG5vdCB1c2UgdGhpcyBmaWxlIGV4Y2VwdCBpbiBjb21wbGlhbmNlIHdpdGggdGhlIExpY2Vuc2UuXG4gKiBZb3UgbWF5IG9idGFpbiBhIGNvcHkgb2YgdGhlIExpY2Vuc2UgYXRcbiAqXG4gKiAgICAgaHR0cDovL3d3dy5hcGFjaGUub3JnL2xpY2Vuc2VzL0xJQ0VOU0UtMi4wXG4gKlxuICogVW5sZXNzIHJlcXVpcmVkIGJ5IGFwcGxpY2FibGUgbGF3IG9yIGFncmVlZCB0byBpbiB3cml0aW5nLCBzb2Z0d2FyZVxuICogZGlzdHJpYnV0ZWQgdW5kZXIgdGhlIExpY2Vuc2UgaXMgZGlzdHJpYnV0ZWQgb24gYW4gXCJBUyBJU1wiIEJBU0lTLFxuICogV0lUSE9VVCBXQVJSQU5USUVTIE9SIENPTkRJVElPTlMgT0YgQU5ZIEtJTkQsIGVpdGhlciBleHByZXNzIG9yIGltcGxpZWQuXG4gKiBTZWUgdGhlIExpY2Vuc2UgZm9yIHRoZSBzcGVjaWZpYyBsYW5ndWFnZSBnb3Zlcm5pbmcgcGVybWlzc2lvbnMgYW5kXG4gKiBsaW1pdGF0aW9ucyB1bmRlciB0aGUgTGljZW5zZS5cbiAqL1xuXG5pbXBvcnQgY3JjMzIgZnJvbSAnYnVmZmVyLWNyYzMyJ1xuaW1wb3J0IHsgWE1MUGFyc2VyIH0gZnJvbSAnZmFzdC14bWwtcGFyc2VyJ1xuaW1wb3J0IF8gZnJvbSAnbG9kYXNoJ1xuXG5pbXBvcnQgKiBhcyBlcnJvcnMgZnJvbSAnLi9lcnJvcnMudHMnXG5pbXBvcnQgeyBTZWxlY3RSZXN1bHRzIH0gZnJvbSAnLi9oZWxwZXJzLnRzJ1xuaW1wb3J0IHsgaXNPYmplY3QsIHBhcnNlWG1sLCByZWFkYWJsZVN0cmVhbSwgc2FuaXRpemVFVGFnLCBzYW5pdGl6ZU9iamVjdEtleSwgdG9BcnJheSB9IGZyb20gJy4vaW50ZXJuYWwvaGVscGVyLnRzJ1xuaW1wb3J0IHsgUkVURU5USU9OX1ZBTElESVRZX1VOSVRTIH0gZnJvbSAnLi9pbnRlcm5hbC90eXBlLnRzJ1xuXG4vLyBQYXJzZSBYTUwgYW5kIHJldHVybiBpbmZvcm1hdGlvbiBhcyBKYXZhc2NyaXB0IHR5cGVzXG5jb25zdCBmeHAgPSBuZXcgWE1MUGFyc2VyKClcblxuLy8gcGFyc2UgZXJyb3IgWE1MIHJlc3BvbnNlXG5leHBvcnQgZnVuY3Rpb24gcGFyc2VFcnJvcih4bWwsIGhlYWRlckluZm8pIHtcbiAgdmFyIHhtbEVyciA9IHt9XG4gIHZhciB4bWxPYmogPSBmeHAucGFyc2UoeG1sKVxuICBpZiAoeG1sT2JqLkVycm9yKSB7XG4gICAgeG1sRXJyID0geG1sT2JqLkVycm9yXG4gIH1cblxuICB2YXIgZSA9IG5ldyBlcnJvcnMuUzNFcnJvcigpXG4gIF8uZWFjaCh4bWxFcnIsICh2YWx1ZSwga2V5KSA9PiB7XG4gICAgZVtrZXkudG9Mb3dlckNhc2UoKV0gPSB2YWx1ZVxuICB9KVxuXG4gIF8uZWFjaChoZWFkZXJJbmZvLCAodmFsdWUsIGtleSkgPT4ge1xuICAgIGVba2V5XSA9IHZhbHVlXG4gIH0pXG4gIHJldHVybiBlXG59XG5cbi8vIHBhcnNlIFhNTCByZXNwb25zZSBmb3IgY29weSBvYmplY3RcbmV4cG9ydCBmdW5jdGlvbiBwYXJzZUNvcHlPYmplY3QoeG1sKSB7XG4gIHZhciByZXN1bHQgPSB7XG4gICAgZXRhZzogJycsXG4gICAgbGFzdE1vZGlmaWVkOiAnJyxcbiAgfVxuXG4gIHZhciB4bWxvYmogPSBwYXJzZVhtbCh4bWwpXG4gIGlmICgheG1sb2JqLkNvcHlPYmplY3RSZXN1bHQpIHtcbiAgICB0aHJvdyBuZXcgZXJyb3JzLkludmFsaWRYTUxFcnJvcignTWlzc2luZyB0YWc6IFwiQ29weU9iamVjdFJlc3VsdFwiJylcbiAgfVxuICB4bWxvYmogPSB4bWxvYmouQ29weU9iamVjdFJlc3VsdFxuICBpZiAoeG1sb2JqLkVUYWcpIHtcbiAgICByZXN1bHQuZXRhZyA9IHhtbG9iai5FVGFnLnJlcGxhY2UoL15cIi9nLCAnJylcbiAgICAgIC5yZXBsYWNlKC9cIiQvZywgJycpXG4gICAgICAucmVwbGFjZSgvXiZxdW90Oy9nLCAnJylcbiAgICAgIC5yZXBsYWNlKC8mcXVvdDskL2csICcnKVxuICAgICAgLnJlcGxhY2UoL14mIzM0Oy9nLCAnJylcbiAgICAgIC5yZXBsYWNlKC8mIzM0OyQvZywgJycpXG4gIH1cbiAgaWYgKHhtbG9iai5MYXN0TW9kaWZpZWQpIHtcbiAgICByZXN1bHQubGFzdE1vZGlmaWVkID0gbmV3IERhdGUoeG1sb2JqLkxhc3RNb2RpZmllZClcbiAgfVxuXG4gIHJldHVybiByZXN1bHRcbn1cblxuLy8gcGFyc2UgWE1MIHJlc3BvbnNlIGZvciBsaXN0aW5nIGluLXByb2dyZXNzIG11bHRpcGFydCB1cGxvYWRzXG5leHBvcnQgZnVuY3Rpb24gcGFyc2VMaXN0TXVsdGlwYXJ0KHhtbCkge1xuICB2YXIgcmVzdWx0ID0ge1xuICAgIHVwbG9hZHM6IFtdLFxuICAgIHByZWZpeGVzOiBbXSxcbiAgICBpc1RydW5jYXRlZDogZmFsc2UsXG4gIH1cblxuICB2YXIgeG1sb2JqID0gcGFyc2VYbWwoeG1sKVxuXG4gIGlmICgheG1sb2JqLkxpc3RNdWx0aXBhcnRVcGxvYWRzUmVzdWx0KSB7XG4gICAgdGhyb3cgbmV3IGVycm9ycy5JbnZhbGlkWE1MRXJyb3IoJ01pc3NpbmcgdGFnOiBcIkxpc3RNdWx0aXBhcnRVcGxvYWRzUmVzdWx0XCInKVxuICB9XG4gIHhtbG9iaiA9IHhtbG9iai5MaXN0TXVsdGlwYXJ0VXBsb2Fkc1Jlc3VsdFxuICBpZiAoeG1sb2JqLklzVHJ1bmNhdGVkKSB7XG4gICAgcmVzdWx0LmlzVHJ1bmNhdGVkID0geG1sb2JqLklzVHJ1bmNhdGVkXG4gIH1cbiAgaWYgKHhtbG9iai5OZXh0S2V5TWFya2VyKSB7XG4gICAgcmVzdWx0Lm5leHRLZXlNYXJrZXIgPSB4bWxvYmouTmV4dEtleU1hcmtlclxuICB9XG4gIGlmICh4bWxvYmouTmV4dFVwbG9hZElkTWFya2VyKSB7XG4gICAgcmVzdWx0Lm5leHRVcGxvYWRJZE1hcmtlciA9IHhtbG9iai5uZXh0VXBsb2FkSWRNYXJrZXJcbiAgfVxuXG4gIGlmICh4bWxvYmouQ29tbW9uUHJlZml4ZXMpIHtcbiAgICB0b0FycmF5KHhtbG9iai5Db21tb25QcmVmaXhlcykuZm9yRWFjaCgocHJlZml4KSA9PiB7XG4gICAgICByZXN1bHQucHJlZml4ZXMucHVzaCh7IHByZWZpeDogc2FuaXRpemVPYmplY3RLZXkodG9BcnJheShwcmVmaXguUHJlZml4KVswXSkgfSlcbiAgICB9KVxuICB9XG5cbiAgaWYgKHhtbG9iai5VcGxvYWQpIHtcbiAgICB0b0FycmF5KHhtbG9iai5VcGxvYWQpLmZvckVhY2goKHVwbG9hZCkgPT4ge1xuICAgICAgdmFyIGtleSA9IHVwbG9hZC5LZXlcbiAgICAgIHZhciB1cGxvYWRJZCA9IHVwbG9hZC5VcGxvYWRJZFxuICAgICAgdmFyIGluaXRpYXRvciA9IHsgaWQ6IHVwbG9hZC5Jbml0aWF0b3IuSUQsIGRpc3BsYXlOYW1lOiB1cGxvYWQuSW5pdGlhdG9yLkRpc3BsYXlOYW1lIH1cbiAgICAgIHZhciBvd25lciA9IHsgaWQ6IHVwbG9hZC5Pd25lci5JRCwgZGlzcGxheU5hbWU6IHVwbG9hZC5Pd25lci5EaXNwbGF5TmFtZSB9XG4gICAgICB2YXIgc3RvcmFnZUNsYXNzID0gdXBsb2FkLlN0b3JhZ2VDbGFzc1xuICAgICAgdmFyIGluaXRpYXRlZCA9IG5ldyBEYXRlKHVwbG9hZC5Jbml0aWF0ZWQpXG4gICAgICByZXN1bHQudXBsb2Fkcy5wdXNoKHsga2V5LCB1cGxvYWRJZCwgaW5pdGlhdG9yLCBvd25lciwgc3RvcmFnZUNsYXNzLCBpbml0aWF0ZWQgfSlcbiAgICB9KVxuICB9XG4gIHJldHVybiByZXN1bHRcbn1cblxuLy8gcGFyc2UgWE1MIHJlc3BvbnNlIHRvIGxpc3QgYWxsIHRoZSBvd25lZCBidWNrZXRzXG5leHBvcnQgZnVuY3Rpb24gcGFyc2VMaXN0QnVja2V0KHhtbCkge1xuICB2YXIgcmVzdWx0ID0gW11cbiAgdmFyIHhtbG9iaiA9IHBhcnNlWG1sKHhtbClcblxuICBpZiAoIXhtbG9iai5MaXN0QWxsTXlCdWNrZXRzUmVzdWx0KSB7XG4gICAgdGhyb3cgbmV3IGVycm9ycy5JbnZhbGlkWE1MRXJyb3IoJ01pc3NpbmcgdGFnOiBcIkxpc3RBbGxNeUJ1Y2tldHNSZXN1bHRcIicpXG4gIH1cbiAgeG1sb2JqID0geG1sb2JqLkxpc3RBbGxNeUJ1Y2tldHNSZXN1bHRcblxuICBpZiAoeG1sb2JqLkJ1Y2tldHMpIHtcbiAgICBpZiAoeG1sb2JqLkJ1Y2tldHMuQnVja2V0KSB7XG4gICAgICB0b0FycmF5KHhtbG9iai5CdWNrZXRzLkJ1Y2tldCkuZm9yRWFjaCgoYnVja2V0KSA9PiB7XG4gICAgICAgIHZhciBuYW1lID0gYnVja2V0Lk5hbWVcbiAgICAgICAgdmFyIGNyZWF0aW9uRGF0ZSA9IG5ldyBEYXRlKGJ1Y2tldC5DcmVhdGlvbkRhdGUpXG4gICAgICAgIHJlc3VsdC5wdXNoKHsgbmFtZSwgY3JlYXRpb25EYXRlIH0pXG4gICAgICB9KVxuICAgIH1cbiAgfVxuICByZXR1cm4gcmVzdWx0XG59XG5cbi8vIHBhcnNlIFhNTCByZXNwb25zZSBmb3IgYnVja2V0IG5vdGlmaWNhdGlvblxuZXhwb3J0IGZ1bmN0aW9uIHBhcnNlQnVja2V0Tm90aWZpY2F0aW9uKHhtbCkge1xuICB2YXIgcmVzdWx0ID0ge1xuICAgIFRvcGljQ29uZmlndXJhdGlvbjogW10sXG4gICAgUXVldWVDb25maWd1cmF0aW9uOiBbXSxcbiAgICBDbG91ZEZ1bmN0aW9uQ29uZmlndXJhdGlvbjogW10sXG4gIH1cbiAgLy8gUGFyc2UgdGhlIGV2ZW50cyBsaXN0XG4gIHZhciBnZW5FdmVudHMgPSBmdW5jdGlvbiAoZXZlbnRzKSB7XG4gICAgdmFyIHJlc3VsdCA9IFtdXG4gICAgaWYgKGV2ZW50cykge1xuICAgICAgdG9BcnJheShldmVudHMpLmZvckVhY2goKHMzZXZlbnQpID0+IHtcbiAgICAgICAgcmVzdWx0LnB1c2goczNldmVudClcbiAgICAgIH0pXG4gICAgfVxuICAgIHJldHVybiByZXN1bHRcbiAgfVxuICAvLyBQYXJzZSBhbGwgZmlsdGVyIHJ1bGVzXG4gIHZhciBnZW5GaWx0ZXJSdWxlcyA9IGZ1bmN0aW9uIChmaWx0ZXJzKSB7XG4gICAgdmFyIHJlc3VsdCA9IFtdXG4gICAgaWYgKGZpbHRlcnMpIHtcbiAgICAgIGZpbHRlcnMgPSB0b0FycmF5KGZpbHRlcnMpXG4gICAgICBpZiAoZmlsdGVyc1swXS5TM0tleSkge1xuICAgICAgICBmaWx0ZXJzWzBdLlMzS2V5ID0gdG9BcnJheShmaWx0ZXJzWzBdLlMzS2V5KVxuICAgICAgICBpZiAoZmlsdGVyc1swXS5TM0tleVswXS5GaWx0ZXJSdWxlKSB7XG4gICAgICAgICAgdG9BcnJheShmaWx0ZXJzWzBdLlMzS2V5WzBdLkZpbHRlclJ1bGUpLmZvckVhY2goKHJ1bGUpID0+IHtcbiAgICAgICAgICAgIHZhciBOYW1lID0gdG9BcnJheShydWxlLk5hbWUpWzBdXG4gICAgICAgICAgICB2YXIgVmFsdWUgPSB0b0FycmF5KHJ1bGUuVmFsdWUpWzBdXG4gICAgICAgICAgICByZXN1bHQucHVzaCh7IE5hbWUsIFZhbHVlIH0pXG4gICAgICAgICAgfSlcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0XG4gIH1cblxuICB2YXIgeG1sb2JqID0gcGFyc2VYbWwoeG1sKVxuICB4bWxvYmogPSB4bWxvYmouTm90aWZpY2F0aW9uQ29uZmlndXJhdGlvblxuXG4gIC8vIFBhcnNlIGFsbCB0b3BpYyBjb25maWd1cmF0aW9ucyBpbiB0aGUgeG1sXG4gIGlmICh4bWxvYmouVG9waWNDb25maWd1cmF0aW9uKSB7XG4gICAgdG9BcnJheSh4bWxvYmouVG9waWNDb25maWd1cmF0aW9uKS5mb3JFYWNoKChjb25maWcpID0+IHtcbiAgICAgIHZhciBJZCA9IHRvQXJyYXkoY29uZmlnLklkKVswXVxuICAgICAgdmFyIFRvcGljID0gdG9BcnJheShjb25maWcuVG9waWMpWzBdXG4gICAgICB2YXIgRXZlbnQgPSBnZW5FdmVudHMoY29uZmlnLkV2ZW50KVxuICAgICAgdmFyIEZpbHRlciA9IGdlbkZpbHRlclJ1bGVzKGNvbmZpZy5GaWx0ZXIpXG4gICAgICByZXN1bHQuVG9waWNDb25maWd1cmF0aW9uLnB1c2goeyBJZCwgVG9waWMsIEV2ZW50LCBGaWx0ZXIgfSlcbiAgICB9KVxuICB9XG4gIC8vIFBhcnNlIGFsbCB0b3BpYyBjb25maWd1cmF0aW9ucyBpbiB0aGUgeG1sXG4gIGlmICh4bWxvYmouUXVldWVDb25maWd1cmF0aW9uKSB7XG4gICAgdG9BcnJheSh4bWxvYmouUXVldWVDb25maWd1cmF0aW9uKS5mb3JFYWNoKChjb25maWcpID0+IHtcbiAgICAgIHZhciBJZCA9IHRvQXJyYXkoY29uZmlnLklkKVswXVxuICAgICAgdmFyIFF1ZXVlID0gdG9BcnJheShjb25maWcuUXVldWUpWzBdXG4gICAgICB2YXIgRXZlbnQgPSBnZW5FdmVudHMoY29uZmlnLkV2ZW50KVxuICAgICAgdmFyIEZpbHRlciA9IGdlbkZpbHRlclJ1bGVzKGNvbmZpZy5GaWx0ZXIpXG4gICAgICByZXN1bHQuUXVldWVDb25maWd1cmF0aW9uLnB1c2goeyBJZCwgUXVldWUsIEV2ZW50LCBGaWx0ZXIgfSlcbiAgICB9KVxuICB9XG4gIC8vIFBhcnNlIGFsbCBRdWV1ZUNvbmZpZ3VyYXRpb24gYXJyYXlzXG4gIGlmICh4bWxvYmouQ2xvdWRGdW5jdGlvbkNvbmZpZ3VyYXRpb24pIHtcbiAgICB0b0FycmF5KHhtbG9iai5DbG91ZEZ1bmN0aW9uQ29uZmlndXJhdGlvbikuZm9yRWFjaCgoY29uZmlnKSA9PiB7XG4gICAgICB2YXIgSWQgPSB0b0FycmF5KGNvbmZpZy5JZClbMF1cbiAgICAgIHZhciBDbG91ZEZ1bmN0aW9uID0gdG9BcnJheShjb25maWcuQ2xvdWRGdW5jdGlvbilbMF1cbiAgICAgIHZhciBFdmVudCA9IGdlbkV2ZW50cyhjb25maWcuRXZlbnQpXG4gICAgICB2YXIgRmlsdGVyID0gZ2VuRmlsdGVyUnVsZXMoY29uZmlnLkZpbHRlcilcbiAgICAgIHJlc3VsdC5DbG91ZEZ1bmN0aW9uQ29uZmlndXJhdGlvbi5wdXNoKHsgSWQsIENsb3VkRnVuY3Rpb24sIEV2ZW50LCBGaWx0ZXIgfSlcbiAgICB9KVxuICB9XG5cbiAgcmV0dXJuIHJlc3VsdFxufVxuXG4vLyBwYXJzZSBYTUwgcmVzcG9uc2UgZm9yIGJ1Y2tldCByZWdpb25cbmV4cG9ydCBmdW5jdGlvbiBwYXJzZUJ1Y2tldFJlZ2lvbih4bWwpIHtcbiAgLy8gcmV0dXJuIHJlZ2lvbiBpbmZvcm1hdGlvblxuICByZXR1cm4gcGFyc2VYbWwoeG1sKS5Mb2NhdGlvbkNvbnN0cmFpbnRcbn1cblxuLy8gcGFyc2UgWE1MIHJlc3BvbnNlIGZvciBsaXN0IHBhcnRzIG9mIGFuIGluIHByb2dyZXNzIG11bHRpcGFydCB1cGxvYWRcbmV4cG9ydCBmdW5jdGlvbiBwYXJzZUxpc3RQYXJ0cyh4bWwpIHtcbiAgdmFyIHhtbG9iaiA9IHBhcnNlWG1sKHhtbClcbiAgdmFyIHJlc3VsdCA9IHtcbiAgICBpc1RydW5jYXRlZDogZmFsc2UsXG4gICAgcGFydHM6IFtdLFxuICAgIG1hcmtlcjogdW5kZWZpbmVkLFxuICB9XG4gIGlmICgheG1sb2JqLkxpc3RQYXJ0c1Jlc3VsdCkge1xuICAgIHRocm93IG5ldyBlcnJvcnMuSW52YWxpZFhNTEVycm9yKCdNaXNzaW5nIHRhZzogXCJMaXN0UGFydHNSZXN1bHRcIicpXG4gIH1cbiAgeG1sb2JqID0geG1sb2JqLkxpc3RQYXJ0c1Jlc3VsdFxuICBpZiAoeG1sb2JqLklzVHJ1bmNhdGVkKSB7XG4gICAgcmVzdWx0LmlzVHJ1bmNhdGVkID0geG1sb2JqLklzVHJ1bmNhdGVkXG4gIH1cbiAgaWYgKHhtbG9iai5OZXh0UGFydE51bWJlck1hcmtlcikge1xuICAgIHJlc3VsdC5tYXJrZXIgPSArdG9BcnJheSh4bWxvYmouTmV4dFBhcnROdW1iZXJNYXJrZXIpWzBdXG4gIH1cbiAgaWYgKHhtbG9iai5QYXJ0KSB7XG4gICAgdG9BcnJheSh4bWxvYmouUGFydCkuZm9yRWFjaCgocCkgPT4ge1xuICAgICAgdmFyIHBhcnQgPSArdG9BcnJheShwLlBhcnROdW1iZXIpWzBdXG4gICAgICB2YXIgbGFzdE1vZGlmaWVkID0gbmV3IERhdGUocC5MYXN0TW9kaWZpZWQpXG4gICAgICB2YXIgZXRhZyA9IHAuRVRhZy5yZXBsYWNlKC9eXCIvZywgJycpXG4gICAgICAgIC5yZXBsYWNlKC9cIiQvZywgJycpXG4gICAgICAgIC5yZXBsYWNlKC9eJnF1b3Q7L2csICcnKVxuICAgICAgICAucmVwbGFjZSgvJnF1b3Q7JC9nLCAnJylcbiAgICAgICAgLnJlcGxhY2UoL14mIzM0Oy9nLCAnJylcbiAgICAgICAgLnJlcGxhY2UoLyYjMzQ7JC9nLCAnJylcbiAgICAgIHJlc3VsdC5wYXJ0cy5wdXNoKHsgcGFydCwgbGFzdE1vZGlmaWVkLCBldGFnIH0pXG4gICAgfSlcbiAgfVxuICByZXR1cm4gcmVzdWx0XG59XG5cbi8vIHBhcnNlIFhNTCByZXNwb25zZSB3aGVuIGEgbmV3IG11bHRpcGFydCB1cGxvYWQgaXMgaW5pdGlhdGVkXG5leHBvcnQgZnVuY3Rpb24gcGFyc2VJbml0aWF0ZU11bHRpcGFydCh4bWwpIHtcbiAgdmFyIHhtbG9iaiA9IHBhcnNlWG1sKHhtbClcblxuICBpZiAoIXhtbG9iai5Jbml0aWF0ZU11bHRpcGFydFVwbG9hZFJlc3VsdCkge1xuICAgIHRocm93IG5ldyBlcnJvcnMuSW52YWxpZFhNTEVycm9yKCdNaXNzaW5nIHRhZzogXCJJbml0aWF0ZU11bHRpcGFydFVwbG9hZFJlc3VsdFwiJylcbiAgfVxuICB4bWxvYmogPSB4bWxvYmouSW5pdGlhdGVNdWx0aXBhcnRVcGxvYWRSZXN1bHRcblxuICBpZiAoeG1sb2JqLlVwbG9hZElkKSB7XG4gICAgcmV0dXJuIHhtbG9iai5VcGxvYWRJZFxuICB9XG4gIHRocm93IG5ldyBlcnJvcnMuSW52YWxpZFhNTEVycm9yKCdNaXNzaW5nIHRhZzogXCJVcGxvYWRJZFwiJylcbn1cblxuLy8gcGFyc2UgWE1MIHJlc3BvbnNlIHdoZW4gYSBtdWx0aXBhcnQgdXBsb2FkIGlzIGNvbXBsZXRlZFxuZXhwb3J0IGZ1bmN0aW9uIHBhcnNlQ29tcGxldGVNdWx0aXBhcnQoeG1sKSB7XG4gIHZhciB4bWxvYmogPSBwYXJzZVhtbCh4bWwpLkNvbXBsZXRlTXVsdGlwYXJ0VXBsb2FkUmVzdWx0XG4gIGlmICh4bWxvYmouTG9jYXRpb24pIHtcbiAgICB2YXIgbG9jYXRpb24gPSB0b0FycmF5KHhtbG9iai5Mb2NhdGlvbilbMF1cbiAgICB2YXIgYnVja2V0ID0gdG9BcnJheSh4bWxvYmouQnVja2V0KVswXVxuICAgIHZhciBrZXkgPSB4bWxvYmouS2V5XG4gICAgdmFyIGV0YWcgPSB4bWxvYmouRVRhZy5yZXBsYWNlKC9eXCIvZywgJycpXG4gICAgICAucmVwbGFjZSgvXCIkL2csICcnKVxuICAgICAgLnJlcGxhY2UoL14mcXVvdDsvZywgJycpXG4gICAgICAucmVwbGFjZSgvJnF1b3Q7JC9nLCAnJylcbiAgICAgIC5yZXBsYWNlKC9eJiMzNDsvZywgJycpXG4gICAgICAucmVwbGFjZSgvJiMzNDskL2csICcnKVxuXG4gICAgcmV0dXJuIHsgbG9jYXRpb24sIGJ1Y2tldCwga2V5LCBldGFnIH1cbiAgfVxuICAvLyBDb21wbGV0ZSBNdWx0aXBhcnQgY2FuIHJldHVybiBYTUwgRXJyb3IgYWZ0ZXIgYSAyMDAgT0sgcmVzcG9uc2VcbiAgaWYgKHhtbG9iai5Db2RlICYmIHhtbG9iai5NZXNzYWdlKSB7XG4gICAgdmFyIGVyckNvZGUgPSB0b0FycmF5KHhtbG9iai5Db2RlKVswXVxuICAgIHZhciBlcnJNZXNzYWdlID0gdG9BcnJheSh4bWxvYmouTWVzc2FnZSlbMF1cbiAgICByZXR1cm4geyBlcnJDb2RlLCBlcnJNZXNzYWdlIH1cbiAgfVxufVxuXG5jb25zdCBmb3JtYXRPYmpJbmZvID0gKGNvbnRlbnQsIG9wdHMgPSB7fSkgPT4ge1xuICBsZXQgeyBLZXksIExhc3RNb2RpZmllZCwgRVRhZywgU2l6ZSwgVmVyc2lvbklkLCBJc0xhdGVzdCB9ID0gY29udGVudFxuXG4gIGlmICghaXNPYmplY3Qob3B0cykpIHtcbiAgICBvcHRzID0ge31cbiAgfVxuXG4gIGNvbnN0IG5hbWUgPSBzYW5pdGl6ZU9iamVjdEtleSh0b0FycmF5KEtleSlbMF0pXG4gIGNvbnN0IGxhc3RNb2RpZmllZCA9IG5ldyBEYXRlKHRvQXJyYXkoTGFzdE1vZGlmaWVkKVswXSlcbiAgY29uc3QgZXRhZyA9IHNhbml0aXplRVRhZyh0b0FycmF5KEVUYWcpWzBdKVxuXG4gIHJldHVybiB7XG4gICAgbmFtZSxcbiAgICBsYXN0TW9kaWZpZWQsXG4gICAgZXRhZyxcbiAgICBzaXplOiBTaXplLFxuICAgIHZlcnNpb25JZDogVmVyc2lvbklkLFxuICAgIGlzTGF0ZXN0OiBJc0xhdGVzdCxcbiAgICBpc0RlbGV0ZU1hcmtlcjogb3B0cy5Jc0RlbGV0ZU1hcmtlciA/IG9wdHMuSXNEZWxldGVNYXJrZXIgOiBmYWxzZSxcbiAgfVxufVxuXG4vLyBwYXJzZSBYTUwgcmVzcG9uc2UgZm9yIGxpc3Qgb2JqZWN0cyBpbiBhIGJ1Y2tldFxuZXhwb3J0IGZ1bmN0aW9uIHBhcnNlTGlzdE9iamVjdHMoeG1sKSB7XG4gIHZhciByZXN1bHQgPSB7XG4gICAgb2JqZWN0czogW10sXG4gICAgaXNUcnVuY2F0ZWQ6IGZhbHNlLFxuICB9XG4gIGxldCBpc1RydW5jYXRlZCA9IGZhbHNlXG4gIGxldCBuZXh0TWFya2VyLCBuZXh0VmVyc2lvbktleU1hcmtlclxuICBjb25zdCB4bWxvYmogPSBwYXJzZVhtbCh4bWwpXG5cbiAgY29uc3QgcGFyc2VDb21tb25QcmVmaXhlc0VudGl0eSA9IChyZXNwb25zZUVudGl0eSkgPT4ge1xuICAgIGlmIChyZXNwb25zZUVudGl0eSkge1xuICAgICAgdG9BcnJheShyZXNwb25zZUVudGl0eSkuZm9yRWFjaCgoY29tbW9uUHJlZml4KSA9PiB7XG4gICAgICAgIHJlc3VsdC5vYmplY3RzLnB1c2goeyBwcmVmaXg6IHNhbml0aXplT2JqZWN0S2V5KHRvQXJyYXkoY29tbW9uUHJlZml4LlByZWZpeClbMF0pLCBzaXplOiAwIH0pXG4gICAgICB9KVxuICAgIH1cbiAgfVxuXG4gIGNvbnN0IGxpc3RCdWNrZXRSZXN1bHQgPSB4bWxvYmouTGlzdEJ1Y2tldFJlc3VsdFxuICBjb25zdCBsaXN0VmVyc2lvbnNSZXN1bHQgPSB4bWxvYmouTGlzdFZlcnNpb25zUmVzdWx0XG5cbiAgaWYgKGxpc3RCdWNrZXRSZXN1bHQpIHtcbiAgICBpZiAobGlzdEJ1Y2tldFJlc3VsdC5Jc1RydW5jYXRlZCkge1xuICAgICAgaXNUcnVuY2F0ZWQgPSBsaXN0QnVja2V0UmVzdWx0LklzVHJ1bmNhdGVkXG4gICAgfVxuICAgIGlmIChsaXN0QnVja2V0UmVzdWx0LkNvbnRlbnRzKSB7XG4gICAgICB0b0FycmF5KGxpc3RCdWNrZXRSZXN1bHQuQ29udGVudHMpLmZvckVhY2goKGNvbnRlbnQpID0+IHtcbiAgICAgICAgY29uc3QgbmFtZSA9IHNhbml0aXplT2JqZWN0S2V5KHRvQXJyYXkoY29udGVudC5LZXkpWzBdKVxuICAgICAgICBjb25zdCBsYXN0TW9kaWZpZWQgPSBuZXcgRGF0ZSh0b0FycmF5KGNvbnRlbnQuTGFzdE1vZGlmaWVkKVswXSlcbiAgICAgICAgY29uc3QgZXRhZyA9IHNhbml0aXplRVRhZyh0b0FycmF5KGNvbnRlbnQuRVRhZylbMF0pXG4gICAgICAgIGNvbnN0IHNpemUgPSBjb250ZW50LlNpemVcbiAgICAgICAgcmVzdWx0Lm9iamVjdHMucHVzaCh7IG5hbWUsIGxhc3RNb2RpZmllZCwgZXRhZywgc2l6ZSB9KVxuICAgICAgfSlcbiAgICB9XG5cbiAgICBpZiAobGlzdEJ1Y2tldFJlc3VsdC5OZXh0TWFya2VyKSB7XG4gICAgICBuZXh0TWFya2VyID0gbGlzdEJ1Y2tldFJlc3VsdC5OZXh0TWFya2VyXG4gICAgfVxuICAgIHBhcnNlQ29tbW9uUHJlZml4ZXNFbnRpdHkobGlzdEJ1Y2tldFJlc3VsdC5Db21tb25QcmVmaXhlcylcbiAgfVxuXG4gIGlmIChsaXN0VmVyc2lvbnNSZXN1bHQpIHtcbiAgICBpZiAobGlzdFZlcnNpb25zUmVzdWx0LklzVHJ1bmNhdGVkKSB7XG4gICAgICBpc1RydW5jYXRlZCA9IGxpc3RWZXJzaW9uc1Jlc3VsdC5Jc1RydW5jYXRlZFxuICAgIH1cblxuICAgIGlmIChsaXN0VmVyc2lvbnNSZXN1bHQuVmVyc2lvbikge1xuICAgICAgdG9BcnJheShsaXN0VmVyc2lvbnNSZXN1bHQuVmVyc2lvbikuZm9yRWFjaCgoY29udGVudCkgPT4ge1xuICAgICAgICByZXN1bHQub2JqZWN0cy5wdXNoKGZvcm1hdE9iakluZm8oY29udGVudCkpXG4gICAgICB9KVxuICAgIH1cbiAgICBpZiAobGlzdFZlcnNpb25zUmVzdWx0LkRlbGV0ZU1hcmtlcikge1xuICAgICAgdG9BcnJheShsaXN0VmVyc2lvbnNSZXN1bHQuRGVsZXRlTWFya2VyKS5mb3JFYWNoKChjb250ZW50KSA9PiB7XG4gICAgICAgIHJlc3VsdC5vYmplY3RzLnB1c2goZm9ybWF0T2JqSW5mbyhjb250ZW50LCB7IElzRGVsZXRlTWFya2VyOiB0cnVlIH0pKVxuICAgICAgfSlcbiAgICB9XG5cbiAgICBpZiAobGlzdFZlcnNpb25zUmVzdWx0Lk5leHRLZXlNYXJrZXIpIHtcbiAgICAgIG5leHRWZXJzaW9uS2V5TWFya2VyID0gbGlzdFZlcnNpb25zUmVzdWx0Lk5leHRLZXlNYXJrZXJcbiAgICB9XG4gICAgaWYgKGxpc3RWZXJzaW9uc1Jlc3VsdC5OZXh0VmVyc2lvbklkTWFya2VyKSB7XG4gICAgICByZXN1bHQudmVyc2lvbklkTWFya2VyID0gbGlzdFZlcnNpb25zUmVzdWx0Lk5leHRWZXJzaW9uSWRNYXJrZXJcbiAgICB9XG4gICAgcGFyc2VDb21tb25QcmVmaXhlc0VudGl0eShsaXN0VmVyc2lvbnNSZXN1bHQuQ29tbW9uUHJlZml4ZXMpXG4gIH1cblxuICByZXN1bHQuaXNUcnVuY2F0ZWQgPSBpc1RydW5jYXRlZFxuICBpZiAoaXNUcnVuY2F0ZWQpIHtcbiAgICByZXN1bHQubmV4dE1hcmtlciA9IG5leHRWZXJzaW9uS2V5TWFya2VyIHx8IG5leHRNYXJrZXJcbiAgfVxuICByZXR1cm4gcmVzdWx0XG59XG5cbi8vIHBhcnNlIFhNTCByZXNwb25zZSBmb3IgbGlzdCBvYmplY3RzIHYyIGluIGEgYnVja2V0XG5leHBvcnQgZnVuY3Rpb24gcGFyc2VMaXN0T2JqZWN0c1YyKHhtbCkge1xuICB2YXIgcmVzdWx0ID0ge1xuICAgIG9iamVjdHM6IFtdLFxuICAgIGlzVHJ1bmNhdGVkOiBmYWxzZSxcbiAgfVxuICB2YXIgeG1sb2JqID0gcGFyc2VYbWwoeG1sKVxuICBpZiAoIXhtbG9iai5MaXN0QnVja2V0UmVzdWx0KSB7XG4gICAgdGhyb3cgbmV3IGVycm9ycy5JbnZhbGlkWE1MRXJyb3IoJ01pc3NpbmcgdGFnOiBcIkxpc3RCdWNrZXRSZXN1bHRcIicpXG4gIH1cbiAgeG1sb2JqID0geG1sb2JqLkxpc3RCdWNrZXRSZXN1bHRcbiAgaWYgKHhtbG9iai5Jc1RydW5jYXRlZCkge1xuICAgIHJlc3VsdC5pc1RydW5jYXRlZCA9IHhtbG9iai5Jc1RydW5jYXRlZFxuICB9XG4gIGlmICh4bWxvYmouTmV4dENvbnRpbnVhdGlvblRva2VuKSB7XG4gICAgcmVzdWx0Lm5leHRDb250aW51YXRpb25Ub2tlbiA9IHhtbG9iai5OZXh0Q29udGludWF0aW9uVG9rZW5cbiAgfVxuICBpZiAoeG1sb2JqLkNvbnRlbnRzKSB7XG4gICAgdG9BcnJheSh4bWxvYmouQ29udGVudHMpLmZvckVhY2goKGNvbnRlbnQpID0+IHtcbiAgICAgIHZhciBuYW1lID0gc2FuaXRpemVPYmplY3RLZXkodG9BcnJheShjb250ZW50LktleSlbMF0pXG4gICAgICB2YXIgbGFzdE1vZGlmaWVkID0gbmV3IERhdGUoY29udGVudC5MYXN0TW9kaWZpZWQpXG4gICAgICB2YXIgZXRhZyA9IHNhbml0aXplRVRhZyhjb250ZW50LkVUYWcpXG4gICAgICB2YXIgc2l6ZSA9IGNvbnRlbnQuU2l6ZVxuICAgICAgcmVzdWx0Lm9iamVjdHMucHVzaCh7IG5hbWUsIGxhc3RNb2RpZmllZCwgZXRhZywgc2l6ZSB9KVxuICAgIH0pXG4gIH1cbiAgaWYgKHhtbG9iai5Db21tb25QcmVmaXhlcykge1xuICAgIHRvQXJyYXkoeG1sb2JqLkNvbW1vblByZWZpeGVzKS5mb3JFYWNoKChjb21tb25QcmVmaXgpID0+IHtcbiAgICAgIHJlc3VsdC5vYmplY3RzLnB1c2goeyBwcmVmaXg6IHNhbml0aXplT2JqZWN0S2V5KHRvQXJyYXkoY29tbW9uUHJlZml4LlByZWZpeClbMF0pLCBzaXplOiAwIH0pXG4gICAgfSlcbiAgfVxuICByZXR1cm4gcmVzdWx0XG59XG5cbi8vIHBhcnNlIFhNTCByZXNwb25zZSBmb3IgbGlzdCBvYmplY3RzIHYyIHdpdGggbWV0YWRhdGEgaW4gYSBidWNrZXRcbmV4cG9ydCBmdW5jdGlvbiBwYXJzZUxpc3RPYmplY3RzVjJXaXRoTWV0YWRhdGEoeG1sKSB7XG4gIHZhciByZXN1bHQgPSB7XG4gICAgb2JqZWN0czogW10sXG4gICAgaXNUcnVuY2F0ZWQ6IGZhbHNlLFxuICB9XG4gIHZhciB4bWxvYmogPSBwYXJzZVhtbCh4bWwpXG4gIGlmICgheG1sb2JqLkxpc3RCdWNrZXRSZXN1bHQpIHtcbiAgICB0aHJvdyBuZXcgZXJyb3JzLkludmFsaWRYTUxFcnJvcignTWlzc2luZyB0YWc6IFwiTGlzdEJ1Y2tldFJlc3VsdFwiJylcbiAgfVxuICB4bWxvYmogPSB4bWxvYmouTGlzdEJ1Y2tldFJlc3VsdFxuICBpZiAoeG1sb2JqLklzVHJ1bmNhdGVkKSB7XG4gICAgcmVzdWx0LmlzVHJ1bmNhdGVkID0geG1sb2JqLklzVHJ1bmNhdGVkXG4gIH1cbiAgaWYgKHhtbG9iai5OZXh0Q29udGludWF0aW9uVG9rZW4pIHtcbiAgICByZXN1bHQubmV4dENvbnRpbnVhdGlvblRva2VuID0geG1sb2JqLk5leHRDb250aW51YXRpb25Ub2tlblxuICB9XG5cbiAgaWYgKHhtbG9iai5Db250ZW50cykge1xuICAgIHRvQXJyYXkoeG1sb2JqLkNvbnRlbnRzKS5mb3JFYWNoKChjb250ZW50KSA9PiB7XG4gICAgICB2YXIgbmFtZSA9IHNhbml0aXplT2JqZWN0S2V5KGNvbnRlbnQuS2V5KVxuICAgICAgdmFyIGxhc3RNb2RpZmllZCA9IG5ldyBEYXRlKGNvbnRlbnQuTGFzdE1vZGlmaWVkKVxuICAgICAgdmFyIGV0YWcgPSBzYW5pdGl6ZUVUYWcoY29udGVudC5FVGFnKVxuICAgICAgdmFyIHNpemUgPSBjb250ZW50LlNpemVcbiAgICAgIHZhciBtZXRhZGF0YVxuICAgICAgaWYgKGNvbnRlbnQuVXNlck1ldGFkYXRhICE9IG51bGwpIHtcbiAgICAgICAgbWV0YWRhdGEgPSB0b0FycmF5KGNvbnRlbnQuVXNlck1ldGFkYXRhKVswXVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgbWV0YWRhdGEgPSBudWxsXG4gICAgICB9XG4gICAgICByZXN1bHQub2JqZWN0cy5wdXNoKHsgbmFtZSwgbGFzdE1vZGlmaWVkLCBldGFnLCBzaXplLCBtZXRhZGF0YSB9KVxuICAgIH0pXG4gIH1cblxuICBpZiAoeG1sb2JqLkNvbW1vblByZWZpeGVzKSB7XG4gICAgdG9BcnJheSh4bWxvYmouQ29tbW9uUHJlZml4ZXMpLmZvckVhY2goKGNvbW1vblByZWZpeCkgPT4ge1xuICAgICAgcmVzdWx0Lm9iamVjdHMucHVzaCh7IHByZWZpeDogc2FuaXRpemVPYmplY3RLZXkodG9BcnJheShjb21tb25QcmVmaXguUHJlZml4KVswXSksIHNpemU6IDAgfSlcbiAgICB9KVxuICB9XG4gIHJldHVybiByZXN1bHRcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHBhcnNlQnVja2V0VmVyc2lvbmluZ0NvbmZpZyh4bWwpIHtcbiAgdmFyIHhtbE9iaiA9IHBhcnNlWG1sKHhtbClcbiAgcmV0dXJuIHhtbE9iai5WZXJzaW9uaW5nQ29uZmlndXJhdGlvblxufVxuXG5leHBvcnQgZnVuY3Rpb24gcGFyc2VUYWdnaW5nKHhtbCkge1xuICBjb25zdCB4bWxPYmogPSBwYXJzZVhtbCh4bWwpXG4gIGxldCByZXN1bHQgPSBbXVxuICBpZiAoeG1sT2JqLlRhZ2dpbmcgJiYgeG1sT2JqLlRhZ2dpbmcuVGFnU2V0ICYmIHhtbE9iai5UYWdnaW5nLlRhZ1NldC5UYWcpIHtcbiAgICBjb25zdCB0YWdSZXN1bHQgPSB4bWxPYmouVGFnZ2luZy5UYWdTZXQuVGFnXG4gICAgLy8gaWYgaXQgaXMgYSBzaW5nbGUgdGFnIGNvbnZlcnQgaW50byBhbiBhcnJheSBzbyB0aGF0IHRoZSByZXR1cm4gdmFsdWUgaXMgYWx3YXlzIGFuIGFycmF5LlxuICAgIGlmIChpc09iamVjdCh0YWdSZXN1bHQpKSB7XG4gICAgICByZXN1bHQucHVzaCh0YWdSZXN1bHQpXG4gICAgfSBlbHNlIHtcbiAgICAgIHJlc3VsdCA9IHRhZ1Jlc3VsdFxuICAgIH1cbiAgfVxuICByZXR1cm4gcmVzdWx0XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBwYXJzZUxpZmVjeWNsZUNvbmZpZyh4bWwpIHtcbiAgY29uc3QgeG1sT2JqID0gcGFyc2VYbWwoeG1sKVxuICByZXR1cm4geG1sT2JqLkxpZmVjeWNsZUNvbmZpZ3VyYXRpb25cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHBhcnNlT2JqZWN0TG9ja0NvbmZpZyh4bWwpIHtcbiAgY29uc3QgeG1sT2JqID0gcGFyc2VYbWwoeG1sKVxuICBsZXQgbG9ja0NvbmZpZ1Jlc3VsdCA9IHt9XG4gIGlmICh4bWxPYmouT2JqZWN0TG9ja0NvbmZpZ3VyYXRpb24pIHtcbiAgICBsb2NrQ29uZmlnUmVzdWx0ID0ge1xuICAgICAgb2JqZWN0TG9ja0VuYWJsZWQ6IHhtbE9iai5PYmplY3RMb2NrQ29uZmlndXJhdGlvbi5PYmplY3RMb2NrRW5hYmxlZCxcbiAgICB9XG4gICAgbGV0IHJldGVudGlvblJlc3BcbiAgICBpZiAoXG4gICAgICB4bWxPYmouT2JqZWN0TG9ja0NvbmZpZ3VyYXRpb24gJiZcbiAgICAgIHhtbE9iai5PYmplY3RMb2NrQ29uZmlndXJhdGlvbi5SdWxlICYmXG4gICAgICB4bWxPYmouT2JqZWN0TG9ja0NvbmZpZ3VyYXRpb24uUnVsZS5EZWZhdWx0UmV0ZW50aW9uXG4gICAgKSB7XG4gICAgICByZXRlbnRpb25SZXNwID0geG1sT2JqLk9iamVjdExvY2tDb25maWd1cmF0aW9uLlJ1bGUuRGVmYXVsdFJldGVudGlvbiB8fCB7fVxuICAgICAgbG9ja0NvbmZpZ1Jlc3VsdC5tb2RlID0gcmV0ZW50aW9uUmVzcC5Nb2RlXG4gICAgfVxuICAgIGlmIChyZXRlbnRpb25SZXNwKSB7XG4gICAgICBjb25zdCBpc1VuaXRZZWFycyA9IHJldGVudGlvblJlc3AuWWVhcnNcbiAgICAgIGlmIChpc1VuaXRZZWFycykge1xuICAgICAgICBsb2NrQ29uZmlnUmVzdWx0LnZhbGlkaXR5ID0gaXNVbml0WWVhcnNcbiAgICAgICAgbG9ja0NvbmZpZ1Jlc3VsdC51bml0ID0gUkVURU5USU9OX1ZBTElESVRZX1VOSVRTLllFQVJTXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBsb2NrQ29uZmlnUmVzdWx0LnZhbGlkaXR5ID0gcmV0ZW50aW9uUmVzcC5EYXlzXG4gICAgICAgIGxvY2tDb25maWdSZXN1bHQudW5pdCA9IFJFVEVOVElPTl9WQUxJRElUWV9VTklUUy5EQVlTXG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiBsb2NrQ29uZmlnUmVzdWx0XG4gIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHBhcnNlT2JqZWN0UmV0ZW50aW9uQ29uZmlnKHhtbCkge1xuICBjb25zdCB4bWxPYmogPSBwYXJzZVhtbCh4bWwpXG4gIGNvbnN0IHJldGVudGlvbkNvbmZpZyA9IHhtbE9iai5SZXRlbnRpb25cblxuICByZXR1cm4ge1xuICAgIG1vZGU6IHJldGVudGlvbkNvbmZpZy5Nb2RlLFxuICAgIHJldGFpblVudGlsRGF0ZTogcmV0ZW50aW9uQ29uZmlnLlJldGFpblVudGlsRGF0ZSxcbiAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gcGFyc2VCdWNrZXRFbmNyeXB0aW9uQ29uZmlnKHhtbCkge1xuICBsZXQgZW5jQ29uZmlnID0gcGFyc2VYbWwoeG1sKVxuICByZXR1cm4gZW5jQ29uZmlnXG59XG5leHBvcnQgZnVuY3Rpb24gcGFyc2VSZXBsaWNhdGlvbkNvbmZpZyh4bWwpIHtcbiAgY29uc3QgeG1sT2JqID0gcGFyc2VYbWwoeG1sKVxuICBjb25zdCByZXBsaWNhdGlvbkNvbmZpZyA9IHtcbiAgICBSZXBsaWNhdGlvbkNvbmZpZ3VyYXRpb246IHtcbiAgICAgIHJvbGU6IHhtbE9iai5SZXBsaWNhdGlvbkNvbmZpZ3VyYXRpb24uUm9sZSxcbiAgICAgIHJ1bGVzOiB0b0FycmF5KHhtbE9iai5SZXBsaWNhdGlvbkNvbmZpZ3VyYXRpb24uUnVsZSksXG4gICAgfSxcbiAgfVxuICByZXR1cm4gcmVwbGljYXRpb25Db25maWdcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHBhcnNlT2JqZWN0TGVnYWxIb2xkQ29uZmlnKHhtbCkge1xuICBjb25zdCB4bWxPYmogPSBwYXJzZVhtbCh4bWwpXG4gIHJldHVybiB4bWxPYmouTGVnYWxIb2xkXG59XG5cbmV4cG9ydCBmdW5jdGlvbiB1cGxvYWRQYXJ0UGFyc2VyKHhtbCkge1xuICBjb25zdCB4bWxPYmogPSBwYXJzZVhtbCh4bWwpXG4gIGNvbnN0IHJlc3BFbCA9IHhtbE9iai5Db3B5UGFydFJlc3VsdFxuICByZXR1cm4gcmVzcEVsXG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZW1vdmVPYmplY3RzUGFyc2VyKHhtbCkge1xuICBjb25zdCB4bWxPYmogPSBwYXJzZVhtbCh4bWwpXG4gIGlmICh4bWxPYmouRGVsZXRlUmVzdWx0ICYmIHhtbE9iai5EZWxldGVSZXN1bHQuRXJyb3IpIHtcbiAgICAvLyByZXR1cm4gZXJyb3JzIGFzIGFycmF5IGFsd2F5cy4gYXMgdGhlIHJlc3BvbnNlIGlzIG9iamVjdCBpbiBjYXNlIG9mIHNpbmdsZSBvYmplY3QgcGFzc2VkIGluIHJlbW92ZU9iamVjdHNcbiAgICByZXR1cm4gdG9BcnJheSh4bWxPYmouRGVsZXRlUmVzdWx0LkVycm9yKVxuICB9XG4gIHJldHVybiBbXVxufVxuXG5leHBvcnQgZnVuY3Rpb24gcGFyc2VTZWxlY3RPYmplY3RDb250ZW50UmVzcG9uc2UocmVzKSB7XG4gIC8vIGV4dHJhY3RIZWFkZXJUeXBlIGV4dHJhY3RzIHRoZSBmaXJzdCBoYWxmIG9mIHRoZSBoZWFkZXIgbWVzc2FnZSwgdGhlIGhlYWRlciB0eXBlLlxuICBmdW5jdGlvbiBleHRyYWN0SGVhZGVyVHlwZShzdHJlYW0pIHtcbiAgICBjb25zdCBoZWFkZXJOYW1lTGVuID0gQnVmZmVyLmZyb20oc3RyZWFtLnJlYWQoMSkpLnJlYWRVSW50OCgpXG4gICAgY29uc3QgaGVhZGVyTmFtZVdpdGhTZXBhcmF0b3IgPSBCdWZmZXIuZnJvbShzdHJlYW0ucmVhZChoZWFkZXJOYW1lTGVuKSkudG9TdHJpbmcoKVxuICAgIGNvbnN0IHNwbGl0QnlTZXBhcmF0b3IgPSAoaGVhZGVyTmFtZVdpdGhTZXBhcmF0b3IgfHwgJycpLnNwbGl0KCc6JylcbiAgICBjb25zdCBoZWFkZXJOYW1lID0gc3BsaXRCeVNlcGFyYXRvci5sZW5ndGggPj0gMSA/IHNwbGl0QnlTZXBhcmF0b3JbMV0gOiAnJ1xuICAgIHJldHVybiBoZWFkZXJOYW1lXG4gIH1cblxuICBmdW5jdGlvbiBleHRyYWN0SGVhZGVyVmFsdWUoc3RyZWFtKSB7XG4gICAgY29uc3QgYm9keUxlbiA9IEJ1ZmZlci5mcm9tKHN0cmVhbS5yZWFkKDIpKS5yZWFkVUludDE2QkUoKVxuICAgIGNvbnN0IGJvZHlOYW1lID0gQnVmZmVyLmZyb20oc3RyZWFtLnJlYWQoYm9keUxlbikpLnRvU3RyaW5nKClcbiAgICByZXR1cm4gYm9keU5hbWVcbiAgfVxuXG4gIGNvbnN0IHNlbGVjdFJlc3VsdHMgPSBuZXcgU2VsZWN0UmVzdWx0cyh7fSkgLy8gd2lsbCBiZSByZXR1cm5lZFxuXG4gIGNvbnN0IHJlc3BvbnNlU3RyZWFtID0gcmVhZGFibGVTdHJlYW0ocmVzKSAvLyBjb252ZXJ0IGJ5dGUgYXJyYXkgdG8gYSByZWFkYWJsZSByZXNwb25zZVN0cmVhbVxuICB3aGlsZSAocmVzcG9uc2VTdHJlYW0uX3JlYWRhYmxlU3RhdGUubGVuZ3RoKSB7XG4gICAgLy8gVG9wIGxldmVsIHJlc3BvbnNlU3RyZWFtIHJlYWQgdHJhY2tlci5cbiAgICBsZXQgbXNnQ3JjQWNjdW11bGF0b3IgLy8gYWNjdW11bGF0ZSBmcm9tIHN0YXJ0IG9mIHRoZSBtZXNzYWdlIHRpbGwgdGhlIG1lc3NhZ2UgY3JjIHN0YXJ0LlxuXG4gICAgY29uc3QgdG90YWxCeXRlTGVuZ3RoQnVmZmVyID0gQnVmZmVyLmZyb20ocmVzcG9uc2VTdHJlYW0ucmVhZCg0KSlcbiAgICBtc2dDcmNBY2N1bXVsYXRvciA9IGNyYzMyKHRvdGFsQnl0ZUxlbmd0aEJ1ZmZlcilcblxuICAgIGNvbnN0IGhlYWRlckJ5dGVzQnVmZmVyID0gQnVmZmVyLmZyb20ocmVzcG9uc2VTdHJlYW0ucmVhZCg0KSlcbiAgICBtc2dDcmNBY2N1bXVsYXRvciA9IGNyYzMyKGhlYWRlckJ5dGVzQnVmZmVyLCBtc2dDcmNBY2N1bXVsYXRvcilcblxuICAgIGNvbnN0IGNhbGN1bGF0ZWRQcmVsdWRlQ3JjID0gbXNnQ3JjQWNjdW11bGF0b3IucmVhZEludDMyQkUoKSAvLyB1c2UgaXQgdG8gY2hlY2sgaWYgYW55IENSQyBtaXNtYXRjaCBpbiBoZWFkZXIgaXRzZWxmLlxuXG4gICAgY29uc3QgcHJlbHVkZUNyY0J1ZmZlciA9IEJ1ZmZlci5mcm9tKHJlc3BvbnNlU3RyZWFtLnJlYWQoNCkpIC8vIHJlYWQgNCBieXRlcyAgICBpLmUgNCs0ID04ICsgNCA9IDEyICggcHJlbHVkZSArIHByZWx1ZGUgY3JjKVxuICAgIG1zZ0NyY0FjY3VtdWxhdG9yID0gY3JjMzIocHJlbHVkZUNyY0J1ZmZlciwgbXNnQ3JjQWNjdW11bGF0b3IpXG5cbiAgICBjb25zdCB0b3RhbE1zZ0xlbmd0aCA9IHRvdGFsQnl0ZUxlbmd0aEJ1ZmZlci5yZWFkSW50MzJCRSgpXG4gICAgY29uc3QgaGVhZGVyTGVuZ3RoID0gaGVhZGVyQnl0ZXNCdWZmZXIucmVhZEludDMyQkUoKVxuICAgIGNvbnN0IHByZWx1ZGVDcmNCeXRlVmFsdWUgPSBwcmVsdWRlQ3JjQnVmZmVyLnJlYWRJbnQzMkJFKClcblxuICAgIGlmIChwcmVsdWRlQ3JjQnl0ZVZhbHVlICE9PSBjYWxjdWxhdGVkUHJlbHVkZUNyYykge1xuICAgICAgLy8gSGFuZGxlIEhlYWRlciBDUkMgbWlzbWF0Y2ggRXJyb3JcbiAgICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgICAgYEhlYWRlciBDaGVja3N1bSBNaXNtYXRjaCwgUHJlbHVkZSBDUkMgb2YgJHtwcmVsdWRlQ3JjQnl0ZVZhbHVlfSBkb2VzIG5vdCBlcXVhbCBleHBlY3RlZCBDUkMgb2YgJHtjYWxjdWxhdGVkUHJlbHVkZUNyY31gLFxuICAgICAgKVxuICAgIH1cblxuICAgIGNvbnN0IGhlYWRlcnMgPSB7fVxuICAgIGlmIChoZWFkZXJMZW5ndGggPiAwKSB7XG4gICAgICBjb25zdCBoZWFkZXJCeXRlcyA9IEJ1ZmZlci5mcm9tKHJlc3BvbnNlU3RyZWFtLnJlYWQoaGVhZGVyTGVuZ3RoKSlcbiAgICAgIG1zZ0NyY0FjY3VtdWxhdG9yID0gY3JjMzIoaGVhZGVyQnl0ZXMsIG1zZ0NyY0FjY3VtdWxhdG9yKVxuICAgICAgY29uc3QgaGVhZGVyUmVhZGVyU3RyZWFtID0gcmVhZGFibGVTdHJlYW0oaGVhZGVyQnl0ZXMpXG4gICAgICB3aGlsZSAoaGVhZGVyUmVhZGVyU3RyZWFtLl9yZWFkYWJsZVN0YXRlLmxlbmd0aCkge1xuICAgICAgICBsZXQgaGVhZGVyVHlwZU5hbWUgPSBleHRyYWN0SGVhZGVyVHlwZShoZWFkZXJSZWFkZXJTdHJlYW0pXG4gICAgICAgIGhlYWRlclJlYWRlclN0cmVhbS5yZWFkKDEpIC8vIGp1c3QgcmVhZCBhbmQgaWdub3JlIGl0LlxuICAgICAgICBoZWFkZXJzW2hlYWRlclR5cGVOYW1lXSA9IGV4dHJhY3RIZWFkZXJWYWx1ZShoZWFkZXJSZWFkZXJTdHJlYW0pXG4gICAgICB9XG4gICAgfVxuXG4gICAgbGV0IHBheWxvYWRTdHJlYW1cbiAgICBjb25zdCBwYXlMb2FkTGVuZ3RoID0gdG90YWxNc2dMZW5ndGggLSBoZWFkZXJMZW5ndGggLSAxNlxuICAgIGlmIChwYXlMb2FkTGVuZ3RoID4gMCkge1xuICAgICAgY29uc3QgcGF5TG9hZEJ1ZmZlciA9IEJ1ZmZlci5mcm9tKHJlc3BvbnNlU3RyZWFtLnJlYWQocGF5TG9hZExlbmd0aCkpXG4gICAgICBtc2dDcmNBY2N1bXVsYXRvciA9IGNyYzMyKHBheUxvYWRCdWZmZXIsIG1zZ0NyY0FjY3VtdWxhdG9yKVxuICAgICAgLy8gcmVhZCB0aGUgY2hlY2tzdW0gZWFybHkgYW5kIGRldGVjdCBhbnkgbWlzbWF0Y2ggc28gd2UgY2FuIGF2b2lkIHVubmVjZXNzYXJ5IGZ1cnRoZXIgcHJvY2Vzc2luZy5cbiAgICAgIGNvbnN0IG1lc3NhZ2VDcmNCeXRlVmFsdWUgPSBCdWZmZXIuZnJvbShyZXNwb25zZVN0cmVhbS5yZWFkKDQpKS5yZWFkSW50MzJCRSgpXG4gICAgICBjb25zdCBjYWxjdWxhdGVkQ3JjID0gbXNnQ3JjQWNjdW11bGF0b3IucmVhZEludDMyQkUoKVxuICAgICAgLy8gSGFuZGxlIG1lc3NhZ2UgQ1JDIEVycm9yXG4gICAgICBpZiAobWVzc2FnZUNyY0J5dGVWYWx1ZSAhPT0gY2FsY3VsYXRlZENyYykge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAgICAgYE1lc3NhZ2UgQ2hlY2tzdW0gTWlzbWF0Y2gsIE1lc3NhZ2UgQ1JDIG9mICR7bWVzc2FnZUNyY0J5dGVWYWx1ZX0gZG9lcyBub3QgZXF1YWwgZXhwZWN0ZWQgQ1JDIG9mICR7Y2FsY3VsYXRlZENyY31gLFxuICAgICAgICApXG4gICAgICB9XG4gICAgICBwYXlsb2FkU3RyZWFtID0gcmVhZGFibGVTdHJlYW0ocGF5TG9hZEJ1ZmZlcilcbiAgICB9XG5cbiAgICBjb25zdCBtZXNzYWdlVHlwZSA9IGhlYWRlcnNbJ21lc3NhZ2UtdHlwZSddXG5cbiAgICBzd2l0Y2ggKG1lc3NhZ2VUeXBlKSB7XG4gICAgICBjYXNlICdlcnJvcic6IHtcbiAgICAgICAgY29uc3QgZXJyb3JNZXNzYWdlID0gaGVhZGVyc1snZXJyb3ItY29kZSddICsgJzpcIicgKyBoZWFkZXJzWydlcnJvci1tZXNzYWdlJ10gKyAnXCInXG4gICAgICAgIHRocm93IG5ldyBFcnJvcihlcnJvck1lc3NhZ2UpXG4gICAgICB9XG4gICAgICBjYXNlICdldmVudCc6IHtcbiAgICAgICAgY29uc3QgY29udGVudFR5cGUgPSBoZWFkZXJzWydjb250ZW50LXR5cGUnXVxuICAgICAgICBjb25zdCBldmVudFR5cGUgPSBoZWFkZXJzWydldmVudC10eXBlJ11cblxuICAgICAgICBzd2l0Y2ggKGV2ZW50VHlwZSkge1xuICAgICAgICAgIGNhc2UgJ0VuZCc6IHtcbiAgICAgICAgICAgIHNlbGVjdFJlc3VsdHMuc2V0UmVzcG9uc2UocmVzKVxuICAgICAgICAgICAgcmV0dXJuIHNlbGVjdFJlc3VsdHNcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBjYXNlICdSZWNvcmRzJzoge1xuICAgICAgICAgICAgY29uc3QgcmVhZERhdGEgPSBwYXlsb2FkU3RyZWFtLnJlYWQocGF5TG9hZExlbmd0aClcbiAgICAgICAgICAgIHNlbGVjdFJlc3VsdHMuc2V0UmVjb3JkcyhyZWFkRGF0YSlcbiAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgfVxuXG4gICAgICAgICAgY2FzZSAnUHJvZ3Jlc3MnOlxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICBzd2l0Y2ggKGNvbnRlbnRUeXBlKSB7XG4gICAgICAgICAgICAgICAgY2FzZSAndGV4dC94bWwnOiB7XG4gICAgICAgICAgICAgICAgICBjb25zdCBwcm9ncmVzc0RhdGEgPSBwYXlsb2FkU3RyZWFtLnJlYWQocGF5TG9hZExlbmd0aClcbiAgICAgICAgICAgICAgICAgIHNlbGVjdFJlc3VsdHMuc2V0UHJvZ3Jlc3MocHJvZ3Jlc3NEYXRhLnRvU3RyaW5nKCkpXG4gICAgICAgICAgICAgICAgICBicmVha1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBkZWZhdWx0OiB7XG4gICAgICAgICAgICAgICAgICBjb25zdCBlcnJvck1lc3NhZ2UgPSBgVW5leHBlY3RlZCBjb250ZW50LXR5cGUgJHtjb250ZW50VHlwZX0gc2VudCBmb3IgZXZlbnQtdHlwZSBQcm9ncmVzc2BcbiAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihlcnJvck1lc3NhZ2UpXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBicmVha1xuICAgICAgICAgIGNhc2UgJ1N0YXRzJzpcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgc3dpdGNoIChjb250ZW50VHlwZSkge1xuICAgICAgICAgICAgICAgIGNhc2UgJ3RleHQveG1sJzoge1xuICAgICAgICAgICAgICAgICAgY29uc3Qgc3RhdHNEYXRhID0gcGF5bG9hZFN0cmVhbS5yZWFkKHBheUxvYWRMZW5ndGgpXG4gICAgICAgICAgICAgICAgICBzZWxlY3RSZXN1bHRzLnNldFN0YXRzKHN0YXRzRGF0YS50b1N0cmluZygpKVxuICAgICAgICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZGVmYXVsdDoge1xuICAgICAgICAgICAgICAgICAgY29uc3QgZXJyb3JNZXNzYWdlID0gYFVuZXhwZWN0ZWQgY29udGVudC10eXBlICR7Y29udGVudFR5cGV9IHNlbnQgZm9yIGV2ZW50LXR5cGUgU3RhdHNgXG4gICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoZXJyb3JNZXNzYWdlKVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICBkZWZhdWx0OiB7XG4gICAgICAgICAgICAvLyBDb250aW51YXRpb24gbWVzc2FnZTogTm90IHN1cmUgaWYgaXQgaXMgc3VwcG9ydGVkLiBkaWQgbm90IGZpbmQgYSByZWZlcmVuY2Ugb3IgYW55IG1lc3NhZ2UgaW4gcmVzcG9uc2UuXG4gICAgICAgICAgICAvLyBJdCBkb2VzIG5vdCBoYXZlIGEgcGF5bG9hZC5cbiAgICAgICAgICAgIGNvbnN0IHdhcm5pbmdNZXNzYWdlID0gYFVuIGltcGxlbWVudGVkIGV2ZW50IGRldGVjdGVkICAke21lc3NhZ2VUeXBlfS5gXG4gICAgICAgICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tY29uc29sZVxuICAgICAgICAgICAgY29uc29sZS53YXJuKHdhcm5pbmdNZXNzYWdlKVxuICAgICAgICAgIH1cbiAgICAgICAgfSAvLyBldmVudFR5cGUgRW5kXG4gICAgICB9IC8vIEV2ZW50IEVuZFxuICAgIH0gLy8gbWVzc2FnZVR5cGUgRW5kXG4gIH0gLy8gVG9wIExldmVsIFN0cmVhbSBFbmRcbn1cbiJdLCJtYXBwaW5ncyI6IkFBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBLE9BQU9BLEtBQUssTUFBTSxjQUFjO0FBQ2hDLFNBQVNDLFNBQVMsUUFBUSxpQkFBaUI7QUFDM0MsT0FBT0MsQ0FBQyxNQUFNLFFBQVE7QUFFdEIsT0FBTyxLQUFLQyxNQUFNLE1BQU0sY0FBYTtBQUNyQyxTQUFTQyxhQUFhLFFBQVEsZUFBYztBQUM1QyxTQUFTQyxRQUFRLEVBQUVDLFFBQVEsRUFBRUMsY0FBYyxFQUFFQyxZQUFZLEVBQUVDLGlCQUFpQixF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