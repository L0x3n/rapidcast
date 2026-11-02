from pathlib import Path
import numpy as np
import wave

SR=48000

def compose(path,duration):
    rng=np.random.default_rng(803)
    size=int((duration+1)*SR); mix=np.zeros((size,2),np.float32)
    def add(start,sound,gain=.1,pan=0):
        offset=int(start*SR)
        if offset>=size:return
        sound=np.asarray(sound[:size-offset],np.float32)
        mix[offset:offset+len(sound),0]+=sound*gain*np.sqrt((1-pan)/2)
        mix[offset:offset+len(sound),1]+=sound*gain*np.sqrt((1+pan)/2)
    def hz(midi):return 440*2**((midi-69)/12)
    beat=.5
    chords=[(48,51,55,58),(44,48,51,55),(51,55,58,62),(46,50,53,58)]
    for start in np.arange(0,duration,4):
        notes=chords[int(start/4)%4]; t=np.arange(int(4.7*SR))/SR
        envelope=np.minimum(t/.35,1)*np.clip((4.7-t)/.9,0,1)
        sidechain=1-.24*np.exp(-np.mod(t,beat)/.085)
        for k,note in enumerate(notes):
            f=hz(note+12)
            tone=(np.sin(2*np.pi*f*t)+.4*np.sin(2*np.pi*(f*1.0016)*t+.4)+.13*np.sin(2*np.pi*2*f*t))/1.53
            add(start,tone*envelope*sidechain,.07,(k-1.5)/2.5)
    for n,start in enumerate(np.arange(0,duration,.25)):
        notes=chords[int(start/4)%4]; note=notes[[0,2,1,3,2,1,3,2][n%8]]+24
        t=np.arange(int(.8*SR))/SR; f=hz(note)
        tone=(np.sin(2*np.pi*f*t)+.22*np.sin(2*np.pi*2*f*t)+.07*np.sin(2*np.pi*3*f*t))*np.exp(-7*t)*np.minimum(t/.008,1)
        intro=min(1,start/6)
        add(start,tone,.1*intro,.5*np.sin(n*.71))
        add(start+.375,tone,.028*intro,-.6*np.sin(n*.71))
        if n%2==0:
            bt=np.arange(int(.45*SR))/SR; root=notes[0]-12
            bass=(np.sin(2*np.pi*hz(root)*bt)+.2*np.sin(2*np.pi*hz(root)*2*bt))*np.exp(-4*bt)*np.minimum(bt/.015,1)
            add(start,bass,.24*min(1,start/8))
    for n,start in enumerate(np.arange(4,duration-3,.5)):
        level=.9 if int(start/8)%4!=3 else .64
        t=np.arange(int(.32*SR))/SR
        phase=2*np.pi*(48*t+95*.035*(1-np.exp(-t/.035)))
        kick=np.sin(phase)*np.exp(-12*t)+rng.normal(0,.11,len(t))*np.exp(-100*t)
        add(start,kick,.46*level)
        if n%2==1:
            t=np.arange(int(.24*SR))/SR
            noise=rng.normal(0,1,len(t)); noise=noise-np.convolve(noise,np.ones(15)/15,'same')
            snare=(noise*.55+np.sin(2*np.pi*185*t)*.28)*np.exp(-18*t)
            add(start,snare,.20*level,.12)
    for n,start in enumerate(np.arange(4,duration-3,.25)):
        t=np.arange(int(.085*SR))/SR; noise=rng.normal(0,1,len(t))
        noise=noise-np.convolve(noise,np.ones(7)/7,'same')
        add(start,noise*np.exp(-65*t),.043 if n%2 else .025,-.32 if n%2 else .32)
    fade=np.minimum(np.arange(size)/SR/2,1)*np.clip((duration-np.arange(size)/SR)/3.5,0,1)
    mix*=fade[:,None]
    mix=np.tanh(mix*1.1)
    peak=float(np.max(np.abs(mix)));mix*=.81/max(peak,.001)
    pcm=(mix[:int(duration*SR)]*32767).astype('<i2')
    with wave.open(str(path),'wb') as out:
        out.setnchannels(2);out.setsampwidth(2);out.setframerate(SR);out.writeframes(pcm.tobytes())
    print(f'Original instrumental rendered: {duration:.2f}s, 120 BPM, stereo. No voice or sampled music.',flush=True)

if __name__=='__main__':compose(Path(__file__).with_name('original-soundtrack.wav'),157)
