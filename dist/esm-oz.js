import { NodeFactory, Stringifier, Parser } from 'shady-css-parser';
import pathToRegexp, { compile } from 'path-to-regexp';

const placeholderMinRangeChar = '';
const placeholderMinRangeCode = placeholderMinRangeChar.charCodeAt();
const placeholderMaxRangeChar = '';
const placeholderRegex = new RegExp(`[${placeholderMinRangeChar}-${placeholderMaxRangeChar}]`, 'umg'); // /[-]/umg

const singlePlaceholderRegex = new RegExp(placeholderRegex, 'um');
const placeholder = (n = 0) => String.fromCodePoint(placeholderMinRangeCode + n);
const charToN = str => str.codePointAt() - placeholderMinRangeCode;
const toPlaceholdersNumber = str => (str.match(placeholderRegex) || []).map(i => charToN(i));
const toPlaceholderString = (str, placeholders = toPlaceholdersNumber(str)) => values => placeholders.reduce((str, i) => str.replace(placeholder(i), values[i]), str);
const replace = (arrayFragment, ...vals) => arrayFragment.splice(0, arrayFragment.length, ...vals);

var makeComment = (({
  placeholderMetadata,
  arrayFragment,
  getResult = toPlaceholderString(placeholderMetadata.values[0])
}) => ({
  values,
  forceUpdate
}) => arrayFragment[0].data = getResult(values));

const getDependentsPlaceholders = ({
  template,
  placeholdersMetadata,
  ids,
  self
}) => placeholdersMetadata.filter(placeholderMetadata => placeholderMetadata.ids.some(id => ids.includes(id))).map(placeholderMetadata => template.placeholders.find(({
  metadata
}) => metadata === placeholderMetadata)).filter(placeholder$$1 => placeholder$$1 !== self);

const eventRegexes = [/^@/, /^on-/];

const removeEventListeners = (element, event, listeners) => listeners.forEach(listener => element.removeEventListener(event, listener));

const makeElement = ({
  template,
  template: {
    placeholdersMetadata
  },
  placeholderMetadata,
  placeholderMetadata: {
    type,
    ids,
    values: [_tagName],
    tagName = _tagName ? toPlaceholderString(_tagName) : undefined,
    values: [__attributeName, _doubleQuoteValue, _singleQuoteValue, unquotedValue],
    toAttributeName = __attributeName ? toPlaceholderString(__attributeName) : undefined,
    toDoubleQuoteValue = _doubleQuoteValue ? toPlaceholderString(_doubleQuoteValue) : undefined,
    toSingleQuoteValue = _singleQuoteValue ? toPlaceholderString(_singleQuoteValue) : undefined
  },
  arrayFragment,
  dependents,
  _attributeName = toAttributeName(template.values),
  _value,
  _eventName,
  _eventListeners
}) => {
  for (const id of ids) arrayFragment[0].removeAttribute(placeholder(id));

  const self = ({
    values,
    forceUpdate,
    element = arrayFragment[0]
  }) => {
    if (!dependents) dependents = getDependentsPlaceholders({
      template,
      placeholdersMetadata,
      ids,
      self
    });

    if (type === 'startTag') {
      const newElement = document.createElement(tagName(values));

      for (const placeholder$$1 of dependents) placeholder$$1({
        values,
        forceUpdate: true
      });

      replace(arrayFragment, newElement);
    } else if (type === 'attribute') {
      const attributeName = toAttributeName(values);

      if (unquotedValue) {
        const placeholdersNumber = toPlaceholdersNumber(unquotedValue);
        const eventTest = eventRegexes.find(regex => attributeName.match(regex));

        if (eventTest) {
          if (!_eventListeners) _eventListeners = [];
          const listeners = placeholdersNumber.map(n => values[n]).filter(v => typeof v === 'function');
          const newListeners = listeners.filter(listener => !_eventListeners.includes(listener));
          const eventName = attributeName.replace(eventTest, '');
          removeEventListeners(element, _eventName, _eventListeners.filter(listener => !listeners.includes(listener)));

          for (const listener of newListeners) element.addEventListener(eventName, listener);

          _eventName = eventName;
          _eventListeners = listeners;
        } else {
          if (_eventListeners) removeEventListeners(element, _attributeName, _eventListeners);
          _eventListeners = undefined;
          element[attributeName] = values[placeholdersNumber[0]];
        }
      } else {
        if (attributeName !== _attributeName && element.hasAttribute(_attributeName)) element.removeAttribute(_attributeName);

        const value = (toDoubleQuoteValue || toSingleQuoteValue || (_ => undefined))(values);

        if (attributeName) element.setAttribute(attributeName, value.trim() || '');
        _value = value;
      }

      _attributeName = attributeName;
    }
  };

  return self;
};

const OzHTMLTemplate = Symbol.for('OzHTMLTemplate');

const makeText = ({
  template,
  placeholderMetadata,
  arrayFragment,
  _value,
  _placeholders,
  _fragments,
  _arrayFragment
}) => ({
  values,
  value = values[placeholderMetadata.ids[0]],
  forceUpdate
}) => {
  const type = typeof value;

  if (value && type === 'object') {
    if (value instanceof Promise) {
      if (value.$resolved) {
        makeText({
          template,
          placeholderMetadata,
          arrayFragment
        })({
          value: value.$resolvedValue
        });
      } else {
        replace(arrayFragment, new Text());
        value.then(resolvedValue => _value === value ? template.update(...template.values.map((_, i) => i === placeholderMetadata.ids[0] ? resolvedValue : _)) : undefined);
      }
    } else if (value && value[OzHTMLTemplate]) {
      // if (_value.) todo: update the current template if its the same id
      replace(arrayFragment, value.childNodes);
    } else if (Array.isArray(value)) {
      const values = value;
      const [placeholders, fragments] = values.reduce(tuple => void tuple[0].push(makeText({
        template,
        placeholderMetadata,
        arrayFragment: tuple[1][tuple[1].push([]) - 1]
      })) || tuple, [[], []]);
      placeholders.forEach((placeholder$$1, i) => placeholder$$1({
        value: value[i]
      }));
      replace(arrayFragment, fragments);
      _placeholders = placeholders;
      _fragments = fragments;
    } else if (value instanceof Node) {
      replace(arrayFragment, value);
    }
  } else if (type === 'function') {
    if (value.prototype instanceof Node) {
      const Constructor = value;
      if (arrayFragment[0] instanceof Constructor) replace(arrayFragment, arrayFragment[0]);else replace(arrayFragment, new Constructor());
    } else {
      makeText({
        template,
        placeholderMetadata,
        arrayFragment
      })({
        value: value(arrayFragment)
      });
    }
  } else {
    replace(arrayFragment, new Text(type === 'symbol' ? value.toString() : value));
  }

  if (!arrayFragment.flat(Infinity).length) replace(arrayFragment, new Comment());
  _value = value;
  _arrayFragment = arrayFragment.flat(Infinity);
};

const replaceNodes = (oldNodes, newNodes) => {
  for (const i in newNodes) {
    // `oldNode` can be undefined if the number of
    // new nodes is larger than the number of old nodes
    const oldNode = oldNodes[i];
    const newNode = newNodes[i];

    if (oldNode !== newNode) {
      if (oldNode) {
        oldNode.parentNode.insertBefore(newNode, oldNode);
        if (newNodes[i + 1] !== oldNode) oldNode.remove();
      } else {
        // Will place the new node after the previous newly placed new node
        const previousNewNode = newNodes[i - 1];
        const {
          parentNode
        } = previousNewNode;
        parentNode.insertBefore(newNode, previousNewNode.nextSibling);
        if (oldNode) oldNode.remove();
      }
    }
  }

  for (const node of oldNodes.filter(node => !newNodes.includes(node))) node.remove();
};
const getNodePath = (node, path = [], {
  parentNode: parent
} = node) => parent ? getNodePath(parent, path.concat(Array.from(parent.childNodes).indexOf(node))) : path.reverse();
const walkPlaceholders = ({
  html,
  element: element$$1,
  text: text$$1,
  comment: comment$$1
}) => {
  const template = document.createElement('template');
  template.innerHTML = html;
  const walker = document.createTreeWalker(template.content, (element$$1 ? NodeFilter.SHOW_ELEMENT : 0) + (comment$$1 ? NodeFilter.SHOW_COMMENT : 0) + (text$$1 ? NodeFilter.SHOW_TEXT : 0), {
    acceptNode: ({
      nodeType,
      outerHTML,
      innerHTML,
      data
    }) => nodeType === Node.ELEMENT_NODE ? outerHTML.replace(innerHTML, '').match(placeholderRegex) ? NodeFilter.FILTER_ACCEPT : innerHTML.match(placeholderRegex) ? NodeFilter.FILTER_SKIP : NodeFilter.FILTER_REJECT : (nodeType === Node.TEXT_NODE || nodeType === Node.COMMENT_NODE) && data.match(placeholderRegex) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT
  });

  while (walker.nextNode()) {
    const {
      currentNode,
      currentNode: {
        nodeType
      }
    } = walker;
    if (nodeType === Node.ELEMENT_NODE) element$$1(currentNode);else if (nodeType === Node.TEXT_NODE) text$$1(currentNode);else if (nodeType === Node.COMMENT_NODE) comment$$1(currentNode);
  }

  return template.content;
};
const placeholdersMetadataToPlaceholders = ({
  template,
  placeholdersMetadata,
  fragment
}) => {
  const childNodes = Array.from(fragment.childNodes);
  const placeholders = [];

  for (const i in placeholdersMetadata) {
    const placeholderMetadata = placeholdersMetadata[i];
    const {
      type,
      path,
      ids
    } = placeholderMetadata;
    if (type === 'endTag') continue;
    const node = type === 'startTag' || type === 'attribute' ? fragment.querySelector(`[${placeholder(ids[0])}]`) : path.reduce((node, nodeIndex) => node.childNodes[nodeIndex], fragment);
    const arrayFragment = [node];
    if (childNodes.includes(node)) childNodes.splice(childNodes.indexOf(node), 1, arrayFragment);
    let placeholder$$1 = (type === 'text' ? makeText : type === 'comment' ? makeComment : makeElement
    /* type === 'startTag' || type === 'attribute' */
    )({
      template,
      placeholderMetadata,
      arrayFragment
    });
    placeholder$$1.metadata = placeholderMetadata;
    placeholder$$1.arrayFragment = arrayFragment;
    placeholders.push(placeholder$$1);
  }

  return {
    childNodes,
    placeholders
  };
};

const attribute = /^\s*([^\s"'<>/=]+)(?:\s*(=)\s*(?:"([^"]*)"+|'([^']*)'+|([^\s"'=<>`]+)))?/;
const ncname = '[a-zA-Z_-][-\\w\\-\\.]*';
const qnameCapture = `((?:${ncname}\\:)?${ncname})`;
const startTagOpen = new RegExp(`^<${qnameCapture}`);
const startTagClose = /^\s*(\/?)>/;
const endTag = new RegExp(`^<\\/(${qnameCapture}[^>]*)>`);
const textRegex = new RegExp(`([${placeholderMinRangeChar}-${placeholderMaxRangeChar}])|([^${placeholderMinRangeChar}-${placeholderMaxRangeChar}]*)`, 'umg');

const getCharacterDataNodePath = placeholders => node => {
  const match = node.data.match(new RegExp(placeholderRegex, 'um'));

  if (match) {
    const isTextNode = node.nodeType === Node.TEXT_NODE;
    const placeholderNode = isTextNode ? node.splitText(match.index) : node;

    if (isTextNode) {
      placeholderNode.data = placeholderNode.data.substring(match[0].length);
      if (placeholderNode.data.length) placeholderNode.splitText(0);
    }

    placeholders[charToN(match[0])].path = getNodePath(placeholderNode);
  }
};

var parse = (({
  transform,
  strings,
  values
}) => {
  let source = transform(strings.reduce((str, str2, i) => str + placeholder(i - 1) + str2));
  let html = '';
  const placeholders = [];

  const advance = (n, type, ...vals) => {
    let replacement = '';
    let placeholder$$1;

    if (type) {
      placeholder$$1 = {
        type,
        ids: vals.filter(_ => _).map(val => (val.match(placeholderRegex) || []).map(char => charToN(char))).flat(Infinity),
        values: vals,
        path: []
      };
      let {
        ids
      } = placeholder$$1;

      if (ids.length) {
        ids.forEach(_ => placeholders.push(placeholder$$1));

        if (type === 'startTag' || type === 'endTag') {
          replacement = toPlaceholderString(vals[0])(values) + (type === 'startTag' ? ` ${placeholder(ids[0])}` : '');
        } else if (type === 'attribute' || type === 'comment') {
          replacement = `${type === 'attribute' ? ' ' : ''}${placeholder(ids[0])}`;
        }
      }
    }

    html += replacement || source.substr(0, n);
    source = source.substring(n);
    return placeholder$$1;
  };

  while (source) {
    // eslint-disable-line no-unmodified-loop-condition
    const textEnd = source.indexOf('<');

    if (textEnd === 0) {
      if (source.startsWith('<!--')) {
        // Comment
        const commentEnd = source.indexOf('-->');

        if (commentEnd === -1) {
          advance(4);
          advance(source.length - 1, 'comment', source);
          continue;
        }

        advance(4);
        advance(commentEnd - 4, 'comment', source.substr(0, commentEnd - 4));
        advance(3);
        continue;
      }

      const endTagMatch = source.match(endTag);

      if (endTagMatch) {
        // End tag
        advance(endTagMatch[0].length, 'endTag', source.substr(0, endTagMatch[0].length));
        continue;
      }

      const startTagMatch = source.match(startTagOpen);

      if (startTagMatch) {
        // Start tag
        advance(1);
        const placeholder$$1 = advance(startTagMatch[1].length, 'startTag', startTagMatch[1]);
        let attributes = [];
        let end, attr;

        while (!(end = source.match(startTagClose)) && (attr = source.match(attribute))) {
          const attrPlaceholder = advance(attr[0].length, 'attribute', attr[1], attr[3], attr[4], attr[5]);
          attrPlaceholder.dependents = attributes;
          attributes.push(attrPlaceholder);
        }

        attributes = attributes.filter(item => item);
        placeholder$$1.dependents = attributes;

        if (end) {
          advance(end[0].length);
          continue;
        }
      }
    }

    for (const str of source.substring(0, textEnd !== -1 ? textEnd : textEnd.length).match(textRegex)) advance(str.length, 'text', str);
  }

  return {
    fragment: walkPlaceholders({
      html,
      text: getCharacterDataNodePath(placeholders),
      comment: getCharacterDataNodePath(placeholders)
    }),
    placeholdersMetadata: placeholders
  };
});

class OzHTMLTemplate$1 extends HTMLTemplateElement {
  constructor({
    templateId,
    originalFragment,
    values,
    placeholdersMetadata
  }) {
    super();
    this.templateId = templateId;
    this.values = values;
    this.placeholdersMetadata = placeholdersMetadata;
    this.originalFragment = originalFragment;
    this.setAttribute('is', 'oz-html-template');
  }

  get [OzHTMLTemplate]() {
    return true;
  }

  init(isUpdate) {
    if (this.placeholders) return;
    const fragment = this.originalFragment.cloneNode(true);
    const {
      placeholders,
      childNodes
    } = placeholdersMetadataToPlaceholders({
      template: this,
      placeholdersMetadata: this.placeholdersMetadata,
      fragment
    });
    this.placeholders = placeholders;
    this.content.appendChild(fragment);
    this._childNodes = childNodes;
    if (isUpdate) this.forceUpdate = true;else this.update(...this.values);
  }

  clone(values = this.values) {
    return new OzHTMLTemplate$1({
      originalFragment: this.originalFragment,
      values,
      placeholdersMetadata: this.placeholdersMetadata,
      templateId: this.templateId
    });
  }

  update(...values) {
    this.init(true);
    const oldArrayFragments = this.placeholders.map(({
      arrayFragment
    }) => arrayFragment.flat(Infinity));

    for (const placeholder of this.placeholders) placeholder({
      values,
      forceUpdate: this.forceUpdate
    });

    const newArrayFragments = this.placeholders.map(({
      arrayFragment
    }) => arrayFragment.flat(Infinity));

    for (const i in this.placeholders) replaceNodes(oldArrayFragments[i], newArrayFragments[i]);

    this.values = values;
    this.forceUpdate = false;
  }

  get childNodes() {
    this.init();
    return this._childNodes;
  }

  get content() {
    this.init();
    return super.content;
  }

  connectedCallback() {
    this.insertAfter();
  }

  insertNodesAfter() {
    this.init();

    for (const node of this.childNodes.flat(Infinity)) this.parentNode.insertBefore(node, this.nextSibling);
  }

  insertNodesToFragment() {
    this.init();

    for (const node of this.childNodes.flat(Infinity)) this.content.appendChild(node);
  }

  insertAfter() {
    this.init();
    this.parentNode.insertBefore(this.content, this.nextSibling);
  }

  disconnectedCallback() {
    this.insertNodesToFragment();
  }

}

customElements.get('oz-html-template') || customElements.define('oz-html-template', OzHTMLTemplate$1, {
  extends: 'template'
});
var createTemplate = (options => new OzHTMLTemplate$1(options));

const elements = new Map();
const HTMLTag = (transform = str => str) => (strings, ...values) => {
  const templateId = 'html' + strings.reduce((str, str2, i) => str + placeholder(i - 1) + str2);
  if (elements.has(templateId)) return elements.get(templateId).clone(values);
  const {
    fragment,
    placeholdersMetadata
  } = parse({
    transform,
    strings,
    values
  });
  elements.set(templateId, createTemplate({
    templateId,
    originalFragment: fragment,
    values,
    placeholdersMetadata
  }));
  return elements.get(templateId).clone(values);
};
const html = HTMLTag();

function _defineProperty(obj, key, value) {
  if (key in obj) {
    Object.defineProperty(obj, key, {
      value: value,
      enumerable: true,
      configurable: true,
      writable: true
    });
  } else {
    obj[key] = value;
  }

  return obj;
}

function _objectSpread(target) {
  for (var i = 1; i < arguments.length; i++) {
    var source = arguments[i] != null ? arguments[i] : {};
    var ownKeys = Object.keys(source);

    if (typeof Object.getOwnPropertySymbols === 'function') {
      ownKeys = ownKeys.concat(Object.getOwnPropertySymbols(source).filter(function (sym) {
        return Object.getOwnPropertyDescriptor(source, sym).enumerable;
      }));
    }

    ownKeys.forEach(function (key) {
      _defineProperty(target, key, source[key]);
    });
  }

  return target;
}

function _objectWithoutPropertiesLoose(source, excluded) {
  if (source == null) return {};
  var target = {};
  var sourceKeys = Object.keys(source);
  var key, i;

  for (i = 0; i < sourceKeys.length; i++) {
    key = sourceKeys[i];
    if (excluded.indexOf(key) >= 0) continue;
    target[key] = source[key];
  }

  return target;
}

function _objectWithoutProperties(source, excluded) {
  if (source == null) return {};

  var target = _objectWithoutPropertiesLoose(source, excluded);

  var key, i;

  if (Object.getOwnPropertySymbols) {
    var sourceSymbolKeys = Object.getOwnPropertySymbols(source);

    for (i = 0; i < sourceSymbolKeys.length; i++) {
      key = sourceSymbolKeys[i];
      if (excluded.indexOf(key) >= 0) continue;
      if (!Object.prototype.propertyIsEnumerable.call(source, key)) continue;
      target[key] = source[key];
    }
  }

  return target;
}

const globalRemovedIds = [];
const globalIds = [];

const makeUniqueId = (n = globalRemovedIds.length ? globalRemovedIds.shift() : (globalIds[globalIds.length - 1] === undefined ? -1 : 0) + 1) => {
  globalIds.splice(n, 0, n);
  return {
    id: n,
    match: undefined,
    strId: undefined,
    strAttrId: undefined,
    originalSelector: undefined,
    selector: undefined,
    nodeSelector: undefined,
    nodes: new Map(),
    unregister: _ => {
      globalRemovedIds.push(n);
      globalIds.splice(globalIds.indexOf(n), 1);
    }
  };
};

const watchedElements = new Map();
let measuringElement = document.createElement('div');
measuringElement.style.display = 'none';

const updateElement = (target, contentRect = target.getClientRects()) => {
  const containerQueries = watchedElements.get(target);
  target.parentNode.insertBefore(measuringElement, target);

  for (const containerQuery$$1 of containerQueries) {
    measuringElement.style.height = containerQuery$$1.match[3];
    const containerQueryPxValue = parseInt(window.getComputedStyle(measuringElement).height);
    const property = containerQuery$$1.match[2].endsWith('height') ? 'height' : containerQuery$$1.match[2].endsWith('width') ? 'width' : undefined;

    if (containerQuery$$1.match[2].startsWith('min') && contentRect[property] > containerQueryPxValue || containerQuery$$1.match[2].startsWith('max') && contentRect[property] < containerQueryPxValue) {
      target.setAttribute(containerQuery$$1.strId, '');
    } else {
      target.removeAttribute(containerQuery$$1.strId);
    }
  }

  measuringElement.remove();
  measuringElement.style.height = '';
};

const observed = new Map();
let resizeObserver = 'ResizeObserver' in window ? new ResizeObserver(entries => {
  for (let _ref of entries) {
    let {
      target,
      contentRect
    } = _ref;
    updateElement(target, contentRect);
  }
}) : {
  observe: elem => observed.set(elem, elem.getClientRects()),
  unobserve: elem => observed.delete(elem)
};

if (!'ResizeObserver' in window) {
  const test = _ => {
    for (const [entry, {
      height: _height,
      width: _width
    }] of watchedElements) {
      const bounds = entry.getClientRects();
      const {
        height,
        width
      } = bounds;

      if (height !== _height || width !== _width) {
        updateElement(entry, contentRect);
        observed.set(elem, bounds);
      }
    }

    window.requestAnimationFrame(test);
  };

  window.requestAnimationFrame(test);
}

const watchElement = (elem, containerQuery$$1) => {
  const _containerQueries = watchedElements.get(elem);

  const containerQueries = _containerQueries || [];
  containerQueries.push(containerQuery$$1);
  if (!_containerQueries) watchedElements.set(elem, containerQueries);
  resizeObserver.observe(elem);
  return _ => {
    containerQueries.splice(containerQueries.indexOf(containerQuery$$1), 1);
    if (!containerQueries.length) watchedElements.delete(elem);
    resizeObserver.unobserve(elem);

    for (const [node] of containerQuery$$1.nodes) node.removeAttribute(containerQuery$$1.strId);
  };
};

var makeStyle = (({
  placeholderMetadata,
  placeholderMetadata: {
    values: [_selector],
    rule: _rule
  },
  rules: [rule],
  placeholderIds = toPlaceholdersNumber(_selector)
}) => {
  const {
    ownerDocument
  } = rule.parentStyleSheet.ownerNode;
  const getResult = toPlaceholderString(placeholderMetadata.values[0]);

  let _containerQueries;

  const matchContainerQueriesNodes = _ => {
    for (const containerQuery$$1 of _containerQueries) {
      const matchedNodes = Array.from(ownerDocument.querySelectorAll(containerQuery$$1.nodeSelector));
      const containerQueryNodes = Array.from(containerQuery$$1.nodes.keys());
      containerQueryNodes.filter(node => !matchedNodes.includes(node)) // Removed nodes
      .forEach(node => {
        containerQuery$$1.nodes.get(node)(); // Unregister watcher

        containerQuery$$1.nodes.delete(node);
      });
      matchedNodes.filter(node => !containerQueryNodes.includes(node)) // Added nodes
      .forEach(node => containerQuery$$1.nodes.set(node, watchElement(node, containerQuery$$1)
      /* Register watcher */
      ));
    }
  };

  const mutationObserver = new MutationObserver(matchContainerQueriesNodes);
  let firstInit = false;

  let _values;

  return [({
    values,
    forceUpdate
  }) => {
    // Update
    if (!placeholderIds.length
    /* static container query */
    && placeholderIds.map((id, i) => values[i]).some((val, i) => {
      var _values2;

      return ((_values2 = _values) === null || _values2 === void 0 ? void 0 : _values2[i]) !== val;
    }) // used values changed
    && firstInit) return;
    const result = getResult(values);

    if (containerQueryRegex.test(result)) {
      mutationObserver.observe(ownerDocument, {
        subtree: true,
        childList: true,
        attributes: true
      });

      if (_containerQueries) {
        for (const containerQuery$$1 of _containerQueries) {
          containerQuery$$1.unregister();
        }

        _containerQueries = undefined;
      }

      const containerQueries = result // TODO: replace this ',' split by a regex to make it work with attributes selector containing a ','
      .split(',').filter(str => containerQueryRegex.test(str)).map((str, i) => {
        let containerQueries = [];
        let match;

        while (match = globalContainerQueryRegex.exec(str)) {
          const uniqueId = makeUniqueId();
          uniqueId.match = match;
          uniqueId.strId = containerQuery(uniqueId.id);
          uniqueId.strAttrId = containerQueryAttribute(uniqueId.id);
          containerQueries.push(uniqueId);
        }

        const selector = containerQueries.reduce((str, {
          strAttrId,
          match
        }) => str.replace(match[0], strAttrId), result);

        for (const containerQuery$$1 of containerQueries) {
          containerQuery$$1.originalSelector = str;
          containerQuery$$1.selector = selector;
          containerQuery$$1.nodeSelector = selector.slice(0, selector.indexOf(containerQuery$$1.strAttrId)).replace(globalContainerQueryAttributeRegex, '');
        }

        return containerQueries;
      }).flat(Infinity);
      const selector = containerQueries.reduce((str, {
        originalSelector,
        selector
      }) => str.replace(originalSelector, selector), result);
      rule.selectorText = selector;
      _containerQueries = containerQueries;
      matchContainerQueriesNodes();
    } else {

      if (_containerQueries) {
        for (const containerQuery$$1 of _containerQueries) {
          containerQuery$$1.unregister();
        }

        _containerQueries = undefined;
      }

      rule.selectorText = result;
    }

    _values = values;
    firstInit = true;
  }, _ => {
  }];
});

var makeStyleProperty = (({
  placeholderMetadata: {
    values,
    path
  },
  rules: [style],
  getNameResult = toPlaceholderString(values[0]),
  getValueResult = toPlaceholderString(values[1]),
  _name = `--${path[path.length - 1]}`
}) => ({
  values
}) => {
  style.removeProperty(_name);
  style.setProperty(_name = getNameResult(values), getValueResult(values));
});

const OzStyle = Symbol.for('OzStyle');

const makeStylesheet = ({
  placeholderMetadata: {
    rule: ast,
    ids
  },
  rules,
  getIndexOf = rule => Array.from(rules[0].parentStyleSheet.cssRules).indexOf(rule),
  getFirstIndex = _ => getIndexOf(rules[0]),
  getLastIndex = _ => getIndexOf(rules[rules.length - 1]),
  _value
}) => ({
  values,
  value = values[ids[0]],
  forceUpdate
}) => {
  if (value && typeof value === 'object' && OzStyle in value) {
    if (_value && typeof _value === 'object' && OzStyle in _value && _value.templateId === value.templateId) {
      _value.update(...value.values);

      replace(rules, ..._value.childRules);
    } else replace(rules, ...value.connectedCallback([ast], rules));
  }

  _value = value;
};

const containerQueryRegex = /:element\(((.*?)=(.*?))\)/;
const globalContainerQueryRegex = new RegExp(containerQueryRegex, 'g');
const containerQuery = i => `oz-container-query-${i}`;
const containerQueryAttribute = i => `[oz-container-query-${i}]`;
const containerQueryAttributeRegex = /\[oz-container-query-(\d)\]/;
const globalContainerQueryAttributeRegex = new RegExp(containerQueryAttributeRegex, 'g');
const replaceRules = (oldASTRules, oldRules, newASTRules, newRules = []) => {
  const stylesheet$$1 = oldRules[0].parentStyleSheet;
  const stylesheetCssRules = stylesheet$$1.cssRules;

  for (const i in newASTRules) {
    const oldASTRule = oldASTRules[i];
    const newASTRule = newASTRules[i];

    if (oldASTRule !== newASTRule) {
      const rulesArray = Array.from(stylesheetCssRules);
      const oldRule = oldRules[i];
      const oldRuleIndex = rulesArray.indexOf(oldRule);

      if (oldRule) {
        newRules.push(stylesheet$$1.cssRules[stylesheet$$1.insertRule(newASTRule.string, oldRuleIndex)]);
        if (newASTRules[i + 1] !== oldASTRule) stylesheet$$1.deleteRule(oldRuleIndex + 1);
      } else {
        // Will place the new node after the previous newly placed new node
        const previousNewRule = newRules[i - 1];
        const previousNewRuleIndex = rulesArray.indexOf(previousNewRule);
        newRules.push(stylesheet$$1.cssRules[stylesheet$$1.insertRule(newASTRule.string, previousNewRuleIndex)]);
        if (oldRule) stylesheet$$1.deleteRule(oldRuleIndex);
      }
    }
  }

  for (const node of oldRules.filter(node => !newRules.includes(node))) {
    const rulesArray = Array.from(stylesheetCssRules);
    if (rulesArray.includes(node)) stylesheet$$1.deleteRule(rulesArray.indexOf(node));
  }

  return newRules;
};
const placeholdersMetadataToPlaceholders$1 = ({
  element: {
    sheet
  },
  placeholdersMetadata,
  childRules = Array.from(sheet.cssRules)
}) => {
  const placeholders = [];

  for (const i in placeholdersMetadata) {
    const placeholderMetadata = placeholdersMetadata[i];
    const {
      type,
      path
    } = placeholderMetadata;
    if (path[0] === 'cssRules') path.shift();
    const rule = (type === 'declaration' ? path.slice(0, -1) : path).reduce((rule, attrName) => rule[attrName], childRules);
    const rules = [rule];
    if (childRules.includes(rule)) childRules.splice(childRules.indexOf(rule), 1, rules);
    let placeholder = (type === 'declaration' ? makeStyleProperty : type === 'ruleset' ? makeStyle : type === 'atRule' ? makeStylesheet : undefined)({
      placeholderMetadata,
      rules
    });
    placeholder.metadata = placeholderMetadata;
    placeholder.rules = rules;
    placeholders.push(placeholder);
  }

  return {
    childRules,
    placeholders
  };
};

const parser = new Parser(new class Factory extends NodeFactory {
  ruleset(...args) {
    return _objectSpread({}, super.ruleset(...args), singlePlaceholderRegex.test(args[0]) || args[0].includes(':element') ? {
      type: `rulesetPlaceholder`
    } : undefined);
  }

  expression(...args) {
    return _objectSpread({}, super.expression(...args), singlePlaceholderRegex.test(args[0]) ? {
      type: `expressionPlaceholder`
    } : undefined);
  }

  atRule(...args) {
    return _objectSpread({}, super.atRule(...args), args[0] === 'supports' && singlePlaceholderRegex.test(args[1]) ? {
      type: 'atRulePlaceholder'
    } : undefined);
  }

  declaration(...args) {
    return _objectSpread({}, super.declaration(...args), singlePlaceholderRegex.test(args[0]) || singlePlaceholderRegex.test(args[1].text) ? {
      type: 'declarationPlaceholder'
    } : undefined);
  }

}());
const stringifier = new class extends Stringifier {
  atRulePlaceholder(...args) {
    return super.atRule(...args);
  }

  rulesetPlaceholder({
    selector,
    rulelist
  }) {
    return `${selector.replace(/:element\((.*?)\)/g, '')}${this.visit(rulelist)}`;
  }

  declarationPlaceholder({
    name,
    value
  }) {
    return `--${name}${value ? `:${this.visit(value)}` : ''}`;
  }

  expressionPlaceholder({
    text
  }) {
    return `${text.replace(placeholderRegex, 'var(--$&)')}${text.endsWith(';') ? '' : ';'}`;
  }

}();

const findPlaceholdersAndPaths = (rule, placeholders = [], _path = [], path = [..._path], {
  type,
  selector,
  name,
  value,
  parameters,
  text = type.startsWith('declaration') ? value.text : undefined
} = rule, vals = [selector || name || value, text || parameters]) => {
  var _rule$rulelist;

  return (// match, create PlaceholderMetadata and push to placeholders
    (void (type && type.endsWith('Placeholder') && type !== 'expressionPlaceholder' && placeholders.push({
      type: type.slice(0, -'Placeholder'.length),
      values: vals,
      ids: vals.filter(_ => _).map(val => (val.match(placeholderRegex) || []).map(char => charToN(char))).flat(Infinity),
      path,
      rule
    })) || // search for placeholders in childs
    Array.isArray(rule) ? rule.forEach((rule, i) => findPlaceholdersAndPaths(rule, placeholders, [...path, i])) : rule.type.startsWith('ruleset') ? rule.rulelist.rules.filter(({
      type
    }) => type === 'declarationPlaceholder').forEach(rule => findPlaceholdersAndPaths(rule, placeholders, [...path, 'style', rule.name])) : rule.type.startsWith('atRule') ? (_rule$rulelist = rule.rulelist) === null || _rule$rulelist === void 0 ? void 0 : _rule$rulelist.rules.forEach((rule, i) => findPlaceholdersAndPaths(rule, placeholders, [...path, 'cssRules', i])) : rule.type.startsWith('stylesheet') ? rule.rules.forEach((rule, i) => findPlaceholdersAndPaths(rule, placeholders, [...path, 'cssRules', i])) : undefined) || placeholders
  );
};

var parse$1 = (({
  transform,
  strings,
  values
}, ast = parser.parse(transform(strings.reduce((str, str2, i) => `${str}${typeof values[i - 1] === 'object' ? `@supports (${placeholder(i - 1)}) {}` : placeholder(i - 1)}${str2}`)))) => ast.rules.forEach(rule => rule.string = stringifier.stringify(rule)) || {
  ast,
  css: stringifier.stringify(ast),
  placeholdersMetadata: findPlaceholdersAndPaths(ast)
});

class OzStyle$1 extends HTMLStyleElement {
  constructor({
    templateId,
    css,
    values,
    ast,
    placeholdersMetadata
  }) {
    super();
    this.ast = ast;
    this.templateId = templateId;
    this.values = values;
    this.placeholdersMetadata = placeholdersMetadata;
    this.css = css;
    this.setAttribute('is', 'oz-style');
  }

  get [OzStyle]() {
    return true;
  }

  clone(values = this.values) {
    return new OzStyle$1({
      ast: this.ast,
      css: this.css,
      values,
      placeholdersMetadata: this.placeholdersMetadata,
      templateId: this.templateId
    });
  }

  update(...values) {
    if (!this.placeholders) return void (this.values = values);
    this.placeholders.forEach(placeholder$$1 => (Array.isArray(placeholder$$1) ? placeholder$$1[0] : placeholder$$1)({
      values,
      forceUpdate: this.forceUpdate
    }));
    this.values = values;
  }

  connectedCallback(ast, childRules) {
    if (childRules) replace(childRules, ...replaceRules(ast, childRules, this.ast.rules));else if (this.innerHTML !== this.css) this.innerHTML = this.css;
    const {
      placeholders
    } = placeholdersMetadataToPlaceholders$1({
      element: this,
      placeholdersMetadata: this.placeholdersMetadata,
      childRules
    });
    this.childRules = childRules;
    this.placeholders = placeholders;
    this.forceUpdate = true;
    this.update(...this.values);
    this.forceUpdate = false;
    return childRules;
  }

  disconnectedCallback() {
    this.placeholders.filter(Array.isArray).forEach(([, unregister]) => unregister());
  }

}
customElements.get('oz-style') || customElements.define('oz-style', OzStyle$1, {
  extends: 'style'
});
var createStyle = (options => new OzStyle$1(options));

const styles = new Map();
const CSSTag = (transform = str => str) => (strings, ...values) => {
  const templateId = 'css' + strings.reduce((str, str2, i) => str + placeholder(i - 1) + str2);
  if (styles.has(templateId)) return styles.get(templateId).clone(values);
  const {
    ast,
    css,
    placeholdersMetadata
  } = parse$1({
    transform,
    strings,
    values
  });
  styles.set(templateId, createStyle({
    templateId,
    css,
    values,
    ast,
    placeholdersMetadata
  }));
  return styles.get(templateId).clone(values);
};
const css = CSSTag();

const voidTags = ['area', 'base', 'br', 'col', 'command', 'embed', 'hr', 'img', 'input', 'keygen', 'link', 'menuitem', 'meta', 'param', 'source', 'track', 'wbr'];
const regex = /^(\s*)(?:(\|)|(?:([.#\w-]*)(?:\(([\s\S]*?)\))?))(?:(.*))?/;
const gRegex = new RegExp(regex, 'gm');
const identifierRegex = /(?:(\.)|(#))([a-z0-9-]*)/;
const gIdentifierRegex = new RegExp(identifierRegex, 'g');
const classRegex = /class="(.*)"/;

const makeHTML = ({
  tag,
  attributes,
  childs,
  textContent,
  id,
  classList,
  i,
  forceText,
  match
}) => {
  if (forceText) return (i ? '\n' : '') + match.input.trim();
  const childForceText = classList.includes('');
  const classStr = classList.join(' ');
  let attrStr = attributes ? ' ' + attributes : '';
  if (attrStr.match(classRegex)) attrStr = attrStr.replace(classRegex, (match, classes) => `class="${classes} ${classStr}"`);else if (classStr) attrStr += ` class="${classStr}"`;
  if (tag) return `<${tag}${id ? ` id="${id}"` : ''}${attrStr}>${textContent || ''}${childs.map((line, i) => makeHTML(_objectSpread({}, line, {
    forceText: childForceText,
    i
  }))).join('')}${voidTags.includes(tag) ? '' : `</${tag}>`}`;else return (i ? '\n' : '') + textContent;
};

const pushLine = ({
  childs: currentChilds
}, line) => {
  if (currentChilds.length && currentChilds[currentChilds.length - 1].indentation < line.indentation) pushLine(currentChilds[currentChilds.length - 1], line);else currentChilds.push(line);
};

const hierarchise = arr => {
  const hierarchisedArr = [];

  for (let line of arr) {
    if (hierarchisedArr.length && hierarchisedArr[hierarchisedArr.length - 1].indentation < line.indentation && hierarchisedArr[hierarchisedArr.length - 1].childs) pushLine(hierarchisedArr[hierarchisedArr.length - 1], line);else hierarchisedArr.push(line);
  }

  return hierarchisedArr;
};

const pozToHTML = str => hierarchise(str.match(gRegex).map(str => str.match(regex)).filter(match => match[0].trim().length).map((match, i) => {
  if (match[3] && !match[3].replace(placeholderRegex, '').trim().length) {
    return {
      indentation: match[1].split('\n').pop().length,
      textContent: match[3],
      classList: []
    };
  }

  const tag = match[3] ? match[3].match(/^([a-z0-9-]*)/)[1] : undefined;
  const identifiers = match[3] ? match[3].slice(tag.length).match(gIdentifierRegex) || [] : [];
  const id = identifiers.find(identifier => identifier.match(identifierRegex)[2]);
  const classList = identifiers.filter(identifier => identifier.match(identifierRegex)[1]).map(str => str.slice(1));
  return {
    indentation: match[1].split('\n').pop().length,
    tag: match[2] ? undefined : tag || 'div',
    attributes: match[4],
    id: id === null || id === void 0 ? void 0 : id.replace(/^#/, ''),
    classList,
    textContent: match[5],
    childs: [],
    match,
    i
  };
})).map(line => makeHTML(line)).join('');

const poz = HTMLTag(pozToHTML);

const strictWhitespaceRegex = /[^\S\r\n]*/;
const propertyNameRegex = /[a-zA-Z0-9-]*/;
const unnestedAtRule = ['@charset', '@import', '@namespace'];

const makeCSS = ({
  indent,
  str,
  childs
}, {
  selector: selectorPrefix = ''
} = {}) => {
  str = str.trim();
  const isAtRule = str.startsWith('@');

  if (unnestedAtRule.some(atRule => str.startsWith(atRule))) {
    return `${str};`;
  } else if (childs.length) {
    const selector = isAtRule ? str : str.split(',').map(str => str.includes('&') ? str.replace('&', selectorPrefix) : `${selectorPrefix} ${str}`, '').join(',').trim();
    return `${selector}{${childs.filter(({
      childs
    }) => !childs.length || isAtRule).map(node => makeCSS(node)).join('')}}${isAtRule ? '' : childs.filter(({
      childs
    }) => childs.length).map(node => makeCSS(node, {
      selector
    })).join('')}`;
  } else {
    const propertyName = str.match(propertyNameRegex)[0];
    const rest = str.slice(propertyName.length + 1).trim();
    const propertyValue = rest.startsWith(':') ? rest.slice(1) : rest;
    return `${propertyName}:${propertyValue.trim()};`;
  }
};

const hierarchise$1 = (childs, item, lastChild = childs === null || childs === void 0 ? void 0 : childs[(childs === null || childs === void 0 ? void 0 : childs.length) - 1]) => (lastChild === null || lastChild === void 0 ? void 0 : lastChild.multiline) || item.indent > (lastChild === null || lastChild === void 0 ? void 0 : lastChild.indent) || 0 ? hierarchise$1(lastChild.childs, item) : childs.push(item);

const sozToCSS = str => str.split('\n').filter(str => str.trim().length).map(_str => {
  const indent = _str.match(strictWhitespaceRegex)[0].length;

  const str = _str.slice(indent);

  return {
    indent,
    str,
    childs: []
  };
}).reduce((arr, item) => (hierarchise$1(arr, item), arr), []).map(item => makeCSS(item)).join('');

const soz = CSSTag(sozToCSS);

const getPropertyDescriptorPair = (prototype, property) => {
  let descriptor = Object.getOwnPropertyDescriptor(prototype, property);

  while (!descriptor) {
    prototype = Object.getPrototypeOf(prototype);
    if (!prototype) return;
    descriptor = Object.getOwnPropertyDescriptor(prototype, property);
  }

  return {
    prototype,
    descriptor
  };
};
const getPropertyDescriptor = (object, property) => (getPropertyDescriptorPair(object, property) || {}).descriptor;

var proxify = (object => {
  const proxy = new Proxy(object, {
    get(target, property, receiver) {
      if (reactivityProperties.includes(property)) return Reflect.get(target, property, receiver);
      registerDependency({
        target,
        property
      });

      const propertyReactivity$$1 = propertyReactivity(target, property);

      const descriptor = getPropertyDescriptor(target, property);
      let value;

      if (descriptor && 'value' in descriptor) {
        // property
        value = Reflect.get(target, property, receiver);
      } else {
        // getter
        if ('cache' in propertyReactivity$$1) {
          value = propertyReactivity$$1.cache;
        } else {
          value = registerWatcher(_ => propertyReactivity$$1.cache = Reflect.get(target, property, receiver), _ => notify({
            target,
            property
          }), {
            object,
            property,
            propertyReactivity: propertyReactivity$$1,
            cache: true
          });
        }
      }

      return value;
    },

    deleteProperty(target, property) {
      if (reactivityProperties.includes(property)) return Reflect.deleteProperty(target, property);
      registerDependency({
        target: target,
        property
      });

      try {
        return Reflect.deleteProperty(target, property);
      } finally {
        notify({
          target,
          property
        });
        const {
          properties
        } = target[reactivity];
        if (!properties.get(property).watchers.length) properties.delete(property);
      }
    },

    defineProperty(target, property, desc, _ref = desc
    /* desc */
    ) {
      let {
        value: _value
      } = _ref,
          rest = _objectWithoutProperties(_ref, ["value"]);

      if (reactivityProperties.includes(property)) return Reflect.defineProperty(target, property, desc);
      registerDependency({
        target,
        property
      });

      if (!_value) {
        try {
          // return Reflect.defineProperty(target, property, desc) // TODO: find why the hell this doesn't work
          return Reflect.defineProperty(target, property, _objectSpread({}, _value !== undefined && {
            value: _value
          }, rest));
        } finally {
          notify({
            target,
            property,
            value: _value
          });
        }
      }

      let value = reactify(_value);
      if (typeof value === 'function' && value.$promise && value.$resolved) value = value.$resolvedValue;else if (typeof value === 'function' && value.$promise) {
        value.$promise.then(val => target[property] === value ? proxy[property] = val : undefined);
      }

      try {
        return Reflect.defineProperty(target, property, _objectSpread({}, value !== undefined && {
          value: value
        }, rest));
      } finally {
        if (value && typeof value === 'object' && value[reactivity]) {
          let unwatch = value.$watch(_ => target[property] === value ? notify({
            target,
            property,
            value,
            deep: true
          }) : unwatch(), {
            deep: true
          });
        }

        notify({
          target,
          property,
          value
        });
      }
    }

  });
  return proxy;
});

const type = Object;
var object = (object => {
  const obj = Object.create(Object.getPrototypeOf(object));
  const reactiveObject = proxify(obj);
  setReactivity({
    target: reactiveObject,
    original: object,
    object: obj
  });

  for (const [prop, {
    value,
    ...rest
  }] of Object.entries(Object.getOwnPropertyDescriptors(object))) {
    Object.defineProperty(reactiveObject, prop, _objectSpread({}, value !== undefined && {
      value: value
    }, rest));
  }

  return reactiveObject;
});

var object$1 = /*#__PURE__*/Object.freeze({
  type: type,
  default: object
});

const type$1 = Array;
let original;
const ReactiveType = class ReactiveArray extends Array {
  constructor(...values) {
    super();
    const proxy = proxify(this);
    setReactivity({
      target: proxy,
      original,
      object: this
    });
    if (original) original = undefined;

    if (values) {
      for (const val of values) proxy.push(val);
    }

    values.forEach((val, i) => proxy[i] = val);
    return proxy;
  }

};
var array = (array => {
  original = array;
  return new ReactiveType(...array);
});

var array$1 = /*#__PURE__*/Object.freeze({
  type: type$1,
  ReactiveType: ReactiveType,
  default: array
});

const type$2 = Map;
const getProperty = (reactiveMap, prop) => reactiveMap.get(prop);
const ReactiveType$1 = class ReactiveMap extends Map {
  constructor(iterator) {
    super();
    setReactivity({
      target: this,
      original: iterator,
      object: this
    });
    if (iterator) for (const [key, val] of iterator) this.set(key, val);
  }

  get size() {
    registerDependency({
      target: this
    });
    return super.size;
  }

  set(key, val) {
    const value = reactify(val);
    registerDependency({
      target: this,
      property: key,
      value
    });

    try {
      return super.set(key, value);
    } finally {
      notify({
        target: this,
        property: key,
        value
      });
    }
  }

  delete(key) {
    registerDependency({
      target: this,
      property: key
    });

    try {
      return super.delete(key);
    } finally {
      var _properties$get;

      notify({
        target: this,
        property: key
      });
      const {
        properties
      } = this[reactivity];
      if (!((_properties$get = properties.get(key)) === null || _properties$get === void 0 ? void 0 : _properties$get.watchers.length)) properties.delete(key);
    }
  }

  clear() {
    registerDependency({
      target: this
    });

    try {
      return super.clear();
    } finally {
      notify({
        target: this
      });
      const {
        properties
      } = this[reactivity];

      for (const [key] of this) {
        var _properties$get2;

        if (!((_properties$get2 = properties.get(key)) === null || _properties$get2 === void 0 ? void 0 : _properties$get2.watchers.length)) properties.delete(key);
      }

      for (const [key] of properties) {
        var _properties$get3;

        if (!((_properties$get3 = properties.get(key)) === null || _properties$get3 === void 0 ? void 0 : _properties$get3.watchers.length)) properties.delete(key);
      }
    }
  }

  get(key) {
    propertyReactivity(this, key);
    registerDependency({
      target: this,
      property: key
    });
    return super.get(key);
  }

  has(key) {
    registerDependency({
      target: this,
      property: key
    });
    return super.has(key);
  }

};

for (const property of ['entries', 'forEach', 'keys', 'values', Symbol.iterator]) {
  ReactiveType$1.prototype[property] = function (...args) {
    registerDependency({
      target: this
    });
    return type$2.prototype[property](...args);
  };
}

var map = (map => new ReactiveType$1(map));

var map$1 = /*#__PURE__*/Object.freeze({
  type: type$2,
  getProperty: getProperty,
  ReactiveType: ReactiveType$1,
  default: map
});

const type$3 = Set;
const getProperty$1 = (reactiveSet, prop) => reactiveSet.has(prop);
const ReactiveType$2 = class ReactiveSet extends Set {
  constructor(iterator) {
    super();
    setReactivity({
      target: this,
      original: iterator,
      object: this
    });
    if (iterator) for (const val of iterator) this.add(val);
  }

  get size() {
    registerDependency({
      target: this
    });
    return super.size;
  }

  add(val) {
    const value = reactify(val);
    registerDependency({
      target: this,
      property: value,
      value
    });

    try {
      return super.add(value);
    } finally {
      notify({
        target: this,
        property: value,
        value
      });
    }
  }

  delete(val) {
    const value = reactify(val);
    registerDependency({
      target: this,
      property: value,
      value
    });

    try {
      return super.delete(value);
    } finally {
      var _properties$get;

      notify({
        target: this,
        property: value,
        value
      });
      const {
        properties
      } = this[reactivity];
      if (!((_properties$get = properties.get(value)) === null || _properties$get === void 0 ? void 0 : _properties$get.watchers.length)) properties.delete(value);
    }
  }

  clear() {
    try {
      return super.clear();
    } finally {
      registerDependency({
        target: this
      });
      notify({
        target: this
      });
      const {
        properties
      } = this[reactivity];

      for (const value of this) {
        var _properties$get2;

        if (!((_properties$get2 = properties.get(value)) === null || _properties$get2 === void 0 ? void 0 : _properties$get2.watchers.length)) properties.delete(value);
      }

      for (const [key] of properties) {
        var _properties$get3;

        if (!((_properties$get3 = properties.get(key)) === null || _properties$get3 === void 0 ? void 0 : _properties$get3.watchers.length)) properties.delete(key);
      }
    }
  }

  has(val) {
    const value = reactify(val);
    propertyReactivity(this, value);
    registerDependency({
      target: this,
      property: value,
      value
    });
    return super.has(value);
  }

};

for (const property of ['entries', 'forEach', 'keys', 'values', Symbol.iterator]) {
  ReactiveType$2.prototype[property] = function (...args) {
    registerDependency({
      target: this
    });
    return type$3.prototype[property](...args);
  };
}

var set$1 = (set => new ReactiveType$2(set));

var set$2 = /*#__PURE__*/Object.freeze({
  type: type$3,
  getProperty: getProperty$1,
  ReactiveType: ReactiveType$2,
  default: set$1
});

const type$4 = Promise;
const ReactiveType$3 = class ReactivePromise extends Promise {
  constructor(executor, promise) {
    super((resolve, reject) => {
      executor(value => {
        let reactiveValue;

        if (value && typeof value === 'object') {
          reactiveValue = reactify(value);
          const {
            object
          } = reactiveValue[reactivity];
          object.$promise = promise;
          object.$resolved = true;
          object.$resolvedValue = value;
        }

        this.$resolved = true;
        this.$resolvedValue = reactiveValue || value;
        notify({
          target: this
        });
        resolve(value);
      }, error => {
        this.$rejected = true;
        this.$rejectedValue = error;
        reject(error);
      });
    });
    setReactivity({
      target: this,
      original: promise,
      object: this
    });
    this.$promise = promise;
    this.$resolved = false;
    this.$rejected = false;
  }

};
var promise = (promise => new ReactiveType$3((resolve, reject) => promise.then(resolve).catch(reject), promise));

var promise$1 = /*#__PURE__*/Object.freeze({
  type: type$4,
  ReactiveType: ReactiveType$3,
  default: promise
});

var unreactive = [Node, RegExp, URL, window.Location].map(type => ({
  type,
  default: obj => setReactivity({
    target: obj,
    unreactive: true
  })
}));

const builtIn = [map$1, set$2, promise$1, ...unreactive];
const isBuiltIn = reactiveObject => {
  var _builtIn$find;

  return (_builtIn$find = builtIn.find(({
    type: type$$1
  }) => reactiveObject instanceof type$$1)) === null || _builtIn$find === void 0 ? void 0 : _builtIn$find.type;
}; // Has to be from most specific(e.g: Map) to less specific(Object)

var types = new Map([...builtIn, array$1, object$1].map(({
  type: type$$1,
  default: reactify
}) => [type$$1, reactify]));
const propertyGetters = new Map([...builtIn, array$1, object$1].map(({
  type: type$$1,
  getProperty: getProperty$$1
}) => [type$$1, getProperty$$1]));
const getProperty$2 = (reactiveObject, property) => (propertyGetters.get(isBuiltIn(reactiveObject)) || (_ => reactiveObject[property]))(reactiveObject, property);

const reactivity = Symbol.for('OzReactivity');
const reactivityProperties = ['$watch', '$watchDependencies', reactivity];
let rootWatchers = [];
let rootObjects = new WeakMap();
const getReactivityRoot = _ => ({
  rootWatchers,
  rootObjects
});
const setReactivityRoot = ({
  watchers: w,
  objects: o
}) => (rootWatchers = w) && (rootObjects = o);

const callWatcher = (watcher, deep, obj) => deep ? watcher.deep ? watcher(obj) : undefined : watcher(obj);

const notify = ({
  target,
  property,
  value,
  deep
}) => {
  const react = target[reactivity]; // eslint-disable-line no-use-before-define

  if (!react) return;

  const callWatchers = watchers => {
    const currentWatcher = rootWatchers[rootWatchers.length - 1];
    if (watchers.includes(currentWatcher)) watchers.splice(watchers.indexOf(currentWatcher), 1);
    const cacheWatchers = watchers.filter(({
      cache
    }) => cache);
    /* .filter(({_target, _property}) => (target === _target && property === _property)) */

    cacheWatchers.forEach(({
      propertyReactivity
    }) => delete propertyReactivity.cache);
    cacheWatchers.forEach(watcher => callWatcher(watcher, deep, {
      target,
      property,
      value
    }));
    watchers.filter(({
      cache
    }) => !cache).forEach(watcher => callWatcher(watcher, deep, {
      target,
      property,
      value
    }));
  };

  if (property) {
    const watchers = propertyReactivity(target, property).watchers;

    const _watchers = watchers.slice();

    watchers.length = 0;
    callWatchers(_watchers);
  }

  const watchers = react.watchers;

  const _watchers = watchers.slice();

  watchers.length = 0;
  callWatchers(_watchers);
};

const makeReactivityWatcherArray = (target, property, dependencyListeners) => new Proxy([], {
  defineProperty(_target, _property, desc, {
    value
  } = desc
  /* desc */
  ) {
    const oldValue = _target[_property];

    try {
      return Reflect.defineProperty(_target, _property, desc);
    } finally {
      if (_property === 'length' && oldValue !== value) {
        // console.log(oldValue, value, oldValue !== value)
        for (const watcher of dependencyListeners) watcher(target, property, value);
      }
    }
  }

});

const makeReactivityObject = (object, dependencyListeners = []) => ({
  dependencyListeners,
  watchers: makeReactivityWatcherArray(object, undefined, dependencyListeners),
  properties: new Map(),
  // new ReactivePropertyMap(dependencyListeners, object),
  object
});

const setReactivity = ({
  target,
  unreactive,
  original,
  object
}) => {
  if (unreactive) {
    target[reactivity] = false;
    return target;
  }

  if (original) rootObjects.set(original, target);
  const reactivityObject = makeReactivityObject(object);
  Object.defineProperty(target, reactivity, {
    value: reactivityObject,
    configurable: true,
    writable: true
  });
  Object.defineProperty(target, '$watch', {
    value: watch(target),
    configurable: true,
    writable: true
  });
  Object.defineProperty(target, '$watchDependencies', {
    value: listener => {
      reactivityObject.dependencyListeners.push(listener);
      return _ => reactivityObject.dependencyListeners.splice(reactivityObject.dependencyListeners.indexOf(listener - 1), 1);
    },
    configurable: true,
    writable: true
  });
  return target;
};
const registerWatcher = (getter, watcher, options = {}) => {
  Object.defineProperties(watcher, Object.getOwnPropertyDescriptors(options));
  rootWatchers.push(watcher);
  const value = getter();
  rootWatchers.pop();
  return value;
};
const propertyReactivity = (target, property) => {
  const {
    properties,
    dependencyListeners
  } = target[reactivity];
  if (properties.has(property)) return properties.get(property);
  const propertyReactivity = {
    watchers: makeReactivityWatcherArray(target, property, dependencyListeners) // cache: undefined

  };
  properties.set(property, propertyReactivity);
  return propertyReactivity;
};
const pushWatcher = (object, watcher, options = {}) => {
  if (Object.defineProperties(watcher, Object.getOwnPropertyDescriptors(options)) && object && typeof object === 'object' && object[reactivity] && !object[reactivity].watchers.includes(watcher)) {
    var _watcher$dependencies;

    object[reactivity].watchers.push(watcher);
    (_watcher$dependencies = watcher.dependenciesWatchers) === null || _watcher$dependencies === void 0 ? void 0 : _watcher$dependencies.push(object[reactivity].watchers);
  }
};
const includeWatcher = (arr, watcher) => arr.includes(watcher) || arr.some(_watcher => watcher.object && watcher.property && watcher.object === _watcher.object && watcher.property === _watcher.property);

const pushCurrentWatcher = ({
  watchers
}) => {
  const currentWatcher = rootWatchers[rootWatchers.length - 1];

  if (currentWatcher && !includeWatcher(watchers, currentWatcher)) {
    var _currentWatcher$depen;

    (_currentWatcher$depen = currentWatcher.dependenciesWatchers) === null || _currentWatcher$depen === void 0 ? void 0 : _currentWatcher$depen.push(watchers);
    watchers.push(currentWatcher);
  }
};

const registerDependency = ({
  target,
  property
}) => {
  if (!rootWatchers.length || !target[reactivity]) return;
  if (property) pushCurrentWatcher(propertyReactivity(target, property));else pushCurrentWatcher(target[reactivity]);
};
const watch = target => (getter, handler) => {
  const options = target && typeof handler === 'object' ? handler : undefined;

  if (target) {
    if (!handler || typeof handler !== 'function') {
      handler = getter;
      getter = undefined;
    }

    const type = typeof getter;

    if (type === 'string' || type === 'number' || type === 'symbol') {
      const property = getter;

      getter = _ => isBuiltIn(target) ? getProperty$2(target, property) : target[property];
    }
  }

  let unwatch, oldValue;
  const dependenciesWatchers = [];

  const watcher = _ => {
    dependenciesWatchers.length = 0;
    if (unwatch) return;

    if (getter) {
      let newValue = registerWatcher(getter, watcher, options);
      pushWatcher(newValue, watcher, options);
      if (handler) handler(newValue, oldValue);
      oldValue = newValue;
    } else {
      handler(target, target);
      pushWatcher(target, watcher, options);
    }
  };

  watcher.dependenciesWatchers = dependenciesWatchers;
  if (getter) oldValue = registerWatcher(getter.bind(target, target), watcher, options);
  pushWatcher(getter ? oldValue : target, watcher, options);
  return _ => {
    for (const watchers of dependenciesWatchers) watchers.splice(watchers.indexOf(watcher) - 1, 1);

    unwatch = true;
  };
};
const isolate = func => registerWatcher(func, _ => {});

const reactify = obj => {
  if (!obj || typeof obj !== 'object' || reactivity in obj) return obj;
  if (rootObjects.has(obj)) return rootObjects.get(obj);
  return Array.from(types).find(([type]) => obj instanceof type)[1](obj);
};

const watch$1 = watch();

const OzElement = Symbol.for('OzElement');
const OzElementContext = Symbol.for('OzElementContext');
const mixins = [];
const mixin = obj => mixins.push(obj);
const getMixinProp = (mixins, prop) => mixins.filter(mixin => prop in mixin).map(mixin => mixin[prop]);
const htmlTemplateChangedError = new Error('The HTML template returned in the template method changed');
const noHTMLTemplateError = new Error('No HTML template returned in the template method');
const ozStyleChangedError = new Error('The OzStyle element returned in the style changed');
const noOzStyleError = new Error('No OzStyle element returned in the style method');

const registerElement = element => {
  const {
    name,
    mixins: elementMixins,
    extends: extend,
    shadowDom: elementShadowDom,
    state: _state,
    props: elementProps = [],
    watchers: elementWatchers = [],
    template: buildHTMLTemplate,
    style: buildCSSTemplate,
    created,
    connected,
    disconnected
  } = element,
        rest = _objectWithoutProperties(element, ["name", "mixins", "extends", "shadowDom", "state", "props", "watchers", "template", "style", "created", "connected", "disconnected"]);

  const mixins$$1 = mixins.concat(elementMixins || []);
  const props = elementProps.concat(getMixinProp(mixins$$1, 'props')).flat(1);
  const states = getMixinProp(mixins$$1, 'state').flat(1);
  const watchers = elementWatchers.concat(getMixinProp(mixins$$1, 'watchers').flat(1));
  const shadowDom = 'shadowDom' in element ? elementShadowDom : getMixinProp(mixins$$1, 'shadowDom').pop();
  const createdMixins = getMixinProp(mixins$$1, 'created');
  const connectedMixins = getMixinProp(mixins$$1, 'connected');
  const disconnectedMixins = getMixinProp(mixins$$1, 'disconnected');
  const templateMixins = getMixinProp(mixins$$1, 'template');
  const styleMixins = getMixinProp(mixins$$1, 'style');
  const Class = extend ? Object.getPrototypeOf(document.createElement(extend)).constructor : HTMLElement;

  class OzElement$$1 extends Class {
    // TODO: test if i need to make a helper function from the reactivity side to isolate the constructors
    // because they can register some dependencies in the parent templates dependencies
    constructor() {
      super();
      const shadowDomType = typeof shadowDom;
      const host = shadowDomType === 'string' ? this.attachShadow({
        mode: shadowDom
      }) : shadowDomType === 'boolean' ? this.attachShadow({
        mode: shadowDom ? 'open' : 'closed'
      }) : this;
      const context = this[OzElementContext] = reactify(_objectSpread({}, rest, {
        element: this,
        host,
        props: {},
        template: undefined,
        style: undefined
      }));
      Object.entries(rest) // binding functions with the context
      .filter(([, value]) => typeof value === 'function').forEach(([k, v]) => void (context[k] = v.bind(context, context))); // Props mixins & props

      props.forEach(prop => context.props[prop] = this[prop]);
      Object.defineProperties(this, props.reduce((props, prop) => (props[prop] = {
        enumerable: true,
        configurable: true,
        get: _ => context.props[prop],
        set: val => context.props[prop] = val
      }) && props, {})); // State mixins & state

      const state = context.state = reactify((typeof _state === 'function' ? _state.bind(context)(context) : _state) || {});
      states.reverse().forEach(stateMixin => Object.defineProperties(state, Object.getOwnPropertyDescriptors(stateMixin(context)))); // HTML Template

      if (buildHTMLTemplate || templateMixins.length) {
        const _template = buildHTMLTemplate || templateMixins[0];

        let template; // eslint-disable-next-line no-return-assign

        watch$1(_ => template ? _template.call(context, context) : template = context.template = _template.call(context, context), updatedTemplate => {
          if (!updatedTemplate[OzHTMLTemplate]) throw noHTMLTemplateError;
          if (template.templateId !== updatedTemplate.templateId) throw htmlTemplateChangedError;
          template.update(...updatedTemplate.values);
        });
      } // CSS Template


      if (buildCSSTemplate || styleMixins.length) {
        const _style = buildCSSTemplate || styleMixins[0];

        let template; // eslint-disable-next-line no-return-assign

        watch$1(_ => template ? _style.call(context, context) : template = context.style = _style.call(context, context), updatedTemplate => {
          if (!updatedTemplate[OzStyle]) throw noOzStyleError;
          if (template.templateId !== updatedTemplate.templateId) throw ozStyleChangedError;
          template.update(...updatedTemplate.values);
        });
      } // Watchers mixins & watchers


      for (const item of watchers) {
        if (Array.isArray(item)) watch$1(item[0].bind(context, context), item[1].bind(context, context));else watch$1(item.bind(context, context));
      } // Created mixins & created


      createdMixins.forEach(mixin$$1 => mixin$$1(context));
      if (created) created(context);
    }

    get [OzElement]() {
      return true;
    }

    static get name() {
      return name;
    }

    static get observedAttributes() {
      return props;
    }

    attributeChangedCallback(attr, oldValue, newValue) {
      if (props.includes(attr)) this[attr] = newValue;
    }

    connectedCallback() {
      const {
        [OzElementContext]: context,
        [OzElementContext]: {
          host,
          style,
          template
        }
      } = this;
      if (template) host.appendChild(template.content);

      if (style) {
        if (shadowDom) host.appendChild(style);else {
          const root = host.getRootNode();
          if (root === document) host.getRootNode({
            composed: true
          }).head.appendChild(style);else root.appendChild(style);
        } // style.update(...style.values)
      } // Connected mixins & connected


      connectedMixins.forEach(mixin$$1 => mixin$$1(context));
      if (connected) connected(context);
    }

    disconnectedCallback() {
      const {
        [OzElementContext]: context,
        [OzElementContext]: {
          style
        }
      } = this;
      if (style && !shadowDom) style.remove(); // Disconnected mixins & disconnected

      disconnectedMixins.forEach(mixin$$1 => mixin$$1(context));
      if (disconnected) disconnected(context);
    }

  }

  window.customElements.define(name, OzElement$$1, _objectSpread({}, extend ? {
    extends: extend
  } : undefined));
  return OzElement$$1;
};

const RouterView = Symbol.for('RouterView');

const getClosestRouterView = (node, closestOzElementParent = getClosestOzElementParent(node), isRouter = closestOzElementParent && RouterView in closestOzElementParent) => isRouter ? closestOzElementParent : closestOzElementParent && getClosestRouterView(closestOzElementParent); // TODO(reactivity optimisation): find why there's 3 first renders instead of just 1, it has to do with the reactivity & the dependency chain:
// matches -> route -> content, maybe calling the template everytime, it should only be called 1 time at the first render


const RouterViewMixin = {
  props: ['name'],
  state: ctx => ({
    get url() {
      var _getClosestRouterView, _ctx$router;

      return ((_getClosestRouterView = getClosestRouterView(ctx.element)) === null || _getClosestRouterView === void 0 ? void 0 : _getClosestRouterView.childPathname) || ((_ctx$router = ctx.router) === null || _ctx$router === void 0 ? void 0 : _ctx$router.url);
    },

    get pathname() {
      var _this$url;

      return (_this$url = this.url) === null || _this$url === void 0 ? void 0 : _this$url.pathname;
    },

    get matches() {
      var _ctx$router2;

      return this.url && ((_ctx$router2 = ctx.router) === null || _ctx$router2 === void 0 ? void 0 : _ctx$router2.matchRoutes(this.url));
    },

    get route() {
      var _this$matches;

      return (_this$matches = this.matches) === null || _this$matches === void 0 ? void 0 : _this$matches[0];
    },

    get content() {
      var _this$route;

      const content = (_this$route = this.route) === null || _this$route === void 0 ? void 0 : _this$route.content;
      return typeof content === 'function' ? content().then(module => module.default) : content;
    },

    get childPathname() {
      var _this$pathname, _this$pathname$replac, _this$route2;

      return (_this$pathname = this.pathname) === null || _this$pathname === void 0 ? void 0 : (_this$pathname$replac = _this$pathname.replace) === null || _this$pathname$replac === void 0 ? void 0 : _this$pathname$replac.call(_this$pathname, (_this$route2 = this.route) === null || _this$route2 === void 0 ? void 0 : _this$route2.regex, '');
    }

  }),
  template: ({
    state: {
      content
    }
  }) => html`${content}`,

  created({
    element
  }) {
    element[RouterView] = true;
  },

  watchers: [({
    element,
    state: {
      route
    }
  }) => element.route = route, ({
    element,
    state: {
      childPathname
    }
  }) => element.childPathname = childPathname]
};
var registerRouterView = (_ => customElements.get('router-view') || registerElement({
  name: 'router-view',
  mixins: [RouterViewMixin]
}));

const routerGlobalMixin = {
  created: (ctx, closestOzElementParent = getClosestOzElementParent(ctx.element)) => ctx.router = closestOzElementParent && closestOzElementParent[OzElementContext].router
};
const registerRouterMixins = _ => mixins.includes(routerGlobalMixin) || mixin(routerGlobalMixin);
const registerCustomElements = _ => registerRouterView();
const compileRoutes = ({
  routes = []
} = {}) => routes.map(route => Array.isArray(route.path) ? route.path.map(path => _objectSpread({}, route, {
  regex: pathToRegexp(path, [], {
    end: false
  }),
  resolve: ((toPath, params) => toPath(params)).bind(undefined, compile(path))
})) : _objectSpread({}, route, {
  regex: pathToRegexp(route.path, [], {
    end: false
  }),
  resolve: ((toPath, params) => toPath(params)).bind(undefined, compile(route.path))
})).flat(Infinity);
const matchRoutes = routes => url => routes.filter(({
  regex
}) => regex.test(url.pathname));
const getClosestOzElementParent = (node, parentNode = node.parentNode || node.host, isOzElement = parentNode && parentNode[OzElement]) => isOzElement ? parentNode : parentNode && getClosestOzElementParent(parentNode);

const history = window.history;
const Router = ({
  routes: _routes,
  base: _base = '',
  linkActiveClass = 'linkActiveClass',
  linkExactActiveClass = 'linkExactActiveClass',
  base = new URL(_base, window.location.origin),
  _: routes = compileRoutes({
    routes: _routes
  }),
  matchRoutes: matchRoutes$$1 = matchRoutes(routes)
} = {}) => {
  registerRouterMixins();
  registerCustomElements();

  let _state;

  const go = (replace = false) => location => (replace ? history.replaceState : history.pushState).call(history, {}, '', _state._url = resolve(location));

  const push = go();

  const resolve = (location, url = typeof location === 'string' || location instanceof URL || location instanceof window.Location ? new URL(location, window.location) : new URL(`${(location.route || routes.find(({
    name
  }) => name === location.route.name)).resolve(location.params)}${new URLSearchParams(location.query).toString()}#${location.hash}`, window.location)) => url.pathname.startsWith(base.pathname) ? url : new URL(url.pathname, base);

  const state = reactify({
    routes,
    matchRoutes: matchRoutes$$1,
    _url: new URL(window.location),

    set url(url) {
      return push(this._url = resolve(url)) && url;
    },

    get url() {
      return this._url;
    },

    resolve,
    push,
    replace: go(true)
  });
  _state = state;

  window.onpopstate = ev => state.replace(window.location);

  return state;
};

export { poz, soz, OzHTMLTemplate, HTMLTag, html, OzStyle, CSSTag, css, OzElementContext, OzElement, mixin, registerElement, watch$1 as watch, getReactivityRoot, setReactivityRoot, isolate, reactify as r, reactify as react, reactivity, reactivityProperties, registerRouterMixins, Router, RouterViewMixin };
