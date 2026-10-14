import {decodeUtf8} from './zip.js';
/* Power BI project inspection. Read-only and local. No execution of uploaded DAX, M, or visual code. */

const pick=(v,...keys)=>{for(const k of keys)if(v?.[k]!==undefined)return v[k]};
const array=x=>Array.isArray(x)?x:[];
const str=x=>typeof x==='string'?x:x==null?'':JSON.stringify(x);
const unquote=s=>String(s||'').trim().replace(/^'((?:[^']|'')*)'$/,(a,b)=>b.replaceAll("''","'"));
const allowed=n=>/\.(json|tmdl|pbip|pbir|pbism|bim)$/i.test(n)||/(?:^|\/)\.platform$/i.test(n);
const safeParse=(s,path,issues)=>{try{return JSON.parse(s)}catch(e){issues.push(`Cannot parse JSON: ${path} — ${e.message}`);return null}};
function fileType(n){const x=n.toLowerCase();return x.endsWith('.tmdl')?'tmdl':x.endsWith('.json')?'json':'other'}
function fieldRefs(obj){const found=new Set(),seen=new WeakSet();function walk(x,depth){if(!x||depth>26)return;if(typeof x==='string')return;if(typeof x!=='object'||seen.has(x))return;seen.add(x);if(x.Measure||x.Column||x.HierarchyLevel||x.Aggregation){for(const kind of ['Measure','Column','HierarchyLevel','Aggregation']){const y=x[kind];if(y&&typeof y==='object'&&y.Property){const src=y.Expression?.SourceRef?.Entity||y.Expression?.SourceRef?.Source||y.Expression?.Entity||'';found.add([src,y.Property].filter(Boolean).join('.'))}}}if(typeof x.queryRef==='string')found.add(x.queryRef);for(const a of Object.values(x))walk(a,depth+1)}walk(obj,0);return [...found].filter(Boolean).slice(0,120)}
function inferType(j){return j.visual?.visualType||j.singleVisual?.visualType||j.visualType||j.type||'Unknown visual'}
function extractTitle(j){const props=j.visual?.visualContainerObjects?.title||j.visual?.objects?.title||j.objects?.title||j.visualContainerObjects?.title;let name='';for(const o of array(props)){const p=o.properties?.text||o.properties?.titleText||o.properties?.textContent;const t=p?.expr?.Literal?.Value||p?.expr?.Literal?.value||p?.expr?.String?.value||p?.value;if(typeof t==='string')name=t.replace(/^['"]|['"]$/g,'')}return name||j.title||''}
function parseFilter(f,scope,source){const entity=f?.field||f?.target||f?.expression||f?.filter?.Where||null;return {name:str(f?.name||f?.displayName||f?.filterType||f?.type||'Filter'),scope,source,field:typeof entity==='string'?entity:fieldRefs(entity).join(', ')||str(f?.target?.column||f?.target?.measure||''),type:str(f?.type||f?.filterType||''),summary:str(f?.howCreated||f?.isLocked?'Configured filter':''),raw:f}}
function filtersIn(x,scope,source){const root=x?.filterConfig?.filters||x?.filters||x?.filterConfig?.filter||[];return array(root).map(f=>parseFilter(f,scope,source))}
function newResult(){return {name:'Power BI project',format:'Unknown',files:[],pages:[],visuals:[],measures:[],tables:[],columns:[],relationships:[],filters:[],bookmarks:[],metadataEntries:[],sources:[],issues:[],metadata:{report:{},semanticModel:{},inputFiles:0},generatedAt:new Date().toISOString()}}
function addMeasure(result,m){if(!m?.name)return;const key=(m.table+'\x00'+m.name+'\x00'+m.scope).toLowerCase();if(!result.measures.some(x=>(x.table+'\x00'+x.name+'\x00'+x.scope).toLowerCase()===key))result.measures.push(m)}
function tmdlObjectName(x){return unquote(x.trim().replace(/\s+=.*$/,''))}
function tmdlProperties(lines,start,indent){const props={};let expression='',collect=false;for(let i=start+1;i<lines.length;i++){const raw=lines[i];const trim=raw.trim();if(!trim)continue;const dep=(raw.match(/^[\t ]*/)||[''])[0].replaceAll('\t','    ').length;if(dep<=indent && /^(?:table|measure|column|relationship|partition|hierarchy|calculationGroup|calculationItem|expression|level)\s/i.test(trim))break;if(dep<=indent&& !/^\/\//.test(trim))break;const m=trim.match(/^([\w]+)\s*:\s*(.*)$/);if(m){props[m[1]]=m[2];collect=false}else if(collect){expression+='\n'+trim}else if(trim==='```'){collect=!collect} }return props}
function parseTmdl(result,content,path){
 const lines=content.replaceAll('\r\n','\n').split('\n');let table=null,current=null,baseIndent=0,desc=[];
 const add=(o)=>{if(o.kind==='measure')addMeasure(result,{name:o.name,table:o.table,expression:o.expression.trim(),formatString:o.props.formatString||'',description:o.props.description||o.description||'',scope:'Semantic model',source:path});else if(o.kind==='column')result.columns.push({name:o.name,table:o.table,dataType:o.props.dataType||'',sourceColumn:o.props.sourceColumn||'',isHidden:o.props.isHidden==='true',source:path});else if(o.kind==='relationship'){const p=o.props;result.relationships.push({name:o.name,from:p.fromColumn||'',to:p.toColumn||'',isActive:p.isActive!=='false',crossFilteringBehavior:p.crossFilteringBehavior||'oneDirection',fromCardinality:p.fromCardinality||'many',toCardinality:p.toCardinality||'one',source:path})}else if(o.kind==='table')result.tables.push({name:o.name,description:o.props.description||o.description||'',isHidden:o.props.isHidden==='true',source:path})};
 for(let i=0;i<=lines.length;i++){
  const raw=lines[i]||'',text=raw.trim(),indent=(raw.match(/^[\t ]*/)||[''])[0].replaceAll('\t','    ').length;
  if(text.startsWith('///')){desc.push(text.slice(3).trim());continue}
  const m=text.match(/^(table|measure|column|relationship)\s+(.+)$/);
  if(m||i===lines.length){
   if(current){add(current);current=null}
   if(m){const kind=m[1],remainder=m[2],name=tmdlObjectName(remainder);if(kind==='table'){table=name}const rhs=remainder.indexOf('=');current={kind,name,table:kind==='table'?name:table,description:desc.join(' '),expression:rhs>=0&&kind==='measure'?remainder.slice(rhs+1).trim():'',props:{}};baseIndent=indent;desc=[]}
   continue;
  }
  if(!current)continue;
  if(indent>baseIndent){const p=text.match(/^([A-Za-z]\w*)\s*:\s*(.*)$/);if(p)current.props[p[1]]=p[2];else if(current.kind==='measure'&&text&&!/^(?:annotation|extendedProperty|changedProperty)\s/.test(text)){
    if(text==='```')continue;
    // Preserve multi-line DAX from more indented continuation lines.
    if(!/^[\w]+\s*=/.test(text)||current.expression)current.expression+=(current.expression?'\n':'')+text;
   }}
 }
}
function parseModelJson(result,j,path){const model=j.model||j;result.metadata.semanticModel={...result.metadata.semanticModel,culture:model.culture||'',compatibilityLevel:j.compatibilityLevel||model.compatibilityLevel||''};for(const t of array(model.tables)){result.tables.push({name:t.name,description:t.description||'',isHidden:!!t.isHidden,source:path});for(const c of array(t.columns))result.columns.push({name:c.name,table:t.name,dataType:c.dataType||'',sourceColumn:c.sourceColumn||'',isHidden:!!c.isHidden,source:path});for(const m of array(t.measures))addMeasure(result,{name:m.name,table:t.name,expression:str(m.expression),formatString:m.formatString||'',description:m.description||'',scope:'Semantic model',source:path})}for(const r of array(model.relationships))result.relationships.push({name:r.name||'',from:`${r.fromTable||''}.${r.fromColumn||''}`,to:`${r.toTable||''}.${r.toColumn||''}`,isActive:r.isActive!==false,crossFilteringBehavior:r.crossFilteringBehavior||'',fromCardinality:r.fromCardinality||'',toCardinality:r.toCardinality||'',source:path})}
function parseReportExtensions(result,j,path){for(const e of array(j.entities)){for(const m of array(e.measures)){addMeasure(result,{name:m.name,table:e.name||'',expression:str(m.expression),formatString:m.formatString||'',description:m.description||'',scope:m.expression?'Report extension':'Visual calculation placeholder',source:path})}}}
function parseLegacy(result,j,path){if(!Array.isArray(j.sections))return;result.format='PBIR Legacy';result.metadata.report={...result.metadata.report,name:j.name||'',layoutOptimization:j.layoutOptimization||''};result.filters.push(...filtersIn(j,'Report',path));for(const section of j.sections){const pn=section.displayName||section.name||'Page',id=section.name||pn;result.pages.push({id,name:pn,displayName:pn,ordinal:section.ordinal??result.pages.length,isHidden:!!section.visibility,visualCount:array(section.visualContainers).length,source:path});result.filters.push(...filtersIn(section,`Page: ${pn}`,path));for(const v of array(section.visualContainers)){
 let config=v.config; if(typeof config==='string')config=safeParse(config,path,result.issues)||{};if(!config)config={};let query=v.query;if(typeof query==='string')query=safeParse(query,path,result.issues)||{};
 const single=config.singleVisual||{},title=extractTitle({...config,visual:single});const item={id:config.name||`visual-${result.visuals.length+1}`,name:title||config.name||single.visualType||'Visual',title,page:pn,pageId:id,type:inferType(config),x:v.x??config.layouts?.[0]?.position?.x??0,y:v.y??config.layouts?.[0]?.position?.y??0,width:v.width??0,height:v.height??0,fields:fieldRefs(query||single||config),source:path};result.visuals.push(item);let vf=v.filters;if(typeof vf==='string')vf=safeParse(vf,path,result.issues)||[];result.filters.push(...filtersIn({filters:vf},`Visual: ${item.name}`,path));
 }}for(const b of array(j.bookmarks))result.bookmarks.push({name:b.displayName||b.name||'Bookmark',id:b.name||'',source:path});}
function inspectFiles(files){
 const result=newResult();const known=files.filter(f=>allowed(f.name));result.files=known.map(f=>f.name);result.metadata.inputFiles=files.length;
 if(!known.length){result.issues.push('No supported PBIP/PBIR/TMDL/JSON metadata files were found. Upload the entire project folder or a ZIP of it.');return result}
 let modelFormat=false,reportFormat=false;let projectName='';
 const parsed=[];for(const f of known){if(f.bytes?.length>35*1024*1024){result.issues.push(`Skipped oversized file: ${f.name}`);continue}const name=f.name.replaceAll('\\','/');if(/\.pbip$/i.test(name)){projectName=name.split('/').pop().replace(/\.pbip$/i,'');continue}if(fileType(name)==='tmdl'){parsed.push({name,type:'tmdl',text:decodeUtf8(f.bytes)});continue}if(fileType(name)==='json'||/\.bim$/i.test(name)||/(?:^|\/)\.platform$/i.test(name)){const obj=safeParse(decodeUtf8(f.bytes),name,result.issues);if(obj)parsed.push({name,type:'json',obj})}}
 result.name=projectName||known.find(x=>/\.report\//i.test(x.name))?.name.split('/').find(x=>/\.Report$/i.test(x))?.replace(/\.Report$/i,'')||'Power BI project';
 // Report content is discovered by precise paths to avoid confusion with arbitrary JSON assets.
 const pageMap=new Map(),pageOrder=[];
 for(const f of parsed){if(f.type!=='json')continue;const p=f.name.toLowerCase(),j=f.obj;
  if(/(?:^|\/)\.platform$/.test(p)){result.metadataEntries.push({name:'Fabric platform descriptor',value:j,source:f.name})}
  if(/\/definition\/version\.json$/.test(p)){result.metadata.report.definitionVersion=j.version||j}
  if(/\/definition\/pages\/pages\.json$/.test(p)){pageOrder.push(...array(j.pageOrder));result.metadata.report.activePageName=j.activePageName||'';reportFormat=true}
  else if(/\/definition\/pages\/[^/]+\/page\.json$/.test(p)){const id=j.name||f.name.split('/').at(-2),page={id,name:j.displayName||id,displayName:j.displayName||id,ordinal:pageMap.size,isHidden:j.visibility==='Hidden'||j.visibility==='hidden'||j.isHidden===true,width:j.width||'',height:j.height||'',visualCount:0,source:f.name};pageMap.set(id,page);result.filters.push(...filtersIn(j,`Page: ${page.name}`,f.name));reportFormat=true}
  else if(/\/definition\/report\.json$/.test(p)){result.metadata.report={...result.metadata.report,...{theme:j.themeCollection?.baseTheme?.name||'',schema:j.$schema||'',defaultPage:j.defaultPage||''}};result.filters.push(...filtersIn(j,'Report',f.name));reportFormat=true}
  else if(/\/definition\/pages\/[^/]+\/visuals\/[^/]+\/visual\.json$/.test(p)){
   const parts=f.name.split('/'),pageId=parts.at(-4),id=j.name||parts.at(-2),title=extractTitle(j);const item={id,name:title||id,title,page:'',pageId,type:inferType(j),x:j.position?.x??'',y:j.position?.y??'',width:j.position?.width??'',height:j.position?.height??'',fields:fieldRefs(j.visual?.query||j),source:f.name};result.visuals.push(item);result.filters.push(...filtersIn(j.visual,`Visual: ${item.name}`,f.name));result.filters.push(...filtersIn(j,`Visual: ${item.name}`,f.name));reportFormat=true;
  }
  else if(/\/definition\/bookmarks\/[^/]+\.bookmark\.json$/.test(p)){result.bookmarks.push({id:j.name||f.name.split('/').at(-1).split('.')[0],name:j.displayName||j.name||'Bookmark',source:f.name,selectedPages:array(j.explorationState?.activeSection).join(', ')})}
  else if(/\/definition\/reportextensions\.json$/.test(p)){parseReportExtensions(result,j,f.name)}
  else if(/(?:^|\/)report\.json$/.test(p)&&Array.isArray(j.sections)){parseLegacy(result,j,f.name);reportFormat=true}
  if(/(?:^|\/)model\.bim$/i.test(f.name)||(/(?:^|\/)database\.json$/i.test(f.name)&&j.model)){parseModelJson(result,j,f.name);modelFormat=true}
  if(/\/definition\.pbism$/.test(p)){result.metadata.semanticModel.version=j.version||''}
  if(/\/definition\.pbir$/.test(p)){result.metadata.report.datasetReference=j.datasetReference||{};result.metadata.report.version=j.version||''}
 }
 for(const f of parsed.filter(x=>x.type==='tmdl')){if(/\/definition\/(?:tables\/|relationships\.tmdl$)/i.test(f.name)){parseTmdl(result,f.text,f.name);modelFormat=true}else if(/\/definition\/model\.tmdl$/i.test(f.name)){for(const key of ['culture','discourageImplicitMeasures','defaultPowerBIDataSourceVersion']){const m=f.text.match(new RegExp('^\\s*'+key+'\\s*:\\s*(.+)$','m'));if(m)result.metadata.semanticModel[key]=m[1]};modelFormat=true}}
 for(const [id,page] of pageMap){page.ordinal=(pageOrder.indexOf(id)>=0?pageOrder.indexOf(id):1000+page.ordinal);result.pages.push(page)}result.pages.sort((a,b)=>a.ordinal-b.ordinal);
 for(const v of result.visuals){const p=pageMap.get(v.pageId)||result.pages.find(x=>x.id===v.pageId);if(p){v.page=p.name;p.visualCount++}else v.page=v.page||v.pageId||'Unmapped page'}
 // Model .bim often has a .json extension in extracted Fabric item definitions.
 if(!modelFormat){for(const f of parsed.filter(x=>x.type==='json'&&x.obj?.model&&Array.isArray(x.obj.model.tables))){parseModelJson(result,f.obj,f.name);modelFormat=true;break}}
 result.format=reportFormat?(result.format==='PBIR Legacy'?'PBIR Legacy':'Enhanced PBIR'):modelFormat?'Semantic model only':'Project metadata';
 const id=x=>JSON.stringify(x);for(const category of ['tables','columns','relationships','bookmarks']){const seen=new Set();result[category]=result[category].filter(x=>{const key=category==='tables'?x.name:category==='columns'?x.table+'.'+x.name:category==='relationships'?`${x.name}|${x.from}|${x.to}`:x.id;if(seen.has(key))return false;seen.add(key);return true})}
 if(result.visuals.length&&!result.pages.length)result.issues.push('Visuals were found, but no matching page definitions were loaded. Upload the full project.');
 if(result.pages.length&&!modelFormat)result.issues.push('No semantic model definition was found. Tables, model measures and relationships may be unavailable. Include the .SemanticModel folder.');
 if(result.tables.length&&!reportFormat)result.issues.push('No report definition found. Include the .Report folder to inspect report pages, visuals, filters and bookmarks.');
 if(!result.pages.length&&!result.tables.length&&!result.visuals.length)result.issues.push('Files were read, but no recognised report or semantic model objects were found.');
 result.metadata.semanticModelAvailable=modelFormat;result.metadata.reportAvailable=reportFormat;
 for(const [label,collection] of [['Report',result.metadata.report],['Semantic model',result.metadata.semanticModel]])for(const [name,value] of Object.entries(collection))if(value!==undefined&&value!==null&&value!=='')result.metadataEntries.push({name:`${label}: ${name}`,value,scope:label});
 result.metadataEntries.push({name:'Input file inventory',value:result.files,scope:'Project'});
 return result;
}
function demoFiles(){const enc=new TextEncoder(),files={
 'Retail.pbip':'{"version":"1.0"}',
 'Retail.Report/definition/pages/pages.json':JSON.stringify({pageOrder:['overview','trends'],activePageName:'overview'}),
 'Retail.Report/definition/pages/overview/page.json':JSON.stringify({name:'overview',displayName:'Sales overview',width:1280,height:720,filterConfig:{filters:[{name:'Region filter',type:'Categorical'}]}}),
 'Retail.Report/definition/pages/trends/page.json':JSON.stringify({name:'trends',displayName:'Monthly trends'}),
 'Retail.Report/definition/report.json':JSON.stringify({themeCollection:{baseTheme:{name:'Mightora Retail Demo'}},filterConfig:{filters:[{name:'Active customers',type:'Advanced'}]}}),
 'Retail.Report/definition/pages/overview/visuals/kpi/visual.json':JSON.stringify({name:'kpi',position:{x:35,y:30,width:360,height:200},visual:{visualType:'card',query:{queryState:{Data:{projections:[{field:{Measure:{Expression:{SourceRef:{Entity:'Sales'}},Property:'Total Revenue'}},queryRef:'Sales.Total Revenue'}]}}}}}),
 'Retail.Report/definition/pages/overview/visuals/bar/visual.json':JSON.stringify({name:'bar',position:{x:40,y:270,width:550,height:330},visual:{visualType:'barChart',query:{queryState:{Category:{projections:[{queryRef:'Products.Category'}]},Y:{projections:[{queryRef:'Sales.Total Revenue'}]}}}}}),
 'Retail.Report/definition/pages/trends/visuals/line/visual.json':JSON.stringify({name:'line',position:{x:40,y:50,width:800,height:400},visual:{visualType:'lineChart',query:{queryState:{Category:{projections:[{queryRef:'Calendar.Month'}]},Y:{projections:[{queryRef:'Sales.Total Revenue'}]}}}}}),
 'Retail.Report/definition/bookmarks/presentation.bookmark.json':JSON.stringify({name:'presentation',displayName:'Presentation view'}),
 'Retail.Report/definition/reportExtensions.json':JSON.stringify({entities:[{name:'Sales',measures:[{name:'Revenue Label',expression:'"Revenue: " & FORMAT([Total Revenue], "£#,##0")'}]}]}),
 'Retail.SemanticModel/definition/tables/Sales.tmdl':"table Sales\n\tcolumn OrderId\n\t\tdataType: int64\n\tcolumn Revenue\n\t\tdataType: decimal\n\tmeasure 'Total Revenue' = SUM(Sales[Revenue])\n\t\tformatString: £#,##0\n\tmeasure 'Order Count' = COUNTROWS(Sales)\n",
 'Retail.SemanticModel/definition/tables/Products.tmdl':"table Products\n\tcolumn Category\n\t\tdataType: string\n\tcolumn ProductId\n\t\tdataType: int64\n",
 'Retail.SemanticModel/definition/relationships.tmdl':"relationship SalesToProducts\n\tfromColumn: Sales.ProductId\n\ttoColumn: Products.ProductId\n"
 };return Object.entries(files).map(([name,content])=>({name,bytes:enc.encode(content)}))}
export {inspectFiles,demoFiles};
