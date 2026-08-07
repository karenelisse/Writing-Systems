const { Modal, Setting, Notice } = require('obsidian');

class SceneModal extends Modal {
  constructor(app, cb) {
    super(app);
    this.cb = cb;
    this.v = {
      title: "",
      pov: "",
      locations: "",
      chapter: "",
      sceneStatus: "Planned",
      manuscriptStatus: "Not Started"
    };
  }

  onOpen() {
    const e = this.contentEl;
    this.modalEl.addClass("writing-system-scene-modal");
    e.createEl("h2", { text: "New scene" });

    let titleInput;

    new Setting(e)
      .setName("Title")
      .addText(t => {
        titleInput = t.inputEl;
        t.onChange(v => this.v.title = v.trim());
      });

    new Setting(e)
      .setName("POV")
      .setDesc("Character page name; may be blank.")
      .addText(t => t.onChange(v => this.v.pov = v.trim()));

    new Setting(e)
      .setName("Location(s)")
      .setDesc("Comma-separated Wiki Links or names.")
      .addText(t => t.onChange(v => this.v.locations = v.trim()));

    new Setting(e)
      .setName("Chapter")
      .setDesc("Optional; may stay blank.")
      .addText(t => t.onChange(v => this.v.chapter = v.trim()));

    e.createEl("p", {
      text: "New scenes start as Planned / Not Started. Change either status later in the Dashboard."
    });

    const create = async () => {
      if (!this.v.title) {
        new Notice("Title is required.");
        return;
      }
      this.close();
      await this.cb(this.v);
    };

    titleInput?.addEventListener("keydown", ev => {
      if (ev.key === "Enter") create();
    });

    const actions = e.createDiv({ cls: "writing-system-modal-actions" });

    new Setting(actions)
      .addButton(b =>
        b.setButtonText("Cancel")
          .onClick(() => this.close())
      )
      .addButton(b =>
        b.setButtonText("Create scene pair")
          .setCta()
          .onClick(create)
      );
  }

  onClose() {
    this.contentEl.empty();
  }
}

module.exports = { SceneModal };
