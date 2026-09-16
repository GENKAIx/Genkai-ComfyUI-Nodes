import {app} from '../../scripts/app.js';
import {api} from '../../scripts/api.js';
import {createCompare, el} from './compare_view.js';

const sheet=document.createElement('link');sheet.rel='stylesheet';sheet.href=new URL('./video_compare.css',import.meta.url).href;document.head.append(sheet);
const LOADER='GenkaiVideoCompareLoader', COMPARE='GenkaiVideoCompare';
const resolve=descriptor=>api.apiURL(`/view?${new URLSearchParams(descriptor)}`);
async function upload(file) {
    const form=new FormData();form.append('image',file);form.append('type','input');form.append('subfolder','genkai_compare');
    const response=await api.fetchApi('/upload/image',{method:'POST',body:form});
    if(!response.ok)throw new Error(`Upload failed (${response.status}). Check ComfyUI's upload size limit.`);
    const result=await response.json();return{filename:result.name,subfolder:result.subfolder||'',type:result.type||'input'};
}
function createLoader(node) {
    const root=el('div','gkc-loader'), slots=el('div','gkc-loader-slots'), status=el('div','gkc-status');
    const widget=node.widgets.find(w=>w.name==='media_json');
    widget.type='converted-widget';widget.computeSize=()=>[0,-4];widget.draw=()=>{};
    let state={},disposed=false;
    const abort=new AbortController(), on=(n,e,f)=>n.addEventListener(e,f,{signal:abort.signal});
    const fields=[];
    const save=()=>{widget.value=JSON.stringify(state);node.graph?.change();};
    for(const key of ['a','b']) {
        const slot=el('section','gkc-loader-slot'), title=el('input'), media=el('video'), button=el('button','',`Load video ${key.toUpperCase()}`), remove=el('button','','×');
        title.type='text';title.placeholder=`Variant ${key.toUpperCase()} name`;title.setAttribute('aria-label',title.placeholder);
        media.controls=true;media.preload='metadata';media.muted=true;media.playsInline=true;
        const file=el('input');file.type='file';file.accept='video/*,.mp4,.webm,.mov,.mkv,.m4v';file.hidden=true;
        const bar=el('div','gkc-toolbar');bar.append(button,remove);remove.title=`Clear video ${key.toUpperCase()}`;
        slot.append(el('strong','',`VIDEO ${key.toUpperCase()}`),title,media,bar,file);slots.append(slot);
        let token=0;
        async function load(f) {
            if(!f)return;
            if(!f.type.startsWith('video/')&&!/\.(mp4|webm|mov|mkv|m4v|ogv)$/i.test(f.name)){status.textContent='Choose a video file.';return;}
            const stamp=++token;button.disabled=true;status.textContent=`Uploading ${key.toUpperCase()}…`;
            try {const descriptor=await upload(f);if(disposed||stamp!==token)return;state[key]={video:descriptor,name:title.value||key.toUpperCase()};media.src=resolve(descriptor);save();status.textContent='Ready. Connect the comparison node and run the workflow.';}
            catch(error){if(!disposed)status.textContent=error.message;}
            finally{if(stamp===token)button.disabled=false;file.value='';}
        }
        on(button,'click',()=>file.click());on(file,'change',()=>load(file.files[0]));
        on(slot,'dragover',e=>{e.preventDefault();e.stopPropagation();slot.classList.add('is-over');});on(slot,'dragleave',()=>slot.classList.remove('is-over'));
        on(slot,'drop',e=>{e.preventDefault();e.stopPropagation();slot.classList.remove('is-over');load(e.dataTransfer.files[0]);});
        on(title,'input',()=>{state[key]={...state[key],name:title.value};save();});
        on(remove,'click',()=>{++token;button.disabled=false;state[key]={name:title.value};media.pause();media.removeAttribute('src');media.load();save();});
        on(media,'error',()=>{status.textContent=`Video ${key.toUpperCase()} cannot be previewed. Use MP4 with H.264 for browser playback.`;});
        fields.push({key,title,media});
    }
    const promptLabel=el('label','gkc-loader-prompt'), prompt=el('textarea');
    prompt.rows=3;prompt.placeholder='Optional — paste the shared prompt for both videos. Leave empty to compare videos only.';
    prompt.setAttribute('aria-label','Shared prompt (optional)');
    promptLabel.append(el('span','','PROMPT · OPTIONAL'),prompt);
    let minHeight=480,layoutFrame=0,lastWidth=0;
    function measurePrompt(){
        layoutFrame=0;if(disposed||!root.isConnected||!prompt.clientWidth)return;
        const previousScroll=prompt.scrollTop;
        prompt.style.height='auto';
        const contentHeight=prompt.scrollHeight+2, maxHeight=262; // 12 lines plus padding and borders.
        prompt.style.height=`${Math.min(contentHeight,maxHeight)}px`;
        prompt.style.overflowY=contentHeight>maxHeight?'auto':'hidden';
        prompt.scrollTop=previousScroll;
        minHeight=400+prompt.offsetHeight;
        if(!node.properties.genkaiPromptHeightLimited){
            if(contentHeight>maxHeight&&node.size[1]>minHeight+80)node.setSize([node.size[0],Math.max(minHeight+80,node.size[1]-(contentHeight-maxHeight))]);
            node.properties.genkaiPromptHeightLimited=true;
        }
        if(node.size[1]<minHeight+80){node.setSize([node.size[0],minHeight+80]);node.setDirtyCanvas(true,true);}
    }
    const schedule=()=>{if(!layoutFrame)layoutFrame=requestAnimationFrame(measurePrompt);};
    const resize=new ResizeObserver(()=>{if(root.clientWidth!==lastWidth){lastWidth=root.clientWidth;schedule();}});resize.observe(root);
    on(prompt,'input',()=>{state.prompt=prompt.value;save();schedule();});
    const connect=el('button','gkc-add','+ Add PromptSync Video Compare');
    on(connect,'click',()=>{
        const graph=node.graph;if(!graph)return;
        const compare=LiteGraph.createNode(COMPARE);if(!compare)return;
        compare.pos=[node.pos[0]+node.size[0]+70,node.pos[1]];graph.add(compare);
        node.connect(0,compare,compare.inputs.findIndex(input=>input.name==='videos'));graph.change();
    });
    root.append(slots,promptLabel,connect,status);
    for(const event of ['pointerdown','pointerup','click','dblclick','wheel'])on(root,event,e=>e.stopPropagation());
    on(root,'keydown',e=>{if(!((e.ctrlKey||e.metaKey)&&e.code==='KeyS'))e.stopPropagation();});
    function restore(){try{state=JSON.parse(widget.value||'{}');}catch{state={};}prompt.value=state.prompt||'';schedule();for(const {key,title,media}of fields){title.value=state[key]?.name||key.toUpperCase();if(state[key]?.video)media.src=resolve(state[key].video);else{media.removeAttribute('src');media.load();}}}
    restore();
    return{element:root,restore,getMinHeight:()=>minHeight,dispose(){disposed=true;resize.disconnect();cancelAnimationFrame(layoutFrame);abort.abort();for(const {media}of fields){media.pause();media.removeAttribute('src');media.load();}root.remove();}};
}

app.registerExtension({name:'GENKAI.VideoCompare',async beforeRegisterNodeDef(type,definition){
    if(![LOADER,COMPARE].includes(definition.name))return;
    const isLoader=definition.name===LOADER;
    const created=type.prototype.onNodeCreated;
    type.prototype.onNodeCreated=function(){
        const result=created?.apply(this,arguments);this.properties||={};
        this.genkaiCompare=isLoader?createLoader(this):createCompare({resolve,resolveWaveform:descriptor=>api.apiURL(`/genkai/audio-waveform?${new URLSearchParams(descriptor)}`),preferences:this.properties.comparePreferences,save:value=>{this.properties.comparePreferences=value;this.graph?.change();}});
        const widget=this.addDOMWidget('genkai_compare_panel','GENKAI_COMPARE',this.genkaiCompare.element,{serialize:false,hideOnZoom:false,getMinHeight:()=>isLoader?this.genkaiCompare.getMinHeight():640,getMaxHeight:()=>Infinity});widget.serialize=false;
        this.setSize(isLoader?[760,580]:[1180,850]);return result;
    };
    const serialized=type.prototype.onSerialize;
    type.prototype.onSerialize=function(info){const result=serialized?.apply(this,arguments);const names=isLoader?['media_json']:[];info.widgets_values=names.map(name=>this.widgets.find(w=>w.name===name)?.value);return result;};
    const configured=type.prototype.onConfigure;
    type.prototype.onConfigure=function(){const result=configured?.apply(this,arguments);if(isLoader)this.genkaiCompare?.restore();else{if(this.title==='PromptSync Compare (genkai)')this.title='PromptSync Video Compare (genkai)';for(let i=this.inputs.length-1;i>=0;i--)if(this.inputs[i].name!=='videos')this.removeInput(i);this.genkaiCompare?.setPreferences(this.properties?.comparePreferences);if(this.properties?.comparePreview)this.genkaiCompare?.setData(this.properties.comparePreview);}return result;};
    const executed=type.prototype.onExecuted;
    type.prototype.onExecuted=function(message){const result=executed?.apply(this,arguments);if(!isLoader&&message?.genkai_compare?.[0]){this.properties.comparePreview=message.genkai_compare[0];this.genkaiCompare?.setData(this.properties.comparePreview);}return result;};
    const removed=type.prototype.onRemoved;
    type.prototype.onRemoved=function(){this.genkaiCompare?.dispose();return removed?.apply(this,arguments);};
}});
