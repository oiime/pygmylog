module.exports = class Encoder {
  static instance () {
    return new this()
  }
  encodeRow (rowBuf) {
    const bufLength = rowBuf.length
    if (bufLength < (1 << 5)) {
      const buf = Buffer.allocUnsafe(1 + bufLength)
      buf.writeUInt8(bufLength, 0)
      rowBuf.copy(buf, 1)
      return [1 + bufLength, buf]
    }
    if (bufLength < (1 << 13)) {
      const buf = Buffer.allocUnsafe(2 + bufLength)
      buf.writeUInt16BE((1 << 13) + bufLength, 0)
      rowBuf.copy(buf, 2)
      return [2 + bufLength, buf]
    }
    if (bufLength < (1 << 29)) {
      const buf = Buffer.allocUnsafe(4 + bufLength)
      buf.writeUInt32BE((2 << 29) + bufLength, 0)
      rowBuf.copy(buf, 4)
      return [4 + bufLength, buf]
    }
    throw new Error('value too big for simple encoding of length: ' + bufLength)
  }
  processChunk (chunk, onRow, done) {
    const chunkLength = chunk.length
    let processedOffset = 0
    let currentOffset = 0
    while (processedOffset < chunkLength) {
      const [rowLength, nextOffset] = this._sliceLength(chunk, chunkLength, currentOffset)
      if (nextOffset >= chunkLength) return done(null, processedOffset)
      currentOffset = nextOffset
      if (currentOffset + rowLength > chunkLength) return done(null, processedOffset)
      onRow(chunk.slice(currentOffset, currentOffset + rowLength))
      currentOffset += rowLength
      processedOffset = currentOffset
    }
    done(null, processedOffset)
  }
  _sliceLength (chunk, chunkLength, offset = 0) {
    // console.log('chunk', chunk[0], chunk[0] >> 5)
    if (offset + 1 > chunkLength) return [null, offset + 1]
    switch (chunk[offset] >> 5) {
      case 0:
        return [chunk[offset], offset + 1]
      case 1:
        if (offset + 2 > chunkLength) return [null, offset + 2]
        return [chunk.readUInt16BE(offset) - (1 << 13), offset + 2]
      case 2:
        if (offset + 4 > chunkLength) return [null, offset + 4]
        return [chunk.readUInt32BE(offset) - (2 << 29), offset + 4]
      default:
        throw new Error('corrupt length in: ' + chunk[offset])
    }
  }
}
