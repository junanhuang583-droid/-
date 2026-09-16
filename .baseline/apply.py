"""One-time, exact-source migration. Validate every input/output before writing."""
import hashlib
import json
from pathlib import Path

root = Path.cwd().resolve()
def safe(name):
    p = (root / name).resolve()
    if not p.is_relative_to(root) or name.startswith(('.git/', '.github/', '.baseline/')):
        raise ValueError('Disallowed target: ' + name)
    return p

def digest(text):
    return hashlib.sha256(text.encode('utf-8')).hexdigest()

parts = sorted((root / '.baseline').glob('part*.json'))
if [p.name for p in parts] != [f'part{i:02}.json' for i in range(7)]:
    raise ValueError('Missing migration part')
ops = [op for p in parts for op in json.loads(p.read_text(encoding='utf-8'))]
outputs = {}
for op in ops:
    target = safe(op['path'])
    if target in outputs:
        raise ValueError('Duplicate target: ' + op['path'])
    source = safe(op.get('source', op['path']))
    raw = source.read_text(encoding='utf-8') if source.is_file() else ''
    if digest(raw) != op['before']:
        raise ValueError(f"Input SHA mismatch: {op['path']} {digest(raw)}")
    text = raw
    mode = op.get('prepare')
    if mode == 'extract-legacy':
        text = text[:text.index('/* Stage 0-3:')].rstrip() + '\n'
    if mode in ('extract-legacy', 'wrap-legacy'):
        text = '@layer legacy {\n' + text.replace('!important', '') + '\n}\n'
    elif mode:
        raise ValueError('Unknown preparation')
    lines = text.splitlines(keepends=True)
    last = len(lines)
    for start, end, replacement in reversed(op['edits']):
        if not 0 <= start <= end <= last:
            raise ValueError('Overlapping or invalid edit')
        lines[start:end] = replacement.splitlines(keepends=True)
        last = start
    result = ''.join(lines)
    if digest(result) != op['after']:
        raise ValueError(f"Output SHA mismatch: {op['path']} {digest(result)}")
    if op.get('delete') and result:
        raise ValueError('Nonempty deletion')
    outputs[target] = None if op.get('delete') else result
# All sources were validated before any target (including moved files) is touched.
for path, result in outputs.items():
    if result is None:
        path.unlink()
    else:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(result, encoding='utf-8', newline='')
print(f'Applied {len(outputs)} source changes; all SHA-256 checks passed.')
