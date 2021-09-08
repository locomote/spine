const Spine = require('./spine');

const { $ }     = Spine;

const hashStrip    = /^#*/;
const namedParam   = /:([\w\d]+)/g;
const splatParam   = /\*([\w\d]+)/g;
const escapeRegExp = /[-[\]{}()+?.,\\^$|#\s]/g;

class Path extends Spine.Module {
  constructor(path, callback) {
    super(...arguments);
    this.path = path;
    this.callback = callback;
    this.names = [];

    if (typeof path === 'string') {
      let match;
      namedParam.lastIndex = 0;
      while ((match = namedParam.exec(path)) !== null) {
        this.names.push(match[1]);
      }

      splatParam.lastIndex = 0;
      while ((match = splatParam.exec(path)) !== null) {
        this.names.push(match[1]);
      }

      path = path.replace(escapeRegExp, '\\$&')
        .replace(namedParam, '([^\/]*)')
        .replace(splatParam, '(.*?)');

      this.route = new RegExp(`^${path}$`);
    } else {
      this.route = path;
    }
  }

  match(path, options = {}) {
    let match;
    if (!(match = this.route.exec(path))) { return false; }
    options.match = match;
    const params = match.slice(1);

    if (this.names.length) {
      for (let i = 0; i < params.length; i++) {
        const param = params[i];
        options[this.names[i]] = param;
      }
    }

    Route.trigger('before', this);
    return this.callback.call(null, options) !== false;
  }
}

class Route extends Spine.Module {
  static initClass() {
    this.extend(Spine.Events);

    this.historySupport = window.history && window.history.pushState;

    this.options = {
      trigger : true,
      history : false,
      shim    : false,
      replace : false,
      redirect: false
    };

    this.routers = [];

    this.change = () => {
      const path = this.getPath();
      if (path === this.path) { return; }
      this.path = path;
      return this.matchRoutes(this.path);
    };
  }

  static setup(options = {}) {
    this.options = $.extend({}, this.options, options);

    if (this.options.history) {
      this.history = this.historySupport && this.options.history;
    }

    if (this.options.shim) { return; }

    if (this.history) {
      $(window).bind('popstate', this.change);
    } else {
      $(window).bind('hashchange', this.change);
    }
    this.change();
  }

  static unbind() {
    const unbindResult = Spine.Events.unbind.apply(this, arguments);
    if (arguments.length > 0) { return unbindResult; }

    if (this.options.shim) { return; }

    if (this.history) {
      $(window).unbind('popstate', this.change);
    } else {
      $(window).unbind('hashchange', this.change);
    }
  }

  static navigate(...args) {
    let options = {};
    const lastArg = args[args.length - 1];
    if (typeof lastArg === 'object') {
      options = args.pop();
    } else if (typeof lastArg === 'boolean') {
      options.trigger = args.pop();
    }
    options = $.extend({}, this.options, options);

    const path = args.join('/');
    if (this.path === path) { return; }
    this.path = path;

    if (options.trigger) {
      this.trigger('navigate', this.path);
      const routes = this.matchRoutes(this.path, options);
      if (!routes.length) {
        if (typeof options.redirect === 'function') {
          return options.redirect.apply(this, [this.path, options]);
        } else if (options.redirect === true) {
          this.redirect(this.path);
        }
      }
    }

    if (options.shim) {
      true;
    } else if (this.history && options.replace) {
      history.replaceState({}, document.title, this.path);
    } else if (this.history) {
      history.pushState({}, document.title, this.path);
    } else {
      window.location.hash = this.path;
    }
  }

  static create() {
    const router = new this();
    this.routers.push(router);
    return router;
  }

  static add(path, callback) {
    // @router ?= new this
    this.router.add(path, callback);
  }

  add(path, callback) {
    if ((typeof path === 'object') && !(path instanceof RegExp)) {
      for (const key in path) { const value = path[key]; this.add(key, value); }
    } else {
      this.routes.push(new Path(path, callback));
    }
  }

  destroy() {
    this.routes.length = 0;
    this.constructor.routers = (this.constructor.routers.filter((r) => r !== this));
  }

  // Private

  static getPath() {
    let path;
    if (this.history) {
      path = window.location.pathname;
      if (path.substr(0, 1) !== '/') { path = `/${path}`; }
    } else {
      path = window.location.hash;
      path = path.replace(hashStrip, '');
    }
    return path;
  }

  static getHost() {
    return `${window.location.protocol}//${window.location.host}`;
  }

  static matchRoutes(path, options) {
    const matches = [];
    for (const router of this.routers.concat([this.router])) {
      const match = router.matchRoute(path, options);
      if (match) { matches.push(match); }
    }
    if (matches.length) { this.trigger('change', matches, path); }
    return matches;
  }

  static redirect(path) {
    window.location = path;
  }

  constructor() {
    super(...arguments);
    this.routes = [];
  }

  matchRoute(path, options) {
    for (const route of this.routes) {
      if (route.match(path, options)) {
        return route;
      }
    }
  }

  trigger(...args) {
    args.splice(1, 0, this);
    this.constructor.trigger(...args);
  }
}
Route.initClass();

Route.router = new Route();

Spine.Controller.include({
  route(path, callback) {
    if (this.router instanceof Spine.Route) {
      this.router.add(path, this.proxy(callback));
    } else {
      Spine.Route.add(path, this.proxy(callback));
    }
  },

  routes(routes) {
    for (const key in routes) { const value = routes[key]; this.route(key, value); }
  },

  navigate() {
    Spine.Route.navigate.apply(Spine.Route, arguments);
  }
});

Route.Path      = Path;
Spine.Route     = Route;
module.exports = Route;
