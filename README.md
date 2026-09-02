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
