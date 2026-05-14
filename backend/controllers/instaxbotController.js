const Message = require("../models/Message");

exports.receiveMessage = async (req, res) => {
  try {
    console.log("Received in CipherGate:", req.body);

    const { platform, team, senderId, message } = req.body;

    await Message.create({
      platform,
      team,
      senderId,
      message
    });

    res.status(200).json({ success: true });
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: err.message });
  }
};

exports.getMessages = async (req, res) => {
  const messages = await Message.find().sort({ createdAt: -1 });
  res.json(messages);
};

