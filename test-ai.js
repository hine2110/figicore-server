// test-ai.js
require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

async function run() {
    const key = process.env.GEMINI_API_KEY;
    console.log("🔑 Key đang dùng:", key ? "..." + key.slice(-5) : "KHÔNG TÌM THẤY");

    const genAI = new GoogleGenerativeAI(key);
    const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });

    try {
        console.log("⏳ Đang gọi Google AI...");
        const result = await model.generateContent("Chào bạn, hãy nói 'Xin chào' bằng tiếng Việt.");
        console.log("✅ KẾT QUẢ THÀNH CÔNG:", result.response.text());
    } catch (error) {
        console.error("❌ LỖI RỒI:", error.message);
    }
}

run();