/*
Spine.js MVC library
Released under the MIT License
*/

const Events = {
  bind(ev, callback) {
    const evs   = ev.split(' ');
    if (!this.hasOwnProperty('_callbacks') || !this._callbacks) { this._callbacks = {}; }
    for (const name of evs) {
      if (!this._callbacks[name]) { this._callbacks[name] = []; }
      this._callbacks[name].push(callback);
    }
    return this;
  },

  one(ev, callback) {
    let handler;
    this.bind(ev, (handler = function () {
      this.unbind(ev, handler);
      return callback.apply(this, arguments);
    }));
  },

  trigger(...args) {
    const ev = args.shift();
    const list = this.hasOwnProperty('_callbacks') && (this._callbacks && this._callbacks[ev]);
    if (!list) { return; }
    for (const callback of list) {
      if (callback.apply(this, args) === false) {
        break;
      }
    }
    return true;
  },

  listenTo(obj, ev, callback) {
    obj.bind(ev, callback);
    if (!this.listeningTo) { this.listeningTo = []; }
    this.listeningTo.push({ obj, ev, callback });
    return this;
  },

  listenToOnce(obj, ev, callback) {
    let handler;
    const listeningToOnce = this.listeningToOnce || (this.listeningToOnce = []);
    obj.bind(ev, (handler = function () {
      let idx = -1;
      for (let i = 0; i < listeningToOnce.length; i++) {
        const lt = listeningToOnce[i];
        if (lt.obj === obj) {
          if ((lt.ev === ev) && (lt.callback === callback)) { idx = i; }
        }
      }
      obj.unbind(ev, handler);
      if (idx !== -1) { listeningToOnce.splice(idx, 1); }
      return callback.apply(this, arguments);
    }));
    listeningToOnce.push({ obj, ev, callback, handler });
    return this;
  },

  stopListening(obj, events, callback) {
    let listeningTo; let lt;
    if (arguments.length === 0) {
      for (listeningTo of [this.listeningTo, this.listeningToOnce]) {
        if (!listeningTo) { continue; }
        for (lt of listeningTo) {
          lt.obj.unbind(lt.ev, lt.handler || lt.callback);
        }
      }
      this.listeningTo = undefined;
      this.listeningToOnce = undefined;
    } else if (obj) {
      for (listeningTo of [this.listeningTo, this.listeningToOnce]) {
        if (!listeningTo) { continue; }
        events = events ? events.split(' ') : [undefined];
        for (var ev of events) {
          for (let idx = listeningTo.length - 1; idx >= 0; idx--) {
            lt = listeningTo[idx];
            if (callback && ((lt.handler || lt.callback) !== callback)) { continue; }
            if ((!ev) || (ev === lt.ev)) {
              lt.obj.unbind(lt.ev, lt.handler || lt.callback);
              if (idx !== -1) { listeningTo.splice(idx, 1); }
            } else if (ev) {
              let evts = lt.ev.split(' ');
              if (evts.includes(ev)) {
                evts = (evts.filter((e) => e !== ev));
                lt.ev = $.trim(evts.join(' '));
                lt.obj.unbind(ev, lt.handler || lt.callback);
              }
            }
          }
        }
      }
    }
  },

  unbind(ev, callback) {
    if (arguments.length === 0) {
      this._callbacks = {};
      return this;
    }
    if (!ev) { return this; }
    const evs = ev.split(' ');
    for (const name of evs) {
      let list = this._callbacks && this._callbacks[name];
      if (!list) { continue; }
      if (!callback) {
        delete this._callbacks[name];
        continue;
      }
      for (let i = 0; i < list.length; i++) {
        const cb = list[i];
        if (cb === callback) {
          list = list.slice();
          list.splice(i, 1);
          this._callbacks[name] = list;
          break;
        }
      }
    }
    return this;
  }
};

Events.on = Events.bind;
Events.off = Events.unbind;

const Log = {
  trace: true,

  logPrefix: '(App)',

  log(...args) {
    if (!this.trace) { return; }
    if (this.logPrefix) { args.unshift(this.logPrefix); }
    console.log(...args);
    return this;
  }
};

const moduleKeywords = ['included', 'extended'];

class Module {
  static include(obj) {
    if (!obj) { throw new Error('include(obj) requires obj'); }
    for (const key in obj) {
      const value = obj[key];
      if (!moduleKeywords.includes(key)) {
        this.prototype[key] = value;
      }
    }
    obj.included && obj.included.apply(this);
    return this;
  }

  static extend(obj) {
    if (!obj) { throw new Error('extend(obj) requires obj'); }
    for (const key in obj) {
      const value = obj[key];
      if (!moduleKeywords.includes(key)) {
        this[key] = value;
      }
    }
    obj.extended && obj.extended.apply(this);
    return this;
  }

  static proxy(func) {
    return function () { return func.apply(this, arguments); }.bind(this);
  }

  constructor() {
    this.init && this.init(...arguments);
  }

  proxy(func) {
    return function () { return func.apply(this, arguments); }.bind(this);
  }
}

class Model extends Module {
  static initClass() {
    this.extend(Events);

    this.records     = [];
    this.irecords    = {};
    this.attributes  = [];

    this.idCounter = 0;
  }

  static configure(name, ...attributes) {
    this.className = name;
    this.deleteAll();
    if (attributes.length) { this.attributes = attributes; }
    if (this.attributes) { this.attributes = makeArray(this.attributes); }
    if (!this.attributes) { this.attributes = []; }
    this.unbind();
    return this;
  }

  static toString() { return `${this.className}(${this.attributes.join(", ")})`; }

  static find(id, notFound) {
    if (notFound == null) { ({ notFound } = this); }
    return (this.irecords[id] && this.irecords[id].clone()) || (notFound && notFound(id));
  }

  static findAll(ids, notFound) {
    const result = [];
    for (const id of ids) {
      if (this.find(id, notFound)) {
        result.push(this.find(id));
      }
    }
    return result;
  }

  static notFound(id) { return null; }

  static exists(id) { return Boolean(this.irecords[id]); }

  static addRecord(record, options = {}) {
    if (record.id && this.irecords[record.id]) {
      this.irecords[record.id].remove(options);
      if (!options.clear) { record = this.irecords[record.id].load(record); }
    }
    if (!record.id) { record.id = record.cid; }
    if (this.irecords[record.id] == null) {  this.irecords[record.id] = record; }
    if (this.irecords[record.cid] == null) { this.irecords[record.cid] = record; }
    return this.records.push(record);
  }

  static refresh(values, options = {}) {
    if (options.clear) { this.deleteAll(); }

    let records = this.fromJSON(values);
    if (!isArray(records)) { records = [records]; }
    for (const record of records) { this.addRecord(record, options); }
    this.sort();

    const result = this.cloneArray(records);
    this.trigger('refresh', result, options);
    return result;
  }

  static select(callback) {
    const result = [];
    for (const record of this.records) {
      if (callback(record)) {
        result.push(record.clone());
      }
    }
    return result;
  }

  static findByAttribute(name, value) {
    for (const record of this.records) {
      if (record[name] === value) {
        return record.clone();
      }
    }
    return null;
  }

  static findAllByAttribute(name, value) {
    return this.select((item) => item[name] === value);
  }

  static each(callback) {
    return this.records.map((record) => callback(record.clone()));
  }

  static all() {
    return this.cloneArray(this.records);
  }

  static slice(begin, end) {
    if (begin == null) { begin = 0; }
    return this.cloneArray(this.records.slice(begin, end));
  }

  static first(end = 1) {
    if (end > 1) {
      return this.cloneArray(this.records.slice(0, end));
    } else {
      return this.records[0] && this.records[0].clone();
    }
  }

  static last(begin) {
    if (typeof begin === 'number') {
      return this.cloneArray(this.records.slice(-begin));
    } else {
      return this.records[this.records.length - 1] && this.records[this.records.length - 1].clone();
    }
  }

  static count() {
    return this.records.length;
  }

  static deleteAll() {
    this.records  = [];
    return this.irecords = {};
  }

  static destroyAll(options) {
    return this.records.map((record) => record.destroy(options));
  }

  static update(id, atts, options) {
    return this.find(id).updateAttributes(atts, options);
  }

  static create(atts, options) {
    const record = new (this)(atts);
    return record.save(options);
  }

  static destroy(id, options) {
    return this.find(id).destroy(options);
  }

  static change(callbackOrParams) {
    if (typeof callbackOrParams === 'function') {
      return this.bind('change', callbackOrParams);
    } else {
      return this.trigger('change', ...arguments);
    }
  }

  static fetch(callbackOrParams) {
    if (typeof callbackOrParams === 'function') {
      return this.bind('fetch', callbackOrParams);
    } else {
      return this.trigger('fetch', ...arguments);
    }
  }

  static toJSON() {
    return this.records;
  }

  static fromJSON(objects) {
    if (!objects) { return; }
    if (typeof objects === 'string') {
      objects = JSON.parse(objects);
    }
    if (isArray(objects)) {
      return objects.map((value) => (value instanceof this
        ? value
        :          new (this)(value)));
    } else {
      if (objects instanceof this) { return objects; }
      return new (this)(objects);
    }
  }

  static fromForm() {
    return (new this()).fromForm(...arguments);
  }

  static sort() {
    if (this.comparator) {
      this.records.sort(this.comparator);
    }
    return this;
  }

  // Private

  static cloneArray(array) {
    return (array.map((value) => value.clone()));
  }

  static uid(prefix = '') {
    let uid = prefix + this.idCounter++;
    if (this.exists(uid)) { uid = this.uid(prefix); }
    return uid;
  }

  // Instance

  constructor(atts) {
    super(...arguments);
    if ((this.constructor.uuid != null) && (typeof this.constructor.uuid === 'function')) {
      this.cid = this.constructor.uuid();
      if (!this.id) { this.id = this.cid; }
    } else {
      this.cid = atts && atts.cid || this.constructor.uid('c-');
    }
    if (atts) { this.load(atts); }
  }

  isNew() {
    return !this.exists();
  }

  isValid() {
    return !this.validate();
  }

  validate() {}

  load(atts) {
    if (atts.id) { this.id = atts.id; }
    for (const key in atts) {
      const value = atts[key];
      if (typeof this[key] === 'function') {
        if (typeof value === 'function') { continue; }
        this[key](value);
      } else {
        this[key] = value;
      }
    }
    return this;
  }

  attributes() {
    const result = {};
    for (const key of this.constructor.attributes) {
      if (key in this) {
        if (typeof this[key] === 'function') {
          result[key] = this[key]();
        } else {
          result[key] = this[key];
        }
      }
    }
    if (this.id) { result.id = this.id; }
    return result;
  }

  eql(rec) {
    return rec && (rec.constructor === this.constructor)
      && ((rec.cid === this.cid) || (rec.id && (rec.id === this.id)));
  }

  save(options = {}) {
    if (options.validate !== false) {
      const error = this.validate();
      if (error) {
        this.trigger('error', error);
        return false;
      }
    }

    this.trigger('beforeSave', options);
    const record = this.isNew() ? this.create(options) : this.update(options);
    this.stripCloneAttrs();
    this.trigger('save', options);
    return record;
  }

  stripCloneAttrs() {
    if (this.hasOwnProperty('cid')) { return; } // Make sure it's not the raw object
    for (const key of Object.keys(this || {})) {
      const value = this[key];
      if (this.constructor.attributes.includes(key)) { delete this[key]; }
    }
    return this;
  }

  updateAttribute(name, value, options) {
    const atts = {};
    atts[name] = value;
    return this.updateAttributes(atts, options);
  }

  updateAttributes(atts, options) {
    this.load(atts);
    return this.save(options);
  }

  changeID(id) {
    if (id === this.id) { return; }
    const records = this.constructor.irecords;
    records[id] = records[this.id];
    if (this.cid !== this.id) { delete records[this.id]; }
    this.id = id;
    return this.save();
  }

  remove(options = {}) {
    // Remove record from model
    const records = this.constructor.records.slice(0);
    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      if (this.eql(record)) {
        records.splice(i, 1);
        break;
      }
    }
    this.constructor.records = records;
    if (options.clear) {
      // Remove the ID and CID indexes
      delete this.constructor.irecords[this.id];
      return delete this.constructor.irecords[this.cid];
    }
  }

  destroy(options = {}) {
    if (options.clear == null) { options.clear = true; }
    this.trigger('beforeDestroy', options);
    this.remove(options);
    this.destroyed = true;
    // handle events
    this.trigger('destroy', options);
    this.trigger('change', 'destroy', options);
    if (this.listeningTo) {
      this.stopListening();
    }
    this.unbind();
    return this;
  }

  dup(newRecord) {
    if (newRecord == null) { newRecord = true; }
    const atts = this.attributes();
    if (newRecord) {
      delete atts.id;
    } else {
      atts.cid = this.cid;
    }
    return new this.constructor(atts);
  }

  clone() {
    return createObject(this);
  }

  reload() {
    if (this.isNew()) { return this; }
    const original = this.constructor.find(this.id);
    this.load(original.attributes());
    return original;
  }

  refresh(data) {
    // go to the source and load attributes
    const root = this.constructor.irecords[this.id];
    root.load(data);
    this.trigger('refresh');
    return this;
  }

  toJSON() {
    return this.attributes();
  }

  toString() {
    return `<${this.constructor.className} (${JSON.stringify(this)})>`;
  }

  fromForm(form) {
    let name;
    const result = {};

    for (var checkbox of $(form).find('[type=checkbox]:not([value])').toArray()) {
      result[checkbox.name] = $(checkbox).prop('checked');
    }

    for (checkbox of $(form).find('[type=checkbox][name$="[]"]').toArray()) {
      name = checkbox.name.replace(/\[\]$/, '');
      if (!result[name]) { result[name] = []; }
      if ($(checkbox).prop('checked')) { result[name].push(checkbox.value); }
    }

    for (const key of $(form).serializeArray()) {
      if (!result[key.name]) { result[key.name] = key.value; }
    }

    return this.load(result);
  }

  exists() {
    return this.constructor.exists(this.id);
  }

  // Private

  update(options) {
    this.trigger('beforeUpdate', options);

    const records = this.constructor.irecords;
    records[this.id].load(this.attributes());

    this.constructor.sort();

    const clone = records[this.id].clone();
    clone.trigger('update', options);
    clone.trigger('change', 'update', options);
    return clone;
  }

  create(options) {
    this.trigger('beforeCreate', options);
    if (!this.id) { this.id = this.cid; }

    const record = this.dup(false);
    this.constructor.addRecord(record);
    this.constructor.sort();

    const clone        = record.clone();
    clone.trigger('create', options);
    clone.trigger('change', 'create', options);
    return clone;
  }

  bind(events, callback) {
    let binder;
    this.constructor.bind(events, (binder = function (record) {
      if (record && this.eql(record)) {
        return callback.apply(this, arguments);
      }
    }.bind(this)));
    // create a wrapper function to be called with 'unbind' for each event
    for (const singleEvent of events.split(' ')) {
      ((singleEvent) => {
        let unbinder;
        return this.constructor.bind("unbind", (unbinder = (record, event, cb) => {
          if (record && this.eql(record)) {
            if (event && (event !== singleEvent)) { return; }
            if (cb && (cb !== callback)) { return; }
            this.constructor.unbind(singleEvent, binder);
            return this.constructor.unbind("unbind", unbinder);
          }
        }));
      })(singleEvent);
    }
    return this;
  }

  one(events, callback) {
    let handler;
    return this.bind(events, (handler = function () {
      this.unbind(events, handler);
      return callback.apply(this, arguments);
    }.bind(this)));
  }

  trigger(...args) {
    args.splice(1, 0, this);
    return this.constructor.trigger(...args);
  }

  listenTo() { return Events.listenTo.apply(this, arguments); }

  listenToOnce() { return Events.listenToOnce.apply(this, arguments); }

  stopListening() { return Events.stopListening.apply(this, arguments); }

  unbind(events, callback) {
    if (arguments.length === 0) {
      return this.trigger('unbind');
    } else if (events) {
      return events.split(' ').map((event) => this.trigger('unbind', event, callback));
    }
  }
}
Model.initClass();

Model.prototype.on = Model.prototype.bind;
Model.prototype.off = Model.prototype.unbind;

class Controller extends Module {
  static initClass() {
    this.include(Events);
    this.include(Log);

    this.prototype.eventSplitter = /^(\S+)\s*(.*)$/;
    this.prototype.tag = 'div';
  }

  constructor(options) {
    super(options);

    this.release = this.release.bind(this);
    this.options = options;

    for (const key in this.options) {
      const value = this.options[key];
      this[key] = value;
    }

    if (!this.el) { this.el = document.createElement(this.tag); }
    this.el  = $(this.el);
    this.$el = this.el;

    if (this.className) { this.el.addClass(this.className); }
    if (this.attributes) { this.el.attr(this.attributes); }

    if (!this.events) { this.events = this.constructor.events; }
    if (!this.elements) { this.elements = this.constructor.elements; }

    let context = this;
    let parentPrototype;

    while (parentPrototype = context.constructor.__super__) {
      if (parentPrototype.events) { this.events = $.extend({}, parentPrototype.events, this.events); }
      if (parentPrototype.elements) { this.elements = $.extend({}, parentPrototype.elements, this.elements); }
      context = parentPrototype;
    }

    if (this.events) { this.delegateEvents(this.events); }
    if (this.elements) { this.refreshElements(); }
  }

  release() {
    this.trigger('release', this);
    // no need to unDelegateEvents since remove will end up handling that
    this.el.remove();
    this.unbind();
    return this.stopListening();
  }

  $(selector) { return $(selector, this.el); }

  delegateEvents(events) {
    for (const key in events) {
      let method = events[key];
      if (typeof (method) === 'function') {
        // Always return true from event handlers
        method = ((method) => function () {
          method.apply(this, arguments);
          return true;
        }.bind(this))(method);
      } else {
        if (!this[method]) {
          throw new Error(`${method} doesn't exist`);
        }

        method = ((method) => function () {
          this[method].apply(this, arguments);
          return true;
        }.bind(this))(method);
      }

      const match      = key.match(this.eventSplitter);
      const eventName  = match[1];
      const selector   = match[2];

      if (selector === '') {
        this.el.bind(eventName, method);
      } else {
        this.el.on(eventName, selector, method);
      }
    }
  }

  refreshElements() {
    for (const key in this.elements) {
      const value = this.elements[key];
      this[value] = this.$(key);
    }
  }

  delay(func, timeout) {
    return setTimeout(this.proxy(func), timeout || 0);
  }

  // keep controllers elements obj in sync with it contents

  html(element) {
    this.el.html(element.el || element);
    this.refreshElements();
    return this.el;
  }

  append(...elements) {
    elements = (elements.map((e) => e.el || e));
    this.el.append(...elements);
    this.refreshElements();
    return this.el;
  }

  appendTo(element) {
    this.el.appendTo(element.el || element);
    this.refreshElements();
    return this.el;
  }

  prepend(...elements) {
    elements = (elements.map((e) => e.el || e));
    this.el.prepend(...elements);
    this.refreshElements();
    return this.el;
  }

  replace(element) {
    let previous;
    element = element.el || element;
    if (typeof element === "string") { element = $.trim(element); }
    // parseHTML is incompatible with Zepto
    const html = $.parseHTML(element);
    [previous, this.el] = [this.el, $((html && html[0]) || element)];
    previous.replaceWith(this.el);
    this.delegateEvents(this.events);
    this.refreshElements();
    return this.el;
  }
}
Controller.initClass();

// Utilities & Shims

var $ = typeof window !== "undefined" && (window.jQuery || window.Zepto) || function (element) {
  return element;
};

var createObject = Object.create || function (o) {
  const Func = function () {};
  Func.prototype = o;
  return new Func();
};

var isArray = (value) => Object.prototype.toString.call(value) === '[object Array]';

const isBlank = function (value) {
  if (!value) { return true; }
  for (const key in value) { return false; }
  return true;
};

var makeArray = (args) => Array.prototype.slice.call(args, 0);

// Globals

const Spine = (this.Spine   = {});
module.exports  = Spine;

Spine.version    = '1.3.2';
Spine.isArray    = isArray;
Spine.isBlank    = isBlank;
Spine.$          = $;
Spine.Events     = Events;
Spine.Log        = Log;
Spine.Module     = Module;
Spine.Controller = Controller;
Spine.Model      = Model;

// Global events

Module.extend.call(Spine, Events);

// JavaScript compatability

Model.sub = function (instances, statics) {
  class Result extends this {}
  if (instances) { Result.include(instances); }
  if (statics) { Result.extend(statics); }
  Result.unbind && Result.unbind();
  return Result;
};

Module.create = (Module.sub = (Controller.create = (Controller.sub = Model.sub)));

Model.setup = function (name, attributes) {
  if (attributes == null) { attributes = []; }
  class Instance extends this {}
  Instance.configure(name, ...attributes);
  return Instance;
};

Spine.Class = Module;
