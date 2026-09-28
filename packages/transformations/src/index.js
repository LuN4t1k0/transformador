const rut = require('./rut');
const text = require('./text');
const number = require('./number');
const date = require('./date');

module.exports = {
  ...rut,
  ...text,
  ...number,
  ...date
};
