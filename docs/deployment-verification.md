# Published deployment verification

Adopted November 18, 2026 for Waypoint Sites releases. This replaces literal raw-response equality for HTML because Cloudflare can append dynamic challenge code to every version. Do not change app code or hosting protections to make verification pass.

## App-owned guest HTML

1. Fetch `/view.html`, following its normal clean-URL redirect, and require HTTP 200.
2. Remove only complete script elements containing **both** known Cloudflare challenge markers: `/cdn-cgi/challenge-platform/` and `__CF$cv$params`.
3. Preserve every other byte. Compare the result with the exact `public/view.html` at the pinned GitHub app subtree. When the release says the guest page is unchanged, also compare it with the prior pinned source.
4. Independently verify the expected Content-Security-Policy, including self script-src, the authorized connect-src/frame-src origins, and the no-referrer meta where required by the release.
5. An unknown injection, unexpected script, markup difference or CSP change must remain visible as a failed comparison for investigation. Do not broaden the removal rule merely to get a pass.

Core comparison (run from the canonical repository root, setting the release's full pinned SHA):

```python
import re
import subprocess

PINNED_SHA = "a78e4e8103f000f89f6fb653b958a99dabefdee4"
SITE = "https://travel-planner-ewilhelm-prototype.tortuga-1566.chatgpt.site"
response = subprocess.check_output([
    "curl", "-sSL", "-w", "\n%{http_code}", SITE + "/view.html"
])
body, status = response.rsplit(b"\n", 1)
assert status == b"200"
removed = []

def remove_cloudflare(match):
    script = match.group()
    if (b"/cdn-cgi/challenge-platform/" in script
            and b"__CF$cv$params" in script):
        removed.append(script)
        return b""
    return script

app_html = re.sub(
    rb"<script\b[^>]*>.*?</script\s*>", remove_cloudflare,
    body, flags=re.I | re.S,
)
expected = subprocess.check_output([
    "git", "show", PINNED_SHA + ":apps/sites-prototype/public/view.html"
])
assert app_html == expected
print("App-owned guest HTML matches; Cloudflare scripts removed:", len(removed))
```

This normalization is a verification step only. It does not alter any served content or weaken browser security. The current guest HTML has no raw script-closing text inside JavaScript strings; revisit parsing if that assumption changes. Keep marker matching narrow.

## Independent assets and access checks

- Require HTTP 200 and JavaScript MIME types for sw.js, planner.js, guest.mjs, weather.mjs, maps.mjs and map-panel.mjs.
- Compare each response's SHA-256 with the corresponding pinned source bytes. Confirm the intended offline shell constant and absence of `AIza` text in these public assets.
- Signed out, require 401 for /api/trips, /api/trip?id=x and /api/weather?id=x, with no mapsEmbedKey. Require 404 for /api/shared-weather without Authorization.
- Preserve release-specific owner/guest Chrome checks and all restrictions on live data, tokens, runtime configuration and schema migrations.

Roll back for an actual app regression or failed app-owned content, asset, CSP or authorization check. A known Cloudflare-only insertion is not an app regression and must not itself trigger rollback. Record unavailable verification separately from observed failures; do not invent a passing result.
