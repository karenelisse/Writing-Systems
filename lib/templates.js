function sceneTemplate(x) {
  const pov = x.pov ? `\n  - "[[${x.pov}]]"` : '';
  const locations = (x.locations || []).length ? '\n' + x.locations.map(v => `  - "${v}"`).join('\n') : '';
  const manuscriptTarget = x.manuscriptTarget || `Manuscript/${x.title}`;
  return `---
tags:
  - scene
book: ${x.bookName}
book_number: ${x.bookNumber}
story_order: ${x.order}
chapter:
status: ${x.sceneStatus || 'Planned'}
pov:${pov}
locations:${locations}
manuscript: "[[${manuscriptTarget}]]"
characters:
races:
---

# ${x.title}

## Purpose

Why does this scene exist?

What changes because of this scene?

---

## Setup

Where are we?

Who is present?

What is happening before the scene begins?

---

## Scene

Describe what actually happens.

Focus on story beats rather than prose.

---

## Character Moments

How do the important characters change?

What do they learn?

What relationships develop?

---

## Worldbuilding

New lore introduced, if any.

---

## Emotional Beats

How should the reader feel?

---

## Foreshadowing

Future payoffs, reread details, and setup.

---

## Continuity Notes

Information Future Me needs.

---

## Manuscript Notes

Dialogue ideas, descriptions, moments, and lines worth keeping.

These are notes only, not polished prose.

---

## Manuscript

[[${manuscriptTarget}|Open manuscript]]
`;
}

function manuscriptTemplate(x) {
  const pov = x.pov ? `\n  - "[[${x.pov}]]"` : '';
  const locations = (x.locations || []).length ? '\n' + x.locations.map(v => `  - "${v}"`).join('\n') : '';
  const sceneTarget = x.sceneTarget || `Scenes/${x.title}`;
  return `---
tags:
  - manuscript
book: ${x.bookName}
book_number: ${x.bookNumber}
story_order: ${x.order}
chapter:
status: ${x.manuscriptStatus || 'Not Started'}
pov:${pov}
locations:${locations}
scene: "[[${sceneTarget}]]"
---

# ${x.title}

`;
}

function dashboardHelp() {
  return `> [!info]- Dashboard Help
> **This Dashboard is the single source of truth for this book.**
>
> ### New Scene
> Run **Writing System: New Scene**.
>
> This creates the Scene file, creates the matching Manuscript file, and adds a row here.
>
> ### Reorder Scenes
> Run **Writing System: Reorder Scenes**.
>
> Use the ↑ / ↓ buttons, then choose **Save order + apply**. This updates the Dashboard and writes the new \`story_order\` into both paired files.
>
> ### Update Scene Status
> Edit the status after the Scene link directly in this table.
>
> Example: \`[[Scenes/Meeting Darcy\\|Meeting Darcy]] *(Planned)*\` → \`[[Scenes/Meeting Darcy\\|Meeting Darcy]] *(Drafted)*\`
>
> ### Update Manuscript Status
> Edit the status after the Manuscript link the same way.
>
> Example: \`[[Manuscript/Meeting Darcy\\|Meeting Darcy]] *(Not Started)*\` → \`[[Manuscript/Meeting Darcy\\|Meeting Darcy]] *(Draft)*\`
>
> ### Update POV, Location(s), or Chapter
> Edit those cells directly in this table. Multiple locations may be comma-separated Wiki Links.
>
> When finished, run **Writing System: Apply Dashboard**.
>
> Dashboard-owned values are copied into both Scene and Manuscript frontmatter.
>
> ### Working Title
> Edit the **Working Title:** line near the top of this Dashboard. The outer project folder is the series/project name; Working Title is this individual book's title.
>
> ### Compile for Google Docs
> Run **Writing System: Compile Manuscript** to create \`Compiled/${'${bookName}'}.md\`.
>
> Or run **Writing System: Compile Manuscript and Copy to Clipboard** to paste directly into Google Docs.
`;
}

function dashboardTemplate(bookName, projectName = '') {
  return `---
tags:
  - book-dashboard
book: ${bookName}
---

# ${bookName} Dashboard

**Working Title:** ${projectName || ''}

<!-- WRITING-SYSTEM:SCENES:START -->

| # | Scene | Manuscript | POV | Location(s) | Chapter |
| ---: | --- | --- | --- | --- | ---: |

<!-- WRITING-SYSTEM:SCENES:END -->

${dashboardHelp().replace('${bookName}', bookName)}
`;
}

function sparkTemplate(name) {
  return `---
tags:
  - spark
project: "${name.replace(/"/g, '\\"')}"
status: Idea
---

# ${name}

## Premise

## Elevator Pitch

## Why This Idea Excites Me

## Genre

## Tone

## POV

## Themes

## Initial Characters

## Initial Locations

## Brain Dump

## Possible Ending

## Things I Don't Want to Forget
`;
}

function stripManuscript(content, title) {
  let body = String(content || '').replace(/^---\s*\r?\n[\s\S]*?\r?\n---\s*\r?\n?/, '');
  const e = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  body = body.replace(new RegExp(`^#\\s+${e}\\s*\\r?\\n+`, 'i'), '');
  return body.trim();
}

function replaceManuscriptProse(content, title, prose) {
  const source = String(content || '');
  const frontmatter = source.match(/^---\s*\r?\n[\s\S]*?\r?\n---\s*\r?\n?/);
  const header = frontmatter ? `${frontmatter[0].trimEnd()}\n\n` : '';
  const body = String(prose || '').trim();
  return `${header}# ${title}\n${body ? `\n${body}\n` : '\n'}`;
}

function parseWorkingDraft(content) {
  const sections = [];
  let current = null;

  const finish = () => {
    if (!current) return;
    current.prose = current.lines.join('\n').trim();
    delete current.lines;
    sections.push(current);
    current = null;
  };

  for (const line of String(content || '').replace(/\r\n/g, '\n').split('\n')) {
    const heading = line.match(/^###\s+\[\[([^\]|]+)(?:\|([^\]]+))?\]\]\s*$/);
    if (heading) {
      finish();
      current = {
        path: heading[1].trim(),
        title: (heading[2] || heading[1].split('/').pop()).trim(),
        lines: []
      };
      continue;
    }
    if (current && /^#\s+(?:Chapter\b|Unassigned\s*$)/i.test(line)) {
      finish();
      continue;
    }
    if (current) current.lines.push(line);
  }
  finish();
  return sections;
}

module.exports = {
  sceneTemplate, manuscriptTemplate, dashboardTemplate, sparkTemplate,
  stripManuscript, replaceManuscriptProse, parseWorkingDraft
};
