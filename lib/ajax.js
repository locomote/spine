const Spine = require('./spine');

const { $ }      = Spine;
const { Model }  = Spine;
const Queue  = $({});

const Ajax = {
  getURL(object) {
    if (object.className != null) {
      return this.generateURL(object);
    } else {
      return this.generateURL(object, encodeURIComponent(object.id));
    }
  },

  getCollectionURL(object) {
    return this.generateURL(object);
  },

  getScope(object) {
    return (object.scope ? object.scope() : undefined) || object.scope;
  },

  getCollection(object) {
    if (object.url !== object.generateURL) {
      if (typeof object.url === 'function') {
        return object.url();
      } else {
        return object.url;
      }
    } else if (object.className != null) {
      return `${object.className.toLowerCase()}s`;
    }
  },

  generateURL(object, ...args) {
    const collection = Ajax.getCollection(object) || Ajax.getCollection(object.constructor);
    const scope = Ajax.getScope(object) || Ajax.getScope(object.constructor);
    args.unshift(collection);
    args.unshift(scope);
    // construct and clean url
    let path = args.join('/');
    path = path.replace(/(\/\/)/g, "/");
    path = path.replace(/^\/|\/$/g, "");
    // handle relative urls vs those that use a host
    if (path.indexOf("../") !== 0) {
      return `${Model.host}/${path}`;
    } else {
      return path;
    }
  },

  enabled: true,

  disable(callback) {
    if (this.enabled) {
      this.enabled = false;
      try {
        callback();
      } finally {
        this.enabled = true;
      }
    } else {
      callback();
    }
  },

  queue(request) {
    if (request) { Queue.queue(request); } else { Queue.queue(); }
  },

  clearQueue() {
    this.queue([]);
  },

  config: {
    loadMethod   : 'GET',
    updateMethod : 'PUT',
    createMethod : 'POST',
    destroyMethod: 'DELETE'
  }
};

class Base {
  static initClass() {
    this.prototype.defaults = {
      dataType   : 'json',
      processData: false,
      headers    : { 'X-Requested-With': 'XMLHttpRequest' }
    };

    this.prototype.queue = Ajax.queue;
  }

  ajax(params, defaults) {
    return $.ajax(this.ajaxSettings(params, defaults));
  }

  ajaxQueue(params, defaults, record) {
    let jqXHR    = null;
    const deferred = $.Deferred();
    const promise  = deferred.promise();
    if (!Ajax.enabled) { return promise; }
    const settings = this.ajaxSettings(params, defaults);
    // prefer setting if exists else default is to parallelize 'GET' requests
    const parallel = settings.parallel !== undefined ? settings.parallel : (settings.type === 'GET');
    const request = function (next) {
      if (record && record.id) {
        // for existing singleton, model id may have been updated
        // after request has been queued
        if (!settings.url) { settings.url = Ajax.getURL(record); }
        if (settings.data) {
          settings.data.id = record.id;
        }
      }
      // 2 reasons not to stringify: if already a string, or if intend to have ajax processData
      if ((typeof settings.data !== 'string') && (settings.processData !== true)) {
        settings.data = JSON.stringify(settings.data);
      }
      jqXHR = $.ajax(settings)
        .done(deferred.resolve)
        .fail(deferred.reject)
        .then(next, next);
      if (parallel) {
        Queue.dequeue();
      }
    };

    promise.abort = function (statusText) {
      if (jqXHR) { return jqXHR.abort(statusText); }
      const index = $.inArray(request, this.queue());
      if (index > -1) { this.queue().splice(index, 1); }
      deferred.rejectWith(
        settings.context || settings,
        [promise, statusText, '']
      );
      return promise;
    };

    this.queue(request);
    return promise;
  }

  ajaxSettings(params, defaults) {
    return $.extend({}, this.defaults, defaults, params);
  }
}
Base.initClass();

class Collection extends Base {
  constructor(...args) {
    super(...args);
    const [model] = args;
    this.recordsResponse = this.recordsResponse.bind(this);
    this.failResponse = this.failResponse.bind(this);
    this.model = model;
  }

  find(id, params, options = {}) {
    const record = new this.model({ id });
    return this.ajaxQueue(
      params, {
        type    : options.method || Ajax.config.loadMethod,
        url     : options.url || Ajax.getURL(record),
        parallel: options.parallel
      }
    ).done(this.recordsResponse)
      .fail(this.failResponse);
  }

  all(params, options = {}) {
    return this.ajaxQueue(
      params, {
        type    : options.method || Ajax.config.loadMethod,
        url     : options.url || Ajax.getURL(this.model),
        parallel: options.parallel
      }
    ).done(this.recordsResponse)
      .fail(this.failResponse);
  }

  fetch(params = {}, options = {}) {
    const id = params.id;
    if (id) {
      delete params.id;
      return this.find(id, params, options).done((record) => {
        this.model.refresh(record, options);
      });
    } else {
      return this.all(params, options).done((records) => {
        this.model.refresh(records, options);
      });
    }
  }

  // Private

  recordsResponse(data, status, xhr) {
    this.model.trigger('ajaxSuccess', null, status, xhr);
  }

  failResponse(xhr, statusText, error) {
    this.model.trigger('ajaxError', null, xhr, statusText, error);
  }
}

class Singleton extends Base {
  constructor(...args) {
    super(...args);
    const [record] = args;
    this.recordResponse = this.recordResponse.bind(this);
    this.failResponse = this.failResponse.bind(this);
    this.record = record;
    this.model = this.record.constructor;
  }

  reload(params, options = {}) {
    return this.ajaxQueue(
      params, {
        type    : options.method || Ajax.config.loadMethod,
        url     : options.url,
        parallel: options.parallel
      }, this.record
    ).done(this.recordResponse(options))
      .fail(this.failResponse(options));
  }

  create(params, options = {}) {
    return this.ajaxQueue(
      params, {
        type       : options.method || Ajax.config.createMethod,
        contentType: 'application/json',
        data       : this.record.toJSON(),
        url        : options.url || Ajax.getCollectionURL(this.record),
        parallel   : options.parallel
      }
    ).done(this.recordResponse(options))
      .fail(this.failResponse(options));
  }

  update(params, options = {}) {
    return this.ajaxQueue(
      params, {
        type       : options.method || Ajax.config.updateMethod,
        contentType: 'application/json',
        data       : this.record.toJSON(),
        url        : options.url,
        parallel   : options.parallel
      }, this.record
    ).done(this.recordResponse(options))
      .fail(this.failResponse(options));
  }

  destroy(params, options = {}) {
    return this.ajaxQueue(
      params, {
        type    : options.method || Ajax.config.destroyMethod,
        url     : options.url,
        parallel: options.parallel
      }, this.record
    ).done(this.recordResponse(options))
      .fail(this.failResponse(options));
  }

  // Private

  recordResponse(options = {}) {
    return (data, status, xhr) => {
      Ajax.disable(() => {
        if (!Spine.isBlank(data) && !this.record.destroyed) {
          // ID change, need to do some shifting
          if (data.id && (this.record.id !== data.id)) {
            this.record.changeID(data.id);
          }
          // Update with latest data
          this.record.refresh(data);
        }
      });

      this.record.trigger('ajaxSuccess', data, status, xhr);
      if (options.done) { options.done.apply(this.record); }
    };
  }

  failResponse(options = {}) {
    return (xhr, statusText, error) => {
      this.record.trigger('ajaxError', xhr, statusText, error);
      if (options.fail) { options.fail.apply(this.record); }
    };
  }
}

// Ajax endpoint
Model.host = '';

const GenerateURL = {
  include(...args) {
    args.unshift(encodeURIComponent(this.id));
    return Ajax.generateURL(this, ...args);
  },
  extend(...args) {
    return Ajax.generateURL(this, ...args);
  }
};

const Include = {
  ajax() { return new Singleton(this); },

  generateURL: GenerateURL.include,

  url: GenerateURL.include
};

const Extend = {
  ajax() { return new Collection(this); },

  generateURL: GenerateURL.extend,

  url: GenerateURL.extend
};

Model.Ajax = {
  extended() {
    this.fetch(this.ajaxFetch);
    this.change(this.ajaxChange);
    this.extend(Extend);
    this.include(Include);
  },
  // Private

  ajaxFetch(...args) {
    return this.ajax().fetch(...args);
  },

  ajaxChange(record, type, options = {}) {
    if (options.ajax === false) { return; }
    return record.ajax()[type](options.ajax, options);
  }
};

Model.Ajax.Methods = {
  extended() {
    this.extend(Extend);
    this.include(Include);
  }
};

// Globals
Ajax.defaults   = Base.prototype.defaults;
Ajax.Base       = Base;
Ajax.Singleton  = Singleton;
Ajax.Collection = Collection;
Spine.Ajax      = Ajax;
module.exports  = Ajax;
