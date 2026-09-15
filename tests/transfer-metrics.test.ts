import {describe,it,expect,vi} from 'vitest';
// These pure calculations must not initialize the runtime environment or poll storage.
vi.mock('../packages/config/index.js',()=>({env:{}}));
import {parseTraffic,trafficRate} from '../apps/api/src/transfer-metrics.js';
describe('storage traffic accounting',()=>{
 it('isolates the configured bucket from other storage traffic',()=>{
  const input='SeaweedFS_s3_bucket_traffic_received_bytes_total{bucket="other"} 999999\nSeaweedFS_s3_bucket_traffic_received_bytes_total{bucket="astrafile"} 1048576\nSeaweedFS_s3_bucket_traffic_sent_bytes_total{bucket="astrafile"} 2.097152e+06';
  expect(parseTraffic(input,'astrafile',100)).toEqual({received:1048576,sent:2097152,at:100});
  expect(()=>parseTraffic('<html>proxy failure</html>','astrafile')).toThrow();
 });
 it('does not invent throughput at startup or after a counter reset',()=>{
  const previous={received:500,sent:1000,at:10000};
  expect(trafficRate(undefined,previous)).toBeNull();
  expect(trafficRate(previous,{received:200,sent:500,at:20000})).toBeNull();
  expect(trafficRate(previous,{received:1500,sent:3000,at:20000})).toEqual({uploadBytesPerSecond:100,downloadBytesPerSecond:200,windowSeconds:10});
 });
});
