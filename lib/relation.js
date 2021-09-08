const Spine   = require('./spine');

const { isArray } = Spine;

class Collection extends Spine.Module {
  constructor(options = {}) {
    super(...arguments);
    for (const key in options) {
      const value = options[key];
      this[key] = value;
    }
  }

  all() {
    return this.model.select((rec) => { return this.associated(rec); });
  }

  first() {
    return this.all()[0];
  }

  last() {
    const values = this.all();
    return values[values.length - 1];
  }

  count() {
    return this.all().length;
  }

  find(id, notFound) {
    if (notFound == null) { ({ notFound } = this.model); }
    const records = this.select((rec) => {
      return `${rec.id}` === `${id}`;
    });
    return records[0] || (notFound && notFound(id));
  }

  findAllByAttribute(name, value) {
    return this.model.select((rec) => {
      return this.associated(rec) && (rec[name] === value);
    });
  }

  findByAttribute(name, value) {
    return this.findAllByAttribute(name, value)[0];
  }

  select(cb) {
    return this.model.select((rec) => {
      return this.associated(rec) && cb(rec);
    });
  }

  refresh(values) {
    if (values == null) { return this; }
    for (var record of this.all()) {
      delete this.model.irecords[record.id];
      for (let i = 0; i < this.model.records.length; i++) {
        const match = this.model.records[i];
        if (match.id === record.id) {
          this.model.records.splice(i, 1);
          break;
        }
      }
    }
    if (!isArray(values)) { values = [values]; }
    for (record of values) {
      record.newRecord = false;
      record[this.fkey] = this.record.id;
    }
    this.model.refresh(values);
    return this;
  }

  create(record, options) {
    record[this.fkey] = this.record.id;
    return this.model.create(record, options);
  }

  add(record, options) {
    return record.updateAttribute(this.fkey, this.record.id, options);
  }

  remove(record, options) {
    return record.updateAttribute(this.fkey, null, options);
  }

  // Private

  associated(record) {
    return record[this.fkey] === this.record.id;
  }
}

class Instance extends Spine.Module {
  constructor(options = {}) {
    super(...arguments);
    for (const key in options) {
      const value = options[key];
      this[key] = value;
    }
  }

  exists() {
    if (this.record[this.fkey]) { return this.model.exists(this.record[this.fkey]); } else { return false; }
  }

  find() {
    return this.model.find(this.record[this.fkey]);
  }

  update(value) {
    if (value == null) { return this; }
    if (!(value instanceof this.model)) {
      value = new this.model(value);
    }
    if (value.isNew()) { value.save(); }
    this.record[this.fkey] = value && value.id;
    return this;
  }
}

class Singleton extends Spine.Module {
  constructor(options = {}) {
    super(...arguments);
    for (const key in options) {
      const value = options[key];
      this[key] = value;
    }
  }

  find() {
    return this.record.id && this.model.findByAttribute(this.fkey, this.record.id);
  }

  update(value) {
    if (value == null) { return this; }
    if (!(value instanceof this.model)) {
      value = this.model.fromJSON(value);
    }

    value[this.fkey] = this.record.id;
    value.save();
    return this;
  }
}

const singularize = (str) => str.replace(/s$/, '');

const underscore = (str) => str.replace(/::/g, '/')
  .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
  .replace(/([a-z\d])([A-Z])/g, '$1_$2')
  .replace(/-/g, '_')
  .toLowerCase();
const requireModel = function (model) {
  if (typeof model === 'string') {
    return require(model) || eval(model);
  } else {
    return model;
  }
};

const association = function (name, model, record, fkey, Ctor) {
  if (typeof model === 'string') { model = requireModel(model); }
  return new Ctor({ name, model, record, fkey });
};

Spine.Model.extend({
  hasMany(name, model, fkey) {
    if (fkey == null) { fkey = `${underscore(this.className)}_id`; }
    this.prototype[name] = function (value) {
      return association(name, model, this, fkey, Collection).refresh(value);
    };
  },

  belongsTo(name, model, fkey) {
    if (fkey == null) { fkey = `${underscore(singularize(name))}_id`; }
    this.prototype[name] = function (value) {
      return association(name, model, this, fkey, Instance).update(value).find();
    };
    this.attributes.push(fkey);
  },

  hasOne(name, model, fkey) {
    if (fkey == null) { fkey = `${underscore(this.className)}_id`; }
    this.prototype[name] = function (value) {
      return association(name, model, this, fkey, Singleton).update(value).find();
    };
  }
});

Spine.Collection = Collection;
Spine.Singleton = Singleton;
Spine.Instance = Instance;
