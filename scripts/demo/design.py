from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageOps
import json, math, subprocess, wave, textwrap

ROOT=Path(__file__).resolve().parents[2]
HERE=ROOT/'out/demo'
FF=ROOT/'node_modules/ffmpeg-static/ffmpeg.exe'
PLAN=json.loads(Path(__file__).with_name('plan.json').read_text())
BG='#090d12'; PANEL='#101820'; INK='#eff5fb'; MUTED='#9bacbd'; LIME='#caff49'; CYAN='#39e5ff'

def font(size,bold=False,mono=False):
    name='consola.ttf' if mono else ('segoeuib.ttf' if bold else 'segoeui.ttf')
    return ImageFont.truetype('C:/Windows/Fonts/'+name,size)

def wrap(draw,text,f,width):
    lines=[]; line=''
    for word in text.split():
        trial=(line+' '+word).strip()
        if draw.textlength(trial,font=f)>width and line: lines.append(line);line=word
        else: line=trial
    if line:lines.append(line)
    return lines

def txt(draw,xy,text,size=30,color=INK,bold=False,width=None,spacing=1.25,mono=False):
    x,y=xy; f=font(size,bold,mono)
    for paragraph in text.split('\n'):
        lines=wrap(draw,paragraph,f,width) if width else [paragraph]
        for line in lines:
            draw.text((x,y),line,font=f,fill=color);y+=int(size*spacing)
    return y

def base(scene,n):
    im=Image.new('RGB',(1920,1080),BG); d=ImageDraw.Draw(im)
    for x in range(0,1920,96):d.line((x,0,x,1080),fill='#0e151d')
    for y in range(0,1080,96):d.line((0,y,1920,y),fill='#0e151d')
    d.rectangle((0,0,1920,7),fill=LIME)
    d.rounded_rectangle((48,29,98,79),radius=12,fill=LIME)
    txt(d,(58,30),'R',35,BG,True)
    txt(d,(115,36),'RapidCast',29,INK,True)
    txt(d,(320,44),f'{n+1:02} / {len(PLAN):02}   PRODUCT DEMO',17,MUTED,mono=True)
    d.rounded_rectangle((1374,32,1872,78),radius=10,fill='#282614',outline='#655e29')
    txt(d,(1390,42),'SIMULATOR + LOCAL TEST FOOTAGE',20,'#f5db7c',True)
    txt(d,(48,103),scene['title'],46,INK,True)
    d.line((48,1018,1872,1018),fill='#2a3744',width=2)
    txt(d,(48,1035),'BUILT WITH CODEX  /  github.com/L0x3n/rapidcast',18,MUTED,mono=True)
    txt(d,(1625,1035),'ENGINE BETA',21,LIME,True,mono=True)
    return im

def panel(im,path):
    source=Image.open(path).convert('RGB'); source=ImageOps.contain(source,(1312,730),Image.Resampling.LANCZOS)
    x=48+(1312-source.width)//2;y=173+(730-source.height)//2
    ImageDraw.Draw(im).rounded_rectangle((46,171,1362,905),radius=12,fill=PANEL,outline='#31404e',width=2)
    im.paste(source,(x,y))

def sidebar(im,scene):
    d=ImageDraw.Draw(im);y=204
    for i,claim in enumerate(scene['claim']):
        color=LIME if i==0 else INK
        y=txt(d,(1410,y),claim,32 if i==0 else 29,color,i==0,width=440)+28
        if i==0:d.line((1410,y-12,1820,y-12),fill='#394835',width=2)
    txt(d,(1410,780),'Actual app captures.\nCuts and stills edited for clarity.\nNo real-model speed claim.',19,MUTED,width=435)

def card(im,xy,title,body,width=520,height=220):
    d=ImageDraw.Draw(im);x,y=xy
    d.rounded_rectangle((x,y,x+width,y+height),radius=18,fill=PANEL,outline='#34414d',width=2)
    txt(d,(x+28,y+25),title,25,LIME,True,width=width-56)
    txt(d,(x+28,y+83),body,26,INK,width=width-56)

def slide(scene,n):
    im=base(scene,n);d=ImageDraw.Draw(im);kind=scene['kind']
    if kind in ['hero','closing']:
        txt(d,(70,235),'CHAT BUILDS\nTHE STREAM.',101,INK,True)
        txt(d,(77,520),'Your community. Your approval.\nA show you build together.',33,MUTED)
        pic=Image.open(ROOT/'out/widget-smoke/follow-program.png').convert('RGB')
        pic=ImageOps.contain(pic,(920,520));im.paste(pic,(945,237))
        d.rounded_rectangle((942,233,1868,760),radius=14,outline='#466336',width=3)
        for i,label in enumerate(['01  SUGGEST','02  APPROVE','03  BRING IT TO LIFE']):
            x=77+i*600;d.rounded_rectangle((x,808,x+555,895),radius=15,fill=PANEL,outline='#364333')
            txt(d,(x+25,832),label,27,LIME,True)
        if kind=='closing':txt(d,(78,646),'github.com/L0x3n/rapidcast',33,LIME,True)
    elif kind=='architecture':
        labels=[('MAIN PROCESS','Twitch, provider APIs\nEncrypted credentials\nApproval and persistence'),('COMPOSITOR','Frames and audio\nBounded recorder input\nFFmpeg output'),('WIDGET WORKERS','OffscreenCanvas drawing\nNo network or credentials\nIsolated watchdogs')]
        for i,(title,body) in enumerate(labels):
            card(im,(65+i*610,215),title,body,width=570,height=275)
            if i<2:txt(d,(645+i*610,312),'>',39,LIME,True)
        txt(d,(80,542),'ONE ORIGINAL CODEX CHAT',22,LIME,True,mono=True)
        txt(d,(80,580),'01a19363-ba10-7cd0-a5b7-58c1e60e709d',28,INK,mono=True)
        log=subprocess.check_output(['git','log','--reverse','--format=%h  %s'],cwd=ROOT,text=True).splitlines()
        shown=[log[i] for i in [0,2,4,6,8] if i<len(log)]
        for i,row in enumerate(shown):txt(d,(80,646+i*44),row[:98],23,MUTED,mono=True)
        txt(d,(80,899),'Linus directed the brief and phases. Codex implemented the application and checks.',29,INK)
    elif kind=='verification':
        data=json.loads((ROOT/'out/release/VERIFICATION.json').read_text())
        assert data['compiledProgramFilesIdentical']==14 and data['secretScan']['findings']==0
        for i,(a,b) in enumerate([('220 TESTS','Strict TypeScript and production build'),('NATIVE CHECKS','Electron, Workers, FFmpeg and loopback RTMP'),('PORTABLE RELEASE','Clean clone, packaging and extracted-ZIP launch')]):card(im,(65+i*610,220),a,b,width=570,height=250)
        txt(d,(80,546),'PUBLIC WINDOWS RELEASE',26,LIME,True)
        txt(d,(80,597),'github.com/L0x3n/rapidcast/releases/tag/v1.0',35,INK,True)
        txt(d,(80,681),'Tagged commit: '+data['releaseCommit'][:12],24,MUTED,mono=True)
        txt(d,(80,758),'Still pending: real Twitch/model/device/game/OBS acceptance.',31,'#f5db7c',True)
        txt(d,(80,824),'Controlled test evidence is included in the release notes and verification record.',26,MUTED)
    else:
        pictures={'approval':ROOT/'out/ai-smoke/studio-ready.png','setup':ROOT/'out/setup-smoke/style-preview.png','stats':ROOT/'out/stats-smoke-long/stats.png','packs':ROOT/'out/packs-smoke/review.png','program':ROOT/'out/ai-smoke/generated-program.png','fault':ROOT/'out/widget-smoke/paused-badges.png','ui-ai':HERE/'capture-ai/frame-00012.jpg'}
        panel(im,pictures[kind]);sidebar(im,scene)
    im.save(HERE/(scene['id']+'.png'))

def run(args):
    result=subprocess.run([str(FF),'-hide_banner','-loglevel','error','-y',*args],cwd=HERE,capture_output=True,text=True)
    if result.returncode:raise RuntimeError(result.stderr[-5000:])

def capture_video(kind):
    folder=HERE/('capture-'+kind);frames=json.loads((folder/'frames.json').read_text())['frames']
    frames=[f for f in frames if f['at']>=3]
    text=[]
    for i,f in enumerate(frames):
        duration=(frames[i+1]['at']-f['at']) if i+1<len(frames) else .2
        text.extend([f"file '{(folder/f['file']).as_posix()}'",f'duration {duration:.5f}'])
    text.append(f"file '{(folder/frames[-1]['file']).as_posix()}'")
    path=folder/'sequence.txt';path.write_text('\n'.join(text))
    run(['-f','concat','-safe','0','-i',str(path),'-vf','fps=30,scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p','-c:v','libx264','-preset','veryfast','-crf','20','-an',str(folder/'ui.mp4')])
