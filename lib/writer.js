const { Transform } = require('stream')

module.exports = class PygmyLogWriter extends Transform {
  constructor (headers, options = {}) {
    super({ writableObjectMode: true })
    this.encoder = options.encoder.instance(this)
    this.length = 0
    this.headers = headers
  }
  _transform (obj, encoding, next) {
    if (!this._wroteHeaders) {
      if (this.encoder.serializeHeaders) {
        const [length, buf] = this.encoder.encodeRow(this.encoder.serializeHeaders(this.headers))
        this.push(buf)
        this.length += length
      }
      this._wroteHeaders = true
    }
    const [length, buf] = this.encoder.encodeRow(this.encoder.encode(obj))
    this.length += length
    next(null, buf)
  }
}
