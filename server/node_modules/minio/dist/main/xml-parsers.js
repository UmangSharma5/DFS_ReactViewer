"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.parseBucketEncryptionConfig = parseBucketEncryptionConfig;
exports.parseBucketNotification = parseBucketNotification;
exports.parseBucketRegion = parseBucketRegion;
exports.parseBucketVersioningConfig = parseBucketVersioningConfig;
exports.parseCompleteMultipart = parseCompleteMultipart;
exports.parseCopyObject = parseCopyObject;
exports.parseError = parseError;
exports.parseInitiateMultipart = parseInitiateMultipart;
exports.parseLifecycleConfig = parseLifecycleConfig;
exports.parseListBucket = parseListBucket;
exports.parseListMultipart = parseListMultipart;
exports.parseListObjects = parseListObjects;
exports.parseListObjectsV2 = parseListObjectsV2;
exports.parseListObjectsV2WithMetadata = parseListObjectsV2WithMetadata;
exports.parseListParts = parseListParts;
exports.parseObjectLegalHoldConfig = parseObjectLegalHoldConfig;
exports.parseObjectLockConfig = parseObjectLockConfig;
exports.parseObjectRetentionConfig = parseObjectRetentionConfig;
exports.parseReplicationConfig = parseReplicationConfig;
exports.parseSelectObjectContentResponse = parseSelectObjectContentResponse;
exports.parseTagging = parseTagging;
exports.removeObjectsParser = removeObjectsParser;
exports.uploadPartParser = uploadPartParser;
var _bufferCrc = require("buffer-crc32");
var _fastXmlParser = require("fast-xml-parser");
var _lodash = require("lodash");
var errors = _interopRequireWildcard(require("./errors.js"), true);
var _helpers = require("./helpers.js");
var _helper = require("./internal/helper.js");
var _type = require("./internal/type.js");
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

// Parse XML and return information as Javascript types
const fxp = new _fastXmlParser.XMLParser();

// parse error XML response
function parseError(xml, headerInfo) {
  var xmlErr = {};
  var xmlObj = fxp.parse(xml);
  if (xmlObj.Error) {
    xmlErr = xmlObj.Error;
  }
  var e = new errors.S3Error();
  _lodash.each(xmlErr, (value, key) => {
    e[key.toLowerCase()] = value;
  });
  _lodash.each(headerInfo, (value, key) => {
    e[key] = value;
  });
  return e;
}

// parse XML response for copy object
function parseCopyObject(xml) {
  var result = {
    etag: '',
    lastModified: ''
  };
  var xmlobj = (0, _helper.parseXml)(xml);
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
function parseListMultipart(xml) {
  var result = {
    uploads: [],
    prefixes: [],
    isTruncated: false
  };
  var xmlobj = (0, _helper.parseXml)(xml);
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
    (0, _helper.toArray)(xmlobj.CommonPrefixes).forEach(prefix => {
      result.prefixes.push({
        prefix: (0, _helper.sanitizeObjectKey)((0, _helper.toArray)(prefix.Prefix)[0])
      });
    });
  }
  if (xmlobj.Upload) {
    (0, _helper.toArray)(xmlobj.Upload).forEach(upload => {
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
function parseListBucket(xml) {
  var result = [];
  var xmlobj = (0, _helper.parseXml)(xml);
  if (!xmlobj.ListAllMyBucketsResult) {
    throw new errors.InvalidXMLError('Missing tag: "ListAllMyBucketsResult"');
  }
  xmlobj = xmlobj.ListAllMyBucketsResult;
  if (xmlobj.Buckets) {
    if (xmlobj.Buckets.Bucket) {
      (0, _helper.toArray)(xmlobj.Buckets.Bucket).forEach(bucket => {
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
function parseBucketNotification(xml) {
  var result = {
    TopicConfiguration: [],
    QueueConfiguration: [],
    CloudFunctionConfiguration: []
  };
  // Parse the events list
  var genEvents = function (events) {
    var result = [];
    if (events) {
      (0, _helper.toArray)(events).forEach(s3event => {
        result.push(s3event);
      });
    }
    return result;
  };
  // Parse all filter rules
  var genFilterRules = function (filters) {
    var result = [];
    if (filters) {
      filters = (0, _helper.toArray)(filters);
      if (filters[0].S3Key) {
        filters[0].S3Key = (0, _helper.toArray)(filters[0].S3Key);
        if (filters[0].S3Key[0].FilterRule) {
          (0, _helper.toArray)(filters[0].S3Key[0].FilterRule).forEach(rule => {
            var Name = (0, _helper.toArray)(rule.Name)[0];
            var Value = (0, _helper.toArray)(rule.Value)[0];
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
  var xmlobj = (0, _helper.parseXml)(xml);
  xmlobj = xmlobj.NotificationConfiguration;

  // Parse all topic configurations in the xml
  if (xmlobj.TopicConfiguration) {
    (0, _helper.toArray)(xmlobj.TopicConfiguration).forEach(config => {
      var Id = (0, _helper.toArray)(config.Id)[0];
      var Topic = (0, _helper.toArray)(config.Topic)[0];
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
    (0, _helper.toArray)(xmlobj.QueueConfiguration).forEach(config => {
      var Id = (0, _helper.toArray)(config.Id)[0];
      var Queue = (0, _helper.toArray)(config.Queue)[0];
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
    (0, _helper.toArray)(xmlobj.CloudFunctionConfiguration).forEach(config => {
      var Id = (0, _helper.toArray)(config.Id)[0];
      var CloudFunction = (0, _helper.toArray)(config.CloudFunction)[0];
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
function parseBucketRegion(xml) {
  // return region information
  return (0, _helper.parseXml)(xml).LocationConstraint;
}

// parse XML response for list parts of an in progress multipart upload
function parseListParts(xml) {
  var xmlobj = (0, _helper.parseXml)(xml);
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
    result.marker = +(0, _helper.toArray)(xmlobj.NextPartNumberMarker)[0];
  }
  if (xmlobj.Part) {
    (0, _helper.toArray)(xmlobj.Part).forEach(p => {
      var part = +(0, _helper.toArray)(p.PartNumber)[0];
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
function parseInitiateMultipart(xml) {
  var xmlobj = (0, _helper.parseXml)(xml);
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
function parseCompleteMultipart(xml) {
  var xmlobj = (0, _helper.parseXml)(xml).CompleteMultipartUploadResult;
  if (xmlobj.Location) {
    var location = (0, _helper.toArray)(xmlobj.Location)[0];
    var bucket = (0, _helper.toArray)(xmlobj.Bucket)[0];
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
    var errCode = (0, _helper.toArray)(xmlobj.Code)[0];
    var errMessage = (0, _helper.toArray)(xmlobj.Message)[0];
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
  if (!(0, _helper.isObject)(opts)) {
    opts = {};
  }
  const name = (0, _helper.sanitizeObjectKey)((0, _helper.toArray)(Key)[0]);
  const lastModified = new Date((0, _helper.toArray)(LastModified)[0]);
  const etag = (0, _helper.sanitizeETag)((0, _helper.toArray)(ETag)[0]);
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
function parseListObjects(xml) {
  var result = {
    objects: [],
    isTruncated: false
  };
  let isTruncated = false;
  let nextMarker, nextVersionKeyMarker;
  const xmlobj = (0, _helper.parseXml)(xml);
  const parseCommonPrefixesEntity = responseEntity => {
    if (responseEntity) {
      (0, _helper.toArray)(responseEntity).forEach(commonPrefix => {
        result.objects.push({
          prefix: (0, _helper.sanitizeObjectKey)((0, _helper.toArray)(commonPrefix.Prefix)[0]),
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
      (0, _helper.toArray)(listBucketResult.Contents).forEach(content => {
        const name = (0, _helper.sanitizeObjectKey)((0, _helper.toArray)(content.Key)[0]);
        const lastModified = new Date((0, _helper.toArray)(content.LastModified)[0]);
        const etag = (0, _helper.sanitizeETag)((0, _helper.toArray)(content.ETag)[0]);
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
      (0, _helper.toArray)(listVersionsResult.Version).forEach(content => {
        result.objects.push(formatObjInfo(content));
      });
    }
    if (listVersionsResult.DeleteMarker) {
      (0, _helper.toArray)(listVersionsResult.DeleteMarker).forEach(content => {
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
function parseListObjectsV2(xml) {
  var result = {
    objects: [],
    isTruncated: false
  };
  var xmlobj = (0, _helper.parseXml)(xml);
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
    (0, _helper.toArray)(xmlobj.Contents).forEach(content => {
      var name = (0, _helper.sanitizeObjectKey)((0, _helper.toArray)(content.Key)[0]);
      var lastModified = new Date(content.LastModified);
      var etag = (0, _helper.sanitizeETag)(content.ETag);
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
    (0, _helper.toArray)(xmlobj.CommonPrefixes).forEach(commonPrefix => {
      result.objects.push({
        prefix: (0, _helper.sanitizeObjectKey)((0, _helper.toArray)(commonPrefix.Prefix)[0]),
        size: 0
      });
    });
  }
  return result;
}

// parse XML response for list objects v2 with metadata in a bucket
function parseListObjectsV2WithMetadata(xml) {
  var result = {
    objects: [],
    isTruncated: false
  };
  var xmlobj = (0, _helper.parseXml)(xml);
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
    (0, _helper.toArray)(xmlobj.Contents).forEach(content => {
      var name = (0, _helper.sanitizeObjectKey)(content.Key);
      var lastModified = new Date(content.LastModified);
      var etag = (0, _helper.sanitizeETag)(content.ETag);
      var size = content.Size;
      var metadata;
      if (content.UserMetadata != null) {
        metadata = (0, _helper.toArray)(content.UserMetadata)[0];
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
    (0, _helper.toArray)(xmlobj.CommonPrefixes).forEach(commonPrefix => {
      result.objects.push({
        prefix: (0, _helper.sanitizeObjectKey)((0, _helper.toArray)(commonPrefix.Prefix)[0]),
        size: 0
      });
    });
  }
  return result;
}
function parseBucketVersioningConfig(xml) {
  var xmlObj = (0, _helper.parseXml)(xml);
  return xmlObj.VersioningConfiguration;
}
function parseTagging(xml) {
  const xmlObj = (0, _helper.parseXml)(xml);
  let result = [];
  if (xmlObj.Tagging && xmlObj.Tagging.TagSet && xmlObj.Tagging.TagSet.Tag) {
    const tagResult = xmlObj.Tagging.TagSet.Tag;
    // if it is a single tag convert into an array so that the return value is always an array.
    if ((0, _helper.isObject)(tagResult)) {
      result.push(tagResult);
    } else {
      result = tagResult;
    }
  }
  return result;
}
function parseLifecycleConfig(xml) {
  const xmlObj = (0, _helper.parseXml)(xml);
  return xmlObj.LifecycleConfiguration;
}
function parseObjectLockConfig(xml) {
  const xmlObj = (0, _helper.parseXml)(xml);
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
        lockConfigResult.unit = _type.RETENTION_VALIDITY_UNITS.YEARS;
      } else {
        lockConfigResult.validity = retentionResp.Days;
        lockConfigResult.unit = _type.RETENTION_VALIDITY_UNITS.DAYS;
      }
    }
    return lockConfigResult;
  }
}
function parseObjectRetentionConfig(xml) {
  const xmlObj = (0, _helper.parseXml)(xml);
  const retentionConfig = xmlObj.Retention;
  return {
    mode: retentionConfig.Mode,
    retainUntilDate: retentionConfig.RetainUntilDate
  };
}
function parseBucketEncryptionConfig(xml) {
  let encConfig = (0, _helper.parseXml)(xml);
  return encConfig;
}
function parseReplicationConfig(xml) {
  const xmlObj = (0, _helper.parseXml)(xml);
  const replicationConfig = {
    ReplicationConfiguration: {
      role: xmlObj.ReplicationConfiguration.Role,
      rules: (0, _helper.toArray)(xmlObj.ReplicationConfiguration.Rule)
    }
  };
  return replicationConfig;
}
function parseObjectLegalHoldConfig(xml) {
  const xmlObj = (0, _helper.parseXml)(xml);
  return xmlObj.LegalHold;
}
function uploadPartParser(xml) {
  const xmlObj = (0, _helper.parseXml)(xml);
  const respEl = xmlObj.CopyPartResult;
  return respEl;
}
function removeObjectsParser(xml) {
  const xmlObj = (0, _helper.parseXml)(xml);
  if (xmlObj.DeleteResult && xmlObj.DeleteResult.Error) {
    // return errors as array always. as the response is object in case of single object passed in removeObjects
    return (0, _helper.toArray)(xmlObj.DeleteResult.Error);
  }
  return [];
}
function parseSelectObjectContentResponse(res) {
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
  const selectResults = new _helpers.SelectResults({}); // will be returned

  const responseStream = (0, _helper.readableStream)(res); // convert byte array to a readable responseStream
  while (responseStream._readableState.length) {
    // Top level responseStream read tracker.
    let msgCrcAccumulator; // accumulate from start of the message till the message crc start.

    const totalByteLengthBuffer = Buffer.from(responseStream.read(4));
    msgCrcAccumulator = _bufferCrc(totalByteLengthBuffer);
    const headerBytesBuffer = Buffer.from(responseStream.read(4));
    msgCrcAccumulator = _bufferCrc(headerBytesBuffer, msgCrcAccumulator);
    const calculatedPreludeCrc = msgCrcAccumulator.readInt32BE(); // use it to check if any CRC mismatch in header itself.

    const preludeCrcBuffer = Buffer.from(responseStream.read(4)); // read 4 bytes    i.e 4+4 =8 + 4 = 12 ( prelude + prelude crc)
    msgCrcAccumulator = _bufferCrc(preludeCrcBuffer, msgCrcAccumulator);
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
      msgCrcAccumulator = _bufferCrc(headerBytes, msgCrcAccumulator);
      const headerReaderStream = (0, _helper.readableStream)(headerBytes);
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
      msgCrcAccumulator = _bufferCrc(payLoadBuffer, msgCrcAccumulator);
      // read the checksum early and detect any mismatch so we can avoid unnecessary further processing.
      const messageCrcByteValue = Buffer.from(responseStream.read(4)).readInt32BE();
      const calculatedCrc = msgCrcAccumulator.readInt32BE();
      // Handle message CRC Error
      if (messageCrcByteValue !== calculatedCrc) {
        throw new Error(`Message Checksum Mismatch, Message CRC of ${messageCrcByteValue} does not equal expected CRC of ${calculatedCrc}`);
      }
      payloadStream = (0, _helper.readableStream)(payLoadBuffer);
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfYnVmZmVyQ3JjIiwicmVxdWlyZSIsIl9mYXN0WG1sUGFyc2VyIiwiX2xvZGFzaCIsImVycm9ycyIsIl9pbnRlcm9wUmVxdWlyZVdpbGRjYXJkIiwiX2hlbHBlcnMiLCJfaGVscGVyIiwiX3R5cGUiLCJfZ2V0UmVxdWlyZVdpbGRjYXJkQ2FjaGUiLCJub2RlSW50ZXJvcCIsIldlYWtNYXAiLCJjYWNoZUJhYmVsSW50ZXJvcCIsImNhY2hlTm9kZUludGVyb3AiLCJvYmoiLCJfX2VzTW9kdWxlIiwiZGVmYXVsdCIsImNhY2hlIiwiaGFzIiwiZ2V0IiwibmV3T2JqIiwiaGFzUHJvcGVydHlEZXNjcmlwdG9yIiwiT2JqZWN0IiwiZGVmaW5lUHJvcGVydHkiLCJnZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3IiLCJrZXkiLCJwcm90b3R5cGUiLCJoYXNPd25Qcm9wZXJ0eSIsImNhbGwiLCJkZXNjIiwic2V0IiwiZnhwIiwiWE1MUGFyc2VyIiwicGFyc2VFcnJvciIsInhtbCIsImhlYWRlckluZm8iLCJ4bWxFcnIiLCJ4bWxPYmoiLCJwYXJzZSIsIkVycm9yIiwiZSIsIlMzRXJyb3IiLCJfIiwiZWFjaCIsInZhbHVlIiwidG9Mb3dlckNhc2UiLCJwYXJzZUNvcHlPYmplY3QiLCJyZXN1bHQiLCJldGFnIiwibGFzdE1vZGlmaWVkIiwieG1sb2JqIiwicGFyc2VYbWwiLCJDb3B5T2JqZWN0UmVzdWx0IiwiSW52YWxpZFhNTEVycm9yIiwiRVRhZyIsInJlcGxhY2UiLCJMYXN0TW9kaWZpZWQiLCJEYXRlIiwicGFyc2VMaXN0TXVsdGlwYXJ0IiwidXBsb2FkcyIsInByZWZpeGVzIiwiaXNUcnVuY2F0ZWQiLCJMaXN0TXVsdGlwYXJ0VXBsb2Fkc1Jlc3VsdCIsIklzVHJ1bmNhdGVkIiwiTmV4dEtleU1hcmtlciIsIm5leHRLZXlNYXJrZXIiLCJOZXh0VXBsb2FkSWRNYXJrZXIiLCJuZXh0VXBsb2FkSWRNYXJrZXIiLCJDb21tb25QcmVmaXhlcyIsInRvQXJyYXkiLCJmb3JFYWNoIiwicHJlZml4IiwicHVzaCIsInNhbml0aXplT2JqZWN0S2V5IiwiUHJlZml4IiwiVXBsb2FkIiwidXBsb2FkIiwiS2V5IiwidXBsb2FkSWQiLCJVcGxvYWRJZCIsImluaXRpYXRvciIsImlkIiwiSW5pdGlhdG9yIiwiSUQiLCJkaXNwbGF5TmFtZSIsIkRpc3BsYXlOYW1lIiwib3duZXIiLCJPd25lciIsInN0b3JhZ2VDbGFzcyIsIlN0b3JhZ2VDbGFzcyIsImluaXRpYXRlZCIsIkluaXRpYXRlZCIsInBhcnNlTGlzdEJ1Y2tldCIsIkxpc3RBbGxNeUJ1Y2tldHNSZXN1bHQiLCJCdWNrZXRzIiwiQnVja2V0IiwiYnVja2V0IiwibmFtZSIsIk5hbWUiLCJjcmVhdGlvbkRhdGUiLCJDcmVhdGlvbkRhdGUiLCJwYXJzZUJ1Y2tldE5vdGlmaWNhdGlvbiIsIlRvcGljQ29uZmlndXJhdGlvbiIsIlF1ZXVlQ29uZmlndXJhdGlvbiIsIkNsb3VkRnVuY3Rpb25Db25maWd1cmF0aW9uIiwiZ2VuRXZlbnRzIiwiZXZlbnRzIiwiczNldmVudCIsImdlbkZpbHRlclJ1bGVzIiwiZmlsdGVycyIsIlMzS2V5IiwiRmlsdGVyUnVsZSIsInJ1bGUiLCJWYWx1ZSIsIk5vdGlmaWNhdGlvbkNvbmZpZ3VyYXRpb24iLCJjb25maWciLCJJZCIsIlRvcGljIiwiRXZlbnQiLCJGaWx0ZXIiLCJRdWV1ZSIsIkNsb3VkRnVuY3Rpb24iLCJwYXJzZUJ1Y2tldFJlZ2lvbiIsIkxvY2F0aW9uQ29uc3RyYWludCIsInBhcnNlTGlzdFBhcnRzIiwicGFydHMiLCJtYXJrZXIiLCJ1bmRlZmluZWQiLCJMaXN0UGFydHNSZXN1bHQiLCJOZXh0UGFydE51bWJlck1hcmtlciIsIlBhcnQiLCJwIiwicGFydCIsIlBhcnROdW1iZXIiLCJwYXJzZUluaXRpYXRlTXVsdGlwYXJ0IiwiSW5pdGlhdGVNdWx0aXBhcnRVcGxvYWRSZXN1bHQiLCJwYXJzZUNvbXBsZXRlTXVsdGlwYXJ0IiwiQ29tcGxldGVNdWx0aXBhcnRVcGxvYWRSZXN1bHQiLCJMb2NhdGlvbiIsImxvY2F0aW9uIiwiQ29kZSIsIk1lc3NhZ2UiLCJlcnJDb2RlIiwiZXJyTWVzc2FnZSIsImZvcm1hdE9iakluZm8iLCJjb250ZW50Iiwib3B0cyIsIlNpemUiLCJWZXJzaW9uSWQiLCJJc0xhdGVzdCIsImlzT2JqZWN0Iiwic2FuaXRpemVFVGFnIiwic2l6ZSIsInZlcnNpb25JZCIsImlzTGF0ZXN0IiwiaXNEZWxldGVNYXJrZXIiLCJJc0RlbGV0ZU1hcmtlciIsInBhcnNlTGlzdE9iamVjdHMiLCJvYmplY3RzIiwibmV4dE1hcmtlciIsIm5leHRWZXJzaW9uS2V5TWFya2VyIiwicGFyc2VDb21tb25QcmVmaXhlc0VudGl0eSIsInJlc3BvbnNlRW50aXR5IiwiY29tbW9uUHJlZml4IiwibGlzdEJ1Y2tldFJlc3VsdCIsIkxpc3RCdWNrZXRSZXN1bHQiLCJsaXN0VmVyc2lvbnNSZXN1bHQiLCJMaXN0VmVyc2lvbnNSZXN1bHQiLCJDb250ZW50cyIsIk5leHRNYXJrZXIiLCJWZXJzaW9uIiwiRGVsZXRlTWFya2VyIiwiTmV4dFZlcnNpb25JZE1hcmtlciIsInZlcnNpb25JZE1hcmtlciIsInBhcnNlTGlzdE9iamVjdHNWMiIsIk5leHRDb250aW51YXRpb25Ub2tlbiIsIm5leHRDb250aW51YXRpb25Ub2tlbiIsInBhcnNlTGlzdE9iamVjdHNWMldpdGhNZXRhZGF0YSIsIm1ldGFkYXRhIiwiVXNlck1ldGFkYXRhIiwicGFyc2VCdWNrZXRWZXJzaW9uaW5nQ29uZmlnIiwiVmVyc2lvbmluZ0NvbmZpZ3VyYXRpb24iLCJwYXJzZVRhZ2dpbmciLCJUYWdnaW5nIiwiVGFnU2V0IiwiVGFnIiwidGFnUmVzdWx0IiwicGFyc2VMaWZlY3ljbGVDb25maWciLCJMaWZlY3ljbGVDb25maWd1cmF0aW9uIiwicGFyc2VPYmplY3RMb2NrQ29uZmlnIiwibG9ja0NvbmZpZ1Jlc3VsdCIsIk9iamVjdExvY2tDb25maWd1cmF0aW9uIiwib2JqZWN0TG9ja0VuYWJsZWQiLCJPYmplY3RMb2NrRW5hYmxlZCIsInJldGVudGlvblJlc3AiLCJSdWxlIiwiRGVmYXVsdFJldGVudGlvbiIsIm1vZGUiLCJNb2RlIiwiaXNVbml0WWVhcnMiLCJZZWFycyIsInZhbGlkaXR5IiwidW5pdCIsIlJFVEVOVElPTl9WQUxJRElUWV9VTklUUyIsIllFQVJTIiwiRGF5cyIsIkRBWVMiLCJwYXJzZU9iamVjdFJldGVudGlvbkNvbmZpZyIsInJldGVudGlvbkNvbmZpZyIsIlJldGVudGlvbiIsInJldGFpblVudGlsRGF0ZSIsIlJldGFpblVudGlsRGF0ZSIsInBhcnNlQnVja2V0RW5jcnlwdGlvbkNvbmZpZyIsImVuY0NvbmZpZyIsInBhcnNlUmVwbGljYXRpb25Db25maWciLCJyZXBsaWNhdGlvbkNvbmZpZyIsIlJlcGxpY2F0aW9uQ29uZmlndXJhdGlvbiIsInJvbGUiLCJSb2xlIiwicnVsZXMiLCJwYXJzZU9iamVjdExlZ2FsSG9sZENvbmZpZyIsIkxlZ2FsSG9sZCIsInVwbG9hZFBhcnRQYXJzZXIiLCJyZXNwRWwiLCJDb3B5UGFydFJlc3VsdCIsInJlbW92ZU9iamVjdHNQYXJzZXIiLCJEZWxldGVSZXN1bHQiLCJwYXJzZVNlbGVjdE9iamVjdENvbnRlbnRSZXNwb25zZSIsInJlcyIsImV4dHJhY3RIZWFkZXJUeXBlIiwic3RyZWFtIiwiaGVhZGVyTmFtZUxlbiIsIkJ1ZmZlciIsImZyb20iLCJyZWFkIiwicmVhZFVJbnQ4IiwiaGVhZGVyTmFtZVdpdGhTZXBhcmF0b3IiLCJ0b1N0cmluZyIsInNwbGl0QnlTZXBhcmF0b3IiLCJzcGxpdCIsImhlYWRlck5hbWUiLCJsZW5ndGgiLCJleHRyYWN0SGVhZGVyVmFsdWUiLCJib2R5TGVuIiwicmVhZFVJbnQxNkJFIiwiYm9keU5hbWUiLCJzZWxlY3RSZXN1bHRzIiwiU2VsZWN0UmVzdWx0cyIsInJlc3BvbnNlU3RyZWFtIiwicmVhZGFibGVTdHJlYW0iLCJfcmVhZGFibGVTdGF0ZSIsIm1zZ0NyY0FjY3VtdWxhdG9yIiwidG90YWxCeXRlTGVuZ3RoQnVmZmVyIiwiY3JjMzIiLCJoZWFkZXJCeXRlc0J1ZmZlciIsImNhbGN1bGF0ZWRQcmVsdWRlQ3JjIiwicmVhZEludDMyQkUiLCJwcmVsdWRlQ3JjQnVmZmVyIiwidG90YWxNc2dMZW5ndGgiLCJoZWFkZXJMZW5ndGgiLCJwcmVsdWRlQ3JjQnl0ZVZhbHVlIiwiaGVhZGVycyIsImhlYWRlckJ5dGVzIiwiaGVhZGVyUmVhZGVyU3RyZWFtIiwiaGVhZGVyVHlwZU5hbWUiLCJwYXlsb2FkU3RyZWFtIiwicGF5TG9hZExlbmd0aCIsInBheUxvYWRCdWZmZXIiLCJtZXNzYWdlQ3JjQnl0ZVZhbHVlIiwiY2FsY3VsYXRlZENyYyIsIm1lc3NhZ2VUeXBlIiwiZXJyb3JNZXNzYWdlIiwiY29udGVudFR5cGUiLCJldmVudFR5cGUiLCJzZXRSZXNwb25zZSIsInJlYWREYXRhIiwic2V0UmVjb3JkcyIsInByb2dyZXNzRGF0YSIsInNldFByb2dyZXNzIiwic3RhdHNEYXRhIiwic2V0U3RhdHMiLCJ3YXJuaW5nTWVzc2FnZSIsImNvbnNvbGUiLCJ3YXJuIl0sInNvdXJjZXMiOlsieG1sLXBhcnNlcnMuanMiXSwic291cmNlc0NvbnRlbnQiOlsiLypcbiAqIE1pbklPIEphdmFzY3JpcHQgTGlicmFyeSBmb3IgQW1hem9uIFMzIENvbXBhdGlibGUgQ2xvdWQgU3RvcmFnZSwgKEMpIDIwMTUgTWluSU8sIEluYy5cbiAqXG4gKiBMaWNlbnNlZCB1bmRlciB0aGUgQXBhY2hlIExpY2Vuc2UsIFZlcnNpb24gMi4wICh0aGUgXCJMaWNlbnNlXCIpO1xuICogeW91IG1heSBub3QgdXNlIHRoaXMgZmlsZSBleGNlcHQgaW4gY29tcGxpYW5jZSB3aXRoIHRoZSBMaWNlbnNlLlxuICogWW91IG1heSBvYnRhaW4gYSBjb3B5IG9mIHRoZSBMaWNlbnNlIGF0XG4gKlxuICogICAgIGh0dHA6Ly93d3cuYXBhY2hlLm9yZy9saWNlbnNlcy9MSUNFTlNFLTIuMFxuICpcbiAqIFVubGVzcyByZXF1aXJlZCBieSBhcHBsaWNhYmxlIGxhdyBvciBhZ3JlZWQgdG8gaW4gd3JpdGluZywgc29mdHdhcmVcbiAqIGRpc3RyaWJ1dGVkIHVuZGVyIHRoZSBMaWNlbnNlIGlzIGRpc3RyaWJ1dGVkIG9uIGFuIFwiQVMgSVNcIiBCQVNJUyxcbiAqIFdJVEhPVVQgV0FSUkFOVElFUyBPUiBDT05ESVRJT05TIE9GIEFOWSBLSU5ELCBlaXRoZXIgZXhwcmVzcyBvciBpbXBsaWVkLlxuICogU2VlIHRoZSBMaWNlbnNlIGZvciB0aGUgc3BlY2lmaWMgbGFuZ3VhZ2UgZ292ZXJuaW5nIHBlcm1pc3Npb25zIGFuZFxuICogbGltaXRhdGlvbnMgdW5kZXIgdGhlIExpY2Vuc2UuXG4gKi9cblxuaW1wb3J0IGNyYzMyIGZyb20gJ2J1ZmZlci1jcmMzMidcbmltcG9ydCB7IFhNTFBhcnNlciB9IGZyb20gJ2Zhc3QteG1sLXBhcnNlcidcbmltcG9ydCBfIGZyb20gJ2xvZGFzaCdcblxuaW1wb3J0ICogYXMgZXJyb3JzIGZyb20gJy4vZXJyb3JzLnRzJ1xuaW1wb3J0IHsgU2VsZWN0UmVzdWx0cyB9IGZyb20gJy4vaGVscGVycy50cydcbmltcG9ydCB7IGlzT2JqZWN0LCBwYXJzZVhtbCwgcmVhZGFibGVTdHJlYW0sIHNhbml0aXplRVRhZywgc2FuaXRpemVPYmplY3RLZXksIHRvQXJyYXkgfSBmcm9tICcuL2ludGVybmFsL2hlbHBlci50cydcbmltcG9ydCB7IFJFVEVOVElPTl9WQUxJRElUWV9VTklUUyB9IGZyb20gJy4vaW50ZXJuYWwvdHlwZS50cydcblxuLy8gUGFyc2UgWE1MIGFuZCByZXR1cm4gaW5mb3JtYXRpb24gYXMgSmF2YXNjcmlwdCB0eXBlc1xuY29uc3QgZnhwID0gbmV3IFhNTFBhcnNlcigpXG5cbi8vIHBhcnNlIGVycm9yIFhNTCByZXNwb25zZVxuZXhwb3J0IGZ1bmN0aW9uIHBhcnNlRXJyb3IoeG1sLCBoZWFkZXJJbmZvKSB7XG4gIHZhciB4bWxFcnIgPSB7fVxuICB2YXIgeG1sT2JqID0gZnhwLnBhcnNlKHhtbClcbiAgaWYgKHhtbE9iai5FcnJvcikge1xuICAgIHhtbEVyciA9IHhtbE9iai5FcnJvclxuICB9XG5cbiAgdmFyIGUgPSBuZXcgZXJyb3JzLlMzRXJyb3IoKVxuICBfLmVhY2goeG1sRXJyLCAodmFsdWUsIGtleSkgPT4ge1xuICAgIGVba2V5LnRvTG93ZXJDYXNlKCldID0gdmFsdWVcbiAgfSlcblxuICBfLmVhY2goaGVhZGVySW5mbywgKHZhbHVlLCBrZXkpID0+IHtcbiAgICBlW2tleV0gPSB2YWx1ZVxuICB9KVxuICByZXR1cm4gZVxufVxuXG4vLyBwYXJzZSBYTUwgcmVzcG9uc2UgZm9yIGNvcHkgb2JqZWN0XG5leHBvcnQgZnVuY3Rpb24gcGFyc2VDb3B5T2JqZWN0KHhtbCkge1xuICB2YXIgcmVzdWx0ID0ge1xuICAgIGV0YWc6ICcnLFxuICAgIGxhc3RNb2RpZmllZDogJycsXG4gIH1cblxuICB2YXIgeG1sb2JqID0gcGFyc2VYbWwoeG1sKVxuICBpZiAoIXhtbG9iai5Db3B5T2JqZWN0UmVzdWx0KSB7XG4gICAgdGhyb3cgbmV3IGVycm9ycy5JbnZhbGlkWE1MRXJyb3IoJ01pc3NpbmcgdGFnOiBcIkNvcHlPYmplY3RSZXN1bHRcIicpXG4gIH1cbiAgeG1sb2JqID0geG1sb2JqLkNvcHlPYmplY3RSZXN1bHRcbiAgaWYgKHhtbG9iai5FVGFnKSB7XG4gICAgcmVzdWx0LmV0YWcgPSB4bWxvYmouRVRhZy5yZXBsYWNlKC9eXCIvZywgJycpXG4gICAgICAucmVwbGFjZSgvXCIkL2csICcnKVxuICAgICAgLnJlcGxhY2UoL14mcXVvdDsvZywgJycpXG4gICAgICAucmVwbGFjZSgvJnF1b3Q7JC9nLCAnJylcbiAgICAgIC5yZXBsYWNlKC9eJiMzNDsvZywgJycpXG4gICAgICAucmVwbGFjZSgvJiMzNDskL2csICcnKVxuICB9XG4gIGlmICh4bWxvYmouTGFzdE1vZGlmaWVkKSB7XG4gICAgcmVzdWx0Lmxhc3RNb2RpZmllZCA9IG5ldyBEYXRlKHhtbG9iai5MYXN0TW9kaWZpZWQpXG4gIH1cblxuICByZXR1cm4gcmVzdWx0XG59XG5cbi8vIHBhcnNlIFhNTCByZXNwb25zZSBmb3IgbGlzdGluZyBpbi1wcm9ncmVzcyBtdWx0aXBhcnQgdXBsb2Fkc1xuZXhwb3J0IGZ1bmN0aW9uIHBhcnNlTGlzdE11bHRpcGFydCh4bWwpIHtcbiAgdmFyIHJlc3VsdCA9IHtcbiAgICB1cGxvYWRzOiBbXSxcbiAgICBwcmVmaXhlczogW10sXG4gICAgaXNUcnVuY2F0ZWQ6IGZhbHNlLFxuICB9XG5cbiAgdmFyIHhtbG9iaiA9IHBhcnNlWG1sKHhtbClcblxuICBpZiAoIXhtbG9iai5MaXN0TXVsdGlwYXJ0VXBsb2Fkc1Jlc3VsdCkge1xuICAgIHRocm93IG5ldyBlcnJvcnMuSW52YWxpZFhNTEVycm9yKCdNaXNzaW5nIHRhZzogXCJMaXN0TXVsdGlwYXJ0VXBsb2Fkc1Jlc3VsdFwiJylcbiAgfVxuICB4bWxvYmogPSB4bWxvYmouTGlzdE11bHRpcGFydFVwbG9hZHNSZXN1bHRcbiAgaWYgKHhtbG9iai5Jc1RydW5jYXRlZCkge1xuICAgIHJlc3VsdC5pc1RydW5jYXRlZCA9IHhtbG9iai5Jc1RydW5jYXRlZFxuICB9XG4gIGlmICh4bWxvYmouTmV4dEtleU1hcmtlcikge1xuICAgIHJlc3VsdC5uZXh0S2V5TWFya2VyID0geG1sb2JqLk5leHRLZXlNYXJrZXJcbiAgfVxuICBpZiAoeG1sb2JqLk5leHRVcGxvYWRJZE1hcmtlcikge1xuICAgIHJlc3VsdC5uZXh0VXBsb2FkSWRNYXJrZXIgPSB4bWxvYmoubmV4dFVwbG9hZElkTWFya2VyXG4gIH1cblxuICBpZiAoeG1sb2JqLkNvbW1vblByZWZpeGVzKSB7XG4gICAgdG9BcnJheSh4bWxvYmouQ29tbW9uUHJlZml4ZXMpLmZvckVhY2goKHByZWZpeCkgPT4ge1xuICAgICAgcmVzdWx0LnByZWZpeGVzLnB1c2goeyBwcmVmaXg6IHNhbml0aXplT2JqZWN0S2V5KHRvQXJyYXkocHJlZml4LlByZWZpeClbMF0pIH0pXG4gICAgfSlcbiAgfVxuXG4gIGlmICh4bWxvYmouVXBsb2FkKSB7XG4gICAgdG9BcnJheSh4bWxvYmouVXBsb2FkKS5mb3JFYWNoKCh1cGxvYWQpID0+IHtcbiAgICAgIHZhciBrZXkgPSB1cGxvYWQuS2V5XG4gICAgICB2YXIgdXBsb2FkSWQgPSB1cGxvYWQuVXBsb2FkSWRcbiAgICAgIHZhciBpbml0aWF0b3IgPSB7IGlkOiB1cGxvYWQuSW5pdGlhdG9yLklELCBkaXNwbGF5TmFtZTogdXBsb2FkLkluaXRpYXRvci5EaXNwbGF5TmFtZSB9XG4gICAgICB2YXIgb3duZXIgPSB7IGlkOiB1cGxvYWQuT3duZXIuSUQsIGRpc3BsYXlOYW1lOiB1cGxvYWQuT3duZXIuRGlzcGxheU5hbWUgfVxuICAgICAgdmFyIHN0b3JhZ2VDbGFzcyA9IHVwbG9hZC5TdG9yYWdlQ2xhc3NcbiAgICAgIHZhciBpbml0aWF0ZWQgPSBuZXcgRGF0ZSh1cGxvYWQuSW5pdGlhdGVkKVxuICAgICAgcmVzdWx0LnVwbG9hZHMucHVzaCh7IGtleSwgdXBsb2FkSWQsIGluaXRpYXRvciwgb3duZXIsIHN0b3JhZ2VDbGFzcywgaW5pdGlhdGVkIH0pXG4gICAgfSlcbiAgfVxuICByZXR1cm4gcmVzdWx0XG59XG5cbi8vIHBhcnNlIFhNTCByZXNwb25zZSB0byBsaXN0IGFsbCB0aGUgb3duZWQgYnVja2V0c1xuZXhwb3J0IGZ1bmN0aW9uIHBhcnNlTGlzdEJ1Y2tldCh4bWwpIHtcbiAgdmFyIHJlc3VsdCA9IFtdXG4gIHZhciB4bWxvYmogPSBwYXJzZVhtbCh4bWwpXG5cbiAgaWYgKCF4bWxvYmouTGlzdEFsbE15QnVja2V0c1Jlc3VsdCkge1xuICAgIHRocm93IG5ldyBlcnJvcnMuSW52YWxpZFhNTEVycm9yKCdNaXNzaW5nIHRhZzogXCJMaXN0QWxsTXlCdWNrZXRzUmVzdWx0XCInKVxuICB9XG4gIHhtbG9iaiA9IHhtbG9iai5MaXN0QWxsTXlCdWNrZXRzUmVzdWx0XG5cbiAgaWYgKHhtbG9iai5CdWNrZXRzKSB7XG4gICAgaWYgKHhtbG9iai5CdWNrZXRzLkJ1Y2tldCkge1xuICAgICAgdG9BcnJheSh4bWxvYmouQnVja2V0cy5CdWNrZXQpLmZvckVhY2goKGJ1Y2tldCkgPT4ge1xuICAgICAgICB2YXIgbmFtZSA9IGJ1Y2tldC5OYW1lXG4gICAgICAgIHZhciBjcmVhdGlvbkRhdGUgPSBuZXcgRGF0ZShidWNrZXQuQ3JlYXRpb25EYXRlKVxuICAgICAgICByZXN1bHQucHVzaCh7IG5hbWUsIGNyZWF0aW9uRGF0ZSB9KVxuICAgICAgfSlcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHJlc3VsdFxufVxuXG4vLyBwYXJzZSBYTUwgcmVzcG9uc2UgZm9yIGJ1Y2tldCBub3RpZmljYXRpb25cbmV4cG9ydCBmdW5jdGlvbiBwYXJzZUJ1Y2tldE5vdGlmaWNhdGlvbih4bWwpIHtcbiAgdmFyIHJlc3VsdCA9IHtcbiAgICBUb3BpY0NvbmZpZ3VyYXRpb246IFtdLFxuICAgIFF1ZXVlQ29uZmlndXJhdGlvbjogW10sXG4gICAgQ2xvdWRGdW5jdGlvbkNvbmZpZ3VyYXRpb246IFtdLFxuICB9XG4gIC8vIFBhcnNlIHRoZSBldmVudHMgbGlzdFxuICB2YXIgZ2VuRXZlbnRzID0gZnVuY3Rpb24gKGV2ZW50cykge1xuICAgIHZhciByZXN1bHQgPSBbXVxuICAgIGlmIChldmVudHMpIHtcbiAgICAgIHRvQXJyYXkoZXZlbnRzKS5mb3JFYWNoKChzM2V2ZW50KSA9PiB7XG4gICAgICAgIHJlc3VsdC5wdXNoKHMzZXZlbnQpXG4gICAgICB9KVxuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0XG4gIH1cbiAgLy8gUGFyc2UgYWxsIGZpbHRlciBydWxlc1xuICB2YXIgZ2VuRmlsdGVyUnVsZXMgPSBmdW5jdGlvbiAoZmlsdGVycykge1xuICAgIHZhciByZXN1bHQgPSBbXVxuICAgIGlmIChmaWx0ZXJzKSB7XG4gICAgICBmaWx0ZXJzID0gdG9BcnJheShmaWx0ZXJzKVxuICAgICAgaWYgKGZpbHRlcnNbMF0uUzNLZXkpIHtcbiAgICAgICAgZmlsdGVyc1swXS5TM0tleSA9IHRvQXJyYXkoZmlsdGVyc1swXS5TM0tleSlcbiAgICAgICAgaWYgKGZpbHRlcnNbMF0uUzNLZXlbMF0uRmlsdGVyUnVsZSkge1xuICAgICAgICAgIHRvQXJyYXkoZmlsdGVyc1swXS5TM0tleVswXS5GaWx0ZXJSdWxlKS5mb3JFYWNoKChydWxlKSA9PiB7XG4gICAgICAgICAgICB2YXIgTmFtZSA9IHRvQXJyYXkocnVsZS5OYW1lKVswXVxuICAgICAgICAgICAgdmFyIFZhbHVlID0gdG9BcnJheShydWxlLlZhbHVlKVswXVxuICAgICAgICAgICAgcmVzdWx0LnB1c2goeyBOYW1lLCBWYWx1ZSB9KVxuICAgICAgICAgIH0pXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdFxuICB9XG5cbiAgdmFyIHhtbG9iaiA9IHBhcnNlWG1sKHhtbClcbiAgeG1sb2JqID0geG1sb2JqLk5vdGlmaWNhdGlvbkNvbmZpZ3VyYXRpb25cblxuICAvLyBQYXJzZSBhbGwgdG9waWMgY29uZmlndXJhdGlvbnMgaW4gdGhlIHhtbFxuICBpZiAoeG1sb2JqLlRvcGljQ29uZmlndXJhdGlvbikge1xuICAgIHRvQXJyYXkoeG1sb2JqLlRvcGljQ29uZmlndXJhdGlvbikuZm9yRWFjaCgoY29uZmlnKSA9PiB7XG4gICAgICB2YXIgSWQgPSB0b0FycmF5KGNvbmZpZy5JZClbMF1cbiAgICAgIHZhciBUb3BpYyA9IHRvQXJyYXkoY29uZmlnLlRvcGljKVswXVxuICAgICAgdmFyIEV2ZW50ID0gZ2VuRXZlbnRzKGNvbmZpZy5FdmVudClcbiAgICAgIHZhciBGaWx0ZXIgPSBnZW5GaWx0ZXJSdWxlcyhjb25maWcuRmlsdGVyKVxuICAgICAgcmVzdWx0LlRvcGljQ29uZmlndXJhdGlvbi5wdXNoKHsgSWQsIFRvcGljLCBFdmVudCwgRmlsdGVyIH0pXG4gICAgfSlcbiAgfVxuICAvLyBQYXJzZSBhbGwgdG9waWMgY29uZmlndXJhdGlvbnMgaW4gdGhlIHhtbFxuICBpZiAoeG1sb2JqLlF1ZXVlQ29uZmlndXJhdGlvbikge1xuICAgIHRvQXJyYXkoeG1sb2JqLlF1ZXVlQ29uZmlndXJhdGlvbikuZm9yRWFjaCgoY29uZmlnKSA9PiB7XG4gICAgICB2YXIgSWQgPSB0b0FycmF5KGNvbmZpZy5JZClbMF1cbiAgICAgIHZhciBRdWV1ZSA9IHRvQXJyYXkoY29uZmlnLlF1ZXVlKVswXVxuICAgICAgdmFyIEV2ZW50ID0gZ2VuRXZlbnRzKGNvbmZpZy5FdmVudClcbiAgICAgIHZhciBGaWx0ZXIgPSBnZW5GaWx0ZXJSdWxlcyhjb25maWcuRmlsdGVyKVxuICAgICAgcmVzdWx0LlF1ZXVlQ29uZmlndXJhdGlvbi5wdXNoKHsgSWQsIFF1ZXVlLCBFdmVudCwgRmlsdGVyIH0pXG4gICAgfSlcbiAgfVxuICAvLyBQYXJzZSBhbGwgUXVldWVDb25maWd1cmF0aW9uIGFycmF5c1xuICBpZiAoeG1sb2JqLkNsb3VkRnVuY3Rpb25Db25maWd1cmF0aW9uKSB7XG4gICAgdG9BcnJheSh4bWxvYmouQ2xvdWRGdW5jdGlvbkNvbmZpZ3VyYXRpb24pLmZvckVhY2goKGNvbmZpZykgPT4ge1xuICAgICAgdmFyIElkID0gdG9BcnJheShjb25maWcuSWQpWzBdXG4gICAgICB2YXIgQ2xvdWRGdW5jdGlvbiA9IHRvQXJyYXkoY29uZmlnLkNsb3VkRnVuY3Rpb24pWzBdXG4gICAgICB2YXIgRXZlbnQgPSBnZW5FdmVudHMoY29uZmlnLkV2ZW50KVxuICAgICAgdmFyIEZpbHRlciA9IGdlbkZpbHRlclJ1bGVzKGNvbmZpZy5GaWx0ZXIpXG4gICAgICByZXN1bHQuQ2xvdWRGdW5jdGlvbkNvbmZpZ3VyYXRpb24ucHVzaCh7IElkLCBDbG91ZEZ1bmN0aW9uLCBFdmVudCwgRmlsdGVyIH0pXG4gICAgfSlcbiAgfVxuXG4gIHJldHVybiByZXN1bHRcbn1cblxuLy8gcGFyc2UgWE1MIHJlc3BvbnNlIGZvciBidWNrZXQgcmVnaW9uXG5leHBvcnQgZnVuY3Rpb24gcGFyc2VCdWNrZXRSZWdpb24oeG1sKSB7XG4gIC8vIHJldHVybiByZWdpb24gaW5mb3JtYXRpb25cbiAgcmV0dXJuIHBhcnNlWG1sKHhtbCkuTG9jYXRpb25Db25zdHJhaW50XG59XG5cbi8vIHBhcnNlIFhNTCByZXNwb25zZSBmb3IgbGlzdCBwYXJ0cyBvZiBhbiBpbiBwcm9ncmVzcyBtdWx0aXBhcnQgdXBsb2FkXG5leHBvcnQgZnVuY3Rpb24gcGFyc2VMaXN0UGFydHMoeG1sKSB7XG4gIHZhciB4bWxvYmogPSBwYXJzZVhtbCh4bWwpXG4gIHZhciByZXN1bHQgPSB7XG4gICAgaXNUcnVuY2F0ZWQ6IGZhbHNlLFxuICAgIHBhcnRzOiBbXSxcbiAgICBtYXJrZXI6IHVuZGVmaW5lZCxcbiAgfVxuICBpZiAoIXhtbG9iai5MaXN0UGFydHNSZXN1bHQpIHtcbiAgICB0aHJvdyBuZXcgZXJyb3JzLkludmFsaWRYTUxFcnJvcignTWlzc2luZyB0YWc6IFwiTGlzdFBhcnRzUmVzdWx0XCInKVxuICB9XG4gIHhtbG9iaiA9IHhtbG9iai5MaXN0UGFydHNSZXN1bHRcbiAgaWYgKHhtbG9iai5Jc1RydW5jYXRlZCkge1xuICAgIHJlc3VsdC5pc1RydW5jYXRlZCA9IHhtbG9iai5Jc1RydW5jYXRlZFxuICB9XG4gIGlmICh4bWxvYmouTmV4dFBhcnROdW1iZXJNYXJrZXIpIHtcbiAgICByZXN1bHQubWFya2VyID0gK3RvQXJyYXkoeG1sb2JqLk5leHRQYXJ0TnVtYmVyTWFya2VyKVswXVxuICB9XG4gIGlmICh4bWxvYmouUGFydCkge1xuICAgIHRvQXJyYXkoeG1sb2JqLlBhcnQpLmZvckVhY2goKHApID0+IHtcbiAgICAgIHZhciBwYXJ0ID0gK3RvQXJyYXkocC5QYXJ0TnVtYmVyKVswXVxuICAgICAgdmFyIGxhc3RNb2RpZmllZCA9IG5ldyBEYXRlKHAuTGFzdE1vZGlmaWVkKVxuICAgICAgdmFyIGV0YWcgPSBwLkVUYWcucmVwbGFjZSgvXlwiL2csICcnKVxuICAgICAgICAucmVwbGFjZSgvXCIkL2csICcnKVxuICAgICAgICAucmVwbGFjZSgvXiZxdW90Oy9nLCAnJylcbiAgICAgICAgLnJlcGxhY2UoLyZxdW90OyQvZywgJycpXG4gICAgICAgIC5yZXBsYWNlKC9eJiMzNDsvZywgJycpXG4gICAgICAgIC5yZXBsYWNlKC8mIzM0OyQvZywgJycpXG4gICAgICByZXN1bHQucGFydHMucHVzaCh7IHBhcnQsIGxhc3RNb2RpZmllZCwgZXRhZyB9KVxuICAgIH0pXG4gIH1cbiAgcmV0dXJuIHJlc3VsdFxufVxuXG4vLyBwYXJzZSBYTUwgcmVzcG9uc2Ugd2hlbiBhIG5ldyBtdWx0aXBhcnQgdXBsb2FkIGlzIGluaXRpYXRlZFxuZXhwb3J0IGZ1bmN0aW9uIHBhcnNlSW5pdGlhdGVNdWx0aXBhcnQoeG1sKSB7XG4gIHZhciB4bWxvYmogPSBwYXJzZVhtbCh4bWwpXG5cbiAgaWYgKCF4bWxvYmouSW5pdGlhdGVNdWx0aXBhcnRVcGxvYWRSZXN1bHQpIHtcbiAgICB0aHJvdyBuZXcgZXJyb3JzLkludmFsaWRYTUxFcnJvcignTWlzc2luZyB0YWc6IFwiSW5pdGlhdGVNdWx0aXBhcnRVcGxvYWRSZXN1bHRcIicpXG4gIH1cbiAgeG1sb2JqID0geG1sb2JqLkluaXRpYXRlTXVsdGlwYXJ0VXBsb2FkUmVzdWx0XG5cbiAgaWYgKHhtbG9iai5VcGxvYWRJZCkge1xuICAgIHJldHVybiB4bWxvYmouVXBsb2FkSWRcbiAgfVxuICB0aHJvdyBuZXcgZXJyb3JzLkludmFsaWRYTUxFcnJvcignTWlzc2luZyB0YWc6IFwiVXBsb2FkSWRcIicpXG59XG5cbi8vIHBhcnNlIFhNTCByZXNwb25zZSB3aGVuIGEgbXVsdGlwYXJ0IHVwbG9hZCBpcyBjb21wbGV0ZWRcbmV4cG9ydCBmdW5jdGlvbiBwYXJzZUNvbXBsZXRlTXVsdGlwYXJ0KHhtbCkge1xuICB2YXIgeG1sb2JqID0gcGFyc2VYbWwoeG1sKS5Db21wbGV0ZU11bHRpcGFydFVwbG9hZFJlc3VsdFxuICBpZiAoeG1sb2JqLkxvY2F0aW9uKSB7XG4gICAgdmFyIGxvY2F0aW9uID0gdG9BcnJheSh4bWxvYmouTG9jYXRpb24pWzBdXG4gICAgdmFyIGJ1Y2tldCA9IHRvQXJyYXkoeG1sb2JqLkJ1Y2tldClbMF1cbiAgICB2YXIga2V5ID0geG1sb2JqLktleVxuICAgIHZhciBldGFnID0geG1sb2JqLkVUYWcucmVwbGFjZSgvXlwiL2csICcnKVxuICAgICAgLnJlcGxhY2UoL1wiJC9nLCAnJylcbiAgICAgIC5yZXBsYWNlKC9eJnF1b3Q7L2csICcnKVxuICAgICAgLnJlcGxhY2UoLyZxdW90OyQvZywgJycpXG4gICAgICAucmVwbGFjZSgvXiYjMzQ7L2csICcnKVxuICAgICAgLnJlcGxhY2UoLyYjMzQ7JC9nLCAnJylcblxuICAgIHJldHVybiB7IGxvY2F0aW9uLCBidWNrZXQsIGtleSwgZXRhZyB9XG4gIH1cbiAgLy8gQ29tcGxldGUgTXVsdGlwYXJ0IGNhbiByZXR1cm4gWE1MIEVycm9yIGFmdGVyIGEgMjAwIE9LIHJlc3BvbnNlXG4gIGlmICh4bWxvYmouQ29kZSAmJiB4bWxvYmouTWVzc2FnZSkge1xuICAgIHZhciBlcnJDb2RlID0gdG9BcnJheSh4bWxvYmouQ29kZSlbMF1cbiAgICB2YXIgZXJyTWVzc2FnZSA9IHRvQXJyYXkoeG1sb2JqLk1lc3NhZ2UpWzBdXG4gICAgcmV0dXJuIHsgZXJyQ29kZSwgZXJyTWVzc2FnZSB9XG4gIH1cbn1cblxuY29uc3QgZm9ybWF0T2JqSW5mbyA9IChjb250ZW50LCBvcHRzID0ge30pID0+IHtcbiAgbGV0IHsgS2V5LCBMYXN0TW9kaWZpZWQsIEVUYWcsIFNpemUsIFZlcnNpb25JZCwgSXNMYXRlc3QgfSA9IGNvbnRlbnRcblxuICBpZiAoIWlzT2JqZWN0KG9wdHMpKSB7XG4gICAgb3B0cyA9IHt9XG4gIH1cblxuICBjb25zdCBuYW1lID0gc2FuaXRpemVPYmplY3RLZXkodG9BcnJheShLZXkpWzBdKVxuICBjb25zdCBsYXN0TW9kaWZpZWQgPSBuZXcgRGF0ZSh0b0FycmF5KExhc3RNb2RpZmllZClbMF0pXG4gIGNvbnN0IGV0YWcgPSBzYW5pdGl6ZUVUYWcodG9BcnJheShFVGFnKVswXSlcblxuICByZXR1cm4ge1xuICAgIG5hbWUsXG4gICAgbGFzdE1vZGlmaWVkLFxuICAgIGV0YWcsXG4gICAgc2l6ZTogU2l6ZSxcbiAgICB2ZXJzaW9uSWQ6IFZlcnNpb25JZCxcbiAgICBpc0xhdGVzdDogSXNMYXRlc3QsXG4gICAgaXNEZWxldGVNYXJrZXI6IG9wdHMuSXNEZWxldGVNYXJrZXIgPyBvcHRzLklzRGVsZXRlTWFya2VyIDogZmFsc2UsXG4gIH1cbn1cblxuLy8gcGFyc2UgWE1MIHJlc3BvbnNlIGZvciBsaXN0IG9iamVjdHMgaW4gYSBidWNrZXRcbmV4cG9ydCBmdW5jdGlvbiBwYXJzZUxpc3RPYmplY3RzKHhtbCkge1xuICB2YXIgcmVzdWx0ID0ge1xuICAgIG9iamVjdHM6IFtdLFxuICAgIGlzVHJ1bmNhdGVkOiBmYWxzZSxcbiAgfVxuICBsZXQgaXNUcnVuY2F0ZWQgPSBmYWxzZVxuICBsZXQgbmV4dE1hcmtlciwgbmV4dFZlcnNpb25LZXlNYXJrZXJcbiAgY29uc3QgeG1sb2JqID0gcGFyc2VYbWwoeG1sKVxuXG4gIGNvbnN0IHBhcnNlQ29tbW9uUHJlZml4ZXNFbnRpdHkgPSAocmVzcG9uc2VFbnRpdHkpID0+IHtcbiAgICBpZiAocmVzcG9uc2VFbnRpdHkpIHtcbiAgICAgIHRvQXJyYXkocmVzcG9uc2VFbnRpdHkpLmZvckVhY2goKGNvbW1vblByZWZpeCkgPT4ge1xuICAgICAgICByZXN1bHQub2JqZWN0cy5wdXNoKHsgcHJlZml4OiBzYW5pdGl6ZU9iamVjdEtleSh0b0FycmF5KGNvbW1vblByZWZpeC5QcmVmaXgpWzBdKSwgc2l6ZTogMCB9KVxuICAgICAgfSlcbiAgICB9XG4gIH1cblxuICBjb25zdCBsaXN0QnVja2V0UmVzdWx0ID0geG1sb2JqLkxpc3RCdWNrZXRSZXN1bHRcbiAgY29uc3QgbGlzdFZlcnNpb25zUmVzdWx0ID0geG1sb2JqLkxpc3RWZXJzaW9uc1Jlc3VsdFxuXG4gIGlmIChsaXN0QnVja2V0UmVzdWx0KSB7XG4gICAgaWYgKGxpc3RCdWNrZXRSZXN1bHQuSXNUcnVuY2F0ZWQpIHtcbiAgICAgIGlzVHJ1bmNhdGVkID0gbGlzdEJ1Y2tldFJlc3VsdC5Jc1RydW5jYXRlZFxuICAgIH1cbiAgICBpZiAobGlzdEJ1Y2tldFJlc3VsdC5Db250ZW50cykge1xuICAgICAgdG9BcnJheShsaXN0QnVja2V0UmVzdWx0LkNvbnRlbnRzKS5mb3JFYWNoKChjb250ZW50KSA9PiB7XG4gICAgICAgIGNvbnN0IG5hbWUgPSBzYW5pdGl6ZU9iamVjdEtleSh0b0FycmF5KGNvbnRlbnQuS2V5KVswXSlcbiAgICAgICAgY29uc3QgbGFzdE1vZGlmaWVkID0gbmV3IERhdGUodG9BcnJheShjb250ZW50Lkxhc3RNb2RpZmllZClbMF0pXG4gICAgICAgIGNvbnN0IGV0YWcgPSBzYW5pdGl6ZUVUYWcodG9BcnJheShjb250ZW50LkVUYWcpWzBdKVxuICAgICAgICBjb25zdCBzaXplID0gY29udGVudC5TaXplXG4gICAgICAgIHJlc3VsdC5vYmplY3RzLnB1c2goeyBuYW1lLCBsYXN0TW9kaWZpZWQsIGV0YWcsIHNpemUgfSlcbiAgICAgIH0pXG4gICAgfVxuXG4gICAgaWYgKGxpc3RCdWNrZXRSZXN1bHQuTmV4dE1hcmtlcikge1xuICAgICAgbmV4dE1hcmtlciA9IGxpc3RCdWNrZXRSZXN1bHQuTmV4dE1hcmtlclxuICAgIH1cbiAgICBwYXJzZUNvbW1vblByZWZpeGVzRW50aXR5KGxpc3RCdWNrZXRSZXN1bHQuQ29tbW9uUHJlZml4ZXMpXG4gIH1cblxuICBpZiAobGlzdFZlcnNpb25zUmVzdWx0KSB7XG4gICAgaWYgKGxpc3RWZXJzaW9uc1Jlc3VsdC5Jc1RydW5jYXRlZCkge1xuICAgICAgaXNUcnVuY2F0ZWQgPSBsaXN0VmVyc2lvbnNSZXN1bHQuSXNUcnVuY2F0ZWRcbiAgICB9XG5cbiAgICBpZiAobGlzdFZlcnNpb25zUmVzdWx0LlZlcnNpb24pIHtcbiAgICAgIHRvQXJyYXkobGlzdFZlcnNpb25zUmVzdWx0LlZlcnNpb24pLmZvckVhY2goKGNvbnRlbnQpID0+IHtcbiAgICAgICAgcmVzdWx0Lm9iamVjdHMucHVzaChmb3JtYXRPYmpJbmZvKGNvbnRlbnQpKVxuICAgICAgfSlcbiAgICB9XG4gICAgaWYgKGxpc3RWZXJzaW9uc1Jlc3VsdC5EZWxldGVNYXJrZXIpIHtcbiAgICAgIHRvQXJyYXkobGlzdFZlcnNpb25zUmVzdWx0LkRlbGV0ZU1hcmtlcikuZm9yRWFjaCgoY29udGVudCkgPT4ge1xuICAgICAgICByZXN1bHQub2JqZWN0cy5wdXNoKGZvcm1hdE9iakluZm8oY29udGVudCwgeyBJc0RlbGV0ZU1hcmtlcjogdHJ1ZSB9KSlcbiAgICAgIH0pXG4gICAgfVxuXG4gICAgaWYgKGxpc3RWZXJzaW9uc1Jlc3VsdC5OZXh0S2V5TWFya2VyKSB7XG4gICAgICBuZXh0VmVyc2lvbktleU1hcmtlciA9IGxpc3RWZXJzaW9uc1Jlc3VsdC5OZXh0S2V5TWFya2VyXG4gICAgfVxuICAgIGlmIChsaXN0VmVyc2lvbnNSZXN1bHQuTmV4dFZlcnNpb25JZE1hcmtlcikge1xuICAgICAgcmVzdWx0LnZlcnNpb25JZE1hcmtlciA9IGxpc3RWZXJzaW9uc1Jlc3VsdC5OZXh0VmVyc2lvbklkTWFya2VyXG4gICAgfVxuICAgIHBhcnNlQ29tbW9uUHJlZml4ZXNFbnRpdHkobGlzdFZlcnNpb25zUmVzdWx0LkNvbW1vblByZWZpeGVzKVxuICB9XG5cbiAgcmVzdWx0LmlzVHJ1bmNhdGVkID0gaXNUcnVuY2F0ZWRcbiAgaWYgKGlzVHJ1bmNhdGVkKSB7XG4gICAgcmVzdWx0Lm5leHRNYXJrZXIgPSBuZXh0VmVyc2lvbktleU1hcmtlciB8fCBuZXh0TWFya2VyXG4gIH1cbiAgcmV0dXJuIHJlc3VsdFxufVxuXG4vLyBwYXJzZSBYTUwgcmVzcG9uc2UgZm9yIGxpc3Qgb2JqZWN0cyB2MiBpbiBhIGJ1Y2tldFxuZXhwb3J0IGZ1bmN0aW9uIHBhcnNlTGlzdE9iamVjdHNWMih4bWwpIHtcbiAgdmFyIHJlc3VsdCA9IHtcbiAgICBvYmplY3RzOiBbXSxcbiAgICBpc1RydW5jYXRlZDogZmFsc2UsXG4gIH1cbiAgdmFyIHhtbG9iaiA9IHBhcnNlWG1sKHhtbClcbiAgaWYgKCF4bWxvYmouTGlzdEJ1Y2tldFJlc3VsdCkge1xuICAgIHRocm93IG5ldyBlcnJvcnMuSW52YWxpZFhNTEVycm9yKCdNaXNzaW5nIHRhZzogXCJMaXN0QnVja2V0UmVzdWx0XCInKVxuICB9XG4gIHhtbG9iaiA9IHhtbG9iai5MaXN0QnVja2V0UmVzdWx0XG4gIGlmICh4bWxvYmouSXNUcnVuY2F0ZWQpIHtcbiAgICByZXN1bHQuaXNUcnVuY2F0ZWQgPSB4bWxvYmouSXNUcnVuY2F0ZWRcbiAgfVxuICBpZiAoeG1sb2JqLk5leHRDb250aW51YXRpb25Ub2tlbikge1xuICAgIHJlc3VsdC5uZXh0Q29udGludWF0aW9uVG9rZW4gPSB4bWxvYmouTmV4dENvbnRpbnVhdGlvblRva2VuXG4gIH1cbiAgaWYgKHhtbG9iai5Db250ZW50cykge1xuICAgIHRvQXJyYXkoeG1sb2JqLkNvbnRlbnRzKS5mb3JFYWNoKChjb250ZW50KSA9PiB7XG4gICAgICB2YXIgbmFtZSA9IHNhbml0aXplT2JqZWN0S2V5KHRvQXJyYXkoY29udGVudC5LZXkpWzBdKVxuICAgICAgdmFyIGxhc3RNb2RpZmllZCA9IG5ldyBEYXRlKGNvbnRlbnQuTGFzdE1vZGlmaWVkKVxuICAgICAgdmFyIGV0YWcgPSBzYW5pdGl6ZUVUYWcoY29udGVudC5FVGFnKVxuICAgICAgdmFyIHNpemUgPSBjb250ZW50LlNpemVcbiAgICAgIHJlc3VsdC5vYmplY3RzLnB1c2goeyBuYW1lLCBsYXN0TW9kaWZpZWQsIGV0YWcsIHNpemUgfSlcbiAgICB9KVxuICB9XG4gIGlmICh4bWxvYmouQ29tbW9uUHJlZml4ZXMpIHtcbiAgICB0b0FycmF5KHhtbG9iai5Db21tb25QcmVmaXhlcykuZm9yRWFjaCgoY29tbW9uUHJlZml4KSA9PiB7XG4gICAgICByZXN1bHQub2JqZWN0cy5wdXNoKHsgcHJlZml4OiBzYW5pdGl6ZU9iamVjdEtleSh0b0FycmF5KGNvbW1vblByZWZpeC5QcmVmaXgpWzBdKSwgc2l6ZTogMCB9KVxuICAgIH0pXG4gIH1cbiAgcmV0dXJuIHJlc3VsdFxufVxuXG4vLyBwYXJzZSBYTUwgcmVzcG9uc2UgZm9yIGxpc3Qgb2JqZWN0cyB2MiB3aXRoIG1ldGFkYXRhIGluIGEgYnVja2V0XG5leHBvcnQgZnVuY3Rpb24gcGFyc2VMaXN0T2JqZWN0c1YyV2l0aE1ldGFkYXRhKHhtbCkge1xuICB2YXIgcmVzdWx0ID0ge1xuICAgIG9iamVjdHM6IFtdLFxuICAgIGlzVHJ1bmNhdGVkOiBmYWxzZSxcbiAgfVxuICB2YXIgeG1sb2JqID0gcGFyc2VYbWwoeG1sKVxuICBpZiAoIXhtbG9iai5MaXN0QnVja2V0UmVzdWx0KSB7XG4gICAgdGhyb3cgbmV3IGVycm9ycy5JbnZhbGlkWE1MRXJyb3IoJ01pc3NpbmcgdGFnOiBcIkxpc3RCdWNrZXRSZXN1bHRcIicpXG4gIH1cbiAgeG1sb2JqID0geG1sb2JqLkxpc3RCdWNrZXRSZXN1bHRcbiAgaWYgKHhtbG9iai5Jc1RydW5jYXRlZCkge1xuICAgIHJlc3VsdC5pc1RydW5jYXRlZCA9IHhtbG9iai5Jc1RydW5jYXRlZFxuICB9XG4gIGlmICh4bWxvYmouTmV4dENvbnRpbnVhdGlvblRva2VuKSB7XG4gICAgcmVzdWx0Lm5leHRDb250aW51YXRpb25Ub2tlbiA9IHhtbG9iai5OZXh0Q29udGludWF0aW9uVG9rZW5cbiAgfVxuXG4gIGlmICh4bWxvYmouQ29udGVudHMpIHtcbiAgICB0b0FycmF5KHhtbG9iai5Db250ZW50cykuZm9yRWFjaCgoY29udGVudCkgPT4ge1xuICAgICAgdmFyIG5hbWUgPSBzYW5pdGl6ZU9iamVjdEtleShjb250ZW50LktleSlcbiAgICAgIHZhciBsYXN0TW9kaWZpZWQgPSBuZXcgRGF0ZShjb250ZW50Lkxhc3RNb2RpZmllZClcbiAgICAgIHZhciBldGFnID0gc2FuaXRpemVFVGFnKGNvbnRlbnQuRVRhZylcbiAgICAgIHZhciBzaXplID0gY29udGVudC5TaXplXG4gICAgICB2YXIgbWV0YWRhdGFcbiAgICAgIGlmIChjb250ZW50LlVzZXJNZXRhZGF0YSAhPSBudWxsKSB7XG4gICAgICAgIG1ldGFkYXRhID0gdG9BcnJheShjb250ZW50LlVzZXJNZXRhZGF0YSlbMF1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIG1ldGFkYXRhID0gbnVsbFxuICAgICAgfVxuICAgICAgcmVzdWx0Lm9iamVjdHMucHVzaCh7IG5hbWUsIGxhc3RNb2RpZmllZCwgZXRhZywgc2l6ZSwgbWV0YWRhdGEgfSlcbiAgICB9KVxuICB9XG5cbiAgaWYgKHhtbG9iai5Db21tb25QcmVmaXhlcykge1xuICAgIHRvQXJyYXkoeG1sb2JqLkNvbW1vblByZWZpeGVzKS5mb3JFYWNoKChjb21tb25QcmVmaXgpID0+IHtcbiAgICAgIHJlc3VsdC5vYmplY3RzLnB1c2goeyBwcmVmaXg6IHNhbml0aXplT2JqZWN0S2V5KHRvQXJyYXkoY29tbW9uUHJlZml4LlByZWZpeClbMF0pLCBzaXplOiAwIH0pXG4gICAgfSlcbiAgfVxuICByZXR1cm4gcmVzdWx0XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBwYXJzZUJ1Y2tldFZlcnNpb25pbmdDb25maWcoeG1sKSB7XG4gIHZhciB4bWxPYmogPSBwYXJzZVhtbCh4bWwpXG4gIHJldHVybiB4bWxPYmouVmVyc2lvbmluZ0NvbmZpZ3VyYXRpb25cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHBhcnNlVGFnZ2luZyh4bWwpIHtcbiAgY29uc3QgeG1sT2JqID0gcGFyc2VYbWwoeG1sKVxuICBsZXQgcmVzdWx0ID0gW11cbiAgaWYgKHhtbE9iai5UYWdnaW5nICYmIHhtbE9iai5UYWdnaW5nLlRhZ1NldCAmJiB4bWxPYmouVGFnZ2luZy5UYWdTZXQuVGFnKSB7XG4gICAgY29uc3QgdGFnUmVzdWx0ID0geG1sT2JqLlRhZ2dpbmcuVGFnU2V0LlRhZ1xuICAgIC8vIGlmIGl0IGlzIGEgc2luZ2xlIHRhZyBjb252ZXJ0IGludG8gYW4gYXJyYXkgc28gdGhhdCB0aGUgcmV0dXJuIHZhbHVlIGlzIGFsd2F5cyBhbiBhcnJheS5cbiAgICBpZiAoaXNPYmplY3QodGFnUmVzdWx0KSkge1xuICAgICAgcmVzdWx0LnB1c2godGFnUmVzdWx0KVxuICAgIH0gZWxzZSB7XG4gICAgICByZXN1bHQgPSB0YWdSZXN1bHRcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHJlc3VsdFxufVxuXG5leHBvcnQgZnVuY3Rpb24gcGFyc2VMaWZlY3ljbGVDb25maWcoeG1sKSB7XG4gIGNvbnN0IHhtbE9iaiA9IHBhcnNlWG1sKHhtbClcbiAgcmV0dXJuIHhtbE9iai5MaWZlY3ljbGVDb25maWd1cmF0aW9uXG59XG5cbmV4cG9ydCBmdW5jdGlvbiBwYXJzZU9iamVjdExvY2tDb25maWcoeG1sKSB7XG4gIGNvbnN0IHhtbE9iaiA9IHBhcnNlWG1sKHhtbClcbiAgbGV0IGxvY2tDb25maWdSZXN1bHQgPSB7fVxuICBpZiAoeG1sT2JqLk9iamVjdExvY2tDb25maWd1cmF0aW9uKSB7XG4gICAgbG9ja0NvbmZpZ1Jlc3VsdCA9IHtcbiAgICAgIG9iamVjdExvY2tFbmFibGVkOiB4bWxPYmouT2JqZWN0TG9ja0NvbmZpZ3VyYXRpb24uT2JqZWN0TG9ja0VuYWJsZWQsXG4gICAgfVxuICAgIGxldCByZXRlbnRpb25SZXNwXG4gICAgaWYgKFxuICAgICAgeG1sT2JqLk9iamVjdExvY2tDb25maWd1cmF0aW9uICYmXG4gICAgICB4bWxPYmouT2JqZWN0TG9ja0NvbmZpZ3VyYXRpb24uUnVsZSAmJlxuICAgICAgeG1sT2JqLk9iamVjdExvY2tDb25maWd1cmF0aW9uLlJ1bGUuRGVmYXVsdFJldGVudGlvblxuICAgICkge1xuICAgICAgcmV0ZW50aW9uUmVzcCA9IHhtbE9iai5PYmplY3RMb2NrQ29uZmlndXJhdGlvbi5SdWxlLkRlZmF1bHRSZXRlbnRpb24gfHwge31cbiAgICAgIGxvY2tDb25maWdSZXN1bHQubW9kZSA9IHJldGVudGlvblJlc3AuTW9kZVxuICAgIH1cbiAgICBpZiAocmV0ZW50aW9uUmVzcCkge1xuICAgICAgY29uc3QgaXNVbml0WWVhcnMgPSByZXRlbnRpb25SZXNwLlllYXJzXG4gICAgICBpZiAoaXNVbml0WWVhcnMpIHtcbiAgICAgICAgbG9ja0NvbmZpZ1Jlc3VsdC52YWxpZGl0eSA9IGlzVW5pdFllYXJzXG4gICAgICAgIGxvY2tDb25maWdSZXN1bHQudW5pdCA9IFJFVEVOVElPTl9WQUxJRElUWV9VTklUUy5ZRUFSU1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgbG9ja0NvbmZpZ1Jlc3VsdC52YWxpZGl0eSA9IHJldGVudGlvblJlc3AuRGF5c1xuICAgICAgICBsb2NrQ29uZmlnUmVzdWx0LnVuaXQgPSBSRVRFTlRJT05fVkFMSURJVFlfVU5JVFMuREFZU1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gbG9ja0NvbmZpZ1Jlc3VsdFxuICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBwYXJzZU9iamVjdFJldGVudGlvbkNvbmZpZyh4bWwpIHtcbiAgY29uc3QgeG1sT2JqID0gcGFyc2VYbWwoeG1sKVxuICBjb25zdCByZXRlbnRpb25Db25maWcgPSB4bWxPYmouUmV0ZW50aW9uXG5cbiAgcmV0dXJuIHtcbiAgICBtb2RlOiByZXRlbnRpb25Db25maWcuTW9kZSxcbiAgICByZXRhaW5VbnRpbERhdGU6IHJldGVudGlvbkNvbmZpZy5SZXRhaW5VbnRpbERhdGUsXG4gIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHBhcnNlQnVja2V0RW5jcnlwdGlvbkNvbmZpZyh4bWwpIHtcbiAgbGV0IGVuY0NvbmZpZyA9IHBhcnNlWG1sKHhtbClcbiAgcmV0dXJuIGVuY0NvbmZpZ1xufVxuZXhwb3J0IGZ1bmN0aW9uIHBhcnNlUmVwbGljYXRpb25Db25maWcoeG1sKSB7XG4gIGNvbnN0IHhtbE9iaiA9IHBhcnNlWG1sKHhtbClcbiAgY29uc3QgcmVwbGljYXRpb25Db25maWcgPSB7XG4gICAgUmVwbGljYXRpb25Db25maWd1cmF0aW9uOiB7XG4gICAgICByb2xlOiB4bWxPYmouUmVwbGljYXRpb25Db25maWd1cmF0aW9uLlJvbGUsXG4gICAgICBydWxlczogdG9BcnJheSh4bWxPYmouUmVwbGljYXRpb25Db25maWd1cmF0aW9uLlJ1bGUpLFxuICAgIH0sXG4gIH1cbiAgcmV0dXJuIHJlcGxpY2F0aW9uQ29uZmlnXG59XG5cbmV4cG9ydCBmdW5jdGlvbiBwYXJzZU9iamVjdExlZ2FsSG9sZENvbmZpZyh4bWwpIHtcbiAgY29uc3QgeG1sT2JqID0gcGFyc2VYbWwoeG1sKVxuICByZXR1cm4geG1sT2JqLkxlZ2FsSG9sZFxufVxuXG5leHBvcnQgZnVuY3Rpb24gdXBsb2FkUGFydFBhcnNlcih4bWwpIHtcbiAgY29uc3QgeG1sT2JqID0gcGFyc2VYbWwoeG1sKVxuICBjb25zdCByZXNwRWwgPSB4bWxPYmouQ29weVBhcnRSZXN1bHRcbiAgcmV0dXJuIHJlc3BFbFxufVxuXG5leHBvcnQgZnVuY3Rpb24gcmVtb3ZlT2JqZWN0c1BhcnNlcih4bWwpIHtcbiAgY29uc3QgeG1sT2JqID0gcGFyc2VYbWwoeG1sKVxuICBpZiAoeG1sT2JqLkRlbGV0ZVJlc3VsdCAmJiB4bWxPYmouRGVsZXRlUmVzdWx0LkVycm9yKSB7XG4gICAgLy8gcmV0dXJuIGVycm9ycyBhcyBhcnJheSBhbHdheXMuIGFzIHRoZSByZXNwb25zZSBpcyBvYmplY3QgaW4gY2FzZSBvZiBzaW5nbGUgb2JqZWN0IHBhc3NlZCBpbiByZW1vdmVPYmplY3RzXG4gICAgcmV0dXJuIHRvQXJyYXkoeG1sT2JqLkRlbGV0ZVJlc3VsdC5FcnJvcilcbiAgfVxuICByZXR1cm4gW11cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHBhcnNlU2VsZWN0T2JqZWN0Q29udGVudFJlc3BvbnNlKHJlcykge1xuICAvLyBleHRyYWN0SGVhZGVyVHlwZSBleHRyYWN0cyB0aGUgZmlyc3QgaGFsZiBvZiB0aGUgaGVhZGVyIG1lc3NhZ2UsIHRoZSBoZWFkZXIgdHlwZS5cbiAgZnVuY3Rpb24gZXh0cmFjdEhlYWRlclR5cGUoc3RyZWFtKSB7XG4gICAgY29uc3QgaGVhZGVyTmFtZUxlbiA9IEJ1ZmZlci5mcm9tKHN0cmVhbS5yZWFkKDEpKS5yZWFkVUludDgoKVxuICAgIGNvbnN0IGhlYWRlck5hbWVXaXRoU2VwYXJhdG9yID0gQnVmZmVyLmZyb20oc3RyZWFtLnJlYWQoaGVhZGVyTmFtZUxlbikpLnRvU3RyaW5nKClcbiAgICBjb25zdCBzcGxpdEJ5U2VwYXJhdG9yID0gKGhlYWRlck5hbWVXaXRoU2VwYXJhdG9yIHx8ICcnKS5zcGxpdCgnOicpXG4gICAgY29uc3QgaGVhZGVyTmFtZSA9IHNwbGl0QnlTZXBhcmF0b3IubGVuZ3RoID49IDEgPyBzcGxpdEJ5U2VwYXJhdG9yWzFdIDogJydcbiAgICByZXR1cm4gaGVhZGVyTmFtZVxuICB9XG5cbiAgZnVuY3Rpb24gZXh0cmFjdEhlYWRlclZhbHVlKHN0cmVhbSkge1xuICAgIGNvbnN0IGJvZHlMZW4gPSBCdWZmZXIuZnJvbShzdHJlYW0ucmVhZCgyKSkucmVhZFVJbnQxNkJFKClcbiAgICBjb25zdCBib2R5TmFtZSA9IEJ1ZmZlci5mcm9tKHN0cmVhbS5yZWFkKGJvZHlMZW4pKS50b1N0cmluZygpXG4gICAgcmV0dXJuIGJvZHlOYW1lXG4gIH1cblxuICBjb25zdCBzZWxlY3RSZXN1bHRzID0gbmV3IFNlbGVjdFJlc3VsdHMoe30pIC8vIHdpbGwgYmUgcmV0dXJuZWRcblxuICBjb25zdCByZXNwb25zZVN0cmVhbSA9IHJlYWRhYmxlU3RyZWFtKHJlcykgLy8gY29udmVydCBieXRlIGFycmF5IHRvIGEgcmVhZGFibGUgcmVzcG9uc2VTdHJlYW1cbiAgd2hpbGUgKHJlc3BvbnNlU3RyZWFtLl9yZWFkYWJsZVN0YXRlLmxlbmd0aCkge1xuICAgIC8vIFRvcCBsZXZlbCByZXNwb25zZVN0cmVhbSByZWFkIHRyYWNrZXIuXG4gICAgbGV0IG1zZ0NyY0FjY3VtdWxhdG9yIC8vIGFjY3VtdWxhdGUgZnJvbSBzdGFydCBvZiB0aGUgbWVzc2FnZSB0aWxsIHRoZSBtZXNzYWdlIGNyYyBzdGFydC5cblxuICAgIGNvbnN0IHRvdGFsQnl0ZUxlbmd0aEJ1ZmZlciA9IEJ1ZmZlci5mcm9tKHJlc3BvbnNlU3RyZWFtLnJlYWQoNCkpXG4gICAgbXNnQ3JjQWNjdW11bGF0b3IgPSBjcmMzMih0b3RhbEJ5dGVMZW5ndGhCdWZmZXIpXG5cbiAgICBjb25zdCBoZWFkZXJCeXRlc0J1ZmZlciA9IEJ1ZmZlci5mcm9tKHJlc3BvbnNlU3RyZWFtLnJlYWQoNCkpXG4gICAgbXNnQ3JjQWNjdW11bGF0b3IgPSBjcmMzMihoZWFkZXJCeXRlc0J1ZmZlciwgbXNnQ3JjQWNjdW11bGF0b3IpXG5cbiAgICBjb25zdCBjYWxjdWxhdGVkUHJlbHVkZUNyYyA9IG1zZ0NyY0FjY3VtdWxhdG9yLnJlYWRJbnQzMkJFKCkgLy8gdXNlIGl0IHRvIGNoZWNrIGlmIGFueSBDUkMgbWlzbWF0Y2ggaW4gaGVhZGVyIGl0c2VsZi5cblxuICAgIGNvbnN0IHByZWx1ZGVDcmNCdWZmZXIgPSBCdWZmZXIuZnJvbShyZXNwb25zZVN0cmVhbS5yZWFkKDQpKSAvLyByZWFkIDQgYnl0ZXMgICAgaS5lIDQrNCA9OCArIDQgPSAxMiAoIHByZWx1ZGUgKyBwcmVsdWRlIGNyYylcbiAgICBtc2dDcmNBY2N1bXVsYXRvciA9IGNyYzMyKHByZWx1ZGVDcmNCdWZmZXIsIG1zZ0NyY0FjY3VtdWxhdG9yKVxuXG4gICAgY29uc3QgdG90YWxNc2dMZW5ndGggPSB0b3RhbEJ5dGVMZW5ndGhCdWZmZXIucmVhZEludDMyQkUoKVxuICAgIGNvbnN0IGhlYWRlckxlbmd0aCA9IGhlYWRlckJ5dGVzQnVmZmVyLnJlYWRJbnQzMkJFKClcbiAgICBjb25zdCBwcmVsdWRlQ3JjQnl0ZVZhbHVlID0gcHJlbHVkZUNyY0J1ZmZlci5yZWFkSW50MzJCRSgpXG5cbiAgICBpZiAocHJlbHVkZUNyY0J5dGVWYWx1ZSAhPT0gY2FsY3VsYXRlZFByZWx1ZGVDcmMpIHtcbiAgICAgIC8vIEhhbmRsZSBIZWFkZXIgQ1JDIG1pc21hdGNoIEVycm9yXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAgIGBIZWFkZXIgQ2hlY2tzdW0gTWlzbWF0Y2gsIFByZWx1ZGUgQ1JDIG9mICR7cHJlbHVkZUNyY0J5dGVWYWx1ZX0gZG9lcyBub3QgZXF1YWwgZXhwZWN0ZWQgQ1JDIG9mICR7Y2FsY3VsYXRlZFByZWx1ZGVDcmN9YCxcbiAgICAgIClcbiAgICB9XG5cbiAgICBjb25zdCBoZWFkZXJzID0ge31cbiAgICBpZiAoaGVhZGVyTGVuZ3RoID4gMCkge1xuICAgICAgY29uc3QgaGVhZGVyQnl0ZXMgPSBCdWZmZXIuZnJvbShyZXNwb25zZVN0cmVhbS5yZWFkKGhlYWRlckxlbmd0aCkpXG4gICAgICBtc2dDcmNBY2N1bXVsYXRvciA9IGNyYzMyKGhlYWRlckJ5dGVzLCBtc2dDcmNBY2N1bXVsYXRvcilcbiAgICAgIGNvbnN0IGhlYWRlclJlYWRlclN0cmVhbSA9IHJlYWRhYmxlU3RyZWFtKGhlYWRlckJ5dGVzKVxuICAgICAgd2hpbGUgKGhlYWRlclJlYWRlclN0cmVhbS5fcmVhZGFibGVTdGF0ZS5sZW5ndGgpIHtcbiAgICAgICAgbGV0IGhlYWRlclR5cGVOYW1lID0gZXh0cmFjdEhlYWRlclR5cGUoaGVhZGVyUmVhZGVyU3RyZWFtKVxuICAgICAgICBoZWFkZXJSZWFkZXJTdHJlYW0ucmVhZCgxKSAvLyBqdXN0IHJlYWQgYW5kIGlnbm9yZSBpdC5cbiAgICAgICAgaGVhZGVyc1toZWFkZXJUeXBlTmFtZV0gPSBleHRyYWN0SGVhZGVyVmFsdWUoaGVhZGVyUmVhZGVyU3RyZWFtKVxuICAgICAgfVxuICAgIH1cblxuICAgIGxldCBwYXlsb2FkU3RyZWFtXG4gICAgY29uc3QgcGF5TG9hZExlbmd0aCA9IHRvdGFsTXNnTGVuZ3RoIC0gaGVhZGVyTGVuZ3RoIC0gMTZcbiAgICBpZiAocGF5TG9hZExlbmd0aCA+IDApIHtcbiAgICAgIGNvbnN0IHBheUxvYWRCdWZmZXIgPSBCdWZmZXIuZnJvbShyZXNwb25zZVN0cmVhbS5yZWFkKHBheUxvYWRMZW5ndGgpKVxuICAgICAgbXNnQ3JjQWNjdW11bGF0b3IgPSBjcmMzMihwYXlMb2FkQnVmZmVyLCBtc2dDcmNBY2N1bXVsYXRvcilcbiAgICAgIC8vIHJlYWQgdGhlIGNoZWNrc3VtIGVhcmx5IGFuZCBkZXRlY3QgYW55IG1pc21hdGNoIHNvIHdlIGNhbiBhdm9pZCB1bm5lY2Vzc2FyeSBmdXJ0aGVyIHByb2Nlc3NpbmcuXG4gICAgICBjb25zdCBtZXNzYWdlQ3JjQnl0ZVZhbHVlID0gQnVmZmVyLmZyb20ocmVzcG9uc2VTdHJlYW0ucmVhZCg0KSkucmVhZEludDMyQkUoKVxuICAgICAgY29uc3QgY2FsY3VsYXRlZENyYyA9IG1zZ0NyY0FjY3VtdWxhdG9yLnJlYWRJbnQzMkJFKClcbiAgICAgIC8vIEhhbmRsZSBtZXNzYWdlIENSQyBFcnJvclxuICAgICAgaWYgKG1lc3NhZ2VDcmNCeXRlVmFsdWUgIT09IGNhbGN1bGF0ZWRDcmMpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgICAgIGBNZXNzYWdlIENoZWNrc3VtIE1pc21hdGNoLCBNZXNzYWdlIENSQyBvZiAke21lc3NhZ2VDcmNCeXRlVmFsdWV9IGRvZXMgbm90IGVxdWFsIGV4cGVjdGVkIENSQyBvZiAke2NhbGN1bGF0ZWRDcmN9YCxcbiAgICAgICAgKVxuICAgICAgfVxuICAgICAgcGF5bG9hZFN0cmVhbSA9IHJlYWRhYmxlU3RyZWFtKHBheUxvYWRCdWZmZXIpXG4gICAgfVxuXG4gICAgY29uc3QgbWVzc2FnZVR5cGUgPSBoZWFkZXJzWydtZXNzYWdlLXR5cGUnXVxuXG4gICAgc3dpdGNoIChtZXNzYWdlVHlwZSkge1xuICAgICAgY2FzZSAnZXJyb3InOiB7XG4gICAgICAgIGNvbnN0IGVycm9yTWVzc2FnZSA9IGhlYWRlcnNbJ2Vycm9yLWNvZGUnXSArICc6XCInICsgaGVhZGVyc1snZXJyb3ItbWVzc2FnZSddICsgJ1wiJ1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoZXJyb3JNZXNzYWdlKVxuICAgICAgfVxuICAgICAgY2FzZSAnZXZlbnQnOiB7XG4gICAgICAgIGNvbnN0IGNvbnRlbnRUeXBlID0gaGVhZGVyc1snY29udGVudC10eXBlJ11cbiAgICAgICAgY29uc3QgZXZlbnRUeXBlID0gaGVhZGVyc1snZXZlbnQtdHlwZSddXG5cbiAgICAgICAgc3dpdGNoIChldmVudFR5cGUpIHtcbiAgICAgICAgICBjYXNlICdFbmQnOiB7XG4gICAgICAgICAgICBzZWxlY3RSZXN1bHRzLnNldFJlc3BvbnNlKHJlcylcbiAgICAgICAgICAgIHJldHVybiBzZWxlY3RSZXN1bHRzXG4gICAgICAgICAgfVxuXG4gICAgICAgICAgY2FzZSAnUmVjb3Jkcyc6IHtcbiAgICAgICAgICAgIGNvbnN0IHJlYWREYXRhID0gcGF5bG9hZFN0cmVhbS5yZWFkKHBheUxvYWRMZW5ndGgpXG4gICAgICAgICAgICBzZWxlY3RSZXN1bHRzLnNldFJlY29yZHMocmVhZERhdGEpXG4gICAgICAgICAgICBicmVha1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGNhc2UgJ1Byb2dyZXNzJzpcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgc3dpdGNoIChjb250ZW50VHlwZSkge1xuICAgICAgICAgICAgICAgIGNhc2UgJ3RleHQveG1sJzoge1xuICAgICAgICAgICAgICAgICAgY29uc3QgcHJvZ3Jlc3NEYXRhID0gcGF5bG9hZFN0cmVhbS5yZWFkKHBheUxvYWRMZW5ndGgpXG4gICAgICAgICAgICAgICAgICBzZWxlY3RSZXN1bHRzLnNldFByb2dyZXNzKHByb2dyZXNzRGF0YS50b1N0cmluZygpKVxuICAgICAgICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZGVmYXVsdDoge1xuICAgICAgICAgICAgICAgICAgY29uc3QgZXJyb3JNZXNzYWdlID0gYFVuZXhwZWN0ZWQgY29udGVudC10eXBlICR7Y29udGVudFR5cGV9IHNlbnQgZm9yIGV2ZW50LXR5cGUgUHJvZ3Jlc3NgXG4gICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoZXJyb3JNZXNzYWdlKVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICBjYXNlICdTdGF0cyc6XG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgIHN3aXRjaCAoY29udGVudFR5cGUpIHtcbiAgICAgICAgICAgICAgICBjYXNlICd0ZXh0L3htbCc6IHtcbiAgICAgICAgICAgICAgICAgIGNvbnN0IHN0YXRzRGF0YSA9IHBheWxvYWRTdHJlYW0ucmVhZChwYXlMb2FkTGVuZ3RoKVxuICAgICAgICAgICAgICAgICAgc2VsZWN0UmVzdWx0cy5zZXRTdGF0cyhzdGF0c0RhdGEudG9TdHJpbmcoKSlcbiAgICAgICAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGRlZmF1bHQ6IHtcbiAgICAgICAgICAgICAgICAgIGNvbnN0IGVycm9yTWVzc2FnZSA9IGBVbmV4cGVjdGVkIGNvbnRlbnQtdHlwZSAke2NvbnRlbnRUeXBlfSBzZW50IGZvciBldmVudC10eXBlIFN0YXRzYFxuICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGVycm9yTWVzc2FnZSlcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgZGVmYXVsdDoge1xuICAgICAgICAgICAgLy8gQ29udGludWF0aW9uIG1lc3NhZ2U6IE5vdCBzdXJlIGlmIGl0IGlzIHN1cHBvcnRlZC4gZGlkIG5vdCBmaW5kIGEgcmVmZXJlbmNlIG9yIGFueSBtZXNzYWdlIGluIHJlc3BvbnNlLlxuICAgICAgICAgICAgLy8gSXQgZG9lcyBub3QgaGF2ZSBhIHBheWxvYWQuXG4gICAgICAgICAgICBjb25zdCB3YXJuaW5nTWVzc2FnZSA9IGBVbiBpbXBsZW1lbnRlZCBldmVudCBkZXRlY3RlZCAgJHttZXNzYWdlVHlwZX0uYFxuICAgICAgICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLWNvbnNvbGVcbiAgICAgICAgICAgIGNvbnNvbGUud2Fybih3YXJuaW5nTWVzc2FnZSlcbiAgICAgICAgICB9XG4gICAgICAgIH0gLy8gZXZlbnRUeXBlIEVuZFxuICAgICAgfSAvLyBFdmVudCBFbmRcbiAgICB9IC8vIG1lc3NhZ2VUeXBlIEVuZFxuICB9IC8vIFRvcCBMZXZlbCBTdHJlYW0gRW5kXG59XG4iXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFnQkEsSUFBQUEsVUFBQSxHQUFBQyxPQUFBO0FBQ0EsSUFBQUMsY0FBQSxHQUFBRCxPQUFBO0FBQ0EsSUFBQUUsT0FBQSxHQUFBRixPQUFBO0FBRUEsSUFBQUcsTUFBQSxHQUFBQyx1QkFBQSxDQUFBSixPQUFBO0FBQ0EsSUFBQUssUUFBQSxHQUFBTCxPQUFBO0FBQ0EsSUFBQU0sT0FBQSxHQUFBTixPQUFBO0FBQ0EsSUFBQU8sS0FBQSxHQUFBUCxPQUFBO0FBQTZELFNBQUFRLHlCQUFBQyxXQUFBLGVBQUFDLE9BQUEsa0NBQUFDLGlCQUFBLE9BQUFELE9BQUEsUUFBQUUsZ0JBQUEsT0FBQUYsT0FBQSxZQUFBRix3QkFBQSxZQUFBQSxDQUFBQyxXQUFBLFdBQUFBLFdBQUEsR0FBQUcsZ0JBQUEsR0FBQUQsaUJBQUEsS0FBQUYsV0FBQTtBQUFBLFNBQUFMLHdCQUFBUyxHQUFBLEVBQUFKLFdBQUEsU0FBQUEsV0FBQSxJQUFBSSxHQUFBLElBQUFBLEdBQUEsQ0FBQUMsVUFBQSxXQUFBRCxHQUFBLFFBQUFBLEdBQUEsb0JBQUFBLEdBQUEsd0JBQUFBLEdBQUEsNEJBQUFFLE9BQUEsRUFBQUYsR0FBQSxVQUFBRyxLQUFBLEdBQUFSLHdCQUFBLENBQUFDLFdBQUEsT0FBQU8sS0FBQSxJQUFBQSxLQUFBLENBQUFDLEdBQUEsQ0FBQUosR0FBQSxZQUFBRyxLQUFBLENBQUFFLEdBQUEsQ0FBQUwsR0FBQSxTQUFBTSxNQUFBLFdBQUFDLHFCQUFBLEdBQUFDLE1BQUEsQ0FBQUMsY0FBQSxJQUFBRCxNQUFBLENBQUFFLHdCQUFBLFdBQUFDLEdBQUEsSUFBQVgsR0FBQSxRQUFBVyxHQUFBLGtCQUFBSCxNQUFBLENBQUFJLFNBQUEsQ0FBQUMsY0FBQSxDQUFBQyxJQUFBLENBQUFkLEdBQUEsRUFBQVcsR0FBQSxTQUFBSSxJQUFBLEdBQUFSLHFCQUFBLEdBQUFDLE1BQUEsQ0FBQUUsd0JBQUEsQ0FBQVYsR0FBQSxFQUFBVyxHQUFBLGNBQUFJLElBQUEsS0FBQUEsSUFBQSxDQUFBVixHQUFBLElBQUFVLElBQUEsQ0FBQUMsR0FBQSxLQUFBUixNQUFBLENBQUFDLGNBQUEsQ0FBQUgsTUFBQSxFQUFBSyxHQUFBLEVBQUFJLElBQUEsWUFBQVQsTUFBQSxDQUFBSyxHQUFBLElBQUFYLEdBQUEsQ0FBQVcsR0FBQSxTQUFBTCxNQUFBLENBQUFKLE9BQUEsR0FBQUYsR0FBQSxNQUFBRyxLQUFBLElBQUFBLEtBQUEsQ0FBQWEsR0FBQSxDQUFBaEIsR0FBQSxFQUFBTSxNQUFBLFlBQUFBLE1BQUE7QUF2QjdEO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFXQTtBQUNBLE1BQU1XLEdBQUcsR0FBRyxJQUFJQyx3QkFBUyxDQUFDLENBQUM7O0FBRTNCO0FBQ08sU0FBU0MsVUFBVUEsQ0FBQ0MsR0FBRyxFQUFFQyxVQUFVLEVBQUU7RUFDMUMsSUFBSUMsTUFBTSxHQUFHLENBQUMsQ0FBQztFQUNmLElBQUlDLE1BQU0sR0FBR04sR0FBRyxDQUFDTyxLQUFLLENBQUNKLEdBQUcsQ0FBQztFQUMzQixJQUFJRyxNQUFNLENBQUNFLEtBQUssRUFBRTtJQUNoQkgsTUFBTSxHQUFHQyxNQUFNLENBQUNFLEtBQUs7RUFDdkI7RUFFQSxJQUFJQyxDQUFDLEdBQUcsSUFBSXBDLE1BQU0sQ0FBQ3FDLE9BQU8sQ0FBQyxDQUFDO0VBQzVCQyxPQUFDLENBQUNDLElBQUksQ0FBQ1AsTUFBTSxFQUFFLENBQUNRLEtBQUssRUFBRW5CLEdBQUcsS0FBSztJQUM3QmUsQ0FBQyxDQUFDZixHQUFHLENBQUNvQixXQUFXLENBQUMsQ0FBQyxDQUFDLEdBQUdELEtBQUs7RUFDOUIsQ0FBQyxDQUFDO0VBRUZGLE9BQUMsQ0FBQ0MsSUFBSSxDQUFDUixVQUFVLEVBQUUsQ0FBQ1MsS0FBSyxFQUFFbkIsR0FBRyxLQUFLO0lBQ2pDZSxDQUFDLENBQUNmLEdBQUcsQ0FBQyxHQUFHbUIsS0FBSztFQUNoQixDQUFDLENBQUM7RUFDRixPQUFPSixDQUFDO0FBQ1Y7O0FBRUE7QUFDTyxTQUFTTSxlQUFlQSxDQUFDWixHQUFHLEVBQUU7RUFDbkMsSUFBSWEsTUFBTSxHQUFHO0lBQ1hDLElBQUksRUFBRSxFQUFFO0lBQ1JDLFlBQVksRUFBRTtFQUNoQixDQUFDO0VBRUQsSUFBSUMsTUFBTSxHQUFHLElBQUFDLGdCQUFRLEVBQUNqQixHQUFHLENBQUM7RUFDMUIsSUFBSSxDQUFDZ0IsTUFBTSxDQUFDRSxnQkFBZ0IsRUFBRTtJQUM1QixNQUFNLElBQUloRCxNQUFNLENBQUNpRCxlQUFlLENBQUMsaUNBQWlDLENBQUM7RUFDckU7RUFDQUgsTUFBTSxHQUFHQSxNQUFNLENBQUNFLGdCQUFnQjtFQUNoQyxJQUFJRixNQUFNLENBQUNJLElBQUksRUFBRTtJQUNmUCxNQUFNLENBQUNDLElBQUksR0FBR0UsTUFBTSxDQUFDSSxJQUFJLENBQUNDLE9BQU8sQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLENBQ3pDQSxPQUFPLENBQUMsS0FBSyxFQUFFLEVBQUUsQ0FBQyxDQUNsQkEsT0FBTyxDQUFDLFVBQVUsRUFBRSxFQUFFLENBQUMsQ0FDdkJBLE9BQU8sQ0FBQyxVQUFVLEVBQUUsRUFBRSxDQUFDLENBQ3ZCQSxPQUFPLENBQUMsU0FBUyxFQUFFLEVBQUUsQ0FBQyxDQUN0QkEsT0FBTyxDQUFDLFNBQVMsRUFBRSxFQUFFLENBQUM7RUFDM0I7RUFDQSxJQUFJTCxNQUFNLENBQUNNLFlBQVksRUFBRTtJQUN2QlQsTUFBTSxDQUFDRSxZQUFZLEdBQUcsSUFBSVEsSUFBSSxDQUFDUCxNQUFNLENBQUNNLFlBQVksQ0FBQztFQUNyRDtFQUVBLE9BQU9ULE1BQU07QUFDZjs7QUFFQTtBQUNPLFNBQVNXLGtCQUFrQkEsQ0FBQ3hCLEdBQUcsRUFBRTtFQUN0QyxJQUFJYSxNQUFNLEdBQUc7SUFDWFksT0FBTyxFQUFFLEVBQUU7SUFDWEMsUUFBUSxFQUFFLEVBQUU7SUFDWkMsV0FBVyxFQUFFO0VBQ2YsQ0FBQztFQUVELElBQUlYLE1BQU0sR0FBRyxJQUFBQyxnQkFBUSxFQUFDakIsR0FBRyxDQUFDO0VBRTFCLElBQUksQ0FBQ2dCLE1BQU0sQ0FBQ1ksMEJBQTBCLEVBQUU7SUFDdEMsTUFBTSxJQUFJMUQsTUFBTSxDQUFDaUQsZUFBZSxDQUFDLDJDQUEyQyxDQUFDO0VBQy9FO0VBQ0FILE1BQU0sR0FBR0EsTUFBTSxDQUFDWSwwQkFBMEI7RUFDMUMsSUFBSVosTUFBTSxDQUFDYSxXQUFXLEVBQUU7SUFDdEJoQixNQUFNLENBQUNjLFdBQVcsR0FBR1gsTUFBTSxDQUFDYSxXQUFXO0VBQ3pDO0VBQ0EsSUFBSWIsTUFBTSxDQUFDYyxhQUFhLEVBQUU7SUFDeEJqQixNQUFNLENBQUNrQixhQUFhLEdBQUdmLE1BQU0sQ0FBQ2MsYUFBYTtFQUM3QztFQUNBLElBQUlkLE1BQU0sQ0FBQ2dCLGtCQUFrQixFQUFFO0lBQzdCbkIsTUFBTSxDQUFDb0Isa0JBQWtCLEdBQUdqQixNQUFNLENBQUNpQixrQkFBa0I7RUFDdkQ7RUFFQSxJQUFJakIsTUFBTSxDQUFDa0IsY0FBYyxFQUFFO0lBQ3pCLElBQUFDLGVBQU8sRUFBQ25CLE1BQU0sQ0FBQ2tCLGNBQWMsQ0FBQyxDQUFDRSxPQUFPLENBQUVDLE1BQU0sSUFBSztNQUNqRHhCLE1BQU0sQ0FBQ2EsUUFBUSxDQUFDWSxJQUFJLENBQUM7UUFBRUQsTUFBTSxFQUFFLElBQUFFLHlCQUFpQixFQUFDLElBQUFKLGVBQU8sRUFBQ0UsTUFBTSxDQUFDRyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUM7TUFBRSxDQUFDLENBQUM7SUFDaEYsQ0FBQyxDQUFDO0VBQ0o7RUFFQSxJQUFJeEIsTUFBTSxDQUFDeUIsTUFBTSxFQUFFO0lBQ2pCLElBQUFOLGVBQU8sRUFBQ25CLE1BQU0sQ0FBQ3lCLE1BQU0sQ0FBQyxDQUFDTCxPQUFPLENBQUVNLE1BQU0sSUFBSztNQUN6QyxJQUFJbkQsR0FBRyxHQUFHbUQsTUFBTSxDQUFDQyxHQUFHO01BQ3BCLElBQUlDLFFBQVEsR0FBR0YsTUFBTSxDQUFDRyxRQUFRO01BQzlCLElBQUlDLFNBQVMsR0FBRztRQUFFQyxFQUFFLEVBQUVMLE1BQU0sQ0FBQ00sU0FBUyxDQUFDQyxFQUFFO1FBQUVDLFdBQVcsRUFBRVIsTUFBTSxDQUFDTSxTQUFTLENBQUNHO01BQVksQ0FBQztNQUN0RixJQUFJQyxLQUFLLEdBQUc7UUFBRUwsRUFBRSxFQUFFTCxNQUFNLENBQUNXLEtBQUssQ0FBQ0osRUFBRTtRQUFFQyxXQUFXLEVBQUVSLE1BQU0sQ0FBQ1csS0FBSyxDQUFDRjtNQUFZLENBQUM7TUFDMUUsSUFBSUcsWUFBWSxHQUFHWixNQUFNLENBQUNhLFlBQVk7TUFDdEMsSUFBSUMsU0FBUyxHQUFHLElBQUlqQyxJQUFJLENBQUNtQixNQUFNLENBQUNlLFNBQVMsQ0FBQztNQUMxQzVDLE1BQU0sQ0FBQ1ksT0FBTyxDQUFDYSxJQUFJLENBQUM7UUFBRS9DLEdBQUc7UUFBRXFELFFBQVE7UUFBRUUsU0FBUztRQUFFTSxLQUFLO1FBQUVFLFlBQVk7UUFBRUU7TUFBVSxDQUFDLENBQUM7SUFDbkYsQ0FBQyxDQUFDO0VBQ0o7RUFDQSxPQUFPM0MsTUFBTTtBQUNmOztBQUVBO0FBQ08sU0FBUzZDLGVBQWVBLENBQUMxRCxHQUFHLEVBQUU7RUFDbkMsSUFBSWEsTUFBTSxHQUFHLEVBQUU7RUFDZixJQUFJRyxNQUFNLEdBQUcsSUFBQUMsZ0JBQVEsRUFBQ2pCLEdBQUcsQ0FBQztFQUUxQixJQUFJLENBQUNnQixNQUFNLENBQUMyQyxzQkFBc0IsRUFBRTtJQUNsQyxNQUFNLElBQUl6RixNQUFNLENBQUNpRCxlQUFlLENBQUMsdUNBQXVDLENBQUM7RUFDM0U7RUFDQUgsTUFBTSxHQUFHQSxNQUFNLENBQUMyQyxzQkFBc0I7RUFFdEMsSUFBSTNDLE1BQU0sQ0FBQzRDLE9BQU8sRUFBRTtJQUNsQixJQUFJNUMsTUFBTSxDQUFDNEMsT0FBTyxDQUFDQyxNQUFNLEVBQUU7TUFDekIsSUFBQTFCLGVBQU8sRUFBQ25CLE1BQU0sQ0FBQzRDLE9BQU8sQ0FBQ0MsTUFBTSxDQUFDLENBQUN6QixPQUFPLENBQUUwQixNQUFNLElBQUs7UUFDakQsSUFBSUMsSUFBSSxHQUFHRCxNQUFNLENBQUNFLElBQUk7UUFDdEIsSUFBSUMsWUFBWSxHQUFHLElBQUkxQyxJQUFJLENBQUN1QyxNQUFNLENBQUNJLFlBQVksQ0FBQztRQUNoRHJELE1BQU0sQ0FBQ3lCLElBQUksQ0FBQztVQUFFeUIsSUFBSTtVQUFFRTtRQUFhLENBQUMsQ0FBQztNQUNyQyxDQUFDLENBQUM7SUFDSjtFQUNGO0VBQ0EsT0FBT3BELE1BQU07QUFDZjs7QUFFQTtBQUNPLFNBQVNzRCx1QkFBdUJBLENBQUNuRSxHQUFHLEVBQUU7RUFDM0MsSUFBSWEsTUFBTSxHQUFHO0lBQ1h1RCxrQkFBa0IsRUFBRSxFQUFFO0lBQ3RCQyxrQkFBa0IsRUFBRSxFQUFFO0lBQ3RCQywwQkFBMEIsRUFBRTtFQUM5QixDQUFDO0VBQ0Q7RUFDQSxJQUFJQyxTQUFTLEdBQUcsU0FBQUEsQ0FBVUMsTUFBTSxFQUFFO0lBQ2hDLElBQUkzRCxNQUFNLEdBQUcsRUFBRTtJQUNmLElBQUkyRCxNQUFNLEVBQUU7TUFDVixJQUFBckMsZUFBTyxFQUFDcUMsTUFBTSxDQUFDLENBQUNwQyxPQUFPLENBQUVxQyxPQUFPLElBQUs7UUFDbkM1RCxNQUFNLENBQUN5QixJQUFJLENBQUNtQyxPQUFPLENBQUM7TUFDdEIsQ0FBQyxDQUFDO0lBQ0o7SUFDQSxPQUFPNUQsTUFBTTtFQUNmLENBQUM7RUFDRDtFQUNBLElBQUk2RCxjQUFjLEdBQUcsU0FBQUEsQ0FBVUMsT0FBTyxFQUFFO0lBQ3RDLElBQUk5RCxNQUFNLEdBQUcsRUFBRTtJQUNmLElBQUk4RCxPQUFPLEVBQUU7TUFDWEEsT0FBTyxHQUFHLElBQUF4QyxlQUFPLEVBQUN3QyxPQUFPLENBQUM7TUFDMUIsSUFBSUEsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDQyxLQUFLLEVBQUU7UUFDcEJELE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQ0MsS0FBSyxHQUFHLElBQUF6QyxlQUFPLEVBQUN3QyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUNDLEtBQUssQ0FBQztRQUM1QyxJQUFJRCxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUNDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQ0MsVUFBVSxFQUFFO1VBQ2xDLElBQUExQyxlQUFPLEVBQUN3QyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUNDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQ0MsVUFBVSxDQUFDLENBQUN6QyxPQUFPLENBQUUwQyxJQUFJLElBQUs7WUFDeEQsSUFBSWQsSUFBSSxHQUFHLElBQUE3QixlQUFPLEVBQUMyQyxJQUFJLENBQUNkLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNoQyxJQUFJZSxLQUFLLEdBQUcsSUFBQTVDLGVBQU8sRUFBQzJDLElBQUksQ0FBQ0MsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ2xDbEUsTUFBTSxDQUFDeUIsSUFBSSxDQUFDO2NBQUUwQixJQUFJO2NBQUVlO1lBQU0sQ0FBQyxDQUFDO1VBQzlCLENBQUMsQ0FBQztRQUNKO01BQ0Y7SUFDRjtJQUNBLE9BQU9sRSxNQUFNO0VBQ2YsQ0FBQztFQUVELElBQUlHLE1BQU0sR0FBRyxJQUFBQyxnQkFBUSxFQUFDakIsR0FBRyxDQUFDO0VBQzFCZ0IsTUFBTSxHQUFHQSxNQUFNLENBQUNnRSx5QkFBeUI7O0VBRXpDO0VBQ0EsSUFBSWhFLE1BQU0sQ0FBQ29ELGtCQUFrQixFQUFFO0lBQzdCLElBQUFqQyxlQUFPLEVBQUNuQixNQUFNLENBQUNvRCxrQkFBa0IsQ0FBQyxDQUFDaEMsT0FBTyxDQUFFNkMsTUFBTSxJQUFLO01BQ3JELElBQUlDLEVBQUUsR0FBRyxJQUFBL0MsZUFBTyxFQUFDOEMsTUFBTSxDQUFDQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7TUFDOUIsSUFBSUMsS0FBSyxHQUFHLElBQUFoRCxlQUFPLEVBQUM4QyxNQUFNLENBQUNFLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQztNQUNwQyxJQUFJQyxLQUFLLEdBQUdiLFNBQVMsQ0FBQ1UsTUFBTSxDQUFDRyxLQUFLLENBQUM7TUFDbkMsSUFBSUMsTUFBTSxHQUFHWCxjQUFjLENBQUNPLE1BQU0sQ0FBQ0ksTUFBTSxDQUFDO01BQzFDeEUsTUFBTSxDQUFDdUQsa0JBQWtCLENBQUM5QixJQUFJLENBQUM7UUFBRTRDLEVBQUU7UUFBRUMsS0FBSztRQUFFQyxLQUFLO1FBQUVDO01BQU8sQ0FBQyxDQUFDO0lBQzlELENBQUMsQ0FBQztFQUNKO0VBQ0E7RUFDQSxJQUFJckUsTUFBTSxDQUFDcUQsa0JBQWtCLEVBQUU7SUFDN0IsSUFBQWxDLGVBQU8sRUFBQ25CLE1BQU0sQ0FBQ3FELGtCQUFrQixDQUFDLENBQUNqQyxPQUFPLENBQUU2QyxNQUFNLElBQUs7TUFDckQsSUFBSUMsRUFBRSxHQUFHLElBQUEvQyxlQUFPLEVBQUM4QyxNQUFNLENBQUNDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztNQUM5QixJQUFJSSxLQUFLLEdBQUcsSUFBQW5ELGVBQU8sRUFBQzhDLE1BQU0sQ0FBQ0ssS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDO01BQ3BDLElBQUlGLEtBQUssR0FBR2IsU0FBUyxDQUFDVSxNQUFNLENBQUNHLEtBQUssQ0FBQztNQUNuQyxJQUFJQyxNQUFNLEdBQUdYLGNBQWMsQ0FBQ08sTUFBTSxDQUFDSSxNQUFNLENBQUM7TUFDMUN4RSxNQUFNLENBQUN3RCxrQkFBa0IsQ0FBQy9CLElBQUksQ0FBQztRQUFFNEMsRUFBRTtRQUFFSSxLQUFLO1FBQUVGLEtBQUs7UUFBRUM7TUFBTyxDQUFDLENBQUM7SUFDOUQsQ0FBQyxDQUFDO0VBQ0o7RUFDQTtFQUNBLElBQUlyRSxNQUFNLENBQUNzRCwwQkFBMEIsRUFBRTtJQUNyQyxJQUFBbkMsZUFBTyxFQUFDbkIsTUFBTSxDQUFDc0QsMEJBQTBCLENBQUMsQ0FBQ2xDLE9BQU8sQ0FBRTZDLE1BQU0sSUFBSztNQUM3RCxJQUFJQyxFQUFFLEdBQUcsSUFBQS9DLGVBQU8sRUFBQzhDLE1BQU0sQ0FBQ0MsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDO01BQzlCLElBQUlLLGFBQWEsR0FBRyxJQUFBcEQsZUFBTyxFQUFDOEMsTUFBTSxDQUFDTSxhQUFhLENBQUMsQ0FBQyxDQUFDLENBQUM7TUFDcEQsSUFBSUgsS0FBSyxHQUFHYixTQUFTLENBQUNVLE1BQU0sQ0FBQ0csS0FBSyxDQUFDO01BQ25DLElBQUlDLE1BQU0sR0FBR1gsY0FBYyxDQUFDTyxNQUFNLENBQUNJLE1BQU0sQ0FBQztNQUMxQ3hFLE1BQU0sQ0FBQ3lELDBCQUEwQixDQUFDaEMsSUFBSSxDQUFDO1FBQUU0QyxFQUFFO1FBQUVLLGFBQWE7UUFBRUgsS0FBSztRQUFFQztNQUFPLENBQUMsQ0FBQztJQUM5RSxDQUFDLENBQUM7RUFDSjtFQUVBLE9BQU94RSxNQUFNO0FBQ2Y7O0FBRUE7QUFDTyxTQUFTMkUsaUJBQWlCQSxDQUFDeEYsR0FBRyxFQUFFO0VBQ3JDO0VBQ0EsT0FBTyxJQUFBaUIsZ0JBQVEsRUFBQ2pCLEdBQUcsQ0FBQyxDQUFDeUYsa0JBQWtCO0FBQ3pDOztBQUVBO0FBQ08sU0FBU0MsY0FBY0EsQ0FBQzFGLEdBQUcsRUFBRTtFQUNsQyxJQUFJZ0IsTUFBTSxHQUFHLElBQUFDLGdCQUFRLEVBQUNqQixHQUFHLENBQUM7RUFDMUIsSUFBSWEsTUFBTSxHQUFHO0lBQ1hjLFdBQVcsRUFBRSxLQUFLO0lBQ2xCZ0UsS0FBSyxFQUFFLEVBQUU7SUFDVEMsTUFBTSxFQUFFQztFQUNWLENBQUM7RUFDRCxJQUFJLENBQUM3RSxNQUFNLENBQUM4RSxlQUFlLEVBQUU7SUFDM0IsTUFBTSxJQUFJNUgsTUFBTSxDQUFDaUQsZUFBZSxDQUFDLGdDQUFnQyxDQUFDO0VBQ3BFO0VBQ0FILE1BQU0sR0FBR0EsTUFBTSxDQUFDOEUsZUFBZTtFQUMvQixJQUFJOUUsTUFBTSxDQUFDYSxXQUFXLEVBQUU7SUFDdEJoQixNQUFNLENBQUNjLFdBQVcsR0FBR1gsTUFBTSxDQUFDYSxXQUFXO0VBQ3pDO0VBQ0EsSUFBSWIsTUFBTSxDQUFDK0Usb0JBQW9CLEVBQUU7SUFDL0JsRixNQUFNLENBQUMrRSxNQUFNLEdBQUcsQ0FBQyxJQUFBekQsZUFBTyxFQUFDbkIsTUFBTSxDQUFDK0Usb0JBQW9CLENBQUMsQ0FBQyxDQUFDLENBQUM7RUFDMUQ7RUFDQSxJQUFJL0UsTUFBTSxDQUFDZ0YsSUFBSSxFQUFFO0lBQ2YsSUFBQTdELGVBQU8sRUFBQ25CLE1BQU0sQ0FBQ2dGLElBQUksQ0FBQyxDQUFDNUQsT0FBTyxDQUFFNkQsQ0FBQyxJQUFLO01BQ2xDLElBQUlDLElBQUksR0FBRyxDQUFDLElBQUEvRCxlQUFPLEVBQUM4RCxDQUFDLENBQUNFLFVBQVUsQ0FBQyxDQUFDLENBQUMsQ0FBQztNQUNwQyxJQUFJcEYsWUFBWSxHQUFHLElBQUlRLElBQUksQ0FBQzBFLENBQUMsQ0FBQzNFLFlBQVksQ0FBQztNQUMzQyxJQUFJUixJQUFJLEdBQUdtRixDQUFDLENBQUM3RSxJQUFJLENBQUNDLE9BQU8sQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLENBQ2pDQSxPQUFPLENBQUMsS0FBSyxFQUFFLEVBQUUsQ0FBQyxDQUNsQkEsT0FBTyxDQUFDLFVBQVUsRUFBRSxFQUFFLENBQUMsQ0FDdkJBLE9BQU8sQ0FBQyxVQUFVLEVBQUUsRUFBRSxDQUFDLENBQ3ZCQSxPQUFPLENBQUMsU0FBUyxFQUFFLEVBQUUsQ0FBQyxDQUN0QkEsT0FBTyxDQUFDLFNBQVMsRUFBRSxFQUFFLENBQUM7TUFDekJSLE1BQU0sQ0FBQzhFLEtBQUssQ0FBQ3JELElBQUksQ0FBQztRQUFFNEQsSUFBSTtRQUFFbkYsWUFBWTtRQUFFRDtNQUFLLENBQUMsQ0FBQztJQUNqRCxDQUFDLENBQUM7RUFDSjtFQUNBLE9BQU9ELE1BQU07QUFDZjs7QUFFQTtBQUNPLFNBQVN1RixzQkFBc0JBLENBQUNwRyxHQUFHLEVBQUU7RUFDMUMsSUFBSWdCLE1BQU0sR0FBRyxJQUFBQyxnQkFBUSxFQUFDakIsR0FBRyxDQUFDO0VBRTFCLElBQUksQ0FBQ2dCLE1BQU0sQ0FBQ3FGLDZCQUE2QixFQUFFO0lBQ3pDLE1BQU0sSUFBSW5JLE1BQU0sQ0FBQ2lELGVBQWUsQ0FBQyw4Q0FBOEMsQ0FBQztFQUNsRjtFQUNBSCxNQUFNLEdBQUdBLE1BQU0sQ0FBQ3FGLDZCQUE2QjtFQUU3QyxJQUFJckYsTUFBTSxDQUFDNkIsUUFBUSxFQUFFO0lBQ25CLE9BQU83QixNQUFNLENBQUM2QixRQUFRO0VBQ3hCO0VBQ0EsTUFBTSxJQUFJM0UsTUFBTSxDQUFDaUQsZUFBZSxDQUFDLHlCQUF5QixDQUFDO0FBQzdEOztBQUVBO0FBQ08sU0FBU21GLHNCQUFzQkEsQ0FBQ3RHLEdBQUcsRUFBRTtFQUMxQyxJQUFJZ0IsTUFBTSxHQUFHLElBQUFDLGdCQUFRLEVBQUNqQixHQUFHLENBQUMsQ0FBQ3VHLDZCQUE2QjtFQUN4RCxJQUFJdkYsTUFBTSxDQUFDd0YsUUFBUSxFQUFFO0lBQ25CLElBQUlDLFFBQVEsR0FBRyxJQUFBdEUsZUFBTyxFQUFDbkIsTUFBTSxDQUFDd0YsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQzFDLElBQUkxQyxNQUFNLEdBQUcsSUFBQTNCLGVBQU8sRUFBQ25CLE1BQU0sQ0FBQzZDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUN0QyxJQUFJdEUsR0FBRyxHQUFHeUIsTUFBTSxDQUFDMkIsR0FBRztJQUNwQixJQUFJN0IsSUFBSSxHQUFHRSxNQUFNLENBQUNJLElBQUksQ0FBQ0MsT0FBTyxDQUFDLEtBQUssRUFBRSxFQUFFLENBQUMsQ0FDdENBLE9BQU8sQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLENBQ2xCQSxPQUFPLENBQUMsVUFBVSxFQUFFLEVBQUUsQ0FBQyxDQUN2QkEsT0FBTyxDQUFDLFVBQVUsRUFBRSxFQUFFLENBQUMsQ0FDdkJBLE9BQU8sQ0FBQyxTQUFTLEVBQUUsRUFBRSxDQUFDLENBQ3RCQSxPQUFPLENBQUMsU0FBUyxFQUFFLEVBQUUsQ0FBQztJQUV6QixPQUFPO01BQUVvRixRQUFRO01BQUUzQyxNQUFNO01BQUV2RSxHQUFHO01BQUV1QjtJQUFLLENBQUM7RUFDeEM7RUFDQTtFQUNBLElBQUlFLE1BQU0sQ0FBQzBGLElBQUksSUFBSTFGLE1BQU0sQ0FBQzJGLE9BQU8sRUFBRTtJQUNqQyxJQUFJQyxPQUFPLEdBQUcsSUFBQXpFLGVBQU8sRUFBQ25CLE1BQU0sQ0FBQzBGLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUNyQyxJQUFJRyxVQUFVLEdBQUcsSUFBQTFFLGVBQU8sRUFBQ25CLE1BQU0sQ0FBQzJGLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUMzQyxPQUFPO01BQUVDLE9BQU87TUFBRUM7SUFBVyxDQUFDO0VBQ2hDO0FBQ0Y7QUFFQSxNQUFNQyxhQUFhLEdBQUdBLENBQUNDLE9BQU8sRUFBRUMsSUFBSSxHQUFHLENBQUMsQ0FBQyxLQUFLO0VBQzVDLElBQUk7SUFBRXJFLEdBQUc7SUFBRXJCLFlBQVk7SUFBRUYsSUFBSTtJQUFFNkYsSUFBSTtJQUFFQyxTQUFTO0lBQUVDO0VBQVMsQ0FBQyxHQUFHSixPQUFPO0VBRXBFLElBQUksQ0FBQyxJQUFBSyxnQkFBUSxFQUFDSixJQUFJLENBQUMsRUFBRTtJQUNuQkEsSUFBSSxHQUFHLENBQUMsQ0FBQztFQUNYO0VBRUEsTUFBTWpELElBQUksR0FBRyxJQUFBeEIseUJBQWlCLEVBQUMsSUFBQUosZUFBTyxFQUFDUSxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztFQUMvQyxNQUFNNUIsWUFBWSxHQUFHLElBQUlRLElBQUksQ0FBQyxJQUFBWSxlQUFPLEVBQUNiLFlBQVksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0VBQ3ZELE1BQU1SLElBQUksR0FBRyxJQUFBdUcsb0JBQVksRUFBQyxJQUFBbEYsZUFBTyxFQUFDZixJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztFQUUzQyxPQUFPO0lBQ0wyQyxJQUFJO0lBQ0poRCxZQUFZO0lBQ1pELElBQUk7SUFDSndHLElBQUksRUFBRUwsSUFBSTtJQUNWTSxTQUFTLEVBQUVMLFNBQVM7SUFDcEJNLFFBQVEsRUFBRUwsUUFBUTtJQUNsQk0sY0FBYyxFQUFFVCxJQUFJLENBQUNVLGNBQWMsR0FBR1YsSUFBSSxDQUFDVSxjQUFjLEdBQUc7RUFDOUQsQ0FBQztBQUNILENBQUM7O0FBRUQ7QUFDTyxTQUFTQyxnQkFBZ0JBLENBQUMzSCxHQUFHLEVBQUU7RUFDcEMsSUFBSWEsTUFBTSxHQUFHO0lBQ1grRyxPQUFPLEVBQUUsRUFBRTtJQUNYakcsV0FBVyxFQUFFO0VBQ2YsQ0FBQztFQUNELElBQUlBLFdBQVcsR0FBRyxLQUFLO0VBQ3ZCLElBQUlrRyxVQUFVLEVBQUVDLG9CQUFvQjtFQUNwQyxNQUFNOUcsTUFBTSxHQUFHLElBQUFDLGdCQUFRLEVBQUNqQixHQUFHLENBQUM7RUFFNUIsTUFBTStILHlCQUF5QixHQUFJQyxjQUFjLElBQUs7SUFDcEQsSUFBSUEsY0FBYyxFQUFFO01BQ2xCLElBQUE3RixlQUFPLEVBQUM2RixjQUFjLENBQUMsQ0FBQzVGLE9BQU8sQ0FBRTZGLFlBQVksSUFBSztRQUNoRHBILE1BQU0sQ0FBQytHLE9BQU8sQ0FBQ3RGLElBQUksQ0FBQztVQUFFRCxNQUFNLEVBQUUsSUFBQUUseUJBQWlCLEVBQUMsSUFBQUosZUFBTyxFQUFDOEYsWUFBWSxDQUFDekYsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7VUFBRThFLElBQUksRUFBRTtRQUFFLENBQUMsQ0FBQztNQUM5RixDQUFDLENBQUM7SUFDSjtFQUNGLENBQUM7RUFFRCxNQUFNWSxnQkFBZ0IsR0FBR2xILE1BQU0sQ0FBQ21ILGdCQUFnQjtFQUNoRCxNQUFNQyxrQkFBa0IsR0FBR3BILE1BQU0sQ0FBQ3FILGtCQUFrQjtFQUVwRCxJQUFJSCxnQkFBZ0IsRUFBRTtJQUNwQixJQUFJQSxnQkFBZ0IsQ0FBQ3JHLFdBQVcsRUFBRTtNQUNoQ0YsV0FBVyxHQUFHdUcsZ0JBQWdCLENBQUNyRyxXQUFXO0lBQzVDO0lBQ0EsSUFBSXFHLGdCQUFnQixDQUFDSSxRQUFRLEVBQUU7TUFDN0IsSUFBQW5HLGVBQU8sRUFBQytGLGdCQUFnQixDQUFDSSxRQUFRLENBQUMsQ0FBQ2xHLE9BQU8sQ0FBRTJFLE9BQU8sSUFBSztRQUN0RCxNQUFNaEQsSUFBSSxHQUFHLElBQUF4Qix5QkFBaUIsRUFBQyxJQUFBSixlQUFPLEVBQUM0RSxPQUFPLENBQUNwRSxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUN2RCxNQUFNNUIsWUFBWSxHQUFHLElBQUlRLElBQUksQ0FBQyxJQUFBWSxlQUFPLEVBQUM0RSxPQUFPLENBQUN6RixZQUFZLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUMvRCxNQUFNUixJQUFJLEdBQUcsSUFBQXVHLG9CQUFZLEVBQUMsSUFBQWxGLGVBQU8sRUFBQzRFLE9BQU8sQ0FBQzNGLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ25ELE1BQU1rRyxJQUFJLEdBQUdQLE9BQU8sQ0FBQ0UsSUFBSTtRQUN6QnBHLE1BQU0sQ0FBQytHLE9BQU8sQ0FBQ3RGLElBQUksQ0FBQztVQUFFeUIsSUFBSTtVQUFFaEQsWUFBWTtVQUFFRCxJQUFJO1VBQUV3RztRQUFLLENBQUMsQ0FBQztNQUN6RCxDQUFDLENBQUM7SUFDSjtJQUVBLElBQUlZLGdCQUFnQixDQUFDSyxVQUFVLEVBQUU7TUFDL0JWLFVBQVUsR0FBR0ssZ0JBQWdCLENBQUNLLFVBQVU7SUFDMUM7SUFDQVIseUJBQXlCLENBQUNHLGdCQUFnQixDQUFDaEcsY0FBYyxDQUFDO0VBQzVEO0VBRUEsSUFBSWtHLGtCQUFrQixFQUFFO0lBQ3RCLElBQUlBLGtCQUFrQixDQUFDdkcsV0FBVyxFQUFFO01BQ2xDRixXQUFXLEdBQUd5RyxrQkFBa0IsQ0FBQ3ZHLFdBQVc7SUFDOUM7SUFFQSxJQUFJdUcsa0JBQWtCLENBQUNJLE9BQU8sRUFBRTtNQUM5QixJQUFBckcsZUFBTyxFQUFDaUcsa0JBQWtCLENBQUNJLE9BQU8sQ0FBQyxDQUFDcEcsT0FBTyxDQUFFMkUsT0FBTyxJQUFLO1FBQ3ZEbEcsTUFBTSxDQUFDK0csT0FBTyxDQUFDdEYsSUFBSSxDQUFDd0UsYUFBYSxDQUFDQyxPQUFPLENBQUMsQ0FBQztNQUM3QyxDQUFDLENBQUM7SUFDSjtJQUNBLElBQUlxQixrQkFBa0IsQ0FBQ0ssWUFBWSxFQUFFO01BQ25DLElBQUF0RyxlQUFPLEVBQUNpRyxrQkFBa0IsQ0FBQ0ssWUFBWSxDQUFDLENBQUNyRyxPQUFPLENBQUUyRSxPQUFPLElBQUs7UUFDNURsRyxNQUFNLENBQUMrRyxPQUFPLENBQUN0RixJQUFJLENBQUN3RSxhQUFhLENBQUNDLE9BQU8sRUFBRTtVQUFFVyxjQUFjLEVBQUU7UUFBSyxDQUFDLENBQUMsQ0FBQztNQUN2RSxDQUFDLENBQUM7SUFDSjtJQUVBLElBQUlVLGtCQUFrQixDQUFDdEcsYUFBYSxFQUFFO01BQ3BDZ0csb0JBQW9CLEdBQUdNLGtCQUFrQixDQUFDdEcsYUFBYTtJQUN6RDtJQUNBLElBQUlzRyxrQkFBa0IsQ0FBQ00sbUJBQW1CLEVBQUU7TUFDMUM3SCxNQUFNLENBQUM4SCxlQUFlLEdBQUdQLGtCQUFrQixDQUFDTSxtQkFBbUI7SUFDakU7SUFDQVgseUJBQXlCLENBQUNLLGtCQUFrQixDQUFDbEcsY0FBYyxDQUFDO0VBQzlEO0VBRUFyQixNQUFNLENBQUNjLFdBQVcsR0FBR0EsV0FBVztFQUNoQyxJQUFJQSxXQUFXLEVBQUU7SUFDZmQsTUFBTSxDQUFDZ0gsVUFBVSxHQUFHQyxvQkFBb0IsSUFBSUQsVUFBVTtFQUN4RDtFQUNBLE9BQU9oSCxNQUFNO0FBQ2Y7O0FBRUE7QUFDTyxTQUFTK0gsa0JBQWtCQSxDQUFDNUksR0FBRyxFQUFFO0VBQ3RDLElBQUlhLE1BQU0sR0FBRztJQUNYK0csT0FBTyxFQUFFLEVBQUU7SUFDWGpHLFdBQVcsRUFBRTtFQUNmLENBQUM7RUFDRCxJQUFJWCxNQUFNLEdBQUcsSUFBQUMsZ0JBQVEsRUFBQ2pCLEdBQUcsQ0FBQztFQUMxQixJQUFJLENBQUNnQixNQUFNLENBQUNtSCxnQkFBZ0IsRUFBRTtJQUM1QixNQUFNLElBQUlqSyxNQUFNLENBQUNpRCxlQUFlLENBQUMsaUNBQWlDLENBQUM7RUFDckU7RUFDQUgsTUFBTSxHQUFHQSxNQUFNLENBQUNtSCxnQkFBZ0I7RUFDaEMsSUFBSW5ILE1BQU0sQ0FBQ2EsV0FBVyxFQUFFO0lBQ3RCaEIsTUFBTSxDQUFDYyxXQUFXLEdBQUdYLE1BQU0sQ0FBQ2EsV0FBVztFQUN6QztFQUNBLElBQUliLE1BQU0sQ0FBQzZILHFCQUFxQixFQUFFO0lBQ2hDaEksTUFBTSxDQUFDaUkscUJBQXFCLEdBQUc5SCxNQUFNLENBQUM2SCxxQkFBcUI7RUFDN0Q7RUFDQSxJQUFJN0gsTUFBTSxDQUFDc0gsUUFBUSxFQUFFO0lBQ25CLElBQUFuRyxlQUFPLEVBQUNuQixNQUFNLENBQUNzSCxRQUFRLENBQUMsQ0FBQ2xHLE9BQU8sQ0FBRTJFLE9BQU8sSUFBSztNQUM1QyxJQUFJaEQsSUFBSSxHQUFHLElBQUF4Qix5QkFBaUIsRUFBQyxJQUFBSixlQUFPLEVBQUM0RSxPQUFPLENBQUNwRSxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztNQUNyRCxJQUFJNUIsWUFBWSxHQUFHLElBQUlRLElBQUksQ0FBQ3dGLE9BQU8sQ0FBQ3pGLFlBQVksQ0FBQztNQUNqRCxJQUFJUixJQUFJLEdBQUcsSUFBQXVHLG9CQUFZLEVBQUNOLE9BQU8sQ0FBQzNGLElBQUksQ0FBQztNQUNyQyxJQUFJa0csSUFBSSxHQUFHUCxPQUFPLENBQUNFLElBQUk7TUFDdkJwRyxNQUFNLENBQUMrRyxPQUFPLENBQUN0RixJQUFJLENBQUM7UUFBRXlCLElBQUk7UUFBRWhELFlBQVk7UUFBRUQsSUFBSTtRQUFFd0c7TUFBSyxDQUFDLENBQUM7SUFDekQsQ0FBQyxDQUFDO0VBQ0o7RUFDQSxJQUFJdEcsTUFBTSxDQUFDa0IsY0FBYyxFQUFFO0lBQ3pCLElBQUFDLGVBQU8sRUFBQ25CLE1BQU0sQ0FBQ2tCLGNBQWMsQ0FBQyxDQUFDRSxPQUFPLENBQUU2RixZQUFZLElBQUs7TUFDdkRwSCxNQUFNLENBQUMrRyxPQUFPLENBQUN0RixJQUFJLENBQUM7UUFBRUQsTUFBTSxFQUFFLElBQUFFLHlCQUFpQixFQUFDLElBQUFKLGVBQU8sRUFBQzhGLFlBQVksQ0FBQ3pGLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQUU4RSxJQUFJLEVBQUU7TUFBRSxDQUFDLENBQUM7SUFDOUYsQ0FBQyxDQUFDO0VBQ0o7RUFDQSxPQUFPekcsTUFBTTtBQUNmOztBQUVBO0FBQ08sU0FBU2tJLDhCQUE4QkEsQ0FBQy9JLEdBQUcsRUFBRTtFQUNsRCxJQUFJYSxNQUFNLEdBQUc7SUFDWCtHLE9BQU8sRUFBRSxFQUFFO0lBQ1hqRyxXQUFXLEVBQUU7RUFDZixDQUFDO0VBQ0QsSUFBSVgsTUFBTSxHQUFHLElBQUFDLGdCQUFRLEVBQUNqQixHQUFHLENBQUM7RUFDMUIsSUFBSSxDQUFDZ0IsTUFBTSxDQUFDbUgsZ0JBQWdCLEVBQUU7SUFDNUIsTUFBTSxJQUFJakssTUFBTSxDQUFDaUQsZUFBZSxDQUFDLGlDQUFpQyxDQUFDO0VBQ3JFO0VBQ0FILE1BQU0sR0FBR0EsTUFBTSxDQUFDbUgsZ0JBQWdCO0VBQ2hDLElBQUluSCxNQUFNLENBQUNhLFdBQVcsRUFBRTtJQUN0QmhCLE1BQU0sQ0FBQ2MsV0FBVyxHQUFHWCxNQUFNLENBQUNhLFdBQVc7RUFDekM7RUFDQSxJQUFJYixNQUFNLENBQUM2SCxxQkFBcUIsRUFBRTtJQUNoQ2hJLE1BQU0sQ0FBQ2lJLHFCQUFxQixHQUFHOUgsTUFBTSxDQUFDNkgscUJBQXFCO0VBQzdEO0VBRUEsSUFBSTdILE1BQU0sQ0FBQ3NILFFBQVEsRUFBRTtJQUNuQixJQUFBbkcsZUFBTyxFQUFDbkIsTUFBTSxDQUFDc0gsUUFBUSxDQUFDLENBQUNsRyxPQUFPLENBQUUyRSxPQUFPLElBQUs7TUFDNUMsSUFBSWhELElBQUksR0FBRyxJQUFBeEIseUJBQWlCLEVBQUN3RSxPQUFPLENBQUNwRSxHQUFHLENBQUM7TUFDekMsSUFBSTVCLFlBQVksR0FBRyxJQUFJUSxJQUFJLENBQUN3RixPQUFPLENBQUN6RixZQUFZLENBQUM7TUFDakQsSUFBSVIsSUFBSSxHQUFHLElBQUF1RyxvQkFBWSxFQUFDTixPQUFPLENBQUMzRixJQUFJLENBQUM7TUFDckMsSUFBSWtHLElBQUksR0FBR1AsT0FBTyxDQUFDRSxJQUFJO01BQ3ZCLElBQUkrQixRQUFRO01BQ1osSUFBSWpDLE9BQU8sQ0FBQ2tDLFlBQVksSUFBSSxJQUFJLEVBQUU7UUFDaENELFFBQVEsR0FBRyxJQUFBN0csZUFBTyxFQUFDNEUsT0FBTyxDQUFDa0MsWUFBWSxDQUFDLENBQUMsQ0FBQyxDQUFDO01BQzdDLENBQUMsTUFBTTtRQUNMRCxRQUFRLEdBQUcsSUFBSTtNQUNqQjtNQUNBbkksTUFBTSxDQUFDK0csT0FBTyxDQUFDdEYsSUFBSSxDQUFDO1FBQUV5QixJQUFJO1FBQUVoRCxZQUFZO1FBQUVELElBQUk7UUFBRXdHLElBQUk7UUFBRTBCO01BQVMsQ0FBQyxDQUFDO0lBQ25FLENBQUMsQ0FBQztFQUNKO0VBRUEsSUFBSWhJLE1BQU0sQ0FBQ2tCLGNBQWMsRUFBRTtJQUN6QixJQUFBQyxlQUFPLEVBQUNuQixNQUFNLENBQUNrQixjQUFjLENBQUMsQ0FBQ0UsT0FBTyxDQUFFNkYsWUFBWSxJQUFLO01BQ3ZEcEgsTUFBTSxDQUFDK0csT0FBTyxDQUFDdEYsSUFBSSxDQUFDO1FBQUVELE1BQU0sRUFBRSxJQUFBRSx5QkFBaUIsRUFBQyxJQUFBSixlQUFPLEVBQUM4RixZQUFZLENBQUN6RixNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUFFOEUsSUFBSSxFQUFFO01BQUUsQ0FBQyxDQUFDO0lBQzlGLENBQUMsQ0FBQztFQUNKO0VBQ0EsT0FBT3pHLE1BQU07QUFDZjtBQUVPLFNBQVNxSSwyQkFBMkJBLENBQUNsSixHQUFHLEVBQUU7RUFDL0MsSUFBSUcsTUFBTSxHQUFHLElBQUFjLGdCQUFRLEVBQUNqQixHQUFHLENBQUM7RUFDMUIsT0FBT0csTUFBTSxDQUFDZ0osdUJBQXVCO0FBQ3ZDO0FBRU8sU0FBU0MsWUFBWUEsQ0FBQ3BKLEdBQUcsRUFBRTtFQUNoQyxNQUFNRyxNQUFNLEdBQUcsSUFBQWMsZ0JBQVEsRUFBQ2pCLEdBQUcsQ0FBQztFQUM1QixJQUFJYSxNQUFNLEdBQUcsRUFBRTtFQUNmLElBQUlWLE1BQU0sQ0FBQ2tKLE9BQU8sSUFBSWxKLE1BQU0sQ0FBQ2tKLE9BQU8sQ0FBQ0MsTUFBTSxJQUFJbkosTUFBTSxDQUFDa0osT0FBTyxDQUFDQyxNQUFNLENBQUNDLEdBQUcsRUFBRTtJQUN4RSxNQUFNQyxTQUFTLEdBQUdySixNQUFNLENBQUNrSixPQUFPLENBQUNDLE1BQU0sQ0FBQ0MsR0FBRztJQUMzQztJQUNBLElBQUksSUFBQW5DLGdCQUFRLEVBQUNvQyxTQUFTLENBQUMsRUFBRTtNQUN2QjNJLE1BQU0sQ0FBQ3lCLElBQUksQ0FBQ2tILFNBQVMsQ0FBQztJQUN4QixDQUFDLE1BQU07TUFDTDNJLE1BQU0sR0FBRzJJLFNBQVM7SUFDcEI7RUFDRjtFQUNBLE9BQU8zSSxNQUFNO0FBQ2Y7QUFFTyxTQUFTNEksb0JBQW9CQSxDQUFDekosR0FBRyxFQUFFO0VBQ3hDLE1BQU1HLE1BQU0sR0FBRyxJQUFBYyxnQkFBUSxFQUFDakIsR0FBRyxDQUFDO0VBQzVCLE9BQU9HLE1BQU0sQ0FBQ3VKLHNCQUFzQjtBQUN0QztBQUVPLFNBQVNDLHFCQUFxQkEsQ0FBQzNKLEdBQUcsRUFBRTtFQUN6QyxNQUFNRyxNQUFNLEdBQUcsSUFBQWMsZ0JBQVEsRUFBQ2pCLEdBQUcsQ0FBQztFQUM1QixJQUFJNEosZ0JBQWdCLEdBQUcsQ0FBQyxDQUFDO0VBQ3pCLElBQUl6SixNQUFNLENBQUMwSix1QkFBdUIsRUFBRTtJQUNsQ0QsZ0JBQWdCLEdBQUc7TUFDakJFLGlCQUFpQixFQUFFM0osTUFBTSxDQUFDMEosdUJBQXVCLENBQUNFO0lBQ3BELENBQUM7SUFDRCxJQUFJQyxhQUFhO0lBQ2pCLElBQ0U3SixNQUFNLENBQUMwSix1QkFBdUIsSUFDOUIxSixNQUFNLENBQUMwSix1QkFBdUIsQ0FBQ0ksSUFBSSxJQUNuQzlKLE1BQU0sQ0FBQzBKLHVCQUF1QixDQUFDSSxJQUFJLENBQUNDLGdCQUFnQixFQUNwRDtNQUNBRixhQUFhLEdBQUc3SixNQUFNLENBQUMwSix1QkFBdUIsQ0FBQ0ksSUFBSSxDQUFDQyxnQkFBZ0IsSUFBSSxDQUFDLENBQUM7TUFDMUVOLGdCQUFnQixDQUFDTyxJQUFJLEdBQUdILGFBQWEsQ0FBQ0ksSUFBSTtJQUM1QztJQUNBLElBQUlKLGFBQWEsRUFBRTtNQUNqQixNQUFNSyxXQUFXLEdBQUdMLGFBQWEsQ0FBQ00sS0FBSztNQUN2QyxJQUFJRCxXQUFXLEVBQUU7UUFDZlQsZ0JBQWdCLENBQUNXLFFBQVEsR0FBR0YsV0FBVztRQUN2Q1QsZ0JBQWdCLENBQUNZLElBQUksR0FBR0MsOEJBQXdCLENBQUNDLEtBQUs7TUFDeEQsQ0FBQyxNQUFNO1FBQ0xkLGdCQUFnQixDQUFDVyxRQUFRLEdBQUdQLGFBQWEsQ0FBQ1csSUFBSTtRQUM5Q2YsZ0JBQWdCLENBQUNZLElBQUksR0FBR0MsOEJBQXdCLENBQUNHLElBQUk7TUFDdkQ7SUFDRjtJQUNBLE9BQU9oQixnQkFBZ0I7RUFDekI7QUFDRjtBQUVPLFNBQVNpQiwwQkFBMEJBLENBQUM3SyxHQUFHLEVBQUU7RUFDOUMsTUFBTUcsTUFBTSxHQUFHLElBQUFjLGdCQUFRLEVBQUNqQixHQUFHLENBQUM7RUFDNUIsTUFBTThLLGVBQWUsR0FBRzNLLE1BQU0sQ0FBQzRLLFNBQVM7RUFFeEMsT0FBTztJQUNMWixJQUFJLEVBQUVXLGVBQWUsQ0FBQ1YsSUFBSTtJQUMxQlksZUFBZSxFQUFFRixlQUFlLENBQUNHO0VBQ25DLENBQUM7QUFDSDtBQUVPLFNBQVNDLDJCQUEyQkEsQ0FBQ2xMLEdBQUcsRUFBRTtFQUMvQyxJQUFJbUwsU0FBUyxHQUFHLElBQUFsSyxnQkFBUSxFQUFDakIsR0FBRyxDQUFDO0VBQzdCLE9BQU9tTCxTQUFTO0FBQ2xCO0FBQ08sU0FBU0Msc0JBQXNCQSxDQUFDcEwsR0FBRyxFQUFFO0VBQzFDLE1BQU1HLE1BQU0sR0FBRyxJQUFBYyxnQkFBUSxFQUFDakIsR0FBRyxDQUFDO0VBQzVCLE1BQU1xTCxpQkFBaUIsR0FBRztJQUN4QkMsd0JBQXdCLEVBQUU7TUFDeEJDLElBQUksRUFBRXBMLE1BQU0sQ0FBQ21MLHdCQUF3QixDQUFDRSxJQUFJO01BQzFDQyxLQUFLLEVBQUUsSUFBQXRKLGVBQU8sRUFBQ2hDLE1BQU0sQ0FBQ21MLHdCQUF3QixDQUFDckIsSUFBSTtJQUNyRDtFQUNGLENBQUM7RUFDRCxPQUFPb0IsaUJBQWlCO0FBQzFCO0FBRU8sU0FBU0ssMEJBQTBCQSxDQUFDMUwsR0FBRyxFQUFFO0VBQzlDLE1BQU1HLE1BQU0sR0FBRyxJQUFBYyxnQkFBUSxFQUFDakIsR0FBRyxDQUFDO0VBQzVCLE9BQU9HLE1BQU0sQ0FBQ3dMLFNBQVM7QUFDekI7QUFFTyxTQUFTQyxnQkFBZ0JBLENBQUM1TCxHQUFHLEVBQUU7RUFDcEMsTUFBTUcsTUFBTSxHQUFHLElBQUFjLGdCQUFRLEVBQUNqQixHQUFHLENBQUM7RUFDNUIsTUFBTTZMLE1BQU0sR0FBRzFMLE1BQU0sQ0FBQzJMLGNBQWM7RUFDcEMsT0FBT0QsTUFBTTtBQUNmO0FBRU8sU0FBU0UsbUJBQW1CQSxDQUFDL0wsR0FBRyxFQUFFO0VBQ3ZDLE1BQU1HLE1BQU0sR0FBRyxJQUFBYyxnQkFBUSxFQUFDakIsR0FBRyxDQUFDO0VBQzVCLElBQUlHLE1BQU0sQ0FBQzZMLFlBQVksSUFBSTdMLE1BQU0sQ0FBQzZMLFlBQVksQ0FBQzNMLEtBQUssRUFBRTtJQUNwRDtJQUNBLE9BQU8sSUFBQThCLGVBQU8sRUFBQ2hDLE1BQU0sQ0FBQzZMLFlBQVksQ0FBQzNMLEtBQUssQ0FBQztFQUMzQztFQUNBLE9BQU8sRUFBRTtBQUNYO0FBRU8sU0FBUzRMLGdDQUFnQ0EsQ0FBQ0MsR0FBRyxFQUFFO0VBQ3BEO0VBQ0EsU0FBU0MsaUJBQWlCQSxDQUFDQyxNQUFNLEVBQUU7SUFDakMsTUFBTUMsYUFBYSxHQUFHQyxNQUFNLENBQUNDLElBQUksQ0FBQ0gsTUFBTSxDQUFDSSxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQ0MsU0FBUyxDQUFDLENBQUM7SUFDN0QsTUFBTUMsdUJBQXVCLEdBQUdKLE1BQU0sQ0FBQ0MsSUFBSSxDQUFDSCxNQUFNLENBQUNJLElBQUksQ0FBQ0gsYUFBYSxDQUFDLENBQUMsQ0FBQ00sUUFBUSxDQUFDLENBQUM7SUFDbEYsTUFBTUMsZ0JBQWdCLEdBQUcsQ0FBQ0YsdUJBQXVCLElBQUksRUFBRSxFQUFFRyxLQUFLLENBQUMsR0FBRyxDQUFDO0lBQ25FLE1BQU1DLFVBQVUsR0FBR0YsZ0JBQWdCLENBQUNHLE1BQU0sSUFBSSxDQUFDLEdBQUdILGdCQUFnQixDQUFDLENBQUMsQ0FBQyxHQUFHLEVBQUU7SUFDMUUsT0FBT0UsVUFBVTtFQUNuQjtFQUVBLFNBQVNFLGtCQUFrQkEsQ0FBQ1osTUFBTSxFQUFFO0lBQ2xDLE1BQU1hLE9BQU8sR0FBR1gsTUFBTSxDQUFDQyxJQUFJLENBQUNILE1BQU0sQ0FBQ0ksSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUNVLFlBQVksQ0FBQyxDQUFDO0lBQzFELE1BQU1DLFFBQVEsR0FBR2IsTUFBTSxDQUFDQyxJQUFJLENBQUNILE1BQU0sQ0FBQ0ksSUFBSSxDQUFDUyxPQUFPLENBQUMsQ0FBQyxDQUFDTixRQUFRLENBQUMsQ0FBQztJQUM3RCxPQUFPUSxRQUFRO0VBQ2pCO0VBRUEsTUFBTUMsYUFBYSxHQUFHLElBQUlDLHNCQUFhLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBQzs7RUFFNUMsTUFBTUMsY0FBYyxHQUFHLElBQUFDLHNCQUFjLEVBQUNyQixHQUFHLENBQUMsRUFBQztFQUMzQyxPQUFPb0IsY0FBYyxDQUFDRSxjQUFjLENBQUNULE1BQU0sRUFBRTtJQUMzQztJQUNBLElBQUlVLGlCQUFpQixFQUFDOztJQUV0QixNQUFNQyxxQkFBcUIsR0FBR3BCLE1BQU0sQ0FBQ0MsSUFBSSxDQUFDZSxjQUFjLENBQUNkLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUNqRWlCLGlCQUFpQixHQUFHRSxVQUFLLENBQUNELHFCQUFxQixDQUFDO0lBRWhELE1BQU1FLGlCQUFpQixHQUFHdEIsTUFBTSxDQUFDQyxJQUFJLENBQUNlLGNBQWMsQ0FBQ2QsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQzdEaUIsaUJBQWlCLEdBQUdFLFVBQUssQ0FBQ0MsaUJBQWlCLEVBQUVILGlCQUFpQixDQUFDO0lBRS9ELE1BQU1JLG9CQUFvQixHQUFHSixpQkFBaUIsQ0FBQ0ssV0FBVyxDQUFDLENBQUMsRUFBQzs7SUFFN0QsTUFBTUMsZ0JBQWdCLEdBQUd6QixNQUFNLENBQUNDLElBQUksQ0FBQ2UsY0FBYyxDQUFDZCxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBQztJQUM3RGlCLGlCQUFpQixHQUFHRSxVQUFLLENBQUNJLGdCQUFnQixFQUFFTixpQkFBaUIsQ0FBQztJQUU5RCxNQUFNTyxjQUFjLEdBQUdOLHFCQUFxQixDQUFDSSxXQUFXLENBQUMsQ0FBQztJQUMxRCxNQUFNRyxZQUFZLEdBQUdMLGlCQUFpQixDQUFDRSxXQUFXLENBQUMsQ0FBQztJQUNwRCxNQUFNSSxtQkFBbUIsR0FBR0gsZ0JBQWdCLENBQUNELFdBQVcsQ0FBQyxDQUFDO0lBRTFELElBQUlJLG1CQUFtQixLQUFLTCxvQkFBb0IsRUFBRTtNQUNoRDtNQUNBLE1BQU0sSUFBSXhOLEtBQUssQ0FDWiw0Q0FBMkM2TixtQkFBb0IsbUNBQWtDTCxvQkFBcUIsRUFDekgsQ0FBQztJQUNIO0lBRUEsTUFBTU0sT0FBTyxHQUFHLENBQUMsQ0FBQztJQUNsQixJQUFJRixZQUFZLEdBQUcsQ0FBQyxFQUFFO01BQ3BCLE1BQU1HLFdBQVcsR0FBRzlCLE1BQU0sQ0FBQ0MsSUFBSSxDQUFDZSxjQUFjLENBQUNkLElBQUksQ0FBQ3lCLFlBQVksQ0FBQyxDQUFDO01BQ2xFUixpQkFBaUIsR0FBR0UsVUFBSyxDQUFDUyxXQUFXLEVBQUVYLGlCQUFpQixDQUFDO01BQ3pELE1BQU1ZLGtCQUFrQixHQUFHLElBQUFkLHNCQUFjLEVBQUNhLFdBQVcsQ0FBQztNQUN0RCxPQUFPQyxrQkFBa0IsQ0FBQ2IsY0FBYyxDQUFDVCxNQUFNLEVBQUU7UUFDL0MsSUFBSXVCLGNBQWMsR0FBR25DLGlCQUFpQixDQUFDa0Msa0JBQWtCLENBQUM7UUFDMURBLGtCQUFrQixDQUFDN0IsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFDO1FBQzNCMkIsT0FBTyxDQUFDRyxjQUFjLENBQUMsR0FBR3RCLGtCQUFrQixDQUFDcUIsa0JBQWtCLENBQUM7TUFDbEU7SUFDRjtJQUVBLElBQUlFLGFBQWE7SUFDakIsTUFBTUMsYUFBYSxHQUFHUixjQUFjLEdBQUdDLFlBQVksR0FBRyxFQUFFO0lBQ3hELElBQUlPLGFBQWEsR0FBRyxDQUFDLEVBQUU7TUFDckIsTUFBTUMsYUFBYSxHQUFHbkMsTUFBTSxDQUFDQyxJQUFJLENBQUNlLGNBQWMsQ0FBQ2QsSUFBSSxDQUFDZ0MsYUFBYSxDQUFDLENBQUM7TUFDckVmLGlCQUFpQixHQUFHRSxVQUFLLENBQUNjLGFBQWEsRUFBRWhCLGlCQUFpQixDQUFDO01BQzNEO01BQ0EsTUFBTWlCLG1CQUFtQixHQUFHcEMsTUFBTSxDQUFDQyxJQUFJLENBQUNlLGNBQWMsQ0FBQ2QsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUNzQixXQUFXLENBQUMsQ0FBQztNQUM3RSxNQUFNYSxhQUFhLEdBQUdsQixpQkFBaUIsQ0FBQ0ssV0FBVyxDQUFDLENBQUM7TUFDckQ7TUFDQSxJQUFJWSxtQkFBbUIsS0FBS0MsYUFBYSxFQUFFO1FBQ3pDLE1BQU0sSUFBSXRPLEtBQUssQ0FDWiw2Q0FBNENxTyxtQkFBb0IsbUNBQWtDQyxhQUFjLEVBQ25ILENBQUM7TUFDSDtNQUNBSixhQUFhLEdBQUcsSUFBQWhCLHNCQUFjLEVBQUNrQixhQUFhLENBQUM7SUFDL0M7SUFFQSxNQUFNRyxXQUFXLEdBQUdULE9BQU8sQ0FBQyxjQUFjLENBQUM7SUFFM0MsUUFBUVMsV0FBVztNQUNqQixLQUFLLE9BQU87UUFBRTtVQUNaLE1BQU1DLFlBQVksR0FBR1YsT0FBTyxDQUFDLFlBQVksQ0FBQyxHQUFHLElBQUksR0FBR0EsT0FBTyxDQUFDLGVBQWUsQ0FBQyxHQUFHLEdBQUc7VUFDbEYsTUFBTSxJQUFJOU4sS0FBSyxDQUFDd08sWUFBWSxDQUFDO1FBQy9CO01BQ0EsS0FBSyxPQUFPO1FBQUU7VUFDWixNQUFNQyxXQUFXLEdBQUdYLE9BQU8sQ0FBQyxjQUFjLENBQUM7VUFDM0MsTUFBTVksU0FBUyxHQUFHWixPQUFPLENBQUMsWUFBWSxDQUFDO1VBRXZDLFFBQVFZLFNBQVM7WUFDZixLQUFLLEtBQUs7Y0FBRTtnQkFDVjNCLGFBQWEsQ0FBQzRCLFdBQVcsQ0FBQzlDLEdBQUcsQ0FBQztnQkFDOUIsT0FBT2tCLGFBQWE7Y0FDdEI7WUFFQSxLQUFLLFNBQVM7Y0FBRTtnQkFDZCxNQUFNNkIsUUFBUSxHQUFHVixhQUFhLENBQUMvQixJQUFJLENBQUNnQyxhQUFhLENBQUM7Z0JBQ2xEcEIsYUFBYSxDQUFDOEIsVUFBVSxDQUFDRCxRQUFRLENBQUM7Z0JBQ2xDO2NBQ0Y7WUFFQSxLQUFLLFVBQVU7Y0FDYjtnQkFDRSxRQUFRSCxXQUFXO2tCQUNqQixLQUFLLFVBQVU7b0JBQUU7c0JBQ2YsTUFBTUssWUFBWSxHQUFHWixhQUFhLENBQUMvQixJQUFJLENBQUNnQyxhQUFhLENBQUM7c0JBQ3REcEIsYUFBYSxDQUFDZ0MsV0FBVyxDQUFDRCxZQUFZLENBQUN4QyxRQUFRLENBQUMsQ0FBQyxDQUFDO3NCQUNsRDtvQkFDRjtrQkFDQTtvQkFBUztzQkFDUCxNQUFNa0MsWUFBWSxHQUFJLDJCQUEwQkMsV0FBWSwrQkFBOEI7c0JBQzFGLE1BQU0sSUFBSXpPLEtBQUssQ0FBQ3dPLFlBQVksQ0FBQztvQkFDL0I7Z0JBQ0Y7Y0FDRjtjQUNBO1lBQ0YsS0FBSyxPQUFPO2NBQ1Y7Z0JBQ0UsUUFBUUMsV0FBVztrQkFDakIsS0FBSyxVQUFVO29CQUFFO3NCQUNmLE1BQU1PLFNBQVMsR0FBR2QsYUFBYSxDQUFDL0IsSUFBSSxDQUFDZ0MsYUFBYSxDQUFDO3NCQUNuRHBCLGFBQWEsQ0FBQ2tDLFFBQVEsQ0FBQ0QsU0FBUyxDQUFDMUMsUUFBUSxDQUFDLENBQUMsQ0FBQztzQkFDNUM7b0JBQ0Y7a0JBQ0E7b0JBQVM7c0JBQ1AsTUFBTWtDLFlBQVksR0FBSSwyQkFBMEJDLFdBQVksNEJBQTJCO3NCQUN2RixNQUFNLElBQUl6TyxLQUFLLENBQUN3TyxZQUFZLENBQUM7b0JBQy9CO2dCQUNGO2NBQ0Y7Y0FDQTtZQUNGO2NBQVM7Z0JBQ1A7Z0JBQ0E7Z0JBQ0EsTUFBTVUsY0FBYyxHQUFJLGtDQUFpQ1gsV0FBWSxHQUFFO2dCQUN2RTtnQkFDQVksT0FBTyxDQUFDQyxJQUFJLENBQUNGLGNBQWMsQ0FBQztjQUM5QjtVQUNGLENBQUMsQ0FBQztRQUNKO01BQUU7SUFDSixDQUFDLENBQUM7RUFDSixDQUFDLENBQUM7QUFDSiJ9