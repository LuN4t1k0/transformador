const text = require('./text');
const number = require('./number');
const date = require('./date');

module.exports = {
  ...text,
  ...number,
  ...date
};
