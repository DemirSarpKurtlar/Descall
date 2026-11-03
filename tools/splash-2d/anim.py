# Descall logo animations — SDF renderer built from the exact geometry in logo-final/core.py (SYM, appicon-rounded)
import numpy as np, math, sys, subprocess, os
from PIL import Image
OUT='.'
FPS=60; DUR=3.5; N=int(FPS*DUR); C=1000; S=440.0
BG=np.array([244,244,246])/255; CHAR=np.array([0x39,0x3C,0x4D])/255; BLUE=np.array([0x58,0x7A,0xF5])/255; WHITE=np.ones(3)
K=8.5/1024*S                      # px per logo unit (appicon-rounded transform)
R_TILE=230/1024*S
H=math.degrees(math.acos(9.5*math.sqrt(2)/21.5))
RINGS=[((40.5,59.5),-45+H,315-H),((59.5,40.5),135+H,495-H)]; RR,RW=21.5,11.5; DOT=((50,50),5.75)
ys,xs=np.mgrid[0:C,0:C].astype(np.float32); X0=xs-C/2+0.5; Y0=ys-C/2+0.5
def ss(a,b,x): t=np.clip((x-a)/(b-a),0,1); return t*t*(3-2*t)
def spring(t,w=12,z=0.7):
    if t<=0: return 0.0
    wd=w*math.sqrt(1-z*z); return 1-math.exp(-z*w*t)*(math.cos(wd*t)+z*w/wd*math.sin(wd*t))
def eo(t): t=min(max(t,0),1); return 1-(1-t)**3
def cov(d): return np.clip(0.5-d,0,1)          # d in px -> AA coverage
def box(x,y,s=S):
    b=s/2-R_TILE*s/S; r=R_TILE*s/S; qx=np.abs(x)-b; qy=np.abs(y)-b
    return np.hypot(np.maximum(qx,0),np.maximum(qy,0))+np.minimum(np.maximum(qx,qy),0)-r
def arc(x,y,i,prog=1.0):     # x,y px rel. centre; returns px
    (cx,cy),a0,a1=RINGS[i]; u=x/K+50-cx; v=y/K+50-cy
    span=(a1-a0)*prog; ang=(np.degrees(np.arctan2(v,u))-a0)%360
    rad=np.hypot(u,v); din=np.abs(rad-RR)-RW/2
    e0=np.hypot(u-RR*math.cos(math.radians(a0)),v-RR*math.sin(math.radians(a0)))-RW/2
    e1=np.hypot(u-RR*math.cos(math.radians(a0+span)),v-RR*math.sin(math.radians(a0+span)))-RW/2
    return np.where(ang<=span,din,np.minimum(e0,e1))*K
def dot(x,y,sc=1.0): return (np.hypot(x/K,y/K)-DOT[1]*sc)*K
def sym(x,y): return np.minimum(np.minimum(arc(x,y,0),arc(x,y,1)),dot(x,y))
def over(img,col,a): return img*(1-a[...,None])+np.asarray(col)*a[...,None] if np.ndim(col)==1 else img*(1-a[...,None])+col*a[...,None]
def canvas(): return np.broadcast_to(BG,(C,C,3)).copy()
def flat(img,x=X0,y=Y0,sc=1.0,alpha=1.0):
    img=over(img,CHAR,cov(box(x/sc,y/sc)*sc)*alpha); return over(img,BLUE,cov(sym(x/sc,y/sc)*sc)*alpha)
def shadow(img,d,amt,yoff=0): return over(img,np.zeros(3),np.exp(-np.maximum(d,0)/38)*amt*(d>-1e9))
def rot(x,y,a): c,s=math.cos(a),math.sin(a); return c*x+s*y,-s*x+c*y
def norm_shade(h,L=(-0.55,-0.65,0.52)):
    gy,gx=np.gradient(h); n=np.stack([-gx,-gy,np.ones_like(h)],-1); n/=np.linalg.norm(n,axis=-1,keepdims=True)
    L=np.array(L)/np.linalg.norm(L); return np.clip(n@L,0,1), n

# ---------- 1 liquid glass: drop rises, liquid ribbon unspools into the two rings, lens flattens to tile
def s1(t):
    img=canvas(); g=spring(t-0.05,w=8,z=0.62); sc=max(0.15+0.85*g,1e-3)
    m=ss(0.45,1.5,t); snap=ss(2.0,2.18,t); pulse=1+0.035*math.sin(math.pi*min(max((t-2.0)/0.25,0),1))
    sc*=pulse; x=X0/sc; y=Y0/sc
    dg=((1-m)*(np.hypot(x,y)-S*0.47)+m*box(x,y))*sc
    img=shadow(img,dg-18*sc+ (Y0<0)*0,0.10*(1-snap))
    # refraction: radial lens displacement near rim + slow wobble
    inside=np.clip(-dg/(S*0.5),0,1); lens=1+0.22*(1-inside)**2*(1-m*0.6)
    q=ss(0.25,1.85,t); r=np.hypot(x,y); sw=(1-q)**2*2.6*np.exp(-r/180)
    lx,ly=x*lens,y*lens; ca,sa=np.cos(sw),np.sin(sw); ux=ca*lx-sa*ly; uy=sa*lx+ca*ly
    d_arc=np.minimum(arc(ux,uy,0,0.05+0.95*ss(0.2,1.7,t)),arc(ux,uy,1,0.05+0.95*ss(0.3,1.8,t)))
    blob=np.hypot(ux,uy)-60*(1-q)
    k=30*(1-q)+1e-3; hh=np.clip(0.5+0.5*(blob-d_arc)/k,0,1); d_l=(blob*(1-hh)+d_arc*hh-k*hh*(1-hh))
    d_l=np.minimum(d_l,dot(ux,uy,ss(1.1,1.7,t)*1.0+1e-3))
    d_l=d_l*sc
    a_g=cov(dg)
    body=over(img.copy(),CHAR,a_g*0.16)
    # liquid with gloss
    hl=np.clip(-d_l/10,0,1); sh,n=norm_shade(hl*14)
    liq=BLUE[None,None,:]*(0.78+0.32*sh[...,None])+ (sh[...,None]**18)*0.7
    body=over(body,liq,cov(d_l)*a_g)
    # iridescent rim
    ang=np.arctan2(Y0,X0)+t*1.3; rim=np.exp(-np.maximum(-dg,0)/7)*a_g
    iri=np.stack([0.62+0.38*np.cos(ang*2+0.0),0.80+0.20*np.cos(ang*2+2.1),0.95+0.05*np.cos(ang*2+4.2)],-1)
    body=over(body,iri,rim*0.85)
    spec=np.exp(-(((X0+S*0.22*sc)/(S*0.22*sc))**2+((Y0+S*0.3*sc)/(S*0.09*sc))**2))*a_g
    body=over(body,WHITE,spec*0.55)
    body=over(body,WHITE,np.exp(-np.abs(dg+3)/1.2)*a_g*0.5)
    fl=flat(canvas(),sc=pulse)
    return body*(1-snap)+fl*snap

# ---------- 2 particles: tile settles, ~4k particles spiral in on staggered springs, resolve to crisp
rng=np.random.default_rng(7); P=[]
while len(P)<4200:
    p=rng.uniform(-35*K,35*K,(4000,2)); P+=list(p[sym(p[:,0:1].T,p[:,1:2].T)[0]<-1.5])
P=np.array(P[:4200]); a0=rng.uniform(0,2*np.pi,len(P)); r0=rng.uniform(330,470,len(P))
ST=np.stack([np.cos(a0)*r0,np.sin(a0)*r0],1); DL=0.25+0.55*((a0/(2*np.pi))+rng.uniform(0,0.25,len(P)))%1*0.9
SZ=rng.uniform(0.7,1.4,len(P))
from scipy.ndimage import gaussian_filter
def s2(t):
    img=canvas(); g=spring(t,w=9,z=0.78); ts=0.9+0.1*g
    img=shadow(img,box(X0/ts,Y0/ts)*ts-14,0.08*min(t/0.4,1)); img=over(img,CHAR,cov(box(X0/ts,Y0/ts)*ts)*min(t/0.35,1))
    tt=np.clip(t-DL,0,None); w=7.5; z=0.82; wd=w*math.sqrt(1-z*z)
    e=1-np.exp(-z*w*tt)*(np.cos(wd*tt)+z*w/wd*np.sin(wd*tt)); e=np.where(tt>0,e,0)
    phi=(1-e)*1.6; d=ST-P; c,s=np.cos(phi),np.sin(phi)
    pos=P+np.stack([c*d[:,0]-s*d[:,1],s*d[:,0]+c*d[:,1]],1)*(1-e)[:,None]+C/2
    dens=np.zeros((C,C),np.float32); ix=np.floor(pos[:,0]).astype(int); iy=np.floor(pos[:,1]).astype(int)
    fx=pos[:,0]-ix; fy=pos[:,1]-iy; ok=(ix>=0)&(iy>=0)&(ix<C-1)&(iy<C-1)
    for dx,dy,wgt in ((0,0,(1-fx)*(1-fy)),(1,0,fx*(1-fy)),(0,1,(1-fx)*fy),(1,1,fx*fy)):
        np.add.at(dens,(iy[ok]+dy,ix[ok]+dx),(wgt*SZ)[ok])
    dens=gaussian_filter(dens,1.1); a=np.clip(dens*5.0,0,1)
    glow=np.clip(gaussian_filter(dens,6)*3,0,1)*(1-ss(1.5,2.1,t))
    rs=ss(1.55,2.05,t)
    img=over(img,np.array([0.55,0.68,1.0]),glow*0.35)
    img=over(img,np.clip(BLUE*1.25+0.08,0,1),a*(1-rs))
    return over(img,BLUE,cov(sym(X0,Y0))*rs)

# ---------- 3 stroke reveal: hairline outline -> fill floods inward -> rings draw -> dot pops
def s3(t):
    img=canvas(); g=spring(t,w=10,z=0.8); ts=0.86+0.14*g; db=box(X0/ts,Y0/ts)*ts
    lw=1.2+ (S/2+12)*eo((t-0.45)/0.6)
    a=cov(np.abs(db+lw/2)-lw/2)*min(t/0.2,1)
    img=shadow(img,db-14,0.08*ss(0.4,1.0,t)); img=over(img,CHAR,a)
    p0=eo((t-0.85)/0.75); p1=eo((t-1.0)/0.75)
    d=np.full((C,C),1e4,np.float32)
    if p0>0: d=np.minimum(d,arc(X0,Y0,0,p0))
    if p1>0: d=np.minimum(d,arc(X0,Y0,1,p1))
    ds=spring(t-1.55,w=16,z=0.5)
    if ds>0: d=np.minimum(d,dot(X0,Y0,max(ds,1e-3)))
    return over(img,BLUE,cov(d))

# ---------- 4 assembly: tile lifts in, ring pieces arc in with rotation, dot drops last, settle
def piece(x,y,i,t,fx,fy,fr,delay):
    e=spring(t-delay,w=9,z=0.66); ox,oy=fx*(1-e),fy*(1-e); ang=fr*(1-e)
    cx=(RINGS[i][0][0]-50)*K if i<2 else 0; cy=(RINGS[i][0][1]-50)*K if i<2 else 0
    u,v=rot(x-ox-cx,y-oy-cy,ang); u+=cx; v+=cy
    return (arc(u,v,i) if i<2 else dot(u,v,max(e,1e-3))), min(max((t-delay)/0.15,0),1)
def s4(t):
    img=canvas(); g=spring(t,w=8.5,z=0.7); ts=0.55+0.45*g; ang=math.radians(-9)*(1-g)
    u,v=rot(X0,Y0,ang); db=box(u/ts,v/ts)*ts
    img=shadow(img,db-16,0.1*min(t/0.3,1)); img=over(img,CHAR,cov(db)*min(t/0.2,1))
    for i,fx,fy,fr,dl in ((0,-300,230,-2.1,0.3),(1,300,-230,-2.1,0.42),(2,0,-360,0,0.9)):
        d,al=piece(X0,Y0,i,t,fx,fy,fr,dl); img=over(img,BLUE,cov(d)*al)
    return img

# ---------- 5 tilt + light sweep: embossed tile swings flat in perspective, a light band sweeps, flattens
def s5(t):
    th=math.radians(40)*(1-spring(t-0.05,w=6.2,z=0.82)); f=1400.0
    sc=0.94+0.06*spring(t,w=7,z=0.9)
    x=X0*f/(f*math.cos(th)-X0*math.sin(th)); y=Y0*(f+x*math.sin(th))/f; x/=sc; y/=sc
    al=min(t/0.3,1); emb=1-ss(1.85,2.2,t)
    db=box(x,y)*sc; dsy=sym(x,y)*sc
    img=shadow(canvas(),db-16,0.10*al)
    hb=np.clip(-db/12,0,1); hs=np.clip(-dsy/9,0,1)
    shb,_=norm_shade(hb*10); shs,_=norm_shade(hs*9)
    tile=CHAR[None,None,:]*(1+emb*(0.55*shb[...,None]-0.25))
    sw=-1.1+2.6*ss(0.5,1.9,t); band=np.exp(-(((x+y*0.45)/S-sw)/0.09)**2)*emb
    tile=tile+band[...,None]*0.22
    img=over(img,np.clip(tile,0,1),cov(db)*al)
    logo=BLUE[None,None,:]*(1+emb*(0.5*shs[...,None]-0.2))+band[...,None]*0.35
    img=over(img,np.clip(logo,0,1),cov(dsy)*al)
    return img

STY={1:('01-liquid-glass',s1),2:('02-particles',s2),3:('03-stroke-reveal',s3),4:('04-geometric-assembly',s4),5:('05-tilt-light-sweep',s5)}
if __name__=='__main__':
    k=int(sys.argv[1]); name,fn=STY[k]
    enc=lambda w,h,o: subprocess.Popen(['ffmpeg','-y','-loglevel','error','-f','rawvideo','-pix_fmt','rgb24','-s',f'{w}x{h}','-r',str(FPS),'-i','-',
        '-an','-c:v','libx264','-profile:v','high','-crf','14','-preset','slow','-pix_fmt','yuv420p','-colorspace','bt709','-color_primaries','bt709','-color_trc','bt709','-movflags','+faststart',o],stdin=subprocess.PIPE)
    A=enc(1920,1080,f'{OUT}/descall-{name}-1920x1080.mp4'); B=enc(1080,1080,f'{OUT}/descall-{name}-1080x1080.mp4')
    bgL=np.broadcast_to((BG*255).round().astype(np.uint8),(1080,1920,3)).copy(); bgS=bgL[:, :1080].copy()
    keys={}; KF=[0.0,0.25,0.5,0.75,1.0,1.25,1.5,1.75,2.0,2.25,2.6,3.49]
    for i in range(N):
        t=i/FPS; fr=(np.clip(fn(t),0,1)*255+0.5).astype(np.uint8)
        L=bgL.copy(); L[40:1040,460:1460]=fr; Sq=bgS.copy(); Sq[40:1040,40:1040]=fr
        A.stdin.write(L.tobytes()); B.stdin.write(Sq.tobytes())
        for kt in KF:
            if i==round(kt*FPS) or (kt==KF[-1] and i==N-1): keys[kt]=fr
        if i==N-1: Image.fromarray(L).save(f'{OUT}/descall-{name}-poster.png')
    A.stdin.close(); B.stdin.close(); A.wait(); B.wait()
    th=320; sheet=Image.new('RGB',(th*6,(th+30)*2),(255,255,255))
    from PIL import ImageDraw; dr=ImageDraw.Draw(sheet)
    for j,kt in enumerate(KF):
        im=Image.fromarray(keys[kt]).resize((th,th),Image.LANCZOS); sheet.paste(im,((j%6)*th,(j//6)*(th+30)))
        dr.text(((j%6)*th+8,(j//6)*(th+30)+th+8),f'{kt:.2f}s',fill=(60,60,70))
    sheet.save(f'{OUT}/descall-{name}-contact-sheet.png'); print('done',name)
