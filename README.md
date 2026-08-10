# Writing System v2.0

This is the locked v2 workflow.

## Install

Replace the contents of:

`.obsidian/plugins/writing-system/`

with the complete repository contents. Version 2 uses the `commands`, `lib`,
`modals`, and `services` folders in addition to `manifest.json`, `main.js`, and
`styles.css`.

Restart Obsidian and enable **Writing System**.

## Development

`main.js` is the bundled file that Obsidian loads. Make code changes in
`main.source.js` and the source folders, then run `node build-bundle.js` and
copy `dist/main.js` to the repository root before committing.

## Source of truth

Dashboard owns:

- scene order
- POV
- Location(s)
- Chapter
- Scene status
- Manuscript status

Scene owns planning-specific content such as characters, races/species, beats, continuity, and foreshadowing.

Manuscript owns prose.

## Commands

- Writing System: New Project
- Writing System: Open Dashboard
- Writing System: New Scene
- Writing System: Reorder Scenes
- Writing System: Apply Dashboard
- Writing System: Compile Manuscript
- Writing System: Compile Manuscript and Copy to Clipboard
- Writing System: Compile Working Draft
- Writing System: Open Scene
- Writing System: Open Manuscript
- Writing System: Validate Book

Dashboard help is embedded inside every newly-created Dashboard.

Applying or reordering the Dashboard numbers both paired files with padded
prefixes such as `001 - Opening.md`, keeping Scene and Manuscript folders in
Dashboard order while preserving the visible scene titles in links.

Version 2.1.1 also recovers safely when older Dashboard links still point to
unnumbered names: the existing numbered pair is reordered instead of creating
replacement files.

## v2.0.1 table fix

Aliased Wiki Links inside Markdown tables are rendered with an escaped pipe (`\|`), e.g. `[[Scenes/Meeting Darcy\|Meeting Darcy]]`. This is required Markdown-table syntax; Obsidian still displays the link normally. The plugin escapes and unescapes these automatically.

## Internal code layout (2.0.7 refactor)

This release changes code organization only. User-facing logic is unchanged.

```text
writing-system/
├── main.js                 # plugin entry point only
├── commands/
│   ├── index.js            # command registration
│   ├── project.js          # project creation
│   ├── dashboard.js        # dashboard selection/apply/reorder/indexes
│   ├── scene.js            # new scene pair
│   ├── compile.js          # manuscript compilation
│   └── navigation.js       # paired-file / validation command delegation
├── modals/
│   ├── project.js
│   ├── scene.js
│   ├── reorder.js
│   └── validate.js
├── lib/
│   ├── dashboard.js        # parsing, wiki links, table helpers, book metadata
│   └── templates.js        # scene/manuscript/dashboard/spark templates
└── services/
    └── files.js            # folder/file creation helpers
```
