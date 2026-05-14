const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema({
  platform: String,
  team: String,
  senderId: String,
  message: String,
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Message", messageSchema);
