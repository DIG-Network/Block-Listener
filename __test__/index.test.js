const test = require('ava')

test('module exports are available', t => {
  const { ChiaBlockListener, initTracing } = require('../index.js')
  
  // Verify exports exist
  t.is(typeof ChiaBlockListener, 'function', 'ChiaBlockListener should be a function')
  t.is(typeof initTracing, 'function', 'initTracing should be a function')
})

test('ChiaBlockListener can be instantiated', t => {
  const { ChiaBlockListener } = require('../index.js')
  
  // Verify we can create an instance
  const listener = new ChiaBlockListener()
  t.truthy(listener, 'ChiaBlockListener instance should be created')
  t.is(typeof listener, 'object', 'ChiaBlockListener instance should be an object')
})

test('initTracing can be called', t => {
  const { initTracing } = require('../index.js')
  
  // Verify initTracing can be called without throwing
  t.notThrows(() => {
    initTracing()
  }, 'initTracing should not throw when called')
}) 