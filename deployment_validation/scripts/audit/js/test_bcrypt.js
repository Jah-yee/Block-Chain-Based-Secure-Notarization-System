const bcrypt = require('bcrypt');

async function test() {
    try {
        console.log("Starting bcrypt test...");
        const hash = await bcrypt.hash("testpassword", 10);
        console.log("Hash generated:", hash);
        const match = await bcrypt.compare("testpassword", hash);
        console.log("Password match:", match);
        process.exit(0);
    } catch (err) {
        console.error("Bcrypt failure:", err);
        process.exit(1);
    }
}

test();
