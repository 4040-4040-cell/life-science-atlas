#!/usr/bin/env python3
"""Compact cached assets into NEW targets; no downloads, cropping or PDF rasterization."""
import io
import json
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from PIL import Image
import pymupdf


def jpeg_bytes(image, longest=1800):
    image = image.copy()
    image.thumbnail((longest, longest), Image.Resampling.LANCZOS)
    if image.mode in ('RGBA', 'LA') or (image.mode == 'P' and 'transparency' in image.info):
        rgba = image.convert('RGBA')
        image = Image.new('RGB', rgba.size, 'white')
        image.paste(rgba, mask=rgba.getchannel('A'))
    else:
        image = image.convert('RGB')
    data = io.BytesIO()
    image.save(data, 'JPEG', quality=80, optimize=True, progressive=True)
    return data.getvalue(), image.size


def process(task):
    source, target = Path(task['source']), Path(task['target'])
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists():
        raise RuntimeError(f'Never overwrite an existing asset: {target}')
    result = {'sourceBytes': source.stat().st_size}
    if task['kind'] == 'image':
        with Image.open(source) as image:
            result['originalDimensions'] = list(image.size)
            data, dimensions = jpeg_bytes(image)
        target.write_bytes(data)
        result.update(dimensions=list(dimensions), transform='full-aspect JPEG, longest edge <=1800px, quality 80')
    elif task['kind'] == 'pdf':
        doc = pymupdf.open(source)
        before_links = sum(len(p.get_links()) for p in doc)
        before_annots = sum(len(list(p.annots() or [])) for p in doc)
        seen = set()
        replaced = 0
        for page in doc:
            for item in page.get_images(full=True):
                xref, smask, width, height = item[:4]
                if xref in seen or smask:
                    continue
                seen.add(xref)
                extracted = doc.extract_image(xref)
                if max(width, height) <= 1800 and len(extracted['image']) < 350000:
                    continue
                with Image.open(io.BytesIO(extracted['image'])) as image:
                    data, _ = jpeg_bytes(image)
                if len(data) >= len(extracted['image']) * 0.8:
                    continue
                page.replace_image(xref, stream=data)
                replaced += 1
        doc.save(target, garbage=4, deflate=True)
        doc.close()
        verify = pymupdf.open(target)
        after_links = sum(len(p.get_links()) for p in verify)
        after_annots = sum(len(list(p.annots() or [])) for p in verify)
        assert before_links == after_links, (source, before_links, after_links)
        assert before_annots == after_annots, (source, before_annots, after_annots)
        result.update(pages=len(verify), links=after_links, annotations=after_annots, replacedImages=replaced,
                      transform='large or inefficient embedded rasters JPEG80 <=1800px when at least20% smaller; page size, vectors, text, links and annotations retained')
        verify.close()
    else:
        import shutil
        shutil.copyfile(source, target)
        result['transform'] = 'original unchanged'
    result['bytes'] = target.stat().st_size
    result['id'] = task['id']
    print(f"Asset {task['id']}: {result['sourceBytes']} -> {result['bytes']} bytes", flush=True)
    return result


if __name__ == '__main__':
    tasks = json.loads(Path(sys.argv[1]).read_text())
    # PyMuPDF is not thread-safe; process PDFs serially, parallelize Pillow/copies.
    regular = [t for t in tasks if t['kind'] != 'pdf']
    pdfs = [t for t in tasks if t['kind'] == 'pdf']
    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(process, regular))
    results.extend(process(t) for t in pdfs)
    Path(sys.argv[2]).write_text(json.dumps(results, indent=2) + '\n')
