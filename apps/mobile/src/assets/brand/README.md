# Mintly Brand Assets

This folder contains the source SVG files for Mintly branding:

- `mintly-mark.svg`
- `mintly-wordmark-light.svg`
- `mintly-wordmark-dark.svg`
- `mintly-banner-light.svg`
- `mintly-banner-dark.svg`
- `mintly-appicon-light.svg`
- `mintly-appicon-dark.svg`

Expo build icons must be PNG files. Current `app.json` points to placeholder PNGs in:

- `/Users/umutugur/finsight/apps/mobile/assets/brand/mintly-icon.png`
- `/Users/umutugur/finsight/apps/mobile/assets/brand/mintly-adaptive-foreground.png`
- `/Users/umutugur/finsight/apps/mobile/assets/brand/mintly-splash.png`
- `/Users/umutugur/finsight/apps/mobile/assets/brand/mintly-favicon.png`

Before production release, export the SVG app icon variants to PNG and replace placeholders:

1. Export square icon at 1024x1024 (`mintly-icon.png`).
2. Export adaptive foreground PNG at 1024x1024 (`mintly-adaptive-foreground.png`).
3. Export splash icon PNG at 1242x2436 (or your splash target), transparent background.
4. Export favicon PNG at 48x48.

Use 1x/2x/3x generated PNGs when platform-specific pipelines require density variants.
