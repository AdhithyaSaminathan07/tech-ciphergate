const express = require("express");
const router = express.Router();

const {
  receiveMessage,
  getMessages
} = require("../controllers/instaxbotController");

router.post("/messages", receiveMessage);
router.get("/messages", getMessages);

module.exports = router;

