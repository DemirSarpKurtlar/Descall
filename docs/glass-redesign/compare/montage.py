import sys
from PIL import Image
out=sys.argv[1]; files=sys.argv[2:]
ims=[Image.open(f).convert("RGB") for f in files]
h=max(i.height for i in ims); w=sum(i.width for i in ims)+8*(len(ims)-1)
m=Image.new("RGB",(w,h),(60,60,60)); x=0
for i in ims: m.paste(i,(x,0)); x+=i.width+8
m.save(out)
