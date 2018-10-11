/* eslint-env node, mocha */
const { generateRows, comparisonIterator, writeRows } = require('./helpers')
const { PassThrough } = require('stream')
const fs = require('fs')
const zlib = require('zlib')
const { assert } = require('chai')
const pygmylog = require('../index')

const _protobufPrimatives = ['double', 'float', 'int32', 'uint32', 'bool', 'string', 'enum']
const _protobufAllTypes = _protobufPrimatives.concat(_protobufPrimatives.map(name => `${name}_arr`)).concat(['object'])

describe('#pygmylog integrity', function () {
  const schema = _protobufAllTypes.reduce((schema, type) => {
    schema.properties[type] = { type }
    if (type === 'enum' || type === 'enum_arr') {
      schema.properties[type].enum = ['foo', 'bar', 'foobar']
    }
    return schema
  }, { properties: {} })
  const rows = generateRows({ count: 25, schema })
  it('should pass passthrough comparison', function (done) {
    const cIter = comparisonIterator(rows, schema, done)
    const writer = pygmylog.createWriteStream(schema)
    const reader = pygmylog.createReadStream()

    writer.pipe(reader).pipe(cIter)
    writeRows(writer, rows)
  })

  it('should use on(ready) correctly', function (done) {
    const cIter = comparisonIterator(rows, schema, done)
    const writer = pygmylog.createWriteStream(Object.assign({ metadata: { foo: 'bar' } }, schema))
    const reader = pygmylog.createReadStream()

    writer.pipe(reader)

    reader.on('ready', data => {
      assert.deepEqual(data, { metadata: { foo: 'bar' } })
      reader.pipe(cIter)
    })
    writeRows(writer, rows)
  })

  it('should pass pass through medium', function (done) {
    const cIter = comparisonIterator(rows, schema, done)
    const writer = pygmylog.createWriteStream(schema)
    const reader = pygmylog.createReadStream()

    const gzip = zlib.createGzip()
    const gunzip = zlib.createGunzip()

    writer.pipe(gzip).pipe(gunzip).pipe(reader).pipe(cIter)
    writeRows(writer, rows)
  })

  it('should pass through medium (2)', function (done) {
    const tmpFilename = '/tmp/pygmylog.test'
    const writer = pygmylog.createWriteStream(schema)

    const fd = fs.createWriteStream(tmpFilename)
    writer.pipe(fd)
    fd.on('close', () => {
      const reader = pygmylog.createReadStream()
      const cIter = comparisonIterator(rows, schema, (err) => {
        if (err) return done(err)
        fs.unlinkSync(tmpFilename)
        done()
      })
      const fd = fs.createReadStream(tmpFilename)
      reader.pipe(cIter)
      fd.pipe(reader)
    })
    writeRows(writer, rows)
  })

  it('should deal with tiny chunks', function (done) {
    const cIter = comparisonIterator(rows, schema, done)
    const writer = pygmylog.createWriteStream(schema)
    const reader = pygmylog.createReadStream()

    reader.pipe(cIter)
    const pass = new PassThrough()
    const chunks = []
    pass.on('data', chunk => {
      chunks.push(chunk)
    })
    pass.on('end', () => {
      const buf = Buffer.concat(chunks)
      const len = buf.length
      let offset = 0
      while (offset < len) {
        reader.write(buf.slice(offset, offset + 10))
        offset += 10
      }
      reader.end()
    })

    writer.pipe(pass)
    writeRows(writer, rows)
  })
})
describe('#pygmylog benchmarks', function () {
  const schema = {
    properties: {
      foo: { type: 'uint32' }
    }
  }
  const rows = []
  for (let i = 0; i <= 500000; i++) {
    rows.push({ foo: i })
  }
  it('should pass basic sanity performance', function (done) {
    this.timeout(15000)
    const ts = Date.now()
    const writer = pygmylog.createWriteStream(schema)
    const pass = new PassThrough()
    pass.on('data', () => {})
    writer.on('finish', () => {
      assert.equal(writer.length, 2483516)
      assert.isAtMost(Date.now() - ts, 3000)
      done()
    })
    writer.pipe(pass)
    writeRows(writer, rows)
  })
  it('should pass basic read/write through medium sanity performance', function (done) {
    const slimrows = rows.slice(0, 100000)
    this.timeout(15000)
    const writer = pygmylog.createWriteStream(schema)
    const reader = pygmylog.createReadStream()

    const gzip = zlib.createGzip()
    const gunzip = zlib.createGunzip()
    const ts = Date.now()
    const cIter = comparisonIterator(slimrows, schema, (err) => {
      if (err) return done(err)
      assert.equal(writer.length, 483511)
      assert.isAtMost(Date.now() - ts, 8000)
      done()
    })
    writer.pipe(gzip).pipe(gunzip).pipe(reader).pipe(cIter)
    writeRows(writer, slimrows)
  })
})

describe('#pygmylog 3rd-party encoder', function () {
  const rows = []
  for (let i = 0; i <= 5000; i++) {
    rows.push({ foo: i })
  }
  it('should allow 3rd-party encoders', function (done) {
    const pass = new PassThrough({ objectMode: true })
    pass.on('data', entry => {
      assert.equal(entry, 'hellokitty')
    })
    pass.on('end', () => {
      done()
    })
    class UselessEncoder extends pygmylog.Encoder {
      encode (obj) {
        return Buffer.from('hellokitty', 'utf8')
      }
      decode (buf) {
        return buf.toString('utf8')
      }
    }
    const writer = pygmylog.createWriteStream(null, { encoder: UselessEncoder })
    const reader = pygmylog.createReadStream({ encoder: UselessEncoder })

    writer.pipe(reader).pipe(pass)
    writeRows(writer, rows)
  })
})
