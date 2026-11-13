# Bundled fonts

Twenty-one font families ship with the widget library, so a screen looks the same on a PLC or a panel
with no internet. `fonts.css` declares them; the operator and the IDE import it, and a browser loads
only the files a screen uses.

- Everything here except this file is written by `node scripts/fonts/fetch.mjs`, which takes the files
  from the Fontsource packages on npm (the Google Fonts files). To add a family, add it to the list in
  that script and run it; it also writes `packages/widgets/src/fontList.ts`. The files are committed,
  so a build needs no network.
- Subsets: Latin and Latin Extended (Western and Central European languages). Orbitron has Latin only.
  Cyrillic, Greek and others are not bundled.
- A family with a variable font has one file per subset for its whole weight range; Lato, Poppins,
  Barlow, Barlow Condensed and IBM Plex Mono have a file per weight (300 to 700 of what they have).
  Upright only: a browser slants the text for italic.
- Each family's license is in `licenses/` and must stay with the font files: the SIL Open Font
  License 1.1, except Roboto Slab (Apache License 2.0). `FAMILIES.md` lists each family's license and
  copyright holder.

"System" (Segoe UI, SF, Roboto on Android) needs no file but differs per device. A project can also
hold its own fonts (Project properties, Fonts); those are in the project file, not here.
