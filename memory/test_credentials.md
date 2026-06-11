# Test Credentials

## App Login (Allowlist)
- mydatejar@gmail.com / #Test1234
- joseph@centurion-pm.com / #Test1234

## Third-party (managed via Settings UI — do NOT hardcode)
- **Apify Token (`.env` APIFY_TOKEN)**: Currently returns HTTP 401 from api.apify.com. The DB override for `APIFY_USERNAME_TOKEN` is valid and saved by mydatejar@gmail.com. User can rotate via Apify Console and paste into Settings → Apify card → credential row.
- **Cloudinary**: Managed via Settings → Cloudinary card. Folder = "Content for Vibe Check".
