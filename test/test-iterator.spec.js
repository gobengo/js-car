/* eslint-env mocha */

import { CarBlockIterator, CarCIDIterator } from '../src/iterator.js'
import { carBytes, makeIterable, assert } from './common.js'
import { verifyRoots, verifyBlocks, verifyCids } from './verify-store-reader.js'
import { expect } from 'aegir/chai'

/**
 * @param {CarBlockIterator} iter
 * @returns {Promise<CarBlockIterator>}
 */
async function verifyBlockIterator (iter) {
  await verifyRoots(iter)
  await verifyBlocks(iter)
  assert.strictEqual(iter.version, 1)
  return iter
}

/**
 * @param {CarCIDIterator} iter
 * @returns {Promise<CarCIDIterator>}
 */
async function verifyCIDIterator (iter) {
  await verifyRoots(iter)
  await verifyCids(iter)
  assert.strictEqual(iter.version, 1)
  return iter
}

for (const type of ['Block', 'CID']) {
  describe(`Car${type}Iterator`, () => {
    it('fromBytes()', async () => {
      if (type === 'Block') {
        await verifyBlockIterator(await CarBlockIterator.fromBytes(carBytes))
      } else {
        await verifyCIDIterator(await CarCIDIterator.fromBytes(carBytes))
      }
    })

    it('fromBytes() bad double read', async () => {
      if (type === 'Block') {
        const iter = await verifyBlockIterator(await CarBlockIterator.fromBytes(carBytes))
        await assert.isRejected(verifyBlocks(iter), /more than once/i)
      } else {
        const iter = await verifyCIDIterator(await CarCIDIterator.fromBytes(carBytes))
        await assert.isRejected(verifyCids(iter), /more than once/i)
      }
    })

    it('fromBytes() bad argument', async () => {
      for (const arg of [true, false, null, undefined, 'string', 100, { obj: 'nope' }]) {
        // @ts-expect-error arg is wrong type
        // the assert.isRejected form of this causes an uncatchable error in Chrome
        await expect((type === 'Block' ? CarBlockIterator : CarCIDIterator).fromBytes(arg)).to.eventually.be.rejected()
      }
    })

    it('fromIterable() bad argument', async () => {
      for (const arg of [new Uint8Array(0), true, false, null, undefined, 'string', 100, { obj: 'nope' }]) {
        // @ts-expect-error arg is wrong type
        // the assert.isRejected form of this causes an uncatchable error in Chrome
        await expect((type === 'Block' ? CarBlockIterator : CarCIDIterator).fromIterable(arg)).to.eventually.be.rejected()
      }
    })

    for (const chunkSize of [carBytes.length, 100, 64, 32]) {
      const chunkDesc = chunkSize === carBytes.length ? 'single chunk' : `${chunkSize}  bytes`
      it(`fromIterable() blocks (${chunkDesc})`, async () => {
        if (type === 'Block') {
          await verifyBlockIterator(await CarBlockIterator.fromIterable(makeIterable(carBytes, chunkSize)))
        } else {
          await verifyCIDIterator(await CarCIDIterator.fromIterable(makeIterable(carBytes, chunkSize)))
        }
      })
    }
  })
}
