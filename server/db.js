const mongoose = require("mongoose");

async function connectDB() {
const uri = process.env.MONGODB_URI;


if (!uri) {
    throw new Error("MONGODB_URI is missing from the .env file");
}

try {
    await mongoose.connect(uri, {
        serverSelectionTimeoutMS: 10000,
    });

    console.log("MongoDB connected successfully!");
    console.log(`Database: ${mongoose.connection.name}`);
} catch (error) {
    console.error("MongoDB connection failed:", error.message);
    throw error;
}


}

module.exports = connectDB;
