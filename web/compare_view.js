import {parseTimeline, activeIndex, formatTime} from './timeline.js';
import {createTransport} from './compare_transport.js';
import {createWaveform} from './waveform.js';

export function el(tag, cls, text) {
    const node = document.createElement(tag); node.className = cls || '';
    if (text !== undefined) node.textContent = text;
    return node;
}
export function createCompare({resolve, resolveWaveform, preferences = {}, save = () => {}}) {
    const root = el('div', 'gkc'); root.tabIndex = 0;
    const abort = new AbortController();
    const on = (node, event, callback) => node.addEventListener(event, callback, {signal: abort.signal});
    let prefs = {...preferences}, data = null, segments = [], fragments = [], active = -2, revision = 0, disposed = false;
    const tracks = [], videos = [], figures = [], captions = [], timeButtons = [];
    const header = el('div', 'gkc-toolbar');
    const mode = el('select'); mode.setAttribute('aria-label', 'Comparison mode');
    for (const [value, text] of [['stack','Stacked A / B'], ['wipe','Wipe A / B']]) { const o = el('option','',text); o.value = value; mode.append(o); }
    const theme = el('select'); theme.setAttribute('aria-label','Compare style');
    for (const value of ['Obsidian','Gold']) { const o = el('option','',value); o.value = value.toLowerCase(); theme.append(o); }
    header.append(el('strong','','COMPARE'), mode, theme);
    const body = el('div','gkc-body'), left = el('section','gkc-media'), surface = el('div','gkc-surface');
    for (const key of ['A','B']) {
        const figure = el('div',`gkc-frame gkc-${key.toLowerCase()}`);
        const video = el('video'); video.playsInline = true; video.preload = 'auto'; video.muted = true;
        const caption = el('div','gkc-caption',key);
        figure.append(video, caption); surface.append(figure); videos.push(video); figures.push(figure); captions.push(caption);
        on(video,'error',()=>{ transport.pause(); status.textContent = `Video ${key} cannot be played. Check its file or use MP4 / H.264.`; });
    }
    const divider = el('div','gkc-divider'); divider.append(el('span','','◀ ▶'));
    const wipe = el('input','gkc-wipe'); wipe.type = 'range'; wipe.min = '0'; wipe.max = '100'; wipe.step = '.1'; wipe.setAttribute('aria-label','A/B wipe position');
    surface.append(divider, wipe);
    const playback = el('div','gkc-playback'), play = el('button','','▶ Play'), start = el('button','','↺ Start');
    const repeatLabel = el('label','gkc-check'), repeat = el('input'); repeat.type = 'checkbox'; repeatLabel.append(repeat, ' Loop');
    const clock = el('span','gkc-clock','0:00 / 0:00'); playback.append(play, start, repeatLabel, clock);
    const seek = el('input','gkc-seek'); seek.type = 'range'; seek.min='0'; seek.max='1'; seek.step='.001'; seek.value='0'; seek.disabled=true; seek.setAttribute('aria-label','Comparison position');
    const markers = el('div','gkc-markers'), dimensions = el('div','gkc-info');
    const timeline=el('div','gkc-timeline'), track=el('div','gkc-track'), progress=el('div','gkc-progress');
    track.append(progress);timeline.append(track,seek,markers);
    const waveforms = ['A','B'].map(key => createWaveform({resolveWaveform, jump: time => transport.seek(time), title: `AUDIO ${key}`, ariaLabel: `Audio ${key} waveform position`}));
    const waveformPanel = el('div','gkc-waveforms');
    waveformPanel.append(...waveforms.map(waveform => waveform.element));
    const mixer = el('details','gkc-mixer'); mixer.open = true; mixer.append(el('summary','','Audio tracks'));
    const lanes = el('div','gkc-lanes');
    mixer.append(lanes);
    const status = el('div','gkc-status','Connect two videos and run the node.'); status.setAttribute('role','status');
    left.append(surface, playback, timeline, waveformPanel, dimensions, mixer, status);
    const right = el('section','gkc-prompt-side'); right.hidden=true;
    const promptHeader = el('div','gkc-toolbar'), autoLabel = el('label','gkc-check'), auto = el('input'); auto.type='checkbox'; autoLabel.append(auto,' Auto-scroll');
    promptHeader.append(el('strong','','PROMPT'), autoLabel);
    const legend = el('div','gkc-info','Timed action · General direction'), warning = el('div','gkc-info'), panel = el('div','gkc-prompt');
    right.append(promptHeader,legend,warning,panel); body.append(left,right); root.append(header,body);

    function persist() { save({...prefs}); }
    function apply() {
        mode.value = prefs.mode === 'wipe' ? 'wipe' : 'stack'; root.dataset.mode = mode.value;
        theme.value = prefs.theme === 'gold' ? 'gold' : 'obsidian'; root.dataset.theme = theme.value;
        wipe.value = String(Number.isFinite(prefs.wipe) ? Math.max(0,Math.min(100,prefs.wipe)) : 50);
        surface.style.setProperty('--wipe',`${wipe.value}%`);
        repeat.checked = prefs.repeat !== false; auto.checked = prefs.autoScroll !== false;
        transport.setRepeat(repeat.checked);
    }
    const videoDuration=()=>Math.max(0,...videos.map(v=>Number.isFinite(v.duration)?v.duration:0));
    function placeTimeLabels(){
        const width=markers.clientWidth;if(!width)return;
        const rows=[], total=videoDuration() || Math.max(timeButtons.at(-1)?.time || 0,1);
        for(const item of timeButtons){
            const x=7+Math.max(0,width-14)*Math.min(1,item.time/total), size=item.button.offsetWidth;
            const left=Math.max(0,Math.min(width-size,x-size/2));
            let row=rows.findIndex(end=>end+5<=left);if(row<0)row=rows.length;
            rows[row]=left+size;
            item.button.style.left=`${left}px`;item.button.style.top=`${12+row*29}px`;
            item.tick.style.left=`${x}px`;item.tick.style.height=`${10+row*29}px`;
        }
        markers.style.height=`${timeButtons.length?14+rows.length*29:0}px`;
    }
    const timelineResize=new ResizeObserver(placeTimeLabels);timelineResize.observe(markers);
    function renderPrompt() {
        const text = String(data?.prompt || ''); right.hidden = !text.trim(); root.classList.toggle('gkc-with-prompt', !right.hidden);
        const parsed = parseTimeline(text, Math.max(...videos.map(v=>v.duration || 0)));
        segments=parsed.segments; fragments=[]; active=-2; panel.replaceChildren(); markers.replaceChildren();timeButtons.length=0;
        warning.textContent=parsed.warning;
        for (const part of parsed.parts) {
            const span=el('span', part.kind === 'timed' ? 'gkc-scene' : 'gkc-general', part.text);
            if (part.kind === 'timed') {
                span.dataset.time = formatTime(segments.find(s=>s.id===part.segmentId).start);
                fragments.push({node:span,id:part.segmentId});
            }
            panel.append(span);
        }
        const duration=videoDuration();
        const times=[...new Set([0,...segments.flatMap(s=>[s.start,...(Number.isFinite(s.explicitEnd)?[s.explicitEnd]:[])])])].filter(time=>!duration||time<=duration).sort((a,b)=>a-b);
        for (const time of times) {
            const label=time<60?`${Math.round(time*1000)/1000}s`:formatTime(time);
            const button=el('button','gkc-time-button',label);button.type='button';button.title=`Seek both videos to ${formatTime(time)}`;button.setAttribute('aria-label',button.title);
            const tick=el('span','gkc-tick');tick.setAttribute('aria-hidden','true');
            button.onclick=()=>transport.seek(time); markers.append(tick,button);timeButtons.push({time,button,tick});
        }
        placeTimeLabels();
    }
    function update(time,duration,playing,buffering) {
        for (const waveform of waveforms) waveform.update(time,duration);
        seek.max=String(duration || 1); seek.disabled=!(duration>0); seek.value=String(time);
        progress.style.width=`${duration>0?Math.max(0,Math.min(100,time/duration*100)):0}%`;
        clock.textContent=`${formatTime(time)} / ${formatTime(duration)}${buffering ? ' · buffering' : ''}`;
        play.textContent=playing ? '❚❚ Pause' : '▶ Play';
        const index=activeIndex(segments, time >= duration ? Math.max(0,time-.001) : time);
        if (index===active) return;
        active=index;
        for (const f of fragments) f.node.classList.toggle('is-active',f.id===segments[index]?.id);
        for(const item of timeButtons){const selected=item.time===segments[index]?.start;item.button.classList.toggle('is-active',selected);if(selected)item.button.setAttribute('aria-current','true');else item.button.removeAttribute('aria-current');}
        const current=fragments.find(f=>f.id===segments[index]?.id)?.node;
        if (current && auto.checked) {
            const scale=panel.getBoundingClientRect().height/panel.clientHeight || 1;
            panel.scrollTo({top:Math.max(0,panel.scrollTop+(current.getBoundingClientRect().top-panel.getBoundingClientRect().top)/scale-panel.clientHeight*.15),behavior:'smooth'});
        }
    }
    const transport=createTransport(videos,()=>tracks,update,message=>{status.textContent=message;});
    function clearTracks() {
        for (const track of tracks) if (!videos.includes(track.media)) { track.media.pause(); track.media.removeAttribute('src'); track.media.load(); }
        tracks.length=0; lanes.replaceChildren();
    }
    function addTrack(id, name, media, removable=false, available=true) {
        const row=el('div','gkc-audio-row'), label=el('label','gkc-check'), toggle=el('input'); toggle.type='checkbox';
        const setting=prefs.audio?.[id] || {}; toggle.checked=available && setting.enabled===true; toggle.disabled=!available;
        const track={id,media,enabled:toggle.checked}; tracks.push(track);
        const title=el('span','',name+(available?'':' · no audio')); label.append(toggle,title);
        const volume=el('input'); volume.type='range'; volume.min='0'; volume.max='1'; volume.step='.01'; volume.value=String(Number.isFinite(setting.volume)?setting.volume:.25); volume.setAttribute('aria-label',`${name} volume`); volume.disabled=!available;
        media.volume=Number(volume.value); media.muted=!toggle.checked;
        const level=el('span','gkc-level',`${Math.round(media.volume*100)}%`);
        row.append(label,volume,level);
        const change=()=>{
            track.enabled=toggle.checked; media.muted=!track.enabled; media.volume=Number(volume.value); level.textContent=`${Math.round(media.volume*100)}%`;
            prefs.audio={...prefs.audio,[id]:{enabled:track.enabled,volume:media.volume}}; persist();
            if (!videos.includes(media) && !track.enabled) media.pause();
            transport.refresh();
        };
        on(toggle,'change',change); on(volume,'input',()=>{media.volume=Number(volume.value);level.textContent=`${Math.round(media.volume*100)}%`; prefs.audio={...prefs.audio,[id]:{enabled:track.enabled,volume:media.volume}}; persist();});
        if (removable) { const remove=el('button','','×'); remove.title='Remove audio track'; on(remove,'click',()=>{prefs.uploads=(prefs.uploads||[]).filter(x=>x.id!==id); persist(); rebuildTracks(); transport.refresh();}); row.append(remove); }
        if (!videos.includes(media)) {
            on(media,'error',()=>{track.enabled=false; toggle.checked=false; toggle.disabled=true; media.pause(); title.textContent=`${name} · unavailable`; status.textContent='An audio file is unavailable. Remove it or load a browser-compatible file.';});
            on(media,'loadedmetadata',()=>{if(transport.playing) transport.refresh();});
        }
        lanes.append(row);
    }
    function audioElement(descriptor) { const audio=el('audio'); audio.preload='auto'; audio.src=resolve(descriptor); return audio; }
    function rebuildTracks() {
        clearTracks();
        if (data) for (const [i,key] of ['a','b'].entries()) {
            videos[i].muted=true;
            addTrack(key,`${key.toUpperCase()} · ${data[key].name}`,data[key].audio ? audioElement(data[key].audio) : videos[i],false,!!(data[key].audio || data[key].has_audio));
        }
        if (data?.extra_audio) addTrack('extra','Extra audio',audioElement(data.extra_audio));
        for (const item of prefs.uploads || []) addTrack(item.id,item.name,audioElement(item.video),true);
    }
    on(mode,'change',()=>{prefs.mode=mode.value;apply();persist();});
    on(theme,'change',()=>{prefs.theme=theme.value;apply();persist();});
    on(wipe,'input',()=>{prefs.wipe=Number(wipe.value);surface.style.setProperty('--wipe',`${wipe.value}%`);persist();});
    on(auto,'change',()=>{prefs.autoScroll=auto.checked;persist();});
    on(repeat,'change',()=>{prefs.repeat=repeat.checked;transport.setRepeat(repeat.checked);persist();});
    on(play,'click',()=>transport.toggle()); on(start,'click',()=>transport.seek(0)); on(seek,'input',()=>transport.seek(Number(seek.value)));
    on(root,'keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.code==='KeyS')return; e.stopPropagation(); if(/INPUT|TEXTAREA|SELECT|BUTTON/.test(e.target.tagName))return; if(e.code==='Space'){e.preventDefault();transport.toggle();} if(e.code==='ArrowLeft'||e.code==='ArrowRight'){e.preventDefault();transport.seek(transport.time+(e.code==='ArrowLeft'?-1:1));}});
    for(const event of ['pointerdown','pointerup','click','dblclick','wheel'])on(root,event,e=>e.stopPropagation());
    for(const video of videos)on(video,'loadedmetadata',()=>{
        renderPrompt(); dimensions.textContent=videos.map((v,i)=>`${i?'B':'A'}: ${v.videoWidth}×${v.videoHeight} · ${formatTime(v.duration)}`).join('    |    ');
        if(videos.every(v=>v.readyState>=1))status.textContent='';
    });
    apply();
    return {element:root, setPreferences(value){prefs={...value};apply(); if(data)rebuildTracks();},
        setData(value){++revision;transport.reset();data=value;for(const [i,key]of ['a','b'].entries()){captions[i].textContent=`${key.toUpperCase()} · ${value[key].name}`;videos[i].src=resolve(value[key].video);videos[i].load();waveforms[i].load(value[key].audio || value[key].video);}rebuildTracks();renderPrompt();status.textContent='Loading videos…';},
        dispose(){disposed=true;++revision;transport.dispose();timelineResize.disconnect();abort.abort();clearTracks();for(const waveform of waveforms)waveform.dispose();for(const v of videos){v.pause();v.removeAttribute('src');v.load();}root.remove();}};
}
