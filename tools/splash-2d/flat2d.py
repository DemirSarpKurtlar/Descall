# Splash 2D (3.7.34): the exact v2 splash animation (same springs, morph, ribbon swirl/unspool,
# dot, rim hue sweep, flatten timing) with every 3D / depth cue removed:
# no perspective tilt (persp), no contact / drop shadow, no normal-map emboss shading,
# no normal-based refraction or radial lens, no specular highlight. Flat colour layers only.
import anim
from anim import *
from v2 import LB, DB
def s1flat(t,flo=None):
    img=canvas(); g=spring(t-0.05,w=7.5,z=0.62); sc=max(0.18+0.82*g,1e-3)
    m=ss(0.4,1.5,t); fl=ss(2.05,2.8,t); fl=fl*fl*(3-2*fl)
    if flo is not None: fl=flo
    x=X0/sc; y=Y0/sc
    dg=((1-m)*(np.hypot(x,y)-S*0.47)+m*box(x,y))*sc
    a_g=cov(dg)
    q=ss(0.2,1.85,t); r=np.hypot(x,y); sw=(1-q)**2*2.4*np.exp(-r/190)
    ca,sa=np.cos(sw),np.sin(sw); ux=ca*x-sa*y; uy=sa*x+ca*y
    d_arc=np.minimum(arc(ux,uy,0,0.06+0.94*ss(0.15,1.65,t)),arc(ux,uy,1,0.06+0.94*ss(0.25,1.75,t)))
    blob=np.hypot(ux,uy)-70*(1-q)
    k=32*(1-q)+1e-3; hh=np.clip(0.5+0.5*(blob-d_arc)/k,0,1); d_l=blob*(1-hh)+d_arc*hh-k*hh*(1-hh)
    d_l=np.minimum(d_l,dot(ux,uy,ss(1.0,1.6,t)+1e-3))*sc
    body=np.broadcast_to(CHAR,(C,C,3)).copy()
    body=over(body,BLUE,cov(d_l))
    ang=np.arctan2(Y0,X0)+t*1.1; w=0.5+0.5*np.cos(ang*2)
    rimcol=LB*w[...,None]+DB*(1-w[...,None])
    rim=cov(np.abs(dg+3*sc)-2.2*sc)          # flat 2D outline stroke, no glow falloff
    body=over(body,rimcol,rim*0.9*(1-fl))
    flat2=over(img,np.clip(body,0,1),a_g)
    return flat2*(1-fl)+flat(canvas())*fl
