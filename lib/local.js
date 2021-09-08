const Spine = require('./spine');

Spine.Model.Local = {
  extended() {
    this.change(this.saveLocal);
    this.fetch(this.loadLocal);
  },

  saveLocal() {
    const result = JSON.stringify(this);
    localStorage[this.className] = result;
  },

  loadLocal(options = {}) {
    if (!options.hasOwnProperty('clear')) { options.clear = true; }
    const result = localStorage[this.className];
    this.refresh(result || [], options);
  }
};

module.exports = Spine.Model.Local;
