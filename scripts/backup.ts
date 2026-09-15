import {createMetadataBackup,verifyMetadataBackup} from '../packages/database/backup.js';
import path from 'node:path';
const result=await createMetadataBackup(process.env.BACKUP_DIR??'/backups');
const verification=process.argv.includes('--verify')?await verifyMetadataBackup(result.file):{restoreVerified:false};
console.info(JSON.stringify({file:path.basename(result.file),bytes:result.bytes,...verification}));
