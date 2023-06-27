/// <reference types="node" />
/// <reference types="node" />
import * as http from 'node:http';
import * as https from 'node:https';
import { CredentialProvider } from "../CredentialProvider.mjs";
import type { Region } from "./s3-endpoints.mjs";
import type { IRequest, Transport } from "./type.mjs";
declare const requestOptionProperties: readonly ["agent", "ca", "cert", "ciphers", "clientCertEngine", "crl", "dhparam", "ecdhCurve", "family", "honorCipherOrder", "key", "passphrase", "pfx", "rejectUnauthorized", "secureOptions", "secureProtocol", "servername", "sessionIdContext"];
export interface ClientOptions {
  endPoint: string;
  accessKey: string;
  secretKey: string;
  useSSL?: boolean;
  port?: number;
  region?: Region;
  transport?: Transport;
  sessionToken?: string;
  partSize?: number;
  pathStyle?: boolean;
  credentialsProvider?: CredentialProvider;
  s3AccelerateEndpoint?: string;
  transportAgent?: http.Agent;
}
export type RequestOption = Partial<IRequest> & {
  method: string;
  bucketName?: string;
  objectName?: string;
  region?: string;
  query?: string;
  pathStyle?: boolean;
};
export declare class TypedClient {
  protected transport: Transport;
  protected host: string;
  protected port: number;
  protected protocol: string;
  protected accessKey: string;
  protected secretKey: string;
  protected sessionToken?: string;
  protected userAgent: string;
  protected anonymous: boolean;
  protected pathStyle: boolean;
  protected regionMap: Record<string, string>;
  region?: string;
  protected credentialsProvider?: CredentialProvider;
  partSize: number;
  protected overRidePartSize?: boolean;
  protected maximumPartSize: number;
  protected maxObjectSize: number;
  enableSHA256: boolean;
  protected s3AccelerateEndpoint?: string;
  protected reqOptions: Record<string, unknown>;
  protected transportAgent: http.Agent;
  constructor(params: ClientOptions);
  /**
   * @param endPoint - valid S3 acceleration end point
   */
  setS3TransferAccelerate(endPoint: string): void;
  /**
   * Sets the supported request options.
   */
  setRequestOptions(options: Pick<https.RequestOptions, (typeof requestOptionProperties)[number]>): void;
  /**
   *  This is s3 Specific and does not hold validity in any other Object storage.
   */
  private getAccelerateEndPointIfSet;
  /**
   * returns options object that can be used with http.request()
   * Takes care of constructing virtual-host-style or path-style hostname
   */
  protected getRequestOptions(opts: RequestOption): IRequest & {
    host: string;
    headers: Record<string, string>;
  };
  setCredentialsProvider(credentialsProvider: CredentialProvider): Promise<void>;
  private checkAndRefreshCreds;
}
export {};