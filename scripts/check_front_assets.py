import re
import urllib.request

root = "http://localhost:8001"
html = urllib.request.urlopen(root + "/", timeout=5).read().decode("utf-8", "ignore")
js_match = re.search(r'src="([^"]+\.js)"', html)
css_match = re.search(r'href="([^"]+\.css)"', html)

js_path = js_match.group(1) if js_match else None
css_path = css_match.group(1) if css_match else None

print("js:", js_path)
print("css:", css_path)

if js_path:
    with urllib.request.urlopen(root + js_path, timeout=5) as r:
        print("js_status:", r.status, "bytes:", len(r.read()))
if css_path:
    with urllib.request.urlopen(root + css_path, timeout=5) as r:
        print("css_status:", r.status, "bytes:", len(r.read()))
