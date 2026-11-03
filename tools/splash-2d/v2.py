# Style 1 v2: tinted (charcoal/blue) thick liquid glass, perspective tilt springs to front, blue-tone rim, contact shadow, slow soften to flat
import anim
from anim import *
DUR2=3.8; N2=int(FPS*DUR2)
LB=np.array([0xA8,0xBC,0xFF])/255; DB=np.array([0x2C,0x45,0xB8])/255
def persp(x,y,ty,tx,f=1300.0):
    x2=x*f/(f*math.cos(ty)-x*math.sin(ty)); y2=y*(f+x2*math.sin(ty))/f
    y3=y2*f/(f*math.cos(tx)-y2*math.sin(tx)); x3=x2*(f+y3*math.sin(tx))/f
    return x3,y3
def s1v2(t,flo=None):
    img=canvas(); g=spring(t-0.05,w=7.5,z=0.62); sc=max(0.18+0.82*g,1e-3)
    tb=1-spring(t-0.1,w=5.2,z=0.72); ty=math.radians(28)*tb; tx=math.radians(-16)*tb
    m=ss(0.4,1.5,t); fl=ss(2.05,2.8,t); fl=fl*fl*(3-2*fl)
    if flo is not None: fl=flo
    x,y=persp(X0,Y0,ty,tx); x/=sc; y/=sc
    dg=((1-m)*(np.hypot(x,y)-S*0.47)+m*box(x,y))*sc
    # contact shadow (ellipse below), fades as it flattens
    cs=np.exp(-((X0/(S*0.42*sc))**2+((Y0-S*0.50*sc)/(S*0.07*sc))**2)*1.6)*0.28*(1-fl)
    img=over(img,np.zeros(3),cs); img=shadow(img,dg-22*sc,0.13*(1-fl)+0.0)
    a_g=cov(dg)
    thick=np.clip(-dg/(46*sc),0,1); hgt=1-(1-thick)**2         # thick rounded glass edge
    shg,n=norm_shade(hgt*30)
    # deep refraction: displace liquid by surface normal + radial lens
    lens=1+0.35*(1-thick)**1.5*(1-fl)
    lx=x*lens-n[...,0]*40*(1-fl); ly=y*lens-n[...,1]*40*(1-fl)
    q=ss(0.2,1.85,t); r=np.hypot(lx,ly); sw=(1-q)**2*2.4*np.exp(-r/190)
    ca,sa=np.cos(sw),np.sin(sw); ux=ca*lx-sa*ly; uy=sa*lx+ca*ly
    d_arc=np.minimum(arc(ux,uy,0,0.06+0.94*ss(0.15,1.65,t)),arc(ux,uy,1,0.06+0.94*ss(0.25,1.75,t)))
    blob=np.hypot(ux,uy)-70*(1-q)
    k=32*(1-q)+1e-3; hh=np.clip(0.5+0.5*(blob-d_arc)/k,0,1); d_l=blob*(1-hh)+d_arc*hh-k*hh*(1-hh)
    d_l=np.minimum(d_l,dot(ux,uy,ss(1.0,1.6,t)+1e-3))*sc
    body=CHAR[None,None,:]*(0.80+0.45*shg[...,None])
    body=body*(1-0.18*(1-thick[...,None]))+BLUE*0.18*(1-thick[...,None])
    hl=np.clip(-d_l/12,0,1); sl,_=norm_shade(hl*16)
    liq=BLUE[None,None,:]*(0.72+0.40*sl[...,None])+(sl[...,None]**20)*0.55
    body=over(body,liq,cov(d_l))
    ang=np.arctan2(Y0,X0)+t*1.1; w=0.5+0.5*np.cos(ang*2)
    rimcol=LB*w[...,None]+DB*(1-w[...,None])
    rim=np.exp(-np.maximum(-dg,0)/(9*sc)); body=over(body,rimcol,rim*0.9)
    body=over(body,LB*0.6+0.4,np.exp(-np.abs(dg+4*sc)/1.4)*0.55)
    spec=np.exp(-(((X0+S*0.2*sc)/(S*0.24*sc))**2+((Y0+S*0.30*sc)/(S*0.08*sc))**2))
    body=over(body,WHITE,spec*0.35)
    glossy=over(img,np.clip(body,0,1),a_g)
    flat_img=flat(canvas())
    return glossy*(1-fl)+flat_img*fl
if __name__=='__main__':
    name='01-liquid-glass-v2'; fn=s1v2
    enc=lambda w,h,o: subprocess.Popen(['ffmpeg','-y','-loglevel','error','-f','rawvideo','-pix_fmt','rgb24','-s',f'{w}x{h}','-r',str(FPS),'-i','-',
        '-an','-c:v','libx264','-profile:v','high','-crf','14','-preset','slow','-pix_fmt','yuv420p','-colorspace','bt709','-color_primaries','bt709','-color_trc','bt709','-movflags','+faststart',o],stdin=subprocess.PIPE)
    A=enc(1920,1080,f'{OUT}/descall-{name}-1920x1080.mp4'); B=enc(1080,1080,f'{OUT}/descall-{name}-1080x1080.mp4')
    bgL=np.broadcast_to((BG*255).round().astype(np.uint8),(1080,1920,3)).copy(); bgS=bgL[:, :1080].copy()
    KF=[0.0,0.25,0.5,0.75,1.0,1.25,1.5,1.85,2.2,2.45,2.7,3.79]; keys={}
    for i in range(N2):
        t=i/FPS; fr=(np.clip(fn(t),0,1)*255+0.5).astype(np.uint8)
        L=bgL.copy(); L[40:1040,460:1460]=fr; Sq=bgS.copy(); Sq[40:1040,40:1040]=fr
        A.stdin.write(L.tobytes()); B.stdin.write(Sq.tobytes())
        for kt in KF:
            if i==min(round(kt*FPS),N2-1): keys[kt]=fr
        if i==N2-1: Image.fromarray(L).save(f'{OUT}/descall-{name}-poster.png')
    A.stdin.close(); B.stdin.close(); A.wait(); B.wait()
    from PIL import ImageDraw
    th=320; sheet=Image.new('RGB',(th*6,(th+30)*2),(255,255,255)); dr=ImageDraw.Draw(sheet)
    for j,kt in enumerate(KF):
        sheet.paste(Image.fromarray(keys[kt]).resize((th,th),Image.LANCZOS),((j%6)*th,(j//6)*(th+30)))
        dr.text(((j%6)*th+8,(j//6)*(th+30)+th+8),f'{kt:.2f}s',fill=(60,60,70))
    sheet.save(f'{OUT}/descall-{name}-contact-sheet.png'); print('done')
