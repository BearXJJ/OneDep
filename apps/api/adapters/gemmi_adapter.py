"""One JSON request on stdin; one result on stdout. File paths are server-owned."""
import sys, json, hashlib, zipfile, math
from pathlib import Path
import gemmi
from PIL import Image

def decoded(value):
    return None if value in ('?', '.') else gemmi.cif.as_string(value)

def coordinate(path):
    if path.suffix.lower() == '.pdb':
        structure = gemmi.read_structure(str(path))
        structure.setup_entities()
        doc = structure.make_mmcif_document()
    else:
        doc = gemmi.cif.read(str(path))
        if len(doc) != 1:
            raise ValueError('Coordinate input must contain exactly one data block')
        structure = gemmi.make_structure_from_block(doc.sole_block())
        structure.setup_entities()
    if not len(structure) or sum(m.count_atom_sites() for m in structure) == 0:
        raise ValueError('Coordinate role requires atom coordinates; this file has no atoms')
    block = doc.sole_block()
    # Fill only missing structural categories using Gemmi's entity assignment.
    # Original coordinates and existing categories are never regenerated for CIF.
    generated = structure.make_mmcif_document().sole_block()
    for cat in ('_entity.', '_entity_poly.', '_entity_poly_seq.', '_struct_asym.'):
        if not block.get_mmcif_category(cat):
            data = generated.get_mmcif_category(cat, raw=True)
            if data:
                block.set_mmcif_category(cat, data, raw=True)
    if path.suffix.lower() == '.pdb':
        # Full SEQRES sequences are provided by Gemmi, not inferred from ATOM gaps.
        data = block.get_mmcif_category('_entity_poly.', raw=True)
        if data:
            entities = {e.name:e for e in structure.entities}
            data['pdbx_seq_one_letter_code'] = [gemmi.cif.quote(gemmi.one_letter_code(entities[decoded(k)].full_sequence)) if entities[decoded(k)].full_sequence else '?' for k in data['entity_id']]
            block.set_mmcif_category('_entity_poly.', data, raw=True)
    return doc, structure

def extract(block, bindings):
    answers, origins, records = {}, [], []
    groups = {}
    for binding in bindings:
        if binding.get('group'):
            groups[binding['group']] = binding['recordKey']
    for group, key in groups.items():
        keys = list(block.find_values(key))
        answers[group] = []
        for raw_key in keys:
            source_key = decoded(raw_key)
            if source_key is None: continue
            record_id = group + ':' + source_key
            answers[group].append({'recordId':record_id})
            records.append({'collection':group,'recordId':record_id,'sourceRowKey':source_key})
    for binding in bindings:
        if binding['direction'] == 'write': continue
        tag, group = binding['tag'], binding.get('group')
        values = list(block.find_values(tag))
        if not values: continue
        keys = list(block.find_values(binding['key'])) if group else []
        for i, token in enumerate(values):
            value = decoded(token)
            if value is None: continue
            if binding.get('inputType') == 'number':
                value = float(value)
                if not math.isfinite(value): raise ValueError('Non-finite value: '+tag)
            address = {'field':binding['field']}
            if group:
                if i >= len(keys): raise ValueError('CIF row key missing: '+tag)
                source_key = decoded(keys[i])
                record_id = group+':'+str(source_key)
                row = next((r for r in answers[group] if r['recordId']==record_id),None)
                if row is None: raise ValueError('CIF entity key has no matching record: '+tag)
                row[binding['field']] = value
                address.update(collection=group,recordId=record_id)
            else:
                if i: break
                answers[binding['field']] = value
                source_key = None
            origins.append({'address':address,'value':value,'tag':tag,'sourceRowKey':source_key})
    return answers, origins, records

def inspect(request):
    path = Path(request['path']); parser = request['parserId']
    if parser == 'coordinate':
        doc, s = coordinate(path)
        base = str(path)+'.base.cif'
        doc.write_file(base)
        answers, values, records = extract(doc.sole_block(),request['bindings'])
        return {'answers':answers,'values':values,'records':records,'baseName':Path(base).name,
                'facts':{'atoms':sum(m.count_atom_sites() for m in s),'models':len(s),'entities':len(answers['molecules'])},'issues':[]}
    if parser == 'reflections':
        if path.suffix.lower()=='.mtz':
            mtz=gemmi.read_mtz_file(str(path)); count=mtz.nreflections
            if count==0 or not mtz.columns: raise ValueError('Empty MTZ reflection data')
        else:
            doc=gemmi.cif.read(str(path)); blocks=gemmi.as_refln_blocks(doc)
            count=sum(len(b.block.find_values('_refln.index_h'))+len(b.block.find_values('_diffrn_refln.index_h')) for b in blocks)
            if not count: raise ValueError('Structure-factor role requires reflection indices and data')
            for b in blocks:
                cols=b.column_labels()
                if not any('F_' in c or 'intensity' in c or 'F_squared' in c for c in cols):
                    raise ValueError('Reflection amplitudes/intensities are missing')
        return {'facts':{'reflections':count},'issues':[]}
    if parser == 'map':
        m=gemmi.read_ccp4_map(str(path),setup=False)
        shape=[m.grid.nu,m.grid.nv,m.grid.nw]
        if any(v<=0 for v in shape): raise ValueError('Invalid map dimensions')
        sampling=[m.header_i32(i) for i in (8,9,10)]
        if any(v<=0 for v in sampling):raise ValueError('Invalid map sampling')
        voxel=[a/b for a,b in zip((m.grid.unit_cell.a,m.grid.unit_cell.b,m.grid.unit_cell.c),sampling)]
        if any(not math.isfinite(v) or v<=0 for v in voxel):raise ValueError('Invalid map pixel size')
        return {'facts':{'shape':shape,'sampling':sampling,'voxelAngstrom':voxel,'axisOrder':[m.header_i32(i) for i in (17,18,19)],'origin':[m.header_float(i) for i in (50,51,52)]},'issues':[]}
    if parser == 'image':
        with Image.open(path) as im:
            size=im.size; im.verify()
        return {'facts':{'width':size[0],'height':size[1]},'issues':[]}
    raise ValueError('Unknown parser: '+parser)

def export(request):
    doc=gemmi.cif.read(request['basePath']); block=doc.sole_block()
    original={c:block.get_mmcif_category(c,raw=True) for c in block.get_mmcif_category_names()}
    expected={}; answers=request['answers']; origins=request['origins']; touched=set()
    for binding in request['bindings']:
        if binding['direction']=='read' or binding.get('readOnly'):continue
        group=binding.get('group'); field=binding['field']; tag=binding['tag']; cat,col=tag.split('.',1); cat+='.'
        if group and group not in answers: continue
        rows=answers[group] if group else [answers]
        for row in rows:
            if field not in row:continue
            value=row[field]
            source_key=None
            if group:
                origin=next((o for o in origins if o['address'].get('collection')==group and o['address'].get('recordId')==row['recordId'] and o.get('sourceRowKey')),None)
                source_key=origin['sourceRowKey'] if origin else row['recordId']
            data=block.get_mmcif_category(cat,raw=True)
            n=len(next(iter(data.values()))) if data else 0
            if group:
                keycol=binding['key'].split('.',1)[1]
                if data and keycol not in data: raise ValueError('CIF category is missing its row key: '+cat+keycol)
                keys=[decoded(v) for v in data[keycol]] if data else []
                if source_key not in keys:
                    for vals in data.values():vals.append('?')
                    data.setdefault(keycol,['?']*(n+1))[n]=gemmi.cif.quote(source_key)
                    idx=n;n+=1
                else:idx=keys.index(source_key)
            else:
                idx=0
                if not n:n=1
            data.setdefault(col,['?']*n)[idx]=gemmi.cif.quote(str(value))
            block.set_mmcif_category(cat,data,raw=True); touched.add(cat)
            expected[(tag,source_key)]=str(value)
    out=Path(request['cifPath']);doc.write_file(str(out))
    reread=gemmi.cif.read(str(out)).sole_block()
    for cat,data in original.items():
        after=reread.get_mmcif_category(cat,raw=True)
        if cat not in touched and data!=after:raise ValueError('Export changed untouched category '+cat)
        if cat in touched:
            changed_cols={b['tag'].split('.',1)[1] for b in request['bindings'] if b['tag'].startswith(cat) and not b.get('readOnly')}
            for key,values in data.items():
                if key not in changed_cols and after[key][:len(values)]!=values:raise ValueError('Export changed unbound column '+cat+key)
    for (tag,key),value in expected.items():
        binding=next(b for b in request['bindings'] if b['tag']==tag)
        vals=list(reread.find_values(tag))
        idx=[decoded(v) for v in reread.find_values(binding['key'])].index(key) if key else 0
        if decoded(vals[idx])!=value:raise ValueError('Export value mismatch '+tag)
    structure=gemmi.make_structure_from_block(reread)
    atoms=sum(m.count_atom_sites() for m in structure)
    if not atoms:raise ValueError('Export has no coordinates')
    with zipfile.ZipFile(request['zipPath'],'w',compression=zipfile.ZIP_STORED) as archive:
        archive.write(out,'coordinates.cif')
        for f in request['attachments']:
            archive.write(f['path'],f"attachments/{f['role']}-{f['slot']}-{Path(f['name']).name}")
        archive.writestr('submission.json',json.dumps(request['snapshot'],ensure_ascii=False,indent=2))
    return {'atoms':atoms,'preservedCategories':len(original)-len(touched),'boundValues':len(expected),'sha256':hashlib.file_digest(open(request['zipPath'],'rb'),'sha256').hexdigest()}

request=json.load(sys.stdin)
if request['action']=='inspect': result=inspect(request)
elif request['action']=='export': result=export(request)
else: raise ValueError('Unknown action: '+request['action'])
print(json.dumps(result,ensure_ascii=False,allow_nan=False))
