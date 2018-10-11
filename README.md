## about

`pygmylog` is a simple binary log encoder, its purpose is to simplify the creation of compact binary logs from within nodejs, it encodes rows into transformation streams that can be piped into files or any other writable stream such as Amazon S3.

`pygmylog` by itself has no dependencies, however, if you wish to use the default encoder you'd need to install `protobufjs`

As each log also stores its own metadata (schema) it is possible to smoothly change schemas and versions

## installation
```bash
npm install --save pygmylog
```

## types for default encoder schema
* object
* enum - (enum values passed via the enum: property)
* double
* float
* int32
* uint32
* int64
* uint64
* bool
* string
* object_arr
* enum_arr
* double_arr
* float_arr
* int32_arr
* uint32_arr
* int64_arr
* uint64_arr
* bool_arr
* string_arr

## by example

#### pointless read/write to local filesystem example
```javascript
const fs = require('fs')
const { PassThrough } = require('stream')
const pygmylog = require('pygmylog')

const tmpFilename = '/tmp/pygmylog.test'
const schema = {
  properties: {
    foo: 'int32',
    bar: 'int32_arr',
    myenum: { type: 'enum', enum: ['foo', 'bar', 'foobar'] }
  }
}
const writer = pygmylog.createWriteStream(schema)
const fd = fs.createWriteStream(tmpFilename)

writer.pipe(fd)

fd.on('close', () => {
  const reader = pygmylog.createReadStream()
  const pass = new PassThrough({ objectMode: true })
  pass.on('data', row => {
    console.log(row)
  })
  pass.on('end', () => {
    fs.unlinkSync(tmpFilename)
  })
  fs.createReadStream(tmpFilename).pipe(reader).pipe(pass)
})

writer.write({
  foo: 5,
  bar: [1, 2, 3],
  myenum: 'foo'
})

writer.end()
```

#### storing metadata within the headers
```javascript
const { PassThrough } = require('stream')
const pygmylog = require('pygmylog')

const schema = {
  metadata: { foo: 'bar' },
  properties: {
    foo: 'int32'
  }
}
const writer = pygmylog.createWriteStream(schema)
const reader = pygmylog.createReadStream()

reader.on('ready', data => {
  console.log(data) // { metdata: { foo: 'bar' } }
  const pass = new PassThrough({ objectMode: true })
  pass.on('data', row => {
    console.log(row)
  })
  reader.pipe(pass)
})

writer.pipe(reader)
writer.write({ foo: 5 })
writer.end()
```

#### Using your own encoder
```javascript
const fs = require('fs')
const { PassThrough } = require('stream')
const pygmylog = require('pygmylog')

class UselessEncoder extends pygmylog.Encoder {
  // optionally, you will recieve here the first arguments you've passed to createWriteStream, if this method does not exist the log would not start with a header
  serializeHeaders (headers) {
    return Buffer.from('headersGoHere')
  }
  // optionally, you will recieve here the headers you've serialized in the writer before the first row is processed
  unserializeHeaders (buf) {
    this._myHeadersData = buf.toString('utf8')
  }
  encode (str) {
    // this.headers
    return Buffer.from(str, 'utf8')
  }
  decode (buf) {
    return buf.toString('utf8')
  }
}
const writer = pygmylog.createWriteStream(null, { encoder: UselessEncoder })
const reader = pygmylog.createReadStream({ encoder: UselessEncoder })

const pass = new PassThrough({ objectMode: true })
pass.on('data', entry => {
  console.log(entry) // hellokitty
})

writer.pipe(reader).pipe(pass)
writer.write('hellokitty')
writer.end()
```


## API

#### pygmylog.createWriteStream(headers, options)

returns a `PygmyLogWriter` instance

#### pygmylog.createReadStream(options)

returns a `PygmyLogReader` instance

#### pygmylog.Encoder

Encoder class to be extended by custom implementations

#### PygmyLogWriter.constructor(headers, options = {})

* `options.encoder` - class for encoder

#### pygmyLogWriter.length

returns the total length written so far into the writer in bytes

#### pygmyLogWriter.write(payload)

pass a row to be encoded into the stream

#### pygmyLogWriter.end()

ends the writer signaling down the pipe

#### PygmyLogReader.constructor(options = {})

* `options.encoder` - class for encoder

License: MIT
