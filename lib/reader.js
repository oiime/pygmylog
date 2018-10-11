const { Transform } = require('stream')

module.exports = class PygmyLogReader extends Transform {
  constructor (options = {}) {
    super({ readableObjectMode: true })
    this.encoder = options.encoder.instance(this)
  }
  _transform (chunk, encoding, next) {
    if (this._tail) {
      chunk = Buffer.concat([this._tail, chunk])
      this._tail = undefined
    }
    this.encoder.processChunk(chunk, (rowBuf) => {
      if (!this._parsedHeaders) {
        this._parsedHeaders = true // we dont do headers
        if (this.encoder.unserializeHeaders) {
          const parsedHeaders = this.encoder.unserializeHeaders(rowBuf)
          this.emit('ready', parsedHeaders)
          return
        }
        this.emit('ready') // without emitting headers
      }
      this.push(this.encoder.decode(rowBuf))
    }, (err, offset) => {
      if (err) return next(err)
      if (offset === chunk.length) return next()
      if (offset < chunk.length) {
        this._tail = chunk.slice(offset)
        return next()
      }
      return next(new Error(`impossible: ${offset} / ${chunk.length}`))
    })
  }
}
