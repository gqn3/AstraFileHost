import {CreateBucketCommand,PutBucketCorsCommand,HeadBucketCommand} from '@aws-sdk/client-s3';
import {s3} from '../packages/storage/index.js';
import {env} from '../packages/config/index.js';
try{await s3.send(new HeadBucketCommand({Bucket:env.S3_BUCKET}));}catch(e){if((e as {$metadata?:{httpStatusCode:number}}).$metadata?.httpStatusCode!==404)throw e;await s3.send(new CreateBucketCommand({Bucket:env.S3_BUCKET}));}
await s3.send(new PutBucketCorsCommand({Bucket:env.S3_BUCKET,CORSConfiguration:{CORSRules:[{AllowedOrigins:[env.APP_ORIGIN],AllowedMethods:['GET','HEAD','PUT'],AllowedHeaders:['content-type','x-amz-checksum-sha256','range'],ExposeHeaders:['ETag','Content-Length','Content-Range','Accept-Ranges','x-amz-checksum-sha256'],MaxAgeSeconds:600}]}}));
console.info('Private AstraFile bucket initialized; CORS is restricted to APP_ORIGIN.');
s3.destroy();
