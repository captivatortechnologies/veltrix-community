#!/usr/bin/env python3
"""Validate internal links and component references in the www/ static site.

Checks every .html file for:
  - href/src references to local files that do not exist (root-absolute paths
    are resolved against the www root, relative paths against the file's dir)
  - data-component="name" references without a matching components/<name>.html

External schemes (http, https, mailto, tel, data, javascript) and pure
fragment links (#...) are ignored.

Usage: python3 scripts/check-www-links.py [www-dir]
Exits non-zero if any broken reference is found.
"""
import os
import re
import sys
import urllib.parse

EXTERNAL_PREFIXES = (
    "http://", "https://", "mailto:", "tel:", "data:", "javascript:", "#",
)


def main() -> int:
    root = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else "www")
    if not os.path.isdir(root):
        print(f"ERROR: www directory not found: {root}")
        return 2

    issues = []
    checked = 0

    for dirpath, _dirs, files in os.walk(root):
        for name in files:
            if not name.endswith(".html"):
                continue
            checked += 1
            path = os.path.join(dirpath, name)
            rel = os.path.relpath(path, root).replace(os.sep, "/")
            with open(path, encoding="utf-8", errors="replace") as fh:
                content = fh.read()

            for match in re.finditer(r'(?:href|src)="([^"]+)"', content):
                url = match.group(1)
                if url.startswith(EXTERNAL_PREFIXES):
                    continue
                target = urllib.parse.urlparse(url).path
                if not target:
                    continue
                if target.startswith("/"):
                    fs_path = os.path.join(root, target.lstrip("/"))
                else:
                    fs_path = os.path.normpath(os.path.join(dirpath, target))
                if not os.path.exists(fs_path):
                    issues.append(f"{rel}: broken link -> {url}")

            for match in re.finditer(r'data-component="([^"]+)"', content):
                component = match.group(1)
                if not os.path.exists(
                    os.path.join(root, "components", f"{component}.html")
                ):
                    issues.append(f"{rel}: missing component -> {component}")

    print(f"Checked {checked} HTML files under {root}")
    if issues:
        print(f"FAILED: {len(issues)} broken reference(s):")
        for issue in issues:
            print(f"  {issue}")
        return 1
    print("OK: all internal links and component references resolve.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
