import test from 'ava'

import { ChiaBlockListener, initTracing } from '../index.js'

test('exports', (t) => {
  t.assert(ChiaBlockListener);
  t.assert(initTracing);
})

test('ChiaBlockListener can be instantiated', (t) => {
  const listener = new ChiaBlockListener();
  t.assert(listener instanceof ChiaBlockListener);
})

test('ChiaBlockListener has expected methods', (t) => {
  const listener = new ChiaBlockListener();
  t.is(typeof listener.addPeer, 'function');
  t.is(typeof listener.disconnectPeer, 'function');
  t.is(typeof listener.disconnectAllPeers, 'function');
  t.is(typeof listener.getConnectedPeers, 'function');
  t.is(typeof listener.on, 'function');
  t.is(typeof listener.off, 'function');
  t.is(typeof listener.getBlockByHeight, 'function');
  t.is(typeof listener.getBlocksRange, 'function');
  t.is(typeof listener.processTransactionGenerator, 'function');
})

test('initTracing is a function', (t) => {
  t.is(typeof initTracing, 'function');
}) 