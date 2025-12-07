// E:\useful app\backend\config\db.js
import mongoose from "mongoose";

const connectDB = async () => {
  const uri = process.env.MONGO_URI;
  const dbName = process.env.DB_NAME || "milkdb";

  if (!uri) throw new Error("MONGO_URI is missing in .env");

  // optional but good for clarity
  mongoose.set("strictQuery", true);

  try {
    await mongoose.connect(uri, { dbName });
    const { host, name } = mongoose.connection;
    console.log(`MongoDB connected: ${name} @ ${host}`);
  } catch (err) {
    console.error("MongoDB connection error:", err.message);
    throw err; // let caller decide (we'll exit if it fails)
  }

  mongoose.connection.on("disconnected", () =>
    console.warn("MongoDB disconnected")
  );
  mongoose.connection.on("reconnected", () =>
    console.log("MongoDB reconnected")
  );

  process.on("SIGINT", async () => {
    await mongoose.connection.close();
    console.log("MongoDB connection closed");
    process.exit(0);
  });
};

export default connectDB;
