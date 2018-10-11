const path = require('path')
const Encoder = require(path.join(__dirname, 'lib', 'encoder'))
const PygmyLogReader = require(path.join(__dirname, 'lib', 'reader'))
const PygmyLogWriter = require(path.join(__dirname, 'lib', 'writer'))

let ProtobufJSEncoder

function _requireProtobufEncoder () {
  if (ProtobufJSEncoder) return ProtobufJSEncoder
  let resolves = false
  try {
    resolves = require.resolve('protobufjs')
  } catch (err) {
    throw new Error('default encoder protobufjs requires the `protobufjs` module available to work')
  }
  if (!resolves) throw new Error('default encoder protobufjs requires the `protobufjs` module available to work')
  ProtobufJSEncoder = require(path.join(__dirname, 'lib', 'encoders', 'protobufjs'))
  return ProtobufJSEncoder
}

module.exports = {
  Encoder,
  createReadStream: function (options = {}) {
    if (!options.encoder) options.encoder = _requireProtobufEncoder()
    return new PygmyLogReader(options)
  },
  createWriteStream: function (headers, options = {}) {
    if (!options.encoder) options.encoder = _requireProtobufEncoder()
    return new PygmyLogWriter(headers, options)
  }
}
