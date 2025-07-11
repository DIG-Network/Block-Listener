const test = require('ava');
const { ChiaBlockListener } = require('../index.js');

test('can create ChiaBlockListener instance', t => {
  const listener = new ChiaBlockListener();
  t.truthy(listener);
});

test('ChiaBlockListener has expected methods', t => {
  const listener = new ChiaBlockListener();
  t.is(typeof listener.addPeer, 'function');
  t.is(typeof listener.start, 'function');
  t.is(typeof listener.stop, 'function');
  t.is(typeof listener.sync, 'function');
  t.is(typeof listener.discoverPeers, 'function');
}); 