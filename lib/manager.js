const Spine = require('./spine');

const { $ } = Spine;

class Manager extends Spine.Module {
  static initClass() {
    this.include(Spine.Events);
  }

  constructor() {
    super(...arguments);
    this.controllers = [];
    this.bind('change', this.change);
    this.add(...arguments);
  }

  add(...controllers) {
    for (const cont of controllers) { this.addOne(cont); }
  }

  addOne(controller) {
    controller.bind('active', (...args) => {
      this.trigger('change', controller, ...args);
    });
    controller.bind('release', () => {
      this.controllers = (this.controllers.filter((c) => c !== controller));
    });

    this.controllers.push(controller);
  }

  deactivate() {
    this.trigger('change', false, ...arguments);
  }
  // Private

  change(current, ...args) {
    for (const cont of this.controllers) {
      if (cont !== current) {
        cont.deactivate(...args);
      }
    }

    if (current) { current.activate(...args); }
  }
}
Manager.initClass();
Spine.Manager = Manager;

Spine.Controller.include({
  active(...args) {
    if (typeof args[0] === 'function') {
      this.bind('active', args[0]);
    } else {
      args.unshift('active');
      this.trigger(...args);
    }
    return this;
  },

  isActive() {
    return this.el.hasClass('active');
  },

  activate() {
    this.el.addClass('active');
    return this;
  },

  deactivate() {
    this.el.removeClass('active');
    return this;
  }
});

class Stack extends Spine.Controller {
  static initClass() {
    this.prototype.controllers = {};
    this.prototype.routes = {};

    this.prototype.className = 'spine stack';
  }

  constructor() {
    let value;
    super(...arguments);

    this.release = this.release.bind(this);
    this.manager = new Spine.Manager();
    if (Spine.Route) { this.router  = Spine.Route.create(); }

    for (const key in this.controllers) {
      value = this.controllers[key];
      if (this[key] != null) { throw Error(`'@${key}' already assigned`); }
      this[key] = new value({ stack: this });
      this.add(this[key]);
    }

    for (const key in this.routes) {
      value = this.routes[key];
      ((key, value) => {
        let callback;
        if (typeof value === 'function') { callback = value; }
        if (!callback) { callback = function () { return this[value].active(...arguments); }.bind(this); }
        this.route(key, callback);
      })(key, value);
    }

    if (this.default) { this[this.default].active(); }
  }

  add(controller) {
    this.manager.add(controller);
    return this.append(controller);
  }

  release() {
    if (this.router) { this.router.destroy(); }
    return super.release(...arguments);
  }
}
Stack.initClass();
Spine.Stack = Stack;

module.exports       = Spine.Manager;
module.exports.Stack = Spine.Stack;
