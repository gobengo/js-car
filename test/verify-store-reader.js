import { bytes } from 'multiformats'
import * as raw from 'multiformats/codecs/raw'
import { toBlock, assert, makeData } from './common.js'

/**
 * @typedef {import('multiformats').CID} CID
 * @typedef {import('../src/api').Block} Block
 * @typedef {import('../src/api').RootsReader} RootsReader
 * @typedef {import('../src/api').BlockIterator} BlockIterator
 * @typedef {import('../src/api').CIDIterator} CIDIterator
 * @typedef {import('../src/api').BlockReader} BlockReader
 */

/**
 * @param {Block} actual
 * @param {Block} expected
 * @param {string | void} id
 */
function compareBlockData (actual, expected, id) {
  assert.strictEqual(
    bytes.toHex(actual.bytes),
    bytes.toHex(expected.bytes),
    `comparing block as hex ${id || ''}`
  )
}

/**
 * @param {CID} actual
 * @param {CID} expected
 */
function compareCids (actual, expected) {
  assert.strictEqual(actual.toString(), expected.toString())
}

/**
 * @param {RootsReader | import('../src/api').RootsBufferReader} reader
 */
async function verifyRoots (reader) {
  // using toString() for now, backing buffers in Uint8Arrays are getting in the way
  // in the browser
  const { cborBlocks } = await makeData()

  const expected = [cborBlocks[0].cid.toString(), cborBlocks[1].cid.toString()]
  assert.deepStrictEqual((await reader.getRoots()).map((c) => c.toString()), expected)
}

/**
 * @param {BlockReader | import('../src/api').BlockBufferReader} reader
 */
async function verifyHas (reader) {
  const { allBlocks } = await makeData()

  /**
   * @param {CID} cid
   * @param {string} name
   */
  const verifyHas = async (cid, name) => {
    assert.ok(await reader.has(cid), `reader doesn't have expected key for ${name}`)
  }

  /**
   * @param {CID} cid
   * @param {string} name
   */
  const verifyHasnt = async (cid, name) => {
    assert.ok(!(await reader.has(cid)), `reader has unexpected key for ${name}`)
    assert.strictEqual(await reader.get(cid), undefined)
  }

  for (const [type, blocks] of allBlocks) {
    for (let i = 0; i < blocks.length; i++) {
      await verifyHas(blocks[i].cid, `block #${i} (${type} / ${blocks[i].cid})`)
    }
  }

  // not a block we have
  await verifyHasnt((await toBlock(new TextEncoder().encode('dddd'), raw)).cid, 'dddd')
}

/**
 * @param {BlockReader | import('../src/api').BlockBufferReader} reader
 */
async function verifyGet (reader) {
  const { allBlocks } = await makeData()

  /**
   * @param {Block} expected
   * @param {number} index
   * @param {string} type
   */
  const verifyBlock = async (expected, index, type) => {
    let actual
    try {
      actual = await reader.get(expected.cid)
      assert.isDefined(actual)
      if (actual) {
        compareBlockData(actual, expected, `#${index} (${type})`)
      }
    } catch (err) {
      assert.ifError(err, `get block length #${index} (${type})`)
    }
  }

  for (const [type, blocks] of allBlocks) {
    for (let i = 0; i < blocks.length; i++) {
      await verifyBlock(blocks[i], i, type)
    }
  }
}

/**
 * @param {import('../src/api').AwaitIterable<Block>} iterator
 * @param {boolean | void} unordered
 */
async function verifyBlocks (iterator, unordered) {
  const { allBlocksFlattened } = await makeData()
  if (!unordered) {
    const expected = allBlocksFlattened.slice()
    for await (const actual of iterator) {
      const next = expected.shift()
      assert.isDefined(next)
      if (next) {
        compareBlockData(actual, next)
      }
    }
  } else {
    /** @type {{[prop: string]: Block}} */
    const expected = {}
    for (const block of allBlocksFlattened) {
      expected[block.cid.toString()] = block
    }

    for await (const actual of iterator) {
      const { cid } = actual
      const exp = expected[cid.toString()]
      if (!exp) {
        throw new Error(`Unexpected block: ${cid.toString()}`)
      }
      compareBlockData(actual, exp)
      delete expected[cid.toString()]
    }

    if (Object.keys(expected).length) {
      throw new Error('Did not find all expected blocks')
    }
  }
}

/**
 * @param {import('../src/api').AwaitIterable<CID>} iterator
 * @param {boolean | void} unordered
 */
async function verifyCids (iterator, unordered) {
  const { allBlocksFlattened } = await makeData()
  if (!unordered) {
    const expected = allBlocksFlattened.slice()
    for await (const actual of iterator) {
      const next = expected.shift()
      assert.isDefined(next)
      if (next) {
        compareCids(actual, next.cid)
      }
    }
  } else {
    /** @type {{[prop: string]: Block}} */
    const expected = {}
    for (const block of allBlocksFlattened) {
      expected[block.cid.toString()] = block
    }

    for await (const cid of iterator) {
      const exp = expected[cid.toString()]
      if (!exp) {
        throw new Error(`Unexpected cid: ${cid.toString()}`)
      }
      delete expected[cid.toString()]
    }

    if (Object.keys(expected).length) {
      throw new Error('Did not find all expected cids')
    }
  }
}

export {
  verifyRoots,
  verifyHas,
  verifyGet,
  verifyBlocks,
  verifyCids
}
