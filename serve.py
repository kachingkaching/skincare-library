#!/usr/bin/env python3
"""Local dev server for the Skincare Library.

`python3 -m http.server` sends no cache headers at all, which lets browsers hold
on to stale JavaScript modules after you edit a file — you reload, and nothing
changes. This is the same thing with `Cache-Control: no-store`, so what you see
is always what is on disk.

    python3 serve.py [port]
"""

import os
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=HERE, **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        super().end_headers()

    def log_message(self, fmt, *args):
        # Quiet: one line per request drowns out anything useful.
        if not str(args[1] if len(args) > 1 else "").startswith("2"):
            super().log_message(fmt, *args)


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8931
    print("Skincare Library on http://localhost:%d" % port)
    ThreadingHTTPServer(("", port), Handler).serve_forever()
