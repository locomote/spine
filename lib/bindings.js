const BindingsClass = {

  model: 'model',

  bindings: {}
};

class ValueSetter {
  constructor(context) {
    this.context = context;
  }

  setValue(element, value, setter) {
    if (typeof setter === 'string') {
      setter = this.context.proxy(this.context[setter]);
    }
    if (!setter) {
      setter = (e, v) => {
        this._standardSetter(e, v);
      };
    }
    setter(element, value);
  }

  getValue(element, getter) {
    if (typeof getter === 'string') {
      getter = this.context.proxy(this.context[getter]);
    }
    if (!getter) { getter = (e, v) => { return this._standardGetter(e, v); }; }
    return getter(element);
  }

  _standardGetter(element) {
    const self = this;
    const fn = self[`_${element.attr("type")}Get`];

    if (fn) {
      return fn(element);
    } else {
      return element.val();
    }
  }

  _standardSetter(element, value) {
    const self = this;
    element.each(function () {
      const el = $(this);
      const fn = self[`_${el.attr("type")}Set`];
      if (fn) {
        fn(el, value);
      } else {
        el.val(value);
      }
    });
  }

  _checkboxSet(element, value) {
    if (value) {
      element.prop("checked", "checked");
    } else {
      element.prop("checked", "");
    }
  }

  _checkboxGet(element) {
    return element.is(":checked");
  }
}

const BindingsInstance = {

  getModel() {
    return this[this.modelVar];
  },

  setModel(model) {
    this[this.modelVar] = model;
  },

  walkBindings(fn) {
    for (const selector in this.bindings) {
      const field = this.bindings[selector];
      fn(selector, field);
    }
  },

  applyBindings() {
    this.valueSetter = new ValueSetter(this);
    this.walkBindings((selector, field) => {
      if (!field.direction || (field.direction === 'model')) {
        this._bindModelToEl(this.getModel(), field, selector);
      }
      if (!field.direction || (field.direction === 'element')) {
        this._bindElToModel(this.getModel(), field, selector);
      }
    });
  },

  _getField(value) {
    if (typeof value === 'string') {
      return value;
    } else {
      return value.field;
    }
  },

  _forceModelBindings(model) {
    this.walkBindings((selector, field) => {
      this.valueSetter.setValue(this.$(selector), model[this._getField(field)], field.setter);
    });
  },

  changeBindingSource(model) {
    this.getModel().unbind('change');
    this.walkBindings((selector) => {
      if (selector === 'self') { selector = false; }
      this.el.off('change', selector);
    });
    this.setModel(model);
    this._forceModelBindings(model);
    this.applyBindings();
  },

  _bindModelToEl(model, field, selector) {
    const self = this;
    if (selector === 'self') { selector = false; }
    this.el.on('change', selector, function () {
      model[self._getField(field)] = self.valueSetter.getValue($(this), field.getter);
    });
  },

  _bindElToModel(model, field, selector) {
    model.bind('change', () => {
      this.valueSetter.setValue(this.$(selector), model[this._getField(field)], field.setter);
    });
  }
};

Spine.Bindings = {
  extended() {
    this.extend(BindingsClass);
    this.include(BindingsInstance);
  }
};
