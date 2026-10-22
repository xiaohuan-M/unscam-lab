"""Import ALL published reference content without executing upstream build scripts.
python scripts/import-knowledge.py /path/to/HowToAvoidScams
Original bytes remain in public/reference and a reproducible ZIP.
"""
import ast, hashlib, json, pathlib, re, shutil, subprocess, sys, zipfile
root = pathlib.Path(__file__).resolve().parents[1]
source = pathlib.Path(sys.argv[1]).resolve()
git = lambda *args: subprocess.check_output(['git', '-C', str(source), *args]).decode().strip()
assert not git('status', '--porcelain'), 'Reference checkout must be clean'
commit = git('rev-parse', 'HEAD')
paths = git('-c','core.quotePath=false','ls-files').splitlines()
pub = root / 'public'
target = pub / 'reference'
shutil.rmtree(target, ignore_errors=True)
target.mkdir(parents=True)
manifest = []
for name in paths:
    data = (source/name).read_bytes()
    p = target/name
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_bytes(data)
    manifest.append({'path': name, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest(), 'gitBlob': hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest()})
def write(name, data):
    (pub/'data'/name).write_text(json.dumps(data,ensure_ascii=False,separators=(',',':'))+'\n')
articles = json.loads((source/'tools/articles.json').read_text())
reports = json.loads((source/'tools/news.json').read_text())['reports']
for a in articles:
    blob = a['title']+'\n'+'\n'.join(b['t'] for b in a['body'])
    hits=[]
    for i,r in enumerate(reports):
        keys=[k for k in r['keys'] if k in blob]
        score=int(a['cat'] in r['cats'])+(2+len(keys) if keys else 0)
        if score: hits.append((-score,i))
    a['referenceIds']=[i for _,i in sorted(hits)[:4]]
write('knowledge.json',articles)
tree=ast.parse((source/'tools/glossary.py').read_text())
constants={n.targets[0].id:ast.literal_eval(n.value) for n in tree.body if isinstance(n,ast.Assign)}
glossary=[{'term':t,'kind':k,'description':d,'categories':cats} for t,k,d,cats in constants['GLOSSARY']]
html=(source/'selfcheck.html').read_text()
def array(name):
    raw=re.search(r'const '+name+r' = (\[.*?\n\]);',html,re.S)[1]
    raw=re.sub(r'^\s*//.*$', '',raw,flags=re.M)
    return json.loads(re.sub(r',\s*([\]}])',r'\1',raw))
groups,questions=array('G'),array('Q')
events=json.loads(subprocess.check_output(['node','--input-type=module','-e',"import fs from 'node:fs';import vm from 'node:vm';let c={window:{}};vm.runInNewContext(fs.readFileSync(process.argv[1],'utf8'),c,{timeout:1000});process.stdout.write(JSON.stringify(c.window.EVENTS.map(x=>({id:x.id,title:x.title,category:x.cat}))));",str(source/'game/js/data.js')]))
puzzles=json.loads((source/'game/murdoku-puzzles.json').read_text())
documents=[]
for name in paths:
    if name.endswith('.md'):
        content=(source/name).read_text()
        title=next((l.lstrip('# ').strip() for l in content.splitlines() if l.startswith('# ')),pathlib.Path(name).stem)
        documents.append({'id':len(documents),'path':name,'title':title,'kind':'分卷' if name.startswith('book/') else '长文' if '长文-' in name else '问答技能' if name.startswith('skill/') else '资料'})
collection={'source':{'name':'人间防骗指南','author':'QERSSD','url':'https://github.com/QERSSD/HowToAvoidScams','commit':commit,'license':'CC BY-NC-SA 4.0 / MIT'},'reports':reports,'glossary':glossary,'selfcheck':{'groups':groups,'questions':questions},'documents':documents,'events':events,'puzzles':[{'id':p['id'],'title':p['title'],'article':p['article'],'chapter':p['chapter'],'scene':p['scene']} for p in puzzles['levels']],'chapters':puzzles['chapters'],'files':manifest,'counts':{'articles':len(articles),'categories':len(set(a['cat'] for a in articles)),'bodyBlocks':sum(len(a['body']) for a in articles),'reportLinks':sum(len(a['referenceIds']) for a in articles),'reports':len(reports),'glossary':len(glossary),'selfcheck':len(questions),'events':len(events),'rounds':12,'puzzles':len(puzzles['levels']),'volumes':sum(d['kind']=='分卷' for d in documents),'longreads':sum(d['kind']=='长文' for d in documents),'sourceFiles':len(manifest)}}
write('collection.json',collection)
(pub/'downloads').mkdir(exist_ok=True)
with zipfile.ZipFile(pub/'downloads/howtoavoidscams-source.zip','w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
    for name in paths:
        info=zipfile.ZipInfo('HowToAvoidScams/'+name,(2026,10,22,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;info.external_attr=0o100644<<16
        z.writestr(info,(source/name).read_bytes())
print(json.dumps(collection['counts'],ensure_ascii=False))
