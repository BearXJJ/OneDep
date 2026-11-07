import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(path.resolve('apps/web/package.json'));
const { JSDOM } = require('jsdom');
const root = process.argv[2];
if (!root) throw new Error('Usage: node scripts/import-onedep.mjs <capture-directory>');
const clean = value => value.replace(/\s+/g, ' ').trim();
const human = value => value.replace(/^pdbx_/, '').replaceAll('_', ' ');
const pages = {
 xray: ['contact','funding','release','title','citation','molecule_1','diffrncrystal','diffrndatacollection','diffrnsoftware','diffrncollectionstatistics','diffrnrefinement','assembly','additionaldata'],
 em: ['contact','funding','release','title','citation','molecule_1','emsample','emspecimen','emimaging','emrecording','emreconstruction','emfitting','assembly','additionaldata'],
};
const load = (method, page) => new JSDOM(fs.readFileSync(path.join(root,method,page+'.html'),'utf8')).window.document;
function navigation(list) {
 return [...list.children].filter(el=>el.tagName==='LI').map(el=>{
  const anchor=el.querySelector(':scope > a'),nested=el.querySelector(':scope > ul');
  const title=clean([...el.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent).join(' '));
  if(nested&&nested.children.length) {
   const children=navigation(nested);
   if(children.some(n=>n.id.startsWith('molecule_'))) return {id:'macromolecules',title:'Macromolecules',records:'molecules',page:'molecule_1'};
   return {id:el.id,title,children};
  }
  if(!anchor) throw new Error('Navigation item without link: '+title);
  return {id:anchor.getAttribute('href').split('/').at(-1),title:clean(anchor.textContent)};
 });
}
const output={};
for(const [method,names] of Object.entries(pages)) {
 const nav=navigation(load(method,'welcome').querySelector('#treeData'));
 const titles=new Map(); const visit=nodes=>nodes.forEach(n=>{titles.set(n.id,n.title);if(n.children)visit(n.children)});visit(nav);
 const forms=[];
 for(const page of names) {
  const d=load(method,page), center=d.querySelector('.ui-layout-center');
  center.querySelectorAll('#hiddenprimary,script,.wwpdb_example').forEach(e=>e.remove());
  const counters=new Map();
  const toggles=new Map();
  for(const control of center.querySelectorAll('[data-tag][onclick]')){
   const handler=control.getAttribute('onclick'),args=[...handler.matchAll(/'([^']*)'/g)].map(m=>m[1]);
   const category=control.closest('[data-category]')?.dataset.category;if(!category)continue;
   const selected=control.dataset.value;
   if(handler.startsWith('myDisplay(')&&args.length===4){
    const key=args[3].includes(selected)?args[0]:'toggle'+args[0];
    if(!toggles.has(key))toggles.set(key,{category,cif_item:control.dataset.tag,value:[],type:'equal'});
    const condition=toggles.get(key);if(!condition.value.includes(selected))condition.value.push(selected);
   }
   if(handler.startsWith('my3Display(')&&args.length===5)toggles.set(selected+'___'+args[0],{category,cif_item:control.dataset.tag,value:[selected],type:'equal'});
  }
  function conditions(el) {
   const result=[];
   for(let a=el;a&&a!==center;a=a.parentElement){
    if(a.hasAttribute('data-condition'))result.unshift(JSON.parse(a.dataset.condition));
    if(toggles.has(a.dataset.type))result.unshift(toggles.get(a.dataset.type));
   }
   const category=el.closest('[data-category]')?.dataset.category;
   if(category?.startsWith('pdbx_serial_crystallography'))result.push({category:'diffrn',cif_item:'pdbx_serial_crystal_experiment',value:['Y'],type:'equal'});
   if(category==='pdbx_serial_crystallography_sample_delivery_injection')result.push({category:'pdbx_serial_crystallography_sample_delivery',cif_item:'method',value:['injection'],type:'equal'});
   if(category==='pdbx_serial_crystallography_sample_delivery_fixed_target')result.push({category:'pdbx_serial_crystallography_sample_delivery',cif_item:'method',value:['fixed target'],type:'equal'});
   return result;
  }
  function label(e) {
   const row=e.closest('tr'), cell=e.closest('td');let title='';
   if(row) {
    const first=row.querySelector('td');
    if(first&&!first.querySelector('input,select,textarea'))title=clean(first.textContent);
    else if(cell) {const heads=row.closest('table').querySelectorAll('thead th,thead td'); if(heads[cell.cellIndex])title=clean(heads[cell.cellIndex].textContent);}
   }
   if(!title||title===':'||title==='*:') title=human(e.dataset.tag);
   return title.replace(/\*?:\s*$/,'').trim();
  }
  function groupTitle(el) {
   const firstControl=el.querySelector('input:not([type=hidden]),select,textarea');
   const own=[...el.querySelectorAll('h3,h4,legend')].find(h=>h.closest('[data-category]')===el&&(!firstControl||(h.compareDocumentPosition(firstControl)&4)));
   if(own)return clean(own.textContent);
   const headings=[...center.querySelectorAll('h3,h4,legend')].filter(h=>h.compareDocumentPosition(el)&4);
   if(headings.length)return clean(headings.at(-1).textContent);
   return human(el.dataset.category);
  }
  function deduplicate(groups) {
   const seen=new Set();
   const shape=e=>e.kind==='field'?e.name:[e.category,e.variant,e.elements.map(shape)];
   return groups.filter(g=>{const key=JSON.stringify([g.category,g.variant,g.conditions,g.elements.map(shape)]);if(seen.has(key))return false;seen.add(key);return true;});
  }
  function group(el) {
   const category=el.dataset.category;
   const count=counters.has(category)?counters.get(category):0;counters.set(category,count+1);
   const name=category+(count?'_'+count:'');
   const semanticTags={pdbx_contact_author:'role',software:'classification',em_software:'fitting',em_euler_angle_assignment:'type'};
   let variant='';
   if(semanticTags[category]){const hidden=el.querySelector('input[type=hidden][data-tag='+semanticTags[category]+']');if(hidden)variant=hidden.value;}
   const controls=[...el.querySelectorAll('input[data-tag],select[data-tag],textarea[data-tag]')].filter(e=>e.closest('[data-category]')===el&&e.type!=='hidden'&&!['button','submit'].includes(e.type));
   const fields=[], seen=new Set();
   for(const e of controls) {
    if(seen.has(e.dataset.tag))continue; seen.add(e.dataset.tag);
    const title=label(e), key=category+'.'+e.dataset.tag;
    const labelCell=e.closest('tr')?.querySelector('td');
    const item={kind:'field',name:e.dataset.tag,category,title,type:e.tagName==='TEXTAREA'?'comment':e.tagName==='SELECT'?'dropdown':e.type==='radio'?'radiogroup':e.type==='checkbox'?'checkbox':'text',required:!!e.required||(labelCell!==null&&labelCell!==undefined&&/\*/.test(labelCell.textContent)),conditions:conditions(e)};
    const help=e.closest('tr')?.querySelector('[data-qtip]');
    if(help) {const h=new JSDOM('<body>'+help.dataset.qtip+'</body>');item.help=clean(h.window.document.body.textContent);h.window.close();}
    if(e.dataset.info)item.placeholder=clean(e.dataset.info);
    if(e.maxLength>0)item.maxLength=e.maxLength;
    if(e.dataset.regex)item.regex=e.dataset.regex;
    if(['email','date','number','url'].includes(e.type))item.inputType=e.type;
    if(e.tagName==='SELECT')item.choices=[...e.options].filter(o=>o.value&&!o.disabled).map(o=>({value:o.value,text:clean(o.textContent)}));
    if(e.type==='radio'||e.type==='checkbox')item.choices=controls.filter(c=>c.dataset.tag===e.dataset.tag).map(c=>({value:c.dataset.value===undefined?c.value:c.dataset.value,text:c.nextSibling&&clean(c.nextSibling.textContent)?clean(c.nextSibling.textContent):c.dataset.value===undefined?c.value:c.dataset.value}));
    const dictionary=path.join(root,'dictionaries',key+'.json');
    if(fs.existsSync(dictionary)){item.type='dropdown';item.choices=Object.keys(JSON.parse(fs.readFileSync(dictionary,'utf8'))).map(value=>({value,text:value}));item.allowOther=true;}
    fields.push(item);
   }
   const children=deduplicate([...el.querySelectorAll('[data-category]')].filter(n=>n.parentElement.closest('[data-category]')===el).map(group).filter(Boolean));
   const elements=[...fields,...children];
   if(!elements.length)return null;
   return {kind:'group',name,category,variant,title:variant?variant:groupTitle(el),repeat:el.classList.contains('wwpdb_repeatable_block')||['audit_author','citation_author','em_author_list','software','pdbx_database_related','pdbx_related_exp_data_set','pdbx_struct_ref_seq_depositor_info'].includes(category),conditions:conditions(el),elements};
  }
  const elements=deduplicate([...center.querySelectorAll('[data-category]')].filter(el=>!el.parentElement.closest('[data-category]')).map(group).filter(Boolean));
  forms.push({name:page,title:page==='molecule_1'?'Macromolecule':titles.get(page),elements});
  d.defaultView.close();
 }
 output[method]={navigation:nav,pages:forms};
}
fs.writeFileSync('packages/shared/src/deposition/official-forms.ts','// Generated from captured OneDep form structure by scripts/import-onedep.mjs.\nimport type { CapturedProfiles } from "./official-types.js";\nexport const officialForms = '+JSON.stringify(output,null,2)+' as CapturedProfiles;\n');
console.log('Imported OneDep navigation and form structure.');
