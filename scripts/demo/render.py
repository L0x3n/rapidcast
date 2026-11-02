from pathlib import Path
import json, textwrap, shutil
import design as render
from music import compose

HERE=render.HERE
DURATIONS=[12,16,18,12,14,14,16,14,18,18,10]
CAPTIONS=[
 'Viewer ideas become interactive overlays. The streamer keeps control.',
 'Actual app footage. Simulator events and a fixed-response test endpoint.\nThis demonstrates the local workflow, not Twitch delivery or real-model performance.',
 'Screen the idea. Approve it. Validate the code. Test for three seconds.\nOnly a passing result can be published, with the viewer credited.',
 'Real rendered program output. The chat reactor responds to simulator messages.\nViewer attribution stays attached to the published widget.',
 'Crash and infinite-loop tests pause the affected widgets. Recording continues.\nWorkers have no network or credentials. Watchdogs stay active at runtime.',
 'Connect Twitch, select devices, test performance and preview four scene styles.\nLocal encoder checks and verified Twitch delivery are separate evidence.',
 'A measured 10-minute local session: 720 simulated messages, 1 visible trigger.\nTwitch and simulator datasets stay separate. Comparisons show association.',
 'Share scenes, code, parameters, images and credits as an overlay pack.\nReview and isolated tests come before explicit layout replacement.',
 'Linus directed the brief and phases. Codex implemented the app and checks.\nOne continuous chat, with Git commits and documented evidence for each phase.',
 'Public source, portable Windows app, checksums and verification evidence.\nReal Twitch/model/device/game/OBS acceptance remains pending. Engine beta.',
 'Let chat help build the show.\nDownload the Windows release or inspect the full source on GitHub.'
]

def overlay_text(scene,caption):
    parts=[]
    for i,line in enumerate(caption.split('\n')):
        f=HERE/(scene['id']+f'-feature-{i}.txt');f.write_text(line,encoding='utf-8')
        parts.append(f"drawtext=fontfile=caption-font.ttf:textfile={f.name}:fontsize=29:fontcolor=0xf1f5fa:x='56+70*max(0,1-t/0.6)':y={931+i*40}:alpha='min(1,t/0.4)'")
    # Kinetic feature captions and chapter markers stay outside app pixels.
    parts.append(f"drawtext=fontfile=caption-font.ttf:text='{scene['id'][:2]}':fontsize=44:fontcolor=0xcaff49:x='1810+180*max(0,1-t/0.5)':y=915")
    return ','.join(parts)

if __name__=='__main__':
    for kind in ['ai','widgets','setup']:render.capture_video(kind)
    shutil.copyfile('C:/Windows/Fonts/segoeui.ttf',HERE/'caption-font.ttf')
    total=sum(DURATIONS)-.5*(len(DURATIONS)-1)
    compose(HERE/'original-soundtrack.wav',total)
    rendered=[];timeline=[];elapsed=0
    for n,(scene,duration,caption) in enumerate(zip(render.PLAN,DURATIONS,CAPTIONS)):
        render.slide(scene,n)
        args=['-loop','1','-framerate','30','-i',scene['id']+'.png'];kind=scene['kind'];video=None;crop=''
        if kind in ['ui-ai','approval']:video=HERE/'capture-ai/ui.mp4'
        if kind=='approval':crop='crop=1180:750:240:100,'
        if kind=='program':video=render.ROOT/'out/ai-smoke/ai-flow.mp4'
        if kind=='fault':video=HERE/'capture-widgets/ui.mp4'
        if kind=='setup':video=HERE/'capture-setup/ui.mp4'
        if kind in ['hero','closing']:video=render.ROOT/'out/widget-smoke/widgets.mp4'
        filters='[0:v]'
        if video:
            args+=['-stream_loop','-1','-i',str(video)]
            if kind in ['hero','closing']:
                filters='[1:v]scale=920:518,setsar=1[clip];[0:v][clip]overlay=945:237:shortest=1[view];[view]'
            else:
                filters=f'[1:v]{crop}scale=1312:730:force_original_aspect_ratio=decrease,pad=1312:730:(ow-iw)/2:(oh-ih)/2:color=0x101820,setsar=1[clip];[0:v][clip]overlay=48:173:shortest=1[view];[view]'
        filters+=overlay_text(scene,caption)+',format=yuv420p[v]'
        out=scene['id']+'-music.mp4'
        args+=['-filter_complex',filters,'-map','[v]','-an','-t',str(duration),'-r','30','-c:v','libx264','-preset','veryfast','-crf','18','-threads','4',out]
        render.run(args);rendered.append(out);timeline.append({'chapter':scene['id'],'start':elapsed,'duration':duration,'caption':caption});elapsed+=duration-.5
        print('Animated chapter rendered: '+scene['id'],flush=True)
    args=[];filters=[]
    for i,path in enumerate(rendered):
        args+=['-i',path];filters.append(f'[{i}:v]settb=AVTB,setpts=PTS-STARTPTS,format=yuv420p[v{i}]')
    args+=['-i','original-soundtrack.wav']
    previous='v0';offset=DURATIONS[0]-.5
    for i in range(1,len(rendered)):
        name=f'join{i}';transition=['smoothleft','fade','smoothright','fade'][i%4]
        filters.append(f'[{previous}][v{i}]xfade=transition={transition}:duration=0.5:offset={offset}[{name}]')
        previous=name;offset+=DURATIONS[i]-.5
    filters.append(f'[{len(rendered)}:a]asplit=2[audio][meter]')
    filters.append('[meter]showwaves=s=340x44:mode=cline:colors=0xcaff49:rate=30[wave]')
    filters.append(f'[{previous}][wave]overlay=1435:955:shortest=1,format=yuv420p[outv]')
    filters.append('[audio]loudnorm=I=-18:TP=-1.5:LRA=9[outa]')
    args+=['-filter_complex_threads','1','-filter_complex',';'.join(filters),'-map','[outv]','-map','[outa]','-t',str(total),'-c:v','libx264','-preset','veryfast','-crf','18','-threads','4','-c:a','aac','-b:a','192k','-ar','48000','-ac','2','-movflags','+faststart','RapidCast-demo-music.mp4']
    render.run(args)
    (HERE/'music-timeline.json').write_text(json.dumps({'duration':total,'voice':False,'music':'Original synthesized 120 BPM electronic instrumental; no samples or third-party music.','animation':'Live app captures, kinetic feature captions, directional transitions and audio-reactive waveform.','chapters':timeline},indent=2))
    print(f'Voice-free music demo finished: {total:.2f}s',flush=True)
