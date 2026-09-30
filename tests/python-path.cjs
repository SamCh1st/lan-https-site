const path = require('node:path');
process.env.PYTHONPATH = [path.resolve(__dirname, '../backend'), process.env.PYTHONPATH]
  .filter(Boolean).join(path.delimiter);
