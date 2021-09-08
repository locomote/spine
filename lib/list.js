const Spine  = require('./spine');

const { $ }  = Spine;

class List extends Spine.Controller {
  static initClass() {
    this.prototype.events =      { 'click .item': 'click' };

    this.prototype.selectFirst = false;
  }

  constructor() {
    super(...arguments);
    this.change = this.change.bind(this);
    this.bind('change', this.change);
  }

  template() {
    throw Error('Override template');
  }

  change(item) {
    let index;
    this.current = item;

    if (!this.current) {
      this.children().removeClass('active');
      return;
    }

    this.children().removeClass('active');
    for (let idx = 0; idx < this.items.length; idx++) {
      item = this.items[idx];
      if (item === this.current) {
        index = idx;
        break;
      }
    }

    $(this.children().get(index)).addClass('active');
  }

  render(items) {
    if (items) { this.items = items; }
    this.html(this.template(this.items));
    this.change(this.current);
    if (this.selectFirst) {
      if (!this.children('.active').length) {
        this.children(':first').click();
      }
    }
  }

  children(sel) {
    return this.el.children(sel);
  }

  click(e) {
    const item = this.items[$(e.currentTarget).index()];
    this.trigger('change', item);
    return true;
  }
}
List.initClass();
Spine.List = List;

module.exports = Spine.List;
