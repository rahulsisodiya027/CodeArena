const mongoose = require("mongoose");

const roomSchema = new mongoose.Schema(
{
roomId: {
type: String,
required: true,
unique: true,
trim: true,
maxlength: 50,
},


    code: {
        type: String,
        default: '#include <iostream>\nusing namespace std;\n\nint main() {\n    cout << "Hello, CodeArena!";\n    return 0;\n}',
        maxlength: 100000,
    },

    language: {
        type: String,
        enum: ["cpp", "javascript", "python"],
        default: "cpp",
    },
},
{
    timestamps: true,
}


);

module.exports = mongoose.model("Room", roomSchema);
