"""python scripts/import-knowledge.py /path/to/HowToAvoidScams
Re-import selected fields. Keep upstream commit and license attribution current.
"""
import json, pathlib, sys
source=pathlib.Path(sys.argv[1])/'tools/articles.json'
rows=json.loads(source.read_text())
fields=('id','title','cat','lead','points','guards','tags')
output=[{k:r.get(k,[]) if k in ('points','guards','tags') else r.get(k,'') for k in fields} for r in rows]
assert len({r['id'] for r in output})==len(output)
assert all(isinstance(r['points'],list) and isinstance(r['guards'],list) for r in output)
target=pathlib.Path(__file__).resolve().parents[1]/'public/data/knowledge.json'
target.write_text(json.dumps(output,ensure_ascii=False))
print(f'Imported {len(output)} reference excerpts. Update docs/CONTENT.md before release.')
