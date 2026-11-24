"""Original static practice illustrations & graphics. Requires Python only."""
from pathlib import Path
from html import escape

OUT = Path(__file__).resolve().parents[1] / 'public' / 'full-lc-images'
OUT.mkdir(parents=True, exist_ok=True)
INK='#172d3a'
PAPER='#f6f3eb'
TEAL='#176673'
PALE='#e1efea'
GOLD='#e7b35f'

def r(x,y,w,h,f,rx=0):
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="{f}" rx="{rx}"/>'

def c(x,y,size,f):
    return f'<circle cx="{x}" cy="{y}" r="{size}" fill="{f}"/>'

def e(x,y,rx,ry,f):
    return f'<ellipse cx="{x}" cy="{y}" rx="{rx}" ry="{ry}" fill="{f}"/>'

def path(d,fill='none',stroke=None,w=1):
    s='' if stroke is None else f' stroke="{stroke}" stroke-width="{w}" stroke-linejoin="round" stroke-linecap="round"'
    return f'<path d="{d}" fill="{fill}"{s}/>'

def line(x1,y1,x2,y2,f,w=1): return path(f'M{x1} {y1}L{x2} {y2}',stroke=f,w=w)

def txt(x,y,string,size=18,fill=INK,weight=500):
    return f'<text x="{x}" y="{y}" fill="{fill}" font-family="system-ui,Arial,sans-serif" font-size="{size}" font-weight="{weight}">{escape(string)}</text>'

def save(name,title,body,w=720,h=420):
    (OUT/f'{name}.svg').write_text(f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}" role="img" aria-label="{escape(title)}"><title>{escape(title)}</title>{body}</svg>\n',encoding='utf-8')

def room(wall='#eee5d4',floor='#d2a76b',y=305):
    a=r(0,0,720,420,wall)+r(0,y,720,420-y,floor)+r(0,y,720,6,'#a97d56')
    for i in range(1,4): a+=line(0,y+i*(420-y)/4,720,y+i*(420-y)/4,'#c09668',1.2)
    for i in range(10): a+=line(i*83-8,y,i*105-80,420,'#c09668',1.2)
    return a

def plant(x,y,scale=1):
    s=path('M9 31Q7 13 15 5Q25 14 17 31M15 30Q24 10 35 11Q35 26 21 34M12 31Q5 28 2 14Q14 14 17 30','#367754')
    s+=path('M4 31H34L29 57H9Z','#a95037')+r(1,30,36,7,'#be634b',2)
    return f'<g transform="translate({x} {y}) scale({scale})">{s}</g>'

def person(x,y,palette,kind,scale=1):
    skin,shirt,pants,hair=palette
    # Bodies are authored around a foot origin, with role-specific arm joints.
    add=e(4,2,39,8,'#8b77665a')
    add+=path('M-10 -66L-15 -18L-18 0M15 -66L22 -15L25 0',stroke=pants,w=17)
    add+=path('M-26 2h23m16 0h24',stroke=INK,w=9)
    add+=path('M-22 -132Q0 -142 23 -133L23 -63Q0 -55 -21 -65Z',shirt)
    add+=path('M-7 -132L-7 -145H9L10 -134Z',skin)
    if kind in ('reach','seal','point'):
        if kind=='reach':
            add+=path('M-17 -172Q-33 -166 -33 -140Q-30 -123 -18 -116Q-27 -141 -12 -160Z',hair)
        add+=c(0,-162,22,skin)+c(20,-158,5,skin)
        add+=path('M-23 -163Q-21 -192 1 -186Q17 -187 23 -173L10 -177Q7 -165 -7 -166L-12 -151L-21 -153Z',hair)
        add+=c(18,-162,1.7,INK)
    elif kind=='look':
        add+=c(0,-162,22,skin)+c(-20,-158,5,skin)
        add+=path('M-23 -170Q-17 -191 6 -187Q25 -186 23 -160L16 -146L11 -167Q0 -169 -10 -177L-22 -164Z',hair)
        add+=c(-18,-162,1.7,INK)
    if kind=='reach':
        add+=path('M-17 -126L-23 -99L-17 -78M19 -126L51 -139L68 -166',stroke=shirt,w=15)
        add+=path('M61 -155L73 -174',stroke=skin,w=10)
    elif kind=='seal':
        add+=path('M-15 -127L10 -110L49 -98M19 -124L36 -113L69 -102',stroke=shirt,w=15)
        add+=path('M45 -98L58 -98M64 -103L77 -101',stroke=skin,w=10)
    elif kind=='point':
        add+=path('M-16 -125L-20 -92L-15 -76M19 -124L41 -125L63 -143',stroke=shirt,w=14)
        add+=path('M56 -139L69 -147L75 -150',stroke=skin,w=8)
    else:
        add+=path('M-18 -126L-22 -96L-17 -73M18 -126L23 -95L24 -74',stroke=shirt,w=15)
        add+=path('M-17 -76L-17 -67M24 -77L24 -67',stroke=skin,w=8)
    return f'<g transform="translate({x} {y}) scale({scale})">{add}</g>'

# Library: books and a hand at the eye-level shelf, unused cart at lower left.
s=room()
s+=r(26,53,188,161,'#9db7bb',5)+r(36,63,168,141,'#d4e5e0',2)
s+=r(110,63,7,142,'#9db7bb')+r(36,129,168,7,'#9db7bb')
s+=path('M40 194L96 71L124 71L68 194Z','#f5faf27b')+plant(49,237,1.45)
s+=r(400,35,284,307,'#644533',6)+r(413,48,258,279,'#a27351',1)
for y in (107,174,241,307):
    s+=r(413,y,258,7,'#583f36',1)
    for j,w in enumerate((13,16,10,18,14,12,18,15,21,12,14,13)):
        x=419+j*20
        if y==174 and j in (0,1,2): continue
        h=27+((j*13+y)%23)
        s+=r(x,y-h,w,h,['#1b646a','#e2b370','#6d6a5e','#bc665b','#6f8fab'][j%5],1)+r(x+1,y-h+5,w-2,2,'#f6dda4a6')
s+=r(168,287,95,8,INK,3)+r(172,327,89,10,TEAL,3)+line(173,274,173,339,INK,5)+line(261,285,261,338,INK,5)
s+=c(182,343,7,INK)+c(251,343,7,INK)+r(180,306,38,8,'#b9614a',1)+r(185,299,36,6,'#4f8277',1)
s+=person(357,349,('#b77148','#407680','#34394a','#3d2922'),'reach',1.02)
s+=f'<g transform="translate(434 157) rotate(-13)">{r(-7,-25,14,39,"#cf7446",2)}{r(-4,-21,8,23,"#efbd7c")}</g>'
save('library-shelves','Library interior',s)

# Mooring lines lead clearly from boats to posts on the pier.
s=r(0,0,720,420,'#9ec4c6')+r(0,123,720,297,'#568d9b')
s+=c(594,60,33,'#f7df9e')+path('M0 155L144 125L245 159L344 137L457 164L562 129L720 158V132H0Z','#5f7d74')
for i in range(16):
    x=(i*127)%691; y=163+(i*53)%248
    s+=line(x,y,x+26+(i%3)*14,y,'#75a9af',2)
s+=path('M0 277L720 241V295L0 345Z','#80543c')+path('M0 262L720 231V277L0 325Z','#ba8e60')
for i in range(18):
    x=i*44-15
    s+=line(x,263-x*.043,x+16,325-x*.067,'#ae774e',2)
for x,y in ((106,274),(331,261),(533,248)):
    s+=r(x-6,y-24,12,31,'#5c4738',3)+e(x,y-23,7,3,'#dfbc82')
def boat(x,y,color,post):
    return (e(x+9,y+25,91,10,'#447480')+path(f'M{x-86} {y}Q{x-24} {y-24} {x+84} {y}L{x+65} {y+20}Q{x-25} {y+32} {x-69} {y+17}Z',color)
        +path(f'M{x-82} {y-1}Q{x-5} {y-27} {x+80} {y}Q{x-3} {y+17} {x-82} {y-1}Z','#e7d4b5')+path(f'M{x-58} {y-2}Q{x-8} {y-17} {x+53} {y}Q{x-5} {y+9} {x-58} {y-2}Z','#6b5647')
        +line(x-16,y-6,x-6,y+6,'#d5a872',8)+line(x+20,y-7,x+25,y+4,'#d5a872',7)
        +path(f'M{x-63} {y-2}Q{x-70} {y-16} {post[0]} {post[1]}',stroke='#f2d6a2',w=3))
s+=boat(154,378,'#c26b54',(106,256))+boat(382,354,'#2f6b78',(331,241))+boat(605,332,'#e4b876',(533,230))
save('riverside-dock','Riverside dock',s)

def stackchair(x,y,tone):
    return (path(f'M{x} {y}h52v24h-49Z',tone,INK,3)+path(f'M{x+1} {y+24}h53l17 16h-62Z',tone,INK,3)
       +path(f'M{x+8} {y+39}l-2 43m56 -43 5 43',stroke=INK,w=5))
s=room('#ead6bd','#c6a17b',321)
s+=r(44,83,284,176,'#794e3e',4)+r(56,96,259,151,'#405d63',3)+r(164,96,10,151,'#af8067')
s+=path('M27 89L60 27H317L351 89Z','#a9503f')+path('M85 27H130L108 88H58Z M177 27H229L237 88H179Z M273 27H315L349 88H294Z','#f1d19b')
s+=plant(646,255,1.5)
s+=e(182,268,105,18,'#d6b07d')+path('M183 279v89m-31 0h63',stroke=INK,w=9)
s+=e(182,265,105,17,'#96664d')+e(182,261,104,14,'#d4a76e')
s+=stackchair(439,211,'#d79a52')+stackchair(456,221,'#d79a52')+stackchair(473,231,'#d79a52')+stackchair(490,241,'#d79a52')
save('cafe-tables','Café terrace',s)

s=room('#e6e4d8','#aca892',315)
s+=r(39,37,189,271,'#73837a',3)+r(53,47,161,250,'#bcc4b0',3)
for y in (120,200,278):
    s+=r(50,y,167,8,'#728078')
    for j in range(4):
        s+=r(58+j*40,y-33-((j+y)%7),34,32+((j+y)%7),'#bd9863',2)
        s+=r(69+j*40,y-25,14,5,'#e9cf9c')
s+=r(545,88,146,157,'#aab0a5',3)+r(553,97,131,138,'#e4d7b1',2)
for x in (579,614,654): s+=line(x,115,x,196,'#7c8a85',3)
s+=r(290,265,324,14,'#765341',4)+r(301,278,16,100,INK,1)+r(588,278,16,98,INK,1)
s+=path('M384 209L472 200L537 223L449 237Z','#dabb83')+path('M384 209L449 237V267L384 242Z','#b68e62')+path('M449 237L537 223V254L449 267Z','#c59b65')
s+=path('M419 222L498 207L512 212L432 228Z','#f1d18c')+path('M432 227L512 212',stroke='#ac744a',w=2)
s+=person(332,375,('#c08a64','#327482','#375060','#4c3e36'),'seal',1.43)
s+=e(447,227,13,9,'#b9713c')+e(447,227,7,4,'#efd39f')+path('M450 220L474 218L498 210',stroke='#ecb960',w=4)
save('warehouse-box','Packing station',s)

s=r(0,0,720,420,'#c6dbbf')+r(0,167,720,253,'#688c58')+c(603,58,30,'#f7dfa2')
s+=path('M0 184Q102 53 222 170Q290 98 362 170Q465 43 564 161Q659 68 720 158V218H0Z','#9cb280')
s+=path('M212 420L368 176H453L653 420Z','#d9bb8b')+path('M212 420L368 176M653 420L453 176',stroke='#b59469',w=3)
s+=path('M0 318Q98 267 162 307T312 315L260 420H0Z','#759b65')
s+=path('M491 238Q569 279 720 253V420H653Z','#7c9f69')
for x,y,k in ((330,157,.49),(308,192,.70),(276,224,.9),(236,256,1.12),(187,300,1.44),(130,345,1.75)):
    s+=e(x+18*k,y+57*k,19*k,4*k,'#52744e')+plant(x,y,k)
s+=path('M485 353h44v40h-44zM526 363q31 0 24 19q-6 12 -23 6', '#4c7d7a',INK,3)+path('M488 375L462 358L442 355L441 362L485 390Z','#4c7d7a',INK,3)+e(506,352,23,6,'#7aa29a')+e(506,351,14,3,'#325f60')
s+=path('M620 307h58M625 318h49M626 320v20m45 -20v20',stroke='#526451',w=5)
save('garden-path','Garden path',s)

s=r(0,0,720,420,'#afc9c7')+r(0,298,720,122,'#a2a49a')
s+=path('M0 24H720V62H0Z','#355963')+r(42,60,12,250,'#517582')+r(665,60,12,250,'#517582')
s+=path('M0 175H202Q244 179 252 201L261 265H0Z','#e2d7be')+path('M0 243H256L261 265H0Z','#38818b')+r(18,192,49,33,'#51757b',5)+r(83,192,53,33,'#51757b',5)+r(151,192,49,33,'#51757b',5)
s+=path('M0 286H720M0 294H720',stroke='#585b55',w=4)
s+=path('M0 320H720',stroke='#e8c578',w=6)
s+=r(397,107,169,129,'#385761',6)+r(406,116,151,109,'#f1ead2',3)
s+=r(464,235,35,90,'#4d6a6e',3)
s+=txt(423,140,'DEPARTURES',12,TEAL,700)
for i,(time,dst) in enumerate((('10:10','Eastfield'),('10:25','Claremont'),('10:40','Westmere'),('11:05','Lakeside'))):
    s+=line(423,150+i*16,539,150+i*16,'#d2cbb5',1)+txt(424,162+i*16,time,10,INK,600)+txt(470,162+i*16,dst,10)
s+=person(365,374,('#ac6f4d','#a65e4f','#384451','#492e29'),'point',1.26)
s+=person(596,376,('#c9936b','#2d7475','#515769','#433834'),'look',1.18)
save('station-platform','Rail platform',s)

# Original textual graphics; no answers are highlighted by color, weight or position.
def chart(name,title,label,columns,rows,widths):
    margin=36; W=720; top=104; header=40; block=45
    H=top+header+len(rows)*block+26
    s=r(0,0,W,H,'#f6f3eb',10)+r(0,0,W,7,TEAL,3)
    s+=txt(margin,30,label,13,TEAL,700)+txt(margin,70,title,27,INK,700)
    s+=r(margin,top,W-2*margin,header,'#24525e',3)
    xs=[margin+14]
    for w in widths[:-1]: xs.append(xs[-1]+w)
    for idx,col in enumerate(columns): s+=txt(xs[idx],top+26,col,15,'#fffdf5',650)
    for i,row in enumerate(rows):
        y=top+header+i*block
        s+=r(margin,y,W-2*margin,block,'#e7eeea' if i%2==0 else '#fffdf5')
        s+=line(margin,y+block,684,y+block,'#d3ddd7',1)
        for j,cell in enumerate(row): s+=txt(xs[j],y+29,cell,17,INK,550)
    save(name,title,s,W,H)

chart('volunteer-roster','Volunteer Activities','COMMUNITY CENTER',('Activity','Start','Finish'),[
  ('Materials sorting','9:00 A.M.','10:00 A.M.'),
  ('Tool inventory','10:00 A.M.','11:15 A.M.'),
  ('Planter assembly','10:30 A.M.','11:45 A.M.'),
  ('Mural painting','11:30 A.M.','12:45 P.M.'),
],(300,169,179))
chart('train-departures','Departure Board','REGIONAL RAIL',('Destination','Scheduled','Revised','Track'),[
  ('Arlen','2:20 P.M.','—','1'),('Dunbar','2:30 P.M.','—','3'),
  ('Bellwick','2:35 P.M.','2:50 P.M.','4'),('Elmbrook','2:45 P.M.','—','2'),
],(210,152,144,142))
chart('room-comparison','Meeting Room Comparison','FACILITY SCHEDULE',('Room','Opens at','Capacity','Equipment'),[
  ('Alder','8:00 A.M.','10','Projector'),('Birch','9:30 A.M.','16','Projector'),
  ('Cedar','8:30 A.M.','14','Projector'),('Dogwood','8:00 A.M.','12','Whiteboard'),
],(173,151,111,213))
chart('conference-room-facilities','Session Room Facilities','NORTHBRIDGE COMMUNITY CONFERENCE',('Room','Facilities'),[
  ('Riverside Hall','Stage'),('Oak Room','Video conference equipment'),
  ('Maple Room','Whiteboard'),('Studio Kitchen','Sink and countertop'),
],(270,378))
chart('display-stands','Display Stand Order Sheet','DISTRICT SALES TEAM',('Model','Size','Style'),[
  ('F12','Small','Folding stand'),('F25','Medium','Folding stand'),
  ('W30','Medium','Weighted stand'),('P18','Medium','Fixed shelf'),
],(140,160,348))
