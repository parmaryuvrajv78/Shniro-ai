import mongoose from "mongoose";

const chatSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: false,
  },
  title: {
    type: String,
  },
  messages: [{
    prompt: String,
    response: String,
    isImage: {
      type: Boolean,
      default: false,
    },
    imageUrl: String,
  }],
  // Legacy fields for backward compatibility
  prompt: String,
  response: String,
  isImage: Boolean,
  imageUrl: String,
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  }
});

const Chat = mongoose.model("Chat", chatSchema);
export default Chat;
