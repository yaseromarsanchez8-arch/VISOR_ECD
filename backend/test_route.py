import requests
import urllib.parse

# Simula un URN con caracteres especiales (como los que genera Autodesk)
fake_urn = "dXJuOmFkc2sub2JqZWN0czpvcy5vYmplY3Q6bXktYnVja2V0L215LWZpbGUucGRm" # urn:adsk.objects:os.object:my-bucket/my-file.pdf base64 encoded
# Este URN base64 NO suele tener slashes, pero a veces si no es URL-safe base64.
# El problema real suele ser cuando el ID tiene caracteres que el navegador interpreta mal.

# Probemos con un URN que sabemos que podría causar problemas si se interpreta como path
tricky_urn = "urn_with_slash/and_stuff"
encoded_urn = urllib.parse.quote(tricky_urn, safe='')

print(f"Testing URN: {tricky_urn}")
print(f"Encoded URN: {encoded_urn}")

url = f"http://localhost:3000/api/build/translation-status/{encoded_urn}"
print(f"Requesting: {url}")

try:
    resp = requests.get(url)
    print(f"Status: {resp.status_code}")
    print(f"Response: {resp.text}")
except Exception as e:
    print(f"Error: {e}")
