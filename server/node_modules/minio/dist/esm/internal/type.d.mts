/// <reference types="node" />
/// <reference types="node" />
import type * as http from 'node:http';
export type Binary = string | Buffer;
export type ResponseHeader = Record<string, string>;
export type ObjectMetaData = Record<string, string | number>;
export type RequestHeaders = Record<string, string | boolean | number | undefined>;
export type Encryption = {
  type: ENCRYPTION_TYPES.SSEC;
} | {
  type: ENCRYPTION_TYPES.KMS;
  SSEAlgorithm?: string;
  KMSMasterKeyID?: string;
};
export declare enum ENCRYPTION_TYPES {
  /**
   * SSEC represents server-side-encryption with customer provided keys
   */
  SSEC = "SSE-C",
  /**
   * KMS represents server-side-encryption with managed keys
   */
  KMS = "KMS",
}
export declare enum RETENTION_MODES {
  GOVERNANCE = "GOVERNANCE",
  COMPLIANCE = "COMPLIANCE",
}
export declare enum RETENTION_VALIDITY_UNITS {
  DAYS = "Days",
  YEARS = "Years",
}
export declare enum LEGAL_HOLD_STATUS {
  ENABLED = "ON",
  DISABLED = "OFF",
}
export type Transport = Pick<typeof http, 'request'>;
export interface IRequest {
  protocol: string;
  port?: number | string;
  method: string;
  path: string;
  headers: RequestHeaders;
}
export type ICanonicalRequest = string;