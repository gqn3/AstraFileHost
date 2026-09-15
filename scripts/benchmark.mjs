import {mkdir,open,realpath,unlink,writeFile} from 'node:fs/promises';
import {randomBytes,createHash} from 'node:crypto';
import path from 'node:path';
const root=await realpath('.');
const directory=path.join(root,'.local','benchmarks');await mkdir(directory,{recursive:true});
const resolved=await realpath(directory);if(!resolved.startsWith(root+path.sep))throw Error('Benchmark directory is outside AstraFile');
const filename=path.join(resolved,`astrafile-benchmark-${Date.now()}.bin`),size=1024**3,chunkSize=16*1024**2;
let handle;const expected=createHash('sha256');let writeMs=0,readMs=0;const cpuStart=process.cpuUsage();
try{
 handle=await open(filename,'wx');
 for(let position=0;position<size;position+=chunkSize){const buffer=randomBytes(chunkSize);expected.update(buffer);const start=performance.now();let done=0;while(done<buffer.length){const {bytesWritten}=await handle.write(buffer,done,buffer.length-done,position+done);if(!bytesWritten)throw Error('Short disk write');done+=bytesWritten;}writeMs+=performance.now()-start;}
 const syncStart=performance.now();await handle.sync();writeMs+=performance.now()-syncStart;await handle.close();handle=await open(filename,'r');
 const actual=createHash('sha256'),buffer=Buffer.allocUnsafe(chunkSize);let position=0;
 while(position<size){const start=performance.now();const {bytesRead}=await handle.read(buffer,0,buffer.length,position);readMs+=performance.now()-start;if(!bytesRead)throw Error('Short disk read');actual.update(buffer.subarray(0,bytesRead));position+=bytesRead;}
 if(actual.digest('hex')!==expected.digest('hex'))throw Error('Disk checksum mismatch');
 const cpu=process.cpuUsage(cpuStart);const result={date:new Date().toISOString(),environment:'Local Windows C: filesystem; OS cache remains enabled; not target-server disk performance',bytes:size,randomData:true,writeIncludesFsync:true,cachedRead:true,writeMBps:size/writeMs/1000,readMBps:size/readMs/1000,checksumMatched:true,processCpuSeconds:(cpu.user+cpu.system)/1e6};
 await mkdir('output/verification',{recursive:true});await writeFile('output/verification/disk.json',JSON.stringify(result,null,2));console.info(JSON.stringify(result));
}finally{await handle?.close();await unlink(filename);}
