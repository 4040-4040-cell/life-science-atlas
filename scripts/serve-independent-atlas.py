#!/usr/bin/env python3
"""Loopback-only server for verifying GitHub project-path asset resolution."""
import argparse
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

parser = argparse.ArgumentParser()
parser.add_argument('--directory', required=True)
parser.add_argument('--port', type=int, default=8788)
args = parser.parse_args()
root = Path(args.directory).resolve()
if not (root / 'index.html').is_file():
    raise SystemExit('Prepared site is not complete.')
prefix = '/life-science-atlas/'

class ProjectHandler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(root), **kw)

    def do_GET(self):
        if not urlsplit(self.path).path.startswith(prefix):
            self.send_error(404, 'Outside the independent atlas')
            return
        self.path = '/' + self.path[len(prefix):]
        super().do_GET()

    def log_message(self, *_):
        pass

print(f'Independent atlas ready at http://127.0.0.1:{args.port}{prefix}', flush=True)
ThreadingHTTPServer(('127.0.0.1', args.port), ProjectHandler).serve_forever()
