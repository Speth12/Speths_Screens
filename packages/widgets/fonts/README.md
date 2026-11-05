# Bundled fonts

Inter, Roboto, Open Sans and Noto Sans, so a screen looks the same on a PLC with no internet.
`fonts.css` declares them; the operator and the IDE import it.

- Subsets: Latin and Latin Extended (Western and Central European languages). Cyrillic, Greek and
  others are not bundled yet; add them the same way when a project needs them.
- Variable fonts, weights 400 to 700, WOFF2, downloaded from Google Fonts.
- Each family is licensed under the SIL Open Font License 1.1; the license texts are in `licenses/`
  (copied from github.com/google/fonts), and must stay with the font files.

| Family | Copyright holder |
| --- | --- |
| Inter | The Inter Project Authors (github.com/rsms/inter) |
| Roboto | The Roboto Project Authors (github.com/googlefonts/roboto-classic) |
| Open Sans | The Open Sans Project Authors (github.com/googlefonts/opensans) |
| Noto Sans | The Noto Project Authors (github.com/notofonts/latin-greek-cyrillic) |

"System" (Segoe UI, SF, Roboto on Android) needs no file but differs per device.
