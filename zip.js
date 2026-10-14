/* Minimal, dependency-free ZIP reader and STORE-only writer. Designed for user-selected PBIP archives and DOCX. */
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const MAX_FILES = 6000, MAX_TOTAL = 160 * 1024 * 1024, MAX_FILE = 35 * 1024 * 1024;
function u16(v,o){return v.getUint16(o,true)}
function u32(v,o){return v.getUint32(o,true)}
const makeView = b => new DataView(b.buffer,b.byteOffset,b.byteLength);
function crcTable(){const t=[];for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;t[n]=c>>>0}return t}
const TABLE=crcTable();
function crc32(data){let c=0xffffffff;for(const byte of data)c=TABLE[(c^byte)&255]^(c>>>8);return (c^0xffffffff)>>>0}
function normalisePath(s){const p=s.replaceAll('\\','/').replace(/^\.\//,'');if(p.startsWith('/')||p.split('/').some(x=>x==='..')||/^[a-z]:/i.test(p))throw Error('Unsafe archive path was rejected');return p}
async function readZip(arrayBuffer){
 const b=new Uint8Array(arrayBuffer),v=makeView(b);let end=-1;for(let i=b.length-22;i>=Math.max(0,b.length-65557);i--){if(u32(v,i)===0x06054b50){end=i;break}}
 if(end<0)throw Error('Not a valid ZIP archive (ZIP directory not found)');
 const count=u16(v,end+10),offset=u32(v,end+16);if(count===65535||offset===0xffffffff)throw Error('ZIP64 archives are not currently supported');
 if(count>MAX_FILES)throw Error(`Archive contains more than ${MAX_FILES} files`);
 const files=[],seen=new Set();let pos=offset,total=0;
 for(let i=0;i<count;i++){
  if(pos+46>b.length||u32(v,pos)!==0x02014b50)throw Error('Invalid ZIP central directory');
  const flags=u16(v,pos+8),method=u16(v,pos+10),crc=u32(v,pos+16),size=u32(v,pos+20),uncompressed=u32(v,pos+24),nameLen=u16(v,pos+28),extra=u16(v,pos+30),comment=u16(v,pos+32),localOffset=u32(v,pos+42);
  if(pos+46+nameLen+extra+comment>b.length)throw Error('Truncated ZIP entry');
  const name=normalisePath(decoder.decode(b.slice(pos+46,pos+46+nameLen)));
  pos+=46+nameLen+extra+comment;
  if(name.endsWith('/'))continue;
  if(flags&1)throw Error('Encrypted ZIP files are not supported');
  if(method!==0&&method!==8)throw Error('Unsupported ZIP compression method');
  if(size>MAX_FILE||uncompressed>MAX_FILE||(total+=uncompressed)>MAX_TOTAL)throw Error('Archive exceeds safe size limits');
  if(seen.has(name.toLowerCase()))throw Error('Duplicate archive entry');seen.add(name.toLowerCase());
  if(localOffset+30>b.length||u32(v,localOffset)!==0x04034b50)throw Error('Broken ZIP local header');
  const start=localOffset+30+u16(v,localOffset+26)+u16(v,localOffset+28);
  if(start+size>b.length)throw Error('Truncated ZIP file');
  files.push({name, method, crc,size,uncompressed,data:b.subarray(start,start+size)});
 }
 const items=[];
 for(const f of files){
  let data;
  if(f.method===0)data=f.data.slice();
  else {
   if(typeof DecompressionStream==='undefined')throw Error('Your browser cannot decompress ZIP files. Try uploading the project folder instead.');
   try{const stream=new Blob([f.data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));const reader=stream.getReader(),parts=[];let totalBytes=0;while(true){const {value,done}=await reader.read();if(done)break;totalBytes+=value.byteLength;if(totalBytes>MAX_FILE||totalBytes>f.uncompressed){await reader.cancel();throw Error('Decompressed content exceeds declared archive size')}parts.push(value)}data=new Uint8Array(totalBytes);let at=0;for(const part of parts){data.set(part,at);at+=part.byteLength}}catch{throw Error(`Could not safely decompress ${f.name}; try uploading the project folder`)}
  }
  if(data.length!==f.uncompressed||crc32(data)!==f.crc)throw Error(`ZIP data failed integrity validation: ${f.name}`);
  items.push({name:f.name, bytes:data});
 }
 return items;
}
function makeZip(entries){
 const chunks=[],directory=[];let offset=0;
 const put=b=>{chunks.push(b);offset+=b.length};
 const entry=(name,data)=>{
  const n=encoder.encode(normalisePath(name)),d=typeof data==='string'?encoder.encode(data):data;
  const crc=crc32(d),start=offset,h=new Uint8Array(30+n.length),v=makeView(h);
  v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0x0800,true);v.setUint32(14,crc,true);v.setUint32(18,d.length,true);v.setUint32(22,d.length,true);v.setUint16(26,n.length,true);h.set(n,30);put(h);put(d);
  const c=new Uint8Array(46+n.length),w=makeView(c);w.setUint32(0,0x02014b50,true);w.setUint16(4,20,true);w.setUint16(6,20,true);w.setUint16(8,0x0800,true);w.setUint32(16,crc,true);w.setUint32(20,d.length,true);w.setUint32(24,d.length,true);w.setUint16(28,n.length,true);w.setUint32(42,start,true);c.set(n,46);directory.push(c);
 };
 for(const e of entries)entry(e.name,e.data);
 const dirStart=offset;for(const d of directory)put(d);const dirSize=offset-dirStart;
 const tail=new Uint8Array(22),v=makeView(tail);v.setUint32(0,0x06054b50,true);v.setUint16(8,directory.length,true);v.setUint16(10,directory.length,true);v.setUint32(12,dirSize,true);v.setUint32(16,dirStart,true);put(tail);
 return new Blob(chunks,{type:'application/zip'});
}
const decodeUtf8=data=>decoder.decode(data);
export {crc32,normalisePath,readZip,makeZip,decodeUtf8};
