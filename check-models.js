// check-models.js
require('dotenv').config();

async function check() {
    const key = process.env.GEMINI_API_KEY;
    console.log("🔑 Đang kiểm tra Key:", key ? "..." + key.slice(-5) : "MISSING");

    // Gọi trực tiếp API của Google để lấy danh sách model
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`;

    try {
        const response = await fetch(url);
        const data = await response.json();

        if (data.error) {
            console.error("🔥 LỖI API (KEY HỎNG/CHƯA BẬT):");
            console.error(`   Code: ${data.error.code}`);
            console.error(`   Message: ${data.error.message}`);
        } else {
            console.log("✅ KẾT NỐI THÀNH CÔNG! Danh sách model khả dụng:");
            // Lọc ra các model Gemini
            const geminiModels = data.models.filter(m => m.name.includes('gemini'));
            geminiModels.forEach(m => console.log(`   - ${m.name.replace('models/', '')}`));

            if (geminiModels.length === 0) {
                console.log("⚠️  Không tìm thấy model Gemini nào (Dù Key đúng).");
            }
        }
    } catch (e) {
        console.error("❌ Lỗi kết nối mạng:", e.message);
    }
}

check();