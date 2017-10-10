const mongoose = require('mongoose');
mongoose.Promise = global.Promise;
const Schema = mongoose.Schema;
const bcrypt = require('bcrypt-nodejs');
const groupSchema = new Schema({
  name: { type: String, required: true, unique: true, lowercase: false},
  members: { type: [{ id: String, username: String, isPending: Boolean }], required: true, unique: false, lowercase: false}
})


module.exports = mongoose.model('Group', groupSchema);
