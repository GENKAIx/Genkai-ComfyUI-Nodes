// Folder browsing shares drag/drop, previews and resizing with the media loader.
export const FOLDER_NAME = 'GenkaiMediaFolder';
export const FOLDER_PAGE_SIZE = 30;

export function arrangeGallery(items) {
  const used = new Set(), pending = [];
  for (const item of items) {
    if (Number.isInteger(item.genkai_slot) && item.genkai_slot >= 0 && !used.has(item.genkai_slot)) used.add(item.genkai_slot);
    else pending.push(item);
  }
  let slot = 0;
  for (const item of pending) {
    while (used.has(slot)) slot++;
    item.genkai_slot = slot; used.add(slot);
  }
  return items.sort((a,b) => a.genkai_slot-b.genkai_slot);
}

export function installFolderUI(Panel, {el, postApi, viewURL, lightbox}) {
  Panel.prototype.folderPrefs = function() {
    const prefs = this.node.properties.genkaiFolderView ||= {};
    prefs.unlimited = prefs.unlimited === true;
    prefs.pageSize = Math.max(1, Math.floor(Number(prefs.pageSize) || FOLDER_PAGE_SIZE));
    if (!['all', 'picture', 'video', 'audio'].includes(prefs.filter)) prefs.filter = 'all';
    return prefs;
  };
  Panel.prototype.folderPageSize = function() {
    const prefs = this.folderPrefs();
    return prefs.unlimited ? Infinity : prefs.pageSize;
  };
  Panel.prototype.folderItems = function() {
    const filter = this.folderPrefs().filter;
    return filter === 'all' ? this.items : this.items.filter(item => item.kind === filter);
  };
  Panel.prototype.folderFilters = function() {
    const prefs = this.folderPrefs();
    return el('div', {class:'gkh3mml-folder-filters',role:'group','aria-label':'Media type filter'},
      [['all','All'],['picture','Images'],['video','Videos'],['audio','Audio']].map(([kind,label]) => {
        const count = kind === 'all' ? this.items.length : this.items.filter(item => item.kind === kind).length;
        return el('button', {type:'button',class:'gkh3mml-btn gkh3mml-filter' + (prefs.filter === kind ? ' active' : ''),
          'aria-label':label,'aria-pressed':String(prefs.filter === kind),onclick:() => {
            prefs.filter = kind; this.page = 0;
            this.node.graph?.change?.(); this.render();
          }}, label, el('span', {class:'gkh3mml-filter-count'}, String(count)));
      }));
  };
  Panel.prototype.folderMediaCard = function(item) {
    const video = item.kind === 'video';
    const duration = seconds => Number.isFinite(seconds) && seconds > 0 ? `${Math.floor(seconds/60)}:${String(Math.floor(seconds%60)).padStart(2,'0')}` : '';
    const badge = el('span',{class:'gkh3mml-media-badge'},`${video?'VIDEO':'AUDIO'} · ${duration(item.duration)}`.replace(/ · $/,''));
    const status = el('div',{class:'gkh3mml-media-error',role:'status'});
    const media = el(video?'video':'audio',{
      class:'gkh3mml-folder-player',controls:true,preload:'metadata',playsInline:true,
      src:viewURL(item.file),volume:.25,'aria-label':`${video?'Video':'Audio'} preview: ${item.name}`,
      onloadedmetadata:e => {badge.textContent=`${video?'VIDEO':'AUDIO'} · ${duration(e.target.duration)}`.replace(/ · $/,'');},
      onerror:() => {status.textContent='Preview unavailable in this browser. You can still drag this file to the loader.';},
      ondblclick:() => { if (video) lightbox(item,'Video'); },
      onplay:() => this.players.forEach(player => {if(player !== controller) player.pause?.();}),
    });
    const controller = {pause:()=>media.pause(),stop:()=>{media.pause();media.removeAttribute('src');media.load();}};
    this.players.push(controller);
    // Native video controls consume pointer gestures. Give the picture area a
    // separate drag surface, leaving the player's bottom control strip exposed.
    const dragSurface = video ? el('div',{
      class:'gkh3mml-video-drag-surface',
      title:'Drag video to another slot or node; double-click to preview',
      ondblclick:()=>lightbox(item,'Video'),
    }) : null;
    const preview = el('div',{class:'gkh3mml-media-preview'},
      video?null:el('div',{class:'gkh3mml-audio-art','aria-hidden':'true'},'♫'),media,dragSurface,badge,status);
    return this.reorderable(el('div',{class:`gkh3mml-slot filled ${video?'vid':'aud'} gkh3mml-folder-media`},preview,
      el('div',{class:'gkh3mml-picbar'},el('div',{class:'gkh3mml-picactions'},
        el('span',{class:'gkh3mml-drag',title:'Drag to another slot or node'},'☰'),
        el('button',{type:'button',class:'gkh3mml-x',title:`Remove ${video?'video':'audio'}`,onclick:e=>{e.stopPropagation();this.remove(item);}},'✕')))),item);
  };
  Panel.prototype.loadFolder = async function() {
    if (this.busy) return;
    const field = this.node.widgets.find(w => w.name === 'folder_path');
    const recursive = this.node.widgets.find(w => w.name === 'recursive')?.value === true;
    const previous = this.node.properties.genkaiFolderScan;
    const directory = String(field?.value || '').trim();
    if (!directory) { this.say('Enter a folder path on the ComfyUI machine.', true); this.render(); return; }
    this.busy++; this.say('Reading folder…'); this.render();
    let offset = 0, errors = [], total = 0;
    try {
      do {
        const response = await postApi('/genkai/media_folder/scan', {
          headers: {'Content-Type':'application/json'},
          body: JSON.stringify({directory, recursive, offset, limit:256}),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Folder could not be read.');
        if (this._disposed) return;
        if (offset === 0) {
          if (previous?.directory !== result.directory || previous?.recursive !== recursive) this.items = [];
          this.page = 0;
        }
        const bySource = new Map(this.items.filter(i => i.folder_source).map(i => [i.folder_source,i]));
        let slot = this.items.reduce((max,i) => Math.max(max,i.genkai_slot ?? -1), -1) + 1;
        for (const item of result.items) {
          const prior = bySource.get(item.folder_source);
          if (prior) Object.assign(prior,item,{uid:prior.uid,genkai_slot:prior.genkai_slot,enabled:true,audio_mode:prior.audio_mode});
          else this.items.push({...item,enabled:true,genkai_slot:slot++});
        }
        field.value = result.directory;
        this.node.properties.genkaiFolderScan = {directory:result.directory,recursive,total:result.total};
        total = result.total; errors.push(...result.errors); offset = result.next;
        const status = this.root.querySelector('.gkh3mml-msg');
        if (status) status.textContent = `Loading ${this.items.length} / ${total} files…`;
      } while (offset != null);
      this.say(`${this.items.length} files loaded.` + (errors.length ? ` ${errors.length} unreadable file(s) skipped: ${errors[0]}` : ''), !!errors.length);
    } catch (error) { this.say(error.message,true); }
    finally { this.busy--; if (!this._disposed) this.commit(); }
  };

  Panel.prototype.folderControls = function() {
    const field = this.node.widgets.find(w => w.name === 'folder_path'), recurse = this.node.widgets.find(w => w.name === 'recursive');
    const input = el('input', {class:'gkh3mml-presetname',type:'text',placeholder:'Folder path on the ComfyUI machine',value:field?.value || '',disabled:!!this.busy,
      'aria-label':'Media folder path',oninput:e => { field.value=e.target.value; this.node.graph?.change?.(); },onkeydown:e => { if(e.key==='Enter') {e.preventDefault();this.loadFolder();} }});
    const check = el('input', {type:'checkbox',checked:recurse?.value===true,disabled:!!this.busy,onchange:e => {recurse.value=e.target.checked;this.node.graph?.change?.();}});
    return el('div',{class:'gkh3mml-folder-controls'},input,el('label',{},check,'Subfolders'),
      el('button',{class:'gkh3mml-btn',disabled:!!this.busy,onclick:()=>this.loadFolder()},this.busy?'Loading…':'Load folder'));
  };

  Panel.prototype.folderSettings = function() {
    const wrap = this.scaleControl(), menu = this._scaleMenu, button = this._scaleBtn, prefs = this.folderPrefs();
    button.textContent = '⚙ Settings'; button.title = 'Gallery settings';
    const update = () => {
      this.page = 0;
      this.node.graph?.change?.(); this.render();
      this._scaleMenu.classList.add('on'); this._scaleBtn.classList.add('on');
    };
    menu.prepend(el('div',{class:'gkh3mml-folder-options'},
      this.styleControl(),
      el('label',{},el('input',{type:'checkbox',checked:prefs.unlimited,onchange:e=>{prefs.unlimited=e.target.checked;update();}}),'Unlimited files per page'),
      el('label',{},'Files per page',el('input',{type:'number',min:1,step:1,value:prefs.pageSize,disabled:prefs.unlimited,'aria-label':'Files per page',
        onchange:e=>{prefs.pageSize=Math.max(1,Math.floor(Number(e.target.value)||FOLDER_PAGE_SIZE));update();}}))));
    return wrap;
  };

  Panel.prototype.folderToolbar = function() {
    return el('div',{class:'gkh3mml-top'},
      el('button',{class:'gkh3mml-btn',disabled:!!this.busy,onclick:()=>{this.pickerSlot=null;this.picker.click();}},'Load files…'),
      el('button',{class:'gkh3mml-btn',disabled:!!this.busy || !this.items.length,onclick:()=>{this.unloadPrompt=true;this.render();}},'Unload media'),
      this.folderSettings(),
      el('span',{class:'gkh3mml-folder-count'},this.folderPrefs().filter === 'all' ? `${this.items.length} files` : `${this.folderItems().length} / ${this.items.length} files`));
  };

  Panel.prototype.folderFooter = function() {
    const size = this.folderPageSize(), pages = Math.ceil(this.folderItems().length/size);
    if (!Number.isFinite(size) || pages <= 1) return null;
    return el('div',{class:'gkh3mml-folder-footer'},
      el('button',{class:'gkh3mml-btn',disabled:this.page<=0,onclick:()=>{this.page--;this.render();}},'‹ Previous'),
      el('span',{},`Page ${this.page+1} / ${pages}`),
      el('button',{class:'gkh3mml-btn',disabled:this.page>=pages-1,onclick:()=>{this.page++;this.render();}},'Next ›'));
  };
}
