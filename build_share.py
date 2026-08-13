#!/usr/bin/env python3
"""Flatten the app into a single self-contained HTML file for sharing.

The app is written as ES modules that load over HTTP. A shared page has to be
one file, so this concatenates the modules in dependency order, strips the
import/export keywords, and rebuilds the two namespace objects (`store` and
`views`) that the code refers to. Label reading is switched off in the share
build: it needs your own API key, which belongs on your machine only.

    python3 build_share.py   ->   dist/skincare-library.html
"""

import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))

# Dependency order — a module may only use things defined above it.
# Every module that can reach the network is left OUT of the share build and
# replaced by STUBS below, so the shared file contains no endpoint at all — not
# merely unreachable code. js/ai.js, js/providers/gemini.js, js/autofill.js and
# js/chat.js are the excluded ones.
MODULES = [
    "js/ingredients.js",
    "js/rules.js",
    "js/store.js",
    "__stubs__",
    "js/analysis.js",
    "js/briefing.js",
    "js/views.js",
    "js/app.js",
]

# Modules referred to by namespace (`store.foo`, `views.bar`) need an object.
NAMESPACES = {"js/store.js": "store", "js/views.js": "views"}

# Names the remaining modules import from the excluded ones. Imports are
# stripped in the flattened build, so these just have to exist in scope.
STUBS = """/* ===== offline stubs (share build) ===== */
/* The shared copy talks to nothing. These stand in for the modules that would,
   so the app runs exactly as it does offline at home. */
const PROVIDERS = [];
const aiSettings = async () => ({ provider: 'none', apiKey: '', model: '', chatModel: '', sendPhoto: false });
const hasKey = async () => false;
const unavailable = () => { throw new Error('Not available in the shared copy.'); };
const readLabel = unavailable;
const lookupIngredients = unavailable;
const assessWithAI = unavailable;
const discover = unavailable;
const chatStream = unavailable;
const mountChat = () => {};
const refreshChat = () => {};
"""

EXPORTED = re.compile(
    r"^export\s+(?:async\s+)?(?:const|let|function|class)\s+([A-Za-z_$][\w$]*)", re.M
)


def read(rel):
    with open(os.path.join(HERE, rel), encoding="utf-8") as fh:
        return fh.read()


TOP_LEVEL = re.compile(
    r"^(?:async\s+)?(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)", re.M
)


def check_collisions(named_sources):
    """Separate modules may each declare `fmtDate`; one flat scope may not.

    Without this the bundle throws "Identifier has already been declared" at
    load and the page renders nothing, which is a miserable way to find out.
    """
    seen = {}
    clashes = {}
    for rel, source in named_sources:
        for name in set(TOP_LEVEL.findall(source)):
            if name in seen:
                clashes.setdefault(name, [seen[name]]).append(rel)
            else:
                seen[name] = rel
    if clashes:
        lines = ["Name collisions would break the flattened bundle:"]
        for name, files in sorted(clashes.items()):
            lines.append("  %s — declared in %s" % (name, ", ".join(files)))
        lines.append("Rename one of each pair, then rebuild.")
        sys.exit("\n".join(lines))


def strip_module_syntax(source):
    # import ... from '...';  (single or multi-line), and bare side-effect imports
    source = re.sub(r"^import[\s\S]*?from\s*['\"][^'\"]+['\"];?[ \t]*$", "", source, flags=re.M)
    source = re.sub(r"^import\s*['\"][^'\"]+['\"];?[ \t]*$", "", source, flags=re.M)
    # export const/function/... -> const/function/...
    return re.sub(r"^export\s+", "", source, flags=re.M)


def main():
    stripped = [
        (rel, strip_module_syntax(read(rel)))
        for rel in MODULES if rel != "__stubs__"
    ]
    check_collisions(stripped + [("stubs", STUBS)])

    parts = []
    for rel in MODULES:
        if rel == "__stubs__":
            parts.append(STUBS)
            continue
        source = read(rel)
        parts.append("/* ===== %s ===== */\n%s" % (rel, strip_module_syntax(source)))

        ns = NAMESPACES.get(rel)
        if ns:
            names = EXPORTED.findall(source)
            if not names:
                sys.exit("No exports found for namespace %s in %s" % (ns, rel))
            parts.append("const %s = { %s };" % (ns, ", ".join(names)))

    script = "\n\n".join(parts)

    # The share build carries no API-key field and makes no outbound calls.
    if "const AI_FEATURES = true;" not in script:
        sys.exit("AI_FEATURES switch not found — check js/views.js")
    script = script.replace(
        "const AI_FEATURES = true;", "const AI_FEATURES = false;   // share build"
    )

    # The whole point of the stub swap: prove nothing can call out.
    for host in ("generativelanguage.googleapis.com", "api.anthropic.com"):
        if host in script:
            sys.exit("Share build still contains %s — check MODULES/STUBS." % host)

    # Reuse the real index.html so the markup never drifts from the source.
    shell = read("index.html")
    body = shell.split("<body>", 1)[1].split("</body>", 1)[0]
    body = re.sub(r"\s*<script[\s\S]*?</script>", "", body).strip()

    html = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Skincare Library</title>
<link rel="icon" href="data:,">
<style>
%s
</style>
</head>
<body>

%s

<script>
(() => {
"use strict";
%s
})();
</script>
</body>
</html>
""" % (read("style.css"), body, script)

    os.makedirs(os.path.join(HERE, "dist"), exist_ok=True)
    out = os.path.join(HERE, "dist/skincare-library.html")
    with open(out, "w", encoding="utf-8") as fh:
        fh.write(html)

    print("dist/skincare-library.html — %d KB" % (len(html.encode("utf-8")) / 1024))


if __name__ == "__main__":
    main()
