/* eslint-env mocha */

import { CarReader } from '../src/reader.js'
import { CarWriter } from '../src/writer.js'
import { bytesReader, readHeader } from '../src/decoder.js'
import * as Block from 'multiformats/block'
import { sha256 } from 'multiformats/hashes/sha2'
import * as raw from 'multiformats/codecs/raw'
import { base64 } from 'multiformats/bases/base64'
import * as dagPb from '@ipld/dag-pb'
import {
  carBytes,
  makeIterable,
  assert,
  goCarV2Bytes,
  goCarV2Roots,
  goCarV2Index,
  goCarV2Contents
} from './common.js'
import {
  verifyRoots,
  verifyHas,
  verifyGet,
  verifyBlocks,
  verifyCids
} from './verify-store-reader.js'
import { data as fixtures } from './fixtures.js'
import { expectations as fixtureExpectations } from './fixtures-expectations.js'
import { expect } from 'aegir/chai'

describe('CarReader fromBytes()', () => {
  it('complete', async () => {
    const reader = await CarReader.fromBytes(carBytes)
    await verifyRoots(reader)
    await verifyHas(reader)
    await verifyGet(reader)
    await verifyBlocks(reader.blocks())
    await verifyCids(reader.cids())
    assert.strictEqual(reader.version, 1)
  })

  it('complete (get before has) switch', async () => {
    const reader = await CarReader.fromBytes(carBytes)
    await verifyRoots(reader)
    await verifyGet(reader)
    await verifyHas(reader)
    await verifyBlocks(reader.blocks())
    await verifyCids(reader.cids())
  })

  it('bad argument', async () => {
    for (const arg of [true, false, null, undefined, 'string', 100, { obj: 'nope' }]) {
      // @ts-expect-error arg is wrong type
      // the assert.isRejected form of this causes an uncatchable error in Chrome
      await expect(CarReader.fromBytes(arg)).to.eventually.be.rejected()
    }
  })

  it('decode error - truncated', async () => {
    await assert.isRejected(CarReader.fromBytes(carBytes.slice(0, carBytes.length - 10)), {
      name: 'Error',
      message: 'Unexpected end of data'
    })
  })

  it('v2 complete', async () => {
    const reader = await CarReader.fromBytes(goCarV2Bytes)
    const roots = await reader.getRoots()
    assert.strictEqual(roots.length, 1)
    assert.ok(goCarV2Roots[0].equals(roots[0]))
    assert.strictEqual(reader.version, 2)
    for (const { cid } of goCarV2Index) {
      const block = await reader.get(cid)
      assert.isDefined(block)
      if (block) {
        assert.ok(cid.equals(block.cid))
        let content
        if (cid.code === dagPb.code) {
          content = dagPb.decode(block.bytes)
        } else if (cid.code === 85) { // raw
          content = new TextDecoder().decode(block.bytes)
        } else {
          assert.fail('Unexpected codec')
        }
        assert.deepStrictEqual(content, goCarV2Contents[cid.toString()])
      }
    }
  })

  it('decode error - trailing null bytes', async () => {
    const bytes = new Uint8Array(carBytes.length + 5)
    bytes.set(carBytes)
    try {
      await CarReader.fromBytes(bytes)
    } catch (/** @type {any} */ err) {
      assert.strictEqual(err.message, 'Invalid CAR section (zero length)')
      return
    }
    assert.fail('Did not throw')
  })

  it('decode error - bad first byte', async () => {
    const bytes = new Uint8Array(carBytes.length + 5)
    bytes.set(carBytes)
    bytes[0] = 0
    try {
      await CarReader.fromBytes(bytes)
    } catch (/** @type {any} */ err) {
      assert.strictEqual(err.message, 'Invalid CAR header (zero length)')
      return
    }
    assert.fail('Did not throw')
  })
})

describe('CarReader fromIterable()', () => {
  it('complete (single chunk)', async () => {
    const reader = await CarReader.fromIterable(makeIterable(carBytes, carBytes.length))
    await verifyRoots(reader)
    await verifyHas(reader)
    await verifyGet(reader)
    await verifyBlocks(reader.blocks())
    await verifyCids(reader.cids())
  })

  it('complete (101-byte chunks)', async () => {
    const reader = await CarReader.fromIterable(makeIterable(carBytes, 101))
    await verifyRoots(reader)
    await verifyHas(reader)
    await verifyGet(reader)
    await verifyBlocks(reader.blocks())
    await verifyCids(reader.cids())
  })

  it('complete (64-byte chunks)', async () => {
    const reader = await CarReader.fromIterable(makeIterable(carBytes, 64))
    await verifyRoots(reader)
    await verifyHas(reader)
    await verifyGet(reader)
    await verifyBlocks(reader.blocks())
    await verifyCids(reader.cids())
  })

  it('complete (32-byte chunks)', async () => {
    const reader = await CarReader.fromIterable(makeIterable(carBytes, 32))
    await verifyRoots(reader)
    await verifyHas(reader)
    await verifyGet(reader)
    await verifyBlocks(reader.blocks())
    await verifyCids(reader.cids())
  })

  it('handle zero-byte chunks', async () => {
    // write 3 blocks, the middle one has zero bytes - this is a valid dag-pb form
    // so it's important that we can handle it .. also we may just be dealing with
    // an asynciterator that provides zero-length chunks
    const { writer, out } = await CarWriter.create([])
    const b1 = await Block.encode({ value: Uint8Array.from([0, 1, 2]), hasher: sha256, codec: raw })
    writer.put(b1)
    const b2 = await Block.encode({ value: Uint8Array.from([]), hasher: sha256, codec: raw })
    writer.put(b2)
    const b3 = await Block.encode({ value: Uint8Array.from([3, 4, 5]), hasher: sha256, codec: raw })
    writer.put(b3)
    const closePromise = writer.close()
    const reader = await CarReader.fromIterable(out) // read from the writer
    const b1a = await reader.get(b1.cid)
    assert.isDefined(b1a)
    assert.deepStrictEqual(b1a && Array.from(b1a.bytes), [0, 1, 2])
    const b2a = await reader.get(b2.cid)
    assert.isDefined(b2a)
    assert.deepStrictEqual(b2a && Array.from(b2a.bytes), [])
    const b3a = await reader.get(b3.cid)
    assert.isDefined(b3a)
    assert.deepStrictEqual(b3a && Array.from(b3a.bytes), [3, 4, 5])
    await closePromise
  })

  it('bad argument', async () => {
    for (const arg of [new Uint8Array(0), true, false, null, undefined, 'string', 100, { obj: 'nope' }]) {
      // @ts-expect-error arg is wrong type
      // the assert.isRejected form of this causes an uncatchable error in Chrome
      await expect(CarReader.fromIterable(arg)).to.eventually.be.rejected()
    }
  })

  it('decode error - truncated', async () => {
    await assert.isRejected(CarReader.fromIterable(makeIterable(carBytes.slice(0, carBytes.length - 10), 64)), {
      name: 'Error',
      message: 'Unexpected end of data'
    })
  })

  it('v2 decode error - truncated', async () => {
    const bytes = goCarV2Bytes.slice()
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    // dataSize is an 64-bit uint at byte offset 35 from the begining, we're shortening it
    // by 10 to simulate a premature end of CARv1 content
    dv.setBigUint64(35, BigInt(448 - 10), true)
    await assert.isRejected(CarReader.fromIterable(makeIterable(bytes, 64)), {
      name: 'Error',
      message: 'Unexpected end of data'
    })
  })
})

describe('Shared fixtures', () => {
  describe('Header', () => {
    for (const [name, { version: expectedVersion, err: expectedError }] of Object.entries(fixtureExpectations)) {
      it(name, async () => {
        const data = base64.baseDecode(fixtures[name])
        let header
        try {
          header = await readHeader(bytesReader(data))
        } catch (/** @type {any} */ err) {
          if (expectedError != null) {
            assert.equal(err.message, expectedError)
            return
          }
          assert.ifError(err)
        }
        if (expectedError != null) {
          assert.fail(`Expected error: ${expectedError}`)
        }
        assert.isDefined(header, 'did not decode header')
        if (expectedVersion != null && header != null) {
          assert.strictEqual(header.version, expectedVersion)
        }
      })
    }
  })

  describe('Contents', () => {
    for (const [name, { cids: expectedCids }] of Object.entries(fixtureExpectations)) {
      if (expectedCids == null) {
        continue
      }
      it(name, async () => {
        const data = base64.baseDecode(fixtures[name])
        const reader = await CarReader.fromBytes(data)
        let i = 0
        for await (const cid of reader.cids()) {
          assert.strictEqual(cid.toString(), expectedCids[i++])
        }
        assert.strictEqual(i, expectedCids.length)
      })
    }
  })
})
