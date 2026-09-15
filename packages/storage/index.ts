import {S3Client,CreateMultipartUploadCommand,UploadPartCommand,ListPartsCommand,CompleteMultipartUploadCommand,AbortMultipartUploadCommand,HeadObjectCommand,GetObjectCommand,DeleteObjectCommand,HeadBucketCommand,ListObjectsV2Command,ListMultipartUploadsCommand} from '@aws-sdk/client-s3';
import {getSignedUrl} from '@aws-sdk/s3-request-presigner';
import {env} from '../config/index.js';
import {contentDisposition} from '../validation/index.js';
const options={region:env.S3_REGION,forcePathStyle:true,credentials:{accessKeyId:env.S3_ACCESS_KEY,secretAccessKey:env.S3_SECRET_KEY},requestChecksumCalculation:'WHEN_REQUIRED' as const,responseChecksumValidation:'WHEN_REQUIRED' as const,maxAttempts:4};
export const s3=new S3Client({...options,endpoint:env.S3_ENDPOINT});
const publicS3=new S3Client({...options,endpoint:env.S3_PUBLIC_ENDPOINT});
const Bucket=env.S3_BUCKET;
export type StoragePart={number:number;size:number;etag:string;checksum?:string};
export interface ObjectStore {
 create(key:string):Promise<string>;
 signPart(key:string,uploadId:string,number:number,size:number,checksum:string):Promise<string>;
 listParts(key:string,uploadId:string):Promise<StoragePart[]>;
 complete(key:string,uploadId:string,parts:StoragePart[]):Promise<void>;
 abort(key:string,uploadId:string):Promise<void>;
 head(key:string):Promise<{size:number;etag:string;checksum?:string}>;
 download(key:string,name:string,mime:string,inline?:boolean):Promise<string>;
 remove(key:string):Promise<void>;
 health():Promise<void>;
}
export class S3ObjectStore implements ObjectStore {
 async create(Key:string){const r=await s3.send(new CreateMultipartUploadCommand({Bucket,Key,ContentType:'application/octet-stream',ChecksumAlgorithm:'SHA256'}));if(!r.UploadId)throw Error('Storage did not create upload');return r.UploadId;}
 async signPart(Key:string,UploadId:string,PartNumber:number,ContentLength:number,ChecksumSHA256:string){return getSignedUrl(publicS3,new UploadPartCommand({Bucket,Key,UploadId,PartNumber,ContentLength,ChecksumSHA256}),{expiresIn:900,unhoistableHeaders:new Set(['x-amz-checksum-sha256']),signableHeaders:new Set(['content-length'])});}
 async listParts(Key:string,UploadId:string){const parts:StoragePart[]=[];let marker:string|undefined;do{const r=await s3.send(new ListPartsCommand({Bucket,Key,UploadId,PartNumberMarker:marker}));for(const p of r.Parts??[])parts.push({number:p.PartNumber!,size:p.Size!,etag:p.ETag!,checksum:p.ChecksumSHA256});marker=r.IsTruncated?r.NextPartNumberMarker:undefined;}while(marker);return parts.sort((a,b)=>a.number-b.number);}
 async complete(Key:string,UploadId:string,parts:StoragePart[]){await s3.send(new CompleteMultipartUploadCommand({Bucket,Key,UploadId,MultipartUpload:{Parts:parts.map(p=>({PartNumber:p.number,ETag:p.etag,ChecksumSHA256:p.checksum}))}}));}
 async abort(Key:string,UploadId:string){try{await s3.send(new AbortMultipartUploadCommand({Bucket,Key,UploadId}));}catch(e){if((e as {name:string}).name!=='NoSuchUpload')throw e;}}
 async head(Key:string){const r=await s3.send(new HeadObjectCommand({Bucket,Key,ChecksumMode:'ENABLED'}));return {size:r.ContentLength!,etag:r.ETag!,checksum:r.ChecksumSHA256};}
 async download(Key:string,name:string,mime:string,inline=false){return getSignedUrl(publicS3,new GetObjectCommand({Bucket,Key,ResponseContentDisposition:contentDisposition(name,inline),ResponseContentType:mime,ResponseCacheControl:'private, no-store'}),{expiresIn:900});}
 async remove(Key:string){if(!/^objects\/[a-f0-9-]{36}$/.test(Key))throw Error('Object is outside AstraFile namespace');await s3.send(new DeleteObjectCommand({Bucket,Key}));}
 async health(){await s3.send(new HeadBucketCommand({Bucket}));}
 async prefix(Key:string,bytes=8192){const r=await s3.send(new GetObjectCommand({Bucket,Key,Range:`bytes=0-${bytes-1}`}));return r.Body!.transformToByteArray();}
 async stream(Key:string){return (await s3.send(new GetObjectCommand({Bucket,Key}))).Body!;}
 async *objects(){let token:string|undefined;do{const r=await s3.send(new ListObjectsV2Command({Bucket,Prefix:'objects/',ContinuationToken:token}));for(const o of r.Contents??[])yield o;token=r.IsTruncated?r.NextContinuationToken:undefined;}while(token);}
 async *multipart(){let keyMarker:string|undefined,uploadMarker:string|undefined;do{const r=await s3.send(new ListMultipartUploadsCommand({Bucket,Prefix:'objects/',KeyMarker:keyMarker,UploadIdMarker:uploadMarker}));for(const u of r.Uploads??[])yield u;keyMarker=r.IsTruncated?r.NextKeyMarker:undefined;uploadMarker=r.IsTruncated?r.NextUploadIdMarker:undefined;}while(keyMarker);}
}
export const storage=new S3ObjectStore();
