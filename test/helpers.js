const crypto = require('crypto')
const { PassThrough } = require('stream')
const _protobufPrimatives = ['double', 'float', 'int32', 'uint32', 'int64', 'uint64', 'bool', 'string']
const { assert } = require('chai')

const protobufRandom = {
  enum: (attr) => {
    return attr.enum[Math.floor(Math.random() * attr.enum.length)]
  },
  object: () => {
    const types = _protobufPrimatives
    const obj = {}
    const len = Math.round(Math.random() * 10)
    for (let i = 0; i < len; i++) {
      const type = types[types.length - 1]
      if (type === 'object') continue // no nesting for now
      obj[`prop${i}`] = protobufRandom[type]()
    }
    return obj
  },
  double: () => parseFloat(Math.random().toPrecision(16)),
  float: () => parseFloat(Math.random().toPrecision(8)),
  int32: () => Math.round(Math.random() * 2147483647),
  uint32: () => Math.round(Math.random() * 4294967295),
  int64: () => Math.round(Math.random() * 9223372036854775807),
  uint64: () => Math.round(Math.random() * 18446744073709551615),
  bool: () => Math.random() > 0.5 && true,
  string: () => crypto.randomFillSync(Buffer.alloc(Math.round(Math.random() * 100))).toString('base64').toString()
}

const protobufAssert = {
  object: (actual, expected) => {
    assert.deepEqual(actual, JSON.parse(JSON.stringify(expected)))
  },
  enum: (actual, expected, attr) => {
    assert.equal(actual, expected)
  },
  double: (actual, expected) => assert.equal(actual.toPrecision(4), expected.toPrecision(4)),
  float: (actual, expected) => assert.equal(actual.toPrecision(4), expected.toPrecision(4)),
  int32: (actual, expected) => assert.equal(actual, expected),
  uint32: (actual, expected) => assert.equal(actual, expected),
  int64: (actual, expected) => assert.equal(actual, expected),
  uint64: (actual, expected) => assert.equal(actual, expected),
  bool: (actual, expected) => assert.equal(actual, expected),
  string: (actual, expected) => assert.equal(actual, expected)
}

_protobufPrimatives.concat(['enum']).forEach(type => {
  protobufRandom[`${type}_arr`] = (attr) => {
    const arr = []
    const len = Math.round(Math.random() * 19) + 1
    for (let i = 0; i < len; i++) {
      arr.push(protobufRandom[type](attr))
    }
    return arr
  }
  protobufAssert[`${type}_arr`] = (actual, expected) => {
    expected.forEach((value, idx) => {
      protobufAssert[type](actual[idx], expected[idx])
    })
  }
})

function generateRows ({ schema, count }) {
  const rows = []
  for (let i = 0; i <= count; i++) {
    const entry = {}
    for (const name in schema.properties) {
      const { type } = schema.properties[name]
      entry[name] = protobufRandom[type](schema.properties[name])
    }
    rows.push(entry)
  }
  return rows
}

function comparisonIterator (rows, schema, done) {
  const pass = new PassThrough({ objectMode: true })
  // should always be ordered
  let idx = 0
  pass.on('data', (row) => {
    for (const name in schema.properties) {
      const { type } = schema.properties[name]
      protobufAssert[type](row[name], rows[idx][name], schema.properties[name])
    }
    idx++
  })
  pass.on('end', () => {
    done()
  })
  return pass
}

function writeRows (writer, rows) {
  let len = rows.length
  let i = 0
  write()
  function write () {
    let ok = true
    do {
      i++
      if (i === len) {
        writer.write(rows[i - 1])
        writer.end()
      } else {
        ok = writer.write(rows[i - 1])
      }
    } while (i < len && ok)
    if (i < len) {
      // drain
      writer.once('drain', write)
    }
  }
}

module.exports = {
  generateRows,
  comparisonIterator,
  writeRows
}
