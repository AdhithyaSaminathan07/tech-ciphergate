const Message = require("../models/Message");
const InstagramAccount = require("../models/InstagramAccount");

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

// Retrieve active Instagram account for current subdomain (Accessible by Admin and Employee)
exports.getActiveAccount = async (req, res) => {
  try {
    const subdomain = req.user.subdomain;
    const activeAccount = await InstagramAccount.findOne({ subdomain, isActive: true }).select('username');
    res.json(activeAccount || null);
  } catch (err) {
    console.error('Error in getActiveAccount:', err);
    res.status(500).json({ error: err.message });
  }
};

// Retrieve all Instagram accounts for current subdomain (Admin only)
exports.getAccounts = async (req, res) => {
  try {
    const subdomain = req.user.subdomain;
    const accounts = await InstagramAccount.find({ subdomain }).sort({ createdAt: -1 });
    res.json(accounts);
  } catch (err) {
    console.error('Error in getAccounts:', err);
    res.status(500).json({ error: err.message });
  }
};

// Connect a new Instagram account (Admin only)
exports.connectAccount = async (req, res) => {
  try {
    const { username, password } = req.body;
    const subdomain = req.user.subdomain;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    // Check if account already exists for this subdomain
    const existing = await InstagramAccount.findOne({ subdomain, username });
    if (existing) {
      return res.status(400).json({ error: 'This Instagram account is already connected' });
    }

    // Check if there are any other accounts for this subdomain. If not, make this one active.
    const count = await InstagramAccount.countDocuments({ subdomain });
    const isActive = count === 0;

    const account = await InstagramAccount.create({
      subdomain,
      username,
      password,
      isActive
    });

    res.status(201).json(account);
  } catch (err) {
    console.error('Error in connectAccount:', err);
    res.status(500).json({ error: err.message });
  }
};

// Switch/Activate an Instagram account (Admin only)
exports.activateAccount = async (req, res) => {
  try {
    const { id } = req.params;
    const subdomain = req.user.subdomain;

    // Find the account to activate
    const account = await InstagramAccount.findOne({ _id: id, subdomain });
    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }

    // Set all other accounts for this subdomain to inactive
    await InstagramAccount.updateMany({ subdomain }, { isActive: false });

    // Set this account to active
    account.isActive = true;
    await account.save();

    res.json({ success: true, message: `Account ${account.username} activated successfully` });
  } catch (err) {
    console.error('Error in activateAccount:', err);
    res.status(500).json({ error: err.message });
  }
};

// Disconnect/Delete an Instagram account (Admin only)
exports.deleteAccount = async (req, res) => {
  try {
    const { id } = req.params;
    const subdomain = req.user.subdomain;

    const account = await InstagramAccount.findOne({ _id: id, subdomain });
    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }

    const wasActive = account.isActive;
    await InstagramAccount.deleteOne({ _id: id });

    // If the deleted account was active, auto-activate another account if available
    if (wasActive) {
      const anotherAccount = await InstagramAccount.findOne({ subdomain });
      if (anotherAccount) {
        anotherAccount.isActive = true;
        await anotherAccount.save();
      }
    }

    res.json({ success: true, message: 'Account disconnected successfully' });
  } catch (err) {
    console.error('Error in deleteAccount:', err);
    res.status(500).json({ error: err.message });
  }
};


