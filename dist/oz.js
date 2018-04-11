'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

const UUID = a => a ? (a ^ Math.random() * 16 >> a / 4).toString(16) : ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, UUID);

const isObject = item => item && typeof item === 'object' && !Array.isArray(item);

const flattenArray = arr => arr.reduce((arr, item) => Array.isArray(item) ? [...arr, ...flattenArray(item)] : [...arr, item], []);

const replaceObject = (object, replace) => replace ? replace(object) : object;

// todo: add more of the built-in objects, some of them are in https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects
const builtInObjects = new Map([
  [URL, {
    copy: url => new URL(url.href)
  }],
  [URLSearchParams, {
    copy: urlSearchParams => new URLSearchParams(urlSearchParams.toString())
  }],
  [RegExp, {
    copy: regexp => new RegExp(regexp.source, regexp.flags)
  }],
  [Map, {
    setters: ['clear', 'delete', 'set'],
    copy (map, {refs, replaceObjects, ...rest}) {
      const newMap = replaceObject(new Map(), replaceObjects);
      refs.set(map, newMap);
      for (const [key, val] of cloneObject([...map], { refs, ...rest, registerRef: false, replaceObjects })) newMap.set(key, val);
      return newMap
    }
  }],
  [Set, {
    setters: ['add', 'clear', 'delete'],
    copy (set, {refs, replaceObjects, ...rest}) {
      const newSet = replaceObject(new Set(), replaceObjects);
      refs.set(set, newSet);
      for (const val of cloneObject([...set], { refs, ...rest, registerRef: false, replaceObjects })) newSet.add(val);
      return newSet
    }
  }]
]);

const isBuiltIn = obj => {
  for (const pair of builtInObjects) {
    if (obj instanceof pair[0]) return pair
  }
};

const ignoreObjectType = [
  WeakSet,
  WeakMap,
  Node
];

const isIgnoredObjectType = obj => {
  for (const type of ignoreObjectType) {
    if (obj instanceof type) return obj
  }
};

function cloneObject (_object = {}, { refs = new Map(), registerRef = true, replaceObjects, doNotCopyObjects } = {}) {
  if (refs.has(_object)) return refs.get(_object)
  if (!_object || typeof _object !== 'object') throw new TypeError(`Oz cloneObject: first argument has to be typeof 'object' & non null, typeof was '${typeof _object}'`)
  if (isIgnoredObjectType(_object)) return _object
  if (doNotCopyObjects && doNotCopyObjects(_object)) return _object
  const builtInPair = isBuiltIn(_object);
  if (builtInPair) return builtInPair[1].copy(_object, { refs, replaceObjects })
  const object = replaceObject(Array.isArray(_object) ? [..._object] : Object.create(Object.getPrototypeOf(_object)), replaceObjects);
  if (registerRef) refs.set(_object, object);
  for (const [prop, desc] of Object.entries(Object.getOwnPropertyDescriptors(_object))) {
    let {value, ...rest} = desc;
    if (desc.writable === false) continue
    Object.defineProperty(object, prop, {
      ...rest,
      ...value !== undefined && {
        value: value && typeof value === 'object'
          ? cloneObject(value, { refs, replaceObjects, doNotCopyObjects })
          : value
      }
    });
  }
  return object
}

const getPropertyDescriptorPair = (prototype, property) => {
  let descriptor = Object.getOwnPropertyDescriptor(prototype, property);
  while (!descriptor) {
    prototype = Object.getPrototypeOf(prototype);
    if (!prototype) return
    descriptor = Object.getOwnPropertyDescriptor(prototype, property);
  }
  return {prototype, descriptor}
};

const hasProperty = (object, property) => {
  return !!getPropertyDescriptorPair(object, property)
};

const getPropertyDescriptor = (object, property) => {
  const result = getPropertyDescriptorPair(object, property);
  if (result) return result.descriptor
};
const getPropertyDescriptorPrototype = (object, property) => {
  const result = getPropertyDescriptorPair(object, property);
  if (result) return result.prototype
};

exports.Reactivity = class Reactivity {
  constructor () {
    this.watchers = [];
    this.properties = new Map();
    this.cache = new Map();
  }
};

const reactiveProperties = ['__reactivity__', '$watch'];

// Object where reactive objects register themselves when a watcher search for dependencies
exports.defaultReactiveRoot = {
  watchers: [],
  Reactivity: exports.Reactivity
};

// In case there can be multiple windows sharing one reactiveRoot (e.g. Electron/WebExtensions)
const setDefaultReactiveRoot = reactiveRoot => {
  exports.defaultReactiveRoot = reactiveRoot;
  exports.Reactivity = reactiveRoot.Reactivity;
};

const includeWatcherObj = (arr, {object, prop, watcher}) => {
  for (const item of arr) {
    const {object: _object, prop: _prop, watcher: _watcher} = item;
    if ((object && prop && object === _object && prop === _prop) || watcher === _watcher) return item
  }
};

const getCurrentWatcher = ({watchers}) => watchers[watchers.length - 1];

const registerWatcher = (getter, watcher, options) => {
  const {object, prop, reactiveRoot = exports.defaultReactiveRoot} = options;
  const watcherObj = {object, prop, watcher};
  const length = reactiveRoot.watchers.push(watcherObj);
  const value = getter();
  reactiveRoot.watchers.splice(length - 1, 1);
  return value
};

const callWatchers = watchers => {
  const cacheWatchers = [];
  const nonCacheWatchers = [];
  for (const watcherObj of watchers) {
    if (watcherObj.watcher.cache) cacheWatchers.push(watcherObj);
    else nonCacheWatchers.push(watcherObj);
  }
  for (const watcherObj of [...cacheWatchers, ...nonCacheWatchers]) watcherObj.watcher();
};

const callObjectsWatchers = (...objects) => {
  let watchers = [];
  for (const obj of objects) watchers = [...watchers, ...obj.watchers];
  for (const obj of objects) obj.watchers = [];
  callWatchers(watchers);
};

const initDefaultPropertyReactivity = (props, prop) => {
  if (!props.has(prop)) props.set(prop, { watchers: [] });
};

const ignoreObjectType$1 = [
  Error,
  Node
];

const IsIgnoredObjectType = obj => {
  for (const type of ignoreObjectType$1) {
    if (obj instanceof type) return obj
  }
};

const reactify = (_object = {}, { reactiveRoot = exports.defaultReactiveRoot, clone = true } = {}) => {
  if (_object.__reactivity__ instanceof exports.Reactivity || IsIgnoredObjectType(_object) || _object.__reactivity__ === false) return _object
  const object = clone ? cloneObject(_object, {
    replaceObjects: object => reactify(object, { reactiveRoot, clone: false }),
    doNotCopyObjects: object => object.__reactivity__
  }) : _object;
  if (clone) return object
  const isBuiltIn$$1 = isBuiltIn(object);
  const reactivity = new exports.Reactivity();
  if (!object.__reactivity__) Object.defineProperty(object, '__reactivity__', { value: reactivity });
  for (let i in object) {
    const desc = getPropertyDescriptor(object, i);
    const { value } = desc;
    if (value && typeof value === 'object') {
      if (value.__reactivity__ instanceof exports.Reactivity) object[i] = _object[i];
      else object[i] = reactify(value, { reactiveRoot, clone });
    }
  }
  const proxy = new Proxy(object, {
    get (target, prop, receiver) {
      if (reactiveProperties.includes(prop)) return Reflect.get(target, prop, isBuiltIn$$1 ? target : receiver)
      initDefaultPropertyReactivity(reactivity.properties, prop);
      const propReactivity = reactivity.properties.get(prop);
      const propWatchers = propReactivity.watchers;
      const desc = getPropertyDescriptor(target, prop);
      let value;
      if (desc && Reflect.has(desc, 'value')) { // property
        value = Reflect.get(target, prop, isBuiltIn$$1 ? target : receiver);
      } else { // getter
        if (reactivity.cache.has(prop)) {
          value = reactivity.cache.get(prop);
        } else {
          const watcher = _ => {
            reactivity.cache.delete(prop);
            callObjectsWatchers(propReactivity, reactivity);
          };
          watcher.cache = true;
          value = registerWatcher(_ => {
            let _value = Reflect.get(target, prop, isBuiltIn$$1 ? target : receiver);
            reactivity.cache.set(prop, _value);
            return _value
          }, watcher, {object, prop, reactiveRoot});
        }
      }
      // if (value && typeof value === 'object' && value.__reactivity__ instanceof Reactivity) {
      //   // reactivity.watchers.push({object, watcher, reactiveRoot})
      //   // value.$watch(currentWatcher.watcher)
      //   const watcherObject = getCurrentWatcher(reactiveRoot)
      //   console.log('watcherObject', watcherObject)
      //   if (watcherObject) value.__reactivity__.watchers.push(watcherObject)
      // }
      if (isBuiltIn$$1 && typeof value === 'function') {
        value = new Proxy(value, {
          apply (_target, thisArg, argumentsList) {
            try {
              return Reflect.apply(_target, target, argumentsList)
            } finally {
              // if (isBuiltIn[1].setters && isBuiltIn[1].setters.includes(prop)) callObjectsWatchers(propReactivity, reactivity)
              if (isBuiltIn$$1[1].setters && isBuiltIn$$1[1].setters.includes(prop)) callObjectsWatchers(propReactivity, reactivity);
            }
          }
        });
        reactivity.cache.set(prop, value);
      }
      if (reactiveRoot.watchers.length) {
        const currentWatcher = getCurrentWatcher(reactiveRoot);
        if (!includeWatcherObj(propWatchers, currentWatcher)) propWatchers.push(currentWatcher);
        if (value && typeof value === 'object' && value.__reactivity__ instanceof exports.Reactivity && !value.__reactivity__.watchers.includes(getCurrentWatcher(reactiveRoot))) value.__reactivity__.watchers.push(getCurrentWatcher(reactiveRoot));
      }
      return value
    },
    set (target, prop, value, receiver) {
      if (value === target[prop]) return true
      if (reactiveProperties.includes(prop)) return Reflect.set(target, prop, value, receiver)
      initDefaultPropertyReactivity(reactivity.properties, prop);
      if (value && typeof value === 'object') value = reactify(value, { reactiveRoot, clone });
      const result = Reflect.set(target, prop, value, receiver);
      callObjectsWatchers(reactivity.properties.get(prop), reactivity);
      return result
    },
    deleteProperty (target, prop) {
      if (reactiveProperties.includes(prop)) return Reflect.delete(target, prop)
      initDefaultPropertyReactivity(reactivity.properties, prop);
      const result = Reflect.deleteProperty(target, prop);
      callObjectsWatchers(reactivity.properties.get(prop), reactivity);
      if (!reactivity.properties.get(prop).watchers.length /* && reactivity.watchers.length */) {
        reactivity.properties.delete(prop);
        reactivity.cache.delete(prop);
      }
      return result
    }
  });
  Object.defineProperty(object, '$watch', {
    value: (getter, handler) => {
      if (!handler) {
        handler = getter;
        getter = null;
      }
      let unwatch, oldValue;
      const watcher = _ => {
        if (unwatch) return
        if (getter) {
          let newValue = registerWatcher(getter.bind(proxy), watcher, {reactiveRoot});
          handler(newValue, oldValue);
          oldValue = newValue;
        } else {
          handler(proxy, proxy);
          reactivity.watchers.push({object, watcher, reactiveRoot});
        }
      };
      if (getter) oldValue = registerWatcher(getter.bind(proxy), watcher, {reactiveRoot});
      else reactivity.watchers.push({object, watcher, reactiveRoot});
      return _ => (unwatch = true)
    }
  });
  return proxy
};

const watch = (getter, handler, {reactiveRoot = exports.defaultReactiveRoot} = {}) => {
  let unwatch, oldValue;
  const watcher = _ => {
    if (unwatch) return
    let newValue = registerWatcher(getter, watcher, {reactiveRoot});
    if (newValue && typeof newValue === 'object' && newValue.__reactivity__ instanceof exports.Reactivity && !newValue.__reactivity__.watchers.find(obj => obj.watcher === watcher)) newValue.__reactivity__.watchers.push({watcher});
    if (handler) handler(newValue, oldValue);
    oldValue = newValue;
  };
  oldValue = registerWatcher(getter, watcher, {reactiveRoot});
  if (oldValue && typeof oldValue === 'object' && oldValue.__reactivity__ instanceof exports.Reactivity && !oldValue.__reactivity__.watchers.find(obj => obj.watcher === watcher)) oldValue.__reactivity__.watchers.push({watcher});
  return _ => (unwatch = true)
};

const mixins = [];
const mixin = obj => mixins.push(obj);
let currentContexts = [];

const callMixin = (context, options, mixin) => {
  const parentContext = currentContexts[currentContexts.length - 1];
  mixin({ context, options, ...parentContext && parentContext !== context && { parentContext: parentContext } });
};

const pushContext = (context, func) => {
  const _currentContexts = [...currentContexts];
  currentContexts = [...currentContexts, context];
  try {
    return func()
  } finally {
    currentContexts = [..._currentContexts];
  }
};

const registerElement = options => {
  const {
    name,
    extend = HTMLElement,
    shadowDom,
    state,
    props,
    methods,
    watchers = [],
    template: htmlTemplate,
    style: cssTemplate,
    created,
    connected,
    disconnected
  } = options;
  class OzElement extends extend {
    constructor () {
      super();
      const context = this.__context__ = reactify({
        host: shadowDom && this.attachShadow ? this.attachShadow({ mode: shadowDom }) : this,
        props: {},
        methods: {},
        template: undefined,
        style: undefined
      });
      context.state = reactify(typeof state === 'function' ? state(context) : state || {});
      if (methods) {
        for (const method in methods) context.methods[method] = methods[method].bind(null, context);
      }
      if (props) {
        const propsDescriptors = {};
        for (const prop of props) {
          propsDescriptors[prop] = {
            enumerable: true,
            get: _ => context.props[prop],
            set: val => (context.props[prop] = val)
          };
        }
        Object.defineProperties(this, propsDescriptors);
      }
      mixins.forEach(callMixin.bind(null, context, options));
      if (htmlTemplate) {
        let template, build;
        const buildTemplate = htmlTemplate.bind(null, context);
        watch(_ => pushContext(context, _ => (build = buildTemplate())), build => template.update(...build.values));
        if (!build.build) throw new Error('The template function should return a html-template build.')
        pushContext(context, _ => (template = build()));
        context.template = template;
      }
      if (cssTemplate) {
        let template, build;
        const buildTemplate = cssTemplate.bind(null, context);
        watch(_ => (build = buildTemplate()), build => template.update(...build.values));
        // if (!build.build) throw new Error('The style function should return a css-template build.')
        template = build();
        context.style = template;
      }
      for (const item of watchers) {
        if (Array.isArray(item)) watch(item[0].bind(null, context), item[1].bind(null, context));
        else watch(item.bind(null, context));
      }
      if (created) created(context);
    }

    static get __ozElement__ () { return true }
    static get name () { return name }
    static get observedAttributes () { return props }

    attributeChangedCallback (attr, oldValue, newValue) {
      if (props.includes(attr)) this[attr] = newValue;
    }

    connectedCallback () {
      const { __context__: context, __context__: { host, style, template } } = this;
      mixins.forEach(callMixin.bind(null, context, options));
      if (template) pushContext(context, _ => host.appendChild(template.content));
      if (style) {
        if (shadowDom) host.appendChild(style.content);
        else this.ownerDocument.head.appendChild(style.content);
        style.update();
      }
      if (connected) connected(context);
    }

    disconnectedCallback () {
      const { __context__: context, __context__: { style } } = this;
      if (style && !shadowDom) style.content.parentElement.removeChild(style.content); // todo: check why the element is emptied but not removed
      if (disconnected) disconnected(context);
    }
  }
  customElements.define(name, OzElement);
  return OzElement
};

// import { Element } from './element.js'
// import { html } from '../template/html.js'
// import { css } from '../template/css.js'

// export class RouterLink extends Element {
//   constructor (href, router) {
//     super({ shadowDom: 'open' })
//     this.router = router
//     this.href = href
//     this.addEventListener('click', ev => {
//       if (!this.router) throw new Error('No router defined for this router-link')
//       this.router.push(this.href)
//     })
//   }

//   static get observedAttributes () { return ['href'] }

//   attributeChangedCallback (attr, oldValue, newValue) {
//     if (attr === 'href') this.href = newValue
//   }

//   static template () {
//     return html`<slot></slot>`
//   }

//   static style () {
//     return css`
//     :host {
//       cursor: pointer;
//     }
//     `
//   }

//   set href (href) {
//     this._href = href
//   }

//   get href () {
//     return this._href
//   }
// }

const html = (_ => {
  const random = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER).toString(16);
  const regex = new RegExp(`oz-template-placeholder-(\\d*)-${random}`);
  const globalRegex = new RegExp(`oz-template-placeholder-(\\d*)-${random}`, 'g');
  const placeholder = id => `oz-template-placeholder-${id}-${random}`;
  const split = str => str.split(globalRegex);
  const getSplitValueIndexes = split => split.filter((str, i) => i % 2);
  const mergeSplitWithValues = (split, values) => split.map((str, i) => i % 2 ? values[str] : str).join('');
  const mergeSplitWithPlaceholders = strings => strings[0] + [...strings].splice(1).map((str, i) => placeholder(i) + str).join('');
  const indexPlaceholders = placeholders => placeholders.reduce((arr, placeholder) => [...arr, ...(placeholder.indexes || [placeholder.index]).map(id => placeholder)], []);
  const differenceIndexes = (arr1, arr2) => arr1.length >= arr2.length ? arr1.reduce((arr, val, i) => [...arr, ...val === arr2[i] ? [] : [i]], []) : differenceIndexes(arr2, arr1);
  return {
    random,
    regex,
    globalRegex,
    placeholder,
    split,
    getSplitValueIndexes,
    mergeSplitWithValues,
    mergeSplitWithPlaceholders,
    indexPlaceholders,
    differenceIndexes
  }
})();

const css = (_ => {
  const random = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER).toString(16);
  const regex = new RegExp(`oz-template-placeholder-(\\d*)-${random}`);
  const globalRegex = new RegExp(`oz-template-placeholder-(\\d*)-${random}`, 'g');
  const placeholder = id => `oz-template-placeholder-${id}-${random}`;
  const split = str => str.split(globalRegex);
  const getSplitValueIndexes = split => split.filter((str, i) => i % 2);
  const mergeSplitWithValues = (split, values) => split.map((str, i) => i % 2 ? values[str] : str).join('');
  const mergeSplitWithPlaceholders = strings => strings[0] + [...strings].splice(1).map((str, i) => placeholder(i) + str).join('');
  const indexPlaceholders = placeholders => placeholders.reduce((arr, placeholder) => [...arr, ...(placeholder.indexes || [placeholder.index]).map(id => placeholder)], []);
  const differenceIndexes = (arr1, arr2) => arr1.length >= arr2.length ? arr1.reduce((arr, val, i) => [...arr, ...val === arr2[i] ? [] : [i]], []) : differenceIndexes(arr2, arr1);
  return {
    random,
    regex,
    globalRegex,
    placeholder,
    split,
    getSplitValueIndexes,
    mergeSplitWithValues,
    mergeSplitWithPlaceholders,
    indexPlaceholders,
    differenceIndexes
  }
})();

const {
  placeholder,
  split,
  getSplitValueIndexes,
  mergeSplitWithValues,
  mergeSplitWithPlaceholders
} = html;

const attribute = /^\s*([^\s"'<>/=]+)(?:\s*(=)\s*(?:"([^"]*)"+|'([^']*)'+|([^\s"'=<>`]+)))?/;
const ncname = '[a-zA-Z_][\\w\\-\\.]*';
const qnameCapture = `((?:${ncname}\\:)?${ncname})`;
const startTagOpen = new RegExp(`^<${qnameCapture}`);
const startTagClose = /^\s*(\/?)>/;
const endTag = new RegExp(`^<\\/(${qnameCapture}[^>]*)>`);

const parseAttributes = ({leftHTML = '', rightHTML, attributes = []}) => {
  const tagCloseMatch = rightHTML.match(startTagClose);
  if (tagCloseMatch) return { attributes: attributes, leftHTML: leftHTML, rightHTML }
  const match = rightHTML.match(attribute);
  if (!match) throw new SyntaxError(`Oz html template attribute parsing: tag isn't closed.`)
  const attrNameSplit = split(match[1]);
  const attributeValue = match[3] || match[4] || match[5];
  const attrValueSplit = attributeValue ? split(attributeValue) : [''];
  const indexes = [...getSplitValueIndexes(attrNameSplit), ...getSplitValueIndexes(attrValueSplit)];
  return parseAttributes({
    leftHTML: `${leftHTML} ${indexes.length ? placeholder(indexes[0]) : match[0]}`,
    rightHTML: rightHTML.substring(match[0].length),
    attributes: indexes.length ? [...attributes, {
      type: match[3] ? '"' : match[4] ? '\'' : '',
      nameSplit: attrNameSplit,
      valueSplit: attrValueSplit,
      indexes
    }] : attributes
  })
};

const parsePlaceholders = ({ htmlArray, values, placeholders = [], leftHTML = '', rightHTML }) => {
  if (rightHTML === undefined) return parsePlaceholders({ values, rightHTML: mergeSplitWithPlaceholders(htmlArray) })
  if (!rightHTML.length) return { placeholders, html: leftHTML }
  const _textEnd = rightHTML.indexOf('<');
  const isComment = rightHTML.startsWith('<!--');
  if (_textEnd || isComment) {
    const textEnd = _textEnd === -1 ? rightHTML.length : _textEnd;
    const commentEnd = isComment ? rightHTML.indexOf('-->') : undefined;
    if (isComment && commentEnd === -1) throw new Error(`Comment not closed, can't continue the template parsing "${rightHTML.substring(0, textEnd)}"`)
    const textContent = rightHTML.substring(isComment ? 4 : 0, isComment ? commentEnd : textEnd);
    const textSplit = split(textContent);
    const hasPlaceholder = textSplit.length > 1;
    const indexes = getSplitValueIndexes(textSplit);
    return parsePlaceholders({
      values,
      placeholders: hasPlaceholder ? [...placeholders, {
        type: isComment ? 'comment' : 'text',
        indexes: getSplitValueIndexes(textSplit),
        split: textSplit
      }] : placeholders,
      leftHTML: leftHTML + (isComment ? `<!--${hasPlaceholder ? placeholder(indexes[0]) : textContent}-->` : textContent),
      rightHTML: rightHTML.substring(isComment ? commentEnd + 3 : textEnd)
    })
  }
  const startTagMatch = rightHTML.match(startTagOpen);
  if (startTagMatch) {
    const tagSplit = split(startTagMatch[1]);
    const hasPlaceholder = tagSplit.length > 1;
    const indexes = getSplitValueIndexes(tagSplit);
    const {
      attributes,
      leftHTML: _leftHTML,
      rightHTML: _rightHTML
    } = parseAttributes({rightHTML: rightHTML.substring(startTagMatch[0].length)});
    const attributePlaceholders = attributes.map(({type, ...rest}) => ({
      type: 'attribute',
      attributeType: type,
      tag: indexes,
      attributes: attributes.map(({indexes}) => indexes).filter(indexes => rest.indexes !== indexes),
      ...rest
    }));
    return parsePlaceholders({
      values,
      placeholders: [...placeholders, ...hasPlaceholder ? [{
        type: 'tag',
        indexes,
        split: tagSplit,
        attributes: attributes.map(({indexes}) => indexes)
      }] : [],
        ...attributePlaceholders.length ? attributePlaceholders : []],
      leftHTML: `${leftHTML}<${mergeSplitWithValues(tagSplit, values)}${hasPlaceholder ? ` ${placeholder(indexes[0])} ` : ''}${_leftHTML}`,
      rightHTML: _rightHTML
    })
  }
  const endTagMatch = rightHTML.match(endTag);
  if (endTagMatch) {
    const tagSplit = split(endTagMatch[1]);
    return parsePlaceholders({
      values,
      placeholders,
      leftHTML: `${leftHTML}</${mergeSplitWithValues(tagSplit, values)}>`,
      rightHTML: rightHTML.substring(endTagMatch[0].length)
    })
  }
};

const { placeholder: placeholderStr, indexPlaceholders, regex: placeholderRegex, mergeSplitWithValues: mergeSplitWithValues$1, mergeSplitWithPlaceholders: mergeSplitWithPlaceholders$1, split: split$1 } = html;

const getSiblingIndex = ({previousSibling} = {}, i = 0) => previousSibling ? getSiblingIndex(previousSibling, i + 1) : i;

const getNodePath = ({node, node: {parentElement: parent} = {}, path = []}) => parent
  ? getNodePath({node: parent, path: [...path, [...parent.childNodes].indexOf(node)]})
  : [...path, getSiblingIndex(node)].reverse();

const getNode = (node, path) => path.reduce((currNode, i) => currNode.childNodes.item(i), node);

const getValueIndexDifferences = (arr, arr2) => arr2.length > arr.length
  ? getValueIndexDifferences(arr2, arr)
  : arr.reduce((arr, item, i) => [...arr, ...item !== arr2[i] ? [i] : []], []);

const flattenArray$1 = arr => arr.reduce((arr, item) => Array.isArray(item) ? [...arr, ...flattenArray$1(item)] : [...arr, item], []);

const getPlaceholderWithPaths = (node, _placeholders) => {
  const placeholders = _placeholders.reduce((arr, placeholder) => [...arr, ...placeholder.type === 'text'
    ? [...placeholder.indexes.map(index => ({type: 'text', index}))]
    : [placeholder]]
  , []);
  const placeholderByIndex = indexPlaceholders(placeholders);
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_COMMENT + NodeFilter.SHOW_TEXT, null, false);
  const nodes = new Map();
  const paths = new Map();
  const nodesToRemove = [];
  while (walker.nextNode()) {
    const currentNode = walker.currentNode;
    const match = currentNode.nodeValue.match(placeholderRegex);
    if (match) {
      if (currentNode.nodeType === Node.TEXT_NODE) {
        const placeholderNode = currentNode.splitText(match.index);
        placeholderNode.nodeValue = placeholderNode.nodeValue.substring(match[0].length);
        if (placeholderNode.nodeValue.length) placeholderNode.splitText(0);
        if (!currentNode.nodeValue.length) nodesToRemove.push(currentNode); // currentNode.parentNode.removeChild(currentNode)
        nodes.set(placeholderByIndex[match[1]], placeholderNode);
      } else if (currentNode.nodeType === Node.COMMENT_NODE) {
        nodes.set(placeholderByIndex[match[1]], currentNode);
      }
    }
  }
  for (const node of nodesToRemove) node.parentNode.removeChild(node);
  for (const placeholder of placeholders) {
    const type = placeholder.type;
    paths.set(placeholder, getNodePath({node: nodes.get(placeholder)}));
    if (type === 'attribute' || type === 'tag') {
      const attributeName = placeholderStr(placeholder.indexes[0]);
      const foundNode = node.querySelector(`[${attributeName}]`);
      foundNode.removeAttribute(attributeName);
      paths.set(placeholder, getNodePath({node: foundNode}));
    }
  }
  return [...paths].map(([placeholder, path]) => ({...placeholder, path}))
};

const createInstance = ({ id, template, placeholders }, ...values) => {
  const doc = document.importNode(template.content, true);
  let bypassDif = true;
  let childNodes = [...doc.childNodes];
  let listeners = [];
  let placeholdersNodes = new Map(placeholders.map(placeholder => (
    [
      placeholder,
      placeholder.type === 'text' ? [getNode(doc, placeholder.path)] : getNode(doc, placeholder.path)
    ]
  )));
  let placeholdersData = new Map(placeholders.map(placeholder => [placeholder, {}]));
  let placeholderByIndex = indexPlaceholders(placeholders);

  const updatePlaceholder = ({ values, placeholder }) => {
    const currentData = placeholdersData.get(placeholder);
    if (currentData && currentData.directive) currentData.directive(); // cleanup directive function
    const index = placeholder.index || placeholder.indexes[0];
    const directive = values[index];
    const data = placeholdersData.get(placeholder);
    const node = placeholdersNodes.get(placeholder);

    const replaceNode = (newNode, node) => {
      placeholdersNodes = new Map([...placeholdersNodes, [placeholder, newNode]]
        .map(([_placeholder, _node]) => node === _node
        ? [_placeholder, newNode]
        : [_placeholder, _node])
      );
      childNodes = Object.assign([...childNodes], {[childNodes.indexOf(node)]: newNode});
      const { parentNode } = node;
      if (parentNode) {
        parentNode.insertBefore(newNode, node);
        parentNode.removeChild(node);
      }
    };

    const replaceNodes = (newArray, oldArray) => {
      placeholdersNodes = new Map([...placeholdersNodes, [placeholder, newArray]]);
      childNodes = Object.assign([...childNodes], {[childNodes.indexOf(oldArray)]: newArray});
      newArray = flattenArray$1(newArray);
      oldArray = flattenArray$1(oldArray);
      const nodesToRemove = oldArray.filter(node => !newArray.includes(node));
      for (const i in newArray) {
        const newNode = newArray[i];
        const oldNode = oldArray[i];
        if (newNode !== oldNode) {
          if (oldNode && oldNode.parentNode) {
            oldNode.parentNode.insertBefore(newNode, oldNode);
            oldNode.parentNode.removeChild(oldNode);
          } else {
            const previousNewNode = newArray[i - 1];
            if (previousNewNode && previousNewNode.parentNode) {
              previousNewNode.parentNode.insertBefore(newNode, previousNewNode.nextSibling);
              if (oldNode && oldNode.parentNode) oldNode.parentNode.removeChild(oldNode);
            }
          }
        }
      }
      for (const node of nodesToRemove) {
        if (node && node.parentNode) node.parentNode.removeChild(node);
      }
    };

    const setElement = newElement => {
      const element = placeholdersNodes.get(placeholder);
      const elementPlaceholders = placeholder.attributes.map(indexes => placeholderByIndex[indexes[0]]);
      for (const {name, value} of element.attributes) newElement.setAttribute(name, value);
      for (const childNode of element.childNodes) newElement.appendChild(childNode);
      replaceNode(newElement, element);
      for (const placeholder of elementPlaceholders) updatePlaceholder({values, placeholder});
    };
    if (placeholder.type === 'attribute' && placeholder.indexes.length === 1 && directive && directive.directive) { // placeholder value is a directive
      placeholdersData = new Map([...placeholdersData, [
        placeholder,
        { directive: directive({ getElement: placeholdersNodes.get.bind(placeholdersNodes, placeholder), setElement }) }
      ]]);
    } else {
      const updateResult = update[placeholder.type]({
        placeholder,
        values,
        data,
        [placeholder.type === 'text' ? 'nodes' : 'node']: node,
        placeholderByIndex,
        getChildNodes () { return instance._childNodes },
        setChildNodes: newChildNodes => {
          const _childNodes = childNodes;
          childNodes = newChildNodes;
          for (const listener of listeners) listener(childNodes, _childNodes);
        }
      });
      if (placeholder.type === 'text') {
        if (node !== updateResult.nodes) replaceNodes(updateResult.nodes, node);
      } else if (placeholder.type === 'tag' || placeholder.type === 'attribute') {
        if (node !== updateResult.node) setElement(updateResult.node);
      } else {
        if (node !== updateResult.node) replaceNode(updateResult.node, node);
      }
      placeholdersData = new Map([...placeholdersData, [placeholder, updateResult.data]]);
    }
    for (const listener of listeners) listener(childNodes, node);
  };

  const instance = {
    id,
    values,
    instance: true,
    __reactivity__: false,
    get _childNodes () { return childNodes },
    get childNodes () { return flattenArray$1(childNodes) },
    get content () {
      for (const node of instance.childNodes) doc.appendChild(node);
      return doc
    },
    update (...values) {
      const placeholdersToUpdate =
      bypassDif // if bypass, update all the placeholders (first placeholder setup)
      ? placeholders // all placeholders
      : getValueIndexDifferences(values, instance.values) // placeholders which split values has changed
        .map(index => placeholderByIndex[index]) // placeholders
        .filter(placeholder => placeholder && placeholdersNodes.get(placeholder));
      instance.values = values;
      for (const placeholder of placeholdersToUpdate) updatePlaceholder({placeholder, values});
    },
    listen (func) {
      listeners = [...listeners, func];
      return _ => (listeners = Object.assign([...listeners], {[listeners.indexOf(func)]: undefined}).filter(item => item))
    }
  };
  const textPlaceholdersByFirstNode = new Map(placeholders.filter(({type}) => type === 'text').map(placeholder => [placeholdersNodes.get(placeholder)[0], placeholder]));
  childNodes = childNodes.reduce((arr, node) =>
    textPlaceholdersByFirstNode.has(node)
    ? [...arr, placeholdersNodes.get(textPlaceholdersByFirstNode.get(node))]
    : [...arr, node]
  , []);
  instance.update(...values);
  bypassDif = false;
  return instance
};

const createBuild = ({id, html: html$$1, placeholders: _placeholders}) => {
  const template = document.createElement('template');
  template.innerHTML = html$$1;
  const placeholders = getPlaceholderWithPaths(template.content, _placeholders);
  return values => {
    const _createInstance = createInstance.bind(null, { id, template, placeholders }, ...values);
    _createInstance.build = true;
    _createInstance.id = id;
    _createInstance.values = values;
    return _createInstance
  }
};

const cache = new Map();

const htmlTemplate = transform => (strings, ...values) => {
  const id = strings.join(placeholderStr(''));
  if (cache.has(id)) return cache.get(id)(values)
  const { html: html$$1, placeholders } = parsePlaceholders({htmlArray: split$1(transform(mergeSplitWithPlaceholders$1(strings))).filter((str, i) => !(i % 2)), values});
  const placeholdersWithFixedTextPlaceholders = placeholders.reduce((arr, placeholder) => [...arr,
    ...placeholder.type === 'text'
    ? placeholder.indexes.map(index => ({ type: 'text', indexes: [index], split: ['', index, ''] }))
    : [placeholder]
  ], []);
  const build = createBuild({ id, html: html$$1, placeholders: placeholdersWithFixedTextPlaceholders });
  cache.set(id, build);
  return build(values)
};

const html$1 = htmlTemplate(str => str);

const update = {
  comment ({ values, node, placeholder: { split } }) {
    node.nodeValue = mergeSplitWithValues$1(split, values);
    return { node }
  },
  text ({
    value,
    values,
    getChildNodes,
    setChildNodes,
    nodes = [],
    data: { instance: oldInstance, unlisten: oldUnlisten, textArray: oldTextArray = [] } = {},
    placeholder: { index } = {}
  }) {
    if (oldUnlisten) oldUnlisten();
    if (values && !value) value = values[index];
    if (typeof value === 'string' || typeof value === 'number') {
      if (nodes[0] instanceof Text) {
        if (nodes[0].nodeValue !== value) nodes[0].nodeValue = value;
        return { nodes: [nodes[0]] }
      } else {
        return { nodes: [new Text(value)] }
      }
    } else if (value instanceof Node) {
      if (nodes[0] !== value) return { nodes: [value] }
    } else if (value && value.build) {
      if (oldInstance && oldInstance.instance && oldInstance.id === value.id) {
        oldInstance.update(...value.values);
        return { nodes: oldInstance._childNodes, data: { instance: oldInstance } }
      } else {
        const instance = value();
        const unlisten = instance.listen((newChildNodes, oldChildNodes) => {
          setChildNodes(newChildNodes);
          // const currentChildNodes = getChildNodes()
          // setChildNodes(Object.assign([...currentChildNodes], {[currentChildNodes.indexOf(oldChildNodes)]: newChildNodes}))
        });
        return { nodes: instance._childNodes, data: { instance, unlisten } }
      }
    } else if (value && value.instance) {
      const unlisten = value.listen((newChildNodes, oldChildNodes) => {
        setChildNodes(newChildNodes);
      });
      return { nodes: value._childNodes, data: { instance: value, unlisten } }
    } else if (Array.isArray(value)) {
      // todo: add more of the parameters to cover all of the simple text features
      const textArray = value.map((value, i) => {
        const oldText = oldTextArray[i];
        const text = update.text({
          value,
          nodes: oldText && oldText.nodes,
          data: oldText && oldText.data
        });
        return text
      });
      return { nodes: textArray.map(({nodes}) => nodes), data: { textArray } }
    } else {
      return { nodes: [ nodes[0] instanceof Comment ? nodes[0] : new Comment('') ] }
    }
  },
  tag: ({ values, node, placeholder: { split } }) => {
    const newTag = mergeSplitWithValues$1(split, values);
    return {
      node: node.tagName.toLowerCase() === newTag.toLowerCase()
        ? node
        : document.createElement(newTag)
    }
  },
  attribute ({ values, placeholder, node, data: { name: oldName, listener: oldListener, value: oldValue } = {}, placeholder: { attributeType, nameSplit, valueSplit } }) {
    if (oldListener) node.removeEventListener(oldName, oldValue);
    const name = mergeSplitWithValues$1(nameSplit, values);
    const value = attributeType === '' ? values[valueSplit[1]] : mergeSplitWithValues$1(valueSplit, values); // mergeSplitWithValues(valueSplit, values)
    if (attributeType === '"') { // double-quote
      node.setAttribute(name, value);
    } else if (attributeType === '\'') {  // single-quote
      node.setAttribute(name, value);
    } else if (attributeType === '') {  // no-quote
      let isEvent = name.startsWith('on-') ? 1 : name.startsWith('@') ? 2 : 0;
      if (isEvent) { // Event handling
        const listenerName = name.substring(isEvent === 1 ? 3 : 1);
        const listener = node.addEventListener(listenerName, value);
        return { node, data: { name, listener, value } }
      } else {
        node[name] = value;
      }
    }
    return {node, data: { name }}
  }
};

const getRouterViewPosition = ({parentElement}, n = 0) => parentElement
  ? getRouterViewPosition(parentElement, n + parentElement instanceof RouterView ? 1 : 0)
  : n;

const template = ({state: {components}}) => html$1`${components}`;

const RouterView = customElements.get('router-view') || registerElement({
  name: 'router-view',
  props: ['name'],
  template,
  state: ctx => ({
    get components () {
      const { router: { currentRoutesComponents, currentRoute: { matched } = {} } = {}, props: { name = 'default' } } = ctx;
      if (matched) {
        const routeConfig = matched[getRouterViewPosition(ctx.host)];
        return currentRoutesComponents.has(routeConfig) && currentRoutesComponents.get(routeConfig)/* components */.get(name)/* component */
      }
    }
  })
});

/*
The MIT License (MIT)

Copyright (c) 2014 Blake Embrey (hello@blakeembrey.com)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
*/

/**
 * Default configs.
 */
var DEFAULT_DELIMITER = '/';
var DEFAULT_DELIMITERS = './';

/**
 * The main path matching regexp utility.
 *
 * @type {RegExp}
 */
var PATH_REGEXP = new RegExp([
  // Match escaped characters that would otherwise appear in future matches.
  // This allows the user to escape special characters that won't transform.
  '(\\\\.)',
  // Match Express-style parameters and un-named parameters with a prefix
  // and optional suffixes. Matches appear as:
  //
  // "/:test(\\d+)?" => ["/", "test", "\d+", undefined, "?"]
  // "/route(\\d+)"  => [undefined, undefined, undefined, "\d+", undefined]
  '(?:\\:(\\w+)(?:\\(((?:\\\\.|[^\\\\()])+)\\))?|\\(((?:\\\\.|[^\\\\()])+)\\))([+*?])?'
].join('|'), 'g');

/**
 * Parse a string for the raw tokens.
 *
 * @param  {string}  str
 * @param  {Object=} options
 * @return {!Array}
 */
function parse (str, options) {
  var tokens = [];
  var key = 0;
  var index = 0;
  var path = '';
  var defaultDelimiter = (options && options.delimiter) || DEFAULT_DELIMITER;
  var delimiters = (options && options.delimiters) || DEFAULT_DELIMITERS;
  var pathEscaped = false;
  var res;

  while ((res = PATH_REGEXP.exec(str)) !== null) {
    var m = res[0];
    var escaped = res[1];
    var offset = res.index;
    path += str.slice(index, offset);
    index = offset + m.length;

    // Ignore already escaped sequences.
    if (escaped) {
      path += escaped[1];
      pathEscaped = true;
      continue
    }

    var prev = '';
    var next = str[index];
    var name = res[2];
    var capture = res[3];
    var group = res[4];
    var modifier = res[5];

    if (!pathEscaped && path.length) {
      var k = path.length - 1;

      if (delimiters.indexOf(path[k]) > -1) {
        prev = path[k];
        path = path.slice(0, k);
      }
    }

    // Push the current path onto the tokens.
    if (path) {
      tokens.push(path);
      path = '';
      pathEscaped = false;
    }

    var partial = prev !== '' && next !== undefined && next !== prev;
    var repeat = modifier === '+' || modifier === '*';
    var optional = modifier === '?' || modifier === '*';
    var delimiter = prev || defaultDelimiter;
    var pattern = capture || group;

    tokens.push({
      name: name || key++,
      prefix: prev,
      delimiter: delimiter,
      optional: optional,
      repeat: repeat,
      partial: partial,
      pattern: pattern ? escapeGroup(pattern) : '[^' + escapeString(delimiter) + ']+?'
    });
  }

  // Push any remaining characters.
  if (path || index < str.length) {
    tokens.push(path + str.substr(index));
  }

  return tokens
}

/**
 * Compile a string to a template function for the path.
 *
 * @param  {string}             str
 * @param  {Object=}            options
 * @return {!function(Object=, Object=)}
 */
function compile (str, options) {
  return tokensToFunction(parse(str, options))
}

/**
 * Expose a method for transforming tokens into the path function.
 */
function tokensToFunction (tokens) {
  // Compile all the tokens into regexps.
  var matches = new Array(tokens.length);

  // Compile all the patterns before compilation.
  for (var i = 0; i < tokens.length; i++) {
    if (typeof tokens[i] === 'object') {
      matches[i] = new RegExp('^(?:' + tokens[i].pattern + ')$');
    }
  }

  return function (data, options) {
    var path = '';
    var encode = (options && options.encode) || encodeURIComponent;

    for (var i = 0; i < tokens.length; i++) {
      var token = tokens[i];

      if (typeof token === 'string') {
        path += token;
        continue
      }

      var value = data ? data[token.name] : undefined;
      var segment;

      if (Array.isArray(value)) {
        if (!token.repeat) {
          throw new TypeError('Expected "' + token.name + '" to not repeat, but got array')
        }

        if (value.length === 0) {
          if (token.optional) continue

          throw new TypeError('Expected "' + token.name + '" to not be empty')
        }

        for (var j = 0; j < value.length; j++) {
          segment = encode(value[j]);

          if (!matches[i].test(segment)) {
            throw new TypeError('Expected all "' + token.name + '" to match "' + token.pattern + '"')
          }

          path += (j === 0 ? token.prefix : token.delimiter) + segment;
        }

        continue
      }

      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        segment = encode(String(value));

        if (!matches[i].test(segment)) {
          throw new TypeError('Expected "' + token.name + '" to match "' + token.pattern + '", but got "' + segment + '"')
        }

        path += token.prefix + segment;
        continue
      }

      if (token.optional) {
        // Prepend partial segment prefixes.
        if (token.partial) path += token.prefix;

        continue
      }

      throw new TypeError('Expected "' + token.name + '" to be ' + (token.repeat ? 'an array' : 'a string'))
    }

    return path
  }
}

/**
 * Escape a regular expression string.
 *
 * @param  {string} str
 * @return {string}
 */
function escapeString (str) {
  return str.replace(/([.+*?=^!:${}()[\]|/\\])/g, '\\$1')
}

/**
 * Escape the capturing group by escaping special characters and meaning.
 *
 * @param  {string} group
 * @return {string}
 */
function escapeGroup (group) {
  return group.replace(/([=!:$/()])/g, '\\$1')
}

/**
 * Get the flags for a regexp from the options.
 *
 * @param  {Object} options
 * @return {string}
 */
function flags (options) {
  return options && options.sensitive ? '' : 'i'
}

/**
 * Pull out keys from a regexp.
 *
 * @param  {!RegExp} path
 * @param  {Array=}  keys
 * @return {!RegExp}
 */
function regexpToRegexp (path, keys) {
  if (!keys) return path

  // Use a negative lookahead to match only capturing groups.
  var groups = path.source.match(/\((?!\?)/g);

  if (groups) {
    for (var i = 0; i < groups.length; i++) {
      keys.push({
        name: i,
        prefix: null,
        delimiter: null,
        optional: false,
        repeat: false,
        partial: false,
        pattern: null
      });
    }
  }

  return path
}

/**
 * Transform an array into a regexp.
 *
 * @param  {!Array}  path
 * @param  {Array=}  keys
 * @param  {Object=} options
 * @return {!RegExp}
 */
function arrayToRegexp (path, keys, options) {
  var parts = [];

  for (var i = 0; i < path.length; i++) {
    parts.push(pathToRegexp(path[i], keys, options).source);
  }

  return new RegExp('(?:' + parts.join('|') + ')', flags(options))
}

/**
 * Create a path regexp from string input.
 *
 * @param  {string}  path
 * @param  {Array=}  keys
 * @param  {Object=} options
 * @return {!RegExp}
 */
function stringToRegexp (path, keys, options) {
  return tokensToRegExp(parse(path, options), keys, options)
}

/**
 * Expose a function for taking tokens and returning a RegExp.
 *
 * @param  {!Array}  tokens
 * @param  {Array=}  keys
 * @param  {Object=} options
 * @return {!RegExp}
 */
function tokensToRegExp (tokens, keys, options) {
  options = options || {};

  var strict = options.strict;
  var end = options.end !== false;
  var delimiter = escapeString(options.delimiter || DEFAULT_DELIMITER);
  var delimiters = options.delimiters || DEFAULT_DELIMITERS;
  var endsWith = [].concat(options.endsWith || []).map(escapeString).concat('$').join('|');
  var route = '';
  var isEndDelimited = false;

  // Iterate over the tokens and create our regexp string.
  for (var i = 0; i < tokens.length; i++) {
    var token = tokens[i];

    if (typeof token === 'string') {
      route += escapeString(token);
      isEndDelimited = i === tokens.length - 1 && delimiters.indexOf(token[token.length - 1]) > -1;
    } else {
      var prefix = escapeString(token.prefix);
      var capture = token.repeat
        ? '(?:' + token.pattern + ')(?:' + prefix + '(?:' + token.pattern + '))*'
        : token.pattern;

      if (keys) keys.push(token);

      if (token.optional) {
        if (token.partial) {
          route += prefix + '(' + capture + ')?';
        } else {
          route += '(?:' + prefix + '(' + capture + '))?';
        }
      } else {
        route += prefix + '(' + capture + ')';
      }
    }
  }

  if (end) {
    if (!strict) route += '(?:' + delimiter + ')?';

    route += endsWith === '$' ? '$' : '(?=' + endsWith + ')';
  } else {
    if (!strict) route += '(?:' + delimiter + '(?=' + endsWith + '))?';
    if (!isEndDelimited) route += '(?=' + delimiter + '|' + endsWith + ')';
  }

  return new RegExp('^' + route, flags(options))
}

/**
 * Normalize the given path string, returning a regular expression.
 *
 * An empty array can be passed in for the keys, which will hold the
 * placeholder key descriptions. For example, using `/user/:id`, `keys` will
 * contain `[{ name: 'id', delimiter: '/', optional: false, repeat: false }]`.
 *
 * @param  {(string|RegExp|Array)} path
 * @param  {Array=}                keys
 * @param  {Object=}               options
 * @return {!RegExp}
 */
function pathToRegexp (path, keys, options) {
  if (path instanceof RegExp) {
    return regexpToRegexp(path, keys)
  }

  if (Array.isArray(path)) {
    return arrayToRegexp(/** @type {!Array} */ (path), keys, options)
  }

  return stringToRegexp(/** @type {string} */ (path), keys, options)
}

mixin(({context, parentContext, options}) => {
  if (options && options.router) {
    context.router = options.router;
    context.router.__rootElementContext__ = context;
  } else if (parentContext && parentContext.router) context.router = parentContext.router;
});

const flattenRoutes = (routes, __path = '', parent) => {
  let map = new Map();
  for (const route of routes) {
    const { path, children } = route;
    const childPath = __path + path;
    const keys = [];
    const _route = {...cloneObject(route), ...parent && {parent}, keys, regex: pathToRegexp(childPath, keys), toPath: compile(childPath)};
    map.set(childPath, _route);
    if (children) {
      for (const [_path, child] of flattenRoutes(children, childPath, _route)) {
        map.set(_path, child);
      }
    }
  }
  return map
};

const getRouteComponents = route => [...route.component ? [['default', route.component]] : [], ...route.components ? Object.entries(route.components) : []];

const createRouteComponents = route => new Map([...getRouteComponents(route)].map(([name, Component]) => ([name, document.createElement(Component.name)])));

const flattenRoute = (route, arr = [route]) => route.parent ? flattenRoute(route.parent, [route.parent, ...arr]) : arr;

const Router = options => {
  const base = '/' + (options.base || '').replace(/^\//g, '');
  const originBase = window.location.origin + base;
  const flattenedRoutes = options.routes ? flattenRoutes(options.routes) : undefined;
  const state = reactify({
    fullPath: location.href,
    routes: flattenedRoutes || new Map(),
    routesComponentsConstructors: new Map([...flattenedRoutes].map(([route]) => [route, getRouteComponents(route)])),
    base,
    currentRoute: undefined,
    currentRoutesComponents: new Map()
  });

  let beforeEachGuards = [];
  let beforeResolveGuards = [];
  let afterEachHooks = [];

  const matchPath = path => [...state.routes].find(([, route]) => route.regex.exec(path));
  const matchName = name => [...state.routes].find(([, route]) => route.name === name);

  const resolve = (to, { append, relative } = {}) => {
    const { origin, pathname } = window.location;
    const _base = append || relative ? origin + pathname : originBase;
    const isString = typeof to === 'string';
    const { name, path, params, query = [] } = to || {};
    const [, route] = isString
      ? matchPath(to)
      : name
        ? matchName(name)
        : matchPath(path);
    return {
      route,
      url: isString
        ? new URL(to, _base)
        : new URL(`${path || route.toPath(params)}${query.map(([key, val], i) => `${!i ? '?' : ''}${key}=${val}`).join('&')}`, _base)
    }
  };

  const goTo = async (replace, to) => {
    const { url, route } = resolve(to);
    const matched = flattenRoute(route);
    const { currentRoutesComponents, currentRoute } = state;

    const newRoute = {
      url,
      path: url.pathname,
      params: (route.regex.exec(url.pathname).filter((item, i) => i) || []).reduce((params, val, i) => ({...params, [route.keys[i].name]: val}), {}),
      query: [...url.searchParams],
      hash: url.hash,
      fullPath: url.href,
      matched,
      __rootElementContext__: undefined
    };
    const activatedRoutes = currentRoute ? matched.filter(route => !currentRoute.matched.includes(route)) : matched;
    const reusedRoutes = currentRoute ? matched.filter(route => currentRoute.matched.includes(route)) : [];
    const deactivatedRoutes = currentRoute ? currentRoute.matched.filter(route => !matched.includes(route)) : [];

    const reusedComponents = new Map(reusedRoutes.map(route => [route, currentRoutesComponents.get(route)]));
    const deactivatedComponents = new Map(deactivatedRoutes.map(route => [route, currentRoutesComponents.get(route)]));

    const abortResults = (results, guardFunctionName, reverse) => {
      const abort = results.find(result => reverse ? !result : result);
      if (abort) throw new Error(`OzRouter: naviguation aborted, ${guardFunctionName} returned:\n${JSON.stringify(abort)}`)
    };

    const callComponentsGuards = async (components, guardFunctionName) => {
      abortResults(await Promise.all(components.map(component => {
        const { __context__: context } = component;
        if (!component[guardFunctionName]) return
        return component[guardFunctionName](context || newRoute, context ? newRoute : currentRoute, context ? currentRoute : undefined)
      }).filter(elem => elem)), guardFunctionName);
    };
    await callComponentsGuards(flattenArray([...deactivatedComponents.values()]), 'beforeRouteLeave');

    const beforeEachAbort = (await Promise.all(beforeEachGuards.map(guard => guard(newRoute, currentRoute)))).find(result => result);
    if (beforeEachAbort) throw new Error(`OzRouter: naviguation aborted, beforeEach returned:\n${JSON.stringify(beforeEachAbort)}`)

    await callComponentsGuards(flattenArray([...reusedComponents.values()]), 'beforeRouteUpdate');

    if (route.beforeEnter) {
      const abort = await route.beforeEnter(newRoute, currentRoute);
      if (abort) throw new Error(`OzRouter: naviguation aborted, beforeEnter returned:\n${JSON.stringify(abort)}`)
    }

    // todo: async route components ?

    abortResults(await Promise.all(flattenArray(activatedRoutes.map(route =>
      [...getRouteComponents(route)]
      .filter(Component => Object.getPrototypeOf(Component).beforeRouteEnter)
      .map(Component => Object.getPrototypeOf(Component).beforeRouteEnter.apply(null, null, newRoute, currentRoute))
    ))), 'beforeRouteEnter', true);

    const activatedComponents = pushContext(state.___rootElementContext__, _ => new Map(activatedRoutes.map(route => [route, createRouteComponents(route)])));

    state.currentRoutesComponents = new Map([...reusedComponents, ...activatedComponents]);

    const beforeResolveAbort = (await Promise.all(beforeResolveGuards.map(guard => guard(newRoute, currentRoute)))).find(result => result);
    if (beforeResolveAbort) throw new Error(`OzRouter: naviguation aborted, beforeResolve returned:\n${JSON.stringify(beforeResolveAbort)}`)

    state.currentRoute = newRoute;
    window.history[replace ? 'replaceState' : 'pushState']({}, '', newRoute.fullPath);

    afterEachHooks.forEach(hook => hook(newRoute, currentRoute));
  };

  const router = reactify({
    set __rootElementContext__ (__rootElementContext__) { state.___rootElementContext__ = __rootElementContext__; },
    get __rootElementContext__ () { return state.___rootElementContext__ },
    get url () { return new URL(state.fullPath) },
    get path () { return router.url.pathname },
    get hash () { return router.url.hash },
    get query () { return state.currentRoute.query },
    get params () { return state.currentRoute.params },
    get matched () { return state.currentRoute.matched },
    get name () { return state.currentRoute.matched[state.currentRoute.matched.length - 1].name },
    get currentRoute () { return state.currentRoute },
    get currentRoutesComponents () { return state.currentRoutesComponents },
    back () { return router.go(-1) },
    forward () { return router.go(1) },
    go (num) { return window.history.go(num) },
    match: resolve,
    push: goTo.bind(null, false),
    replace: goTo.bind(null, true)
  });
  window.addEventListener('popstate', ev => router.replace(location.pathname));
  router.replace(location.pathname);
  return router
};

const { placeholder: placeholderStr$1, split: split$2, getSplitValueIndexes: getSplitIds, mergeSplitWithValues: execSplit } = css;

async function setPlaceholdersPaths (sheet, placeholders, values) {
  const rules = sheet.cssRules;
  const arrRules = [...rules];
  for (const rulesI in arrRules) {
    const rule = arrRules[rulesI];
    if (!rule.cssText.includes('var(--oz-template-placeholder-')) continue
    for (const style of rule.style) {
      const val = rule.style[style];
      if (val.includes('var(--oz-template-placeholder-')) {
        const valSplit = split$2(val);
        placeholders.push({
          type: 'value',
          ids: getSplitIds(valSplit),
          path: ['rules', rulesI, 'style', style],
          split: valSplit
        });
      }
    }
  }
}

const getStyle = (path, sheet) => path.reduce((item, i) => item[i], sheet);

const cssTemplate = (parser, options) => {
  const cache = new Map();
  return (_strings, ...values) => {
    const strings = [..._strings];
    const id = strings.join(placeholderStr$1(''));
    const cached = cache.get(id);
    if (cached) return cached(...values)
    const { css: css$$1 } = parser(strings, values);
    const placeholders = [];
    const style = document.createElement('style');
    style.type = 'text/css';
    style.innerHTML = css$$1;
    document.body.appendChild(style);
    setPlaceholdersPaths(style.sheet, placeholders, values); // setPlaceholdersPaths is async to make firefox gucci since they deal asynchronously with css parsing
    document.body.removeChild(style);
    const createCachedInstance = (...values) => {
      const createInstance = _ => {
        const node = style.cloneNode(true);
        const instance = {
          values: [],
          update (...values) {
            if (values.length) instance.values = values;
            else values = instance.values;
            const { sheet } = node;
            if (!sheet) return
            for (const placeholder of placeholders) {
              const path = [...placeholder.path];
              const name = path.splice(-1, 1);
              let styleDeclaration = getStyle(path, sheet);
              switch (placeholder.type) {
                case 'value':
                  setTimeout(_ => (styleDeclaration[name] = execSplit(placeholder.split, values).slice(6, -1)), 0);
                  break
              }
            }
          },
          content: node
        };
        instance.update(...values);
        return instance
      };
      createInstance.id = id;
      createInstance.values = values;
      return createInstance
    };
    cache.set(id, createCachedInstance);
    return createCachedInstance(...values)
  }
};

const { placeholder: placeholder$1 } = css;

const css$1 = cssTemplate((source, values) => {
  let src = source[0];
  for (const i in values) {
    if (i === 0) continue
    src += `var(--${placeholder$1(i)})${source[parseInt(i) + 1]}`;
  }
  return {css: src}
});
// todo: add features with a css parser, https://github.com/reworkcss/css/blob/master/lib/parse/index.js

const { regex: placeholderRegex$1 } = html;

const voidTags = ['area', 'base', 'br', 'col', 'command', 'embed', 'hr', 'img', 'input', 'keygen', 'link', 'menuitem', 'meta', 'param', 'source', 'track', 'wbr'];

// todo: rework this file + add way to escape '.' in tag name

const lineRegex = /^(\s*)(?:([.#\w-]*)(?:\((.*)\))?)(?: (.*))?/;

const identifiersRegex = /([#.])([a-z0-9-]*)/g;
const classRegex = /class="(.*)"/;

const makeHTML = ({tag, attributes, childs, textContent, id, classList}) => {
  const classStr = classList.join(' ');
  let attrStr = attributes ? ' ' + attributes : '';
  if (attrStr.match(classRegex)) attrStr = attrStr.replace(classRegex, (match, classes) => `class="${classes} ${classStr}"`);
  else if (classStr) attrStr += ` class="${classStr}"`;
  if (tag) return `<${tag}${id ? ` id="${id}"` : ''}${attrStr}>${textContent || ''}${childs.map(line => makeHTML(line)).join('')}${voidTags.includes(tag) ? '' : `</${tag}>`}`
  else return '\n' + textContent
};

const pushLine = ({childs: currentChilds}, line) => {
  if (currentChilds.length && currentChilds[currentChilds.length - 1].indentation < line.indentation) pushLine(currentChilds[currentChilds.length - 1], line);
  else currentChilds.push(line);
};
const hierarchise = arr => {
  const hierarchisedArr = [];
  for (let line of arr) {
    if (hierarchisedArr.length && hierarchisedArr[hierarchisedArr.length - 1].indentation < line.indentation) pushLine(hierarchisedArr[hierarchisedArr.length - 1], line);
    else hierarchisedArr.push(line);
  }
  return hierarchisedArr
};

const pozToHTML = str => {
  const srcArr = str.split('\n').filter(line => line.trim().length).map(line => {
    const lineMatch = line.match(lineRegex);
    const tag = lineMatch[2].match(/([a-z0-9-]*)/)[1];
    const identifiers = lineMatch[2].slice(tag.length);
    const matches = [];
    let match, id;
    while ((match = identifiersRegex.exec(identifiers))) matches.push(match);
    const classList = [];
    for (const item of matches) item[1] === '#' ? id = item[2] : undefined; // eslint-disable-line
    for (const item of matches) item[1] === '.' ? classList.push(item[2]) : undefined; // eslint-disable-line
    const isText = line.trimLeft()[0] === '|';
    let textContent = isText ? line.trimLeft().slice(2) : lineMatch[4];
    const isTemplate = tag && !tag.replace(placeholderRegex$1, '').length;
    if (isTemplate) textContent = tag;
    return {
      indentation: lineMatch[1].length,
      tag: isText || isTemplate ? undefined : tag || 'div',
      attributes: lineMatch[3],
      id,
      classList,
      textContent,
      childs: []
    }
  });
  const hierarchisedArr = hierarchise(srcArr);
  const html$$1 = hierarchisedArr.map(line => makeHTML(line)).join('');
  return html$$1
};

const poz = htmlTemplate(pozToHTML);

const bind = (obj, prop, event) => {
  const func = ({getElement}) => {
    const element = getElement();
    element.value = obj[prop];
    let unwatch = watch(_ => obj[prop], value => (element.value = value));
    const listener = ({target: {value}}) => event ? undefined : (obj[prop] = value);
    let event = element.addEventListener('input', listener);
    return _ => {
      unwatch();
      element.removeEventListener('input', listener);
    }
  };
  func.directive = true;
  return func
};

exports.setDefaultReactiveRoot = setDefaultReactiveRoot;
exports.IsIgnoredObjectType = IsIgnoredObjectType;
exports.reactify = reactify;
exports.watch = watch;
exports.registerElement = registerElement;
exports.mixin = mixin;
exports.pushContext = pushContext;
exports.RouterView = RouterView;
exports.Router = Router;
exports.html = html$1;
exports.css = css$1;
exports.poz = poz;
exports.bind = bind;
exports.UUID = UUID;
exports.isObject = isObject;
exports.flattenArray = flattenArray;
exports.builtInObjects = builtInObjects;
exports.isBuiltIn = isBuiltIn;
exports.isIgnoredObjectType = isIgnoredObjectType;
exports.cloneObject = cloneObject;
exports.getPropertyDescriptorPair = getPropertyDescriptorPair;
exports.hasProperty = hasProperty;
exports.getPropertyDescriptor = getPropertyDescriptor;
exports.getPropertyDescriptorPrototype = getPropertyDescriptorPrototype;