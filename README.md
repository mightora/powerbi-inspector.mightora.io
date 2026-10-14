# Mightora Power BI Report Inspector

An open-source, local-first static web application for exploring Power BI Project (PBIP) report and model metadata.

**Live site (when GitHub Pages is configured):** https://powerbi-inspector.mightora.io/

## Features

- Load zipped PBIP projects or the extracted folder.
- Search report pages, visual metadata, filters, bookmarks, semantic-model tables, columns, DAX measures and relationships.
- Export HTML, Markdown, JSON, CSV (ZIP), and editable Word (.docx).
- Supports modern PBIR and best-effort TMDL, model.bim and legacy report.json metadata.
- Includes a demonstration dataset; no uploads to a server.
- Online edition uses Mightora shared UI; download a fully self-contained offline HTML or ZIP.

**Limitations:** A .pbip file alone is a pointer; upload its folder or ZIP. Direct .pbix/.pbit parsing is not supported. Complex TMDL and certain dynamic metadata may not be fully discoverable. All output reflects input files only. DAX/M is read as text, never executed.

## Develop

Run `npm test` for automated parser/export tests. Run `npm run build` to generate `downloads/power-bi-inspector-offline.zip` from the checked-in standalone HTML and licence; the Pages workflow runs both commands.

Modules: `zip.js`, `parser.js`, `exporter.js`, `app.js`; `styles.css` contains application styles. The offline HTML includes the same logic and styling inlined; new features should be applied to both editions through the maintained source build in the project source archive. 

## Publish

GitHub Actions deploy the site on main once GitHub Pages is enabled with **Settings → Pages → Build and deployment → GitHub Actions**. For the custom domain, configure `powerbi-inspector.mightora.io` in GitHub Pages and point DNS to the GitHub Pages host. A repository `CNAME` is included but does not override Pages settings for Actions-based deployments.

Evidence: [Tests](https://github.com/mightora/powerbi-inspector.mightora.io/actions/workflows/ci.yml) · [CodeQL](https://github.com/mightora/powerbi-inspector.mightora.io/actions/workflows/codeql.yml) · [Deployment](https://github.com/mightora/powerbi-inspector.mightora.io/actions/workflows/pages.yml) · [MIT Licence](LICENSE).

Online visits load third-party resources needed for Mightora branding (CDN/js-yaml/logo/author images). User-selected project content is not transmitted by the app. Offline mode embeds assets and sets CSP `connect-src 'none'`, with no app-originated network requirements. On-screen Resource Timing is not a full security monitor.

Copyright © 2026 Mightora. MIT licensed.
