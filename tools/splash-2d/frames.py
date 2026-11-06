import sys, os, numpy as np, anim, flat2d
from PIL import Image
from multiprocessing import Pool
FPS=60; ROOT='/workspace/splash-2d/frames'
def ease(x): x=min(max(x,0),1); return x*x*x*(x*(6*x-15)+10)
def params(kind,i):
    t=i/FPS
    if kind=='oneshot' or t<3.2: return t,None
    tau=(t-3.2)/1.2
    fl=1-ease(tau/0.5); ts=2.05*(1-ease(tau)); return ts,fl
def render(job):
    kind,i=job; ts,fl=params(kind,i); out=[]
    for bg in (np.zeros(3),np.ones(3)):
        anim.BG=bg; out.append(np.clip(flat2d.s1flat(ts,fl),0,1))
    B,W=out; a=np.clip(1-(W-B).mean(-1),0,1); col=np.where(a[...,None]>1e-4,B/np.maximum(a[...,None],1e-4),0)
    rgba=np.dstack([np.clip(col,0,1),a]); Image.fromarray((rgba*255+0.5).astype(np.uint8),'RGBA').save(f'{ROOT}/{kind}/{i:04d}.png')
if __name__=='__main__':
    jobs=[('oneshot',i) for i in range(int(3.8*FPS))]+[('loop',i) for i in range(int(4.4*FPS))]
    for k in ('oneshot','loop'): os.makedirs(f'{ROOT}/{k}',exist_ok=True)
    with Pool(7) as p: p.map(render,jobs,chunksize=4)
    print('ok')
