import fs from 'node:fs/promises';
import vm from 'node:vm';
import {makeZip, readZip} from '../zip.js';
const read=async file=>fs.readFile(file,'utf8');
const html=await read('index.html');
const css=await read('styles.css');
const sourceModules=await Promise.all(['zip.js','parser.js','exporter.js','app.js'].map(read));
const inlineScript=sourceModules.map(text=>text
  .replace(/^import\s+.*?;\s*$/gm,'')
  .replace(/^export\s+\{[^}]+\};?\s*$/gm,'')
  .replace(/^export\s+(?=(?:async\s+)?(?:function|const|class|let))/gm,'')
).join('\n\n');
new vm.Script(inlineScript,{filename:'offline-inspector.js'});
const logo=(await fs.readFile('assets/mightora-logo.png')).toString('base64');
const csp="<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'none'; font-src data:; object-src 'none'; base-uri 'none'; form-action 'none';\">";
let offline=html
 .replace(/<link rel="stylesheet" href="https:\/\/cdn\.jsdelivr\.net\/gh\/mightora\/shared-ui@main\/shared\.css">[\s\S]*?<script src="https:\/\/cdn\.jsdelivr\.net\/gh\/mightora\/shared-ui@main\/components\.js" defer><\/script>/,()=>csp)
 .replace('<link rel="stylesheet" href="./styles.css">',()=>'<style>'+css+'</style>')
 .replace('<body>',()=>'<body class="offline-mode"><div class="offline-banner" role="status">Offline Edition – No Internet Connection Required</div>')
 .replace(/<img alt="Mightora" width="190" height="44" src="data:image\/svg\+xml;base64,[^"]+">/,()=>'<img alt="Mightora" width="190" height="44" src="data:image/png;base64,'+logo+'">')
 .replace(/<img src="https:\/\/techtweedie\.github\.io[^>]*>/g,'')
 .replace(/<img src="https:\/\/raw\.githubusercontent\.com\/TechTweedie[^>]*>/g,'')
 .replace(/<script type="module" src="\.\/app\.js"><\/script>/,()=>'<script>'+inlineScript+'</script>')
 .replace(/<a class="btn btn-primary" href="\.\/downloads\/power-bi-inspector-offline\.zip" download>[^<]+<\/a>/,()=>'<span class="download-label">Standalone local application</span>')
 .replace(/<a class="btn btn-outline" href="\.\/downloads\/power-bi-inspector-offline\.html" download>[^<]+<\/a>/,()=>'<span class="smallprint">Get newer editions from the hosted Mightora site.</span>');
if(!offline.includes("connect-src 'none'")||offline.includes('cdn.jsdelivr.net')||offline.includes('<script type="module" src="./app.js">')||!offline.includes('data:image/png;base64,'))throw Error('Offline network/branding verification failed');
const inline=offline.match(/<script>(\/\* Minimal, dependency-free ZIP reader[\s\S]*?)<\/script>/);
if(!inline)throw Error('Offline inline logic not embedded');
new vm.Script(inline[1],{filename:'generated-offline.js'});
await fs.mkdir('downloads',{recursive:true});
await fs.writeFile('downloads/power-bi-inspector-offline.html',offline);
const description=await read('downloads/README.md'),license=await read('LICENSE');
const archive=makeZip([{name:'power-bi-inspector-offline.html',data:offline},{name:'README.md',data:description},{name:'LICENSE',data:license}]);
await fs.writeFile('downloads/power-bi-inspector-offline.zip',new Uint8Array(await archive.arrayBuffer()));
const files=await readZip(await archive.arrayBuffer());
if(new TextDecoder().decode(files.find(x=>x.name==='power-bi-inspector-offline.html').bytes)!==offline)throw Error('Offline ZIP does not match generated HTML');
console.log('Offline edition generated from exact live CSS and JS modules, verified and ZIP packaged.');
