import urllib.request, json

with urllib.request.urlopen("http://localhost:8001/openapi.json") as r:
    spec = json.loads(r.read())
    paths = list(spec["paths"].keys())
    print(f"API docs OK - {len(paths)} routes")
    for p in paths:
        print(" ", p)
