# Writing Systems

An Obsidian plugin for planning, writing, and managing long-form fiction.

I built Writing Systems because I wanted to use Obsidian to write a novel, but I couldn't find a plugin that worked quite the way I wanted.

I wanted somewhere I could plan scenes, track characters and continuity, move scenes around without making a mess, and still keep the actual manuscript clean and easy to write in.

So I built my own.

Writing Systems separates **planning your story** from **writing your story**, while keeping the two connected.

## How it works

Each writing project has three main parts:

### Dashboard

The Dashboard is the overview of your book.

This is where you can see and manage things like:

* scene order
* POV
* locations
* chapters
* scene status
* manuscript status

Want to move a scene earlier or later in the book? Change it here, then apply the Dashboard.

Writing Systems will reorder and rename the corresponding files for you.

### Scenes

Scene files are for planning.

This is where I keep the information I want to know about a scene without cluttering up the manuscript itself, including:

* characters
* races/species
* story beats
* continuity notes
* foreshadowing
* scene notes

A Scene is essentially the behind-the-scenes version of what you're writing.

### Manuscript

Manuscript files are just that: **the actual book**.

This separation was one of the main reasons I built Writing Systems. I wanted all of my Obsidian notes, metadata and planning available while I wrote, without having to put all of it into the same files as my prose.

## Getting started

Once the plugin is installed and enabled, open the Obsidian Command Palette and run:

**Writing System: New Project**

This creates the basic structure for a writing project.

From there, most of the time you'll only need a handful of commands.

### Creating a scene

Run:

**Writing System: New Scene**

Writing Systems creates a paired **Scene** and **Manuscript** file.

Use the Scene file to plan what happens.

Use the Manuscript file to actually write it.

### Managing your book

Run:

**Writing System: Open Dashboard**

Your Dashboard gives you a bird's-eye view of the project.

You can change scene order and other book-level information there.

After making changes, run:

**Writing System: Apply Dashboard**

Writing Systems updates the underlying Scene and Manuscript files to match.

Scenes are automatically given padded numbers such as:

`001 - Opening.md`
`002 - The Crash.md`
`003 - First Night.md`

This keeps the Scene and Manuscript folders in the same order as the book.

Your actual scene titles remain unchanged inside Obsidian links.

### Reordering scenes

You can also use:

**Writing System: Reorder Scenes**

This lets you change the structure of the book without manually renaming and reorganising all of the paired files.

### Jumping between planning and writing

Use:

**Writing System: Open Scene**

or:

**Writing System: Open Manuscript**

to move between the two versions of the scene you're currently working on.

## Compiling your manuscript

When you want to read your book as a book rather than as dozens of individual Obsidian files, run:

**Writing System: Compile Manuscript**

Writing Systems combines your manuscript scenes in the correct order.

You can also use:

**Writing System: Compile Manuscript and Copy to Clipboard**

if you want to quickly paste the current manuscript somewhere else.

## Working Draft

Sometimes I don't want to edit individual scene files.

I want to read the manuscript from beginning to end and make changes as I go.

That's what the Working Draft is for.

Run:

**Writing System: Compile Working Draft**

to create a working version of the manuscript.

After editing it, you can use:

**Writing System: Working Draft to Manuscript**

to push those changes back into the individual manuscript files.

## Sparks

Not every idea belongs to a scene yet.

Writing Systems also supports **Sparks**: somewhere to capture an idea before you know exactly where it belongs.

I added this because that's how I actually write. Sometimes I know exactly what scene comes next.

Sometimes my brain just goes:

> Oh. That would be cool.

I wanted somewhere to put those ideas without having to immediately work out where they fit into the book.

## Useful commands

The plugin currently includes:

* `Writing System: New Project`
* `Writing System: Open Dashboard`
* `Writing System: New Scene`
* `Writing System: Reorder Scenes`
* `Writing System: Apply Dashboard`
* `Writing System: Compile Manuscript`
* `Writing System: Compile Manuscript and Copy to Clipboard`
* `Writing System: Compile Working Draft`
* `Writing System: Working Draft to Manuscript`
* `Writing System: Open Scene`
* `Writing System: Open Manuscript`
* `Writing System: Validate Book`

Newly created Dashboards also contain built-in help.

## Installation

Writing Systems is currently installed manually.

Copy the repository contents into:

`.obsidian/plugins/writing-system/`

Restart Obsidian, then enable **Writing System** under Community Plugins.

## Why I built it

Mostly because I wanted it.

I use Obsidian for writing fiction and liked having my characters, worldbuilding, notes and manuscript together in one vault.

What I didn't like was managing everything manually.

If I moved a scene, I wanted the files to move with it.

If I created a scene, I wanted its planning file and manuscript file created together.

If I wanted to read my manuscript, I didn't want to copy and paste dozens of files together.

And I didn't want my actual prose buried underneath planning metadata.

Writing Systems grew out of the workflow I wanted for my own writing projects.

It's opinionated because of that. It's not trying to replace everything Obsidian can do or dictate how a novel *should* be written.

It's just the writing system I wanted Obsidian to have.

## Development

Obsidian loads the bundled `main.js`.

Development is done in `main.source.js` and the source folders:

* `commands/`
* `lib/`
* `modals/`
* `services/`

After making changes, run:

`node build-bundle.js`

Then copy `dist/main.js` to the repository root before committing.

## Optional Parts (2.3.0)

Parts are enabled for an entire writing project. Existing projects stay flat until
**Enable Parts for Project** is run explicitly. A simple Parts project can contain
one Book and one Part.

The hierarchy is Story > Book > Part > Chapter > Scene. Parts are numbered across
the whole Story, Chapters across each Book, and Scene filenames restart at `001`
inside each Part. Chapters may be blank while planning, but an assigned Chapter
cannot span Parts. A Part belongs to one Book. A Scene can move to any Part in the same Story, including a Part in another Book,
using **Move Scene to Part**.

```text
Writing/My Story/Plot/
  Master Dashboard.md
  Writing System State.json
  Book 1/
    Dashboard.md
    Scenes/Part 1/001 - Opening.md
    Manuscript/Part 1/001 - Opening.md
    Compiled/Chapters/
```

### Migrating an existing project

1. For your first trial, open a separate copy of the vault in Obsidian.
2. Open a Book Dashboard and run **Validate Project**. Resolve missing pairs and
   add any unlisted paired Scenes to their existing Dashboard before migration.
3. Run **Enable Parts for Project** and enter an initial descriptive Part name.
   Each existing Book gets its own initial Part, containing all its paired Scenes.
4. Review the file-by-file preview, then choose **Apply**. Cancelling the preview
   leaves the project unchanged.
5. Run **Validate Project** again. Use **New Part**, **Move Scene to Part**, and
   **Move Part to Book** to arrange the Story.

Migration preserves manuscript prose, planning notes, custom Dashboard text, and
unknown frontmatter fields. IDs are assigned once and survive subsequent moves.
Unlisted files, incomplete pairs, conflicting identity records, or occupied
file destinations block reconciliation before changes. A missing member of an
existing pair is never silently replaced with an empty manuscript. New Dashboard
rows can create both files when neither already exists.

### Dashboard authority and commands

**Open Master Dashboard** opens the project's Book/Part overview. On a legacy
project it creates that overview in flat mode; this does not enable Parts.
Apply it once before using commands that require its applied state.

The Master has a readable outline and an editable JSON definition. Book array
order controls Book numbering; each Book's Part array controls its Part order.
Edit `title` for Books and `name` for Parts. Keep `id` and `version` values intact.
Run **Apply Master Dashboard** after editing. Use **New Part** to generate an ID
for a new Part. Part ownership changes append the moved Part to its destination
Book; use **Reorder Parts** afterward to position it.

Book Dashboards control Scene rows, statuses, POV, locations, and Chapter
assignments. Part headings and identity comments come from the Master. Use
**Apply Dashboard** after editing Scene rows. Managed-project reconciliation
checks the whole project and applies Dashboard values across its Books.

- **New Scene** uses the Book containing the active file. Outside a Book, it asks
  which Book to use; a project-level file limits the choices to that project.
  The New Scene form lets you select a Part within that Book, preselecting the
  current Part when it can be identified. New Scenes append to the selected Part.
- **Reorder Scenes** operates within a selected Part.
- **Move Scene to Part** offers Parts across the entire story, including other Books, and appends it to the destination
  Part and clears its former Chapter assignment. Assign its new Chapter afterward.
- **Reorder Parts** uses up/down buttons.
- **Move Part to Book** moves all files under both Part folders, preserves Part
  notes in the Dashboard, and updates affected numbers and links.
- **Validate Book** and **Validate Project** only report; they never repair files.
- Removing existing Book/Part definitions is rejected rather than deleting their
  content. Disabling Parts after migration is not implemented.

`Writing System State.json` records the last applied identities and locations;
it is not an alternative editable source of truth. `Part Identity.json` in each
Part folder identifies even an empty Part. Keep these files with your project.

### Compilation and Working Drafts

Both compilation commands include Part headings by default. Set `partHeadings`
to `false` in the Master definition and apply it to omit them. Generated Chapter
files remain in each Book's `Compiled/Chapters` directory. As before, compilation
does not automatically delete old Chapter output files.

Working Drafts contain Markdown headings and prose, with no generated sync comments.
Scene identities and boundaries are stored in the adjacent `- Working Draft.sync.json`
file; keep that companion file with the draft. Preserve generated linked Scene
headings and Part/Chapter headings when editing. To clean an older draft without
losing unsynced edits, open it and run **Remove Working Draft Comments**. Older
commented drafts still support sync. Part/Chapter headings are not synced into
Scene prose. Moving or renumbering updates links without discarding edits
in existing Working Drafts. A draft containing a Scene moved to another Book is
blocked from sync: preserve its unsynced edits and transfer them to the destination
Scene before compiling a fresh draft. Recompiling a Working Draft replaces that
Book's generated draft, as in earlier versions.

### Recovery

Operations preflight all destinations, stage file swaps, and save original text
in `Writing System Operation.json`. A write failure attempts rollback. If Obsidian
closes during an operation, further project changes are blocked until recovery.
Open a file under the affected project's `Plot` folder and run **Recover Writing
Project**. Review the restoration preview. Recovery refuses to overwrite files
that have been edited since the interruption. Keep the journal until recovery
succeeds; it contains the original text and move plan.

### Development and manual acceptance testing

Use Node 22 or newer:

```sh
npm ci
npm test
npm run check
npm run build
```

Copy `dist/main.js` to the plugin's root `main.js` after a successful build, then
reload the plugin in Obsidian. Tests use an in-memory Vault, with real YAML parsing;
they do not read or migrate your writing projects.

In a separate test vault, check:

1. A flat project still creates, reorders, compiles, and navigates paired Scenes.
2. Migration preserves distinctive prose, custom Dashboard notes, and frontmatter.
3. Two Books with several Parts renumber correctly after Book and Part reordering.
4. Same-Book Scene moves update both files and clear the old Chapter assignment.
5. Part moves preserve their content, additional files, links, and Dashboard notes.
6. Compilation includes the expected headings and Book-wide Chapter files.
7. Working Draft edits sync only to selected Scenes, including nested Part paths.
8. Validation leaves file timestamps/content unchanged. A missing pair or a
   destination collision causes Apply to fail without changing the project.

Automated tests do not replace checking rendering and modal behavior in Obsidian.
