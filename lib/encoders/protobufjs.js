const path = require('path')
const protobufjs = require('protobufjs')
const Encoder = require(path.join(__dirname, '..', 'encoder'))

const _primatives = ['double', 'float', 'int32', 'uint32', 'int64', 'uint64', 'bool', 'string']

const _types = {
  enum: {
    primative: 'int32',
    encodeAdapter: (name, attr) => {
      if (!attr | !attr.enum) throw new TypeError('enum type requries the `enum` property in its configuration')
      const inverse = {}
      attr.enum.forEach((value, idx) => {
        inverse[value] = idx
      })
      return function (obj) {
        if (!obj.hasOwnProperty(name)) return obj
        if (!inverse.hasOwnProperty(obj[name])) throw new TypeError(`tried to set undefined enum value: ${obj[name]}`)
        obj[name] = inverse[obj[name]]
        return obj
      }
    },
    decodeAdapter: (name, attr) => {
      return function (obj) {
        if (!obj.hasOwnProperty(name)) return obj
        obj[name] = attr.enum[obj[name]]
        return obj
      }
    }
  },
  enum_arr: {
    primative: 'int32',
    isArray: true,
    encodeAdapter: (name, attr) => {
      if (!attr | !attr.enum) throw new TypeError('enum type requries the `enum` property in its configuration')
      const inverse = {}
      attr.enum.forEach((value, idx) => {
        inverse[value] = idx
      })
      return function (obj) {
        if (!obj.hasOwnProperty(name)) return obj
        obj[name] = obj[name].map(key => {
          if (!inverse.hasOwnProperty(key)) throw new TypeError(`tried to set undefined enum value: ${key}`)
          return inverse[key]
        })
        return obj
      }
    },
    decodeAdapter: (name, attr) => {
      return function (obj) {
        if (!obj.hasOwnProperty(name)) return obj
        obj[name] = obj[name].map(idx => attr.enum[idx])
        return obj
      }
    }
  },
  object: {
    primative: 'string',
    encodeAdapter: name => {
      return function (obj) {
        if (!obj.hasOwnProperty(name)) return obj
        obj[name] = JSON.stringify(obj[name])
        return obj
      }
    },
    decodeAdapter: name => {
      return function (obj) {
        if (!obj.hasOwnProperty(name)) return obj
        obj[name] = JSON.parse(obj[name])
        return obj
      }
    }
  }
}

_primatives.forEach(name => {
  _types[name] = {
    primative: name
  }
  _types[`${name}_arr`] = {
    primative: name,
    isArray: true
  }
})

const HEADER_MESSAGE = {
  ENCODER_VERSION: 1,
  PROPERTY_NAMES: 2,
  PROPERTY_TYPES: 3,
  PROPERTY_IDS: 4,
  PROPERTY_ATTRS: 5,
  METADATA: 9
}

const CURRENT_ENCODER_VERSION = 1

const _HeaderMessage = protobufjs.Type.fromJSON('header', {
  fields: {
    version: { id: HEADER_MESSAGE.ENCODER_VERSION, type: 'uint32' },
    propertyNames: { id: HEADER_MESSAGE.PROPERTY_NAMES, type: 'string', rule: 'repeated' },
    propertyTypes: { id: HEADER_MESSAGE.PROPERTY_TYPES, type: 'string', rule: 'repeated' },
    propertyIds: { id: HEADER_MESSAGE.PROPERTY_IDS, type: 'uint32', rule: 'repeated' },
    propertyAttrs: { id: HEADER_MESSAGE.PROPERTY_ATTRS, type: 'string', rule: 'repeated' },
    metadata: { id: HEADER_MESSAGE.METADATA, type: 'string' }
  }
})

module.exports = class ProtobufJSEncoder extends Encoder {
  serializeHeaders (headers) {
    let id = 1
    const serializedSchema = {
      version: CURRENT_ENCODER_VERSION,
      propertyNames: [],
      propertyIds: [],
      propertyTypes: [],
      propertyAttrs: []
    }
    if (headers.metadata) serializedSchema.metadata = JSON.stringify(headers.metadata)
    const protobufSchema = {
      fields: {}
    }
    for (const name in headers.properties) {
      let type
      let attr
      if (typeof headers.properties[name] === 'object') {
        type = headers.properties[name].type
        attr = Object.keys(headers.properties[name]).reduce((attr, key) => {
          if (key === 'type') return attr
          attr[key] = headers.properties[name][key]
          return attr
        }, {})
      } else {
        type = headers.properties[name]
      }
      if (_types.hasOwnProperty(type)) {
        protobufSchema.fields[name] = { id, type: _types[type].primative }
        serializedSchema.propertyNames.push(name)
        serializedSchema.propertyIds.push(id)
        serializedSchema.propertyTypes.push(type)
        serializedSchema.propertyAttrs.push(attr ? JSON.stringify(attr) : '')

        if (_types[type].isArray) protobufSchema.fields[name].rule = 'repeated'
        if (_types[type].encodeAdapter) {
          if (!this._encodeAdapters) this._encodeAdapters = []
          this._encodeAdapters.push(_types[type].encodeAdapter(name, attr))
        }
      } else {
        throw new Error(`unknown field type: ${JSON.stringify(headers.properties[name])}`)
      }
      id++
    }
    this._RowMessage = protobufjs.Type.fromJSON('row', protobufSchema)
    const err = this._RowMessage.verify({})
    if (err) throw err
    return _HeaderMessage.encode(serializedSchema).finish()
  }
  unserializeHeaders (buf) {
    const protobufSchema = {
      fields: {}
    }
    const { propertyIds, propertyNames, propertyTypes, propertyAttrs, metadata } = _HeaderMessage.decode(buf)
    propertyIds.forEach((id, idx) => {
      const type = propertyTypes[idx]
      const name = propertyNames[idx]

      protobufSchema.fields[name] = { id, type: _types[type].primative }
      if (_types[type].isArray) protobufSchema.fields[name].rule = 'repeated'
      if (_types[type].decodeAdapter) {
        if (!this._decodeAdapters) this._decodeAdapters = []
        this._decodeAdapters.push(_types[type].decodeAdapter(name, propertyAttrs[idx].length > 0 && JSON.parse(propertyAttrs[idx])))
      }
    })
    this._RowMessage = protobufjs.Type.fromJSON('row', protobufSchema)
    this.metadata = metadata && JSON.parse(metadata)
    return { metadata: this.metadata }
  }
  encode (obj) {
    if (this._encodeAdapters) {
      obj = Object.assign({}, obj)
      obj = this._encodeAdapters.reduce((obj, adapt) => adapt(obj), obj)
    }
    return this._RowMessage.encode(obj).finish()
  }
  decode (buf) {
    let obj = this._RowMessage.decode(buf).toJSON()
    if (this._decodeAdapters) obj = this._decodeAdapters.reduce((obj, adapt) => adapt(obj), obj)
    return obj
  }
}
