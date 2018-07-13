import { r, reactivity } from '../src/index.js'

describe('reactify', () => {
  it('accept an option = { immutable: Boolean } argument', () => {
    expect(_ => r({}, { immutable: true })).to.not.throw()
  })
})

describe('Reactive Object', () => {
  let originalObject
  beforeEach(() => {
    originalObject = {
      a: 1,
      b: 2,
      get c () {
        return this.a + this.b
      },
      d: {
        e: 10
      }
    }
    originalObject.d.r = originalObject
  })
  xdescribe('Object', () => {
    let react
    beforeEach(() => {
      react = r(originalObject, { immutable: true })
    })
    describe('--immutable', () => {
      it(`can't mutate`, () => {
        react.a = 2
        expect(react).to.deep.eql(originalObject)
      })
      it('#$watch', () => {
        react.$watch(newVal => (react = newVal))
      })
    })
  })
  describe('Object', () => {
    let react
    beforeEach(() => {
      react = r(originalObject)
    })
    describe(`#[${reactivity.toString()}]`, () => {
      it(`is accessible with the 'reactivity' named export`, () => {
        expect(react).to.have.property(reactivity)
      })
      it(`is accessible with Symbol.for('OzReactivity')`, () => {
        expect(react).to.have.property(Symbol.for('OzReactivity'))
      })
      it('is an object', () => {
        expect(react).to.have.property(reactivity).that.is.a('object')
      })
      it('is non-enumerable ', () => {
        expect(Object.getOwnPropertyDescriptor(react, reactivity)).to.have.property('enumerable').that.equals(false)
      })
    })
    describe('#$watch', () => {
      it('is a function', () => {
        expect(react).to.have.property('$watch').that.is.a('function')
      })
      it('is non-enumerable ', () => {
        expect(Object.getOwnPropertyDescriptor(react, '$watch')).to.have.property('enumerable').that.equals(false)
      })
      it('accept a function as single argument', () => {
        expect(react.$watch(_ => {})).to.not.throw()
      })
      it('accept a string|function and function as arguments', () => {
        expect(_ => react.$watch('', _ => {})).to.not.throw()
        expect(_ => react.$watch(_ => {}, _ => {})).to.not.throw()
      })
      it('watch specific property change', () => {
        let changed
        react.$watch('a', _ => (changed = true))
        react.a = 2
        expect(changed).to.equal(true)
      })
      it('watch specific getter change', () => {
        let changed
        react.$watch('c', _ => (changed = true))
        react.a = 2
        expect(changed).to.equal(true)
      })
      it('watch object change', () => {
        let changed
        react.$watch(_ => (changed = true))
        react.a = 2
        expect(changed).to.equal(true)
      })
      it('return a function', () => {
        expect(react.$watch(_ => {})).to.be.a('function')
      })
      it(`doesn't deeply watch changes`, () => {
        let changed
        react.$watch(_ => (changed = true))
        react.d.e = 0
        expect(changed).to.equal(undefined)
      })
      it(`--deep to deeply watch changes`, () => {
        let changed
        react.$watch(_ => (changed = true), { deep: true })
        react.d.e = 0
        expect(changed).to.equal(true)
      })
      describe('unwatch', () => {
        it('unregister the watcher', () => {
          let changed
          react.$watch(_ => (changed = true))()
          react.a = 2
          expect(changed).to.equal(undefined)
        })
        it('return undefined', () => {
          expect(react.$watch(_ => {})()).to.be.equal(undefined)
        })
      })
    })
  })
  describe('Array', () => {
    let react
    beforeEach(() => {
      react = r([1, 2])
    })
    it('watch array change', () => {
      let changed
      react.$watch(_ => (changed = true))
      react.push(3)
      expect(changed).to.equal(true)
    })
    it('watch specific index change', () => {
      let changed
      react.$watch(1, _ => (changed = true))
      react.splice(1, 1)
      expect(changed).to.equal(true)
    })
  })
  describe('Map', () => {
    let react
    beforeEach(() => {
      react = r(new Map([[0, 0], [1, 1]]))
    })
    it('watch map change', () => {
      let changed
      react.$watch(_ => (changed = true))
      react.set(2, 2)
      expect(changed).to.equal(true)
    })
    it('watch specific value|reference change', () => {
      let changed
      react.$watch(1, _ => (changed = true))
      react.set(1, 2)
      expect(changed).to.equal(true)
    })
  })
  describe('Set', () => {
    let react
    beforeEach(() => {
      react = r(new Set([0, 1]))
    })
    it('watch set change', () => {
      let changed
      react.$watch(_ => (changed = true))
      react.add(3)
      expect(changed).to.equal(true)
    })
    it('watch specific value|reference change', () => {
      let changed
      react.$watch(3, _ => (changed = true))
      react.add(3)
      expect(changed).to.equal(true)
    })
  })
})
